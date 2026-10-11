import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {sampleSchema} from '../lib/samples.ts';
import {localDay} from '../lib/crm.ts';
const uuid=z.string().uuid(),day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s);
const quantity=z.number().finite().positive().max(1e12).refine(n=>Math.abs(n*100-Math.round(n*100))<0.0001);
export const sampleBackupSchema=z.object({id:uuid,version:z.number().int().positive(),data:sampleSchema});
export const returnBackupSchema=z.object({id:uuid,customer_id:uuid,product_id:uuid,quantity,return_date:day,created_at:z.string().datetime(),reason:z.string().trim().min(1).max(2000),reference:z.string().max(160).default(''),status:z.enum(['pending','received','rejected']),restocked:z.boolean(),version:z.number().int().positive(),material_type:z.enum(['paint','primer','clearcoat','other']).default('other'),sor_number:z.string().max(80).default(''),material_condition:z.enum(['raw','thinned','unknown']).default('unknown'),batch_number:z.string().max(80).default(''),thinner_batch:z.string().max(80).default(''),movement_id:uuid.nullable().optional(),workflow:z.object({stage:z.enum(['inspection','rework','ready','resent']).default('inspection'),events:z.array(z.object({id:uuid,step:z.enum(['inspection','rework','ready','resend','note']),note:z.string().max(2000),date:day,quantity:z.number().finite().min(0).max(1e12),reference:z.string().max(160)}).passthrough()).max(10000)}).default({stage:'inspection',events:[]})}).passthrough();
export class Documents {
 constructor(store,ErrorType){this.store=store;this.db=store.db;this.Error=ErrorType;this.db.exec('CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,kind TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL); CREATE INDEX IF NOT EXISTS documents_kind ON documents(kind,created_at);');}
 check(schema,input){const p=schema.safeParse(input);if(!p.success)throw new this.Error(p.error.issues[0].message);return p.data;}
 list(kind){return this.db.prepare('SELECT data FROM documents WHERE kind=? ORDER BY created_at DESC,id').all(kind).map(r=>JSON.parse(r.data));}
 put(kind,row){this.db.prepare('INSERT INTO documents VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(row.id,kind,JSON.stringify(row),row.created_at||new Date().toISOString());}
 current(kind,input){const v=this.check(z.object({id:uuid,version:z.number().int().positive()}),input),r=this.list(kind).find(x=>x.id===v.id);if(!r||r.version!==v.version)throw new this.Error('اطلاعات تغییر کرده است؛ دوباره دریافت کنید.',409);return r;}
 samples(input){if(!this.store.workspace())throw new this.Error('ابتدا فضای کاری بسازید.');return this.store.transaction(()=>{
  if(input.action==='delete_many'){
   const selections=this.check(z.array(z.object({id:uuid,version:z.number().int().positive(),all:z.boolean().optional(),round_ids:z.array(uuid).max(200).optional()})).min(1).max(10000),input.selections);
   if(new Set(selections.map(x=>x.id)).size!==selections.length)throw new this.Error('انتخاب تکراری است.');
   const changes=selections.map(s=>{const r=this.current('samples',s);if(!s.all&&(!s.round_ids?.length||s.round_ids.some(id=>!r.data.rounds.some(t=>t.id===id))))throw new this.Error('ارسال انتخاب‌شده یافت نشد.',409);return {r,rounds:s.all?[]:r.data.rounds.filter(t=>!s.round_ids.includes(t.id))};});
   for(const {r,rounds} of changes){if(!rounds.length)this.db.prepare('DELETE FROM documents WHERE id=?').run(r.id);else this.put('samples',{...r,version:r.version+1,data:{...r.data,rounds}});}return {ok:true};
  }
  if(input.action==='delete'){const r=this.current('samples',input);this.db.prepare('DELETE FROM documents WHERE id=?').run(r.id);return {ok:true};}
  const v=this.check(z.object({id:uuid.nullable(),version:z.number().int().min(0),data:sampleSchema}),input);const old=v.id?this.current('samples',v):null;if(!old&&v.version!==0)throw new this.Error('نسخه رکورد معتبر نیست.');const id=v.id||randomUUID();this.put('samples',{id,version:(old?.version||0)+1,data:v.data});return {ok:true,id};
 });}
 move(r,type,qty,reference,description){const p=this.store.records().find(p=>p.id===r.product_id&&p.kind==='products');if(!p||p.data.status!=='active'||p.data.archived)throw new this.Error('محصول فعال برای عملیات انبار لازم است.');const after=Math.round((p.data.stock+(type==='in'?qty:-qty))*100)/100;if(after<0||after>1e12)throw new this.Error('موجودی برای این عملیات معتبر نیست.');this.db.prepare('UPDATE records SET data=?,version=version+1,updated_at=? WHERE id=?').run(JSON.stringify({...p.data,stock:after}),new Date().toISOString(),p.id);this.store.log(p.id,'UPDATE',p.data.name);return this.store.insertMovement(p.id,p.data,type,type==='in'?qty:-qty,after,reference,description);}
 returns(input){if(!this.store.workspace())throw new this.Error('ابتدا فضای کاری بسازید.');return this.store.transaction(()=>{
  if(input.action==='create'){
   const v=this.check(z.object({customer_id:uuid,product_id:uuid,quantity,return_date:day,reason:z.string().trim().min(1).max(2000),reference:z.string().max(160).default(''),material_type:z.enum(['paint','primer','clearcoat','other']),sor_number:z.string().trim().max(80).default(''),material_condition:z.enum(['raw','thinned']),batch_number:z.string().trim().min(1).max(80),thinner_batch:z.string().trim().max(80).default('')}),input),records=this.store.records();
   if(!records.some(r=>r.id===v.customer_id&&r.kind==='companies')||!records.some(r=>r.id===v.product_id&&r.kind==='products'))throw new this.Error('مشتری و محصول معتبر را انتخاب کنید.');if(v.material_condition==='thinned'&&!v.thinner_batch)throw new this.Error('شماره بچ تینر را وارد کنید.');
   const r={...v,id:randomUUID(),version:1,status:'pending',restocked:false,movement_id:null,batch_number:v.batch_number.toUpperCase(),thinner_batch:v.material_condition==='raw'?'':v.thinner_batch.toUpperCase(),created_at:new Date().toISOString(),workflow:{stage:'inspection',events:[]}};this.put('returns',r);return {ok:true,id:r.id};
  }
  const r=this.current('returns',input);
  if(input.action==='delete'){this.db.prepare('DELETE FROM documents WHERE id=?').run(r.id);return {ok:true};}
  if(input.action==='resolve'){
   const v=this.check(z.object({decision:z.enum(['received','rejected']),restock:z.boolean()}),input);if(r.status!=='pending')throw new this.Error('وضعیت این برگشت قبلاً ثبت شده است.',409);if(v.restock&&(v.decision!=='received'||r.material_condition==='thinned'))throw new this.Error('مواد تینرخورده باید در قرنطینه دریافت شوند.');const movement=v.restock?this.move(r,'in',r.quantity,'RETURN-'+r.id,'دریافت مواد برگشتی: '+r.reason):null;this.put('returns',{...r,status:v.decision,restocked:v.restock,movement_id:movement,resolved_at:new Date().toISOString(),version:r.version+1});return {ok:true};
  }
  if(input.action!=='followup')throw new this.Error('عملیات معتبر نیست.');
  const v=this.check(z.object({step:z.enum(['inspection','rework','ready','resend','note']),note:z.string().trim().min(1).max(2000),day,quantity:z.number().finite().min(0).max(1e12).default(0),reference:z.string().trim().max(160).default('')}),input);
  if(r.status!=='received'||v.day<r.return_date||v.day>localDay())throw new this.Error('ابتدا برگشت را دریافت و تاریخ اقدام را درست وارد کنید.');let stage=r.workflow.stage;const sent=r.workflow.events.filter(e=>e.step==='resend').reduce((n,e)=>n+e.quantity,0);let movement=null;
  if(v.step!=='note'&&sent>=r.quantity)throw new this.Error('کل مواد قبلاً ارسال شده است.');
  if(v.step==='resend'){if(stage!=='ready'||!quantity.safeParse(v.quantity).success||v.quantity>Math.round((r.quantity-sent)*100)/100||!v.reference)throw new this.Error('مقدار و مرجع ارسال را کامل کنید و ابتدا وضعیت آماده ارسال را ثبت کنید.');if(r.restocked)movement=this.move(r,'out',v.quantity,v.reference,'ارسال مجدد برگشتی: '+v.note);stage=Math.round((sent+v.quantity)*100)===Math.round(r.quantity*100)?'resent':'ready';}else if(v.step!=='note')stage=v.step;
  const event={id:randomUUID(),step:v.step,note:v.note,date:v.day,quantity:v.step==='resend'?v.quantity:0,reference:v.reference,movement_id:movement,created_at:new Date().toISOString()};this.put('returns',{...r,version:r.version+1,workflow:{stage,events:[...r.workflow.events,event]}});return {ok:true};
 });}
}
