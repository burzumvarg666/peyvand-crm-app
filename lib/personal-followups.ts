import type {Row} from './crm';
/** Due or overdue open activities assigned to the current user. */
export function personalFollowups(rows:Row[],userId:string,today:string){
 if(!userId)return [];
 return rows.filter(r=>(r.kind==='tasks'||r.kind==='activities')&&r.data.status==='open'&&r.data.assignee===userId&&!!r.data.due&&r.data.due<=today)
  .sort((a,b)=>a.data.due.localeCompare(b.data.due)||(a.data.activity_time||'99:99').localeCompare(b.data.activity_time||'99:99')||a.id.localeCompare(b.id));
}
