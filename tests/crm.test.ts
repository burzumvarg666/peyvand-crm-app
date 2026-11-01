import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dataSchema, summary, exportCsv, csvCell } from '../lib/crm';
import { buildWorkbook } from '../lib/exports';
import { demoState } from '../lib/demo';
import {personalFollowups} from '../lib/personal-followups';
test('pipeline excludes closed deals, revenue is won only, win rate uses closed deals', () => { const data = demoState(); const s = summary(data.records); assert.equal(s.pipeline, 760000000); assert.equal(s.revenue, 260000000); assert.equal(s.rate, 50); assert.equal(s.openTasks, 3); assert.equal(s.customers, 4); });
test('empty organization produces zero finite totals', () => { assert.deepEqual(summary([]), { customers: 0, pipeline: 0, revenue: 0, rate: 0, openTasks: 0 }); });
test('CSV neutralizes formula injection and preserves quotes and line breaks', () => { for (const s of ['=SUM(A1:A2)', ' +cmd', '\t@evil', '-2+3'])
    assert.ok(csvCell(s).startsWith('"\'')); assert.equal(csvCell('a"b\nc'), '"a""b\nc"'); const csv = exportCsv(demoState().records); assert.ok(csv.startsWith('\ufeff')); assert.ok(csv.includes('مبلغ (تومان)')); });
test('input rejects negative money, invalid calendar dates and unknown payload fields', () => { for (const input of [{ name: 'test', amount: -1 }, { name: 'test', due: '2026-02-31' }, { name: 'test', stage: 'bad' }, { name: 'test', admin: true }, { name: '  ' }])
    assert.equal(dataSchema.safeParse(input).success, false); assert.equal(dataSchema.safeParse({ name: 'شرکت', due: '2026-02-28' }).success, true); });
test('demo relationship graph is internal and isolated between sessions', () => { const a = demoState(), b = demoState(); for (const r of a.records)
    if (r.parent_id)
        assert.ok(a.records.some(p => p.id === r.parent_id)); assert.notEqual(a.records[0].id, b.records[0].id); });

test('activity fields validate and Excel export excludes internal IDs', () => {
  const state=demoState();
  const activityData=dataSchema.parse({name:'جلسه مشتری',status:'open',activity_type:'meeting',activity_direction:'outbound',activity_time:'10:30',activity_end_time:'11:15',activity_location:'دفتر مشتری',activity_result:'نیاز به پیش‌فاکتور'});
  assert.equal(activityData.activity_type,'meeting');
  assert.equal(dataSchema.safeParse({...activityData,activity_end_time:'09:00'}).success,true);
  const sample={...state.records[0],kind:'activities' as const,data:activityData,parent_id:state.records.find(r=>r.kind==='companies')?.id||null};
  const wb=buildWorkbook([sample],state.records);
  const sheet=wb.worksheets[0];
  const headers=(sheet.getRow(1).values as unknown[]).slice(2).map(String);
  assert.ok(headers.includes('نوع فعالیت'));
  assert.ok(!headers.includes('شناسه'));
});

test('mixed legacy tasks and activities keep the dedicated activity Excel schema', () => {
  const state=demoState();
  const task=state.records.find(r=>r.kind==='tasks')!;
  const activity={...task,id:crypto.randomUUID(),kind:'activities' as const,data:dataSchema.parse({name:'تماس جدید',status:'open',activity_type:'call',activity_direction:'outbound',due:'2026-09-12',activity_time:'11:00'})};
  const wb=buildWorkbook([task,activity],state.records);
  const sheet=wb.worksheets[0];
  const headers=(sheet.getRow(1).values as unknown[]).slice(2).map(String);
  assert.equal(sheet.name,'فعالیت‌ها');
  assert.ok(headers.includes('نوع فعالیت'));
  assert.ok(headers.includes('ساعت شروع'));
  assert.ok(!headers.includes('شناسه'));
});

