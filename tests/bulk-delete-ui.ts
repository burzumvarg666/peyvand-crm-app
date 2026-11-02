// Uses a disposable local Next server and synthetic API fixtures only.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {demoState} from '../lib/demo';
import {blank,type Data,type Kind,type Row} from '../lib/crm';
import {newSample,newRound,newItem,type SampleRow} from '../lib/samples';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PEYVAND_PLAYWRIGHT_MODULE||(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright':'playwright'));
const executablePath=process.env.PEYVAND_CHROMIUM_EXECUTABLE;
if(!executablePath)throw Error('Set PEYVAND_CHROMIUM_EXECUTABLE to a local Chromium executable.');
const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=(probe.address() as {port:number}).port;await new Promise<void>(r=>probe.close(()=>r()));
const base='http://127.0.0.1:'+port,dir=process.env.PEYVAND_QA_DIR||'/tmp/peyvand-bulk-qa';await mkdir(dir,{recursive:true});
const app=spawn(process.execPath,[resolve('node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(port)],{env:{...process.env,SUPABASE_URL:'http://127.0.0.1:9',SUPABASE_ANON_KEY:'synthetic-only',APP_URL:base},stdio:['ignore','pipe','pipe']});let logs='';app.stdout?.on('data',c=>logs+=c);app.stderr?.on('data',c=>logs+=c);
let browser:any;const errors:string[]=[];
const uid=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
async function fixture(role:'admin'|'sales'|'viewer'='admin',allowDelete=role==='admin',mobile=false){
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1050}}),page=await context.newPage();
 const state={...demoState(),role,canDelete:allowDelete,platformAdmin:false},stamp=new Date().toISOString();state.records=[];
 const row=(n:number,kind:Kind,name:string,parent_id:string|null=null,patch:Partial<Data>={})=>{const r:Row={id:uid(n),org_id:state.org.id,kind,parent_id,created_at:stamp,updated_at:stamp,version:1,data:{...blank(),name,...patch}};state.records.push(r);return r;};
 const company=row(1,'companies','حساب دارای سابقه'),alpha=row(2,'companies','شرکت آلفا'),beta=row(3,'companies','شرکت بتا');
 row(4,'companies','سرنخ آلفا',null,{status:'lead'});row(5,'companies','سرنخ بتا',null,{status:'lead'});
 row(10,'contacts','مخاطب آلفا');row(11,'contacts','مخاطب بتا');const contact=row(12,'contacts','مخاطب دارای سابقه',company.id);row(13,'notes','یادداشت مخاطب',contact.id,{description:'یادداشت محفوظ'});
 row(14,'notes','یادداشت حساب یک',company.id,{description:'متن یک'});row(15,'notes','یادداشت حساب دو',company.id,{description:'متن دو'});
 row(20,'deals','فرصت مرحله اول',company.id,{stage:'lead'});row(21,'deals','فرصت واجد شرایط',company.id,{stage:'qualified'});
 row(30,'activities','تماس آزمایشی',company.id,{status:'open',activity_type:'call'});row(31,'tasks','وظیفه قدیمی',company.id,{status:'open'});row(32,'activities','جلسه بسته',company.id,{status:'done',activity_type:'meeting'});
 row(40,'products','محصول قابل حذف یک',null,{status:'inactive',stock:0});row(41,'products','محصول قابل حذف دو',null,{status:'inactive',stock:0});const product=row(42,'products','محصول موجود',null,{status:'active',stock:20});
 row(43,'stock_movements','گردش محفوظ',product.id,{movement_type:'in',movement_quantity:20,stock_after:20});
 row(50,'proformas','پیش‌فاکتور یک',company.id);row(51,'proformas','پیش‌فاکتور دو',company.id);row(60,'automations','قانون یک');row(61,'automations','قانون دو');
 const returns=[70,71,72].map((n,i)=>({id:uid(n),org_id:state.org.id,customer_id:company.id,product_id:product.id,quantity:3,return_date:'2026-11-01',created_at:stamp,reason:'بررسی آزمایشی',reference:'REF-'+i,material_type:'paint',sor_number:'SOR-'+i,status:'pending',restocked:false,version:1,material_condition:'raw',batch_number:'B-'+i,thinner_batch:'',workflow:{stage:'pending',events:[]}}));
 const sample=newSample();sample.details.title={en:'Sample file',fa:''};sample.details.customer_name={en:'Sample file',fa:''};sample.rounds=['Customer Alpha','Customer Beta'].map((name,i)=>({...newRound(),id:uid(90+i),customer_name:name,dispatch_date:'2026-11-01',items:[{...newItem(),description:{en:'Paint '+i,fa:''},batch:'SB-'+i}]}));
 const samples:SampleRow[]=[{id:uid(80),version:1,data:sample}];
 const failures=new Set<string>(),writes:{path:string;body:any}[]=[];
 page.on('pageerror',(e:Error)=>errors.push(e.message));
 await page.route('**/api/**',async(route:any)=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  if(req.method()!=='GET'){
   const b=req.postDataJSON();writes.push({path,body:b});assert.ok(allowDelete&&role!=='viewer','unauthorized mutation');
   if(failures.has(b.id))return route.fulfill({status:409,json:{error:'رکورد تغییر کرده است. اطلاعات را تازه کنید.'}});
   if(path==='/api/crm'){
    assert.equal(b.action,'delete');const i=state.records.findIndex(r=>r.id===b.id);assert.ok(i>=0);const r=state.records[i];assert.equal(r.version,b.version);assert.notEqual(r.kind,'stock_movements');
    if(r.kind==='products'){assert.equal(r.data.stock,0);assert.equal(r.data.status,'inactive');r.data={...r.data,archived:true};r.version++;}
    else{assert.equal(state.records.some(c=>c.parent_id===r.id),false,'no cascading deletes');state.records.splice(i,1);}
   }else if(path==='/api/returns'){
    assert.equal(b.action,'delete');const i=returns.findIndex(r=>r.id===b.id);assert.ok(i>=0);assert.equal(returns[i].version,b.version);returns.splice(i,1);
   }else if(path==='/api/samples'){
    assert.equal(b.action,'delete_many');for(const selection of b.selections){const i=samples.findIndex(r=>r.id===selection.id);assert.ok(i>=0);assert.equal(samples[i].version,selection.version);const rest=samples[i].data.rounds.filter(r=>!selection.all&&!selection.round_ids.includes(r.id));if(rest.length){samples[i]={...samples[i],version:samples[i].version+1,data:{...samples[i].data,rounds:rest}};}else samples.splice(i,1);}
   }else throw Error('Unexpected mutation '+path);
   return route.fulfill({json:{ok:true}});
  }
  const data=path==='/api/auth'?{configured:true,authenticated:true}:path==='/api/crm'?state:path==='/api/profile'?{name:'مدیر آزمایشی',username:'test'}:path==='/api/returns'?{rows:returns}:path==='/api/samples'?{rows:samples}:path==='/api/admin'?{users:[]}:{rows:[]};
  await route.fulfill({json:data});
 });
 await page.goto(base);await page.getByRole('heading',{name:'داشبورد و گزارش‌ها',exact:true}).waitFor();
 return {page,context,state,returns,samples,failures,writes,company,alpha,beta};
}
async function navigate(page:any,group:string,label:string,mobile=false){
 if(mobile)await page.getByRole('button',{name:'نمایش فهرست',exact:true}).click();
 const nav=mobile?page:page.locator('[data-slot="sidebar-content"]'),toggle=nav.getByRole('button',{name:group,exact:true});
 if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();
 await nav.getByRole('button',{name:label==='فعالیت‌ها'?/^فعالیت‌ها/:label,exact:label!=='فعالیت‌ها'}).click();
 await page.getByRole('heading',{name:label,exact:true}).first().waitFor();
 if(mobile)await page.locator('[data-slot="sidebar"][data-mobile="true"]').waitFor({state:'hidden'});
}
async function openDelete(page:any,title:string){await page.getByRole('button',{name:'حذف انتخاب‌شده‌ها',exact:true}).click();const d=page.getByRole('dialog',{name:title,exact:true});await d.waitFor();return d;}
async function confirm(page:any,title:string,count:number){const d=await openDelete(page,title);await d.getByRole('button',{name:'حذف '+count.toLocaleString('fa-IR')+' مورد',exact:true}).click();await d.getByText(new RegExp('^'+count.toLocaleString('fa-IR')+' مورد حذف شد')).waitFor();await d.getByRole('button',{name:'بستن',exact:true}).click();await d.waitFor({state:'hidden'});}
try{
 for(let i=0;i<150;i++){try{if((await fetch(base)).ok)break;}catch{}if(app.exitCode!==null)throw Error(logs);await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote']});
 const f=await fixture(),{page,state}=f;
 await navigate(page,'مشتریان و ارتباطات','حساب‌ها');
 await page.getByRole('button',{name:/^حساب دارای سابقه/}).click();const sheet=page.locator('.dana-account-sheet');await sheet.waitFor();
 await sheet.getByRole('checkbox',{name:'انتخاب همه یادداشت‌ها',exact:true}).check();await confirm(page,'حذف گروهی یادداشت‌ها',2);assert.equal(state.records.filter(r=>r.kind==='notes'&&r.parent_id===uid(1)).length,0);await sheet.getByRole('button',{name:'Close',exact:true}).click();await sheet.waitFor({state:'hidden'});console.log('PASS nested account lists retain confirmation and result through parent updates');
 await page.getByRole('checkbox',{name:'انتخاب رکورد شرکت آلفا',exact:true}).check();await page.getByRole('checkbox',{name:'انتخاب رکورد شرکت بتا',exact:true}).check();await page.getByRole('textbox',{name:'جست‌وجو در اطلاعات',exact:true}).fill('شرکت آلفا');await confirm(page,'حذف گروهی مشتریان',1);assert.ok(state.records.some(r=>r.id===f.beta.id));assert.ok(!state.records.some(r=>r.id===f.alpha.id));
 await page.getByRole('textbox',{name:'جست‌وجو در اطلاعات',exact:true}).fill('');await page.getByRole('button',{name:'لغو انتخاب',exact:true}).click();await page.getByRole('checkbox',{name:'انتخاب همه رکوردهای فیلترشده',exact:true}).check();const blocked=await openDelete(page,'حذف گروهی مشتریان');await blocked.getByText('دارای سابقهٔ مرتبط است؛ ابتدا موارد مرتبط را بررسی کنید.',{exact:true}).waitFor();await blocked.getByRole('button',{name:'انصراف',exact:true}).click();assert.ok(state.records.some(r=>r.id===f.company.id));console.log('PASS filtering never deletes hidden selections; cancel and linked history preserved');
 await navigate(page,'مشتریان و ارتباطات','سرنخ‌ها');await page.getByRole('checkbox',{name:'انتخاب همه رکوردهای فیلترشده',exact:true}).check();await confirm(page,'حذف گروهی مشتریان',2);assert.equal(state.records.filter(r=>r.kind==='companies'&&r.data.status==='lead').length,0);
 await navigate(page,'مشتریان و ارتباطات','کانتکت‌ها');await page.getByRole('checkbox',{name:'انتخاب همه رکوردهای فیلترشده',exact:true}).check();await confirm(page,'حذف گروهی مخاطبان',2);assert.ok(state.records.some(r=>r.id===uid(12)));console.log('PASS leads and contacts support select-all and keep linked records');
 await navigate(page,'فروش و پیگیری','پایپ‌لاین فروش');await page.getByRole('checkbox',{name:'انتخاب مرحله ارزیابی‌شده',exact:true}).check();assert.equal(await page.getByRole('checkbox',{name:'انتخاب همه فرصت‌های فیلترشده',exact:true}).evaluate((e:HTMLInputElement)=>e.indeterminate),true);await confirm(page,'حذف گروهی فرصت‌های فروش',1);assert.ok(state.records.some(r=>r.id===uid(20)));console.log('PASS pipeline stage selection and indeterminate state');
 await navigate(page,'فروش و پیگیری','فعالیت‌ها');await page.getByRole('checkbox',{name:'انتخاب فعالیت‌های باز',exact:true}).check();let d=await openDelete(page,'حذف گروهی رکوردها');await d.getByRole('button',{name:'انصراف',exact:true}).click();assert.equal(state.records.filter(r=>['activities','tasks'].includes(r.kind)).length,3);f.failures.add(uid(31));d=await openDelete(page,'حذف گروهی رکوردها');await d.getByRole('button',{name:'حذف ۲ مورد',exact:true}).click();await d.getByText(/۱ مورد حذف شد.*۱ مورد تأیید نشد/).waitFor();await d.getByText('رکورد تغییر کرده است. اطلاعات را تازه کنید.',{exact:true}).waitFor();assert.ok(state.records.some(r=>r.id===uid(31)));await d.getByRole('button',{name:'بستن',exact:true}).click();console.log('PASS mixed activity/task deletion reports partial failure without losing the failed row');
 await navigate(page,'مالی','پیش‌فاکتورها');await page.getByRole('checkbox',{name:'انتخاب همه رکوردهای فیلترشده',exact:true}).check();await confirm(page,'حذف گروهی پیش‌فاکتورها',2);
 await page.locator('[data-slot="sidebar-content"]').getByRole('button',{name:'تنظیمات',exact:true}).click();await page.getByRole('navigation',{name:'بخش‌های تنظیمات'}).getByRole('button',{name:'اتوماسیون فروش',exact:true}).click();await page.getByRole('checkbox',{name:'انتخاب همه قوانین فیلترشده',exact:true}).check();await confirm(page,'حذف گروهی قوانین فروش',2);console.log('PASS proformas and automation cards');
 await navigate(page,'کالا و خدمات فنی','محصولات و انبار');await page.getByRole('navigation',{name:'بخش‌های محصولات و انبار'}).getByRole('button',{name:'موجودی و گردش انبار',exact:true}).click();await page.getByRole('checkbox',{name:'انتخاب همه محصولات انبار فیلترشده',exact:true}).check();await confirm(page,'حذف گروهی محصولات',2);assert.equal(state.records.find(r=>r.id===uid(42))?.data.stock,20);assert.equal(state.records.filter(r=>r.kind==='stock_movements').length,1);await page.getByRole('tab',{name:/گردش انبار/}).click();assert.equal(await page.getByRole('tabpanel').getByRole('checkbox').count(),0);console.log('PASS inventory uses product prerequisites and never deletes inventory documents');
 await navigate(page,'کالا و خدمات فنی','مواد برگشتی');await page.getByRole('checkbox',{name:'انتخاب همه برگشتی‌های فیلترشده',exact:true}).check();f.failures.add(uid(71));d=await openDelete(page,'حذف گروهی برگشتی‌ها');await d.getByRole('button',{name:'حذف ۳ مورد',exact:true}).click();await d.getByText(/۲ مورد حذف شد.*۱ مورد تأیید نشد/).waitFor();assert.equal(f.returns.length,1);assert.equal(f.returns[0].id,uid(71));await d.getByRole('button',{name:'بستن',exact:true}).click();assert.equal(state.records.filter(r=>r.kind==='stock_movements').length,1);console.log('PASS returns report per-item conflicts and leave stock history intact');
 await navigate(page,'کالا و خدمات فنی','نمونه‌ها و آزمون مشتری');await page.getByRole('textbox',{name:'جست‌وجوی نمونه‌ها',exact:true}).fill('Customer Alpha');await page.getByRole('checkbox',{name:'انتخاب همه رکوردهای نمایش‌داده‌شده',exact:true}).check();await page.getByRole('button',{name:'حذف انتخاب‌شده‌ها (1)',exact:true}).click();d=page.getByRole('dialog',{name:'حذف گروهی نمونه‌ها',exact:true});await d.getByRole('button',{name:'حذف ۱ مورد',exact:true}).click();await d.getByText('۱ مورد حذف شد.',{exact:true}).waitFor();assert.equal(f.samples.length,1);assert.equal(f.samples[0].data.rounds.length,1);assert.equal(f.samples[0].data.rounds[0].customer_name,'Customer Beta');await d.getByRole('button',{name:'بستن',exact:true}).click();console.log('PASS sample selection deletes only the filtered dispatch and preserves other dispatches in the same file');
 await page.screenshot({path:dir+'/samples-filtered.png',fullPage:true});await f.context.close();
 for(const role of ['viewer','sales'] as const){const restricted=await fixture(role,false);for(const [group,label] of [['مشتریان و ارتباطات','حساب‌ها'],['فروش و پیگیری','پایپ‌لاین فروش'],['فروش و پیگیری','فعالیت‌ها'],['کالا و خدمات فنی','محصولات و انبار'],['کالا و خدمات فنی','مواد برگشتی'],['کالا و خدمات فنی','نمونه‌ها و آزمون مشتری'],['مالی','پیش‌فاکتورها']]){await navigate(restricted.page,group,label);assert.equal(await restricted.page.locator('main input[type="checkbox"]').count(),0,role+' '+label);}assert.equal(restricted.writes.length,0);await restricted.context.close();}console.log('PASS viewer and sales users without delete permission have no selection controls');
 const sales=await fixture('sales',true);await navigate(sales.page,'مشتریان و ارتباطات','کانتکت‌ها');await sales.page.getByRole('checkbox',{name:'انتخاب رکورد مخاطب آلفا',exact:true}).check();await confirm(sales.page,'حذف گروهی مخاطبان',1);assert.equal(sales.writes.length,1);await sales.context.close();console.log('PASS authorized sales member can use bulk deletion');
 const mobile=await fixture('admin',true,true);await navigate(mobile.page,'فروش و پیگیری','فعالیت‌ها',true);assert.ok(await mobile.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'mobile activities overflow');await mobile.page.getByRole('checkbox',{name:'انتخاب همه فعالیت‌های فیلترشده',exact:true}).check();const dialog=await openDelete(mobile.page,'حذف گروهی رکوردها');await dialog.evaluate((el:HTMLElement)=>Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{}))));await mobile.page.screenshot({path:dir+'/bulk-delete-mobile.png',fullPage:false});await dialog.getByRole('button',{name:'انصراف',exact:true}).click();assert.equal(mobile.writes.length,0);await mobile.context.close();console.log('PASS mobile selection, confirmation and cancellation');
 assert.deepEqual(errors,[]);console.log('PASS all bulk-delete UI checks; all mutations used synthetic fixtures');
}finally{await browser?.close();app.kill('SIGTERM');}
