'use client';
import {useEffect,useRef,useState} from 'react';
import {Trash2,X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {deletionBlock,type BulkDeleteHandler,type BulkDeleteResult} from '@/lib/bulk-delete';
import type {Row} from '@/lib/crm';
import styles from './bulk-selection.module.css';

export function SelectionBox({checked,partial=false,label,disabled,onChange}:{checked:boolean;partial?:boolean;label:string;disabled?:boolean;onChange:()=>void}){
 const input=useRef<HTMLInputElement>(null);useEffect(()=>{if(input.current)input.current.indeterminate=partial;},[partial]);
 return <input ref={input} className={styles.checkbox} type="checkbox" checked={checked} aria-label={label} disabled={disabled} onChange={onChange}/>;
}
export function SelectionBar({count,busy,onClear,onDelete}:{count:number;busy:boolean;onClear:()=>void;onDelete:()=>void}){
 return <div className={styles.bar}><strong>{count.toLocaleString('fa-IR')} مورد انتخاب شده</strong><Button type="button" size="sm" variant="destructive" disabled={busy} onClick={onDelete}><Trash2 size={14}/>حذف انتخاب‌شده‌ها</Button><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onClear}><X size={14}/>لغو انتخاب</Button></div>;
}
export function BulkDeleteDialog({targets,allRows,onDelete,onDeleted,onClose}:{targets:Row[];allRows:Row[];onDelete:BulkDeleteHandler;onDeleted:(ids:string[])=>void;onClose:()=>void}){
 const [snapshot]=useState(targets),[pending,setPending]=useState(false),[progress,setProgress]=useState({done:0,total:0}),[result,setResult]=useState<BulkDeleteResult|null>(null),[error,setError]=useState('');
 const controller=useRef<AbortController|null>(null);
 const products=snapshot.every(r=>r.kind==='products'),checks=snapshot.map(row=>({row,reason:deletionBlock(row,allRows)})),eligible=checks.filter(c=>!c.reason).map(c=>c.row),blocked=checks.filter(c=>c.reason);
 async function confirm(){if(pending||result)return;setPending(true);setError('');controller.current=new AbortController();
  try{const outcome=await onDelete(eligible,(done,total)=>setProgress({done,total}),controller.current.signal);setResult(outcome);onDeleted(outcome.deleted);}
  catch(e){setError(e instanceof Error?e.message:'عملیات حذف انجام نشد.');}finally{setPending(false);}
 }
 return <Dialog open onOpenChange={open=>{if(!open&&!pending)onClose();}}><DialogContent dir="rtl" className={styles.dialog} onInteractOutside={e=>{if(pending)e.preventDefault();}} onEscapeKeyDown={e=>{if(pending)e.preventDefault();}}><DialogTitle>حذف گروهی {products?'محصولات':'برنامه‌های فورکست'}</DialogTitle><DialogDescription>{products?'محصولات با موجودی صفر و وضعیت غیرفعال از فهرست خارج می‌شوند؛ سوابق مرتبط نگهداری می‌شوند.':'تمام ماه‌های برنامه‌های انتخاب‌شده حذف می‌شوند. خودِ محصولات، مشتریان و موجودی انبار باقی می‌مانند.'}</DialogDescription>
  {!result&&<><div className={styles.summary}><b>{snapshot.length.toLocaleString('fa-IR')} انتخاب‌شده</b><span>{eligible.length.toLocaleString('fa-IR')} قابل حذف</span>{blocked.length>0&&<span>{blocked.length.toLocaleString('fa-IR')} غیرقابل حذف</span>}</div><div className={styles.list} aria-label="موارد انتخاب‌شده برای حذف">{checks.map(({row,reason})=><div key={row.id}><span>{row.data.name}</span><small className={reason?styles.blocked:styles.allowed}>{reason||'قابل حذف'}</small></div>)}</div></>}
  {pending&&<div className={styles.progress} role="status"><progress max={progress.total||1} value={progress.done}/><span>{progress.done.toLocaleString('fa-IR')} از {progress.total.toLocaleString('fa-IR')} بررسی شد</span><Button type="button" variant="outline" size="sm" onClick={()=>controller.current?.abort()}>توقف ادامهٔ حذف</Button></div>}
  {result&&<div aria-live="polite"><p className={styles.result}>{result.deleted.length.toLocaleString('fa-IR')} مورد حذف شد.{result.failed.length>0&&` حذف ${result.failed.length.toLocaleString('fa-IR')} مورد انجام نشد.`}{result.cancelled.length>0&&` ${result.cancelled.length.toLocaleString('fa-IR')} مورد متوقف شد.`}</p>{result.failed.length>0&&<div className={styles.list}>{result.failed.map(item=><div key={item.id}><span>{item.name}</span><small className={styles.blocked}>{item.error}</small></div>)}</div>}{blocked.length>0&&<p className={styles.hint}>{blocked.length.toLocaleString('fa-IR')} مورد دارای مانع، حذف نشد.</p>}</div>}
  {error&&<p role="alert" className={styles.blocked}>{error}</p>}
  <div className={styles.actions}>{!result&&<Button type="button" variant="destructive" disabled={pending||!eligible.length} onClick={confirm}>{pending?'در حال حذف…':`حذف ${eligible.length.toLocaleString('fa-IR')} مورد`}</Button>}<Button type="button" variant="outline" disabled={pending} onClick={onClose}>{result?'بستن':'انصراف'}</Button></div>
 </DialogContent></Dialog>;
}
