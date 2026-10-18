'use client';
import {NumberInput} from '@/components/ui/number-input';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {ProformaFields} from './proforma-fields';
import {PersianDateInput} from './shared';
import type {Data,Kind} from '@/lib/crm';

export function BusinessFields({kind,data,set}:{kind:Kind;data:Data;set:(key:keyof Data,value:unknown)=>void}){
 if(kind==='companies'||kind==='contacts')return <>
  {kind==='companies'&&data.status!=='lead'&&<label>تاریخ شروع همکاری<PersianDateInput value={data.start_date} onChange={v=>set('start_date',v)} ariaLabel="تاریخ شروع همکاری"/></label>}
  <label>وب‌سایت<Input dir="ltr" maxLength={300} value={data.website} onChange={e=>set('website',e.target.value)}/></label>
  {kind==='companies'&&<label>تعداد پرسنل<NumberInput type="number" dir="ltr" min={0} value={data.employee_count} onChange={e=>set('employee_count',Number(e.target.value))}/></label>}
  <label className="full">آدرس<Textarea rows={2} maxLength={1000} value={data.address} onChange={e=>set('address',e.target.value)}/></label>
 </>;
 if(kind==='deals')return <>
 <label>تاریخ قطعی نتیجه<PersianDateInput value={data.closed_on} onChange={v=>set('closed_on',v)} ariaLabel="تاریخ قطعی فروش یا عدم موفقیت"/></label>
 <label>احتمال فروش (درصد)<NumberInput type="number" dir="ltr" min={0} max={100} step="1" value={data.probability} onChange={e=>set('probability',Number(e.target.value))}/></label>
  <label>تاریخ پیش‌بینی فروش<PersianDateInput value={data.estimated_sales_date} onChange={v=>set('estimated_sales_date',v)} ariaLabel="تاریخ پیش‌بینی فروش به شمسی"/></label>
  <label>کمپین موثر<Input maxLength={160} value={data.campaign} onChange={e=>set('campaign',e.target.value)}/></label>
  <label>واحد پول<Input maxLength={20} value={data.currency} onChange={e=>set('currency',e.target.value)}/></label>
 <label className="full">قدم بعدی<Input maxLength={500} placeholder="تماس، ارسال نمونه، جلسه…" value={data.next_step} onChange={e=>set('next_step',e.target.value)}/></label>
 </>;

 if(kind==='proformas')return <ProformaFields data={data} set={set}/>;
 return null;
}
