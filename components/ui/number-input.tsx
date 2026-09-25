'use client';
import * as React from 'react';
import {Input} from './input';
const clean=(s:string)=>s.replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[,٬\s]/g,'').replace(/٫/g,'.');
const format=(s:string)=>{const [whole,...fraction]=s.split('.');return whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(fraction.length?'.'+fraction.join(''):'');};
export function NumberInput({value,onChange,onFocus,onBlur,min,max,step, ...props}:React.ComponentProps<'input'>){
 const [draft,setDraft]=React.useState(String(value??''));const focused=React.useRef(false);const ref=React.useRef<HTMLInputElement>(null);
 React.useEffect(()=>{if(!focused.current)setDraft(String(value??''));},[value]);
 return <Input {...props} ref={ref} type="text" inputMode="decimal" dir="ltr" value={format(draft)} onFocus={e=>{focused.current=true;e.currentTarget.select();onFocus?.(e);}} onChange={e=>{e.currentTarget.setCustomValidity('');const raw=clean(e.target.value);if(!/^-?\d*(\.\d*)?$/.test(raw))return;const digits=clean(e.target.value.slice(0,e.target.selectionStart??0)).length;setDraft(raw);const proxy={...e,target:{...e.target,value:raw},currentTarget:{...e.currentTarget,value:raw}} as React.ChangeEvent<HTMLInputElement>;onChange?.(proxy);requestAnimationFrame(()=>{const el=ref.current;if(!el)return;let count=0,pos=0;while(pos<el.value.length&&count<digits){if(el.value[pos]!==',')count++;pos++;}el.setSelectionRange(pos,pos);});}} onBlur={e=>{focused.current=false;const n=Number(draft);let error='';if(draft&&(!Number.isFinite(n)||(min!==undefined&&n<Number(min))||(max!==undefined&&n>Number(max))))error='عدد خارج از محدوده مجاز است.';e.currentTarget.setCustomValidity(error);onBlur?.(e);}}/>;
}
