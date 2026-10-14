import test from 'node:test';
import assert from 'node:assert/strict';
import { transition, claim, assertReadback, verifyReadback, buildConnectorRequest, prepareConnectorRequest, prepareConnectorDispatch, releaseReservation } from '../src/services/connector-protocol.js';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
const now='2026-10-08T23:00:00-03:00';
const base=()=>({
 now,owner:'giro',attemptId:'attempt-1',lock:{state:'ACTIVE',owner:'giro',attemptId:'attempt-1'},
 registry:{posts:[],events:[],preserve:{legacy:true}},
 manifest:{entities:['Teste'],event:'fato',eventDate:'2026-10-08',development:'novo',factFingerprint:'test',
 equivalentPautaIds:['legacy'],state:'VALIDATED',editorialValidation:true,mediaLegibilityValidated:true,
 format:'POST',title:'Teste',caption:'Fato novo',alt:'Imagem nova',sources:[{url:'https://official.example',primary:true}],highRisk:true,
 publicationDate:'2026-10-09T00:00:00-03:00',reviewedMetricoolIds:[]},
 history:{complete:true,completionEvidence:'Exportação e revisão do Planner',includesPublished:true,includesDrafts:true,includesPending:true,
 hasMore:false,from:'2026-09-24T00:00:00-03:00',to:'2026-10-16T23:59:59-03:00',rows:[]},
 media:{drive_id:'archive',sha256:'a'.repeat(64),archiveReadbackSha:'a'.repeat(64),mime:'image/jpeg',width:1080,height:1350}
});
function dispatched(){const i=sending();i.mediaFiles=['verified.jpg'];i.registry=transition({...i,stage:'dispatch',request:buildConnectorRequest(i)}).registry;i.readback=verifyReadback(i.registry,i.registry,now);return i;}
function sending(){const input=base();input.registry=transition({...input,stage:'ready'}).registry;input.readback=verifyReadback(input.registry,input.registry,now);input.registry=transition({...input,stage:'sending'}).registry;input.readback=verifyReadback(input.registry,input.registry,now);return input;}
test('legacy string alt stays intact and equivalent alt still blocks',()=>{const i=base();i.registry.posts=[{alt:'Outra imagem',state:'PUBLISHED',metricool_id:1}];const r=transition({...i,stage:'ready'});assert.equal(r.registry.posts[0].alt,'Outra imagem');i.registry.posts[0].alt=i.manifest.alt;assert.throws(()=>transition({...i,stage:'ready'}),/equivalente/);i.registry.posts=[];i.history.rows=[{id:1,mediaAltText:i.manifest.alt}];i.manifest.reviewedMetricoolIds=[1];assert.throws(()=>transition({...i,stage:'ready'}),/equivalente/);});
test('ready preserves legacy data and is not an authorization to send',()=>{const r=transition({...base(),stage:'ready'});assert.equal(r.sendAuthorized,false);assert.deepEqual(r.registry.preserve,{legacy:true});});
test('sending prepares but does not authorize a call',()=>{const i=base();i.registry=transition({...i,stage:'ready'}).registry;i.readback=verifyReadback(i.registry,i.registry,now);const r=transition({...i,stage:'sending'});assert.equal(r.sendAuthorized,false);i.registry=r.registry;assert.throws(()=>transition({...i,stage:'sending'}),/já iniciado/);});
test('history without proof and archived byte mismatch block before sending',()=>{const i=base();i.history.complete=false;assert.throws(()=>transition({...i,stage:'ready'}),/Histórico/);i.history.complete=true;i.media.archiveReadbackSha='b'.repeat(64);assert.throws(()=>transition({...i,stage:'ready'}),/Arquivo/);});
test('unreviewed draft and short history windows block',()=>{const i=base();i.history.rows=[{id:1,draft:true}];assert.throws(()=>transition({...i,stage:'ready'}),/não revisado/);i.history.rows=[];i.history.from=now;assert.throws(()=>transition({...i,stage:'ready'}),/Janela/);});
test('published legacy provider row blocks even without state',()=>{const i=base();i.registry.posts=[{pauta_id:'legacy',providers:[{network:'instagram',status:'PUBLISHED'}]}];assert.throws(()=>transition({...i,stage:'ready'}),/equivalente/);});
test('ready reservation and unknown cannot be recreated',()=>{const i=base();i.registry=transition({...i,stage:'ready'}).registry;assert.throws(()=>transition({...i,stage:'ready'}),/tentativa já utilizada/);const u=sending();u.registry=transition({...u,stage:'unknown'}).registry;assert.throws(()=>transition({...u,stage:'ready'}),/tentativa já utilizada/);});
test('missing or false provider IDs become UNKNOWN',()=>{for(const id of [undefined,0,'',false]){const r=transition({...dispatched(),stage:'accepted',response:{id}});assert.equal(r.record.state,'UNKNOWN');}});
test('real ID proves scheduling; matching Instagram status proves publication',()=>{const i=dispatched();i.registry=transition({...i,stage:'accepted',response:{id:123}}).registry;i.target={pauta_id:i.registry.posts[0].pauta_id,metricool_id:123};assert.equal(i.registry.posts[0].state,'SCHEDULED');assert.match(transition({...i,stage:'reconcile',observed:{id:456}}).record.reconciliation_error,/divergiu/);const r=transition({...i,stage:'reconcile',observed:{id:123,providers:[{network:'instagram',status:'PUBLISHED',publicUrl:'https://instagram.com/p/test'}]}});assert.equal(r.record.state,'PUBLISHED');assert.equal(r.record.publication_evidence.metricool_id,123);});
test('non-final status or unrelated provider never proves publication',()=>{const i=dispatched();i.registry=transition({...i,stage:'accepted',response:{id:123}}).registry;i.target={pauta_id:i.registry.posts[0].pauta_id,metricool_id:123};const r=transition({...i,stage:'reconcile',observed:{id:123,providers:[{network:'facebook',status:'PUBLISHED'}]}});assert.equal(r.record.state,'SCHEDULED');});
test('another owner and mismatched readback block; occupied reservation cannot be reclaimed',()=>{const i=base();i.lock.owner='other';assert.throws(()=>transition({...i,stage:'ready'}),/Reserva/);assert.throws(()=>claim(i.lock,'giro','new'),/ocupada/);assert.equal(claim({state:'IDLE'},'giro','new').state,'ACTIVE');assert.throws(()=>assertReadback({state:'SENDING'},{state:'READY'}),/Readback/);});

