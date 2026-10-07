import test from 'node:test';
import assert from 'node:assert/strict';
import { identity, validate, assertNovel, DriveRegistry } from '../src/services/production.js';
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
