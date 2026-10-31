// Run against the built local Next app with synthetic browser responses only.
// Requires Playwright and a Chromium executable; never uses real CRM accounts.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {demoState} from '../lib/demo';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PEYVAND_PLAYWRIGHT_MODULE||(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright':'playwright'));
const executablePath=process.env.PEYVAND_CHROMIUM_EXECUTABLE;
if(!executablePath)throw new Error('Set PEYVAND_CHROMIUM_EXECUTABLE to a local Chromium binary.');
const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=(probe.address() as {port:number}).port;await new Promise<void>(r=>probe.close(()=>r()));
const base='http://127.0.0.1:'+port,dir=process.env.PEYVAND_QA_DIR||'/tmp/peyvand-navigation-qa';await mkdir(dir,{recursive:true});
const app=spawn(process.execPath,[resolve('node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(port)],{env:{...process.env,SUPABASE_URL:'http://127.0.0.1:9',SUPABASE_ANON_KEY:'synthetic-only',APP_URL:base},stdio:['ignore','pipe','pipe']});let logs='';app.stdout?.on('data',c=>logs+=c);app.stderr?.on('data',c=>logs+=c);
let browser:any;const errors:string[]=[],writes:string[]=[];
async function fixture(role:'admin'|'viewer'='admin',mobile=false){
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1050}});
 const state={...demoState(),role,platformAdmin:role==='admin',canDelete:role==='admin'};
 const page=await context.newPage();page.on('pageerror',(e:Error)=>errors.push(e.message));
 await page.route('**/api/**',async(route:any)=>{const req=route.request(),path=new URL(req.url()).pathname;let data:unknown;
  if(req.method()!=='GET'){writes.push(path);return route.fulfill({status:409,json:{error:'Browser test must not mutate data'}});}
  if(path==='/api/auth')data={configured:true,authenticated:true};
  else if(path==='/api/crm')data=state;
  else if(path==='/api/profile')data={name:'مدیر آزمایشی',username:'test'};
  else if(path==='/api/admin')data={users:[]};
  else if(['/api/activity-log','/api/trash','/api/returns','/api/samples'].includes(path))data={rows:[]};
  else throw new Error('Unexpected API '+path);
  await route.fulfill({json:data});
 });
 await page.goto(base);await page.getByRole('heading',{name:'داشبورد و گزارش‌ها',exact:true}).waitFor();
 return {page,context,state};
}
try{
 for(let i=0;i<150;i++){try{if((await fetch(base)).ok)break;}catch{}if(app.exitCode!==null)throw Error(logs);await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote']});
 const {page,context}=await fixture();const sidebar=page.locator('[data-slot="sidebar-content"]');
 for(const label of ['اشخاص','اتوماسیون فروش','گزارش فروش','انبارداری','دسترسی کاربران آنلاین'])assert.equal(await sidebar.getByRole('button',{name:label,exact:true}).count(),0,label);
 await page.getByRole('navigation',{name:'بخش‌های داشبورد'}).getByRole('button',{name:'گزارش فروش',exact:true}).click();await page.getByText('گزارش جزئیات فرصت‌ها',{exact:false}).waitFor();assert.equal(await sidebar.getByRole('button',{name:'داشبورد',exact:true}).getAttribute('data-active'),'true');
 await sidebar.getByRole('button',{name:'کالا و خدمات فنی',exact:true}).click();await sidebar.getByRole('button',{name:'محصولات و انبار',exact:true}).click();
 const stockNav=page.getByRole('navigation',{name:'بخش‌های محصولات و انبار'});await stockNav.getByRole('button',{name:'موجودی و گردش انبار',exact:true}).click();await page.getByRole('tab',{name:'موجودی کالاها',exact:true}).waitFor();
 assert.equal(await sidebar.getByRole('button',{name:'محصولات و انبار',exact:true}).getAttribute('data-active'),'true');
 await stockNav.getByRole('button',{name:'فهرست محصولات',exact:true}).click();await page.getByRole('button',{name:'محصول جدید',exact:true}).click();await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'انصراف',exact:true}).click();
 await page.screenshot({path:dir+'/products-desktop.png',fullPage:true});
 await sidebar.getByRole('button',{name:'داشبورد',exact:true}).click();await page.getByRole('button',{name:/نیاز به تأمین کالا/}).click();assert.match(await page.getByRole('combobox',{name:'فیلتر وضعیت',exact:true}).innerText(),/نیاز به تأمین/);
 await sidebar.getByRole('button',{name:'تنظیمات',exact:true}).click();const settings=page.getByRole('navigation',{name:'بخش‌های تنظیمات'});await page.getByRole('heading',{name:'حساب من',exact:true}).waitFor();
 await settings.getByRole('button',{name:'اعضای تیم',exact:true}).click();await page.getByRole('heading',{name:'اعضای تیم',exact:true}).waitFor();
 await settings.getByRole('button',{name:'پشتیبان و انتقال',exact:true}).click();await page.getByRole('button',{name:'ذخیره پشتیبان JSON',exact:true}).waitFor();assert.equal(await page.locator('input[aria-label="انتخاب نسخه اطلاعات و سوابق"]').count(),1);
 await settings.getByRole('button',{name:'اتوماسیون فروش',exact:true}).click();await page.getByRole('button',{name:'قانون جدید',exact:true}).click();await page.getByRole('dialog').waitFor();await page.getByRole('combobox',{name:'محرک قانون',exact:true}).waitFor();await page.getByRole('button',{name:'انصراف',exact:true}).click();
 await settings.getByRole('button',{name:'گزارش تغییرات',exact:true}).click();await page.getByRole('heading',{name:'گزارش تغییرات تیم',exact:true}).waitFor();
 await settings.getByRole('button',{name:'سطل بازیافت',exact:true}).click();await page.getByRole('heading',{name:'سطل بازیافت',exact:true}).waitFor();
 await settings.getByRole('button',{name:'دسترسی کاربران آنلاین',exact:true}).click();await page.getByRole('heading',{name:'مدیریت کاربران آنلاین',exact:true}).waitFor();
 await settings.getByRole('button',{name:'اعضای تیم',exact:true}).click();await page.screenshot({path:dir+'/settings-desktop.png',fullPage:true});
 for(const [group,labels] of [
  ['مشتریان و ارتباطات',['سرنخ‌ها','حساب‌ها','کانتکت‌ها']],
  ['فروش و پیگیری',['پایپ‌لاین فروش','پیش‌بینی فروش N+5','فعالیت‌ها']],
  ['کالا و خدمات فنی',['مواد برگشتی','نمونه‌ها و آزمون مشتری']],
  ['مالی',['پیش‌فاکتورها']],
 ] as [string,string[]][]){
  const toggle=sidebar.getByRole('button',{name:group,exact:true});if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();
  for(const label of labels){const button=label==='فعالیت‌ها'?sidebar.getByRole('button',{name:/^فعالیت‌ها/}):sidebar.getByRole('button',{name:label,exact:true});await button.click();await page.getByRole('heading',{name:label,exact:true}).first().waitFor();}
 }
 console.log('PASS desktop: all customer, sales, forecast, stock, returned-material, sample and proforma pages remain reachable');
 console.log('PASS desktop: merged navigation, reports, stock, creation dialogs, low-stock deep link and all settings tools reachable');
 await context.close();
 const viewer=await fixture('viewer');await viewer.page.locator('[data-slot="sidebar-content"]').getByRole('button',{name:'تنظیمات',exact:true}).click();const viewerSettings=viewer.page.getByRole('navigation',{name:'بخش‌های تنظیمات'});
 for(const label of ['گزارش تغییرات','سطل بازیافت','دسترسی کاربران آنلاین'])assert.equal(await viewerSettings.getByRole('button',{name:label,exact:true}).count(),0);
 await viewerSettings.getByRole('button',{name:'اتوماسیون فروش',exact:true}).click();assert.equal(await viewer.page.getByRole('button',{name:'قانون جدید',exact:true}).count(),0);await viewer.context.close();console.log('PASS viewer: private settings and edit actions remain unavailable');
 const mobile=await fixture('admin',true);await mobile.page.getByRole('button',{name:'نمایش فهرست',exact:true}).click();await mobile.page.getByRole('button',{name:'کالا و خدمات فنی',exact:true}).click();await mobile.page.getByRole('button',{name:'محصولات و انبار',exact:true}).click();await mobile.page.getByRole('heading',{name:'محصولات و انبار',exact:true}).waitFor();await mobile.page.getByRole('dialog').waitFor({state:'hidden'});
 await mobile.page.getByRole('navigation',{name:'بخش‌های محصولات و انبار'}).getByRole('button',{name:'موجودی و گردش انبار',exact:true}).click();await mobile.page.getByRole('tab',{name:'موجودی کالاها',exact:true}).waitFor();
 assert.ok(await mobile.page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'mobile page must not overflow horizontally');
 await mobile.page.screenshot({path:dir+'/stock-mobile.png',fullPage:true});await mobile.context.close();console.log('PASS mobile: merged stock workspace, automatic drawer close and no page overflow');
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);console.log('PASS no browser exceptions and no data mutations');
}finally{await browser?.close();app.kill('SIGTERM');}
