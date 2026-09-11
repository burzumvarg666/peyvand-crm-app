// Supabase email links return credentials in the fragment, never in server requests.
export function readEmailCallback(hash: string, search: string) {
  const fragment = new URLSearchParams(hash.replace(/^#/, ''));
  const query = new URLSearchParams(search);
  const hasCallback = ['access_token','refresh_token','error','error_code'].some(key => fragment.has(key)) || query.has('error') || query.has('error_code');
  if (!hasCallback) return null;
  if (fragment.has('error') || fragment.has('error_code') || query.has('error') || query.has('error_code'))
    return { error: 'لینک تأیید نامعتبر، منقضی یا قبلاً استفاده شده است. اگر قبلاً تأیید کرده‌اید، از بخش ورود وارد شوید؛ در غیر این صورت لینک تازه درخواست کنید.' };
  if (fragment.get('type') === 'recovery')
    return { error: 'این لینک بازیابی رمز عبور است، نه تأیید ثبت‌نام. برای ورود از رمز حساب پیوند استفاده کنید.' };
  const refreshToken = fragment.get('refresh_token');
  if (!refreshToken || !fragment.get('access_token'))
    return { error: 'لینک تأیید کامل نیست. آخرین لینک ایمیل را دوباره باز کنید.' };
  return { refreshToken };
}
