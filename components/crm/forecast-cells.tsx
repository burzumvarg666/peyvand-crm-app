'use client';
import {useState,type FormEvent} from 'react';
import {Check,Pencil,Trash2,X} from 'lucide-react';
import {Line,LineChart,CartesianGrid,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import {Button} from '@/components/ui/button';
import {NumberInput} from '@/components/ui/number-input';
import {Popover,PopoverContent,PopoverTrigger} from '@/components/ui/popover';
import {forecastComparison,forecastMonthLabel,forecastNumber,forecastWindow,mergeForecastMonths} from '@/lib/forecast';
import type {Data,Row} from '@/lib/crm';
import styles from './forecast-workspace.module.css';

export type ForecastSave=(data:Data,parent:string,row?:Row)=>Promise<boolean>;
export function QuantityCell({row,month,field,canEdit,busy,onSave}:{row:Row;month:string;field:'quantity'|'actual_quantity';canEdit:boolean;busy:boolean;onSave:ForecastSave}){
 const cell=row.data.forecast_months.find(m=>m.month===month),value=cell?.[field]??null;
 const [open,setOpen]=useState(false),[draft,setDraft]=useState(''),[error,setError]=useState('');
 const title=field==='quantity'?'مقدار برنامه':'ارسال واقعی';
 async function submit(event:FormEvent){event.preventDefault();if(busy)return;setError('');
  const number=draft===''?null:Number(draft);
  if(number!==null&&(!Number.isFinite(number)||number<0||number>1e12)){setError('عدد باید بین صفر و یک تریلیون باشد.');return;}
  try{const forecast_months=mergeForecastMonths(row.data.forecast_months,[{...cell,month,quantity:cell?.quantity??null,amount:cell?.amount??null,[field]:number}]);
   if(await onSave({...row.data,forecast_months},row.parent_id!,row))setOpen(false);else setError('ذخیره نشد؛ پیام خطا را بررسی کنید.');
  }catch{setError('مقدار معتبر نیست.');}
 }
 if(!canEdit)return <bdi dir="ltr" className={value===null?styles.missing:styles.numeric}>{forecastNumber(value)}</bdi>;
 return <Popover open={open} onOpenChange={next=>{if(!busy){if(next){setDraft(value===null?'':String(value));setError('');}setOpen(next);}}}><PopoverTrigger asChild><button className={`${styles.editable} ${value===null?styles.emptyValue:''}`} disabled={busy} aria-label={`ویرایش ${title} ${row.data.name}`}><bdi dir="ltr">{value===null?(field==='actual_quantity'?'ثبت ارسال':'ثبت برنامه'):forecastNumber(value)}</bdi><Pencil size={12}/></button></PopoverTrigger><PopoverContent dir="rtl" align="end" className={styles.cellPopover} onInteractOutside={e=>{if(busy)e.preventDefault();}} onEscapeKeyDown={e=>{if(busy)e.preventDefault();}}><form onSubmit={submit}><label>{title} <span>کیلوگرم · {forecastMonthLabel(month)}</span><NumberInput autoFocus aria-label={`${title} کیلوگرم`} value={draft} min={0} max={1e12} placeholder="ثبت نشده" disabled={busy} onChange={e=>setDraft(e.target.value)}/></label><p>{field==='actual_quantity'?'جمع ارسال این ماه را وارد کنید؛ صفر یعنی ارسال نداشتیم.':'مقدار نهایی برنامه را وارد کنید؛ نوع برنامه از بخش ویرایش قابل تغییر است.'}</p>{error&&<p role="alert" className={styles.errorText}>{error}</p>}<div><Button type="submit" size="sm" disabled={busy}><Check size={14}/>{busy?'ذخیره…':'ذخیره'}</Button><Button type="button" variant="ghost" size="sm" disabled={busy} onClick={()=>setOpen(false)}><X size={14}/>انصراف</Button></div></form></PopoverContent></Popover>;
}

export function Difference({delta,percent}:{delta:number|null;percent:number|null}){
 if(delta===null)return <span className={styles.missing}>قابل مقایسه نیست</span>;
 if(delta===0)return <span className={styles.balanced}><Check size={13}/>مطابق برنامه</span>;
 return <span className={delta<0?styles.deficit:styles.surplus}><strong><bdi dir="ltr">{forecastNumber(Math.abs(delta))}</bdi> {delta<0?'کسری':'مازاد'}</strong>{percent!==null&&<small><bdi dir="ltr">{forecastNumber(Math.abs(percent))}%</bdi> {delta<0?'کمتر':'بیشتر'} از برنامه</small>}</span>;
}

export function ForecastRowDetails({row,month,busy,canEdit,canDelete,onEdit,onDelete}:{row:Row;month:string;busy:boolean;canEdit:boolean;canDelete:boolean;onEdit:()=>void;onDelete:()=>void}){
 const current=row.data.forecast_months.find(c=>c.month===month),months=forecastWindow(month);
 const chart=months.map(m=>{const c=forecastComparison(row.data.forecast_months.find(v=>v.month===m));return {month:forecastMonthLabel(m),planned:c.planned,actual:c.actual};});
 return <div className={styles.details}>
  <div className={styles.trend}><header><h4>روند این ماده در ۶ ماه</h4><span><i/>برنامه <i/>ارسال واقعی</span></header><div dir="ltr" className={styles.trendChart}><ResponsiveContainer width="100%" height="100%"><LineChart data={chart} margin={{left:0,right:12,top:12,bottom:0}} accessibilityLayer><CartesianGrid vertical={false} stroke="#e5ece7" strokeDasharray="3 3"/><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fontSize:10,fill:'#7a8c83'}}/><YAxis axisLine={false} tickLine={false} width={62} tick={{fontSize:10,fill:'#7a8c83'}} tickFormatter={n=>new Intl.NumberFormat('en-US',{notation:'compact'}).format(n)}/><Tooltip formatter={(v,name)=>[`${forecastNumber(Number(v))} kg`,name==='planned'?'برنامه':'ارسال واقعی']}/><Line type="monotone" dataKey="planned" stroke="#83aa96" strokeWidth={2} dot={{r:3}} isAnimationActive={false}/><Line type="monotone" dataKey="actual" stroke="#175747" strokeWidth={2.5} dot={{r:4}} isAnimationActive={false}/></LineChart></ResponsiveContainer></div></div>
  <aside><h4>جزئیات برنامهٔ ماه</h4><dl><div><dt>گروه مواد</dt><dd>{row.data.forecast_material||'—'}</dd></div><div><dt>دسته</dt><dd>{row.data.category||'—'}</dd></div><div><dt>تولید مشتری (Prod)</dt><dd dir="ltr">{forecastNumber(current?.production)}</dd></div><div><dt>ضریب مصرف (Cons)</dt><dd dir="ltr">{current?.consumption==null?'—':new Intl.NumberFormat('en-US',{maximumSignificantDigits:6}).format(current.consumption)}</dd></div></dl>{row.data.description&&<p className={styles.note}>{row.data.description}</p>}<div className={styles.detailActions}>{canEdit&&<Button size="sm" variant="outline" disabled={busy} onClick={onEdit}><Pencil size={13}/>ویرایش برنامه</Button>}{canDelete&&<Button size="sm" variant="ghost" className={styles.delete} disabled={busy} onClick={onDelete}><Trash2 size={13}/>حذف ردیف</Button>}</div></aside>
 </div>;
}
