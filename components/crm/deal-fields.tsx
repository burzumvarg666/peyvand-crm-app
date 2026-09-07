'use client';
import {useLayoutEffect,useRef,useState} from 'react';
import {Input} from '@/components/ui/input';
import {date,num} from './shared';

const digits=(value:string)=>value.replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632));
export function DealAmount({value,onChange}:{value:number;onChange:(value:number)=>void}){
 const input=useRef<HTMLInputElement>(null),caret=useRef<number|null>(null);
 const [text,setText]=useState(()=>value.toLocaleString('en-US'));
 useLayoutEffect(()=>{if(caret.current!==null){input.current?.setSelectionRange(caret.current,caret.current);caret.current=null;}},[text]);
 return <Input ref={input} type="text" inputMode="numeric" dir="ltr" aria-label="مبلغ فرصت به تومان" placeholder="مثلاً 1,250,000" value={text} onChange={e=>{
  const raw=digits(e.target.value),position=e.target.selectionStart??raw.length;
  if(!/^[0-9,٬\s]*$/.test(raw))return;
  const clean=raw.replace(/[,٬\s]/g,'');const amount=Number(clean);
  if(!Number.isSafeInteger(amount)||amount>1e15)return;
  const formatted=clean?amount.toLocaleString('en-US'):'';
  const before=raw.slice(0,position).replace(/\D/g,'').length;
  let offset=0,count=0;while(offset<formatted.length&&count<before){if(/\d/.test(formatted[offset]))count++;offset++;}
  caret.current=offset;setText(formatted);onChange(amount);
 }}/ >;
}

export function DealDue({value,closed=false}:{value:string;closed?:boolean}){
 if(!value)return <div className="deal-due unset"><span>موعد</span><strong>تعیین نشده</strong></div>;
 const today=new Date(),target=new Date(value+'T12:00:00');
 const days=Math.round((Date.UTC(target.getFullYear(),target.getMonth(),target.getDate())-Date.UTC(today.getFullYear(),today.getMonth(),today.getDate()))/86400000);
 const label=closed?'معامله بسته شده':days===0?'امروز':days===1?'فردا':days<0?num(-days)+' روز گذشته':num(days)+' روز باقی مانده';
 return <div className={'deal-due '+(closed?'closed':days<0?'late':days<=1?'soon':'upcoming')}><span>موعد</span><time dateTime={value}>{date(value)}</time><strong>{label}</strong></div>;
}
