export {};
declare global {
 interface Window {
  peyvand?: {
   getPreference:(key:string)=>Promise<unknown>;
   setPreference:(key:string,value:unknown)=>Promise<void>;
   importBackup:()=>Promise<void>;
   backupStatus:()=>Promise<{count:number;last:string|null}>;
   backupFolder:()=>Promise<void>;
   exportPdf:(id:string)=>Promise<{canceled:boolean}>;
   backup:()=>Promise<void>;
   restore:()=>Promise<void>;
  }
 }
}