test('quote printing uses customer address and preserves escaped buyer details', async () => {
 const {proformaHtml}=await import('../lib/proforma');
 const state=demoState(); const customer=state.records.find(r=>r.kind==='companies')!;
 customer.data.address='تهران، خیابان نمونه، پلاک ۱۲'; customer.data.city='شهر نباید چاپ شود';
 const quote={...customer,kind:'proformas' as const,parent_id:customer.id,data:dataSchema.parse({name:'آزمون چاپ',buyer_representative:'نماینده قدیمی',economic_code:'1234',letter_number:'<script>bad</script>',terms:'تحویل پس از تأیید',items:[]})};
 const html=proformaHtml(quote,[customer],'پیوند');
 assert.ok(html.includes(customer.data.address)); assert.ok(!html.includes(customer.data.city));
 assert.ok(html.includes('&lt;script&gt;')); assert.ok(!html.includes('<script>bad'));
 assert.ok(html.includes('>محصول</th>')); assert.ok(html.includes('<th>مقدار کل</th>')); assert.ok(!html.includes('نماینده خریدار')); assert.ok(!html.includes('کد اقتصادی'));
 quote.data.billing_address='آدرس مخصوص این سند';
 assert.ok(proformaHtml(quote,[customer],'پیوند').includes('آدرس مخصوص این سند'));
 assert.equal(dataSchema.parse({name:'محصول قدیمی'}).product_type,'other');
 assert.equal(dataSchema.parse({name:'رنگ',product_type:'paint',ral_code:'RAL 3020'}).ral_code,'RAL 3020');
});

test('rial presentation preserves historical prices, rounding, discounts and tax', async () => {
 const {quoteAmounts,validateSales}=await import('../lib/crm');
 const {toRial,persianIntegerWords}=await import('../lib/proforma-money');
 const data=dataSchema.parse({name:'سند قدیمی',items:[{product_id:crypto.randomUUID(),name:'رنگ',unit:'کیلوگرم',quantity:5,unit_price:12280000}],discount_percent:0,tax_percent:10});
 const before=JSON.stringify(data.items);
 const totals=quoteAmounts(data);
 assert.equal(totals.total,67540000);
 assert.equal(toRial(totals.total),675400000);
 assert.equal(JSON.stringify(data.items),before);
 assert.equal(persianIntegerWords(toRial(totals.total)),'ششصد و هفتاد و پنج میلیون و چهارصد هزار');
 assert.equal(validateSales('proformas',data),'');
 const fractional=dataSchema.parse({...data,items:[{...data.items[0],quantity:0.125,unit_price:101}],discount_percent:7.5,tax_percent:10});
 const f=quoteAmounts(fractional);
 assert.equal(toRial(f.subtotal)-toRial(f.discount)+toRial(f.tax),toRial(f.total));
 assert.equal(persianIntegerWords(0),'صفر');
 assert.equal(persianIntegerWords(1000000000001),'یک تریلیون و یک');
});

test('packing survives backup JSON and rejects incomplete or inconsistent quantities', () => {
 const base={product_id:crypto.randomUUID(),name:'آستر',unit:'کیلوگرم',quantity:200,unit_price:25000,product_code:'P-100',package_count:10,package_amount:20};
 const d=dataSchema.parse({name:'بسته‌بندی',letter_number:'1405/125',quote_date:'2026-10-18',bank_name:'بانک',account_number:'00123',iban:'IR00123',delivery_terms:'پس از دریافت وجه',items:[base]});
 const restored=dataSchema.parse(JSON.parse(JSON.stringify(d)));
 assert.deepEqual(restored.items,d.items);
 assert.equal(restored.letter_number,'1405/125');assert.equal(restored.account_number,'00123');
 for(const item of [{...base,quantity:199},{...base,package_amount:null},{...base,package_count:1.5},{...base,package_amount:0}])assert.equal(dataSchema.safeParse({name:'نامعتبر',items:[item]}).success,false);
 assert.equal(dataSchema.safeParse({name:'بدون بسته‌بندی',items:[{product_id:base.product_id,name:'قدیمی',quantity:5,unit_price:10}]}).success,true);
});

