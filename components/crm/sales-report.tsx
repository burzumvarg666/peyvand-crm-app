'use client';
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Pick,PersianDateInput,date,num} from './shared';
import {stageLabels,type Row} from '@/lib/crm';

export function SalesReport({rows,onOpen,onExport}:{rows:Row[];onOpen:(id:string)=>void;onExport:(rows:Row[])=>void}){
 const [from,setFrom]=useState(''),[to,setTo]=useState(''),[stage,setStage]=useState('won');
 const invalid=Boolean(from&&to&&from>to);
 const filtered=rows.filter(r=>r.kind==='deals'&&!invalid&&(!from||r.data.closed_on>=from)&&(!to||Boolean(r.data.closed_on)&&r.data.closed_on<=to)&&(stage==='all'||r.data.stage===stage)).sort((a,b)=>b.created_at.localeCompare(a.created_at));
 const won=filtered.filter(r=>r.data.stage==='won').reduce((sum,r)=>sum+r.data.amount,0);
 return <section className="panel"><p className="settings-copy">گزارش جزئیات فرصت‌ها بر اساس تاریخ قطعی نتیجه و وضعیت فعلی؛ مبالغ به تومان است و دریافت وجه را نشان نمی‌دهد.</p><div className="form-grid"><label>از تاریخ نتیجه<PersianDateInput value={from} onChange={setFrom}/></label><label>تا تاریخ نتیجه<PersianDateInput value={to} onChange={setTo}/></label><label>مرحله فروش<Pick label="مرحله گزارش فروش" value={stage} onChange={setStage} options={[{value:'all',label:'همه مراحل'},...Object.entries(stageLabels).map(([value,label])=>({value,label}))]}/></label></div>{invalid&&<p role="alert" className="error">تاریخ پایان باید بعد از تاریخ شروع باشد.</p>}<div className="row wrap"><span>{num(filtered.length)} فرصت · مبلغ فرصت‌های موفق: {num(won)} تومان</span><Button variant="outline" disabled={!filtered.length} onClick={()=>onExport(filtered)}>خروجی Excel همین گزارش</Button><Button variant="ghost" onClick={()=>{setFrom('');setTo('');setStage('all');}}>پاک‌کردن فیلترها</Button></div><div style={{overflowX:'auto',marginTop:20}}><table style={{width:'100%',textAlign:'right'}}><thead><tr>{['ردیف','فرصت فروش','مشتری','تاریخ نتیجه','مرحله','مبلغ (تومان)'].map(t=><th key={t} style={{padding:12}}>{t}</th>)}</tr></thead><tbody>{filtered.map((r,i)=><tr key={r.id}><td>{num(i+1)}</td><td><Button variant="link" onClick={()=>onOpen(r.id)}>{r.data.name}</Button></td><td>{rows.find(p=>p.id===r.parent_id)?.data.name||'—'}</td><td>{r.data.closed_on?date(r.data.closed_on):'ثبت نشده'}</td><td>{stageLabels[r.data.stage]}</td><td>{num(r.data.amount)}</td></tr>)}</tbody></table>{!filtered.length&&<p className="settings-copy">فرصتی مطابق این فیلترها وجود ندارد.</p>}</div></section>;
}
