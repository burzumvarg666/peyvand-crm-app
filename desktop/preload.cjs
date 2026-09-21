/* eslint-disable @typescript-eslint/no-require-imports */
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('peyvand',{
 getPreference: key=>ipcRenderer.invoke('peyvand:get-preference',key),
 setPreference: (key,value)=>ipcRenderer.invoke('peyvand:set-preference',key,value),
 importBackup: ()=>ipcRenderer.invoke('peyvand:import-backup'),
 backupStatus: ()=>ipcRenderer.invoke('peyvand:backup-status'),
 backupFolder: ()=>ipcRenderer.invoke('peyvand:backup-folder'),
 exportPdf: id=>ipcRenderer.invoke('peyvand:export-pdf',id),
 backup: ()=>ipcRenderer.invoke('peyvand:backup'),
 restore: ()=>ipcRenderer.invoke('peyvand:restore')
});
