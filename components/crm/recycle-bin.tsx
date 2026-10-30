'use client';
import {useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {AlertDialog,AlertDialogAction,AlertDialogCancel,AlertDialogContent,AlertDialogDescription,AlertDialogFooter,AlertDialogTitle} from '@/components/ui/alert-dialog';
import {date} from './shared';
type TrashEntry={id:string;object_id:string;kind:'record'|'return'|'sample'|'sample_round'|'product_archive';label:string;deleted_at:string};
const labels:Record<TrashEntry['kind'],string>={record:'رکورد',return:'برگشتی',sample:'پرونده نمونه',sample_round:'ارسال نمونه',product_archive:'محصول'};
async function request(body?:unknown){const r=await fetch('/api/trash',{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d.error||'عملیات انجام نشد.');return d;}
export function RecycleBin({onChanged}:{onChanged:()=>Promise<void>}){
 const [rows,setRows]=useState<TrashEntry[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[selected,setSelected]=useState<TrashEntry|null>(null);
 async function reload(){const result=await request();setRows(result.rows);}
 useEffect(()=>{let active=true;request().then(d=>{if(active)setRows(d.rows);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
 async function restore(){if(!selected||busy)return;setBusy(true);setError('');setNotice('');try{await request({id:selected.id});setSelected(null);await Promise.all([reload(),onChanged()]);setNotice('مورد انتخاب‌شده بازیابی شد.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <article className="panel"><h2>سطل بازیافت</h2><p className="settings-copy">مواردی که پس از فعال‌شدن این بخش حذف می‌شوند اینجا قرار می‌گیرند. بازیابی برگشتی یا محصول، موجودی انبار را تغییر نمی‌دهد.</p>{loading&&<p className="muted">در حال دریافت…</p>}{!loading&&!rows.length&&<p className="muted">مورد حذف‌شده‌ای وجود ندارد.</p>}{rows.map(row=><div className="member-row wrap" key={row.id}><span><b>{row.label}</b> · {labels[row.kind]} · {date(row.deleted_at)}</span><Button variant="outline" disabled={busy} onClick={()=>setSelected(row)}>بازیابی</Button></div>)}{notice&&<p className="notice" role="status">{notice}</p>}{error&&<p className="error" role="alert">{error}</p>}
 <AlertDialog open={!!selected} onOpenChange={open=>{if(!open&&!busy)setSelected(null);}}><AlertDialogContent dir="rtl"><AlertDialogTitle>بازیابی مورد حذف‌شده</AlertDialogTitle><AlertDialogDescription>{selected&&<>«{selected.label}» بازیابی شود؟ اگر پرونده‌های مرتبط حذف شده‌اند، ابتدا آن‌ها را بازیابی کنید. موجودی انبار تغییر نمی‌کند.</>}</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel disabled={busy}>انصراف</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={e=>{e.preventDefault();void restore();}}>بازیابی</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </article>;
}
