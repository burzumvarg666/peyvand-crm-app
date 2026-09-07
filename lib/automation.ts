import {addDays, blank, type Data, type Row} from './crm';
export type AutomationChange = {previous?: Row; next: Row};
export function automationCandidates(rows: Row[], day: string, change?: AutomationChange) {
    const seen = new Set(rows.map(r=>r.data.automation_key).filter(Boolean));
    const candidates: {kind:'tasks'|'notes';data:Data;parent_id:string|null}[]=[];
    const rules=rows.filter(r=>r.kind==='automations'&&r.data.status==='active'&&r.data.automation_enabled);
    for(const rule of rules){
        let sources:Row[]=[];
        if(rule.data.automation_trigger==='stage_change'){
            if(change?.next.kind==='deals'&&change.previous?.data.stage!==change.next.data.stage&&rule.data.automation_stage===change.next.data.stage)sources=[change.next];
        }else if(rule.data.automation_trigger==='quote_expiry'){
            sources=rows.filter(r=>r.kind==='proformas'&&['draft','sent'].includes(r.data.quote_status)&&r.data.valid_until&&r.data.valid_until<=addDays(day,rule.data.automation_days));
        }else{
            sources=rows.filter(r=>r.kind==='tasks'&&r.data.status==='open'&&!r.data.automation_key&&r.data.due&&r.data.due<day);
        }
        for(const source of sources){
            const occurrence=rule.data.automation_trigger==='stage_change'?`${source.data.stage}:${source.version}`:source.data.valid_until||source.data.due;
            const key=`${source.id}:${rule.id}:${rule.data.automation_trigger}:${occurrence}`;
            const notify=rule.data.automation_action==='notify';
            const storedKey=notify?'notify:'+key:key;
            // Recognize tasks made by older versions as well.
            const legacyStage=`${source.id}:${rule.id}:${source.data.stage}`;
            if(seen.has(storedKey)||(rule.data.automation_trigger==='stage_change'&&seen.has(legacyStage)))continue;
            seen.add(storedKey);
            const name=`${notify?'یادآوری':'پیگیری'}: ${source.data.name}`.slice(0,160);
            candidates.push({kind:notify?'notes':'tasks',parent_id:notify?source.id:source.parent_id,data:{...blank(),name,status:'open',due:rule.data.automation_trigger==='quote_expiry'?day:addDays(day,rule.data.automation_days),description:rule.data.description||`اجرای قانون «${rule.data.name}»`,automation_key:storedKey}});
        }
    }
    return candidates;
}
