import {z} from 'zod';
import type {Row} from './crm';
export const forecastMonthKey=z.string().regex(/^(20\d{2}|21\d{2})-(0[1-9]|1[0-2])$/,'ماه میلادی معتبر نیست.');
export const forecastMonthSchema=z.object({month:forecastMonthKey,quantity:z.number().finite().min(0).max(1e12).nullable(),amount:z.number().finite().min(0).max(1e15).nullable()}).strict();
export const forecastMonthsSchema=z.array(forecastMonthSchema).max(240).refine(rows=>new Set(rows.map(r=>r.month)).size===rows.length,'ماه تکراری در پیش‌بینی وجود دارد.');
export type ForecastMonth=z.infer<typeof forecastMonthSchema>;
export function currentForecastMonth(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-US',{year:'numeric',month:'2-digit',timeZone:'Asia/Tehran'}).formatToParts(now);
 return parts.find(p=>p.type==='year')!.value+'-'+parts.find(p=>p.type==='month')!.value;
}
export function shiftForecastMonth(base:string,offset:number){
 forecastMonthKey.parse(base);
 const [year,month]=base.split('-').map(Number),d=new Date(Date.UTC(year,month-1+offset,1));
 return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0');
}
export function forecastWindow(base=currentForecastMonth()){return Array.from({length:6},(_,i)=>forecastMonthKey.parse(shiftForecastMonth(base,i)));}
export function forecastMonthLabel(month:string){return new Intl.DateTimeFormat('en-GB',{month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(month+'-01T12:00:00Z'));}
export function mergeForecastMonths(existing:ForecastMonth[],changes:ForecastMonth[]){
 const map=new Map(existing.map(m=>[m.month,m]));for(const change of changes)map.set(change.month,change);
 return forecastMonthsSchema.parse([...map.values()].sort((a,b)=>a.month.localeCompare(b.month)));
}
export function forecastTotals(rows:Row[],months:string[]){
 return months.map(month=>{
  let quantity=0,amount=0,quantityCount=0,amountCount=0;
  for(const r of rows){if(r.kind!=='forecasts')continue;const cell=r.data.forecast_months.find(m=>m.month===month);if(cell?.quantity!=null){quantity+=cell.quantity;quantityCount++;}if(cell?.amount!=null){amount+=cell.amount;amountCount++;}}
  return {month,quantity,amount,quantityCount,amountCount};
 });
}
const numberFormat=new Intl.NumberFormat('en-US',{maximumFractionDigits:2});
export function forecastNumber(value:number|null|undefined){return value==null?'—':value>0&&value<0.01?'< 0.01':numberFormat.format(value);}
