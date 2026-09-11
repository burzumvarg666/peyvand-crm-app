import {authFailure} from './auth-errors';
import {supabaseProjectUrl,supabasePublishableKey} from './supabase-project';
const projectUrl=process.env.SUPABASE_URL || supabaseProjectUrl;
const projectKey=process.env.SUPABASE_ANON_KEY || supabasePublishableKey;
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
export function configured() { return !!projectUrl && !!projectKey; }
export class ApiError extends Error {
    constructor(message: string, public status = 400) { super(message); }
}
export async function sb(path: string, token?: string, init: RequestInit = {}) { if (!configured())
    throw new ApiError('پایگاه داده هنوز متصل نشده است.', 503); const r = await fetch(projectUrl + path, { ...init, cache: 'no-store', headers: { apikey: projectKey, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers }, signal: AbortSignal.timeout(15000) }); const text = await r.text(); const data = text ? JSON.parse(text) : null; if (!r.ok) {
    if(path.startsWith('/auth/v1/')) {
      const authError = authFailure(data?.code, r.status);
      console.warn('Supabase Auth failure', {code: typeof data?.code==='string'?data.code:'unknown', status:r.status});
      throw new ApiError(authError.message, authError.status);
    }
    if (r.status === 401)
        throw new ApiError('نشست منقضی شده است. دوباره وارد شوید.', 401);
    if (r.status === 429)
        throw new ApiError('درخواست‌ها بیش از حد است. کمی بعد دوباره تلاش کنید.', 429);
    if (r.status === 409 || data?.code === '23505')
        throw new ApiError('این مورد قبلاً ثبت شده است.', 409);
    if (r.status === 403 || data?.code === '42501')
        throw new ApiError('اجازه انجام این عملیات را ندارید.', 403);
    if (data?.code === 'P0001')
        throw new ApiError('عملیات با وضعیت فعلی اطلاعات سازگار نیست. صفحه را تازه کنید.', 409);
    throw new ApiError('عملیات انجام نشد. اطلاعات ورودی و اتصال پایگاه داده را بررسی کنید.', r.status >= 500 ? 502 : 400);
} return data; }
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/' };
export async function setSession(data: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
}) { const c = await cookies(); c.set('peyvand_access', data.access_token, { ...cookieOptions, maxAge: data.expires_in }); c.set('peyvand_refresh', data.refresh_token, { ...cookieOptions, maxAge: 60 * 60 * 24 * 30 }); }
export async function clearSession() { const c = await cookies(); c.set('peyvand_access', '', { ...cookieOptions, maxAge: 0 }); c.set('peyvand_refresh', '', { ...cookieOptions, maxAge: 0 }); }
export async function session() { const c = await cookies(); let token = c.get('peyvand_access')?.value; const refresh = c.get('peyvand_refresh')?.value; if (token) {
    try {
        return { token, user: await sb('/auth/v1/user', token) };
    }
    catch (e) {
        if (!(e instanceof ApiError) || e.status !== 401)
            throw e;
    }
} if (refresh) {
    const d = await sb('/auth/v1/token?grant_type=refresh_token', undefined, { method: 'POST', body: JSON.stringify({ refresh_token: refresh }) });
    await setSession(d);
    token = d.access_token;
    return { token: token!, user: await sb('/auth/v1/user', token) };
} throw new ApiError('ابتدا وارد حساب شوید.', 401); }
export async function body(req: NextRequest) { const origin = req.headers.get('origin'); let originUrl: URL | null = null; try { originUrl = origin ? new URL(origin) : null; } catch { /* Reject malformed origins. */ }
// Browser Host and Origin must agree; Next may internally normalize req.url to localhost.
if (!originUrl || !['http:', 'https:'].includes(originUrl.protocol) || originUrl.host !== req.headers.get('host'))
    throw new ApiError('مبدأ درخواست معتبر نیست.', 403); if (!req.headers.get('content-type')?.startsWith('application/json'))
    throw new ApiError('فرمت درخواست معتبر نیست.', 415); const reader = req.body?.getReader(); if (!reader)
    throw new ApiError('درخواست خالی است.'); let size = 0; const chunks: Uint8Array[] = []; while (true) {
    const { value, done } = await reader.read();
    if (done)
        break;
    size += value.length;
    if (size > 65536) {
        await reader.cancel();
        throw new ApiError('درخواست بیش از حد بزرگ است.', 413);
    }
    chunks.push(value);
} try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
catch {
    throw new ApiError('درخواست معتبر نیست.');
} }
export function fail(e: unknown) { if (e instanceof ApiError)
    return NextResponse.json({ error: e.message }, { status: e.status }); return NextResponse.json({ error: 'خطا در ارتباط با سرویس. دوباره تلاش کنید.' }, { status: 500 }); }
export async function rest(table: string, token: string, init: RequestInit = {}) { return sb('/rest/v1/' + table, token, init); }
