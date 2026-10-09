import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const ROUTE = 'chatgpt_metricool_connector';
const protectedStates = new Set(['READY','SENDING','UNKNOWN','SCHEDULED','PENDING','PUBLISHING','PUBLISHED','DRAFT']);
const normalize = x => String(x ?? '').normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
export function identity(p) {
  const fields=[p.entities?.map(x=>normalize(x)).sort(),p.event,p.eventDate,p.development];
  if(!fields[0]?.length || fields.slice(1).some(x=>typeof x!=='string'||!x.trim())) throw new Error('Identidade factual incompleta');
  return createHash('sha256').update(JSON.stringify(fields)).digest('hex');
}
export function assertReadback(expected,actual) {
  if(JSON.stringify(expected)!==JSON.stringify(actual)) throw new Error('Readback divergiu; não enviar');
}
export function claim(lock,owner,attemptId) {
  if(lock.state!=='IDLE' || !owner || !attemptId) throw new Error('Reserva ocupada ou identidade ausente');
  return {...lock,state:'ACTIVE',owner,attemptId};
}
export function assertHistory(h,now,publicationDate) {
  if(!h || h.complete!==true || !h.completionEvidence || h.includesPublished!==true || h.includesDrafts!==true ||
     h.includesPending!==true || h.hasMore!==false || !Array.isArray(h.rows)) throw new Error('Histórico completo não comprovado');
  if(!Number.isFinite(Date.parse(h.from)) || !Number.isFinite(Date.parse(h.to)) ||
     Date.parse(h.from)>now-14*86400000 || Date.parse(h.to)<now+7*86400000 ||
     Date.parse(h.to)<Date.parse(publicationDate)) throw new Error('Janela de histórico insuficiente');
  if(h.rows.some(row=>!validId(row.id))) throw new Error('Histórico com ID inválido');
}
function validId(id) { return (typeof id==='number' && Number.isSafeInteger(id) && id>0) || (typeof id==='string' && /^[1-9]\d*$/.test(id)); }
function assertNovel(p,registry,rows,ownAttempt) {
  const ids=new Set([identity(p),...p.equivalentPautaIds]);
  for(const row of registry.posts) {
    if(ownAttempt && row.attempt_id===ownAttempt) continue;
    const state=row.state ?? row.providers?.find(x=>x.network==='instagram')?.status;
    const same=ids.has(row.pauta_id)||row.factFingerprint===p.factFingerprint||
      (normalize(p.caption)&&normalize(row.text)===normalize(p.caption))||
      (row.alt??[]).some(x=>normalize(x)===normalize(p.alt));
    if(same && (protectedStates.has(state)||row.metricool_id)) throw new Error('Fato equivalente já registrado; reconciliar');
  }
  const reviewed=new Set((p.reviewedMetricoolIds??[]).map(String));
  for(const row of rows) {
    if(!reviewed.has(String(row.id))) throw new Error('Histórico não revisado: '+row.id);
    if((normalize(p.caption)&&normalize(row.text)===normalize(p.caption)) ||
       row.mediaAltText?.some(x=>normalize(x)===normalize(p.alt))) throw new Error('Conteúdo equivalente no Metricool');
  }
}
function validate(p,now) {
  identity(p);
  if(p.state!=='VALIDATED'||p.editorialValidation!==true||p.mediaLegibilityValidated!==true) throw new Error('Validação editorial/mídia ausente');
  if(!['POST','STORY'].includes(p.format)) throw new Error('Formato sem validação nesta rota');
  if(!p.title||!p.alt||!p.factFingerprint||!p.equivalentPautaIds?.length||!p.sources?.length) throw new Error('Manifesto incompleto');
  if(p.sources.some(x=>!/^https:\/\//.test(x.url??''))) throw new Error('Fonte inválida');
  if(p.highRisk && !p.sources.some(x=>x.primary===true) &&
     new Set(p.sources.map(x=>x.independentOrganization).filter(Boolean)).size<2) throw new Error('Confirmação das fontes insuficiente');
  if(!/T.*[+-]\d\d:\d\d$/.test(p.publicationDate??'') || !Number.isFinite(Date.parse(p.publicationDate)) ||
     Date.parse(p.publicationDate)<=now) throw new Error('Data futura com fuso exigida');
}
export function transition(input) {
  const {stage,manifest:p,history:h,owner,attemptId,lock}=input;
  const now=Date.parse(input.now);
  if(!Number.isFinite(now)) throw new Error('Horário de verificação inválido');
  const data=structuredClone(input.registry);
  if(!Array.isArray(data.posts)||!Array.isArray(data.events)) throw new Error('Registro inválido');
  if(lock?.state!=='ACTIVE'||lock.owner!==owner||lock.attemptId!==attemptId) throw new Error('Reserva não pertence à tentativa');
  const id=identity(p), key=id+'|'+p.format;
  let row=data.posts.find(x=>x.chave===key);
  if(stage==='ready') {
    validate(p,now); assertHistory(h,now,p.publicationDate); assertNovel(p,data,h.rows);
    const m=input.media;
    if(!m?.drive_id||!m.sha256?.match(/^[a-f0-9]{64}$/)||m.archiveReadbackSha!==m.sha256||
       m.mime!=='image/jpeg'||m.width!==1080||m.height!==(p.format==='STORY'?1920:1350)) throw new Error('Arquivo Drive não comprovado');
    row={pauta_id:id,chave:key,factFingerprint:p.factFingerprint,format:p.format,title:p.title,text:p.caption??'',alt:[p.alt],
      source_urls:p.sources.map(x=>x.url),state:'READY',route:ROUTE,owner,attempt_id:attemptId,media:[m],attempts:[]};
    data.posts.push(row);
  } else {
    if(!row || row.owner!==owner || row.attempt_id!==attemptId) throw new Error('Tentativa não encontrada');
    if(stage==='sending') {
      if(row.state!=='READY') throw new Error('Envio já iniciado; não reenviar');
      validate(p,now); assertHistory(h,now,p.publicationDate); assertNovel(p,data,h.rows,attemptId);
      row.state='SENDING'; row.attempts.push({attempt_id:attemptId,started_at:input.now,status:'SENDING'});
    } else if(stage==='accepted') {
      if(row.state!=='SENDING') throw new Error('Aceitação fora de SENDING');
      const received=input.response?.id??input.response?.metricoolId??input.response?.data?.id;
      if(!validId(received)) {row.state='UNKNOWN';row.error='Resposta sem ID real';}
      else {row.state='SCHEDULED';row.metricool_id=received;row.uuid=input.response.uuid??input.response.data?.uuid??null;}
    } else if(stage==='unknown') {
      if(row.state!=='SENDING') throw new Error('UNKNOWN fora de SENDING');
      row.state='UNKNOWN';row.error='Resultado incerto; reconciliar antes de retry';
    } else if(stage==='reconcile') {
      if(!validId(row.metricool_id)||String(input.observed?.id)!==String(row.metricool_id)) throw new Error('ID de reconciliação divergiu');
      const provider=input.observed.providers?.find(x=>x.network==='instagram');
      if(provider?.status==='PUBLISHED') {
        row.state='PUBLISHED';row.providers=input.observed.providers;
        row.publication_evidence={source:'metricool_provider_status',provider_status:'PUBLISHED',metricool_id:row.metricool_id,checked_at:input.now,public_url:provider.publicUrl??null};
      } else if(['ERROR','FAILED'].includes(provider?.status)) {row.state='FAILED';row.providers=input.observed.providers;}
      // Absence or a non-final status never proves publication.
    } else throw new Error('Etapa inválida');
  }
  row.updated_at=input.now;
  data.events.push({type:'CONNECTOR_PROTOCOL',stage,pauta_id:id,attempt_id:attemptId,owner,at:input.now,state:row.state});
  return {registry:data,record:row,sendAuthorized:stage==='sending'};
}
async function main() {
  const [stage,inputPath,outputPath]=process.argv.slice(2);
  const input=JSON.parse(await readFile(inputPath,'utf8'));
  let result;
  if(stage==='verify') { assertReadback(input.expected,input.actual);result={verified:true}; }
  else if(stage==='claim') result=claim(input.lock,input.owner,input.attemptId);
  else result=transition({...input,stage});
  await writeFile(outputPath,JSON.stringify(result,null,2));
}
if(process.argv[1] && import.meta.url===new URL('file://'+path.resolve(process.argv[1])).href) main().catch(error=>{console.error(error.message);process.exitCode=1;});
