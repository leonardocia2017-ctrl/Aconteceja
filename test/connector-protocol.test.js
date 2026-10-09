import test from 'node:test';
import assert from 'node:assert/strict';
import { transition, claim, assertReadback } from '../src/services/connector-protocol.js';
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
function sending(){const input=base();input.registry=transition({...input,stage:'ready'}).registry;input.registry=transition({...input,stage:'sending'}).registry;return input;}
test('ready preserves legacy data and is not an authorization to send',()=>{const r=transition({...base(),stage:'ready'});assert.equal(r.sendAuthorized,false);assert.deepEqual(r.registry.preserve,{legacy:true});});
test('only first sending transition authorizes a call',()=>{const i=base();i.registry=transition({...i,stage:'ready'}).registry;const r=transition({...i,stage:'sending'});assert.equal(r.sendAuthorized,true);i.registry=r.registry;assert.throws(()=>transition({...i,stage:'sending'}),/já iniciado/);});
test('history without proof and archived byte mismatch block before sending',()=>{const i=base();i.history.complete=false;assert.throws(()=>transition({...i,stage:'ready'}),/Histórico/);i.history.complete=true;i.media.archiveReadbackSha='b'.repeat(64);assert.throws(()=>transition({...i,stage:'ready'}),/Arquivo/);});
test('unreviewed draft and short history windows block',()=>{const i=base();i.history.rows=[{id:1,draft:true}];assert.throws(()=>transition({...i,stage:'ready'}),/não revisado/);i.history.rows=[];i.history.from=now;assert.throws(()=>transition({...i,stage:'ready'}),/Janela/);});
test('published legacy provider row blocks even without state',()=>{const i=base();i.registry.posts=[{pauta_id:'legacy',providers:[{network:'instagram',status:'PUBLISHED'}]}];assert.throws(()=>transition({...i,stage:'ready'}),/equivalente/);});
test('ready reservation and unknown cannot be recreated',()=>{const i=base();i.registry=transition({...i,stage:'ready'}).registry;assert.throws(()=>transition({...i,stage:'ready'}),/equivalente/);const u=sending();u.registry=transition({...u,stage:'unknown'}).registry;assert.throws(()=>transition({...u,stage:'ready'}),/equivalente/);});
test('missing or false provider IDs become UNKNOWN',()=>{for(const id of [undefined,0,'',false]){const r=transition({...sending(),stage:'accepted',response:{id}});assert.equal(r.record.state,'UNKNOWN');}});
test('real ID proves scheduling; matching Instagram status proves publication',()=>{const i=sending();i.registry=transition({...i,stage:'accepted',response:{id:123}}).registry;assert.equal(i.registry.posts[0].state,'SCHEDULED');assert.throws(()=>transition({...i,stage:'reconcile',observed:{id:456}}),/divergiu/);const r=transition({...i,stage:'reconcile',observed:{id:123,providers:[{network:'instagram',status:'PUBLISHED',publicUrl:'https://instagram.com/p/test'}]}});assert.equal(r.record.state,'PUBLISHED');assert.equal(r.record.publication_evidence.metricool_id,123);});
test('non-final status or unrelated provider never proves publication',()=>{const i=sending();i.registry=transition({...i,stage:'accepted',response:{id:123}}).registry;const r=transition({...i,stage:'reconcile',observed:{id:123,providers:[{network:'facebook',status:'PUBLISHED'}]}});assert.equal(r.record.state,'SCHEDULED');});
test('another owner and mismatched readback block; occupied reservation cannot be reclaimed',()=>{const i=base();i.lock.owner='other';assert.throws(()=>transition({...i,stage:'ready'}),/Reserva/);assert.throws(()=>claim(i.lock,'giro','new'),/ocupada/);assert.equal(claim({state:'IDLE'},'giro','new').state,'ACTIVE');assert.throws(()=>assertReadback({state:'SENDING'},{state:'READY'}),/Readback/);});
