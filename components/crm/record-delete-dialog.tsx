'use client';
import {ArrowUpLeft,Link2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {AlertDialog,AlertDialogAction,AlertDialogCancel,AlertDialogContent,AlertDialogDescription,AlertDialogFooter,AlertDialogTitle} from '@/components/ui/alert-dialog';
import {labels,type Row} from '@/lib/crm';

type Props={row:Row|null;rows:Row[];busy:boolean;onClose:()=>void;onDelete:(row:Row)=>void;onOpen:(id:string)=>void};
export function RecordDeleteDialog({row,rows,busy,onClose,onDelete,onOpen}:Props){
 // Product removal archives the product and retains its history; other records
 // can be deleted only after their dependent CRM records have been resolved.
 const dependencies=row&&row.kind!=='products'?rows.filter(r=>r.parent_id===row.id):[];
 const blocked=dependencies.length>0;
 return <AlertDialog open={!!row} onOpenChange={open=>{if(!open&&!busy)onClose();}}><AlertDialogContent dir="rtl">
  <AlertDialogTitle>حذف {row?.data.name}؟</AlertDialogTitle>
  <AlertDialogDescription>{row?.kind==='products'?'برای حذف محصول، موجودی باید صفر و وضعیت آن غیرفعال باشد. محصول از فهرست فعال خارج می‌شود و سوابق مرتبط حفظ می‌شوند.':blocked?'ابتدا موارد مرتبط زیر را بررسی کنید. تا زمانی که به این پرونده متصل‌اند، حذف پرونده ممکن نیست.':row?.kind==='notes'&&row.data.automation_key?'این یادآوری خودکار حذف می‌شود. اگر قانون زمانی فعال و شرط آن برقرار باشد، ممکن است دوباره ساخته شود.':'این مورد حذف می‌شود. برای حذف پرونده، نباید سابقهٔ مرتبطی به آن متصل باشد.'}</AlertDialogDescription>
  {blocked&&<div className="grid max-h-64 gap-2 overflow-y-auto" aria-label="موارد مرتبط مانع حذف">{dependencies.map(child=><div key={child.id} className="flex min-w-0 items-center gap-3 rounded-lg border border-emerald-100 bg-emerald-50/40 p-3"><Link2 size={16} className="shrink-0 text-emerald-700" aria-hidden="true"/><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{child.data.name}</p><small className="text-muted-foreground">{child.kind==='notes'&&child.data.automation_key?'یادآوری خودکار':labels[child.kind]}</small></div><Button type="button" variant="outline" size="sm" disabled={busy} aria-label={`بررسی ${child.data.name}`} onClick={()=>{onClose();onOpen(child.id);}}>بررسی<ArrowUpLeft size={14} aria-hidden="true"/></Button></div>)}</div>}
  <AlertDialogFooter><AlertDialogCancel disabled={busy}>{blocked?'بستن':'انصراف'}</AlertDialogCancel>{!blocked&&<AlertDialogAction disabled={busy} className="bg-red-700 text-white" onClick={e=>{e.preventDefault();if(row)onDelete(row);}}>{busy?'در حال حذف…':'حذف رکورد'}</AlertDialogAction>}</AlertDialogFooter>
 </AlertDialogContent></AlertDialog>;
}