function scheduled() {
 const i=dispatched();i.registry=transition({...i,stage:'accepted',response:{id:123,uuid:'receipt'}}).registry;
 i.target={pauta_id:i.registry.posts[0].pauta_id,metricool_id:123};
 return i;
}
test('publication requires a matching public Instagram URL',()=>{
 for(const publicUrl of [undefined,null,'','http://instagram.com/p/test','https://example.com/p/test','https://instagram.com/stories/other/123','https://instagram.com/p/test?redirect=1']) {
  const i=scheduled();const before=structuredClone(i.registry);
  const result=transition({...i,stage:'reconcile',observed:{id:123,providers:[{network:'instagram',status:'PUBLISHED',publicUrl}]}});assert.equal(result.record.state,'SCHEDULED');assert.match(result.record.reconciliation_error,/URL pública/);assert.equal(result.publicationConfirmed,false);assert.equal(result.registry.events.at(-2).observed.id,123);
  assert.deepEqual(i.registry,before);
 }
 const i=scheduled();const out=transition({...i,stage:'reconcile',observed:{id:123,providers:[{network:'instagram',status:'PUBLISHED',id:'https://instagram.com/p/other',publicUrl:'https://instagram.com/p/test'}]}});assert.match(out.record.reconciliation_error,/divergiu/);assert.equal(out.record.state,'SCHEDULED');
});
test('sending and acceptance require a readback of the current snapshot',()=>{
 const i=base();i.registry=transition({...i,stage:'ready'}).registry;
 assert.throws(()=>transition({...i,stage:'sending'}),/Readback/);
 i.readback=verifyReadback(i.registry,i.registry,now);i.registry.posts[0].title='concurrent edit';
 assert.throws(()=>transition({...i,stage:'sending'}),/Readback/);
 const s=dispatched();delete s.readback;assert.throws(()=>transition({...s,stage:'accepted',response:{id:123}}),/Readback/);
});
test('the validated manifest cannot be changed between READY and SENDING',()=>{
 const i=base();i.registry=transition({...i,stage:'ready'}).registry;i.readback=verifyReadback(i.registry,i.registry,now);
 i.manifest.caption='Changed after validation';assert.throws(()=>transition({...i,stage:'sending'}),/Readback divergiu/);
});
test('history, readback proofs, raw creation receipt and final observation are preserved',()=>{
 const i=scheduled(),r=i.registry.posts[0];
 assert.deepEqual(r.history_evidence.ready,i.history);assert.deepEqual(r.history_evidence.sending,i.history);
 assert.equal(r.readback_evidence.ready.verified,true);assert.equal(r.readback_evidence.sending.verified,true);
 assert.equal(i.registry.events.find(x=>x.type==='CONNECTOR_RECEIPT').response.uuid,'receipt');
 const observed={id:123,providers:[{network:'instagram',status:'PUBLISHED',publicUrl:'https://instagram.com/p/test'}]};
 const out=transition({...i,stage:'reconcile',observed});assert.deepEqual(out.registry.events.find(x=>x.type==='CONNECTOR_OBSERVATION').observed,observed);
});
test('request uses an explicit offset in both connector date fields and requires verified SENDING',()=>{
 const i=sending();i.mediaFiles=['verified.jpg'];const request=buildConnectorRequest(i),payload=JSON.parse(request.info);
 assert.equal(request.date,i.manifest.publicationDate);assert.equal(payload.publicationDate.dateTime,request.date);
 assert.equal(payload.publicationDate.timezone,'America/Sao_Paulo');assert.equal(payload.draft,false);
 assert.throws(()=>buildConnectorRequest({...i,now:'2030-01-01T00:00:00Z'}),/Data futura/);
 assert.throws(()=>buildConnectorRequest({...i,readback:null}),/Readback/);
 assert.throws(()=>buildConnectorRequest({...i,mediaFiles:[]}),/mídia real/);
 i.registry.posts[0].state='UNKNOWN';i.readback=verifyReadback(i.registry,i.registry,now);
 assert.throws(()=>buildConnectorRequest(i),/não autorizado/);
});
test('request checks actual local media bytes against the persisted validated hash',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'aconteceja-media-'));
 try {
  const i=sending(),file=path.join(directory,'verified.jpg'),bytes=Buffer.from('fixture bytes');
  await writeFile(file,bytes);i.mediaFiles=[file];i.registry.posts[0].media[0].sha256=createHash('sha256').update(bytes).digest('hex');
  i.readback=verifyReadback(i.registry,i.registry,now);
  assert.equal((await prepareConnectorRequest(i)).mediaFiles[0],file);
  await writeFile(file,'changed');await assert.rejects(prepareConnectorRequest(i),/Mídia de envio divergiu/);
 } finally {await rm(directory,{recursive:true,force:true});}
});
test('release requires the same owner, a verified snapshot and matching final evidence',()=>{
 const i=scheduled();i.readback=verifyReadback(i.registry,i.registry,now);
 assert.throws(()=>releaseReservation(i),/publicação confirmada/);
 i.registry=transition({...i,stage:'reconcile',observed:{id:123,providers:[{network:'instagram',status:'PUBLISHED',publicUrl:'https://instagram.com/p/test'}]}}).registry;
 i.readback=verifyReadback(i.registry,i.registry,now);
 const lock=releaseReservation(i);assert.equal(lock.state,'IDLE');assert.equal(lock.lastCompleted.metricool_id,123);
 assert.throws(()=>releaseReservation({...i,owner:'other'}),/Reserva/);
 i.registry.posts[0].publication_evidence.public_url='https://instagram.com/p/other';i.readback=verifyReadback(i.registry,i.registry,now);
 assert.throws(()=>releaseReservation(i),/persistida divergiu/);
});
test('reconciliation by persisted IDs needs no manifest and rejects ambiguous targets',()=>{
 const i=scheduled();delete i.manifest;
 const observed={id:123,providers:[{network:'instagram',status:'PUBLISHED',publicUrl:'https://instagram.com/p/test'}]};
 assert.equal(transition({...i,stage:'reconcile',observed}).record.state,'PUBLISHED');
 i.registry.posts.push(structuredClone(i.registry.posts[0]));
 assert.throws(()=>transition({...i,stage:'reconcile',observed}),/ambíguo/);
});

