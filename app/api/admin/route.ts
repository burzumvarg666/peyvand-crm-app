import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {session,rest,body,fail,ApiError} from '@/lib/server';
export const dynamic='force-dynamic';
export async function GET(){try{const {token}=await session();return NextResponse.json({users:await rest('rpc/crm_platform_users',token,{method:'POST',body:'{}'})});}catch(e){return fail(e);}}
export async function POST(req:NextRequest){try{const input=await body(req),{token}=await session();const p=z.object({user_id:z.string().uuid(),disabled:z.boolean(),expires_on:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()}).safeParse(input);if(!p.success)throw new ApiError('اطلاعات دسترسی معتبر نیست.');await rest('rpc/crm_platform_update',token,{method:'POST',body:JSON.stringify({target_user:p.data.user_id,disabled_value:p.data.disabled,expires_value:p.data.expires_on})});return NextResponse.json({ok:true});}catch(e){return fail(e);}}