test('invoice print and Excel consistently use rial and retain letter, code and packing', async () => {
 const {proformaHtml}=await import('../lib/proforma');
 const state=demoState(),customer=state.records.find(r=>r.kind==='companies')!;
 const data=dataSchema.parse({name:'پیش‌نویس',quote_number:'PF-2026-0001',letter_number:'1405/125',quote_date:'2026-10-18',buyer_representative:'نباید چاپ شود',economic_code:'123',bank_name:'بانک نمونه',iban:'IR00123',delivery_terms:'یک هفته',items:[{product_id:crypto.randomUUID(),name:'رنگ بشکه زرد',product_code:'Y-100',unit:'کیلوگرم',package_count:10,package_amount:20,quantity:200,unit_price:25000}],tax_percent:10});
 const quote={...customer,kind:'proformas' as const,parent_id:customer.id,data};
 const html=proformaHtml(quote,[customer],'نام قدیمی');
 for(const text of ['شرکت رنگ کانسای ایرانیان','شماره نامه:','1405/125','تاریخ:','رنگ بشکه زرد','Y-100','تعداد بسته','مقدار هر بسته','بانک نمونه','IR00123','پنجاه و پنج میلیون'])assert.ok(html.includes(text),text);
 for(const text of ['تاریخ صدور','نماینده خریدار','کد اقتصادی','پیش‌نویس','تومان','ثبت خروج کالا'])assert.ok(!html.includes(text),text);
 const wb=buildWorkbook([quote],[customer]);
 const header=wb.worksheets[0].getRow(1).values as string[];
 const finalIndex=header.indexOf('مبلغ نهایی (ریال)');
 assert.equal(wb.worksheets[0].getRow(2).getCell(finalIndex).value,55000000);
 const products=wb.worksheets[1],h=products.getRow(1).values as string[];
 assert.equal(products.getRow(2).getCell(h.indexOf('قیمت واحد (ریال)')).value,250000);
 assert.equal(products.getRow(2).getCell(h.indexOf('تعداد بسته')).value,10);
 assert.equal(products.getRow(2).getCell(h.indexOf('مقدار کل')).value,200);
});

test('custom product type survives parsing and appears in product Excel export', () => {
 const old=dataSchema.parse({name:'محصول قدیمی'});
 assert.equal(old.product_type_custom,'');
 const data=dataSchema.parse({name:'تینر فوری',product_type:'other',product_type_custom:'  تینر  '});
 assert.equal(data.product_type_custom,'تینر');
 const row={...demoState().records[0],kind:'products' as const,data};
 const saved=dataSchema.parse(JSON.parse(JSON.stringify(data)));
 assert.equal(saved.product_type_custom,'تینر');
 const sheet=buildWorkbook([row]).worksheets[0];
 assert.equal(sheet.getRow(2).getCell(4).value,'تینر');
});

test('personal followups include only assigned open tasks due today or earlier',()=>{
 const base=demoState().records[0],user='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
 const make=(id:string,assignee:string,due:string,status='open',kind:'tasks'|'activities'='activities',time='')=>({...base,id,kind,data:{...base.data,assignee,due,status,activity_time:time}});
 const rows=[make('today',user,'2026-10-30','open','activities','14:00'),make('late',user,'2026-10-29'),make('future',user,'2026-10-31'),make('other',other,'2026-10-29'),make('done',user,'2026-10-29','done'),make('unassigned','','2026-10-29'),make('undated',user,'')];
 assert.deepEqual(personalFollowups(rows,user,'2026-10-30').map(r=>r.id),['late','today']);assert.deepEqual(personalFollowups(rows,'','2026-10-30'),[]);
});

