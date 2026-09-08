'use client';
import {useEffect,useState} from 'react';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {Button} from '@/components/ui/button';
import {Popover,PopoverTrigger,PopoverContent} from '@/components/ui/popover';
import {CalendarDays,ChevronLeft,ChevronRight} from 'lucide-react';
import {Empty,EmptyHeader,EmptyTitle,EmptyDescription} from '@/components/ui/empty';
export const num=(n:number)=>new Intl.NumberFormat('fa-IR',{maximumFractionDigits:2}).format(n);
export const money=(n:number)=>num(n)+' تومان';
export const short=(n:number)=>n>=1e9?num(n/1e9)+' میلیارد':n>=1e6?num(n/1e6)+' میلیون':num(n);
const normalizeDigits=(value:string)=>value.replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632));
const toPersianDigits=(value:string)=>value.replace(/\d/g,c=>'۰۱۲۳۴۵۶۷۸۹'[Number(c)]);
const pad=(n:number)=>String(n).padStart(2,'0');
const isoParts=(s:string)=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(s);return m?{gy:Number(m[1]),gm:Number(m[2]),gd:Number(m[3])}:null;};
const jalaliFormatter=new Intl.DateTimeFormat('en-US-u-ca-persian',{year:'numeric',month:'2-digit',day:'2-digit',numberingSystem:'latn',timeZone:'UTC'});
const jalaliParts=(value:Date)=>{const parts=Object.fromEntries(jalaliFormatter.formatToParts(value).map(p=>[p.type,p.value]));return {year:parts.year,month:parts.month,day:parts.day};};
export function toPersianDate(value:string){const p=isoParts(value);if(!p)return '';const j=jalaliParts(new Date(Date.UTC(p.gy,p.gm-1,p.gd)));return toPersianDigits(`${j.year}/${j.month}/${j.day}`);}
export function fromPersianDate(value:string){const raw=normalizeDigits(value).trim().replace(/[.-]/g,'/');if(!raw)return '';const m=/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(raw);if(!m)return '';const target=m[1]+'/'+pad(Number(m[2]))+'/'+pad(Number(m[3]));const start=Date.UTC(Number(m[1])+621,0,1);for(let i=0;i<=740;i++){const candidate=new Date(start+i*86400000),parts=jalaliParts(candidate);if(parts.year+'/'+parts.month+'/'+parts.day===target)return candidate.getUTCFullYear()+'-'+pad(candidate.getUTCMonth()+1)+'-'+pad(candidate.getUTCDate());}return '';}
export const date=(s:string)=>s?new Intl.DateTimeFormat('fa-IR-u-ca-persian',{dateStyle:'medium'}).format(new Date(s.length===10?s+'T12:00:00':s)):'تعیین نشده';
export function PersianDateInput({value,onChange,ariaLabel='تاریخ'}:{value:string;onChange:(value:string)=>void;ariaLabel?:string}){
 const [open,setOpen]=useState(false);
 const [month,setMonth]=useState(()=>new Date(value?value+'T12:00:00Z':Date.now()));
 useEffect(()=>{if(value)setMonth(new Date(value+'T12:00:00Z'));},[value]);
 const day=Number(jalaliParts(month).day);
 const first=new Date(month.getTime()-(day-1)*86400000);
 const nextMonth=new Date(first.getTime()+32*86400000);
 const nextFirst=new Date(nextMonth.getTime()-(Number(jalaliParts(nextMonth).day)-1)*86400000);
 const count=Math.round((nextFirst.getTime()-first.getTime())/86400000);
 const offset=(first.getUTCDay()+1)%7;
 const iso=(d:Date)=>d.toISOString().slice(0,10);
 const choose=(d:string)=>{onChange(d);setOpen(false);};
 return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button type="button" variant="outline" className="w-full justify-between font-normal" aria-label={ariaLabel}>{value?date(value):'انتخاب تاریخ'}<CalendarDays size={17}/></Button></PopoverTrigger><PopoverContent dir="rtl" className="w-80 p-3">
 <div className="flex items-center justify-between mb-3"><Button type="button" variant="ghost" size="icon" aria-label="ماه قبل" onClick={()=>setMonth(new Date(first.getTime()-86400000))}><ChevronRight size={18}/></Button><strong>{new Intl.DateTimeFormat('fa-IR-u-ca-persian',{year:'numeric',month:'long',timeZone:'UTC'}).format(month)}</strong><Button type="button" variant="ghost" size="icon" aria-label="ماه بعد" onClick={()=>setMonth(nextFirst)}><ChevronLeft size={18}/></Button></div>
 <div className="grid grid-cols-7 gap-1 text-center">{['ش','ی','د','س','چ','پ','ج'].map((d,i)=><span key={i} className="text-sm text-muted-foreground">{d}</span>)}{Array.from({length:offset},(_,i)=><span key={'blank'+i}/>)}{Array.from({length:count},(_,i)=>{const d=new Date(first.getTime()+i*86400000),key=iso(d);return <Button key={key} type="button" variant={value===key?'default':'ghost'} className="p-0 h-9 w-full" aria-label={date(key)} aria-pressed={value===key} onClick={()=>choose(key)}>{num(i+1)}</Button>;})}</div>
 <div className="flex justify-between mt-3"><Button type="button" variant="ghost" onClick={()=>{const now=new Date();choose(now.getFullYear()+'-'+pad(now.getMonth()+1)+'-'+pad(now.getDate()));}}>امروز</Button><Button type="button" variant="ghost" onClick={()=>choose('')}>پاک کردن</Button></div>
 </PopoverContent></Popover>;
}
export const roleLabels={admin:'مدیر',sales:'کارشناس فروش',viewer:'مشاهده‌گر'};
export const priorityLabels={low:'کم',normal:'معمولی',high:'زیاد'};
export function Pick({value,onChange,options,label}:{value:string;onChange:(s:string)=>void;options:{value:string;label:string}[];label:string}){
 return <Select dir="rtl" value={value||'none'} onValueChange={v=>onChange(v==='none'?'':v)}><SelectTrigger className="pick" aria-label={label}><SelectValue placeholder={label}/></SelectTrigger><SelectContent>{options.map(o=><SelectItem value={o.value||'none'} key={o.value||'none'}>{o.label}</SelectItem>)}</SelectContent></Select>;
}
export function NoRows({title='هنوز اطلاعاتی ثبت نشده',description='از دکمهٔ بالای صفحه شروع کنید.'}:{title?:string;description?:string}){return <Empty><EmptyHeader><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{description}</EmptyDescription></EmptyHeader></Empty>;}
