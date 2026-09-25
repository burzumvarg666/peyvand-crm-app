import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {session,sb,body,fail,ApiError,clearSession} from '@/lib/server';
export async function GET(){try{const {user}=await session();return NextResponse.json({name:user.user_metadata?.full_name||'',username:user.user_metadata?.username||''});}catch(e){return fail(e);}}
export async function POST(req:NextRequest){try{const input=await body(req);const {token,user}=await session();if(input.action==='password'){
 const p=z.object({current:z.string().min(1).max(128),password:z.string().min(10).max(128)}).parse(input);
 const verified=await sb('/auth/v1/token?grant_type=password',undefined,{method:'POST',body:JSON.stringify({email:user.email,password:p.current})});
 if(verified.user?.id!==user.id)throw new ApiError('رمز فعلی درست نیست.',401);
 await sb('/auth/v1/user',verified.access_token,{method:'PUT',body:JSON.stringify({password:p.password})});
 await sb('/auth/v1/logout?scope=global',verified.access_token,{method:'POST'});await clearSession();
 return NextResponse.json({ok:true,signInAgain:true});
 }
 const p=z.object({name:z.string().trim().min(1).max(100),username:z.string().trim().max(40).regex(/^[a-zA-Z0-9_.-]*$/)}).parse(input);
 await sb('/auth/v1/user',token,{method:'PUT',body:JSON.stringify({data:{full_name:p.name,username:p.username}})});return NextResponse.json({ok:true});
 }catch(e){return fail(e);}}
