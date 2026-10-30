'use client';
import {useState} from 'react';
import {Users} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {AlertDialog,AlertDialogAction,AlertDialogCancel,AlertDialogContent,AlertDialogDescription,AlertDialogFooter,AlertDialogTitle} from '@/components/ui/alert-dialog';
import {roleLabels} from '@/components/crm/shared';
import type {Member} from '@/lib/crm';

type Change={member:Member;role:Member['role'];active:boolean;deletePermission?:boolean};
export function TeamMembers({members,userId,admin,disabled,onChanged}:{members:Member[];userId:string;admin:boolean;disabled:boolean;onChanged:()=>Promise<void>}){
 const [change,setChange]=useState<Change|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function save(){if(!change||busy)return;setBusy(true);setError('');setNotice('');try{
  const response=await fetch('/api/crm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(change.deletePermission===undefined?{action:'memberAccess',user_id:change.member.user_id,role:change.role,active:change.active}:{action:'memberDeletePermission',user_id:change.member.user_id,allow_delete:change.deletePermission})});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'تغییر دسترسی انجام نشد.');
  setChange(null);await onChanged();setNotice('دسترسی عضو به‌روزرسانی شد.');
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <div className="team-members">{members.map(m=><div className="member-row wrap" key={m.user_id}>
  <Users size={17}/><span dir="ltr">{m.email}</span><span className="badge">{roleLabels[m.role]}</span>{m.active===false&&<span className="badge">دسترسی قطع شده</span>}{m.role==='sales'&&m.can_delete&&<span className="badge">اجازه حذف دارد</span>}
  {admin&&m.user_id!==userId&&<><label>نقش <select aria-label={'نقش '+m.email} value={m.role} disabled={busy||disabled} onChange={e=>setChange({member:m,role:e.target.value as Member['role'],active:m.active!==false})}><option value="sales">کارشناس فروش</option><option value="viewer">مشاهده‌گر</option><option value="admin">مدیر</option></select></label>{m.role==='sales'&&<Button variant="outline" disabled={busy||disabled||m.active===false} onClick={()=>setChange({member:m,role:m.role,active:true,deletePermission:!m.can_delete})}>{m.can_delete?'لغو اجازه حذف':'دادن اجازه حذف'}</Button>}<Button variant="outline" disabled={busy||disabled} onClick={()=>setChange({member:m,role:m.role,active:m.active===false})}>{m.active===false?'فعال‌کردن دسترسی':'قطع دسترسی'}</Button></>}
 </div>)}{notice&&<p role="status" className="notice">{notice}</p>}{error&&<p role="alert" className="error">{error}</p>}
 <AlertDialog open={!!change} onOpenChange={open=>{if(!open&&!busy)setChange(null);}}><AlertDialogContent dir="rtl"><AlertDialogTitle>تغییر دسترسی عضو</AlertDialogTitle><AlertDialogDescription>{change&&(change.deletePermission!==undefined?<>اجازه حذف برای <bdi dir="ltr">{change.member.email}</bdi> {change.deletePermission?'فعال':'لغو'} شود؟ این تغییر اختیارات مدیریت اعضا و پشتیبان را نمی‌دهد.</>:<>دسترسی <bdi dir="ltr">{change.member.email}</bdi> به «{roleLabels[change.role]}» و وضعیت «{change.active?'فعال':'قطع‌شده'}» تغییر کند؟ سوابق و وظایف قبلی عضو حفظ می‌شوند.</>)}</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel disabled={busy}>انصراف</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={e=>{e.preventDefault();void save();}}>تأیید تغییر</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </div>;
}
