import {NextRequest,NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {z} from 'zod';
import {configured,session,sb,setSession,clearSession,body,fail,ApiError} from '@/lib/server';
import {authRedirect,emailSchema,passwordSchema,signupSchema} from '@/lib/auth-flow';
export const dynamic='force-dynamic';
const flowCookie='peyvand_password_setup';
const flowOptions={httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax' as const,path:'/api/auth'};
async function markSetup(userId:string){(await cookies()).set(flowCookie,userId,{...flowOptions,maxAge:600});}
async function clearSetup(){(await cookies()).set(flowCookie,'',{...flowOptions,maxAge:0});}
function json(data:unknown){return NextResponse.json(data,{headers:{'Cache-Control':'no-store'}});}
function parsed<T extends z.ZodTypeAny>(schema:T,input:unknown):z.infer<T>{const result=schema.safeParse(input);if(!result.success)throw new ApiError(result.error.issues[0].message);return result.data;}
async function establish(d:{access_token?:string;refresh_token?:string;expires_in?:number;user?:{id:string;email_confirmed_at?:string}}){
 if(!d.access_token||!d.refresh_token||!d.expires_in||!d.user?.email_confirmed_at)throw new ApiError('ایمیل هنوز تأیید نشده است.',401,'email_not_confirmed');
 await setSession({access_token:d.access_token,refresh_token:d.refresh_token,expires_in:d.expires_in});
 return d.user;
}
export async function GET(){
 if(!configured())return json({configured:false,authenticated:false});
 try{const {user}=await session();return json({configured:true,authenticated:true,passwordSetup:(await cookies()).get(flowCookie)?.value===user.id});}
 catch(e){if(e instanceof ApiError&&e.status===401){await clearSession();await clearSetup();return json({configured:true,authenticated:false});}return fail(e);}
}
export async function POST(req:NextRequest){try{
 const input=await body(req);
 if(input.action==='logout'){
  try{const {token}=await session();await sb('/auth/v1/logout',token,{method:'POST'});}catch{console.warn('Remote logout unavailable; clearing local session.');}finally{await clearSession();await clearSetup();}
  return json({ok:true});
 }
 if(input.action==='confirm'){
  const v=parsed(z.object({refresh_token:z.string().min(1).max(8192).optional(),token_hash:z.string().min(1).max(4096).optional(),type:z.enum(['signup','email','invite','recovery','magiclink']).default('signup'),setup_password:z.boolean().default(false)}).refine(v=>!!v.refresh_token!==!!v.token_hash,'لینک تأیید معتبر نیست.'),input);
  const d=v.token_hash?await sb('/auth/v1/verify',undefined,{method:'POST',body:JSON.stringify({token_hash:v.token_hash,type:v.type==='magiclink'?'email':v.type})}):await sb('/auth/v1/token?grant_type=refresh_token',undefined,{method:'POST',body:JSON.stringify({refresh_token:v.refresh_token})});
  const user=await establish(d),passwordSetup=v.type==='recovery'||v.type==='invite'||v.setup_password;
  if(passwordSetup)await markSetup(user.id);else await clearSetup();
  return json({ok:true,passwordSetup});
 }
 if(input.action==='set-password'){
  const v=parsed(z.object({password:passwordSchema,password_confirmation:z.string()}).refine(v=>v.password===v.password_confirmation,'رمز عبور و تکرار آن یکسان نیستند.'),input);
  const {token,user}=await session();
  if((await cookies()).get(flowCookie)?.value!==user.id)throw new ApiError('لینک تعیین رمز منقضی شده است. لینک تازه درخواست کنید.',401);
  await sb('/auth/v1/user',token,{method:'PUT',body:JSON.stringify({password:v.password})});
  await sb('/auth/v1/logout?scope=global',token,{method:'POST'});await clearSession();await clearSetup();
  return json({ok:true,signInAgain:true});
 }
 if(input.action==='resend'||input.action==='recover'){
  const {email}=parsed(z.object({email:emailSchema}),input),recover=input.action==='recover';
  const redirect=encodeURIComponent(authRedirect(recover?'recovery':undefined));
  await sb((recover?'/auth/v1/recover':'/auth/v1/resend')+'?redirect_to='+redirect,undefined,{method:'POST',body:JSON.stringify(recover?{email}:{type:'signup',email})});
  return json({ok:true,confirmation:!recover});
 }
 if(input.action==='signup'){
  const v=parsed(signupSchema,input);
  const d=await sb('/auth/v1/signup?redirect_to='+encodeURIComponent(authRedirect()),undefined,{method:'POST',body:JSON.stringify({email:v.email,password:v.password,data:{full_name:v.name}})});
  if(d.access_token){await establish(d);await clearSetup();return json({ok:true,confirmation:false});}
  return json({ok:true,confirmation:true});
 }
 if(input.action==='login'){
  const v=parsed(z.object({email:emailSchema,password:z.string().min(1).max(128)}),input);
  const d=await sb('/auth/v1/token?grant_type=password',undefined,{method:'POST',body:JSON.stringify(v)});await establish(d);await clearSetup();
  return json({ok:true,confirmation:false});
 }
 throw new ApiError('درخواست ورود معتبر نیست.');
}catch(e){return fail(e);}}
