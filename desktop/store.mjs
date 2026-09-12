import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {dataSchema,kinds,blank,validateSales,localDay} from '../lib/crm.ts';
import {automationCandidates} from '../lib/automation.ts';
export const ORG='00000000-0000-4000-8000-000000000001';
export const USER='00000000-0000-4000-8000-000000000002';
export class StoreError extends Error{constructor(message,status=400){super(message);this.status=status;}}
const uuid=z.string().uuid();
const recordSchema=z.object({id:uuid,org_id:z.literal(ORG),kind:z.enum(kinds),parent_id:uuid.nullable(),data:dataSchema,created_at:z.string().datetime(),updated_at:z.string().datetime(),version:z.number().int().positive()});
const auditSchema=z.object({id:uuid,record_id:uuid,action:z.enum(['INSERT','UPDATE','DELETE']),label:z.string().max(160),created_at:z.string().datetime(),actor_id:z.literal(USER)});
const backupSchema=z.object({format:z.literal('peyvand-desktop'),schemaVersion:z.literal(1),exportedAt:z.string().datetime(),workspace:z.string().trim().min(1).max(100).nullable(),records:z.array(recordSchema).max(100000),audit:z.array(auditSchema).max(200000),automationKeys:z.array(z.string().max(200)).max(200000).default([])}).strict();
function valid(kind,data,parent,records,id){
 const salesError=validateSales(kind,data);if(salesError)throw new StoreError(salesError);
 if(kind==='companies'&&parent)throw new StoreError('مشتری نمی‌تواند والد داشته باشد.');
 if(['tasks','activities'].includes(kind)&&!['open','done'].includes(data.status))throw new StoreError(kind==='activities'?'وضعیت فعالیت معتبر نیست.':'وضعیت پیگیری معتبر نیست.');
 if(['companies','contacts'].includes(kind)&&!['active','lead','inactive'].includes(data.status))throw new StoreError('وضعیت مشتری معتبر نیست.');
 if(data.assignee&&data.assignee!==USER)throw new StoreError('مسئول این نسخه باید کاربر محلی باشد.');
 if(parent){const p=records.find(r=>r.id===parent);const allowed=kind==='stock_movements'?p?.kind==='products':kind==='activities'?['companies','contacts','deals'].includes(p?.kind||''):kind==='notes'?!!p&&p.kind!=='notes':p?.kind==='companies';if(parent===id||!allowed)throw new StoreError('ارتباط رکورد معتبر نیست.');}
}
export class CRMStore{
 constructor(file){
  this.db=new DatabaseSync(file);this.closed=false;
  this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
  CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,org_id TEXT NOT NULL,kind TEXT NOT NULL,parent_id TEXT REFERENCES records(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,data TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,version INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS records_kind ON records(kind);
  CREATE INDEX IF NOT EXISTS records_parent ON records(parent_id);
  CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,record_id TEXT NOT NULL,action TEXT NOT NULL,label TEXT NOT NULL,created_at TEXT NOT NULL,actor_id TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS automation_keys(key TEXT PRIMARY KEY);`);
  const schema=this.db.prepare("SELECT value FROM meta WHERE key='schema'").get();
  if(schema&&schema.value!=='1')throw new StoreError('نسخه پایگاه داده پشتیبانی نمی‌شود.');
  this.db.prepare("INSERT OR IGNORE INTO meta VALUES ('schema','1')").run();
 }
 transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const r=fn();this.db.exec('COMMIT');return r;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 records(){return this.db.prepare('SELECT * FROM records ORDER BY created_at DESC,id').all().map(r=>({...r,data:dataSchema.parse(JSON.parse(r.data))}));}
 workspace(){return this.db.prepare("SELECT value FROM meta WHERE key='workspace'").get()?.value||null;}
 state(){const name=this.workspace();return {desktop:true,org:name?{id:ORG,name}:null,user:{id:USER,email:'کاربر این رایانه'},role:'admin',records:this.records(),members:[{user_id:USER,email:'کاربر این رایانه',role:'admin'}],invites:[],audit:this.db.prepare('SELECT * FROM audit ORDER BY created_at DESC,id DESC LIMIT 100').all()};}
 createWorkspace(name){const p=z.string().trim().min(1).max(100).safeParse(name);if(!p.success)throw new StoreError('نام شرکت معتبر نیست.');if(this.workspace())throw new StoreError('فضای کاری قبلاً ساخته شده است.',409);this.db.prepare("INSERT INTO meta(key,value) VALUES ('workspace',?)").run(p.data);}
 log(id,action,label){this.db.prepare('INSERT INTO audit VALUES (?,?,?,?,?,?)').run(randomUUID(),id,action,label,new Date().toISOString(),USER);}
 save(input){
  const p=z.object({kind:z.enum(kinds),data:dataSchema,parent_id:uuid.nullable(),id:uuid.optional(),version:z.number().int().positive().optional()}).safeParse(input);
  if(!p.success)throw new StoreError(p.error.issues[0].message);
  if(!this.workspace())throw new StoreError('ابتدا فضای کاری بسازید.');
  const v=p.data;
  return this.transaction(()=>{
   const all=this.records();valid(v.kind,v.data,v.parent_id,all,v.id);
   const old=v.id?all.find(r=>r.id===v.id):null;
   if(v.id&&(!old||old.version!==v.version||old.kind!==v.kind))throw new StoreError('اطلاعات تغییر کرده است. صفحه را تازه کنید.',409);
   if(v.kind==='stock_movements')throw new StoreError('گردش انبار فقط از عملیات ورود و خروج ثبت می‌شود.');
   if(v.kind==='products'&&old&&v.data.stock!==old.data.stock)throw new StoreError('برای تغییر موجودی از بخش انبارداری استفاده کنید.');
   if(v.kind==='proformas'&&!v.parent_id)throw new StoreError('مشتری پیش‌فاکتور را انتخاب کنید.');
   if(v.kind==='products'&&v.data.sku&&all.some(r=>r.id!==v.id&&r.kind==='products'&&r.data.sku.toLowerCase()===v.data.sku.toLowerCase()))throw new StoreError('این کد محصول قبلاً ثبت شده است.',409);
   if(v.kind==='proformas'&&v.data.quote_number&&all.some(r=>r.id!==v.id&&r.kind==='proformas'&&r.data.quote_number===v.data.quote_number))throw new StoreError('شماره پیش‌فاکتور تکراری است.',409);
   const id=v.id||randomUUID(),now=new Date().toISOString();
   if(old)this.db.prepare('UPDATE records SET data=?,parent_id=?,updated_at=?,version=version+1 WHERE id=?').run(JSON.stringify(v.data),v.parent_id,now,id);
   else this.db.prepare('INSERT INTO records VALUES (?,?,?,?,?,?,?,?)').run(id,ORG,v.kind,v.parent_id,JSON.stringify(v.data),now,now,1);
   this.log(id,old?'UPDATE':'INSERT',v.data.name);
   if(v.kind==='products'&&!old&&v.data.stock>0)this.insertMovement(id,v.data,'opening',v.data.stock,v.data.stock,'','موجودی ابتدای دوره');
   const next={id,org_id:ORG,kind:v.kind,data:v.data,parent_id:v.parent_id,created_at:old?.created_at||now,updated_at:now,version:old?old.version+1:1};
   this.applyAutomations(localDay(),{previous:old||undefined,next});
   return {id};
  });
 }
 insertMovement(productId,product,type,quantity,after,reference,description){
  const id=randomUUID(),now=new Date().toISOString();
  const data={...blank(),name:product.name,unit:product.unit,movement_type:type,movement_quantity:quantity,stock_after:after,movement_reference:reference,description};
  this.db.prepare('INSERT INTO records VALUES (?,?,?,?,?,?,?,?)').run(id,ORG,'stock_movements',productId,JSON.stringify(data),now,now,1);this.log(id,'INSERT',`${product.name}: ${quantity>0?'+':''}${quantity}`);return id;
 }
 inventory(input){
  const parsed=z.object({product_id:uuid,type:z.enum(['in','out','adjustment']),quantity:z.number().finite().min(0).max(1e12),version:z.number().int().positive(),reference:z.string().max(160).default(''),description:z.string().max(10000).default('')}).safeParse(input);
  if(!parsed.success)throw new StoreError('اطلاعات عملیات انبار معتبر نیست.');
  const v=parsed.data;if(v.type!=='adjustment'&&v.quantity<=0)throw new StoreError('مقدار باید بیشتر از صفر باشد.');
  if(v.type==='adjustment'&&!v.description.trim())throw new StoreError('دلیل اصلاح موجودی را بنویسید.');
  if(Math.abs(v.quantity*100-Math.round(v.quantity*100))>0.0001)throw new StoreError('مقدار را حداکثر با دو رقم اعشار وارد کنید.');
  return this.transaction(()=>{
   const product=this.records().find(r=>r.id===v.product_id&&r.kind==='products');
   if(!product)throw new StoreError('محصول پیدا نشد.',404);
   if(product.version!==v.version)throw new StoreError('موجودی یا محصول تغییر کرده است؛ اطلاعات را تازه کنید.',409);
   if(product.data.status!=='active')throw new StoreError('محصول غیرفعال است.');
   const current=Math.round(product.data.stock*100),inputUnits=Math.round(v.quantity*100);
   const afterUnits=v.type==='adjustment'?inputUnits:current+(v.type==='in'?inputUnits:-inputUnits);
   if(afterUnits<0)throw new StoreError('موجودی برای این خروج کافی نیست.');
   if(afterUnits>1e14)throw new StoreError('موجودی از محدوده مجاز بیشتر می‌شود.');
   if(afterUnits===current)throw new StoreError('موجودی تغییری نمی‌کند.');
   const after=afterUnits/100,delta=(afterUnits-current)/100;
   this.db.prepare('UPDATE records SET data=?,version=version+1,updated_at=? WHERE id=?').run(JSON.stringify({...product.data,stock:after}),new Date().toISOString(),product.id);
   this.log(product.id,'UPDATE',product.data.name);
   return {id:this.insertMovement(product.id,product.data,v.type,delta,after,v.reference,v.description),stock:after};
  });
 }
 applyAutomations(day,change){
  for(const c of automationCandidates(this.records(),day,change)){
   if(!this.db.prepare('INSERT OR IGNORE INTO automation_keys VALUES (?)').run(c.data.automation_key).changes)continue;
   const id=randomUUID(),now=new Date().toISOString();
   this.db.prepare('INSERT INTO records VALUES (?,?,?,?,?,?,?,?)').run(id,ORG,c.kind,c.parent_id,JSON.stringify(c.data),now,now,1);this.log(id,'INSERT',c.data.name);
  }
 }
 runAutomations(day=localDay()){if(this.workspace())this.transaction(()=>this.applyAutomations(day));}
 delete(input){const p=z.object({id:uuid,version:z.number().int().positive()}).safeParse(input);if(!p.success)throw new StoreError('شناسه معتبر نیست.');return this.transaction(()=>{const old=this.db.prepare('SELECT * FROM records WHERE id=?').get(p.data.id);if(!old||old.version!==p.data.version)throw new StoreError('اطلاعات تغییر کرده است. صفحه را تازه کنید.',409);if(old.kind==='stock_movements')throw new StoreError('سند انبار به‌تنهایی حذف نمی‌شود؛ از حذف کامل محصول یا اصلاح موجودی استفاده کنید.');const oldData=JSON.parse(old.data);if(old.kind==='products'){if(oldData.stock!==0)throw new StoreError('برای حذف محصول، ابتدا موجودی را از بخش انبارداری به صفر برسانید.');if(oldData.status!=='inactive')throw new StoreError('برای حذف کامل محصول، ابتدا وضعیت آن را غیرفعال کنید.');const movements=this.db.prepare("SELECT id,data FROM records WHERE kind='stock_movements' AND parent_id=?").all(old.id);for(const movement of movements){this.db.prepare('DELETE FROM records WHERE id=?').run(movement.id);this.log(movement.id,'DELETE',JSON.parse(movement.data).name);} }const children=this.db.prepare("SELECT id,data FROM records WHERE parent_id=? AND kind!='stock_movements'").all(old.id);this.db.prepare("UPDATE records SET parent_id=NULL,version=version+1,updated_at=? WHERE parent_id=? AND kind!='stock_movements'").run(new Date().toISOString(),old.id);for(const child of children)this.log(child.id,'UPDATE',JSON.parse(child.data).name);this.db.prepare('DELETE FROM records WHERE id=?').run(old.id);this.log(old.id,'DELETE',oldData.name);});}
 exportBackup(){return {format:'peyvand-desktop',schemaVersion:1,exportedAt:new Date().toISOString(),workspace:this.workspace(),records:this.records(),audit:this.db.prepare('SELECT * FROM audit ORDER BY created_at,id').all(),automationKeys:this.db.prepare('SELECT key FROM automation_keys ORDER BY key').all().map(r=>r.key)};}
 validateBackup(data){const parsed=backupSchema.safeParse(data);if(!parsed.success)throw new StoreError('فایل پشتیبان معتبر نیست یا نسخه آن پشتیبانی نمی‌شود.');const b=parsed.data;const ids=new Set(b.records.map(r=>r.id));if(ids.size!==b.records.length||new Set(b.audit.map(a=>a.id)).size!==b.audit.length||(!b.workspace&&b.records.length))throw new StoreError('فایل پشتیبان ناسازگار است.');for(const r of b.records)valid(r.kind,r.data,r.parent_id,b.records,r.id);return b;}
 restoreBackup(data){const b=this.validateBackup(data);this.transaction(()=>{this.db.exec('DELETE FROM audit; DELETE FROM records; DELETE FROM automation_keys;');this.db.prepare("DELETE FROM meta WHERE key='workspace'").run();if(b.workspace)this.db.prepare("INSERT INTO meta VALUES ('workspace',?)").run(b.workspace);const insert=this.db.prepare('INSERT INTO records VALUES (?,?,?,?,?,?,?,?)');for(const r of b.records)insert.run(r.id,ORG,r.kind,r.parent_id,JSON.stringify(r.data),r.created_at,r.updated_at,r.version);const audit=this.db.prepare('INSERT INTO audit VALUES (?,?,?,?,?,?)');for(const a of b.audit)audit.run(a.id,a.record_id,a.action,a.label,a.created_at,a.actor_id);const key=this.db.prepare('INSERT OR IGNORE INTO automation_keys VALUES (?)');for(const k of [...b.automationKeys,...b.records.map(r=>r.data.automation_key).filter(Boolean)])key.run(k);});}
 close(){if(!this.closed){this.db.close();this.closed=true;}}
}
