import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { GoogleAuth, UserRefreshClient } from 'google-auth-library';

export const REGISTRY = '1sBp-SIonEJ9z8ErHT9VjpgJbXwXVtulh';
const FOLDER = process.env.GOOGLE_DRIVE_ARCHIVE_FOLDER_ID || '1jsKcEDUAqma4y9WDRpESqUPjTy7f-kZ3';
export async function createDriveClient() {
  if (process.env.GOOGLE_DRIVE_OAUTH_CREDENTIALS) {
    let credentials;
    try { credentials=JSON.parse(process.env.GOOGLE_DRIVE_OAUTH_CREDENTIALS); }
    catch { throw new Error('GOOGLE_DRIVE_OAUTH_CREDENTIALS deve conter JSON válido'); }
    if (credentials.type!=='authorized_user' || !credentials.client_id || !credentials.client_secret || !credentials.refresh_token) throw new Error('OAuth Drive exige authorized_user, client_id, client_secret e refresh_token');
    const client=new UserRefreshClient();
    client.fromJSON(credentials);
    return client;
  }
  return new GoogleAuth({scopes:['https://www.googleapis.com/auth/drive']}).getClient();
}
const BRAND = '7125091';
const ZONE = 'America/Sao_Paulo';
const protectedStates = new Set(['SENDING','UNKNOWN','SCHEDULED','PENDING','PUBLISHING','PUBLISHED']);
export function identity(p) {
  const fields = [p.entities?.map(x=>x.trim().toLowerCase()).sort(), p.event, p.eventDate, p.development];
  if (!fields[0]?.length || fields.slice(1).some(x=>typeof x!=='string'||!x.trim())) throw new Error('Identidade factual incompleta');
  return createHash('sha256').update(JSON.stringify(fields)).digest('hex');
}
export function validate(p) {
  identity(p);
  if (p.state !== 'VALIDATED' || p.editorialValidation !== true || p.mediaLegibilityValidated !== true) throw new Error('Pauta/mídia exige validação editorial explícita');
  if (!['POST','STORY','REEL'].includes(p.format)) throw new Error('Formato inválido');
  if (!p.title || !p.alt || !p.mediaPath || !p.sources?.length || !p.equivalentPautaIds?.length || !p.factFingerprint) throw new Error('Manifesto incompleto; incluir equivalências do registro legado');
  if (p.highRisk && !p.sources.some(s=>s.primary===true) && new Set(p.sources.map(s=>s.independentOrganization)).size<2) throw new Error('Fonte primária ou duas organizações independentes exigidas');
  for (const s of p.sources) if (!/^https:\/\//.test(s.url??'')) throw new Error('Fonte inválida');
  if (!p.publicationDate?.match(/T.*[+-]\d\d:\d\d$/) || !Number.isFinite(Date.parse(p.publicationDate))) throw new Error('Data com fuso explícito exigida');
  return p;
}
export function assertNovel(p, registry, remote) {
  const id=identity(p), ids=new Set([id,...p.equivalentPautaIds]);
  for (const item of registry.posts??[]) {
    if ((ids.has(item.pauta_id)||item.factFingerprint===p.factFingerprint) && protectedStates.has(item.state)) throw new Error('Fato já enviado ou resultado incerto: reconciliar sem recriar');
  }
  const normalize=x=>String(x??'').normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
  for (const item of remote) {
    if (p.reviewedMetricoolIds?.map(String).includes(String(item.id))) continue;
    // Every existing row must be editorially reviewed, including textless Stories and drafts.
    throw new Error(`Histórico Metricool não revisado: ${item.id}`);
  }
  for (const item of remote) {
    if ((normalize(item.text) && normalize(item.text)===normalize(p.caption)) || item.mediaAltText?.some(x=>normalize(x)===normalize(p.alt))) throw new Error('Texto/alt equivalente no Metricool');
  }
}
async function checked(response) {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}
export class DriveRegistry {
  constructor(client) { this.client=client; }
  async request(url, options={}) {
    const target=new URL(url);
    target.searchParams.set('supportsAllDrives','true');
    return this.client.request({...options,url:target.href});
  }
  async read() {
    const meta=(await this.request(`https://www.googleapis.com/drive/v3/files/${REGISTRY}?fields=id,version,modifiedTime`)).data;
    const data=(await this.request(`https://www.googleapis.com/drive/v3/files/${REGISTRY}?alt=media`)).data;
    if (!Array.isArray(data.posts)||!Array.isArray(data.events)) throw new Error('Registro inválido');
    return {meta,data};
  }
  async save(expected,data) {
    const current=await this.read();
    if (String(current.meta.version)!==String(expected.meta.version)||JSON.stringify(current.data)!==JSON.stringify(expected.data)) throw new Error('Concorrência detectada no registro');
    await this.request(`https://www.googleapis.com/upload/drive/v3/files/${REGISTRY}?uploadType=media`,{method:'PATCH',headers:{'Content-Type':'application/json'},data:JSON.stringify(data)});
    const actual=await this.read();
    if (JSON.stringify(actual.data)!==JSON.stringify(data)) throw new Error('Readback divergiu');
    return actual;
  }
  async archive(bytes,name,mime) {
    const boundary='aconteceja_'+createHash('sha256').update(bytes).digest('hex');
    const prefix=Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({name,parents:[FOLDER]})}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`);
    const result=await this.request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},data:Buffer.concat([prefix,bytes,Buffer.from(`\r\n--${boundary}--`)])});
    return result.data;
  }
}
export class Metricool {
  constructor() {
    this.token=process.env.METRICOOL_TOKEN; this.user=process.env.METRICOOL_USER_ID;
    if (!this.token||!this.user) throw new Error('Credenciais Metricool ausentes');
  }
  async request(method,query='',body) {
    const url=`https://app.metricool.com/api/v2/scheduler/posts?userId=${encodeURIComponent(this.user)}&blogId=${BRAND}${query}`;
    const response=await fetch(url,{method,headers:{'X-Mc-Auth':this.token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
    return (await checked(response)).json();
  }
  async list() {
    const from=new Date(Date.now()-14*86400000).toISOString(), to=new Date(Date.now()+7*86400000).toISOString();
    const body=await this.request('GET',`&start=${encodeURIComponent(from)}&end=${encodeURIComponent(to)}&timezone=${encodeURIComponent(ZONE)}`);
    const rows=Array.isArray(body)?body:body.data;
    if (!Array.isArray(rows)||body.hasMore||body.nextPage||body.pagination?.hasNext) throw new Error('Histórico Metricool incompleto');
    return rows;
  }
  async create(p,url) {
    const local=new Intl.DateTimeFormat('sv-SE',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(p.publicationDate)).replace(' ','T');
    return this.request('POST','',{text:p.caption??'',media:[url],mediaAltText:[p.alt],providers:[{network:'instagram'}],publicationDate:{dateTime:local,timezone:ZONE},autoPublish:true,draft:false,instagramData:{type:p.format,isAiGenerated:false,showReelOnFeed:true}});
  }
}
export async function run(p,{drive,metricool,materialize,wait=ms=>new Promise(r=>setTimeout(r,ms))}) {
  validate(p);
  let snapshot=await drive.read();
  const remote=await metricool.list();
  assertNovel(p,snapshot.data,remote);
  if (Date.parse(p.publicationDate)<=Date.now()) throw new Error('Data de publicação já passou');
  const bytes=await readFile(p.mediaPath);
  if (p.format==='REEL') throw new Error('REEL bloqueado até existir validação real de vídeo');
  const metadata=await sharp(bytes).metadata();
  if (metadata.format!=='jpeg'||metadata.width!==1080||metadata.height!==(p.format==='STORY'?1920:1350)) throw new Error('Dimensões/formato inválidos: esta ponte exige JPG');
  const media=await drive.archive(bytes,`${identity(p)}.${metadata.format==='png'?'png':'jpg'}`,`image/${metadata.format}`);
  const id=identity(p), attemptId=`${process.env.GITHUB_RUN_ID??Date.now()}-${id}`;
  const record={pauta_id:id,chave:`${id}|${p.format}`,factFingerprint:p.factFingerprint,format:p.format,title:p.title,text:p.caption??'',alt:[p.alt],source_urls:p.sources.map(s=>s.url),state:'READY',media:[{drive_id:media.id,sha256:createHash('sha256').update(bytes).digest('hex'),width:metadata.width,height:metadata.height}],attempts:[]};
  async function persist(update) {
    const data=structuredClone(snapshot.data);
    let row=data.posts.find(x=>x.chave===record.chave);
    if (!row) {row=structuredClone(record);data.posts.push(row);}
    Object.assign(row,update,{updated_at:new Date().toISOString()});
    snapshot=await drive.save(snapshot,data);
    return row;
  }
  await persist({state:'READY'});
  let url;
  try {url=await materialize(p,bytes);} catch(error) {await persist({state:'BLOCKED',error:error.message});throw error;}
  const latest=await metricool.list();
  // The newly created READY row is not a sent record.
  assertNovel(p,snapshot.data,latest);
  await persist({state:'SENDING',attempts:[{attempt_id:attemptId,started_at:new Date().toISOString(),status:'SENDING'}],metricool_media:[url]});
  let response;
  try {response=await metricool.create(p,url);} catch(error) {await persist({state:'UNKNOWN',error:'Resposta de envio incerta; reconciliar antes de retry'});throw error;}
  const received=response.id??response.data?.id;
  if (!received) {await persist({state:'UNKNOWN',error:'Resposta sem ID'});throw new Error('UNKNOWN: sem ID');}
  await persist({state:'SCHEDULED',metricool_id:received,uuid:response.uuid??response.data?.uuid??null});
  for(let n=0;n<10;n++) {
    const rows=await metricool.list(), found=rows.find(x=>String(x.id)===String(received));
    const provider=found?.providers?.find(x=>x.network==='instagram');
    if(provider?.status==='PUBLISHED') {
      await persist({state:'PUBLISHED',providers:found.providers,publication_evidence:{source:'metricool_provider_status',checked_at:new Date().toISOString(),provider_status:'PUBLISHED',public_url:provider.publicUrl??null}});
      return {state:'PUBLISHED',metricool_id:received,url:provider.publicUrl??null};
    }
    if (['ERROR','FAILED'].includes(provider?.status)) {await persist({state:'FAILED',providers:found.providers});return {state:'FAILED',metricool_id:received};}
    if(n<9) await wait(15000);
  }
  return {state:'SCHEDULED',metricool_id:received,publication_confirmed:false};
}
export async function main() {
  const manifest=path.resolve(process.argv[2]??'');
  if (!manifest.startsWith(path.resolve('queue')+path.sep)||!manifest.endsWith('.json')) throw new Error('Manifesto deve estar em queue/*.json');
  const p=JSON.parse(await readFile(manifest,'utf8'));
  const client=await createDriveClient();
  const {materializeMediaForMetricool}=await import('./publisher.js');
  const receipt=await run(p,{drive:new DriveRegistry(client),metricool:new Metricool(),materialize:async(post,bytes)=>{
    // Existing bridge validates the actual remote JPG before sending.
    const ready=await materializeMediaForMetricool({type:'image/jpeg',path:post.mediaPath,size:bytes.length},{upload:true});
    const remote=Buffer.from(await (await checked(await fetch(ready.publicUrl))).arrayBuffer());
    if(!remote.equals(bytes)) throw new Error('Mídia externa difere do original');
    return ready.publicUrl;
  }});
  await mkdir('output/production',{recursive:true});
  await writeFile('output/production/receipt.json',JSON.stringify(receipt,null,2));
  console.log(JSON.stringify(receipt));
}
if (process.argv[1] && import.meta.url===new URL(`file://${path.resolve(process.argv[1])}`).href) main().catch(error=>{console.error(error.message);process.exitCode=1;});
