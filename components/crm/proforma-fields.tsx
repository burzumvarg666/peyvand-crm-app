'use client';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {PersianDateInput,Pick} from './shared';
import type {Data} from '@/lib/crm';
export function ProformaFields({data,set}:{data:Data;set:(key:keyof Data,value:unknown)=>void}){
 return <>
  <label>شماره نامه<Input dir="ltr" maxLength={80} value={data.letter_number} onChange={e=>set('letter_number',e.target.value)}/></label>
  <label>تاریخ<PersianDateInput value={data.quote_date} onChange={v=>set('quote_date',v)} ariaLabel="تاریخ پیش‌فاکتور"/></label>
  <label>وضعیت پرداخت<Pick label="وضعیت پرداخت" value={data.payment_status} onChange={v=>set('payment_status',v)} options={[{value:'unpaid',label:'پرداخت‌نشده'},{value:'partial',label:'تسویهٔ ناقص'},{value:'paid',label:'تسویه‌شده'}]}/></label>
  <label>روش تسویه<Input maxLength={120} value={data.payment_method} onChange={e=>set('payment_method',e.target.value)}/></label>
  <label className="full">زمان و شرایط تحویل<Input maxLength={1000} value={data.delivery_terms} onChange={e=>set('delivery_terms',e.target.value)}/></label>
  <label>فکس خریدار<Input dir="ltr" maxLength={50} value={data.buyer_fax} onChange={e=>set('buyer_fax',e.target.value)}/></label>
  <label className="full">آدرس مشتری در پیش‌فاکتور<Textarea rows={2} maxLength={1000} placeholder="اگر خالی باشد، آدرس پرونده مشتری چاپ می‌شود" value={data.billing_address} onChange={e=>set('billing_address',e.target.value)}/></label>
  <label className="full">شرایط و ضوابط<Textarea rows={2} maxLength={3000} value={data.terms} onChange={e=>set('terms',e.target.value)}/></label>
  <details className="full quote-extra-fields"><summary>مشخصات فروشنده و اطلاعات بانکی (اختیاری)</summary><div className="form-grid">
   <p className="full">شرکت رنگ کانسای ایرانیان</p>
   <label>تلفن فروشنده<Input dir="ltr" maxLength={100} value={data.seller_phone} onChange={e=>set('seller_phone',e.target.value)}/></label>
   <label>کد پستی فروشنده<Input dir="ltr" maxLength={30} value={data.seller_postal_code} onChange={e=>set('seller_postal_code',e.target.value)}/></label>
   <label className="full">آدرس فروشنده<Textarea rows={2} maxLength={1000} value={data.seller_address} onChange={e=>set('seller_address',e.target.value)}/></label>
   <label>نام بانک<Input maxLength={120} value={data.bank_name} onChange={e=>set('bank_name',e.target.value)}/></label>
   <label>صاحب حساب<Input maxLength={160} value={data.account_holder} onChange={e=>set('account_holder',e.target.value)}/></label>
   <label>شماره حساب<Input dir="ltr" maxLength={80} value={data.account_number} onChange={e=>set('account_number',e.target.value)}/></label>
   <label>شماره شبا<Input dir="ltr" maxLength={40} value={data.iban} onChange={e=>set('iban',e.target.value)}/></label>
  </div></details>
 </>;
}
