export type NavigationContext={desktop:boolean;demo:boolean;role:'admin'|'sales'|'viewer';platformAdmin?:boolean};
export type WorkspaceLink={id:string;label:string};
const settingsPages=['settings','team-settings','backup-settings','automations','activity-log','trash','platform-admin'];
export function navigationArea(view:string){
 if(view==='reports')return 'dashboard';
 if(view==='inventory')return 'products';
 if(settingsPages.includes(view))return 'settings';
 if(view==='people')return 'companies';
 return view;
}
export function workspaceLinks(view:string,context:NavigationContext):WorkspaceLink[]{
 const area=navigationArea(view);
 if(area==='dashboard')return [{id:'dashboard',label:'نمای کلی'},{id:'reports',label:'گزارش فروش'}];
 if(area==='products')return [{id:'products',label:'فهرست محصولات'},{id:'inventory',label:'موجودی و گردش انبار'}];
 if(area!=='settings')return [];
 return [
  ...(!context.desktop&&!context.demo?[{id:'settings',label:'حساب کاربری'}]:[]),
  ...(!context.desktop?[{id:'team-settings',label:'اعضای تیم'}]:[]),
  {id:'backup-settings',label:'پشتیبان و انتقال'},
  {id:'automations',label:'اتوماسیون فروش'},
  ...(!context.desktop&&!context.demo&&context.role==='admin'?[{id:'activity-log',label:'گزارش تغییرات'},{id:'trash',label:'سطل بازیافت'}]:[]),
  ...(!context.desktop&&!context.demo&&context.platformAdmin?[{id:'platform-admin',label:'دسترسی کاربران آنلاین'}]:[]),
 ];
}
export function resolveNavigation(view:string,context:NavigationContext){
 if(view==='people')return 'companies';
 if(navigationArea(view)==='settings'&&!workspaceLinks('settings',context).some(link=>link.id===view))return context.desktop||context.demo?'backup-settings':'settings';
 return view;
}
