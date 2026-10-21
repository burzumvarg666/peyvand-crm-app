import {z} from 'zod';
export const emailSchema=z.string().trim().email('ایمیل معتبر وارد کنید.').max(254).transform(v=>v.toLowerCase());
export const passwordSchema=z.string().min(10,'رمز عبور باید حداقل ۱۰ کاراکتر داشته باشد.').max(128);
export const signupSchema=z.object({email:emailSchema,password:passwordSchema,password_confirmation:z.string(),name:z.string().trim().min(2,'نام و نام خانوادگی را وارد کنید.').max(100)}).refine(v=>v.password===v.password_confirmation,{message:'رمز عبور و تکرار آن یکسان نیستند.',path:['password_confirmation']});
export const PUBLIC_APP_URL='https://peyvand-crm-app.vercel.app';
export function authRedirect(mode?:'invite'|'recovery'){
 const u=new URL(process.env.APP_URL||PUBLIC_APP_URL);
 if(u.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(u.hostname))throw new Error('آدرس عمومی برنامه معتبر نیست.');
 u.pathname='/';u.search='';u.hash='';if(mode)u.searchParams.set('auth',mode);
 return u.toString();
}
