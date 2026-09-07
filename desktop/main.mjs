import {app,BrowserWindow,Menu,dialog,session,ipcMain} from 'electron';
import {join} from 'node:path';
import {mkdir,writeFile,readFile,rename,stat} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {CRMStore} from './store.mjs';
import {startServer} from './server.mjs';
app.setName('Peyvand CRM');
let win,store,server,closing=false,timer,pdfBusy=false;
const token=randomBytes(32).toString('hex');
const single=app.requestSingleInstanceLock();
if(!single)app.quit();
app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.focus();}});
async function atomicWrite(file,data){const tmp=file+'.'+randomBytes(6).toString('hex')+'.tmp';await writeFile(tmp,data,{flag:'wx'});await rename(tmp,file);}
async function backup(){const r=await dialog.showSaveDialog(win,{title:'ذخیره پشتیبان پیوند',defaultPath:'Peyvand-Backup-'+new Date().toISOString().slice(0,10)+'.json',filters:[{name:'Peyvand backup',extensions:['json']}]});if(r.canceled||!r.filePath)return;await atomicWrite(r.filePath,JSON.stringify(store.exportBackup(),null,2));await dialog.showMessageBox(win,{type:'info',title:'پشتیبان‌گیری',message:'فایل پشتیبان با موفقیت ذخیره شد.'});}
async function restore(){const r=await dialog.showOpenDialog(win,{title:'بازیابی پشتیبان پیوند',properties:['openFile'],filters:[{name:'Peyvand backup',extensions:['json']}]});if(r.canceled)return;const file=r.filePaths[0];if((await stat(file)).size>100*1024*1024)throw new Error('حجم فایل بیش از حد مجاز است.');let data;try{data=JSON.parse(await readFile(file,'utf8'));}catch{throw new Error('فایل پشتیبان خوانا نیست.');}store.validateBackup(data);const confirm=await dialog.showMessageBox(win,{type:'warning',title:'بازیابی پشتیبان',message:'اطلاعات فعلی با این پشتیبان جایگزین شود؟',detail:'قبل از جایگزینی، یک نسخه از اطلاعات فعلی در پوشه پشتیبان برنامه نگهداری می‌شود.',buttons:['انصراف','بازیابی'],defaultId:0,cancelId:0,noLink:true});if(confirm.response!==1)return;const folder=join(app.getPath('userData'),'backups');await mkdir(folder,{recursive:true});await atomicWrite(join(folder,'before-restore-'+Date.now()+'.json'),JSON.stringify(store.exportBackup()));store.restoreBackup(data);win.reload();await dialog.showMessageBox(win,{type:'info',message:'بازیابی با موفقیت انجام شد.'});}
async function guarded(fn){try{await fn();}catch(e){await dialog.showMessageBox(win,{type:'error',title:'پیوند',message:e.message||'عملیات انجام نشد.'});}}
function authorize(event){if(!win||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||new URL(event.senderFrame.url).origin!==server.origin)throw new Error('درخواست معتبر نیست.');}
async function exportPdf(id){
 if(pdfBusy)throw new Error('خروجی دیگری در حال آماده‌شدن است.');
 if(typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id))throw new Error('شناسه معتبر نیست.');
 const record=store.records().find(r=>r.id===id&&r.kind==='proformas');if(!record)throw new Error('پیش‌فاکتور پیدا نشد.');
 pdfBusy=true;let page;
 try{
  const filename=(record.data.quote_number||'Peyvand-Proforma').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-').slice(0,100);
  const result=await dialog.showSaveDialog(win,{title:'ذخیره PDF پیش‌فاکتور',defaultPath:join(app.getPath('documents'),filename+'.pdf'),filters:[{name:'PDF',extensions:['pdf']}]});
  if(result.canceled||!result.filePath)return {canceled:true};
  page=new BrowserWindow({show:false,webPreferences:{session:win.webContents.session,nodeIntegration:false,contextIsolation:true,sandbox:true}});
  page.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  await page.loadURL(server.origin+'/print/proforma/'+id);
  await page.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
  const bytes=await page.webContents.printToPDF({pageSize:'A4',printBackground:true,preferCSSPageSize:true,generateTaggedPDF:true});
  await atomicWrite(result.filePath,bytes);
  return {canceled:false};
 }finally{if(page&&!page.isDestroyed())page.destroy();pdfBusy=false;}
}
if(single)app.whenReady().then(async()=>{
 try{
  const dataDir=app.getPath('userData');await mkdir(dataDir,{recursive:true});
  store=new CRMStore(join(dataDir,'peyvand.sqlite'));
  store.runAutomations();
  timer=setInterval(()=>{try{store.runAutomations();}catch(e){console.error('Automation run failed:',e.message);}},60000);
  server=await startServer({store,ui:join(app.getAppPath(),'ui'),token});
  const ses=session.fromPartition('peyvand-local');
  await ses.cookies.set({url:server.origin,name:'peyvand_desktop',value:token,httpOnly:true,sameSite:'strict',path:'/',secure:false});
  ses.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  ses.setPermissionCheckHandler(()=>false);
  ses.webRequest.onBeforeRequest({urls:['*://*/*']},(details,callback)=>{let allowed=false;try{allowed=new URL(details.url).origin===server.origin;}catch{}callback({cancel:!allowed});});
  win=new BrowserWindow({width:1480,height:960,minWidth:860,minHeight:640,title:'پیوند CRM',icon:join(app.getAppPath(),'icon.ico'),backgroundColor:'#f3f6f4',show:false,webPreferences:{session:ses,preload:join(app.getAppPath(),'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,spellcheck:false}});
  ipcMain.handle('peyvand:export-pdf',async(event,id)=>{authorize(event);return exportPdf(id);});
  ipcMain.handle('peyvand:backup',async event=>{authorize(event);return backup();});
  ipcMain.handle('peyvand:restore',async event=>{authorize(event);return restore();});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==server.origin)event.preventDefault();});
  win.webContents.on('will-attach-webview',event=>event.preventDefault());
  ses.on('will-download',(_event,item)=>{item.setSaveDialogOptions({title:'ذخیره خروجی',defaultPath:join(app.getPath('downloads'),item.getFilename())});});
  Menu.setApplicationMenu(Menu.buildFromTemplate([
   {label:'پرونده',submenu:[{label:'ذخیره پشتیبان…',accelerator:'CmdOrCtrl+Shift+S',click:()=>guarded(backup)},{label:'بازیابی پشتیبان…',click:()=>guarded(restore)},{type:'separator'},{label:'خروج',role:'quit'}]},
   {label:'ویرایش',submenu:[{label:'واگرد',role:'undo'},{label:'انجام دوباره',role:'redo'},{type:'separator'},{label:'برش',role:'cut'},{label:'کپی',role:'copy'},{label:'چسباندن',role:'paste'},{label:'انتخاب همه',role:'selectAll'}]},
   {label:'نمایش',submenu:[{label:'تازه‌سازی',role:'reload'},{label:'بزرگ‌نمایی',role:'zoomIn'},{label:'کوچک‌نمایی',role:'zoomOut'},{label:'اندازه اصلی',role:'resetZoom'},{label:'تمام‌صفحه',role:'togglefullscreen'}]},
   {label:'راهنما',submenu:[{label:'درباره پیوند',click:()=>dialog.showMessageBox(win,{type:'info',title:'پیوند CRM',message:'پیوند CRM — نسخه '+app.getVersion(),detail:'نسخه فارسی، آفلاین و تک‌کاربره. اطلاعات روی همین رایانه ذخیره می‌شود. برای انتقال اطلاعات از منوی پرونده پشتیبان بگیرید.'})}]}
  ]));
  await win.loadURL(server.origin);win.show();
  win.on('closed',()=>{win=null;});
 }catch(e){dialog.showErrorBox('پیوند اجرا نشد',e.message||'خطا در راه‌اندازی');app.quit();}
});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',event=>{if(closing)return;event.preventDefault();closing=true;clearInterval(timer);Promise.resolve(server?.close()).finally(()=>{store?.close();app.quit();});});
