export function authFailure(code:string|undefined,status:number){
 if(['bad_jwt','session_not_found','session_expired','refresh_token_not_found','refresh_token_already_used'].includes(code||''))return {status:401,message:'نشست شما پایان یافته است. دوباره وارد شوید.'};
 if(code==='email_not_confirmed')return {status:401,message:'ایمیل هنوز تأیید نشده است. لینک تأیید را باز کنید یا ارسال مجدد را بزنید.'};
 if(code==='email_address_not_authorized')return {status:503,message:'سرویس ایمیل هنوز برای ارسال به کاربران جدید تنظیم نشده است. مدیر باید SMTP را در Supabase تنظیم کند.'};
 if(code==='over_email_send_rate_limit')return {status:429,message:'سقف ارسال ایمیل موقتاً پر شده است. چند دقیقه بعد دوباره تلاش کنید.'};
 if(code==='over_request_rate_limit')return {status:429,message:'تعداد درخواست‌ها زیاد است. چند دقیقه صبر کنید.'};
 if(code==='signup_disabled'||code==='email_provider_disabled')return {status:503,message:'ثبت‌نام با ایمیل در تنظیمات سرویس غیرفعال است.'};
 if(code==='weak_password')return {status:400,message:'رمز قوی‌تری با حداقل ۱۰ کاراکتر انتخاب کنید.'};
 if(code==='email_address_invalid')return {status:400,message:'نشانی ایمیل معتبر نیست.'};
 if(code==='otp_expired')return {status:400,message:'لینک منقضی یا قبلاً استفاده شده است. لینک تازه درخواست کنید.'};
 if(code==='user_already_exists'||code==='email_exists')return {status:409,message:'برای این ایمیل قبلاً حساب ساخته شده است. وارد شوید یا بازیابی رمز را انتخاب کنید.'};
 if(code==='same_password')return {status:400,message:'رمز جدید باید با رمز قبلی متفاوت باشد.'};
 if(status===429)return {status:429,message:'تعداد درخواست‌ها زیاد است. چند دقیقه بعد دوباره تلاش کنید.'};
 if(code==='invalid_credentials')return {status:401,message:'ایمیل یا رمز عبور درست نیست.'};
 if(status>=500)return {status:502,message:'سرویس ورود پاسخ خطا داد. کمی بعد دوباره تلاش کنید؛ اگر تکرار شد، مدیر گزارش سرویس را بررسی کند.'};
 return {status:status===401||status===403?401:400,message:'ورود یا ثبت‌نام انجام نشد. اطلاعات را بررسی کنید.'};
}
