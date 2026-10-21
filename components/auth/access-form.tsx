'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {ArrowUpLeft,Eye,EyeOff,Mail,ShieldCheck} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {signupSchema} from '@/lib/auth-flow';
type Mode='login'|'signup'|'confirm'|'recover'|'set-password';
class RequestError extends Error{constructor(message:string,public code?:string){super(message);}}
async function request(input:unknown){const r=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});const d=await r.json();if(!r.ok)throw new RequestError(d.error||'درخواست انجام نشد.',d.code);return d;}
export function AccessForm({configured,error:externalError,passwordSetup,onAuthenticated,onPasswordSet,onClearError,onDemo}:{configured:boolean;error:string;passwordSetup:boolean;onAuthenticated:()=>Promise<void>;onPasswordSet:()=>void;onClearError:()=>void;onDemo:()=>void}){
 const [localMode,setMode]=useState<Mode>(()=>typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('auth')==='signup'?'signup':'login');
 const mode=passwordSetup?'set-password':localMode;
 const [email,setEmail]=useState(()=>typeof window!=='undefined'?(new URLSearchParams(window.location.search).get('email')||'').slice(0,254):''),[name,setName]=useState(''),[password,setPassword]=useState(''),[repeat,setRepeat]=useState(''),[visible,setVisible]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[confirmCooldown,setConfirmCooldown]=useState(0),[recoverCooldown,setRecoverCooldown]=useState(0),[unconfirmed,setUnconfirmed]=useState(false);
 const cooldown=mode==='recover'?recoverCooldown:confirmCooldown;
 const setCooldown=mode==='recover'?setRecoverCooldown:setConfirmCooldown;
 const pending=useRef(false);
 useEffect(()=>{if(!confirmCooldown&&!recoverCooldown)return;const t=setTimeout(()=>{setConfirmCooldown(n=>Math.max(0,n-1));setRecoverCooldown(n=>Math.max(0,n-1));},1000);return()=>clearTimeout(t);},[confirmCooldown,recoverCooldown]);
 function switchMode(next:Mode){if(busy)return;onClearError();setMode(next);setError('');setMessage('');setPassword('');setRepeat('');setVisible(false);setUnconfirmed(false);}
 async function perform(work:()=>Promise<void>){if(pending.current)return;pending.current=true;setBusy(true);setError('');onClearError();try{await work();}catch(e){setError((e as Error).message);if(e instanceof RequestError&&e.code==='email_not_confirmed')setUnconfirmed(true);}finally{pending.current=false;setBusy(false);}}
 async function resend(){await perform(async()=>{await request({action:'resend',email});setCooldown(60);setMessage('درخواست لینک تازه ثبت شد. صندوق ورودی و پوشه Spam را بررسی کنید.');});}
 async function submit(e:FormEvent){e.preventDefault();await perform(async()=>{
  setMessage('');setUnconfirmed(false);
  if(mode==='signup'){
   const v=signupSchema.safeParse({email,name,password,password_confirmation:repeat});if(!v.success)throw new Error(v.error.issues[0].message);
   const d=await request({action:'signup',...v.data});setPassword('');setRepeat('');
   if(d.confirmation){setMode('confirm');setCooldown(60);}else await onAuthenticated();
  }else if(mode==='recover'){
   await request({action:'recover',email});setCooldown(60);setMessage('اگر حسابی با این ایمیل وجود داشته باشد، لینک بازیابی برای آن ارسال می‌شود. صندوق ورودی و Spam را بررسی کنید.');
  }else if(mode==='set-password'){
   if(password!==repeat)throw new Error('رمز عبور و تکرار آن یکسان نیستند.');
   await request({action:'set-password',password,password_confirmation:repeat});setPassword('');setRepeat('');setMode('login');onPasswordSet();setMessage('رمز جدید ذخیره شد. اکنون با ایمیل و رمز جدید وارد شوید.');
  }else{await request({action:'login',email,password});setPassword('');await onAuthenticated();}
 });}
 const title={login:'ورود به پیوند',signup:'ساخت حساب پیوند',confirm:'تأیید ایمیل',recover:'بازیابی رمز عبور','set-password':'انتخاب رمز عبور'}[mode];
 const isPassword=mode==='login'||mode==='signup'||mode==='set-password';
 return <main className="auth-shell" dir="rtl"><section className="auth-aside"><div className="brand"><img src="/peyvand-logo.svg" alt="نشان پیوند" width={54} height={54}/>پیوند <small>CRM</small></div><div><h1>ارتباط‌ها را<br/>به نتیجه برسانید.</h1><p>مشتری‌ها، فروش و پیگیری‌های تیم، در یک فضای کاری.</p></div><p>هر کاربر با حساب خودش وارد می‌شود.</p></section><section className="auth-main"><div className="auth-card access-card"><h2>{title}</h2>
 {configured&&['login','signup'].includes(mode)&&<div className="auth-mode-switch" aria-label="ورود یا ثبت‌نام"><Button type="button" variant={mode==='login'?'default':'outline'} aria-pressed={mode==='login'} disabled={busy} onClick={()=>switchMode('login')}>ورود</Button><Button type="button" variant={mode==='signup'?'default':'outline'} aria-pressed={mode==='signup'} disabled={busy} onClick={()=>switchMode('signup')}>ثبت‌نام</Button></div>}
 {(error||externalError)&&<p className="error" role="alert">{error||externalError}</p>}{message&&<p className="notice" role="status">{message}</p>}
 {!configured?<p className="notice">اتصال سرویس ورود هنوز آماده نیست. با مدیر برنامه تماس بگیرید.</p>:mode==='confirm'?<section className="confirmation-step"><Mail size={35}/><p>لینک تأیید را در ایمیل <bdi dir="ltr">{email}</bdi> باز کنید. پس از تأیید می‌توانید وارد پیوند شوید.</p><p className="muted">اگر قبلاً با این ایمیل حساب ساخته‌اید، از بخش ورود استفاده کنید. ایمیل را در Spam هم بررسی کنید.</p><Button type="button" disabled={busy||cooldown>0} variant="outline" onClick={resend}>{cooldown?`ارسال مجدد پس از ${cooldown} ثانیه`:'ارسال مجدد لینک تأیید'}</Button><Button type="button" disabled={busy} onClick={()=>switchMode('login')}>ایمیلم را تأیید کردم؛ ورود</Button><button type="button" className="access-text-button" disabled={busy} onClick={()=>switchMode('signup')}>اصلاح ایمیل</button></section>:<form className="access-form" onSubmit={submit}>
 {mode==='signup'&&<label>نام و نام خانوادگی<Input required autoComplete="name" minLength={2} maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label>}
 {mode!=='set-password'&&<label>ایمیل<Input required type="email" dir="ltr" autoComplete="email" maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label>}
 {isPassword&&<><label>{mode==='set-password'?'رمز عبور جدید':'رمز عبور'}<span className="password-field"><Input required type={visible?'text':'password'} dir="ltr" minLength={mode==='login'?1:10} maxLength={128} autoComplete={mode==='login'?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)}/><button className="password-toggle" type="button" aria-label={visible?'پنهان کردن رمز':'نمایش رمز'} onClick={()=>setVisible(v=>!v)}>{visible?<EyeOff size={18}/>:<Eye size={18}/>}</button></span></label>{mode!=='login'&&<><label>تکرار رمز عبور<Input required type={visible?'text':'password'} dir="ltr" minLength={10} maxLength={128} autoComplete="new-password" value={repeat} onChange={e=>setRepeat(e.target.value)}/></label><small className="muted">حداقل ۱۰ کاراکتر؛ ترکیبی از حروف، اعداد و نشانه‌ها انتخاب کنید.</small></>}</>}
 <Button type="submit" disabled={busy||(mode==='recover'&&cooldown>0)}>{busy?'در حال بررسی…':mode==='signup'?'ساخت حساب':mode==='recover'?(cooldown?`ارسال لینک پس از ${cooldown} ثانیه`:'ارسال لینک بازیابی'):mode==='set-password'?'ذخیره رمز جدید':'ورود به حساب'}</Button>
 {mode==='login'&&<><button className="access-text-button" type="button" disabled={busy} onClick={()=>switchMode('recover')}>رمز عبور را فراموش کرده‌ام</button>{unconfirmed&&<Button type="button" variant="outline" disabled={busy||cooldown>0} onClick={resend}>{cooldown?`ارسال مجدد پس از ${cooldown} ثانیه`:'ارسال مجدد ایمیل تأیید'}</Button>}</>}
 {mode==='recover'&&<button className="access-text-button" type="button" disabled={busy} onClick={()=>switchMode('login')}>بازگشت به ورود</button>}
 {mode==='signup'&&<p className="muted"><ShieldCheck size={16}/> اگر به تیمی دعوت شده‌اید، با همان ایمیل ثبت‌نام کنید؛ پس از تأیید، به همان تیم متصل می‌شوید.</p>}
 </form>}
 {mode!=='set-password'&&<div className="demo-entry"><Button variant="outline" disabled={busy} onClick={onDemo}>مشاهده نسخه نمایشی <ArrowUpLeft size={16}/></Button><small>داده‌های ساختگی؛ بدون ذخیره دائمی.</small></div>}
 </div></section></main>;
}