import {currentForecastMonth,forecastWindow,forecastTotals,forecastMonthsSchema,mergeForecastMonths,forecastNumber} from '../lib/forecast';
import {buildForecastWorkbook} from '../lib/forecast-export';
test('N+5 has exactly six Gregorian months and retains absolute months across year rollover',()=>{
 assert.deepEqual(forecastWindow('2026-10'),['2026-10','2026-11','2026-12','2027-01','2027-02','2027-03']);
 assert.equal(currentForecastMonth(new Date('2026-10-31T21:00:00Z')),'2026-11');
 const existing=[{month:'2026-09',quantity:12.345,amount:1000},{month:'2026-10',quantity:0,amount:null}];
 const merged=mergeForecastMonths(existing,[{month:'2026-10',quantity:100,amount:2000},{month:'2026-11',quantity:null,amount:0}]);
 assert.equal(merged[0].quantity,12.345);assert.equal(merged[1].quantity,100);assert.equal(merged[2].amount,0);
 for(const cells of [[{month:'2026-13',quantity:1,amount:null}],[{month:'2026-12',quantity:-1,amount:0}],[{month:'2026-12',quantity:1,amount:'2'}],[{month:'2026-12',quantity:1,amount:Infinity}],[existing[0],existing[0]]])assert.equal(forecastMonthsSchema.safeParse(cells).success,false);
});
test('forecast totals separate kg and IRR, distinguish missing and zero, and ignore other CRM kinds',()=>{
 const base=demoState().records[0];
 const make=(quantity:number|null,amount:number|null)=>({...base,kind:'forecasts' as const,data:dataSchema.parse({...base.data,forecast_product_id:'11111111-1111-4111-8111-111111111111',forecast_months:[{month:'2026-10',quantity,amount}]})});
 const rows=[make(0,null),make(1200.5,1000000.25),{...make(999,999),kind:'deals' as const}];
 const totals=forecastTotals(rows,['2026-10','2026-11']);
 assert.deepEqual(totals[0],{month:'2026-10',quantity:1200.5,amount:1000000.25,quantityCount:2,amountCount:1});
 assert.equal(totals[1].quantityCount,0);assert.equal(forecastNumber(null),'—');assert.equal(forecastNumber(0),'0');assert.equal(forecastNumber(1234567.891),'1,234,567.89');assert.equal(forecastNumber(0.001),'< 0.01');
 const saved=dataSchema.parse(JSON.parse(JSON.stringify(rows[1].data)));assert.equal(saved.forecast_months[0].amount,1000000.25);
});
test('forecast Excel uses selected absolute months, numeric kg/IRR cells, and leaves missing cells blank',()=>{
 const state=demoState(),customer=state.records.find(r=>r.kind==='companies')!,product=state.records.find(r=>r.kind==='products')||state.records[0];
 const row={...state.records[0],kind:'forecasts' as const,parent_id:customer.id,data:dataSchema.parse({name:'Forecast',sku:'001234',category:'paint',forecast_product_id:product.id,forecast_months:[{month:'2026-10',quantity:0,amount:1234567.89},{month:'2026-11',quantity:1.2345,amount:null}]})};
 const sheet=buildForecastWorkbook([row],[customer,product],forecastWindow('2026-10')).worksheets[0];
 assert.equal(sheet.getRow(3).getCell(1).value,customer.data.name);assert.equal(sheet.getRow(3).getCell(3).value,'001234');assert.equal(sheet.getRow(3).getCell(5).value,0);assert.equal(sheet.getRow(3).getCell(6).value,1234567.89);assert.equal(sheet.getRow(3).getCell(7).value,1.2345);assert.equal(sheet.getRow(3).getCell(8).value,null);assert.equal(sheet.getRow(2).getCell(5).value,'N 2026-10 (kg)');assert.equal(sheet.getRow(2).getCell(16).value,'N+5 2027-03 (IRR)');
 assert.ok(!JSON.stringify(sheet.getRow(2).values).includes('Achievement'));assert.ok(!JSON.stringify(sheet.getRow(2).values).includes('Status'));
});

