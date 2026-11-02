import {kinds,type Row} from './crm';
export type BulkDeleteResult={deleted:string[];failed:{id:string;name:string;error:string}[];cancelled:string[]};
export type BulkDeleteItem={id:string;data:{name:string}};
export type BulkDeleteHandler<T=Row>=(rows:T[],onProgress:(done:number,total:number)=>void,signal:AbortSignal)=>Promise<BulkDeleteResult>;
export function deletionBlock(row:Row,rows:Row[]){
 if(!kinds.includes(row.kind))return 'نوع رکورد برای حذف معتبر نیست.';
 if(row.kind==='stock_movements')return 'گردش انبار حذف نمی‌شود؛ برای اصلاح، سند اصلاح موجودی ثبت کنید.';
 if(row.kind==='products'){
  if(row.data.archived)return 'قبلاً از فهرست حذف شده است.';
  if(row.data.stock!==0)return 'موجودی محصول باید صفر باشد.';
  if(row.data.status!=='inactive')return 'محصول باید ابتدا غیرفعال شود.';
  return '';
 }
 if(rows.some(child=>child.parent_id===row.id))return 'دارای سابقهٔ مرتبط است؛ ابتدا موارد مرتبط را بررسی کنید.';
 return '';
}
export async function executeBulkDelete<T extends BulkDeleteItem>(rows:T[],remove:(row:T)=>Promise<void>,progress:(done:number,total:number)=>void,signal:AbortSignal):Promise<BulkDeleteResult>{
 const targets=[...new Map(rows.map(r=>[r.id,r])).values()],result:BulkDeleteResult={deleted:[],failed:[],cancelled:[]};
 let next=0,done=0;progress(0,targets.length);
 await Promise.all(Array.from({length:Math.min(3,targets.length)},async()=>{
  while(!signal.aborted&&next<targets.length){const row=targets[next++];
   try{await remove(row);result.deleted.push(row.id);}
   catch(error){result.failed.push({id:row.id,name:row.data.name,error:error instanceof Error?error.message:'حذف انجام نشد.'});}
   done++;progress(done,targets.length);
  }
 }));
 result.cancelled=targets.slice(next).map(r=>r.id);return result;
}
