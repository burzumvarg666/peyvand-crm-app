import {NextResponse} from 'next/server';
import {session,rest,fail} from '@/lib/server';
export const dynamic='force-dynamic';
export async function GET(){
 try{
  const {token}=await session();
  const snapshot=await rest('rpc/crm_workspace_snapshot',token,{method:'POST',body:'{}'});
  return NextResponse.json(snapshot,{headers:{'Cache-Control':'private, no-store, max-age=0','Content-Disposition':'attachment; filename="peyvand-workspace-snapshot.json"','X-Content-Type-Options':'nosniff'}});
 }catch(e){return fail(e);}
}
