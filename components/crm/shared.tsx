'use client';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {Empty,EmptyHeader,EmptyTitle,EmptyDescription} from '@/components/ui/empty';
export const num=(n:number)=>new Intl.NumberFormat('fa-IR',{maximumFractionDigits:2}).format(n);
export const money=(n:number)=>num(n)+' تومان';
export const short=(n:number)=>n>=1e9?num(n/1e9)+' میلیارد':n>=1e6?num(n/1e6)+' میلیون':num(n);
export const date=(s:string)=>s?new Intl.DateTimeFormat('fa-IR',{dateStyle:'medium'}).format(new Date(s.length===10?s+'T12:00:00':s)):'تعیین نشده';
export const roleLabels={admin:'مدیر',sales:'کارشناس فروش',viewer:'مشاهده‌گر'};
export const priorityLabels={low:'کم',normal:'معمولی',high:'زیاد'};
export function Pick({value,onChange,options,label}:{value:string;onChange:(s:string)=>void;options:{value:string;label:string}[];label:string}){
 return <Select dir="rtl" value={value||'none'} onValueChange={v=>onChange(v==='none'?'':v)}><SelectTrigger className="pick" aria-label={label}><SelectValue placeholder={label}/></SelectTrigger><SelectContent>{options.map(o=><SelectItem value={o.value||'none'} key={o.value||'none'}>{o.label}</SelectItem>)}</SelectContent></Select>;
}
export function NoRows({title='هنوز اطلاعاتی ثبت نشده',description='از دکمهٔ بالای صفحه شروع کنید.'}:{title?:string;description?:string}){return <Empty><EmptyHeader><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{description}</EmptyDescription></EmptyHeader></Empty>;}
