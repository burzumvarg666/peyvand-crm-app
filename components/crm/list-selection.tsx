'use client';
import {useState,type ReactNode} from 'react';
import {BulkDeleteDialog,SelectionBar,SelectionBox} from './bulk-selection';
import type {BulkDeleteHandler} from '@/lib/bulk-delete';
import type {Row} from '@/lib/crm';
import styles from './bulk-selection.module.css';

export function useListSelection<T extends {id:string}>(items:T[]){
 const [ids,setIds]=useState<Set<string>>(()=>new Set()),[snapshot,setSnapshot]=useState<T[]|null>(null);
 const selected=items.filter(item=>ids.has(item.id));
 function toggle(targets:string[]){setIds(current=>{
  const next=new Set(items.filter(item=>current.has(item.id)).map(item=>item.id)),remove=targets.every(id=>next.has(id));
  for(const id of targets)if(remove)next.delete(id);else next.add(id);return next;
 });}
 function clear(){setIds(new Set());}
 function deleted(removed:string[]){const done=new Set(removed);setIds(current=>new Set([...current].filter(id=>!done.has(id))));}
 return {ids,selected,snapshot,toggle,clear,deleted,open:()=>setSnapshot(selected),close:()=>setSnapshot(null),
  all:items.length>0&&selected.length===items.length,partial:selected.length>0&&selected.length<items.length,
  toggleAll:()=>toggle(items.map(item=>item.id))};
}
export type RecordSelection=ReturnType<typeof useListSelection<Row>>;
export function RecordBulkActions({selection,allRows,busy,onDelete,selectAllLabel}:{selection:RecordSelection;allRows:Row[];busy:boolean;onDelete:BulkDeleteHandler;selectAllLabel?:string}){
 return <>{selectAllLabel&&<label className={styles.selectAll}><SelectionBox label={selectAllLabel} checked={selection.all} partial={selection.partial} disabled={busy} onChange={selection.toggleAll}/>{selectAllLabel}</label>}
 {selection.selected.length>0&&<SelectionBar count={selection.selected.length} busy={busy} onClear={selection.clear} onDelete={selection.open}/>}
 {selection.snapshot&&<BulkDeleteDialog targets={selection.snapshot} allRows={allRows} onDelete={onDelete} onDeleted={selection.deleted} onClose={selection.close}/>}</>;
}
export function SelectableRecordList({items,allRows,busy,canDelete,onDeleteMany,label,children}:{items:Row[];allRows:Row[];busy:boolean;canDelete:boolean;onDeleteMany?:BulkDeleteHandler;label:string;children:(row:Row)=>ReactNode}){
 const bulk=useListSelection(items),selectable=canDelete&&!!onDeleteMany;
 return <>{selectable&&onDeleteMany&&<RecordBulkActions selection={bulk} allRows={allRows} busy={busy} onDelete={onDeleteMany} selectAllLabel={items.length?`انتخاب همه ${label}`:undefined}/>}
 {items.map(row=><div className={styles.selectableRow} key={row.id}>{selectable&&<SelectionBox label={`انتخاب ${label} ${row.data.name}`} checked={bulk.ids.has(row.id)} disabled={busy} onChange={()=>bulk.toggle([row.id])}/>}<div className={styles.rowContent}>{children(row)}</div></div>)}</>;
}
