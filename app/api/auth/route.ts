import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { configured, session, sb, setSession, clearSession, body, fail, ApiError } from '@/lib/server';
export const dynamic = 'force-dynamic';

export async function GET() {
    if (!configured()) return NextResponse.json({ configured: false, authenticated: false });
    try {
        await session();
        return NextResponse.json({ configured: true, authenticated: true });
    } catch (e) {
        if (e instanceof ApiError && e.status === 401)
            return NextResponse.json({ configured: true, authenticated: false });
        return fail(e);
    }
}

export async function POST(req: NextRequest) {
    try {
        const input = await body(req);

        if (input.action === 'confirm') {
            const parsed = z.object({ refresh_token: z.string().min(1).max(8192) }).safeParse(input);
            if (!parsed.success) throw new ApiError('لینک تأیید معتبر نیست.');
            const d = await sb('/auth/v1/token?grant_type=refresh_token', undefined, {
                method: 'POST',
                body: JSON.stringify({ refresh_token: parsed.data.refresh_token })
            });
            if (!d.access_token || !d.refresh_token || !d.user?.email_confirmed_at)
                throw new ApiError('تأیید ایمیل کامل نشده است.', 401);
            await setSession(d);
            return NextResponse.json({ ok: true });
        }

        if (input.action === 'logout') {
            try {
                const { token } = await session();
                await sb('/auth/v1/logout', token, { method: 'POST' });
            } catch (e) {
                if (!(e instanceof ApiError) || e.status !== 401) throw e;
            } finally {
                await clearSession();
            }
            return NextResponse.json({ ok: true });
        }

        if (input.action === 'resend') {
            const parsed = z.object({ email: z.string().trim().email().max(254) }).safeParse(input);
            if (!parsed.success) throw new ApiError('ایمیل معتبر نیست.');
            try {
                await sb('/auth/v1/resend', undefined, {
                    method: 'POST',
                    body: JSON.stringify({ type: 'signup', email: parsed.data.email.toLowerCase() })
                });
            } catch (e) {
                if (e instanceof ApiError && e.status === 502)
                    throw new ApiError('درخواست به Supabase رسید، اما SMTP نتوانست ایمیل تأیید را ارسال کند. تنظیمات SMTP پروژه باید اصلاح شود.', 502);
                throw e;
            }
            return NextResponse.json({ ok: true });
        }

        const parsed = z.object({
            action: z.enum(['login', 'signup']),
            email: z.string().trim().email().max(254),
            password: z.string().min(1).max(128)
        }).safeParse(input);
        if (!parsed.success) throw new ApiError('ایمیل یا رمز عبور معتبر نیست.');

        const { action, password } = parsed.data;
        const email = parsed.data.email.toLowerCase();
        if (action === 'signup' && password.length < 10)
            throw new ApiError('رمز عبور باید حداقل ۱۰ کاراکتر داشته باشد.');

        let d;
        try {
            d = await sb(action === 'signup' ? '/auth/v1/signup' : '/auth/v1/token?grant_type=password', undefined, {
                method: 'POST',
                body: JSON.stringify({ email, password })
            });
        } catch (e) {
            if (action === 'signup' && e instanceof ApiError && e.status === 502)
                throw new ApiError('ثبت‌نام به Supabase رسید، اما سرویس SMTP در ارسال ایمیل تأیید خطا داد. این مشکل از تنظیمات ارسال ایمیل پروژه است.', 502);
            throw e;
        }

        if (d.access_token) await setSession(d);
        return NextResponse.json({ ok: true, confirmation: !d.access_token });
    } catch (e) {
        return fail(e);
    }
}
