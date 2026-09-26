import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { session, rest, body, fail, ApiError } from '@/lib/server';
import {automationCandidates} from '@/lib/automation';
import {localDay,type Row} from '@/lib/crm';
import { dataSchema, kinds, validateSales } from '@/lib/crm';
export const dynamic = 'force-dynamic';
const uuid = z.string().uuid();
const importRecord = z.object({
    id: uuid,
    org_id: uuid.optional(),
    kind: z.enum(kinds),
    parent_id: uuid.nullable(),
    data: dataSchema,
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    version: z.number().int().positive()
}).strict();
const importEnvelope = z.object({
    format: z.enum(['peyvand-desktop', 'peyvand-online']),
    schemaVersion: z.literal(1),
    exportedAt: z.string().datetime().optional(),
    workspace: z.string().trim().min(1).max(100).nullable().optional(),
    records: z.array(importRecord).max(100000),
    returns: z.array(z.record(z.unknown())).max(100000).optional(),
    audit: z.array(z.unknown()).max(200000).optional(),
    automationKeys: z.array(z.string().max(200)).max(200000).optional()
}).strict();
const inventoryInput = z.object({
    product_id: uuid,
    type: z.enum(['in','out','adjustment']),
    quantity: z.number().finite().min(0).max(1e12),
    version: z.number().int().positive(),
    reference: z.string().max(160).default(''),
    description: z.string().max(10000).default('')
});
async function membership(token: string, userId: string) { const m = await rest(`crm_members?user_id=eq.${userId}&select=org_id,role&limit=1`, token); return m[0]; }
async function all(table: string, token: string) { const result: unknown[] = []; for (let offset = 0; offset < 100000; offset += 500) {
    const page = await rest(table + `&limit=500&offset=${offset}`, token);
    result.push(...page);
    if (page.length < 500) return result;
} throw new ApiError('حجم اطلاعات برای این نما زیاد است. از پشتیبانی کمک بگیرید.', 413); }
export async function GET() { try {
    const { token, user } = await session();
    const access=await rest('rpc/crm_access_status',token,{method:'POST',body:'{}'});
    if(!access.allowed)throw new ApiError('دسترسی شما تعلیق شده یا اعتبار آن پایان یافته است. با مدیر پیوند تماس بگیرید.',403);
    await rest('rpc/crm_accept_invites', token, { method: 'POST', body: '{}' });
    const m = await membership(token, user.id);
    if (!m) return NextResponse.json({ platformAdmin:access.platformAdmin, org: null, user: { id: user.id, email: user.email }, role: 'viewer', records: [], members: [], invites: [], audit: [] });
    const [org, records, members, invites, audit] = await Promise.all([
        rest(`crm_orgs?id=eq.${m.org_id}&select=id,name`, token),
        all(`crm_records?org_id=eq.${m.org_id}&select=*&order=created_at.desc,id`, token),
        all(`crm_members?org_id=eq.${m.org_id}&select=user_id,email,role&order=user_id`, token),
        m.role === 'admin' ? all(`crm_invites?org_id=eq.${m.org_id}&select=id,email,role&order=id`, token) : [],
        rest(`crm_audit?org_id=eq.${m.org_id}&select=id,record_id,action,label,created_at,actor_id&order=created_at.desc&limit=100`, token)
    ]);
    if(m.role!=='viewer'){
        for(const c of automationCandidates(records as Row[],localDay())){
            const added=await rest('rpc/crm_apply_automation',token,{method:'POST',body:JSON.stringify({record_kind:c.kind,record_data:c.data,record_parent:c.parent_id})});
            if(added)records.push(added);
        }
    }
    return NextResponse.json({ platformAdmin:access.platformAdmin, org: org[0], role: m.role, user: { id: user.id, email: user.email }, records, members, invites, audit });
} catch (e) { return fail(e); } }
export async function POST(req: NextRequest) {
    try {
        // Imports can contain many records; the envelope is still bounded to prevent oversized requests.
        const input = await body(req, 20 * 1024 * 1024);
        const { token, user } = await session();
        const access=await rest('rpc/crm_access_status',token,{method:'POST',body:'{}'});
        if(!access.allowed)throw new ApiError('دسترسی شما تعلیق شده یا اعتبار آن پایان یافته است.',403);
        if (input.action === 'workspace') {
            const p = z.object({ name: z.string().trim().min(1).max(100) }).safeParse(input);
            if (!p.success) throw new ApiError('نام فضای کاری معتبر نیست.');
            await rest('rpc/crm_create_workspace', token, { method: 'POST', body: JSON.stringify({ workspace_name: p.data.name }) });
            return NextResponse.json({ ok: true });
        }
        const m = await membership(token, user.id);
        if (!m) throw new ApiError('فضای کاری یافت نشد.', 404);
        if (m.role === 'viewer') throw new ApiError('دسترسی شما فقط مشاهده است.', 403);

        if (input.action === 'import') {
            const parsed = importEnvelope.safeParse(input.backup);
            if (!parsed.success) throw new ApiError('فایل پشتیبان معتبر نیست یا نسخهٔ آن پشتیبانی نمی‌شود.');
            const result = await rest('rpc/crm_import_complete', token, {
                method: 'POST',
                body: JSON.stringify({ payload: parsed.data })
            });
            return NextResponse.json({ ok: true, imported: Number(result?.imported || 0) });
        }

        if (input.action === 'save') {
            const p = z.object({ kind: z.enum(kinds), data: dataSchema, parent_id: uuid.nullable(), id: uuid.optional(), version: z.number().int().positive().optional() }).safeParse(input);
            if (!p.success) throw new ApiError(p.error.issues[0].message);
            const v = p.data;
            const salesError = validateSales(v.kind, v.data);
            if (salesError) throw new ApiError(salesError);
            if (v.kind === 'tasks' && !['open','done'].includes(v.data.status)) throw new ApiError('وضعیت پیگیری معتبر نیست.');
            if (['companies','contacts'].includes(v.kind) && !['active','lead','inactive'].includes(v.data.status)) throw new ApiError('وضعیت مشتری معتبر نیست.');
            if (['companies','products','automations'].includes(v.kind) && v.parent_id) throw new ApiError('این نوع رکورد نمی‌تواند رکورد والد داشته باشد.');
            if (v.kind === 'proformas' && !v.parent_id) throw new ApiError('مشتری پیش‌فاکتور را انتخاب کنید.');
            if (v.parent_id) {
                if (v.id === v.parent_id) throw new ApiError('ارتباط رکورد با خودش مجاز نیست.');
                const parents = await rest(`crm_records?id=eq.${v.parent_id}&org_id=eq.${m.org_id}&select=kind`, token);
                if (!parents.length || parents[0].kind === 'notes') throw new ApiError('رکورد مرتبط معتبر نیست.');
                const parentKind = parents[0].kind;
                if (v.kind === 'activities' && !['companies','contacts','deals'].includes(parentKind)) throw new ApiError('فعالیت فقط می‌تواند به حساب، کانتکت یا فرصت فروش مرتبط شود.');
                if (!['notes','activities'].includes(v.kind) && parentKind !== 'companies') throw new ApiError('مشتری مرتبط معتبر نیست.');
            }
            const previous=v.id?(await rest(`crm_records?id=eq.${v.id}&org_id=eq.${m.org_id}&select=*`,token))[0]:undefined;
            if (v.kind === 'proformas') {
                if(v.data.related_deal_id){
                    const linked=await rest(`crm_records?id=eq.${v.data.related_deal_id}&org_id=eq.${m.org_id}&kind=eq.deals&parent_id=eq.${v.parent_id}&select=id`,token);
                    if(!linked.length)throw new ApiError('فرصت فروش باید متعلق به همین مشتری باشد.');
                }
                const ids = [...new Set(v.data.items.map(i=>i.product_id))];
                const products = await rest(`crm_records?org_id=eq.${m.org_id}&kind=eq.products&id=in.(${ids.join(',')})&select=id,data`, token);
                if(products.length!==ids.length)throw new ApiError('یکی از محصولات پیش‌فاکتور موجود نیست یا متعلق به این شرکت نیست.');
                v.data.items=v.data.items.map(item=>{
                    const saved=previous?.kind==='proformas'?previous.data.items?.find((i:{product_id:string})=>i.product_id===item.product_id):undefined;
                    const product=products.find((p:{id:string})=>p.id===item.product_id);
                    if(!saved&&product.data.status!=='active')throw new ApiError('محصول غیرفعال را نمی‌توان به پیش‌فاکتور اضافه کرد.');
                    return {...item,name:saved?.name??product.data.name,unit:saved?.unit??product.data.unit,unit_price:saved?.unit_price??product.data.price};
                });

            }
            if (v.data.assignee) {
                const assignees = await rest(`crm_members?user_id=eq.${v.data.assignee}&org_id=eq.${m.org_id}&select=user_id`, token);
                if (!assignees.length) throw new ApiError('مسئول انتخاب‌شده عضو تیم نیست.');
            }

            const payload = { org_id: m.org_id, kind: v.kind, data: v.data, parent_id: v.parent_id };
            const result = await rest(v.id ? `crm_records?id=eq.${v.id}&org_id=eq.${m.org_id}&kind=eq.${v.kind}&version=eq.${v.version || 0}` : 'crm_records', token, {
                method: v.id ? 'PATCH' : 'POST',
                headers: { Prefer: 'return=representation' },
                body: JSON.stringify(payload)
            });
            if (!result?.length) throw new ApiError('رکورد تغییر کرده یا حذف شده است. صفحه را تازه و دوباره ویرایش کنید.', 409);
            let automationWarning=false;
            try{
                const rules=await all(`crm_records?org_id=eq.${m.org_id}&kind=eq.automations&select=*&order=id`,token);
                for(const c of automationCandidates(rules as Row[],localDay(),{previous,next:result[0]}))
                    await rest('rpc/crm_apply_automation',token,{method:'POST',body:JSON.stringify({record_kind:c.kind,record_data:c.data,record_parent:c.parent_id})});
            }catch{automationWarning=true;}
            return NextResponse.json({ ok: true,automationWarning });
        }

        if (input.action === 'inventory') {
            const p = inventoryInput.safeParse(input);
            if (!p.success) throw new ApiError('اطلاعات عملیات انبار معتبر نیست.');
            const v = p.data;
            if (Math.abs(v.quantity * 100 - Math.round(v.quantity * 100)) > 0.0001) throw new ApiError('مقدار انبار را حداکثر با دو رقم اعشار وارد کنید.');
            if (v.type !== 'adjustment' && v.quantity === 0) throw new ApiError('مقدار عملیات انبار باید بیشتر از صفر باشد.');
            if (v.type === 'adjustment' && !v.description.trim()) throw new ApiError('برای اصلاح موجودی توضیح وارد کنید.');
            await rest('rpc/crm_inventory', token, {
                method: 'POST',
                body: JSON.stringify({
                    product_id: v.product_id,
                    expected_version: v.version,
                    movement_type: v.type,
                    quantity: v.quantity,
                    reference: v.reference,
                    description: v.description
                })
            });
            return NextResponse.json({ ok: true });
        }

        if (input.action === 'delete') {
            const p = z.object({ id: uuid, version: z.number().int().positive() }).safeParse(input);
            if (!p.success) throw new ApiError('شناسه معتبر نیست.');
            const current = await rest(`crm_records?id=eq.${p.data.id}&org_id=eq.${m.org_id}&select=id,kind,data,version&limit=1`, token);
            if (!current.length || current[0].version !== p.data.version) throw new ApiError('رکورد تغییر کرده است. اطلاعات را تازه کنید.', 409);
            const children=await rest(`crm_records?parent_id=eq.${p.data.id}&select=id&limit=1`,token);
            if(children.length)throw new ApiError('این پرونده سابقه مرتبط دارد؛ به‌جای حذف، آن را غیرفعال کنید.');
            if (current[0].kind === 'stock_movements') throw new ApiError('سند انبار به‌تنهایی حذف نمی‌شود؛ یک اصلاح موجودی ثبت کنید.');
            if (current[0].kind === 'products') {
                if (Number(current[0].data?.stock || 0) !== 0) throw new ApiError('برای حذف محصول، ابتدا موجودی را از بخش انبارداری به صفر برسانید.');
                if (current[0].data?.status !== 'inactive') throw new ApiError('برای حذف کامل محصول، ابتدا وضعیت آن را غیرفعال کنید.');
            }
            const result = await rest(`crm_records?id=eq.${p.data.id}&org_id=eq.${m.org_id}&version=eq.${p.data.version}`, token, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
            if (!result?.length) throw new ApiError('رکورد تغییر کرده است. اطلاعات را تازه کنید.', 409);
            return NextResponse.json({ ok: true });
        }

        if (m.role !== 'admin') throw new ApiError('این عملیات به دسترسی مدیر نیاز دارد.', 403);
        if (input.action === 'invite') {
            const p = z.object({ email: z.string().trim().email().max(254), role: z.enum(['sales','viewer']) }).safeParse(input);
            if (!p.success) throw new ApiError('ایمیل یا نقش معتبر نیست.');
            await rest('crm_invites', token, { method: 'POST', body: JSON.stringify({ org_id: m.org_id, email: p.data.email.toLowerCase(), role: p.data.role }) });
            return NextResponse.json({ ok: true });
        }
        if (input.action === 'revokeInvite') {
            const id = uuid.safeParse(input.id);
            if (!id.success) throw new ApiError('شناسه معتبر نیست.');
            await rest(`crm_invites?id=eq.${id.data}&org_id=eq.${m.org_id}`, token, { method: 'DELETE' });
            return NextResponse.json({ ok: true });
        }
        throw new ApiError('عملیات ناشناخته است.');
    } catch (e) { return fail(e); }
}
