'use client';
import {Plus,Trash2,Package} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {NumberInput} from '@/components/ui/number-input';
import {quoteAmounts,type Data,type ProformaItem} from '@/lib/crm';
import {rial} from '@/lib/proforma-money';
import {num} from './shared';
export function ProformaLines({data,onItems,onChoose}:{data:Data;onItems:(items:ProformaItem[])=>void;onChoose:()=>void}){
 const totals=quoteAmounts(data);
 function update(index:number,patch:Partial<ProformaItem>){
  onItems(data.items.map((item,i)=>{
   if(i!==index)return item;
   const next={...item,...patch};
   if(next.package_count!=null&&next.package_amount!=null)next.quantity=Math.round(next.package_count*next.package_amount*1e6)/1e6;
   return next;
  }));
 }
 return <section className="full quote-line-editor"><div className="section-title"><h3><Package size={18}/> محصولات پیش‌فاکتور</h3><Button variant="outline" type="button" disabled={data.items.length>=100} onClick={onChoose}><Plus size={16}/>افزودن محصول</Button></div>
  {data.items.map((item,index)=><fieldset className="proforma-product" key={item.product_id}><legend>{num(index+1)} · {item.name}</legend><div className="proforma-product-title"><span>{item.product_code?`کد محصول: ${item.product_code} · `:''}واحد: {item.unit||'عدد'}</span><Button variant="ghost" size="icon" type="button" aria-label={'حذف ردیف '+(index+1)} onClick={()=>onItems(data.items.filter((_,i)=>i!==index))}><Trash2 size={16}/></Button></div>
   <div className="proforma-product-grid">
    <label>تعداد بسته<NumberInput aria-label={'تعداد بسته ردیف '+(index+1)} type="number" min={1} max={1e6} step={1} placeholder="اختیاری" value={item.package_count??''} onChange={e=>update(index,{package_count:e.target.value===''?null:Number(e.target.value)})}/></label>
    <label>مقدار هر بسته ({item.unit||'عدد'})<NumberInput aria-label={'مقدار هر بسته ردیف '+(index+1)} type="number" min={0.000001} max={1e6} step="any" placeholder="اختیاری" value={item.package_amount??''} onChange={e=>update(index,{package_amount:e.target.value===''?null:Number(e.target.value)})}/></label>
    <label>مقدار کل ({item.unit||'عدد'}){item.package_count!=null&&item.package_amount!=null?<output aria-label={'مقدار کل ردیف '+(index+1)}>{num(item.quantity)}</output>:<NumberInput aria-label={'مقدار ردیف '+(index+1)} required type="number" min={0.000001} max={1e6} step="any" value={item.quantity} onChange={e=>update(index,{quantity:Number(e.target.value)})}/>}</label>
    <label>قیمت واحد (ریال)<output aria-label={'قیمت واحد ردیف '+(index+1)}>{rial(item.unit_price)}</output></label>
    <label>مبلغ ردیف (ریال)<output aria-label={'مبلغ ردیف '+(index+1)}>{rial(totals.lines[index])}</output></label>
   </div></fieldset>)}
  {!data.items.length&&<p className="muted">برای شروع یک محصول اضافه کنید.</p>}
 </section>;
}
