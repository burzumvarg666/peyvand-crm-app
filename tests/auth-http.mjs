// Exercises the real Next routes with an isolated local Supabase double.
// No real users are created and no real email is sent.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {resolve} from 'node:path';
const uid='11111111-1111-4111-8111-111111111111',org='22222222-2222-4222-8222-222222222222';
const user={id:uid,email:'member@example.com',email_confirmed_at:'2026-10-21T00:00:00Z'};
const authSession={user,access_token:'valid-access',refresh_token:'valid-refresh',expires_in:3600};
const calls=[],invites=new Map();let server,app,base,logs='';
before(async()=>{
 server=createServer(async(req,res)=>{
  const u=new URL(req.url,'http://mock'),chunks=[];for await(const c of req)chunks.push(c);const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{};
  calls.push({path:u.pathname,query:u.searchParams,body,method:req.method});
  const send=(d,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(d));};
  const auth=req.headers.authorization;
  if(u.pathname==='/auth/v1/signup')return body.email==='blocked@example.com'?send({code:'email_address_not_authorized'},403):send({id:uid,identities:[]});
  if(u.pathname==='/auth/v1/token'){
   if(u.searchParams.get('grant_type')==='refresh_token')return body.refresh_token==='valid-refresh'?send(authSession):send({code:'refresh_token_not_found'},400);
   return body.email==='member@example.com'&&body.password==='StrongPass12!'?send(authSession):send({code:'invalid_credentials'},400);
  }
  if(u.pathname==='/auth/v1/verify')return body.token_hash==='valid-hash'?send(authSession):send({code:'otp_expired'},403);
  if(u.pathname==='/auth/v1/user')return auth==='Bearer expired-access'?send({code:'bad_jwt'},403):auth?send(user):send({code:'bad_jwt'},401);
  if(['/auth/v1/resend','/auth/v1/recover','/auth/v1/logout'].includes(u.pathname))return send({});
  if(u.pathname==='/auth/v1/otp')return body.email==='blocked@example.com'?send({code:'email_address_not_authorized'},403):send({});
  if(['/rest/v1/rpc/crm_set_member_access','/rest/v1/rpc/crm_set_member_delete_permission'].includes(u.pathname))return send(null);
  if(u.pathname==='/rest/v1/crm_records'){if(req.method==='DELETE')return send([{id:'33333333-3333-4333-8333-333333333333'}]);if(u.searchParams.has('parent_id'))return send([]);return send([{id:'33333333-3333-4333-8333-333333333333',kind:'companies',data:{},version:1}]);}
  if(u.pathname==='/rest/v1/rpc/crm_import_with_samples')return send({imported:1});
  if(u.pathname==='/rest/v1/rpc/crm_recover_snapshot')return send({imported:1,audit_imported:2});
  if(u.pathname==='/rest/v1/rpc/crm_workspace_snapshot')return auth==='Bearer large-snapshot-access'?send({data:'x'.repeat(4_000_001)}):auth==='Bearer valid-access'?send({format:'peyvand-workspace-snapshot',schemaVersion:2,workspace:{id:org},records:[],members:[],audit:[]}):send({code:'42501'},403);
  if(u.pathname==='/rest/v1/rpc/crm_access_status')return send({allowed:true,platformAdmin:false});
  if(u.pathname==='/rest/v1/crm_members')return send(u.searchParams.has('email')?[]:[{org_id:org,role:auth==='Bearer viewer-access'?'viewer':(auth==='Bearer sales-access'||auth==='Bearer authorized-sales-access')?'sales':'admin',can_delete:auth==='Bearer authorized-sales-access'}]);
  if(u.pathname==='/rest/v1/crm_invites'){
   if(req.method==='POST'){invites.set(body.email,body);return send(null,201);}
   const email=u.searchParams.get('email')?.replace(/^eq\./,'');return send(email&&invites.has(email)?[{id:'invite-id',...invites.get(email)}]:[]);
  }
  return send({error:'Unexpected mock endpoint: '+u.pathname},500);
 });server.listen(0,'127.0.0.1');await once(server,'listening');
 const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(r=>probe.close(r));
 base='http://127.0.0.1:'+port;
 app=spawn(process.execPath,[resolve('node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(port)],{env:{...process.env,SUPABASE_URL:'http://127.0.0.1:'+server.address().port,SUPABASE_ANON_KEY:'test-anon-only',APP_URL:'https://public.example'},stdio:['ignore','pipe','pipe']});
 app.stdout.on('data',c=>logs+=c);app.stderr.on('data',c=>logs+=c);
 for(let i=0;i<150;i++){try{if((await fetch(base+'/api/auth')).ok)return;}catch{}if(app.exitCode!==null)throw Error(logs);await new Promise(r=>setTimeout(r,100));}throw Error('App startup failed: '+logs);
});
after(async()=>{app?.kill('SIGTERM');if(server)await new Promise(r=>server.close(r));});
function client(initial={}){
 const jar={...initial};return {jar,async call(path,input,origin=base){
  const r=await fetch(base+path,{method:input?'POST':'GET',headers:{...(input?{'Content-Type':'application/json',Origin:origin}:{}),Cookie:Object.entries(jar).map(([k,v])=>k+'='+v).join('; ')},body:input?JSON.stringify(input):undefined});
  const cookies=r.headers.getSetCookie();for(const c of cookies){const pair=c.split(';')[0],i=pair.indexOf('='),k=pair.slice(0,i),v=pair.slice(i+1);if(/max-age=0/i.test(c))delete jar[k];else jar[k]=v;}
  return {status:r.status,data:await r.json(),cookies};
 }};
}
test('signup validates repeats and full name before calling the provider; uses public redirect',async()=>{
 const c=client(),n=calls.length;
 const invalid=await c.call('/api/auth',{action:'signup',name:'Test User',email:'new@example.com',password:'StrongPass12!',password_confirmation:'different'});assert.equal(invalid.status,400);assert.equal(calls.length,n);
 const r=await c.call('/api/auth',{action:'signup',name:'Test User',email:'NEW@EXAMPLE.COM',password:'StrongPass12!',password_confirmation:'StrongPass12!'});assert.equal(r.status,200);assert.equal(r.data.confirmation,true);assert.equal(c.jar.peyvand_access,undefined);
 const upstream=calls.at(-1);assert.equal(upstream.body.email,'new@example.com');assert.equal(upstream.body.data.full_name,'Test User');assert.equal(upstream.query.get('redirect_to'),'https://public.example/');
});
test('provider email restriction is surfaced honestly, not as signup success',async()=>{
 const r=await client().call('/api/auth',{action:'signup',name:'Test User',email:'blocked@example.com',password:'StrongPass12!',password_confirmation:'StrongPass12!'});assert.equal(r.status,503);assert.equal(r.data.code,'email_address_not_authorized');
});
test('login creates HTTP-only session, rejects bad credentials and refreshes a 403 bad JWT',async()=>{
 const c=client();assert.equal((await c.call('/api/auth',{action:'login',email:'member@example.com',password:'wrong'})).status,401);
 const r=await c.call('/api/auth',{action:'login',email:'member@example.com',password:'StrongPass12!'});assert.equal(r.status,200);assert.ok(r.cookies.every(s=>s.includes('HttpOnly')&&s.includes('SameSite=lax')));assert.equal((await c.call('/api/auth')).data.authenticated,true);
 const expired=client({peyvand_access:'expired-access',peyvand_refresh:'valid-refresh'});assert.equal((await expired.call('/api/auth')).data.authenticated,true);assert.equal(expired.jar.peyvand_access,'valid-access');
 const invalid=client({peyvand_access:'expired-access',peyvand_refresh:'bad-refresh'});assert.equal((await invalid.call('/api/auth')).data.authenticated,false);assert.equal(invalid.jar.peyvand_refresh,undefined);
});
test('signup callback confirms session; expired links do not authenticate',async()=>{
 const c=client();assert.equal((await c.call('/api/auth',{action:'confirm',token_hash:'bad',type:'signup'})).status,400);assert.equal(c.jar.peyvand_access,undefined);
 assert.equal((await c.call('/api/auth',{action:'confirm',token_hash:'valid-hash',type:'signup'})).data.passwordSetup,false);assert.ok(c.jar.peyvand_access);
});
test('invite and recovery links require password setup, then logout after saving new password',async()=>{
 for(const type of ['invite','recovery']){
  const c=client();assert.equal((await c.call('/api/auth',{action:'confirm',refresh_token:'valid-refresh',type})).data.passwordSetup,true);
  assert.equal((await c.call('/api/auth')).data.passwordSetup,true);
  assert.equal((await c.call('/api/auth',{action:'set-password',password:'NewStrong12!',password_confirmation:'different'})).status,400);
  assert.equal((await c.call('/api/auth',{action:'set-password',password:'NewStrong12!',password_confirmation:'NewStrong12!'})).data.signInAgain,true);
  assert.equal(c.jar.peyvand_access,undefined);assert.equal(c.jar.peyvand_password_setup,undefined);
 }
 const c=client({peyvand_access:'valid-access'});assert.equal((await c.call('/api/auth',{action:'set-password',password:'NewStrong12!',password_confirmation:'NewStrong12!'})).status,401);
});
test('resend/recover use proper endpoints and server-controlled public redirects',async()=>{
 for(const action of ['resend','recover']){assert.equal((await client().call('/api/auth',{action,email:'member@example.com',redirect_to:'https://attacker.example'})).status,200);const call=calls.at(-1);assert.equal(new URL(call.query.get('redirect_to')).hostname,'public.example');assert.equal(call.path,action==='resend'?'/auth/v1/resend':'/auth/v1/recover');}
});
test('cross-origin requests cannot send auth mail or modify accounts',async()=>{
 const count=calls.length;assert.equal((await client().call('/api/auth',{action:'recover',email:'member@example.com'},'https://attacker.example')).status,403);assert.equal(calls.length,count);
});
test('admin invitation sends a one-time link, retries keep one invite and failures keep the record',async()=>{
 const c=client({peyvand_access:'valid-access'}),input={action:'invite',email:'invitee@example.com',role:'sales'};
 let r=await c.call('/api/crm',input);assert.equal(r.status,200);assert.equal(r.data.delivery,'requested');assert.ok(invites.has(input.email));assert.equal(calls.at(-1).path,'/auth/v1/otp');assert.equal(calls.at(-1).body.create_user,true);
 const size=invites.size;r=await c.call('/api/crm',input);assert.equal(invites.size,size);
 r=await c.call('/api/crm',{...input,email:'blocked@example.com'});assert.equal(r.data.delivery,'failed');assert.ok(invites.has('blocked@example.com'));assert.ok(r.data.warning.includes('SMTP'));assert.ok(r.data.join_url.includes('auth=signup'));
 const before=calls.filter(c=>c.path==='/auth/v1/otp').length;r=await client({peyvand_access:'viewer-access'}).call('/api/crm',input);assert.equal(r.status,403);assert.equal(calls.filter(c=>c.path==='/auth/v1/otp').length,before);
});

 test('backup import is restricted to workspace admins',async()=>{
  const before=calls.length;
  for(const access of ['sales-access','viewer-access']){const r=await client({peyvand_access:access}).call('/api/crm',{action:'import',backup:{format:'peyvand-online',schemaVersion:1,records:[]}});assert.equal(r.status,403);}
  assert.equal(calls.slice(before).filter(c=>c.path==='/rest/v1/rpc/crm_import_with_samples').length,0);
 });

test('only an admin can change a member role or access',async()=>{
 const input={action:'memberAccess',user_id:'33333333-3333-4333-8333-333333333333',role:'viewer',active:false};
 const before=calls.length;
 for(const access of ['sales-access','viewer-access'])assert.equal((await client({peyvand_access:access}).call('/api/crm',input)).status,403);
 assert.equal(calls.slice(before).filter(c=>c.path==='/rest/v1/rpc/crm_set_member_access').length,0);
 assert.equal((await client({peyvand_access:'valid-access'}).call('/api/crm',input)).status,200);
 assert.deepEqual(calls.at(-1).body,{target_user:input.user_id,new_role:'viewer',new_active:false});
});

test('delete permission can only be managed by admin and lets a sales member delete',async()=>{
 const user_id='33333333-3333-4333-8333-333333333333';const input={action:'memberDeletePermission',user_id,allow_delete:true};
 let count=calls.filter(c=>c.path==='/rest/v1/rpc/crm_set_member_delete_permission').length;
 for(const access of ['sales-access','viewer-access'])assert.equal((await client({peyvand_access:access}).call('/api/crm',input)).status,403);
 assert.equal(calls.filter(c=>c.path==='/rest/v1/rpc/crm_set_member_delete_permission').length,count);
 assert.equal((await client({peyvand_access:'valid-access'}).call('/api/crm',input)).status,200);
 assert.deepEqual(calls.at(-1).body,{target_user:user_id,allow_delete:true});
 assert.equal((await client({peyvand_access:'sales-access'}).call('/api/crm',{action:'delete',id:user_id,version:1})).status,403);
 assert.equal((await client({peyvand_access:'authorized-sales-access'}).call('/api/crm',{action:'delete',id:user_id,version:1})).status,200);
 assert.equal((await client({peyvand_access:'authorized-sales-access'}).call('/api/crm',{action:'import',backup:{}})).status,403);
});

test('workspace archive download is available only to administrators',async()=>{
 for(const access of ['sales-access','viewer-access'])assert.equal((await client({peyvand_access:access}).call('/api/backup')).status,403);
 const result=await client({peyvand_access:'valid-access'}).call('/api/backup');assert.equal(result.status,200);assert.equal(result.data.format,'peyvand-workspace-snapshot');
});

test('legacy backup accepts database timestamps with timezone offsets',async()=>{
 const timestamp='2026-10-30T16:08:15.011427+00:00';
 const input={action:'import',backup:{format:'peyvand-online',schemaVersion:1,exportedAt:timestamp,records:[{id:'33333333-3333-4333-8333-333333333333',kind:'companies',parent_id:null,data:{name:'Test',status:'active'},created_at:timestamp,updated_at:timestamp,version:1}]}};
 const result=await client({peyvand_access:'valid-access'}).call('/api/crm',input);assert.equal(result.status,200);assert.equal(result.data.imported,1);
});
test('workspace snapshot recovery only imports missing items for the same workspace and an admin',async()=>{
 const timestamp='2026-10-30T16:08:15.011427+00:00';
 const backup={format:'peyvand-workspace-snapshot',schemaVersion:2,exportedAt:timestamp,workspace:{id:org,name:'Test',created_at:timestamp},records:[{id:'33333333-3333-4333-8333-333333333333',org_id:org,kind:'companies',parent_id:null,data:{name:'Test',status:'active'},created_at:timestamp,updated_at:timestamp,version:1}],samples:[],returns:[],members:[],invites:[],audit:[{id:'55555555-5555-4555-8555-555555555555',org_id:org,record_id:'33333333-3333-4333-8333-333333333333',actor_id:null,action:'INSERT',label:'Test',created_at:timestamp}],membershipAudit:[],limitations:[]};
 const request={action:'recoverMissing',backup};const rpc=()=>calls.filter(c=>c.path==='/rest/v1/rpc/crm_recover_snapshot').length;
 const before=rpc();for(const access of ['sales-access','viewer-access'])assert.equal((await client({peyvand_access:access}).call('/api/crm',request)).status,403);assert.equal(rpc(),before);
 const admin=client({peyvand_access:'valid-access'});const foreign={...backup,workspace:{...backup.workspace,id:'44444444-4444-4444-8444-444444444444'}};
 assert.equal((await admin.call('/api/crm',{action:'recoverMissing',backup:foreign})).status,403);assert.equal(rpc(),before);
 assert.equal((await admin.call('/api/crm',{action:'recoverMissing',backup:{...backup,samples:'bad'}})).status,400);assert.equal(rpc(),before);
 const foreignAudit={...backup,audit:[{...backup.audit[0],org_id:'44444444-4444-4444-8444-444444444444'}]};assert.equal((await admin.call('/api/crm',{action:'recoverMissing',backup:foreignAudit})).status,403);assert.equal(rpc(),before);
 const result=await admin.call('/api/crm',request);assert.equal(result.status,200);assert.equal(result.data.imported,1);assert.equal(calls.at(-1).body.payload.format,'peyvand-workspace-snapshot');assert.equal(result.data.auditImported,2);
});

test('oversized workspace archive is rejected with a clear response',async()=>{
 const result=await client({peyvand_access:'large-snapshot-access'}).call('/api/backup');assert.equal(result.status,413);assert.match(result.data.error,/حجم/);
});
