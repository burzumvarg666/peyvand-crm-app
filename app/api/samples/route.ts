import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {session,rest,body,fail,ApiError} from '@/lib/server';
import {sampleSchema} from '@/lib/samples';
export const dynamic='force-dynamic';
export async function GET(){try{const {token}=await session();const rows=[];for(let offset=0;offset<100000;offset+=200){const page=await rest(`crm_samples?select=id,version,data&order=created_at.desc,id&limit=200&offset=${offset}`,token);rows.push(...page);if(page.length<200)return NextResponse.json({rows});}throw new ApiError('تعداد پرونده‌ها بیش از حد مجاز است.');}catch(e){return fail(e);}}
export async function POST(req:NextRequest){try{const b=await body(req,2*1024*1024),{token}=await session();const p=z.object({id:z.string().uuid().nullable(),version:z.number().int().min(0),data:sampleSchema}).safeParse(b);if(!p.success)throw new ApiError(p.error.issues[0]?.message||'اطلاعات نمونه ناقص است');const result=await rest('rpc/crm_sample_save',token,{method:'POST',body:JSON.stringify({sample_id:p.data.id,expected_version:p.data.version,payload:p.data.data})});return NextResponse.json({ok:true,id:result});}catch(e){return fail(e);}}
