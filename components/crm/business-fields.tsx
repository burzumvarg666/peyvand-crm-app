'use client';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {PersianDateInput,Pick} from './shared';
import type {Data,Kind} from '@/lib/crm';

export function BusinessFields({kind,data,set}:{kind:Kind;data:Data;set:(key:keyof Data,value:unknown)=>void}){
 if(kind==='companies'||kind==='contacts')return <>
  {kind==='companies'&&data.status!=='lead'&&<label>تاریخ شروع همکاری<PersianDateInput value={data.start_date} onChange={v=>set('start_date',v)} ariaLabel="تاریخ شروع همکاری"/></label>}
  <label>وب‌سایت<Input dir="ltr" maxLength={300} value={data.website} onChange={e=>set('website',e.target.value)}/></label>
  <label>منبع سرنخ<Input maxLength={120} placeholder="نمایشگاه، تماس ورودی…" value={data.lead_source} onChange={e=>set('lead_source',e.target.value)}/></label>
  <label>رتبهٔ سرنخ<Pick label="رتبهٔ سرنخ" value={data.lead_rank} onChange={v=>set('lead_rank',v)} options={[{value:'cold',label:'سرد'},{value:'warm',label:'گرم'},{value:'hot',label:'داغ'}]}/></label>
  {kind==='companies'&&<label>تعداد پرسنل<Input type="number" dir="ltr" min={0} value={data.employee_count} onChange={e=>set('employee_count',Number(e.target.value))}/></label>}
  <label className="full">آدرس<Textarea rows={2} maxLength={1000} value={data.address} onChange={e=>set('address',e.target.value)}/></label>
 </>;
 if(kind==='deals')return <>
 <label>احتمال فروش (درصد)<Input type="number" dir="ltr" min={0} max={100} step="1" value={data.probability} onChange={e=>set('probability',Number(e.target.value))}/></label>
  <label>تاریخ پیش‌بینی فروش<PersianDateInput value={data.estimated_sales_date} onChange={v=>set('estimated_sales_date',v)} ariaLabel="تاریخ پیش‌بینی فروش به شمسی"/></label>
  <label>کمپین موثر<Input maxLength={160} value={data.campaign} onChange={e=>set('campaign',e.target.value)}/></label>
  <label>منبع سرنخ<Input maxLength={120} value={data.lead_source} onChange={e=>set('lead_source',e.target.value)}/></label>
  <label>واحد پول<Input maxLength={20} value={data.currency} onChange={e=>set('currency',e.target.value)}/></label>
 <label className="full">قدم بعدی<Input maxLength={500} placeholder="تماس، ارسال نمونه، جلسه…" value={data.next_step} onChange={e=>set('next_step',e.target.value)}/></label>
 </>;

 if(kind==='proformas')return <>
  <label>وضعیت پرداخت<Pick label="وضعیت پرداخت" value={data.payment_status} onChange={v=>set('payment_status',v)} options={[{value:'unpaid',label:'پرداخت‌نشده'},{value:'partial',label:'تسویهٔ ناقص'},{value:'paid',label:'تسویه‌شده'}]}/></label>
  <label>روش تسویه<Input maxLength={120} value={data.payment_method} onChange={e=>set('payment_method',e.target.value)}/></label>
  <label>نمایندهٔ خریدار<Input maxLength={160} value={data.buyer_representative} onChange={e=>set('buyer_representative',e.target.value)}/></label>
  <label>کد اقتصادی<Input dir="ltr" maxLength={80} value={data.economic_code} onChange={e=>set('economic_code',e.target.value)}/></label>
  <label>فکس خریدار<Input dir="ltr" maxLength={50} value={data.buyer_fax} onChange={e=>set('buyer_fax',e.target.value)}/></label>
  <label className="full">آدرس صورت‌حساب<Textarea rows={2} maxLength={1000} value={data.billing_address} onChange={e=>set('billing_address',e.target.value)}/></label>
  <label className="full">شرایط و ضوابط<Textarea rows={2} maxLength={3000} value={data.terms} onChange={e=>set('terms',e.target.value)}/></label>
 </>;
 return null;
}
