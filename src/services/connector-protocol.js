import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const ROUTE = 'chatgpt_metricool_connector';
const protectedStates = new Set(['READY','SENDING','DISPATCHING','UNKNOWN','SCHEDULED','PENDING','PUBLISHING','PUBLISHED','DRAFT']);
const normalize = x => String(x ?? '').normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
const altValues = x => x == null ? [] : Array.isArray(x) ? x : [x];
export function identity(p) {
  const fields=[p.entities?.map(x=>normalize(x)).sort(),p.event,p.eventDate,p.development];
  if(!fields[0]?.length || fields.slice(1).some(x=>typeof x!=='string'||!x.trim())) throw new Error('Identidade factual incompleta');
  return createHash('sha256').update(JSON.stringify(fields)).digest('hex');
}
export function assertReadback(expected,actual) {
  if(JSON.stringify(expected)!==JSON.stringify(actual)) throw new Error('Readback divergiu; não enviar');
}
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const protectedIdentity = row => digest({pauta_id:row.pauta_id,factFingerprint:row.factFingerprint,format:row.format,
  text:row.text,alt:row.alt,manifest:row.manifest});
function requireQuarantines(registry,lock) {
  for(const pending of lock?.quarantinedAttempts??[]) {
    const rows=registry?.posts?.filter(x=>x.owner===pending.owner&&x.attempt_id===pending.attemptId)??[];
    if(rows.length!==1||rows[0].pauta_id!==pending.pauta_id||protectedIdentity(rows[0])!==pending.identity_sha256||
       rows[0].quarantine?.identity_sha256!==pending.identity_sha256)
      throw new Error('Quarentena ausente ou identidade alterada; bloquear escritor');
    const resuming=lock.state==='ACTIVE'&&lock.owner===pending.owner&&lock.attemptId===pending.attemptId;
    if(!resuming&&(rows[0].state!=='UNKNOWN'||rows[0].metricool_id)) throw new Error('Quarentena exige reconciliação antes de nova reserva');
  }
}
export function verifyReadback(expected,actual,now) {
  if(!Number.isFinite(Date.parse(now))) throw new Error('Horário de verificação inválido');
  assertReadback(expected,actual);
  return {verified:true,sha256:digest(actual),checked_at:now};
}
function requireReadback(registry,receipt) {
  if(receipt?.verified!==true || receipt.sha256!==digest(registry) || !Number.isFinite(Date.parse(receipt.checked_at)))
    throw new Error('Readback comprovado do snapshot atual exigido');
}
export function publicationEvidence(record,observed,now) {
  if(!Number.isFinite(Date.parse(now))) throw new Error('Horário de verificação inválido');
  if(!validId(record.metricool_id) || String(observed?.id)!==String(record.metricool_id)) throw new Error('ID de reconciliação divergiu');
  const providers=Array.isArray(observed?.providers)?observed.providers.filter(x=>x?.network==='instagram'):[];
  if(providers.length!==1 || providers[0].status!=='PUBLISHED') throw new Error('Confirmação final do Instagram ausente');
  const provider=providers[0];
  let url;
  try {url=new URL(provider.publicUrl);} catch {throw new Error('URL pública do Instagram ausente ou inválida');}
  const pattern=record.format==='STORY'?/^\/stories\/aconteceja\/[1-9]\d*\/?$/:
    record.format==='REEL'?/^\/reel\/[A-Za-z0-9_-]+\/?$/:/^\/p\/[A-Za-z0-9_-]+\/?$/;
  if(url.protocol!=='https:' || !['instagram.com','www.instagram.com'].includes(url.hostname) || url.port ||
     url.username || url.password || url.search || url.hash || !pattern.test(url.pathname)) throw new Error('URL pública não corresponde ao formato/conta');
  if(typeof provider.id==='string' && /^https?:/.test(provider.id)) {
    const canonical = value => {const u=new URL(value);return u.hostname.replace(/^www\./,'')+u.pathname.replace(/\/$/,'');};
    if(canonical(provider.id)!==canonical(provider.publicUrl)) throw new Error('URL pública divergiu do ID do provedor');
  }
  return {source:'metricool_provider_status',provider_status:'PUBLISHED',metricool_id:record.metricool_id,checked_at:now,public_url:provider.publicUrl};
}
export function buildConnectorRequest(input) {
  const {registry,lock,owner,attemptId,readback,now}=input;
  if(!Number.isFinite(Date.parse(now))) throw new Error('Horário de verificação inválido');
  requireReadback(registry,readback);
  if(lock?.state!=='ACTIVE'||lock.owner!==owner||lock.attemptId!==attemptId) throw new Error('Reserva não pertence à tentativa');
  const rows=registry.posts.filter(x=>x.owner===owner&&x.attempt_id===attemptId);
  if(rows.length!==1||rows[0].state!=='SENDING'||rows[0].metricool_id) throw new Error('Envio não autorizado');
  const row=rows[0], p=row.manifest;
  validate(p,Date.parse(now));
  if(!Array.isArray(input.mediaFiles)||input.mediaFiles.length!==1||typeof input.mediaFiles[0]!=='string'||!input.mediaFiles[0]) throw new Error('Uma mídia real exigida');
  const date=p.publicationDate;
  return {blogId:'7125091',date,mediaFiles:[...input.mediaFiles],info:JSON.stringify({text:p.caption??'',mediaAltText:[p.alt],providers:[{network:'instagram'}],
    publicationDate:{dateTime:date,timezone:'America/Sao_Paulo'},autoPublish:true,draft:false,
    instagramData:{type:p.format,autoPublish:true,isAiGenerated:false}})};
}
export async function prepareConnectorRequest(input) {
  const request=buildConnectorRequest(input);
  const row=input.registry.posts.find(x=>x.owner===input.owner&&x.attempt_id===input.attemptId);
  const bytes=await readFile(request.mediaFiles[0]);
  if(!bytes.length||createHash('sha256').update(bytes).digest('hex')!==row.media?.[0]?.sha256)
    throw new Error('Mídia de envio divergiu do arquivo validado');
  return request;
}
// Preparation is repeatable; dispatch consumes the attempt BEFORE calling the provider.
export async function prepareConnectorDispatch(input) {
  const request=await prepareConnectorRequest(input);
  const result=transition({...input,stage:'dispatch',request});
  return {...result,request};
}
function rejectionEvidence(row,evidence) {
  if(row.metricool_id || evidence?.source!=='metricool_provider_rejection' ||
     evidence.attempt_id!==row.attempt_id || evidence.accepted!==false || evidence.definitive!==true ||
     !Number.isFinite(Date.parse(evidence.checked_at)) || !evidence.reference ||
     !evidence.response || evidence.response.accepted!==false || evidence.response.attempt_id!==row.attempt_id)
    throw new Error('Rejeição definitiva do provedor para a mesma tentativa exigida');
  return structuredClone(evidence);
}
export function releaseReservation(input) {
  const {registry,lock,owner,attemptId,readback,now}=input;
  if(!Number.isFinite(Date.parse(now))) throw new Error('Horário de verificação inválido');
  requireReadback(registry,readback);
  if(lock?.state!=='ACTIVE'||lock.owner!==owner||lock.attemptId!==attemptId) throw new Error('Reserva não pertence à tentativa');
  const rows=registry.posts.filter(x=>x.owner===owner&&x.attempt_id===attemptId);
  if(rows.length!==1) throw new Error('Reserva exige publicação confirmada ou rejeição comprovada; reconciliar');
  const row=rows[0];
  requireQuarantines(registry,lock);
  const remainingLock={...lock,quarantinedAttempts:(lock.quarantinedAttempts??[]).filter(x=>x.attemptId!==attemptId||x.owner!==owner)};
  if(row.reconciliation_error) throw new Error('Observação pendente de reconciliação; não liberar');
  if(row.state==='REJECTED') {
    const evidence=rejectionEvidence(row,row.rejection_evidence);
    return {...remainingLock,state:'IDLE',owner:null,attemptId:null,lastCompleted:{owner,attemptId,status:'REJECTED',
      rejection_evidence:evidence,readback:structuredClone(readback),closed_at:now}};
  }
  if(row.state==='FAILED') {
    const observation=registry.events.findLast(x=>x.type==='CONNECTOR_OBSERVATION'&&x.attempt_id===attemptId&&x.owner===owner);
    const providers=Array.isArray(observation?.observed?.providers)?observation.observed.providers.filter(x=>x?.network==='instagram'):[];
    if(!validId(row.metricool_id)||String(observation?.observed?.id)!==String(row.metricool_id)||
       providers.length!==1||!['FAILED','ERROR'].includes(providers[0].status)||observation.validation_error||
       JSON.stringify(row.providers)!==JSON.stringify(observation.observed.providers)) throw new Error('Falha final do mesmo ID não comprovada');
    return {...remainingLock,state:'IDLE',owner:null,attemptId:null,lastCompleted:{owner,attemptId,status:'FAILED',metricool_id:row.metricool_id,
      failure_evidence:structuredClone(observation),readback:structuredClone(readback),closed_at:now}};
  }
  if(row.state!=='PUBLISHED') throw new Error('Reserva exige publicação confirmada ou rejeição comprovada; reconciliar');
  const evidence=publicationEvidence(row,{id:row.metricool_id,providers:row.providers},now);
  if(row.publication_evidence?.metricool_id!==row.metricool_id||row.publication_evidence?.public_url!==evidence.public_url)
    throw new Error('Evidência persistida divergiu');
  return {...remainingLock,state:'IDLE',owner:null,attemptId:null,lastCompleted:{owner,attemptId,metricool_id:row.metricool_id,status:'PUBLISHED',public_url:evidence.public_url,readback:structuredClone(readback),closed_at:now}};
}
export function quarantineReservation(input) {
  const {registry,lock,owner,attemptId,readback,now}=input;
  if(!Number.isFinite(Date.parse(now))) throw new Error('Horário de verificação inválido');
  requireReadback(registry,readback);requireQuarantines(registry,lock);
  if(lock?.state!=='ACTIVE'||lock.owner!==owner||lock.attemptId!==attemptId) throw new Error('Reserva não pertence à tentativa');
  const rows=registry.posts.filter(x=>x.owner===owner&&x.attempt_id===attemptId);
  if(rows.length!==1||rows[0].state!=='UNKNOWN'||rows[0].metricool_id||rows[0].quarantine?.retry_allowed!==false||
     rows[0].quarantine.identity_sha256!==protectedIdentity(rows[0])) throw new Error('Quarentena persistida de UNKNOWN exigida');
  const row=rows[0];
  if(!registry.events.some(x=>x.type==='CONNECTOR_QUARANTINE'&&x.owner===owner&&x.attempt_id===attemptId&&x.identity_sha256===row.quarantine.identity_sha256))
    throw new Error('Recibo de quarentena ausente');
  if((lock.quarantinedAttempts??[]).some(x=>x.owner===owner&&x.attemptId===attemptId)) throw new Error('Quarentena já destacada');
  return {...lock,state:'IDLE',owner:null,attemptId:null,quarantinedAttempts:[...(lock.quarantinedAttempts??[]),
    {owner,attemptId,pauta_id:row.pauta_id,factFingerprint:row.factFingerprint,identity_sha256:row.quarantine.identity_sha256,
      status:'UNKNOWN',retry_allowed:false,at:now,readback:structuredClone(readback)}]};
}
export function resumeQuarantine(input) {
  const {registry,lock,owner,attemptId,readback}=input;
  requireReadback(registry,readback);requireQuarantines(registry,lock);
  if(lock.state!=='IDLE'||!(lock.quarantinedAttempts??[]).some(x=>x.owner===owner&&x.attemptId===attemptId))
    throw new Error('Quarentena não pode ser retomada nesta reserva');
  return {...lock,state:'ACTIVE',owner,attemptId};
}
export function claim(lock,owner,attemptId,registry,readback) {
  if(lock.state!=='IDLE' || !owner || !attemptId) throw new Error('Reserva ocupada ou identidade ausente');
  if((lock.quarantinedAttempts??[]).length) {
    requireReadback(registry,readback);requireQuarantines(registry,lock);
    if(registry.posts.some(x=>x.attempt_id===attemptId)) throw new Error('Tentativa já utilizada; não recriar quarentena');
  }
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
export function validId(id) { return (typeof id==='number' && Number.isSafeInteger(id) && id>0) || (typeof id==='string' && /^[1-9]\d*$/.test(id)); }
function assertNovel(p,registry,rows,ownAttempt) {
  const ids=new Set([identity(p),...p.equivalentPautaIds]);
  for(const row of registry.posts) {
    if(ownAttempt && row.attempt_id===ownAttempt) continue;
    const state=row.state ?? row.providers?.find(x=>x.network==='instagram')?.status;
    const same=ids.has(row.pauta_id)||row.factFingerprint===p.factFingerprint||
      (normalize(p.caption)&&normalize(row.text)===normalize(p.caption))||
      altValues(row.alt).some(x=>normalize(x)===normalize(p.alt));
    if(same && state==='REJECTED') {
      rejectionEvidence(row,row.rejection_evidence);
      if(p.retryOfAttemptId!==row.attempt_id) throw new Error('Retry exige vínculo explícito à rejeição comprovada');
    }
    if(same && (protectedStates.has(state)||row.metricool_id)) throw new Error('Fato equivalente já registrado; reconciliar');
  }
  const reviewed=new Set((p.reviewedMetricoolIds??[]).map(String));
  for(const row of rows) {
    if(!reviewed.has(String(row.id))) throw new Error('Histórico não revisado: '+row.id);
    if((normalize(p.caption)&&normalize(row.text)===normalize(p.caption)) ||
       altValues(row.mediaAltText).some(x=>normalize(x)===normalize(p.alt))) throw new Error('Conteúdo equivalente no Metricool');
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
  requireQuarantines(data,lock);
  let id, key, row;
  if(stage==='reconcile') {
    const target=input.target;
    if(!target?.pauta_id || !validId(target.metricool_id)) throw new Error('Alvo de reconciliação incompleto');
    const matches=data.posts.filter(x=>x.pauta_id===target.pauta_id && String(x.metricool_id)===String(target.metricool_id));
    if(matches.length!==1) throw new Error('Alvo de reconciliação ausente ou ambíguo');
    row=matches[0]; id=row.pauta_id; key=row.chave;
  } else if(['recover','reject','dispatch','accepted','unknown','quarantine'].includes(stage)) {
    const matches=data.posts.filter(x=>x.owner===owner&&x.attempt_id===attemptId);
    if(matches.length!==1) throw new Error('Tentativa não encontrada ou ambígua');
    row=matches[0];id=row.pauta_id;key=row.chave;
  } else {
    id=identity(p); key=id+'|'+p.format;
    row=data.posts.find(x=>x.chave===key&&x.owner===owner&&x.attempt_id===attemptId);
  }
  if(stage==='ready') {
    if(data.posts.some(x=>x.attempt_id===attemptId)) throw new Error('Identidade de tentativa já utilizada');
    validate(p,now); assertHistory(h,now,p.publicationDate); assertNovel(p,data,h.rows);
    const m=input.media;
    if(!m?.drive_id||!m.sha256?.match(/^[a-f0-9]{64}$/)||m.archiveReadbackSha!==m.sha256||
       m.mime!=='image/jpeg'||m.width!==1080||m.height!==(p.format==='STORY'?1920:1350)) throw new Error('Arquivo Drive não comprovado');
    row={pauta_id:id,chave:key,factFingerprint:p.factFingerprint,format:p.format,title:p.title,text:p.caption??'',alt:[p.alt],
      source_urls:p.sources.map(x=>x.url),state:'READY',route:ROUTE,protocol_version:2,owner,attempt_id:attemptId,media:[m],manifest:structuredClone(p),
      history_evidence:{ready:structuredClone(h)},readback_evidence:{},attempts:[]};
    data.posts.push(row);
  } else {
    if(!row || row.owner!==owner || row.attempt_id!==attemptId) throw new Error('Tentativa não encontrada');
    if(stage==='sending') {
      if(row.state!=='READY') throw new Error('Envio já iniciado; não reenviar');
      requireReadback(input.registry,input.readback);
      assertReadback(row.manifest,p);
      validate(p,now); assertHistory(h,now,p.publicationDate); assertNovel(p,data,h.rows,attemptId);
      row.history_evidence.sending=structuredClone(h);
      row.readback_evidence.ready=structuredClone(input.readback);
      row.state='SENDING'; row.attempts.push({attempt_id:attemptId,started_at:input.now,status:'SENDING'});
    } else if(stage==='dispatch') {
      requireReadback(input.registry,input.readback);
      const expected=buildConnectorRequest(input);
      assertReadback(expected,input.request);
      row.readback_evidence.sending=structuredClone(input.readback);
      row.dispatch_evidence={request:structuredClone(input.request),sha256:digest(input.request),media_sha256:row.media[0].sha256,at:input.now};
      row.state='DISPATCHING';
      data.events.push({type:'CONNECTOR_REQUEST',pauta_id:id,attempt_id:attemptId,owner,at:input.now,...structuredClone(row.dispatch_evidence)});
    } else if(stage==='accepted') {
      if(row.state!=='DISPATCHING' && !(row.protocol_version!==2&&row.state==='SENDING')) throw new Error('Aceitação fora de DISPATCHING');
      requireReadback(input.registry,input.readback);
      row.readback_evidence??={};
      row.readback_evidence[row.state==='DISPATCHING'?'dispatching':'sending']=structuredClone(input.readback);
      const received=input.response?.id??input.response?.metricoolId??input.response?.data?.id;
      if(!validId(received)) {row.state='UNKNOWN';row.error='Resposta sem ID real';}
      else {row.state='SCHEDULED';row.metricool_id=received;row.uuid=input.response.uuid??input.response.data?.uuid??null;}
      data.events.push({type:'CONNECTOR_RECEIPT',pauta_id:id,attempt_id:attemptId,owner,at:input.now,response:structuredClone(input.response??{}),metricool_id:validId(received)?received:null});
    } else if(stage==='unknown') {
      if(!['SENDING','DISPATCHING'].includes(row.state)) throw new Error('UNKNOWN fora de envio');
      row.state='UNKNOWN';row.error='Resultado incerto; reconciliar antes de retry';
      if(input.response!==undefined) {
        row.connector_response=structuredClone(input.response);
        data.events.push({type:'CONNECTOR_ERROR_EVIDENCE',pauta_id:id,attempt_id:attemptId,owner,at:input.now,response:structuredClone(input.response)});
      }
    } else if(stage==='quarantine') {
      requireReadback(input.registry,input.readback);
      const response=row.connector_response;
      if(row.state!=='UNKNOWN'||row.metricool_id||row.quarantine||response?.isError!==true||response.error_code!=='INVALID_ARGUMENT'||
         !Number.isFinite(Date.parse(response.received_at))||Date.parse(response.received_at)>now)
        throw new Error('Quarentena exige retorno síncrono de validação persistido; timeout ou envio em curso continuam bloqueados');
      row.quarantine={status:'AWAITING_RECONCILIATION',at:input.now,retry_allowed:false,identity_sha256:protectedIdentity(row)};
      data.events.push({type:'CONNECTOR_QUARANTINE',pauta_id:id,attempt_id:attemptId,owner,at:input.now,
        identity_sha256:row.quarantine.identity_sha256,connector_response:structuredClone(response),readback:structuredClone(input.readback),
        conclusion:'Resultado permanece UNKNOWN; liberar apenas pautas independentes, sem retry desta tentativa'});
    } else if(stage==='reject') {
      requireReadback(input.registry,input.readback);
      if(!['UNKNOWN','SENDING','DISPATCHING'].includes(row.state)) throw new Error('Rejeição fora de tentativa incerta');
      row.rejection_evidence=rejectionEvidence(row,input.evidence);
      row.state='REJECTED';
      data.events.push({type:'CONNECTOR_REJECTION',pauta_id:id,attempt_id:attemptId,owner,at:input.now,evidence:structuredClone(row.rejection_evidence)});
    } else if(stage==='recover') {
      requireReadback(input.registry,input.readback);
      if(!['UNKNOWN','SENDING','DISPATCHING'].includes(row.state)||row.metricool_id) throw new Error('Recuperação exige tentativa incerta sem ID');
      const e=input.evidence,received=input.observed?.id;
      if(e?.source!=='metricool_provider_acceptance'||e.attempt_id!==attemptId||!e.reference||
         !Number.isFinite(Date.parse(e.checked_at))||!validId(received)||String(e.metricool_id)!==String(received)||
         !e.response||e.response.attempt_id!==attemptId||String(e.response.metricool_id)!==String(received))
        throw new Error('Aceitação vinculada à mesma tentativa exigida');
      row.metricool_id=received;row.state='SCHEDULED';row.recovery_evidence=structuredClone(e);
      if(data.posts.some(x=>x!==row&&String(x.metricool_id)===String(received))) throw new Error('ID já vinculado a outro registro');
      data.events.push({type:'CONNECTOR_RECOVERY',pauta_id:id,attempt_id:attemptId,owner,at:input.now,evidence:structuredClone(e),observed:structuredClone(input.observed)});
    } else if(stage==='reconcile') {
      const idMatches=validId(row.metricool_id)&&String(input.observed?.id)===String(row.metricool_id);
      const providers=Array.isArray(input.observed?.providers)?input.observed.providers.filter(x=>x?.network==='instagram'):[];
      const provider=providers.length===1?providers[0]:null;
      if(!idMatches) row.reconciliation_error='ID de reconciliação divergiu';
      else if(provider?.status==='PUBLISHED') {
        try {
          const evidence=publicationEvidence(row,input.observed,input.now);
          row.state='PUBLISHED';row.providers=input.observed.providers;row.publication_evidence=evidence;
          delete row.reconciliation_error;
        } catch(error) {row.reconciliation_error=error.message;}
      } else if(['ERROR','FAILED'].includes(provider?.status)&&row.state!=='PUBLISHED') {row.state='FAILED';row.providers=input.observed.providers;delete row.reconciliation_error;}
      if(idMatches&&providers.length!==1) row.reconciliation_error='Um único provedor Instagram exigido';
      data.events.push({type:'CONNECTOR_OBSERVATION',pauta_id:id,attempt_id:attemptId,owner,at:input.now,observed:structuredClone(input.observed??null),validation_error:row.reconciliation_error??null});
      // Absence or a non-final status never proves publication.
    } else throw new Error('Etapa inválida');
  }
  row.updated_at=input.now;
  data.events.push({type:'CONNECTOR_PROTOCOL',stage,pauta_id:id,attempt_id:attemptId,owner,at:input.now,state:row.state});
  return {registry:data,record:row,sendAuthorized:stage==='dispatch',publicationConfirmed:row.state==='PUBLISHED'&&!row.reconciliation_error};
}
async function main() {
  const [stage,inputPath,outputPath]=process.argv.slice(2);
  const input=JSON.parse(await readFile(inputPath,'utf8'));
  let result;
  if(stage==='verify') result=verifyReadback(input.expected,input.actual,input.now);
  else if(stage==='claim') result=claim(input.lock,input.owner,input.attemptId,input.registry,input.readback);
  else if(stage==='quarantine-release') result=quarantineReservation(input);
  else if(stage==='resume') result=resumeQuarantine(input);
  else if(stage==='request') result=await prepareConnectorRequest(input);
  else if(stage==='dispatch') result=await prepareConnectorDispatch(input);
  else if(stage==='release') result=releaseReservation(input);
  else result=transition({...input,stage});
  await writeFile(outputPath,JSON.stringify(result,null,2));
}
if(process.argv[1] && import.meta.url===new URL('file://'+path.resolve(process.argv[1])).href) main().catch(error=>{console.error(error.message);process.exitCode=1;});



