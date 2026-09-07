export {};
declare global {
 interface Window {
  peyvand?: {
   exportPdf:(id:string)=>Promise<{canceled:boolean}>;
   backup:()=>Promise<void>;
   restore:()=>Promise<void>;
  }
 }
}
