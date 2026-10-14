import test from 'node:test';
import assert from 'node:assert/strict';
import { transition, claim, assertReadback, verifyReadback, buildConnectorRequest, prepareConnectorRequest, releaseReservation } from '../src/services/connector-protocol.js';
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
function sending(){const input=base();input.registry=transition({...input,stage:'ready'}).registry;input.readback=verifyReadback(input.registry,input.registry,now);input.registry=transition({...input,stage:'sending'}).registry;input.readback=verifyReadback(input.registry,input.registry,now);return input;}
test('legacy string alt stays intact and equivalent alt still blocks',()=>{const i=base();i.registry.posts=[{alt:'Outra imagem',state:'PUBLISHED',metricool_id:1}];const r=transition({...i,stage:'ready'});assert.equal(r.registry.posts[0].alt,'Outra imagem');i.registry.posts[0].alt=i.manifest.alt;assert.throws(()=>transition({...i,stage:'ready'}),/equivalente/);i.registry.posts=[];i.history.rows=[{id:1,mediaAltText:i.manifest.alt}];i.manifest.reviewedMetricoolIds=[1];assert.throws(()=>transition({...i,stage:'ready'}),/equivalente/);});
test('ready preserves legacy data and is not an authorization to send',()=>{const r=transition({...base(),stage:'ready'});assert.equal(r.sendAuthorized,false);assert.deepEqual(r.registry.preserve,{legacy:true});});
test('only first sending transition authorizes a call',()=>{const i=base();i.registry=transition({...i,stage:'ready'}).registry;i.readback=verifyReadback(i.registry,i.registry,now);const r=transition({...i,stage:'sending'});assert.equal(r.sendAuthorized,true);i.registry=r.registry;assert.throws(()=>transition({...i,stage:'sending'}),/já iniciado/);});
test('history without proof and archived byte mismatch block before sending',()=>{const i=base();i.history.complete=false;assert.throws(()=>transition({...i,stage:'ready'}),/Histórico/);i.history.complete=true;i.media.archiveReadbackSha='b'.repeat(64);assert.throws(()=>transition({...i,stage:'ready'}),/Arquivo/);});
test('unreviewed draft and short history windows block',()=>{const i=base();i.history.rows=[{id:1,draft:true}];assert.throws(()=>transition({...i,stage:'ready'}),/não revisado/);i.history.rows=[];i.history.from=now;assert.throws(()=>transition({...i,stage:'ready'}),/Janela/);});
test('published legacy provider row blocks even without state',()=>{const i=base();i.registry.posts=[{pauta_id:'legacy',providers:[{network:'instagram',status:'PUBLISHED'}]}];assert.throws(()=>transition({...i,stage:'ready'}),/equivalente/);});
test('ready reservation and unknown cannot be recreated',()=>{const i=base();i.registry=transition({...i,stage:'ready'}).registry;assert.throws(()=>transition({...i,stage:'ready'}),/equivalente/);const u=sending();u.registry=transition({...u,stage:'unknown'}).registry;assert.throws(()=>transition({...u,stage:'ready'}),/equivalente/);});
test('missing or false provider IDs become UNKNOWN',()=>{for(const id of [undefined,0,'',false]){const r=transition({...sending(),stage:'accepted',response:{id}});assert.equal(r.record.state,'UNKNOWN');}});
test('real ID proves scheduling; matching Instagram status proves publication',()=>{const i=sending();i.registry=transition({...i,stage:'accepted',response:{id:123}}).registry;i.target={pauta_id:i.registry.posts[0].pauta_id,metricool_id:123};assert.equal(i.registry.posts[0].state,'SCHEDULED');assert.throws(()=>transition({...i,stage:'reconcile',observed:{id:456}}),/divergiu/);const r=transition({...i,stage:'reconcile',observed:{id:123,providers:[{network:'instagram',status:'PUBLISHED',publicUrl:'https://instagram.com/p/test'}]}});assert.equal(r.record.state,'PUBLISHED');assert.equal(r.record.publication_evidence.metricool_id,123);});
test('non-final status or unrelated provider never proves publication',()=>{const i=sending();i.registry=transition({...i,stage:'accepted',response:{id:123}}).registry;i.target={pauta_id:i.registry.posts[0].pauta_id,metricool_id:123};const r=transition({...i,stage:'reconcile',observed:{id:123,providers:[{network:'facebook',status:'PUBLISHED'}]}});assert.equal(r.record.state,'SCHEDULED');});
test('another owner and mismatched readback block; occupied reservation cannot be reclaimed',()=>{const i=base();i.lock.owner='other';assert.throws(()=>transition({...i,stage:'ready'}),/Reserva/);assert.throws(()=>claim(i.lock,'giro','new'),/ocupada/);assert.equal(claim({state:'IDLE'},'giro','new').state,'ACTIVE');assert.throws(()=>assertReadback({state:'SENDING'},{state:'READY'}),/Readback/);});

function scheduled() {
 const i=sending();i.registry=transition({...i,stage:'accepted',response:{id:123,uuid:'receipt'}}).registry;
 i.target={pauta_id:i.registry.posts[0].pauta_id,metricool_id:123};
 return i;
}
test('publication requires a matching public Instagram URL',()=>{
 for(const publicUrl of [undefined,null,'','http://instagram.com/p/test','https://example.com/p/test','https://instagram.com/stories/other/123','https://instagram.com/p/test?redirect=1']) {
  const i=scheduled();const before=structuredClone(i.registry);
  assert.throws(()=>transition({...i,stage:'reconcile',observed:{id:123,providers:[{network:'instagram',status:'PUBLISHED',publicUrl}]}}),/URL pública/);
  assert.deepEqual(i.registry,before);
 }
 const i=scheduled();assert.throws(()=>transition({...i,stage:'reconcile',observed:{id:123,providers:[{network:'instagram',status:'PUBLISHED',id:'https://instagram.com/p/other',publicUrl:'https://instagram.com/p/test'}]}}),/divergiu/);
});
test('sending and acceptance require a readback of the current snapshot',()=>{
 const i=base();i.registry=transition({...i,stage:'ready'}).registry;
 assert.throws(()=>transition({...i,stage:'sending'}),/Readback/);
 i.readback=verifyReadback(i.registry,i.registry,now);i.registry.posts[0].title='concurrent edit';
 assert.throws(()=>transition({...i,stage:'sending'}),/Readback/);
 const s=sending();delete s.readback;assert.throws(()=>transition({...s,stage:'accepted',response:{id:123}}),/Readback/);
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


