'use client';
import {useState,type FormEvent} from 'react';
import {Bar,BarChart,CartesianGrid,Legend,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import {Pencil,Search,ChevronLeft,ChevronRight} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {NumberInput} from '@/components/ui/number-input';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {Pick} from './shared';
import {forecastBasisLabel,forecastComparison,forecastComparisonTotals,forecastMonthLabel,forecastNumber,mergeForecastMonths} from '@/lib/forecast';
import type {Data,Row} from '@/lib/crm';
import styles from './forecast-workspace.module.css';

type Save=(data:Data,parent:string,row?:Row)=>Promise<boolean>;
const normalize=(s:string)=>s.toLowerCase().replace(/ي/g,'ی').replace(/ك/g,'ک').trim();
function Delta({value,percent=false}:{value:number|null;percent?:boolean}){return <bdi dir="ltr" className={value===null?styles.unset:value<0?styles.shortfall:styles.surplus}>{value===null?'—':`${value>0?'+':''}${forecastNumber(value)}${percent?'%':''}`}</bdi>;}

function ActualEditor({row,month,busy,onSave,onClose}:{row:Row;month:string;busy:boolean;onSave:Save;onClose:()=>void}){
 const saved=row.data.forecast_months.find(c=>c.month===month);
 const [value,setValue]=useState<string|number>(saved?.actual_quantity??''),[error,setError]=useState('');
 const comparison=forecastComparison({...saved,month,quantity:saved?.quantity??null,amount:saved?.amount??null,actual_quantity:value===''?null:Number(value)});
 async function submit(event:FormEvent){event.preventDefault();if(busy)return;setError('');
  try{const forecast_months=mergeForecastMonths(row.data.forecast_months,[{...saved,month,quantity:saved?.quantity??null,amount:saved?.amount??null,actual_quantity:value===''?null:Number(value)}]);
   if(await onSave({...row.data,forecast_months},row.parent_id!,row))onClose();
  }catch{setError('مقدار ارسال باید عددی بین صفر و یک تریلیون کیلوگرم باشد.');}
 }
 return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose();}}><DialogContent dir="rtl" className={styles.actualEditor} onInteractOutside={e=>{if(busy)e.preventDefault();}} onEscapeKeyDown={e=>{if(busy)e.preventDefault();}}><DialogTitle>ثبت ارسال واقعی ماهانه</DialogTitle><DialogDescription>{row.data.name} · {forecastMonthLabel(month)}</DialogDescription><form onSubmit={submit}><fieldset disabled={busy} className={styles.fields}>
  <p className={styles.explanation}>{forecastBasisLabel(saved)}: <bdi dir="ltr">{forecastNumber(saved?.quantity)} kg</bdi></p>
  <label className={styles.noteLabel}>جمع ارسال واقعی این ماه (کیلوگرم)<NumberInput aria-label="مقدار ارسال واقعی کیلوگرم" value={value} min={0} max={1e12} placeholder="ثبت نشده" onChange={e=>setValue(e.target.value)}/></label>
  <p className={styles.explanation}>مقدار تجمیعی ماه را وارد کنید. خالی یعنی ثبت‌نشده؛ صفر یعنی ارسال انجام نشده است. این ثبت، موجودی انبار را تغییر نمی‌دهد.</p>
  <div className={styles.actualPreview}><span>اختلاف ارسال با مبنا</span><Delta value={comparison.delta}/><span>kg</span><Delta value={comparison.percent} percent/></div>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  <div className={styles.formActions}><Button type="submit" disabled={busy}>{busy?'در حال ذخیره…':'ذخیره ارسال واقعی'}</Button><Button type="button" variant="outline" disabled={busy} onClick={onClose}>انصراف</Button></div>
 </fieldset></form></DialogContent></Dialog>;
}

