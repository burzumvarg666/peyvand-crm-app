import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:3101';
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--port','3101','--hostname','127.0.0.1'],{stdio:['ignore','pipe','pipe'],env:{...process.env,SUPABASE_URL:'',SUPABASE_ANON_KEY:''}});
let output='';
try {
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Server did not start: '+output)),15000);child.stdout.on('data',d=>{output+=d.toString();if(output.includes('Ready')){clearTimeout(timer);resolve();}});child.stderr.on('data',d=>{output+=d.toString();});child.on('error',reject);child.on('exit',code=>{clearTimeout(timer);reject(new Error('Server exited: '+code+' '+output));});});
  const page=await fetch(base);assert.equal(page.status,200);const html=await page.text();assert.match(html,/<html[^>]*dir="rtl"/);assert.match(html,/پیوند/);assert.equal(page.headers.get('x-frame-options'),'DENY');
  const assets=[...html.matchAll(/(?:src|href)="([^" ]+\.(?:js|css)(?:\?[^" ]*)?)"/g)].map(m=>m[1]);for(const path of new Set(assets)){if(path.startsWith('/'))assert.equal((await fetch(base+path)).status,200,path);}
  const auth=await fetch(base+'/api/auth');assert.deepEqual(await auth.json(),{configured:false,authenticated:false});
  assert.equal((await fetch(base+'/api/crm')).status,401);
  assert.equal((await fetch(base+'/api/auth',{method:'POST',headers:{origin:'https://evil.example','content-type':'application/json'},body:'{}'})).status,403);
  assert.equal((await fetch(base+'/api/auth',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:'not json'})).status,400);
  assert.equal((await fetch(base+'/api/auth',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({action:'login',email:'invalid',password:'a'})})).status,400);
  assert.equal((await fetch(base+'/api/auth',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({content:'x'.repeat(70000)})})).status,413);
  assert.equal((await fetch(base+'/api/auth',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({action:'login',email:'test@example.com',password:'longpassword'})})).status,503);
  console.log('PASS: RTL page, all linked JS/CSS assets, security headers, disconnected status, unauthenticated CRM access rejection, CSRF rejection, malformed input, invalid credentials, request body limit, missing-backend response.');
} finally {child.kill('SIGTERM');}
