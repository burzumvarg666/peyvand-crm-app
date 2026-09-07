import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { session, rest, body, fail, ApiError } from '@/lib/server';
import { dataSchema, kinds } from '@/lib/crm';
export const dynamic = 'force-dynamic';
const uuid = z.string().uuid();
async function membership(token: string, userId: string) { const m = await rest(`crm_members?user_id=eq.${userId}&select=org_id,role&limit=1`, token); return m[0]; }
async function all(table: string, token: string) { const result: unknown[] = []; for (let offset = 0; offset < 100000; offset += 500) {
    const page = await rest(table + `&limit=500&offset=${offset}`, token);
    result.push(...page);
    if (page.length < 500)
        return result;
} throw new ApiError('حجم اطلاعات برای این نما زیاد است. از پشتیبانی کمک بگیرید.', 413); }
export async function GET() { try {
    const { token, user } = await session();
    await rest('rpc/crm_accept_invites', token, { method: 'POST', body: '{}' });
    const m = await membership(token, user.id);
    if (!m)
        return NextResponse.json({ org: null, user: { id: user.id, email: user.email }, role: 'viewer', records: [], members: [], invites: [], audit: [] });
    const [org, records, members, invites, audit] = await Promise.all([rest(`crm_orgs?id=eq.${m.org_id}&select=id,name`, token), all(`crm_records?org_id=eq.${m.org_id}&select=*&order=created_at.desc,id`, token), all(`crm_members?org_id=eq.${m.org_id}&select=user_id,email,role&order=user_id`, token), m.role === 'admin' ? all(`crm_invites?org_id=eq.${m.org_id}&select=id,email,role&order=id`, token) : [], rest(`crm_audit?org_id=eq.${m.org_id}&select=id,record_id,action,label,created_at,actor_id&order=created_at.desc&limit=100`, token)]);
    return NextResponse.json({ org: org[0], role: m.role, user: { id: user.id, email: user.email }, records, members, invites, audit });
}
catch (e) {
    return fail(e);
} }
export async function POST(req: NextRequest) {
    try {
        const input = await body(req);
        const { token, user } = await session();
        if (input.action === 'workspace') {
            const p = z.object({ name: z.string().trim().min(1).max(100) }).safeParse(input);
            if (!p.success)
                throw new ApiError('نام فضای کاری معتبر نیست.');
            await rest('rpc/crm_create_workspace', token, { method: 'POST', body: JSON.stringify({ workspace_name: p.data.name }) });
            return NextResponse.json({ ok: true });
        }
        const m = await membership(token, user.id);
        if (!m)
            throw new ApiError('فضای کاری یافت نشد.', 404);
        if (m.role === 'viewer')
            throw new ApiError('دسترسی شما فقط مشاهده است.', 403);
        if (input.action === 'save') {
            const p = z.object({ kind: z.enum(kinds), data: dataSchema, parent_id: uuid.nullable(), id: uuid.optional(), version: z.number().int().positive().optional() }).safeParse(input);
            if (!p.success)
                throw new ApiError(p.error.issues[0].message);
            const v = p.data;
            if (v.kind === 'tasks' && !['open', 'done'].includes(v.data.status))
                throw new ApiError('وضعیت پیگیری معتبر نیست.');
            if (['companies', 'contacts'].includes(v.kind) && !['active', 'lead', 'inactive'].includes(v.data.status))
                throw new ApiError('وضعیت مشتری معتبر نیست.');
            if (v.kind === 'companies' && v.parent_id)
                throw new ApiError('مشتری نمی‌تواند رکورد والد داشته باشد.');
            if (v.parent_id) {
                if (v.id === v.parent_id)
                    throw new ApiError('ارتباط رکورد با خودش مجاز نیست.');
                const parents = await rest(`crm_records?id=eq.${v.parent_id}&org_id=eq.${m.org_id}&select=kind`, token);
                if (!parents.length || (v.kind !== 'notes' && parents[0].kind !== 'companies') || parents[0].kind === 'notes')
                    throw new ApiError('مشتری یا رکورد مرتبط معتبر نیست.');
            }
            if (v.data.assignee) {
                const assignees = await rest(`crm_members?user_id=eq.${v.data.assignee}&org_id=eq.${m.org_id}&select=user_id`, token);
                if (!assignees.length)
                    throw new ApiError('مسئول انتخاب‌شده عضو تیم نیست.');
            }
            const payload = { org_id: m.org_id, kind: v.kind, data: v.data, parent_id: v.parent_id };
            const result = await rest(v.id ? `crm_records?id=eq.${v.id}&org_id=eq.${m.org_id}&kind=eq.${v.kind}&version=eq.${v.version || 0}` : 'crm_records', token, { method: v.id ? 'PATCH' : 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) });
            if (!result?.length)
                throw new ApiError('رکورد تغییر کرده یا حذف شده است. صفحه را تازه و دوباره ویرایش کنید.', 409);
            return NextResponse.json({ ok: true });
        }
        if (input.action === 'delete') {
            const p = z.object({ id: uuid, version: z.number().int().positive() }).safeParse(input);
            if (!p.success)
                throw new ApiError('شناسه معتبر نیست.');
            const result = await rest(`crm_records?id=eq.${p.data.id}&org_id=eq.${m.org_id}&version=eq.${p.data.version}`, token, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
            if (!result?.length)
                throw new ApiError('رکورد تغییر کرده است. اطلاعات را تازه کنید.', 409);
            return NextResponse.json({ ok: true });
        }
        if (m.role !== 'admin')
            throw new ApiError('این عملیات به دسترسی مدیر نیاز دارد.', 403);
        if (input.action === 'invite') {
            const p = z.object({ email: z.string().trim().email().max(254), role: z.enum(['sales', 'viewer']) }).safeParse(input);
            if (!p.success)
                throw new ApiError('ایمیل یا نقش معتبر نیست.');
            await rest('crm_invites', token, { method: 'POST', body: JSON.stringify({ org_id: m.org_id, email: p.data.email.toLowerCase(), role: p.data.role }) });
            return NextResponse.json({ ok: true });
        }
        if (input.action === 'revokeInvite') {
            const id = uuid.safeParse(input.id);
            if (!id.success)
                throw new ApiError('شناسه معتبر نیست.');
            await rest(`crm_invites?id=eq.${id.data}&org_id=eq.${m.org_id}`, token, { method: 'DELETE' });
            return NextResponse.json({ ok: true });
        }
        throw new ApiError('عملیات ناشناخته است.');
    }
    catch (e) {
        return fail(e);
    }
}
