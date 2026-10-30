import {NextResponse} from 'next/server';
import {session,rest,fail,ApiError} from '@/lib/server';
export const dynamic='force-dynamic';
export async function GET(){
 try{
  const {token}=await session();
  const snapshot=await rest('rpc/crm_workspace_snapshot',token,{method:'POST',body:'{}'});
  if(Buffer.byteLength(JSON.stringify(snapshot),'utf8')>4_000_000)throw new ApiError('حجم نسخه اطلاعات از سقف مجاز دانلود این نسخه بیشتر است. برای تهیه نسخه پایگاه داده با پشتیبانی تماس بگیرید.',413);
  return NextResponse.json(snapshot,{headers:{'Cache-Control':'private, no-store, max-age=0','Content-Disposition':'attachment; filename="peyvand-workspace-snapshot.json"','X-Content-Type-Options':'nosniff'}});
 }catch(e){return fail(e);}
}
