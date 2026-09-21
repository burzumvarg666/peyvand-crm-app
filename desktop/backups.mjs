import {mkdirSync,writeFileSync,renameSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
export class BackupManager {
 constructor(store,folder){this.store=store;this.folder=folder;mkdirSync(folder,{recursive:true});}
 snapshot(reason='manual'){
  const file=join(this.folder,`${reason}-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID()}.json`);
  const tmp=file+'.tmp';writeFileSync(tmp,JSON.stringify(this.store.exportBackup()),{flag:'wx',mode:0o600});renameSync(tmp,file);return file;
 }
 daily(){const day=new Date().toLocaleDateString('en-CA');const prefix='daily-'+day+'-';if(!readdirSync(this.folder).some(n=>n.startsWith(prefix))){return this.snapshot(prefix.slice(0,-1));}}
 status(){const files=readdirSync(this.folder).filter(n=>n.endsWith('.json')).map(n=>({name:n,time:statSync(join(this.folder,n)).mtime.toISOString()})).sort((a,b)=>b.time.localeCompare(a.time));return {count:files.length,last:files[0]?.time||null};}
}
