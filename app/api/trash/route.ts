import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {session,rest,body,fail,ApiError} from '@/lib/server';
export const dynamic='force-dynamic';
export async function GET(){try{const {token}=await session();const rows=await rest('rpc/crm_trash_list',token,{method:'POST',body:'{}'});return NextResponse.json({rows},{headers:{'Cache-Control':'no-store'}});}catch(e){return fail(e);}}
export async function POST(req:NextRequest){try{const input=await body(req),{token}=await session();const parsed=z.object({id:z.string().uuid()}).safeParse(input);if(!parsed.success)throw new ApiError('شناسه مورد معتبر نیست.');await rest('rpc/crm_trash_restore',token,{method:'POST',body:JSON.stringify({trash_id:parsed.data.id})});return NextResponse.json({ok:true});}catch(e){return fail(e);}}
