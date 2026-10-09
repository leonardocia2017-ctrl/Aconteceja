import test from 'node:test';
import assert from 'node:assert/strict';
import { DriveRegistry, createDriveClient } from '../src/services/production.js';

test('Drive requests support shared drives and preserve upload options', async () => {
  const calls=[];
  const drive=new DriveRegistry({request:async options=>{calls.push(options);return {data:{id:'archive'}};}});
  await drive.request('https://www.googleapis.com/drive/v3/files/registry?alt=media',{responseType:'arraybuffer'});
  await drive.archive(Buffer.from('jpg'),'probe.jpg','image/jpeg');
  assert.equal(calls.length,2);
  for (const call of calls) assert.equal(new URL(call.url).searchParams.get('supportsAllDrives'),'true');
  assert.equal(new URL(calls[0].url).searchParams.get('alt'),'media');
  assert.equal(calls[0].responseType,'arraybuffer');
  assert.equal(new URL(calls[1].url).searchParams.get('uploadType'),'multipart');
  assert.equal(calls[1].method,'POST');
  assert.ok(Buffer.isBuffer(calls[1].data));
});

test('user OAuth accepts an authorized_user credential and rejects invalid configuration', async () => {
  const previous=process.env.GOOGLE_DRIVE_OAUTH_CREDENTIALS;
  try {
    process.env.GOOGLE_DRIVE_OAUTH_CREDENTIALS=JSON.stringify({type:'authorized_user',client_id:'test-client',client_secret:'test-secret',refresh_token:'test-refresh'});
    const client=await createDriveClient();
    assert.equal(client.credentials.refresh_token,'test-refresh');
    process.env.GOOGLE_DRIVE_OAUTH_CREDENTIALS='invalid';
    await assert.rejects(createDriveClient(),/JSON válido/);
    process.env.GOOGLE_DRIVE_OAUTH_CREDENTIALS=JSON.stringify({type:'service_account'});
    await assert.rejects(createDriveClient(),/authorized_user/);
  } finally {
    if(previous===undefined) delete process.env.GOOGLE_DRIVE_OAUTH_CREDENTIALS;
    else process.env.GOOGLE_DRIVE_OAUTH_CREDENTIALS=previous;
  }
});
