'use client';
import {useRef,useState} from 'react';
import {Input} from '@/components/ui/input';
import {Button} from '@/components/ui/button';
import {Pick} from '@/components/crm/shared';
import {PUBLIC_APP_URL} from '@/lib/auth-flow';
import type {State} from '@/lib/crm';
async function request(input:unknown){const r=await fetch('/api/crm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});const d=await r.json();if(!r.ok)throw new Error(d.error||'دعوت انجام نشد.');return d;}
export function TeamInvitations({invites,disabled,onChanged}:{invites:State['invites'];disabled:boolean;onChanged:()=>Promise<void>}){
 const [email,setEmail]=useState(''),[role,setRole]=useState('sales'),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const pending=useRef(false);
 async function act(work:()=>Promise<void>){if(pending.current||disabled)return;pending.current=true;setBusy(true);setError('');setNotice('');try{await work();}catch(e){setError((e as Error).message);}finally{pending.current=false;setBusy(false);}}
 async function invite(email:string,role:string){const d=await request({action:'invite',email,role});if(d.delivery==='requested')setNotice('دعوت ثبت و درخواست ارسال لینک ورود ایمیلی پذیرفته شد. کاربر باید لینک ایمیل را باز کند و رمز خود را انتخاب کند.');else setError(d.warning||'دعوت ثبت شد، اما ایمیل ارسال نشد.');await onChanged();}
 async function copy(email:string){const link=new URL(PUBLIC_APP_URL);link.searchParams.set('auth','signup');link.searchParams.set('email',email);try{await navigator.clipboard.writeText(link.toString());setNotice('لینک ثبت‌نام کپی شد. کاربر باید با همین ایمیل حسابش را تأیید کند.');}catch{setNotice('لینک ثبت‌نام: '+link.toString());}}
 return <section className="team-invitations"><form className="invite-form" onSubmit={e=>{e.preventDefault();void act(async()=>{await invite(email,role);setEmail('');});}}><label>ایمیل عضو جدید<Input required type="email" dir="ltr" maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} disabled={busy||disabled}/></label><Pick label="دسترسی عضو" value={role} onChange={setRole} options={[{value:'sales',label:'کارشناس فروش'},{value:'viewer',label:'مشاهده‌گر'}]}/><Button disabled={busy||disabled} type="submit">{busy?'در حال ثبت…':'ثبت و ارسال دعوت'}</Button></form>
 {notice&&<p className="notice" role="status">{notice}</p>}{error&&<p className="error" role="alert">{error}</p>}
 {invites.map(i=><article className="pending-invite" key={i.id}><div><bdi dir="ltr">{i.email}</bdi><small>در انتظار ورود با همین ایمیل</small></div><div className="row wrap"><Button variant="outline" disabled={busy||disabled} onClick={()=>copy(i.email)}>کپی لینک ثبت‌نام</Button><Button variant="outline" disabled={busy||disabled} onClick={()=>act(()=>invite(i.email,i.role))}>ارسال مجدد ایمیل</Button><Button variant="ghost" disabled={busy||disabled} onClick={()=>act(async()=>{await request({action:'revokeInvite',id:i.id});await onChanged();setNotice('دعوت لغو شد.');})}>لغو دعوت</Button></div></article>)}
 </section>;
}