function uncertain(){const i=dispatched();i.registry=transition({...i,stage:'unknown',response:{isError:true,error_code:'INVALID_ARGUMENT',message:'date parse'}}).registry;i.readback=verifyReadback(i.registry,i.registry,now);return i;}
const rejection=()=>({source:'metricool_provider_rejection',attempt_id:'attempt-1',accepted:false,definitive:true,checked_at:now,reference:'provider-case-123',response:{attempt_id:'attempt-1',accepted:false,confirmation:'Request was not accepted'}});
test('dispatch consumes the fresh attempt and persists its exact request',()=>{
 const i=dispatched();assert.equal(i.registry.posts[0].state,'DISPATCHING');
 assert.equal(i.registry.events.find(x=>x.type==='CONNECTOR_REQUEST').request.date,i.manifest.publicationDate);
 assert.throws(()=>buildConnectorRequest(i),/não autorizado/);
 assert.throws(()=>transition({...i,stage:'dispatch',request:{}}),/não autorizado/);
 assert.throws(()=>transition({...sending(),stage:'accepted',response:{id:123}}),/DISPATCHING/);
});
test('dispatch CLI checks bytes before consuming an attempt',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'aconteceja-dispatch-'));
 try {
  const i=sending(),file=path.join(directory,'story.jpg'),bytes=Buffer.from('validated');
  await writeFile(file,bytes);i.mediaFiles=[file];i.registry.posts[0].media[0].sha256=createHash('sha256').update(bytes).digest('hex');
  i.readback=verifyReadback(i.registry,i.registry,now);
  const out=await prepareConnectorDispatch(i);assert.equal(out.sendAuthorized,true);assert.equal(out.record.state,'DISPATCHING');
  await writeFile(file,'changed');await assert.rejects(prepareConnectorDispatch(i),/divergiu/);
  assert.equal(i.registry.posts[0].state,'SENDING');
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('unknown preserves raw errors without needing a current manifest',()=>{
 const i=uncertain();assert.equal(i.registry.posts[0].connector_response.error_code,'INVALID_ARGUMENT');
 assert.equal(i.registry.events.find(x=>x.type==='CONNECTOR_ERROR_EVIDENCE').response.message,'date parse');
});
test('absence and INVALID_ARGUMENT alone never authorize rejection or release',()=>{
 const i=uncertain();delete i.manifest;
 for(const evidence of [undefined,{source:'list_absence',accepted:false},i.registry.posts[0].connector_response,{...rejection(),response:{error_code:'INVALID_ARGUMENT'}}])
  assert.throws(()=>transition({...i,stage:'reject',evidence}),/Rejeição definitiva/);
 assert.throws(()=>releaseReservation(i),/reconciliar/);
});
test('proven provider rejection closes only the same attempt and stores final readback',()=>{
 const i=uncertain();delete i.manifest;
 assert.throws(()=>transition({...i,stage:'reject',evidence:{...rejection(),attempt_id:'other'}}),/Rejeição definitiva/);
 const out=transition({...i,stage:'reject',evidence:rejection()});assert.equal(out.record.state,'REJECTED');
 i.registry=out.registry;i.readback=verifyReadback(i.registry,i.registry,now);
 const lock=releaseReservation(i);assert.equal(lock.state,'IDLE');assert.equal(lock.lastCompleted.status,'REJECTED');assert.equal(lock.lastCompleted.readback.sha256,i.readback.sha256);
});
test('retry after rejection requires explicit linkage and preserves the old attempt',()=>{
 const i=uncertain();i.registry=transition({...i,stage:'reject',evidence:rejection()}).registry;
 i.attemptId='attempt-2';i.lock.attemptId='attempt-2';
 assert.throws(()=>transition({...i,stage:'ready'}),/vínculo explícito/);
 i.manifest.retryOfAttemptId='attempt-1';i.registry=transition({...i,stage:'ready'}).registry;
 assert.equal(i.registry.posts.length,2);assert.equal(i.registry.posts[0].state,'REJECTED');
 i.readback=verifyReadback(i.registry,i.registry,now);assert.equal(transition({...i,stage:'sending'}).record.attempt_id,'attempt-2');
});
test('unknown ID recovery needs a positive acceptance bound to the attempt',()=>{
 const i=uncertain();delete i.manifest;const observed={id:987};
 assert.throws(()=>transition({...i,stage:'recover',observed,evidence:{}}),/Aceitação vinculada/);
 const evidence={source:'metricool_provider_acceptance',attempt_id:i.attemptId,metricool_id:987,reference:'provider-case-456',checked_at:now,response:{attempt_id:i.attemptId,metricool_id:987}};
 const out=transition({...i,stage:'recover',observed,evidence});assert.equal(out.record.state,'SCHEDULED');assert.equal(out.record.metricool_id,987);
 i.registry=out.registry;i.readback=verifyReadback(i.registry,i.registry,now);assert.throws(()=>releaseReservation(i),/reconciliar/);
});
test('contradictory observations cannot downgrade publication or release the reservation',()=>{
 const i=scheduled();i.registry=transition({...i,stage:'reconcile',observed:{id:123,providers:[{network:'instagram',status:'PUBLISHED',publicUrl:'https://instagram.com/p/test'}]}}).registry;
 const out=transition({...i,stage:'reconcile',observed:{id:123,providers:[{network:'instagram',status:'PUBLISHED',publicUrl:null}]}});
 assert.equal(out.record.state,'PUBLISHED');assert.equal(out.publicationConfirmed,false);
 i.registry=out.registry;i.readback=verifyReadback(i.registry,i.registry,now);assert.throws(()=>releaseReservation(i),/não liberar/);
});
test('known ID failure can close the lock but never authorize retry of that fact',()=>{
 const i=scheduled();i.registry=transition({...i,stage:'reconcile',observed:{id:123,providers:[{network:'instagram',status:'FAILED'}]}}).registry;
 i.readback=verifyReadback(i.registry,i.registry,now);const lock=releaseReservation(i);
 assert.equal(lock.lastCompleted.status,'FAILED');assert.equal(lock.lastCompleted.metricool_id,123);
 i.attemptId='new';i.lock.attemptId='new';assert.throws(()=>transition({...i,stage:'ready'}),/equivalente/);
});
test('wrong IDs and malformed observations are preserved without changing the known ID',()=>{
 for(const observed of [{id:456,providers:[]},{id:123,providers:{}},null]) {
  const i=scheduled(),out=transition({...i,stage:'reconcile',observed});
  assert.equal(out.record.metricool_id,123);assert.equal(out.record.state,'SCHEDULED');assert.equal(out.publicationConfirmed,false);
  assert.deepEqual(out.registry.events.at(-2).observed,observed);
 }
});



