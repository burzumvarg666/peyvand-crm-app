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
 const uid=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
 const customers=['بهمن موتور','سایپا','مدیران خودرو'];
 for(let i=0;i<3;i++)state.records.push({id:uid(700+i),org_id:state.org.id,kind:'companies',parent_id:null,created_at:stamp,updated_at:stamp,version:1,data:{...blank(),name:customers[i]}});
 for(let i=0;i<27;i++){
  const names=['پرایمر سفید بدنه','تینر رنگ پلی‌اورتان','افزودنی رنگ الکتروفورتیک','کیلر بدنه خودرو','هاردنر پلی‌اورتان','رنگ مشکی مات'];const name=names[i%names.length]+' '+String(i+1),quantity=(i+2)*100,material=['CED','TC','PU'][i%3];
  state.records.push({id:uid(5000+i),org_id:state.org.id,kind:'products',parent_id:null,created_at:stamp,updated_at:stamp,version:1,data:{...blank(),name}});
  state.records.push({id:uid(900+i),org_id:state.org.id,kind:'forecasts',parent_id:uid(700+i%3),created_at:stamp,updated_at:stamp,version:1,data:{...blank(),name:customers[i%3]+' · '+name,forecast_product_id:uid(5000+i),forecast_material:material,category:['Primer','Thinner','Additive'][i%3],forecast_months:[{month:'2026-11',quantity,amount:null,basis:i%3?'forecast':'otm',production:1000+i*10,consumption:.135,actual_quantity:i%5===0?null:i%5===1?quantity*.65:i%5===2?quantity:i%5===3?quantity*1.2:0},{month:'2026-12',quantity:quantity*1.1,amount:null}]}});
 }
 let rejectNext=false;
 const page=await context.newPage();page.on('pageerror',(e:Error)=>errors.push(e.message));
 await page.route('**/api/**',async(route:any)=>{const req=route.request(),path=new URL(req.url()).pathname;let data:unknown;
  if(req.method()!=='GET'){
   const input=req.postDataJSON();assert.equal(path,'/api/crm');assert.equal(input.action,'save');assert.equal(input.kind,'forecasts');assert.equal(role,'admin');
   if(rejectNext){rejectNext=false;return route.fulfill({status:409,json:{error:'این رکورد تغییر کرده است. دوباره تلاش کنید.'}});}
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
 return {page,context,state,rejectNext:()=>{rejectNext=true;}};
}
try{
 for(let i=0;i<150;i++){try{if((await fetch(base)).ok)break;}catch{}if(app.exitCode!==null)throw Error(logs);await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote']});
 async function openForecast(page:any,mobile=false){if(mobile)await page.getByRole('button',{name:'نمایش فهرست',exact:true}).click();await page.getByRole('button',{name:'فروش و پیگیری',exact:true}).click();await page.getByRole('button',{name:'پیش‌بینی فروش N+5',exact:true}).click();await page.locator('#forecast-base').fill('2026-11');}
 const fixtureAdmin=await fixture();const {page,context,state}=fixtureAdmin;await openForecast(page);
 const region=page.getByRole('region',{name:'جدول پویای فورکست'}),search=page.getByRole('textbox',{name:'جست‌وجوی فورکست',exact:true});
 await search.fill('مقایسه آزمایشی');
 const actualButton=()=>region.getByRole('button',{name:'ویرایش ارسال واقعی مقایسه آزمایشی',exact:true});
 const input=()=>page.getByRole('textbox',{name:'ارسال واقعی کیلوگرم',exact:true});
 await actualButton().click();assert.equal(await input().inputValue(),'');await input().fill('80');
 await page.getByRole('button',{name:'ذخیره',exact:true}).click();await input().waitFor({state:'hidden'});
 const saved=()=>state.records.find(r=>r.id==='00000000-0000-4000-8000-000000000888')!;
 assert.equal(saved().data.forecast_months[0].actual_quantity,80);assert.match(await region.innerText(),/20 کسری/);assert.match(await region.innerText(),/80%/);
 await actualButton().click();await input().fill('0');await page.getByRole('button',{name:'ذخیره',exact:true}).click();await input().waitFor({state:'hidden'});assert.match(await region.innerText(),/100 کسری/);
 await actualButton().click();await input().fill('');await page.getByRole('button',{name:'ذخیره',exact:true}).click();await input().waitFor({state:'hidden'});assert.equal(saved().data.forecast_months[0].actual_quantity,null);
 await actualButton().click();await input().fill('999');await input().press('Escape');await input().waitFor({state:'hidden'});assert.equal(saved().data.forecast_months[0].actual_quantity,null);
 fixtureAdmin.rejectNext();await actualButton().click();await input().fill('75');await page.getByRole('button',{name:'ذخیره',exact:true}).click();await page.getByText('ذخیره نشد؛ پیام خطا را بررسی کنید.',{exact:true}).waitFor();assert.equal(saved().data.forecast_months[0].actual_quantity,null);await page.getByRole('button',{name:'انصراف',exact:true}).click();await input().waitFor({state:'hidden'});
 await region.getByRole('button',{name:'ویرایش مقدار برنامه مقایسه آزمایشی',exact:true}).click();const planInput=page.getByRole('textbox',{name:'مقدار برنامه کیلوگرم',exact:true});await planInput.fill('120');await page.getByRole('button',{name:'ذخیره',exact:true}).click();await planInput.waitFor({state:'hidden'});assert.equal(saved().data.forecast_months[0].quantity,120);assert.equal(saved().data.forecast_months[0].basis,'otm');assert.equal(saved().data.forecast_months[0].production,1000);
 await actualButton().click();await input().fill('50');await page.locator('#forecast-base').fill('2026-12');await input().waitFor({state:'hidden'});assert.equal(saved().data.forecast_months[0].actual_quantity,null);await page.locator('#forecast-base').fill('2026-11');
 await region.getByRole('button',{name:'جزئیات مقایسه آزمایشی',exact:true}).click();await page.getByRole('button',{name:'ویرایش برنامه',exact:true}).click();await page.getByRole('dialog').waitFor();assert.equal(await page.getByRole('combobox',{name:'2026-11 نوع مبنا',exact:true}).inputValue(),'otm');await page.getByText('فرض‌های محاسبه و توضیحات',{exact:true}).click();assert.equal(await page.getByRole('textbox',{name:'2026-11 تولید مشتری',exact:true}).inputValue(),'1,000');await page.getByRole('button',{name:'انصراف',exact:true}).click();
 await search.fill('');await page.getByRole('button',{name:/^کسری ارسال/}).click();assert.equal(await region.locator('tbody>tr[data-forecast-row]').count(),11);assert.match(await region.innerText(),/کسری/);
 await page.getByRole('button',{name:/^همه مواد/}).click();await page.getByRole('button',{name:'برنامه (kg)',exact:true}).click();assert.equal(await region.locator('tbody>tr[data-forecast-row]').first().getAttribute('data-forecast-row'),'00000000-0000-4000-8000-000000000888');await page.getByRole('button',{name:'برنامه (kg)',exact:true}).click();assert.equal(await region.locator('tbody>tr[data-forecast-row]').first().getAttribute('data-forecast-row'),'00000000-0000-4000-8000-000000000926');
 await page.getByRole('button',{name:'صفحه بعد فورکست',exact:true}).click();assert.equal(await region.locator('tbody>tr[data-forecast-row]').count(),13);await page.getByRole('button',{name:'صفحه قبل فورکست',exact:true}).click();
 await page.getByRole('combobox',{name:'گروه مواد فورکست',exact:true}).click();await page.getByRole('option',{name:'CED',exact:true}).click();await region.locator('tbody>tr[data-forecast-row]').first().waitFor();assert.equal(await region.locator('tbody>tr[data-forecast-row]').count(),10);await page.getByRole('button',{name:'حذف فیلترها',exact:true}).click();
 await page.getByRole('button',{name:'ستون‌های محاسبه',exact:true}).click();await region.getByRole('columnheader',{name:'تولید (Prod)',exact:true}).waitFor();await page.getByRole('button',{name:'ستون‌های محاسبه',exact:true}).click();
 await page.getByRole('button',{name:'مشتری',exact:true}).click();
 await page.addStyleTag({content:'[data-sonner-toaster]{visibility:hidden}'});await page.screenshot({path:dir+'/forecast-redesign-desktop.png',fullPage:true});await region.getByRole('button',{name:/جزئیات بهمن موتور/}).first().click();await page.getByRole('heading',{name:'روند این ماده در ۶ ماه',exact:true}).waitFor();await page.screenshot({path:dir+'/forecast-redesign-details.png',fullPage:true});await context.close();
 const viewer=await fixture('viewer');await openForecast(viewer.page);assert.equal(await viewer.page.getByRole('button',{name:/ویرایش ارسال واقعی/}).count(),0);assert.equal(await viewer.page.getByRole('button',{name:'برنامه جدید',exact:true}).count(),0);await viewer.context.close();
 const mobile=await fixture('admin',true);await openForecast(mobile.page,true);await mobile.page.getByRole('dialog').waitFor({state:'hidden'});await mobile.page.locator('#forecast-base').blur();await mobile.page.addStyleTag({content:'[data-sonner-toaster]{visibility:hidden}'});assert.ok(await mobile.page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));await mobile.page.screenshot({path:dir+'/forecast-redesign-mobile.png',fullPage:true});await mobile.context.close();
 assert.deepEqual(errors,[]);assert.equal(writes.length,4);console.log('PASS grid: inline save/zero/clear/cancel/conflict, month isolation, retained drivers, filters, sort, pagination, viewer and mobile');

}finally{await browser?.close();app.kill('SIGTERM');}