export function ForecastComparison({rows,months,month,canEdit,busy,onSave}:{rows:Row[];months:string[];month:string;canEdit:boolean;busy:boolean;onSave:Save}){
 const [query,setQuery]=useState(''),[customer,setCustomer]=useState('all'),[material,setMaterial]=useState('all'),[page,setPage]=useState(0),[editing,setEditing]=useState<Row|null>(null);
 const byId=new Map(rows.map(r=>[r.id,r]));
 const all=rows.filter(r=>r.kind==='forecasts'),customerIds=new Set(all.map(r=>r.parent_id));
 const filtered=all.filter(r=>(customer==='all'||r.parent_id===customer)&&(material==='all'||r.data.forecast_material===material)&&normalize([r.data.name,r.data.category,r.data.forecast_material,byId.get(r.parent_id||'')?.data.name,byId.get(r.data.forecast_product_id)?.data.name].join(' ')).includes(normalize(query)));
 const stats=forecastComparisonTotals(filtered,month),pages=Math.max(1,Math.ceil(filtered.length/15)),current=Math.min(page,pages-1);
 const chart=months.map(m=>{const s=forecastComparisonTotals(filtered,m);return {month:forecastMonthLabel(m),planned:s.matchedCount?s.matchedPlanned:null,actual:s.matchedCount?s.matchedActual:null};});
 const change=(setter:(value:string)=>void)=>(value:string)=>{setter(value);setPage(0);};
 return <>
  <div className={styles.metrics}><article><span>مبنای ثبت‌شدهٔ ماه</span><strong dir="ltr">{stats.plannedCount?forecastNumber(stats.planned):'—'} kg</strong><small>{forecastMonthLabel(month)} · پیش‌بینی یا سفارش قطعی هر ردیف</small></article><article><span>جمع ارسال واقعی ثبت‌شده</span><strong dir="ltr">{stats.actualCount?forecastNumber(stats.actual):'—'} kg</strong><small>{stats.actualCount.toLocaleString('fa-IR')} از {filtered.length.toLocaleString('fa-IR')} ردیف دارای مقدار ارسال</small></article><article><span>اختلاف ردیف‌های قابل مقایسه</span><strong><Delta value={stats.delta}/> <small>kg</small></strong><small><Delta value={stats.percent} percent/> · {stats.matchedCount.toLocaleString('fa-IR')} ردیف با مبنا و ارسال ثبت‌شده</small></article></div>
  <article className={`panel ${styles.chartPanel}`}><div className={styles.chartHeading}><div><h3>مقایسهٔ مبنا و ارسال واقعی</h3><p>فقط ردیف‌هایی که هر دو مقدار را دارند؛ نبود ارسال به‌معنی صفر نیست.</p></div></div>{chart.some(m=>m.actual!==null)?<div className={styles.chart} dir="ltr"><ResponsiveContainer width="100%" height="100%"><BarChart data={chart} accessibilityLayer><CartesianGrid vertical={false} strokeDasharray="3 3"/><XAxis dataKey="month" fontSize={11}/><YAxis width={80} fontSize={11} tickFormatter={n=>new Intl.NumberFormat('en-US',{notation:'compact'}).format(n)}/><Tooltip formatter={v=>`${forecastNumber(Number(v))} kg`}/><Legend/><Bar isAnimationActive={false} dataKey="planned" name="مبنا" fill="#a8cbbb" radius={[4,4,0,0]}/><Bar isAnimationActive={false} dataKey="actual" name="ارسال واقعی" fill="#175747" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div>:<div className={styles.chartEmpty}>پس از ثبت ارسال واقعی، نمودار مقایسه نمایش داده می‌شود.</div>}</article>
  <article className={`panel ${styles.tablePanel}`}><div className={styles.tableHeading}><div><h3>ارسال واقعی و اختلاف · <bdi dir="ltr">{forecastMonthLabel(month)}</bdi></h3><p>اختلاف = ارسال واقعی − مبنا · منفی: کسری ارسال · مثبت: ارسال بیشتر از مبنا · درصد نسبت به مبنا</p></div></div>
   <div className={styles.filters}><label className={styles.search}><Search size={16}/><Input aria-label="جست‌وجوی مقایسه ارسال" value={query} onChange={e=>change(setQuery)(e.target.value)} placeholder="مشتری یا ماده…"/></label><Pick label="مشتری مقایسه ارسال" value={customer} onChange={change(setCustomer)} options={[{value:'all',label:'همه مشتریان'},...rows.filter(r=>customerIds.has(r.id)).map(r=>({value:r.id,label:r.data.name}))]}/><Pick label="گروه مواد مقایسه" value={material} onChange={change(setMaterial)} options={[{value:'all',label:'همه گروه‌های مواد'},...[...new Set(all.map(r=>r.data.forecast_material).filter(Boolean))].sort().map(m=>({value:m,label:m}))]}/></div>
   <div className={`${styles.tableScroll} ${styles.comparisonTable}`} role="region" aria-label="جدول اختلاف ارسال ماهانه" tabIndex={0}><table><thead><tr>{['مشتری / ماده','نوع مبنا','مقدار مبنا (kg)','ارسال واقعی (kg)','اختلاف (kg)','اختلاف (%)',...(canEdit?['عملیات']:[])].map(h=><th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{filtered.slice(current*15,(current+1)*15).map(row=>{const cell=row.data.forecast_months.find(c=>c.month===month),c=forecastComparison(cell);return <tr key={row.id}><th scope="row"><b>{byId.get(row.parent_id||'')?.data.name}</b><span>{byId.get(row.data.forecast_product_id)?.data.name||row.data.name}</span><small>{row.data.forecast_material} · {row.data.category}</small></th><td><span className={cell?.basis==='otm'?styles.otm:styles.basis}>{forecastBasisLabel(cell)}</span></td><td dir="ltr">{forecastNumber(c.planned)}</td><td dir="ltr">{forecastNumber(c.actual)}</td><td><Delta value={c.delta}/></td><td><Delta value={c.percent} percent/></td>{canEdit&&<td><Button variant="outline" size="sm" disabled={busy} aria-label={`ثبت ارسال واقعی ${row.data.name}`} onClick={()=>setEditing(row)}><Pencil size={14}/>{c.actual===null?'ثبت ارسال':'ویرایش ارسال'}</Button></td>}</tr>;})}</tbody></table></div>
   {!filtered.length&&<p className={styles.explanation}>ردیفی مطابق فیلترها وجود ندارد.</p>}
   <p className={styles.explanation}>برای مبنای صفر، درصد اختلاف تعریف نمی‌شود؛ اختلاف مقدار همچنان نمایش داده می‌شود.</p>
   <div className={styles.pagination}><span>{filtered.length.toLocaleString('fa-IR')} ردیف</span><Button variant="ghost" size="icon-sm" aria-label="صفحه قبل مقایسه" disabled={current===0} onClick={()=>setPage(current-1)}><ChevronRight size={17}/></Button><span>{current+1} / {pages}</span><Button variant="ghost" size="icon-sm" aria-label="صفحه بعد مقایسه" disabled={current>=pages-1} onClick={()=>setPage(current+1)}><ChevronLeft size={17}/></Button></div>
  </article>
  {editing&&<ActualEditor key={editing.id+month} row={editing} month={month} busy={busy} onSave={onSave} onClose={()=>setEditing(null)}/>}
 </>;
}
