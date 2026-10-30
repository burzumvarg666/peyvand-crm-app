import {NextRequest,NextResponse} from 'next/server';
import {session,rest,fail,ApiError} from '@/lib/server';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){try{const {token}=await session();const raw=req.nextUrl.searchParams.get('limit')||'200',limit=Number(raw);if(!Number.isInteger(limit)||limit<1||limit>1000)throw new ApiError('تعداد رویداد معتبر نیست.');const rows=await rest('rpc/crm_management_activity',token,{method:'POST',body:JSON.stringify({max_rows:limit})});return NextResponse.json({rows},{headers:{'Cache-Control':'no-store'}});}catch(e){return fail(e);}}
