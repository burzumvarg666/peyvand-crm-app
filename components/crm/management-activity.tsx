'use client';
import {useEffect,useState} from 'react';
import {ChevronDown,ChevronLeft,ChevronRight,History,RefreshCw,Search} from 'lucide-react';
import {Button} from '@/components/ui/button';
import styles from './management-activity.module.css';

type Event={id:string;category:'record'|'return'|'sample'|'member';action:'INSERT'|'UPDATE'|'DELETE';label:string;actor_name:string;target_name:string|null;created_at:string;restored_from_backup:boolean;detail:null|{old_role:string;new_role:string;old_active:boolean;new_active:boolean;old_can_delete:boolean|null;new_can_delete:boolean|null;old_customer_scope:string|null;new_customer_scope:string|null}};
const categories={record:'اطلاعات',return:'برگشتی',sample:'نمونه',member:'دسترسی اعضا'};
const actions={INSERT:'ثبت',UPDATE:'ویرایش',DELETE:'حذف'};
const roles:Record<string,string>={admin:'مدیر',sales:'کارشناس فروش',viewer:'مشاهده‌گر'};
const pageSize=5;
const shortDate=new Intl.DateTimeFormat('fa-IR',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Tehran'});
const fullDate=new Intl.DateTimeFormat('fa-IR',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Tehran'});
const num=(n:number)=>n.toLocaleString('fa-IR');
const normalize=(s:string)=>s.toLocaleLowerCase('fa-IR').replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/\u200c/g,' ');

function EventRow({event:e}:{event:Event}){
 const changes:{label:string;before:string;after:string}[]=[];
 if(e.category==='member'&&e.detail){
  const d=e.detail;
  if(d.old_role!==d.new_role)changes.push({label:'نقش',before:roles[d.old_role]||d.old_role,after:roles[d.new_role]||d.new_role});
  if(d.old_active!==d.new_active)changes.push({label:'دسترسی',before:d.old_active?'فعال':'قطع‌شده',after:d.new_active?'فعال':'قطع‌شده'});
  if(d.old_can_delete!==d.new_can_delete&&d.new_can_delete!==null)changes.push({label:'اجازه حذف',before:d.old_can_delete?'فعال':'غیرفعال',after:d.new_can_delete?'فعال':'غیرفعال'});
  if(d.old_customer_scope!==d.new_customer_scope&&d.new_customer_scope)changes.push({label:'مشتریان',before:d.old_customer_scope==='assigned'?'فقط مشتریان خودش':'همه مشتریان',after:d.new_customer_scope==='assigned'?'فقط مشتریان خودش':'همه مشتریان'});
 }
 return <details className={styles.event}>
  <summary className={styles.summary}>
   <span className={`${styles.badge} ${styles[e.action]}`}>{actions[e.action]}</span>
   <span className={styles.subject}><bdi dir="auto">{e.target_name||e.label}</bdi><small>{categories[e.category]}<span aria-hidden="true"> · </span><bdi dir="auto">{e.actor_name}</bdi></small></span>
   <time dateTime={e.created_at} className={styles.time}>{shortDate.format(new Date(e.created_at))}</time>
   <span className={styles.expand}><span>جزئیات</span><ChevronDown size={14} aria-hidden="true"/></span>
  </summary>
  <div className={styles.details}>
   <p className={styles.fullLabel}><bdi dir="auto">{e.label}</bdi></p>
   <dl className={styles.facts}><div><dt>انجام‌دهنده</dt><dd><bdi dir="auto">{e.actor_name}</bdi></dd></div>{e.target_name&&<div><dt>عضو تیم</dt><dd><bdi dir="auto">{e.target_name}</bdi></dd></div>}<div><dt>زمان ثبت</dt><dd><time dateTime={e.created_at}>{fullDate.format(new Date(e.created_at))}</time></dd></div></dl>
   {changes.length>0&&<dl className={styles.changes}>{changes.map(c=><div key={c.label}><dt>{c.label}</dt><dd><span>{c.before}</span><ChevronLeft size={13} aria-label="تغییر به"/><strong>{c.after}</strong></dd></div>)}</dl>}
   {e.restored_from_backup&&<p className={styles.restored}>این رویداد از فایل پشتیبان بازیابی شده است.</p>}
  </div>
 </details>;
}

export function ManagementActivity(){
 const [rows,setRows]=useState<Event[]>([]),[limit,setLimit]=useState(200),[revision,setRevision]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [query,setQuery]=useState(''),[category,setCategory]=useState('all'),[page,setPage]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();
  setLoading(true);
  fetch('/api/activity-log?limit='+limit,{cache:'no-store',signal:controller.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||'دریافت گزارش انجام نشد.');return d;}).then(d=>{if(!controller.signal.aborted){setRows(d.rows);setError('');}}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[limit,revision]);
 const term=normalize(query.trim());
 const filtered=rows.filter(e=>(category==='all'||e.category===category)&&(!term||normalize([e.label,e.target_name,e.actor_name,categories[e.category],actions[e.action]].join(' ')).includes(term)));
 const pages=Math.max(1,Math.ceil(filtered.length/pageSize)),currentPage=Math.min(page,pages-1),start=currentPage*pageSize;
 return <article className={`panel ${styles.panel}`}>
  <header className={styles.header}><div className={styles.heading}><span className={styles.icon}><History size={20} aria-hidden="true"/></span><div><h2>گزارش تغییرات تیم</h2><p>آخرین فعالیت‌ها، در یک نگاه</p></div></div><Button variant="outline" size="sm" disabled={loading} onClick={()=>{setPage(0);setRevision(n=>n+1);}}><RefreshCw size={14} className={loading?styles.spinning:undefined} aria-hidden="true"/>تازه‌سازی</Button></header>
  <div className={styles.toolbar}><label className={styles.search}><Search size={16} aria-hidden="true"/><input type="search" aria-label="جست‌وجو در گزارش تغییرات" placeholder="جست‌وجوی نام یا فعالیت…" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/></label><select aria-label="نوع فعالیت" value={category} onChange={e=>{setCategory(e.target.value);setPage(0);}}><option value="all">همه فعالیت‌ها</option>{Object.entries(categories).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div>
  {error&&<p className="error" role="alert">{error}</p>}
  <div className={styles.list} aria-busy={loading}>
   {loading&&!rows.length?<p className={styles.empty} role="status">در حال دریافت…</p>:filtered.length?<div key={`${currentPage}:${category}:${query}:${revision}`}>{filtered.slice(start,start+pageSize).map(e=><EventRow key={e.id} event={e}/>)}</div>:!error&&<p className={styles.empty}>{rows.length?'موردی با این جست‌وجو پیدا نشد.':'هنوز فعالیتی ثبت نشده است.'}</p>}
  </div>
  <footer className={styles.footer}><span role="status">{filtered.length?`${num(start+1)} تا ${num(Math.min(start+pageSize,filtered.length))} از ${num(filtered.length)} رویداد اخیر`:loading?'در حال دریافت…':'۰ مورد'}</span><nav aria-label="صفحه‌های گزارش تغییرات"><Button variant="ghost" size="icon-sm" aria-label="صفحه قبل" disabled={loading||currentPage===0} onClick={()=>setPage(currentPage-1)}><ChevronRight size={17}/></Button><span>{num(currentPage+1)} / {num(pages)}</span><Button variant="ghost" size="icon-sm" aria-label="صفحه بعد" disabled={loading||currentPage>=pages-1} onClick={()=>setPage(currentPage+1)}><ChevronLeft size={17}/></Button></nav>{rows.length>=limit&&limit<1000&&<Button className={styles.older} variant="ghost" size="sm" disabled={loading} onClick={()=>setLimit(n=>Math.min(n+200,1000))}>دریافت سوابق قدیمی‌تر</Button>}</footer>
 </article>;
}
