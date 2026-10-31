'use client';
import {type ReactNode,type ComponentProps} from 'react';
import {Boxes,ClipboardList,Download,History,LayoutDashboard,Package,Settings2,ShieldCheck,Trash2,UserRound,Users,Zap} from 'lucide-react';
import {SidebarMenuButton,useSidebar} from '@/components/ui/sidebar';
import {type WorkspaceLink} from '@/lib/navigation';
import styles from './workspace-navigation.module.css';
const icons:Record<string,typeof Boxes>={dashboard:LayoutDashboard,reports:ClipboardList,products:Package,inventory:Boxes,settings:UserRound,'team-settings':Users,'backup-settings':Download,automations:Zap,'activity-log':History,trash:Trash2,'platform-admin':ShieldCheck};
export function WorkspaceNavigation({label,links,selected,onNavigate,children}:{label:string;links:WorkspaceLink[];selected:string;onNavigate:(id:string)=>void;children?:ReactNode}){
 return <><nav className={styles.navigation} aria-label={label}>{links.map(link=>{const Icon=icons[link.id]||Settings2;return <button key={link.id} type="button" aria-current={selected===link.id?'page':undefined} onClick={()=>onNavigate(link.id)}><Icon size={16} aria-hidden="true"/><span>{link.label}</span></button>;})}</nav>{children}</>;
}

export function SidebarNavigationButton({onClick,...props}:ComponentProps<typeof SidebarMenuButton>){
 const {isMobile,setOpenMobile}=useSidebar();
 return <SidebarMenuButton {...props} onClick={event=>{onClick?.(event);if(!event.defaultPrevented&&isMobile)setOpenMobile(false);}}/>;
}
