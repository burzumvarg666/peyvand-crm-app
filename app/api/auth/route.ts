import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { configured, session, sb, setSession, clearSession, body, fail, ApiError } from '@/lib/server';
export const dynamic = 'force-dynamic';
export async function GET() { if (!configured())
    return NextResponse.json({ configured: false, authenticated: false }); try {
    await session();
    return NextResponse.json({ configured: true, authenticated: true });
}
catch (e) {
    if (e instanceof ApiError && e.status === 401)
        return NextResponse.json({ configured: true, authenticated: false });
    return fail(e);
} }
export async function POST(req: NextRequest) { try {
    const input = await body(req);
    if (input.action === 'logout') {
        try {
            const { token } = await session();
            await sb('/auth/v1/logout', token, { method: 'POST' });
        }
        catch (e) {
            if (!(e instanceof ApiError) || e.status !== 401)
                throw e;
        }
        finally {
            await clearSession();
        }
        return NextResponse.json({ ok: true });
    }
    const parsed = z.object({ action: z.enum(['login', 'signup']), email: z.string().trim().email().max(254), password: z.string().min(1).max(128) }).safeParse(input);
    if (!parsed.success)
        throw new ApiError('ایمیل یا رمز عبور معتبر نیست.');
    const { action, email, password } = parsed.data;
    if (action === 'signup' && password.length < 10)
        throw new ApiError('رمز عبور باید حداقل ۱۰ کاراکتر داشته باشد.');
    const d = await sb(action === 'signup' ? '/auth/v1/signup' : '/auth/v1/token?grant_type=password', undefined, { method: 'POST', body: JSON.stringify({ email, password }) });
    if (d.access_token)
        await setSession(d);
    return NextResponse.json({ ok: true, confirmation: !d.access_token });
}
catch (e) {
    return fail(e);
} }
