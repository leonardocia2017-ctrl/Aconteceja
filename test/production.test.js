import test from 'node:test';
import assert from 'node:assert/strict';
import { identity, validate, assertNovel, DriveRegistry, run } from '../src/services/production.js';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
const p={entities:['BR-040','Nova Lima'],event:'engavetamento',eventDate:'2026-10-07',development:'rodovia interditada',factFingerprint:'br040-20261007-km548',equivalentPautaIds:['legacy'],format:'STORY',state:'VALIDATED',editorialValidation:true,mediaLegibilityValidated:true,title:'Acidente',alt:'Acidente BR-040',mediaPath:'queue/a.jpg',sources:[{url:'https://official.example',primary:true}],highRisk:true,publicationDate:'2026-10-07T20:00:00-03:00',reviewedMetricoolIds:[]};
test('identity uses event date and ignores execution date/title',()=>assert.equal(identity(p),identity({...p,title:'Outro título',executionDate:'2030-01-01',entities:['Nova Lima','BR-040']})));
test('unknown legacy fact cannot be resent',()=>assert.throws(()=>assertNovel(p,{posts:[{pauta_id:'legacy',state:'UNKNOWN'}]},[]),/incerto/));
test('unreviewed textless Story/draft blocks sending',()=>assert.throws(()=>assertNovel(p,{posts:[]},[{id:1,text:'',draft:true}]),/não revisado/));
test('reviewed exact alt still blocks',()=>assert.throws(()=>assertNovel({...p,reviewedMetricoolIds:[1]},{posts:[]},[{id:1,mediaAltText:[p.alt]}]),/equivalente/));
test('high risk requires sources',()=>assert.throws(()=>validate({...p,sources:[{url:'https://a',independentOrganization:'one'}]}),/organizações/));
test('registry changed by another writer prevents PATCH',async()=>{
  let patches=0;
  const drive=new DriveRegistry({request:async options=>{if(options.method==='PATCH') patches++;return {data:options.url.includes('alt=media')?{posts:[],events:[]}:{version:'2'}};}});
  await assert.rejects(drive.save({meta:{version:'1'},data:{posts:[],events:[]}},{posts:[],events:[]}),/Concorrência/);
  assert.equal(patches,0);
});
async function exercise({archiveMismatch=false,id=123,publicUrl='https://www.instagram.com/stories/aconteceja/123'}={}) {
 const directory=await mkdtemp(path.join(os.tmpdir(),'aconteceja-rest-'));
 const mediaPath=path.join(directory,'story.jpg');
 const bytes=await sharp({create:{width:1080,height:1920,channels:3,background:'white'}}).jpeg().toBuffer();
 await writeFile(mediaPath,bytes);
 let snapshot={meta:{version:'1'},data:{posts:[],events:[]}},calls=0,listCalls=0;
 const drive={read:async()=>structuredClone(snapshot),archive:async()=>({id:'archive'}),
 request:async()=>({data:archiveMismatch?Buffer.from('wrong'):bytes}),
 save:async(expected,data)=>{assert.deepEqual(expected,snapshot);snapshot={meta:{version:String(Number(snapshot.meta.version)+1)},data:structuredClone(data)};return structuredClone(snapshot);}};
 const metricool={list:async()=>++listCalls<=2?[]:[{id,providers:[{network:'instagram',status:'PUBLISHED',publicUrl}]}],create:async()=>{calls++;return {id};}};
 try {
  let error,result;
  try {result=await run({...p,mediaPath,publicationDate:new Date(Date.now()+600000).toISOString().replace('Z','+00:00')},{drive,metricool,materialize:async()=> 'https://media.example/story.jpg',wait:async()=>{}});} catch(e){error=e;}
  return {error,result,calls,snapshot};
 } finally {await rm(directory,{recursive:true,force:true});}
}
test('REST archive byte mismatch blocks before any publication call',async()=>{
 const r=await exercise({archiveMismatch:true});assert.match(r.error.message,/Drive difere/);assert.equal(r.calls,0);
});
test('REST rejects a false ID and cannot declare PUBLISHED without URL',async()=>{
 const invalid=await exercise({id:false});assert.equal(invalid.snapshot.data.posts[0].state,'UNKNOWN');
 const missing=await exercise({publicUrl:null});assert.match(missing.error.message,/URL pública/);assert.equal(missing.snapshot.data.posts[0].state,'SCHEDULED');
});
test('REST confirms only matching ID, Instagram status and URL and preserves archived hash',async()=>{
 const r=await exercise();assert.equal(r.error,undefined);assert.equal(r.result.state,'PUBLISHED');assert.equal(r.result.metricool_id,123);
 assert.equal(r.snapshot.data.posts[0].publication_evidence.metricool_id,123);
 assert.equal(r.snapshot.data.posts[0].media[0].sha256,r.snapshot.data.posts[0].media[0].archiveReadbackSha);
 assert.equal(r.snapshot.data.posts[0].manifest.title,p.title);assert.equal(r.calls,1);
});

