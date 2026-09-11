export function authFailure(code: string | undefined, status: number) {
  if (code === 'email_not_confirmed') return {status: 401, message: 'ایمیل حساب هنوز تأیید نشده است. پیوند تأیید را در صندوق ورودی یا پوشهٔ هرزنامه باز کنید و سپس وارد شوید.'};
  if (code === 'email_address_not_authorized') return {status: 503, message: 'ارسال ایمیل تأیید برای کاربران جدید هنوز راه‌اندازی نشده است. مدیر سامانه باید سرویس ایمیل را تنظیم کند.'};
  if (code === 'over_email_send_rate_limit') return {status: 429, message: 'سقف ارسال ایمیل تأیید موقتاً پر شده است. کمی بعد دوباره امتحان کنید.'};
  if (code === 'signup_disabled' || code === 'email_provider_disabled') return {status: 503, message: 'ثبت‌نام با ایمیل در تنظیمات سامانه غیرفعال است.'};
  if (code === 'weak_password') return {status: 400, message: 'رمز عبور قوی‌تری با حداقل ۱۰ کاراکتر انتخاب کنید.'};
  if (code === 'email_address_invalid') return {status: 400, message: 'یک نشانی ایمیل معتبر وارد کنید.'};
  if (status === 429) return {status: 429, message: 'درخواست‌ها بیش از حد است. چند دقیقه بعد دوباره تلاش کنید.'};
  if (code === 'invalid_credentials') return {status: 401, message: 'ایمیل یا رمز عبور درست نیست.'};
  if (status >= 500) return {status: 502, message: 'سرویس ورود یا ارسال ایمیل در دسترس نیست. دوباره تلاش کنید.'};
  return {status: status === 401 ? 401 : 400, message: 'ورود یا ثبت‌نام انجام نشد. اطلاعات حساب را بررسی کنید.'};
}
