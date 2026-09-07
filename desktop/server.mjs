import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {timingSafeEqual} from 'node:crypto';
import {StoreError} from './store.mjs';
import {proformaHtml} from '../lib/proforma.ts';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.ico':'image/x-icon'};
export async function startServer({store,ui,token}){
 let origin='';
 const server=createServer(async(req,res)=>{
  function json(value,status=200){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  try{
   if(req.headers.host!==new URL(origin).host)throw new StoreError('مبدأ درخواست معتبر نیست.',403);
   const supplied=(req.headers.cookie||'').split(';').map(c=>c.trim()).find(c=>c.startsWith('peyvand_desktop='))?.slice('peyvand_desktop='.length)||'';
   const a=Buffer.from(supplied),b=Buffer.from(token);if(a.length!==b.length||!timingSafeEqual(a,b))throw new StoreError('دسترسی فقط از پنجره برنامه مجاز است.',401);
   const url=new URL(req.url,origin);
   if(req.method==='GET'&&url.pathname==='/api/auth')return json({configured:true,authenticated:true,desktop:true});
   if(req.method==='GET'&&url.pathname==='/api/crm')return json(store.state());
   if(req.method==='GET'&&url.pathname.startsWith('/print/proforma/')){
    const state=store.state(),id=url.pathname.split('/').pop(),record=state.records.find(r=>r.id===id&&r.kind==='proformas');
    if(!record)throw new StoreError('پیش‌فاکتور پیدا نشد.',404);
    res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; font-src 'self'; frame-ancestors 'none'");
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(proformaHtml(record,state.records,state.org?.name||'پیوند'));return;
   }
   if(req.method==='POST'&&url.pathname==='/api/crm'){
    if(req.headers.origin!==origin)throw new StoreError('مبدأ درخواست معتبر نیست.',403);
    if(!req.headers['content-type']?.startsWith('application/json'))throw new StoreError('فرمت درخواست معتبر نیست.',415);
    const chunks=[];let total=0;for await(const chunk of req){total+=chunk.length;if(total>65536)throw new StoreError('درخواست بیش از حد بزرگ است.',413);chunks.push(chunk);}
    let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new StoreError('درخواست معتبر نیست.');}
    if(!body||typeof body!=='object')throw new StoreError('درخواست معتبر نیست.');
    if(body.action==='workspace')store.createWorkspace(body.name);
    else if(body.action==='save')store.save(body);
    else if(body.action==='delete')store.delete(body);
    else if(body.action==='inventory')store.inventory(body);
    else if(body.action==='automations')store.runAutomations();
    else throw new StoreError('این عملیات در نسخه تک‌کاربره وجود ندارد.');
    return json({ok:true});
   }
   if(url.pathname.startsWith('/api/'))throw new StoreError('مسیر در دسترس نیست.',404);
   if(req.method!=='GET'&&req.method!=='HEAD')throw new StoreError('روش درخواست مجاز نیست.',405);
   const pathname=decodeURIComponent(url.pathname);const root=resolve(ui);const file=resolve(root,pathname==='/'?'index.html':'.'+pathname);
   if(!file.startsWith(root+sep))throw new StoreError('مسیر معتبر نیست.',403);
   const ext=extname(file);if(!types[ext])throw new StoreError('فایل در دسترس نیست.',404);
   let data;try{data=await readFile(file);}catch{throw new StoreError('فایل یافت نشد.',404);}
   res.writeHead(200,{'Content-Type':types[ext],'Cache-Control':ext==='.html'?'no-store':'private, max-age=3600'});res.end(req.method==='HEAD'?undefined:data);
  }catch(e){if(!res.headersSent)json({error:e instanceof StoreError?e.message:'خطا در ذخیره یا خواندن اطلاعات.'},e instanceof StoreError?e.status:500);else res.end();}
 });
 server.requestTimeout=20000;server.headersTimeout=10000;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 origin=`http://127.0.0.1:${server.address().port}`;
 return {origin,close:()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);})};
}
