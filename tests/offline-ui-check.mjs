import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {CRMStore} from '../desktop/store.mjs';
import {startServer} from '../desktop/server.mjs';
import {blank} from '../lib/crm.ts';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const store=new CRMStore(':memory:');store.createWorkspace('آزمون آفلاین');
const lead=store.save({kind:'companies',data:{...blank(),name:'سرنخ آزمایشی',status:'lead',industry:' اتوبوس‌سازی '},parent_id:null});
store.save({kind:'notes',data:{...blank(),name:'یادداشت',description:'حفظ سابقه'},parent_id:lead.id});
for(let i=0;i<25;i++)store.save({kind:'companies',data:{...blank(),name:'شرکت '+i,status:'lead',industry:'حوزه فعالیت با نام بلند برای بررسی اندازه فهرست '+i},parent_id:null});
const server=await startServer({store,ui:new URL('../desktop/ui',import.meta.url).pathname,token:'ui-test'});
const sparticuz=require('/workspace/scratch/ff4facf04219/browser-check/node_modules/@sparticuz/chromium');
const browser=await chromium.launch({headless:true,executablePath:'/tmp/chromium',args:sparticuz.args.filter(x=>x!=='--disable-web-security')});
try{
const page=await browser.newPage({viewport:{width:1280,height:720}});
await page.context().addCookies([{name:'peyvand_desktop',value:'ui-test',url:server.origin}]);
await page.goto(server.origin);
await page.getByRole('button',{name:'سرنخ‌ها',exact:true}).click();
await page.getByRole('combobox',{name:'فیلتر حوزه فعالیت'}).click();
const menu=page.getByRole('listbox');await menu.waitFor();
const box=await menu.boundingBox();assert(box.width<=260&&box.height<=322,JSON.stringify(box));
await page.getByRole('option',{name:'اتوبوس‌سازی',exact:true}).click();
assert.equal(await page.locator('tbody tr').count(),1);
await page.getByRole('button',{name:/سرنخ آزمایشی/}).first().click();
await page.getByRole('button',{name:'تبدیل به مشتری',exact:true}).click();
await page.getByRole('button',{name:'انصراف',exact:true}).click();
assert.equal(store.records().find(r=>r.id===lead.id).data.status,'lead');
await page.getByRole('button',{name:'تبدیل به مشتری',exact:true}).click();
await page.getByRole('button',{name:'تأیید تبدیل',exact:true}).click();
await page.getByRole('dialog').waitFor({state:'hidden'});
assert.equal(store.records().find(r=>r.id===lead.id).data.status,'active');
assert.equal(store.records().filter(r=>r.parent_id===lead.id).length,1);
await page.reload();await page.getByRole('button',{name:'حساب‌ها',exact:true}).click();
await page.getByRole('button',{name:/سرنخ آزمایشی/}).first().waitFor();
await page.getByRole('button',{name:/سرنخ آزمایشی/}).first().click();
for(const width of [1280,900,710,480]){await page.setViewportSize({width,height:900});const dialog=page.getByRole('dialog');const geometry=await dialog.evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));assert(geometry.scroll<=geometry.width+1,JSON.stringify({width,...geometry}));await page.screenshot({path:'/workspace/scratch/ff4facf04219/account-060-'+width+'.png'});}
console.log('PASS: bounded dropdown, trimmed industry matching, cancel, conversion, preserved note, account after reload');
}finally{await browser.close();await server.close();store.close();}
