'use client';
import {RecordBulkActions,useListSelection} from './list-selection';
import {SelectionBox} from './bulk-selection';
import bulkStyles from './bulk-selection.module.css';
import type {BulkDeleteHandler} from '@/lib/bulk-delete';
import {useMemo,useState} from 'react';
import {CalendarDays,Check,ChevronDown,ChevronUp,ClipboardList,Clock,Mail,MessageCircle,MessageSquare,Phone,Plus,UserRound} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {activityDirectionLabels,activityTypeLabels,type Data,type Row,type State} from '@/lib/crm';
import {date,num,priorityLabels} from './shared';

type ActivityType=Data['activity_type'];
const icon=(type:string)=>type==='call'?<Phone size={17}/>:type==='meeting'?<CalendarDays size={17}/>:type==='email'?<Mail size={17}/>:type==='sms'?<MessageSquare size={17}/>:type==='whatsapp'?<MessageCircle size={17}/>:<ClipboardList size={17}/>;
const typeOf=(r:Row):ActivityType=>r.kind==='tasks'?'task':r.data.activity_type;
export function ActivitiesWorkspace({rows,allRows,members=[],canEdit,canDelete=false,onDeleteMany,busy,onOpen,onToggle,onNew}:{rows:Row[];allRows:Row[];members?:State['members'];canEdit:boolean;canDelete?:boolean;onDeleteMany?:BulkDeleteHandler;busy:boolean;onOpen:(id:string)=>void;onToggle:(r:Row)=>void;onNew:(type:ActivityType)=>void}){
 const bulk=useListSelection(rows),canSelect=canDelete&&!!onDeleteMany;
 const [openExpanded,setOpenExpanded]=useState(true),[closedExpanded,setClosedExpanded]=useState(true);
 const open=useMemo(()=>rows.filter(r=>r.data.status!=='done'),[rows]);
 const closed=useMemo(()=>rows.filter(r=>r.data.status==='done'),[rows]);
 const parent=(r:Row)=>allRows.find(p=>p.id===r.parent_id);
 const assignee=(r:Row)=>r.data.assignee?members.find(m=>m.user_id===r.data.assignee)?.email||'مسئول تعیین‌شده':'بدون مسئول';
 const activityRow=(r:Row,closedMode=false)=>{
  const t=typeOf(r),p=parent(r);
  return <article key={r.id} className={'dana-activity-row '+(canSelect?bulkStyles.activityRow+' ':'')+(closedMode?'closed':'')}>
   {canSelect&&<SelectionBox label={`انتخاب فعالیت ${r.data.name}`} checked={bulk.ids.has(r.id)} disabled={busy} onChange={()=>bulk.toggle([r.id])}/>}
   <span className={'dana-activity-icon '+t}>{icon(t)}</span>
   <button className="dana-activity-main" onClick={()=>onOpen(r.id)}>
    <b>{r.data.name}</b>
    <span>{activityTypeLabels[t]}{r.kind==='activities'&&r.data.activity_direction!=='none'?' · '+activityDirectionLabels[r.data.activity_direction]:''}{p?' · '+p.data.name:''}</span>
   </button>
   <div className="dana-activity-meta">
    <span><Clock size={14}/>{date(r.data.due)}{r.data.activity_time?' · '+r.data.activity_time:''}</span>
    <span><UserRound size={14}/>{assignee(r)}</span>
    <span className={'priority '+r.data.priority}>{priorityLabels[r.data.priority]}</span>
   </div>
   {canEdit&&<Button size="sm" variant="ghost" disabled={busy} onClick={()=>onToggle(r)}><Check size={16}/>{closedMode?'بازگشایی':'انجام شد'}</Button>}
  </article>;
 };
 const section=(title:string,items:Row[],expanded:boolean,setExpanded:(v:boolean)=>void,openMode=false)=><section className="dana-related-panel">
  <header className="dana-related-head">
   {canSelect&&<SelectionBox label={`انتخاب ${title}`} checked={items.length>0&&items.every(r=>bulk.ids.has(r.id))} partial={items.some(r=>bulk.ids.has(r.id))&&!items.every(r=>bulk.ids.has(r.id))} disabled={busy||!items.length} onChange={()=>bulk.toggle(items.map(r=>r.id))}/>}
   <button className="dana-panel-toggle" onClick={()=>setExpanded(!expanded)}>{expanded?<ChevronUp size={17}/>:<ChevronDown size={17}/>}<b>{title}</b><span className="dana-count">{num(items.length)}</span></button>
   {openMode&&canEdit&&<div className="dana-quick-actions">
    <Button size="sm" variant="ghost" onClick={()=>onNew('call')}><Plus size={15}/>تماس</Button>
    <Button size="sm" variant="ghost" onClick={()=>onNew('task')}><Plus size={15}/>وظیفه</Button>
    <Button size="sm" variant="ghost" onClick={()=>onNew('meeting')}><Plus size={15}/>جلسه</Button>
   </div>}
  </header>
  {expanded&&<div className="dana-related-body">{items.length?items.map(r=>activityRow(r,!openMode)):<p className="dana-empty">فعالیتی برای نمایش وجود ندارد.</p>}</div>}
 </section>;
 return <section className="dana-activities-shell">
  {canSelect&&onDeleteMany&&<RecordBulkActions selection={bulk} allRows={allRows} busy={busy} onDelete={onDeleteMany} selectAllLabel="انتخاب همه فعالیت‌های فیلترشده"/>}
  <div className="dana-activities-summary">
   <div><span>فعالیت‌های باز</span><strong>{num(open.length)}</strong><small>برای پیگیری</small></div>
   <div><span>فعالیت‌های بسته</span><strong>{num(closed.length)}</strong><small>انجام‌شده</small></div>
   <div><span>جلسه‌ها</span><strong>{num(rows.filter(r=>typeOf(r)==='meeting').length)}</strong><small>کل جلسات</small></div>
   <div><span>تماس‌ها</span><strong>{num(rows.filter(r=>typeOf(r)==='call').length)}</strong><small>کل تماس‌ها</small></div>
  </div>
  {section('فعالیت‌های باز',open,openExpanded,setOpenExpanded,true)}
  {section('فعالیت‌های بسته',closed,closedExpanded,setClosedExpanded,false)}
 </section>;
}
