'use client';
import {Activity,ArrowUpLeft,Building2,FileText,Target,Users} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {date,num} from './shared';
import type {Row} from '@/lib/crm';

export function People({rows,canEdit,onOpen,onNavigate,onNewAccount,onNewContact}:{rows:Row[];canEdit:boolean;onOpen:(id:string)=>void;onNavigate:(view:string,query?:string)=>void;onNewAccount:()=>void;onNewContact:()=>void}){
 const accounts=rows.filter(r=>r.kind==='companies'&&r.data.status!=='lead').sort((a,b)=>b.updated_at.localeCompare(a.updated_at));
 const contacts=rows.filter(r=>r.kind==='contacts').sort((a,b)=>b.updated_at.localeCompare(a.updated_at));
 const deals=rows.filter(r=>r.kind==='deals');
 const activities=rows.filter(r=>['tasks','activities'].includes(r.kind));
 const proformas=rows.filter(r=>r.kind==='proformas');
 const openActivities=activities.filter(r=>r.data.status!=='done');
 const parent=(row:Row)=>rows.find(r=>r.id===row.parent_id);
 const contactsFor=(id:string)=>contacts.filter(r=>r.parent_id===id);
 const accountActivityCount=(id:string)=>{
  const childIds=new Set(contactsFor(id).map(r=>r.id));
  return openActivities.filter(r=>r.parent_id===id||childIds.has(r.parent_id||'')).length;
 };
 return <section className="people-shell">
  <div className="people-metrics">
   <button className="people-metric" onClick={()=>onNavigate('companies')}><span><Building2 size={18}/>حساب‌ها</span><strong>{num(accounts.length)}</strong><small>شرکت‌ها و مشتریان ثبت‌شده</small></button>
   <button className="people-metric" onClick={()=>onNavigate('contacts')}><span><Users size={18}/>کانتکت‌ها</span><strong>{num(contacts.length)}</strong><small>افراد مرتبط با حساب‌ها</small></button>
   <button className="people-metric" onClick={()=>onNavigate('deals')}><span><Target size={18}/>فرصت‌های فروش</span><strong>{num(deals.length)}</strong><small>فرصت‌های متصل به اشخاص</small></button>
   <button className="people-metric" onClick={()=>onNavigate('activities')}><span><Activity size={18}/>فعالیت‌های باز</span><strong>{num(openActivities.length)}</strong><small>تماس، جلسه، وظیفه و پیام</small></button>
  </div>
  <div className="people-columns">
   <article className="panel people-panel">
    <div className="section-title"><div><h2>حساب‌ها</h2><p>پروندهٔ شرکت‌ها و ارتباطات وابسته</p></div><div className="row">{canEdit&&<Button size="sm" style={{color:'#fff'}} onClick={onNewAccount}>حساب جدید</Button>}<Button size="sm" variant="ghost" onClick={()=>onNavigate('companies')}>مشاهده همه <ArrowUpLeft size={15}/></Button></div></div>
    <div className="people-list">{accounts.slice(0,7).map(r=>{
     const cc=contactsFor(r.id).length,dc=deals.filter(d=>d.parent_id===r.id).length,ac=accountActivityCount(r.id),pc=proformas.filter(p=>p.parent_id===r.id).length;
     return <button className="people-row" key={r.id} onClick={()=>onOpen(r.id)}><span className="person-avatar account"><Building2 size={17}/></span><span className="people-main"><b>{r.data.name}</b><small>{r.data.industry||r.data.city||'حساب مشتری'} · آخرین تغییر {date(r.updated_at)}</small></span><span className="people-relations"><small>{num(cc)} کانتکت</small><small>{num(dc)} فرصت</small><small>{num(ac)} فعالیت باز</small><small>{num(pc)} پیش‌فاکتور</small></span><ArrowUpLeft size={16}/></button>;
    })}{!accounts.length&&<p className="column-empty">هنوز حسابی ثبت نشده است.</p>}</div>
   </article>
   <article className="panel people-panel">
    <div className="section-title"><div><h2>کانتکت‌ها</h2><p>اشخاص حقیقی متصل به حساب‌ها</p></div><div className="row">{canEdit&&<Button size="sm" style={{color:'#fff'}} onClick={onNewContact}>کانتکت جدید</Button>}<Button size="sm" variant="ghost" onClick={()=>onNavigate('contacts')}>مشاهده همه <ArrowUpLeft size={15}/></Button></div></div>
    <div className="people-list">{contacts.slice(0,7).map(r=>{
     const account=parent(r),ac=openActivities.filter(a=>a.parent_id===r.id).length;
     return <button className="people-row" key={r.id} onClick={()=>onOpen(r.id)}><span className="person-avatar"><Users size={17}/></span><span className="people-main"><b>{r.data.name}</b><small>{r.data.position||'بدون سمت'}{account?' · '+account.data.name:''}</small></span><span className="people-relations"><small>{r.data.phone||r.data.email||'اطلاعات تماس ثبت نشده'}</small><small>{num(ac)} فعالیت باز</small></span><ArrowUpLeft size={16}/></button>;
    })}{!contacts.length&&<p className="column-empty">هنوز کانتکتی ثبت نشده است.</p>}</div>
   </article>
  </div>
  <article className="panel people-links"><div><FileText size={19}/><span><b>اسناد و فعالیت‌های مرتبط</b><small>از حساب یا کانتکت وارد فرصت فروش، فعالیت و پیش‌فاکتور شوید.</small></span></div><div className="row wrap"><Button variant="outline" onClick={()=>onNavigate('activities')}>فعالیت‌ها</Button><Button variant="outline" onClick={()=>onNavigate('deals')}>فرصت‌های فروش</Button><Button variant="outline" onClick={()=>onNavigate('proformas')}>پیش‌فاکتورها</Button></div></article>
 </section>;
}
