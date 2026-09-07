/* eslint-disable @typescript-eslint/no-require-imports */
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('peyvand',{
 exportPdf: id=>ipcRenderer.invoke('peyvand:export-pdf',id),
 backup: ()=>ipcRenderer.invoke('peyvand:backup'),
 restore: ()=>ipcRenderer.invoke('peyvand:restore')
});
