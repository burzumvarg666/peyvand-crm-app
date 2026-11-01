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
import {blank} from '../lib/crm';
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
 const customer=state.records.find(r=>r.kind==='companies')!,product=state.records.find(r=>r.kind==='products')!,stamp=new Date().toISOString();
 state.records.push({id:'00000000-0000-4000-8000-000000000888',org_id:state.org.id,kind:'forecasts',parent_id:customer.id,created_at:stamp,updated_at:stamp,version:1,data:{...blank(),name:'مقایسه آزمایشی',forecast_product_id:product.id,forecast_material:'CED',category:'Primer',forecast_months:[{month:'2026-11',quantity:100,amount:null,basis:'otm',production:1000,consumption:.1,actual_quantity:null}]}});
 const page=await context.newPage();page.on('pageerror',(e:Error)=>errors.push(e.message));
 await page.route('**/api/**',async(route:any)=>{const req=route.request(),path=new URL(req.url()).pathname;let data:unknown;
  if(req.method()!=='GET'){
   const input=req.postDataJSON();assert.equal(path,'/api/crm');assert.equal(input.action,'save');assert.equal(input.kind,'forecasts');assert.equal(role,'admin');
   const index=state.records.findIndex(r=>r.id===input.id);assert.ok(index>=0);assert.equal(input.version,state.records[index].version);
   state.records[index]={...state.records[index],data:input.data,version:input.version+1};writes.push(path);return route.fulfill({json:{ok:true}});
  }
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
 async function openForecast(page:any,mobile=false){if(mobile)await page.getByRole('button',{name:'نمایش فهرست',exact:true}).click();await page.getByRole('button',{name:'فروش و پیگیری',exact:true}).click();await page.getByRole('button',{name:'پیش‌بینی فروش N+5',exact:true}).click();await page.locator('#forecast-base').fill('2026-11');}
 const {page,context,state}=await fixture();await openForecast(page);
 await page.screenshot({path:dir+'/forecast-plan-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'ارسال واقعی و اختلاف',exact:true}).click();
 const region=page.getByRole('region',{name:'جدول اختلاف ارسال ماهانه'});
 await region.getByRole('button',{name:'ثبت ارسال واقعی مقایسه آزمایشی',exact:true}).click();
 const input=page.getByRole('textbox',{name:'مقدار ارسال واقعی کیلوگرم',exact:true});assert.equal(await input.inputValue(),'');await input.fill('80');
 await page.getByRole('button',{name:'ذخیره ارسال واقعی',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
 assert.equal(state.records.find(r=>r.kind==='forecasts')!.data.forecast_months[0].actual_quantity,80);
 assert.match(await region.innerText(),/-20/);assert.match(await region.innerText(),/-20%/);
 await page.screenshot({path:dir+'/forecast-comparison-desktop.png',fullPage:true});
 await region.getByRole('button',{name:'ثبت ارسال واقعی مقایسه آزمایشی',exact:true}).click();await input.fill('0');await page.getByRole('button',{name:'ذخیره ارسال واقعی',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.match(await region.innerText(),/-100%/);
 await region.getByRole('button',{name:'ثبت ارسال واقعی مقایسه آزمایشی',exact:true}).click();await input.fill('');await page.getByRole('button',{name:'ذخیره ارسال واقعی',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(state.records.find(r=>r.kind==='forecasts')!.data.forecast_months[0].actual_quantity,null);
 await page.getByRole('button',{name:'برنامه و پیش‌بینی',exact:true}).click();await page.getByRole('button',{name:'ویرایش پیش‌بینی مقایسه آزمایشی',exact:true}).click();await page.getByRole('dialog').waitFor();assert.equal(await page.getByRole('combobox',{name:'2026-11 نوع مبنا',exact:true}).inputValue(),'otm');await page.getByText('تولید و ضریب مصرف',{exact:true}).first().click();assert.equal(await page.getByRole('textbox',{name:'2026-11 تولید مشتری',exact:true}).inputValue(),'1,000');await page.getByRole('button',{name:'انصراف',exact:true}).click();await context.close();
 const viewer=await fixture('viewer');await openForecast(viewer.page);await viewer.page.getByRole('button',{name:'ارسال واقعی و اختلاف',exact:true}).click();assert.equal(await viewer.page.getByRole('button',{name:/ثبت ارسال واقعی مقایسه آزمایشی/}).count(),0);await viewer.context.close();
 const mobile=await fixture('admin',true);await openForecast(mobile.page,true);await mobile.page.getByRole('button',{name:'ارسال واقعی و اختلاف',exact:true}).click();assert.ok(await mobile.page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));await mobile.page.screenshot({path:dir+'/forecast-comparison-mobile.png',fullPage:true});await mobile.context.close();
 assert.deepEqual(errors,[]);assert.equal(writes.length,3);console.log('PASS UI: save, zero, clear, OTM, source drivers, viewer and mobile without real data mutations');

}finally{await browser?.close();app.kill('SIGTERM');}
