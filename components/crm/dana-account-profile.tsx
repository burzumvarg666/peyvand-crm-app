'use client';
import {useState,type ReactNode} from 'react';
import {Building2,CalendarDays,ChevronDown,ChevronUp,ClipboardList,MapPin,Phone,Plus,Target,Users} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Textarea} from '@/components/ui/textarea';
import {blank,activityTypeLabels,type Data,type Row} from '@/lib/crm';
import {date,money,num} from './shared';

type ActivityType=Data['activity_type'];
export function DanaAccountProfile({row,rows,canEdit,busy,onOpen,onEdit,onDelete,onSave,onNewRelated}:{row:Row;rows:Row[];canEdit:boolean;busy:boolean;onOpen:(id:string)=>void;onEdit:()=>void;onDelete:(r:Row)=>void;onSave:(kind:Row['kind'],data:Data,parent:string|null,record?:Row)=>Promise<boolean>;onNewRelated:(kind:'contacts'|'deals'|'activities',parent:string,preset?:Partial<Data>)=>void}){
 const [note,setNote]=useState('');
 const contacts=rows.filter(r=>r.kind==='contacts'&&r.parent_id===row.id);
 const contactIds=new Set(contacts.map(r=>r.id));
 const deals=rows.filter(r=>r.kind==='deals'&&r.parent_id===row.id);
 const activities=rows.filter(r=>['activities','tasks'].includes(r.kind)&&(r.parent_id===row.id||contactIds.has(r.parent_id||'')));
 const openActs=activities.filter(r=>r.data.status!=='done'),closedActs=activities.filter(r=>r.data.status==='done');
 const notes=rows.filter(r=>r.kind==='notes'&&r.parent_id===row.id);
 const [expanded,setExpanded]=useState<Record<string,boolean>>({info:true,notes:true,contacts:true,deals:true,open:true,closed:true});
 const toggle=(k:string)=>setExpanded(s=>({...s,[k]:!s[k]}));
 const Section=({id,title,count,actions,children}:{id:string;title:string;count?:number;actions?:ReactNode;children:ReactNode})=><section className="dana-related-panel" id={'account-'+id}>
  <header className="dana-related-head"><button className="dana-panel-toggle" onClick={()=>toggle(id)}>{expanded[id]?<ChevronUp size={17}/>:<ChevronDown size={17}/>}<b>{title}</b>{typeof count==='number'&&<span className="dana-count">{num(count)}</span>}</button>{actions}</header>
  {expanded[id]&&<div className="dana-related-body">{children}</div>}
 </section>;
 const side=[['info','مشخصات حساب'],['notes','یادداشت‌ها'],['contacts','کانتکت‌ها'],['deals','فرصت‌های فروش'],['open','فعالیت‌های باز'],['closed','فعالیت‌های بسته']];
 return <div className="dana-account-layout">
  <aside className="dana-account-nav">{side.map(([id,label])=><button key={id} onClick={()=>document.getElementById('account-'+id)?.scrollIntoView({behavior:'smooth',block:'start'})}><span>{label}</span>{id==='contacts'?<b>{num(contacts.length)}</b>:id==='deals'?<b>{num(deals.length)}</b>:id==='open'?<b>{num(openActs.length)}</b>:id==='closed'?<b>{num(closedActs.length)}</b>:null}</button>)}</aside>
  <div className="dana-account-content">
   <div className="dana-account-hero"><span className="dana-account-logo"><Building2 size={26}/></span><div><h2>{row.data.name}</h2><p>{row.data.industry||'حساب مشتری'}</p></div><div className="dana-account-actions">{canEdit&&<><Button variant="outline" onClick={onEdit}>ویرایش</Button><Button variant="ghost" className="danger" onClick={()=>onDelete(row)}>حذف</Button></>}</div></div>
   <Section id="info" title="مشخصات حساب"><div className="dana-info-grid">
    <div><span>عنوان</span><b>{row.data.name}</b></div><div><span>تلفن</span><b dir="ltr">{row.data.phone||'—'}</b></div>
    <div><span>وب‌سایت</span><b dir="ltr">{row.data.website||'—'}</b></div><div><span>صنعت / حوزه فعالیت</span><b>{row.data.industry||'—'}</b></div>
    <div><span>شهر</span><b>{row.data.city||'—'}</b></div><div><span>آدرس</span><b>{row.data.address||'—'}</b></div>
    <div><span>تاریخ شروع همکاری</span><b>{date(row.data.start_date)}</b></div><div><span>تعداد پرسنل</span><b>{row.data.employee_count?num(row.data.employee_count):'—'}</b></div>
   </div></Section>
   <Section id="notes" title="یادداشت‌ها" count={notes.length}>{notes.map(n=><article className="dana-note" key={n.id}><p>{n.data.description}</p><small>{date(n.created_at)}</small></article>)}{!notes.length&&<p className="dana-empty">یادداشتی ثبت نشده است.</p>}{canEdit&&<form className="dana-note-form" onSubmit={async e=>{e.preventDefault();if(await onSave('notes',{...blank(),name:'یادداشت ارتباط',description:note},row.id))setNote('');}}><Textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="یادداشت جدید..." required/><Button disabled={busy||!note.trim()}>ثبت یادداشت</Button></form>}</Section>
   <Section id="contacts" title="کانتکت‌ها" count={contacts.length} actions={canEdit?<Button size="sm" variant="ghost" onClick={()=>onNewRelated('contacts',row.id)}><Plus size={15}/>کانتکت</Button>:null}>{contacts.map(c=><button className="dana-related-row" key={c.id} onClick={()=>onOpen(c.id)}><Users size={17}/><span><b>{c.data.name}</b><small>{c.data.position||'بدون سمت'} · {c.data.phone||c.data.email||'بدون اطلاعات تماس'}</small></span></button>)}{!contacts.length&&<p className="dana-empty">کانتکتی ثبت نشده است.</p>}</Section>
   <Section id="deals" title="فرصت‌های فروش" count={deals.length} actions={canEdit?<Button size="sm" variant="ghost" onClick={()=>onNewRelated('deals',row.id)}><Plus size={15}/>فرصت فروش</Button>:null}>{deals.map(d=><button className="dana-related-row" key={d.id} onClick={()=>onOpen(d.id)}><Target size={17}/><span><b>{d.data.name}</b><small>{money(d.data.amount)} · {date(d.data.due)}</small></span></button>)}{!deals.length&&<p className="dana-empty">فرصت فروشی ثبت نشده است.</p>}</Section>
   <Section id="open" title="فعالیت‌های باز" count={openActs.length} actions={canEdit?<div className="dana-quick-actions"><Button size="sm" variant="ghost" onClick={()=>onNewRelated('activities',row.id,{activity_type:'call'})}><Plus size={15}/>تماس</Button><Button size="sm" variant="ghost" onClick={()=>onNewRelated('activities',row.id,{activity_type:'task'})}><Plus size={15}/>وظیفه</Button><Button size="sm" variant="ghost" onClick={()=>onNewRelated('activities',row.id,{activity_type:'meeting'})}><Plus size={15}/>جلسه</Button></div>:null}>{openActs.map(a=><button className="dana-related-row" key={a.id} onClick={()=>onOpen(a.id)}><ClipboardList size={17}/><span><b>{a.data.name}</b><small>{a.kind==='tasks'?'وظیفه':activityTypeLabels[a.data.activity_type]} · {date(a.data.due)}{a.data.activity_time?' · '+a.data.activity_time:''}</small></span></button>)}{!openActs.length&&<p className="dana-empty">فعالیت بازی وجود ندارد.</p>}</Section>
   <Section id="closed" title="فعالیت‌های بسته" count={closedActs.length}>{closedActs.map(a=><button className="dana-related-row" key={a.id} onClick={()=>onOpen(a.id)}><CalendarDays size={17}/><span><b>{a.data.name}</b><small>{a.kind==='tasks'?'وظیفه':activityTypeLabels[a.data.activity_type]} · {date(a.data.due)}</small></span></button>)}{!closedActs.length&&<p className="dana-empty">فعالیت بسته‌ای وجود ندارد.</p>}</Section>
  </div>
 </div>;
}