import {navigationArea,workspaceLinks,resolveNavigation} from '../lib/navigation';
test('merged navigation keeps reports, stock and automation destinations in their parent workspace',()=>{
 assert.equal(navigationArea('reports'),'dashboard');assert.equal(navigationArea('inventory'),'products');assert.equal(navigationArea('automations'),'settings');assert.equal(navigationArea('platform-admin'),'settings');assert.equal(navigationArea('team-settings'),'settings');assert.equal(navigationArea('people'),'companies');
 const context={desktop:false,demo:false,role:'admin' as const,platformAdmin:false};
 assert.deepEqual(workspaceLinks('products',context).map(p=>p.id),['products','inventory']);assert.deepEqual(workspaceLinks('reports',context).map(p=>p.id),['dashboard','reports']);assert.equal(resolveNavigation('people',context),'companies');assert.equal(resolveNavigation('inventory',context),'inventory');
});
test('settings navigation retains member and backup tools while respecting administrative capabilities',()=>{
 const viewer={desktop:false,demo:false,role:'viewer' as const,platformAdmin:false},admin={...viewer,role:'admin' as const},owner={...admin,platformAdmin:true};
 const pages=(context:typeof viewer|typeof admin|typeof owner)=>workspaceLinks('settings',context).map(p=>p.id);
 for(const id of ['settings','team-settings','backup-settings','automations'])assert.ok(pages(viewer).includes(id));
 for(const id of ['trash','activity-log','platform-admin'])assert.ok(!pages(viewer).includes(id));
 assert.ok(pages(admin).includes('trash'));assert.ok(pages(admin).includes('activity-log'));assert.ok(!pages(admin).includes('platform-admin'));assert.ok(pages(owner).includes('platform-admin'));
 assert.equal(resolveNavigation('trash',viewer),'settings');assert.equal(resolveNavigation('platform-admin',admin),'settings');
});
test('offline and demo navigation do not expose online account or private administrative panels',()=>{
 for(const context of [{desktop:true,demo:false,role:'admin' as const,platformAdmin:true},{desktop:false,demo:true,role:'admin' as const,platformAdmin:true}]){
  const pages=workspaceLinks('settings',context).map(p=>p.id);for(const id of ['settings','platform-admin','trash','activity-log'])assert.ok(!pages.includes(id));assert.ok(pages.includes('backup-settings'));assert.ok(pages.includes('automations'));assert.equal(resolveNavigation('settings',context),'backup-settings');
 }
});


// Monthly dispatch comparisons must never treat missing dispatches as zero.
test('dispatch variance keeps missing, zero, OTM basis and unmatched rows distinct',async()=>{
 const {forecastComparison,forecastComparisonTotals,forecastMonthSchema}=await import('../lib/forecast');
 assert.deepEqual(forecastComparison({month:'2026-11',quantity:100,amount:null}),{planned:100,actual:null,delta:null,percent:null});
 assert.deepEqual(forecastComparison({month:'2026-11',quantity:100,amount:null,basis:'otm',actual_quantity:0}),{planned:100,actual:0,delta:-100,percent:-100});
 assert.equal(forecastComparison({month:'2026-11',quantity:0,amount:null,actual_quantity:20}).percent,null);
 assert.equal(forecastComparison({month:'2026-11',quantity:80,amount:null,actual_quantity:100}).delta,20);
 const make=(quantity:number|null,actual_quantity:number|null)=>({kind:'forecasts',data:{forecast_months:[{month:'2026-11',quantity,amount:null,actual_quantity}]}} as Row);
 const totals=forecastComparisonTotals([make(100,80),make(900,null),make(null,25)],'2026-11');
 assert.equal(totals.planned,1000);assert.equal(totals.actual,105);assert.equal(totals.matchedPlanned,100);assert.equal(totals.delta,-20);assert.equal(totals.percent,-20);assert.equal(totals.matchedCount,1);
 assert.equal(forecastMonthSchema.safeParse({month:'2026-11',quantity:10,amount:null,actual_quantity:-1}).success,false);
 const original=[{month:'2026-10',quantity:1,amount:null,basis:'otm' as const,production:125,consumption:.0123456789,actual_quantity:1}];
 const {mergeForecastMonths}=await import('../lib/forecast');assert.deepEqual(mergeForecastMonths(original,[{month:'2026-11',quantity:0,amount:null}])[0],original[0]);
});
