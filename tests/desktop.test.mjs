import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {CRMStore,USER} from '../desktop/store.mjs';
import {startServer} from '../desktop/server.mjs';
import {dataSchema} from '../lib/crm.ts';
const data=(name,extra={})=>dataSchema.parse({name,...extra});
function create(){const s=new CRMStore(':memory:');s.createWorkspace('شرکت آزمون');return s;}
test('records and notes persist across an actual database close/reopen',async()=>{const dir=await mkdtemp(join(tmpdir(),'peyvand-'));try{let s=new CRMStore(join(dir,'data.sqlite'));s.createWorkspace('شرکت پایدار');const c=s.save({kind:'companies',data:data('مشتری پایدار'),parent_id:null});s.save({kind:'notes',data:data('یادداشت',{description:'نتیجه تماس'}),parent_id:c.id});s.close();s=new CRMStore(join(dir,'data.sqlite'));assert.equal(s.state().org.name,'شرکت پایدار');assert.equal(s.state().records.length,2);assert.equal(s.state().audit.length,2);s.close();}finally{await rm(dir,{recursive:true,force:true});}});
test('stale updates and deletes do not overwrite newer changes',()=>{const s=create();try{const c=s.save({kind:'companies',data:data('اول'),parent_id:null});s.save({id:c.id,version:1,kind:'companies',data:data('دوم'),parent_id:null});assert.throws(()=>s.save({id:c.id,version:1,kind:'companies',data:data('قدیمی'),parent_id:null}),e=>e.status===409);assert.throws(()=>s.delete({id:c.id,version:1}),e=>e.status===409);assert.equal(s.records()[0].data.name,'دوم');}finally{s.close();}});
test('deleting parent preserves children and updates their versions',()=>{const s=create();try{const p=s.save({kind:'companies',data:data('مشتری'),parent_id:null});const t=s.save({kind:'tasks',data:data('تماس',{status:'open',assignee:USER}),parent_id:p.id});s.delete({id:p.id,version:1});const row=s.records().find(r=>r.id===t.id);assert.equal(row.parent_id,null);assert.equal(row.version,2);}finally{s.close();}});
test('backup restores complete records, parent links, workspace and history',()=>{const s=create(),other=create();try{const p=s.save({kind:'companies',data:data('مشتری'),parent_id:null});s.save({kind:'deals',data:data('فروش',{amount:150000,stage:'won'}),parent_id:p.id});const b=s.exportBackup();other.restoreBackup(b);assert.deepEqual(other.records(),s.records());assert.equal(other.state().org.name,s.state().org.name);assert.equal(other.state().audit.length,2);assert.equal(other.exportBackup().audit.length,b.audit.length);}finally{s.close();other.close();}});
test('invalid or duplicate backup records cannot erase existing data',()=>{const s=create();try{s.save({kind:'companies',data:data('اصل'),parent_id:null});const initial=s.records();const backup=s.exportBackup();backup.records.push(backup.records[0]);assert.throws(()=>s.restoreBackup(backup));assert.deepEqual(s.records(),initial);const broken=s.exportBackup();broken.records[0].data.amount=-5;assert.throws(()=>s.restoreBackup(broken));assert.deepEqual(s.records(),initial);}finally{s.close();}});
test('invalid relations, input and assignment are rejected without partial writes',()=>{const s=create();try{assert.throws(()=>s.save({kind:'tasks',data:data('کار',{status:'active'}),parent_id:null}));assert.throws(()=>s.save({kind:'contacts',data:data('فرد'),parent_id:'00000000-0000-4000-8000-000000000999'}));assert.throws(()=>s.save({kind:'deals',data:data('فروش',{assignee:'00000000-0000-4000-8000-000000000999'}),parent_id:null}));assert.equal(s.records().length,0);}finally{s.close();}});
test('inventory movements are atomic, versioned and immutable',()=>{const s=create();try{const p=s.save({kind:'products',data:data('محصول',{stock:10,min_stock:2,unit:'عدد'}),parent_id:null});assert.equal(s.records().filter(r=>r.kind==='stock_movements').length,1);let product=s.records().find(r=>r.id===p.id);const moved=s.inventory({product_id:p.id,type:'out',quantity:3,version:product.version,reference:'رسید ۱',description:''});assert.equal(moved.stock,7);product=s.records().find(r=>r.id===p.id);assert.throws(()=>s.inventory({product_id:p.id,type:'out',quantity:20,version:product.version,reference:'',description:''}));assert.equal(s.records().find(r=>r.id===p.id).data.stock,7);assert.throws(()=>s.inventory({product_id:p.id,type:'in',quantity:1,version:1,reference:'',description:''}),e=>e.status===409);assert.throws(()=>s.inventory({product_id:p.id,type:'adjustment',quantity:5,version:product.version,reference:'',description:''}));const movement=s.records().find(r=>r.kind==='stock_movements'&&r.data.movement_type==='out');assert.throws(()=>s.delete({id:movement.id,version:movement.version}));}finally{s.close();}});
test('sales automation creates one durable follow-up for a stage transition',()=>{const s=create();try{const c=s.save({kind:'companies',data:data('مشتری'),parent_id:null});s.save({kind:'automations',data:data('قانون مرحله',{automation_trigger:'stage_change',automation_stage:'proposal',automation_action:'create_task',automation_days:2}),parent_id:null});const d=s.save({kind:'deals',data:data('فرصت',{stage:'lead',amount:1000}),parent_id:c.id});s.save({id:d.id,version:1,kind:'deals',data:data('فرصت',{stage:'proposal',amount:1000}),parent_id:c.id});assert.equal(s.records().filter(r=>r.kind==='tasks'&&r.data.automation_key).length,1);s.runAutomations();assert.equal(s.records().filter(r=>r.kind==='tasks'&&r.data.automation_key).length,1);const b=s.exportBackup();assert.equal(b.automationKeys.length,1);}finally{s.close();}});
test('local HTTP API gates reads and mutations and serves packaged assets',async()=>{const s=create(),token=randomBytes(32).toString('hex');const srv=await startServer({store:s,ui:resolve('desktop/ui'),token});const cookie='peyvand_desktop='+token;try{assert.equal((await fetch(srv.origin+'/api/crm')).status,401);const auth=await fetch(srv.origin+'/api/auth',{headers:{cookie}});assert.equal((await auth.json()).desktop,true);const root=await fetch(srv.origin,{headers:{cookie}});assert.equal(root.status,200);const html=await root.text();assert.match(html,/dir="rtl"/);for(const match of html.matchAll(/(?:src|href)="(\/[^" ]+)"/g))assert.equal((await fetch(srv.origin+match[1],{headers:{cookie}})).status,200);const request={action:'save',kind:'companies',data:data('از API'),parent_id:null};assert.equal((await fetch(srv.origin+'/api/crm',{method:'POST',headers:{cookie,origin:'https://evil.example','content-type':'application/json'},body:JSON.stringify(request)})).status,403);assert.equal((await fetch(srv.origin+'/api/crm',{method:'POST',headers:{cookie,origin:srv.origin,'content-type':'application/json'},body:JSON.stringify(request)})).status,200);const result=await(await fetch(srv.origin+'/api/crm',{headers:{cookie}})).json();assert.equal(result.records[0].data.name,'از API');}finally{await srv.close();s.close();}});

test('activities link to accounts contacts and deals and survive backup restore',()=>{const s=create(),other=create();try{
 const account=s.save({kind:'companies',data:data('حساب'),parent_id:null});
 const contact=s.save({kind:'contacts',data:data('شخص',{position:'مدیر خرید'}),parent_id:account.id});
 const deal=s.save({kind:'deals',data:data('فرصت',{amount:1000}),parent_id:account.id});
 const a1=s.save({kind:'activities',data:data('تماس',{status:'open',activity_type:'call',activity_direction:'outbound',due:'2026-09-11',activity_time:'09:30'}),parent_id:contact.id});
 const a2=s.save({kind:'activities',data:data('جلسه',{status:'done',activity_type:'meeting',due:'2026-09-12'}),parent_id:deal.id});
 assert.equal(s.records().filter(r=>r.kind==='activities').length,2);
 assert.equal(s.records().find(r=>r.id===a1.id).parent_id,contact.id);
 assert.equal(s.records().find(r=>r.id===a2.id).parent_id,deal.id);
 other.restoreBackup(s.exportBackup());
 assert.equal(other.records().filter(r=>r.kind==='activities').length,2);
}finally{s.close();other.close();}});
test('activity cannot link to an unrelated record type',()=>{const s=create();try{
 const product=s.save({kind:'products',data:data('محصول'),parent_id:null});
 assert.throws(()=>s.save({kind:'activities',data:data('تماس',{status:'open',activity_type:'call'}),parent_id:product.id}));
}finally{s.close();}});


test('inactive zero-stock product with inventory history can be fully deleted',()=>{const s=create();try{
 const p=s.save({kind:'products',data:data('محصول حذف‌شدنی',{stock:5,min_stock:0,unit:'عدد',status:'active'}),parent_id:null});
 let product=s.records().find(r=>r.id===p.id);
 assert.throws(()=>s.delete({id:p.id,version:product.version}),/موجودی/);
 s.inventory({product_id:p.id,type:'adjustment',quantity:0,version:product.version,reference:'',description:'اصلاح برای حذف محصول'});
 product=s.records().find(r=>r.id===p.id);
 assert.throws(()=>s.delete({id:p.id,version:product.version}),/غیرفعال/);
 s.save({id:p.id,version:product.version,kind:'products',data:{...product.data,status:'inactive'},parent_id:null});
 product=s.records().find(r=>r.id===p.id);
 assert.ok(s.records().some(r=>r.kind==='stock_movements'&&r.parent_id===p.id));
 s.delete({id:p.id,version:product.version});
 assert.equal(s.records().some(r=>r.id===p.id),false);
 assert.equal(s.records().some(r=>r.kind==='stock_movements'&&r.parent_id===p.id),false);
}finally{s.close();}});


test('inactive product can be adjusted to zero before deletion',()=>{const s=create();try{
 const p=s.save({kind:'products',data:data('محصول غیرفعال',{stock:4,min_stock:0,unit:'عدد',status:'active'}),parent_id:null});
 let product=s.records().find(r=>r.id===p.id);
 s.save({id:p.id,version:product.version,kind:'products',data:{...product.data,status:'inactive'},parent_id:null});
 product=s.records().find(r=>r.id===p.id);
 assert.throws(()=>s.inventory({product_id:p.id,type:'out',quantity:1,version:product.version,reference:'',description:''}),/فقط اصلاح موجودی به صفر/);
 const adjusted=s.inventory({product_id:p.id,type:'adjustment',quantity:0,version:product.version,reference:'',description:'صفر کردن برای حذف'});
 assert.equal(adjusted.stock,0);
 product=s.records().find(r=>r.id===p.id);
 assert.equal(product.data.stock,0);
 s.delete({id:p.id,version:product.version});
 assert.equal(s.records().some(r=>r.id===p.id),false);
}finally{s.close();}});
