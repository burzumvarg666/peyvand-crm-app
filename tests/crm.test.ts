import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dataSchema, summary, exportCsv, csvCell } from '../lib/crm';
import { buildWorkbook } from '../lib/exports';
import { demoState } from '../lib/demo';
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
 const quote={...customer,kind:'proformas' as const,parent_id:customer.id,data:dataSchema.parse({name:'آزمون چاپ',buyer_representative:'<script>bad</script>',economic_code:'1234',terms:'تحویل پس از تأیید',items:[]})};
 const html=proformaHtml(quote,[customer],'پیوند');
 assert.ok(html.includes(customer.data.address)); assert.ok(!html.includes(customer.data.city));
 assert.ok(html.includes('&lt;script&gt;')); assert.ok(!html.includes('<script>bad'));
 assert.ok(html.includes('<th>محصول</th>')); assert.ok(html.includes('<th>مقدار</th>'));
 quote.data.billing_address='آدرس مخصوص این سند';
 assert.ok(proformaHtml(quote,[customer],'پیوند').includes('آدرس مخصوص این سند'));
 assert.equal(dataSchema.parse({name:'محصول قدیمی'}).product_type,'other');
 assert.equal(dataSchema.parse({name:'رنگ',product_type:'paint',ral_code:'RAL 3020'}).ral_code,'RAL 3020');
});
