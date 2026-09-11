import { z } from 'zod';
export const kinds = ['companies', 'contacts', 'deals', 'tasks', 'notes', 'products', 'proformas', 'automations', 'stock_movements'] as const;
export type Kind = typeof kinds[number];
export const stages = ['lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost'] as const;
export const stageLabels: Record<string, string> = { lead: 'سرنخ جدید', qualified: 'ارزیابی‌شده', proposal: 'پیشنهاد قیمت', negotiation: 'مذاکره', won: 'موفق', lost: 'ناموفق' };
export const quoteStatuses = ['draft', 'sent', 'accepted', 'rejected'] as const;
export const quoteStatusLabels: Record<string, string> = { draft: 'پیش‌نویس', sent: 'ارسال‌شده', accepted: 'تأییدشده', rejected: 'ردشده' };
export const automationTriggers = ['stage_change', 'quote_expiry', 'task_overdue'] as const;
export const automationTriggerLabels = { stage_change: 'تغییر مرحله فرصت', quote_expiry: 'نزدیک‌شدن پایان اعتبار پیش‌فاکتور', task_overdue: 'عقب‌افتادن پیگیری' };
export const automationActions = ['create_task', 'notify'] as const;
export const automationActionLabels = { create_task: 'ساخت پیگیری', notify: 'یادآوری داخل برنامه' };
export const statusLabels: Record<string, string> = { active: 'فعال', lead: 'سرنخ', inactive: 'غیرفعال', open: 'باز', done: 'انجام‌شده' };
export const labels: Record<Kind, string> = { companies: 'مشتریان', contacts: 'مخاطبان', deals: 'فرصت‌های فروش', tasks: 'پیگیری‌ها', notes: 'یادداشت‌ها', products: 'محصولات', proformas: 'پیش‌فاکتورها', automations: 'اتوماسیون فروش', stock_movements: 'گردش انبار' };
const proformaItemSchema = z.object({ product_id: z.string().uuid(), name: z.string().trim().min(1).max(160), unit: z.string().trim().max(30).default('عدد'), quantity: z.number().finite().positive().max(1e6), unit_price: z.number().finite().min(0).max(1e15) }).strict();
export type ProformaItem = z.infer<typeof proformaItemSchema>;
const date = z.string().refine(s => s === '' || (/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s), 'تاریخ معتبر نیست');
const coreDataSchema = z.object({ name: z.string().trim().min(1, 'عنوان را وارد کنید').max(160), email: z.union([z.literal(''), z.string().email('ایمیل معتبر نیست')]).default(''), phone: z.string().max(50).default(''), industry: z.string().max(100).default(''), city: z.string().max(100).default(''), position: z.string().max(100).default(''), website: z.string().max(300).default(''), address: z.string().max(1000).default(''), employee_count: z.number().int().min(0).max(1e9).default(0), lead_source: z.string().max(120).default(''), lead_rank: z.enum(['cold', 'warm', 'hot']).default('warm'), status: z.enum(['active', 'lead', 'inactive', 'open', 'done']).default('active'), stage: z.enum(stages).default('lead'), amount: z.number().finite().min(0).max(1e15).default(0), probability: z.number().finite().min(0).max(100).default(0), estimated_sales_date: date.default(''), start_date: date.default(''), end_date: date.default(''), due: date.default(''), campaign: z.string().max(160).default(''), next_step: z.string().max(500).default(''), currency: z.string().max(20).default('تومان'), priority: z.enum(['low', 'normal', 'high']).default('normal'), description: z.string().max(10000).default(''), assignee: z.union([z.literal(''), z.string().uuid()]).default('') }).strict();
export const salesSchema = z.object({
    sku: z.string().trim().max(80).default(''), category: z.string().trim().max(100).default(''),
    min_stock: z.number().finite().min(0).max(1e12).default(0),
    movement_type: z.enum(['in', 'out', 'adjustment', 'opening']).default('in'),
    movement_quantity: z.number().finite().min(-1e12).max(1e12).default(0),
    stock_after: z.number().finite().min(0).max(1e12).default(0),
    movement_reference: z.string().trim().max(160).default(''),
    unit: z.string().trim().max(30).default('عدد'), price: z.number().finite().min(0).max(1e15).default(0), stock: z.number().finite().min(0).max(1e12).default(0),
    quote_number: z.string().trim().max(80).default(''), quote_status: z.enum(quoteStatuses).default('draft'), payment_status: z.enum(['unpaid', 'partial', 'paid']).default('unpaid'), payment_method: z.string().max(120).default(''), valid_until: date.default(''), billing_address: z.string().max(1000).default(''), buyer_representative: z.string().max(160).default(''), economic_code: z.string().max(80).default(''), buyer_fax: z.string().max(50).default(''), terms: z.string().max(3000).default(''),
    items: z.array(proformaItemSchema).max(100).default([]), discount_percent: z.number().finite().min(0).max(100).default(0), tax_percent: z.number().finite().min(0).max(100).default(0),
    automation_trigger: z.enum(automationTriggers).default('stage_change'), automation_action: z.enum(automationActions).default('create_task'),
    automation_stage: z.enum(stages).default('qualified'), automation_days: z.number().int().min(0).max(365).default(1),
    automation_enabled: z.boolean().default(true), automation_key: z.string().max(200).default('')
});
export const dataSchema = coreDataSchema.merge(salesSchema).strict();
export type Data = z.infer<typeof dataSchema>;
export type Row = {
    id: string;
    org_id: string;
    kind: Kind;
    parent_id: string | null;
    data: Data;
    created_at: string;
    updated_at: string;
    version: number;
};
export type Member = {
    user_id: string;
    email: string;
    role: 'admin' | 'sales' | 'viewer';
};
export type Audit = {
    id: string;
    record_id: string;
    action: string;
    label: string;
    created_at: string;
    actor_id: string;
};
export type State = {
    desktop?: boolean;
    notifications?: { key: string; label: string }[];
    org: {
        id: string;
        name: string;
    } | null;
    role: Member['role'];
    user: {
        id: string;
        email: string;
    };
    records: Row[];
    members: Member[];
    invites: {
        id: string;
        email: string;
        role: string;
    }[];
    audit: Audit[];
};
export const blank = (): Data => dataSchema.parse({ name: 'رکورد جدید' });
export function quoteAmounts(data: Pick<Data, 'items' | 'discount_percent' | 'tax_percent'>) {
    const lines = data.items.map(item => Math.round(item.quantity * item.unit_price));
    const subtotal = lines.reduce((sum, amount) => sum + amount, 0);
    const discount = Math.round(subtotal * data.discount_percent / 100);
    const tax = Math.round((subtotal - discount) * data.tax_percent / 100);
    return { lines, subtotal, discount, tax, total: subtotal - discount + tax };
}
export const proformaTotal = (data: Data) => quoteAmounts(data).total;
export function validateSales(kind: Kind, data: Data) {
    if (['products', 'automations'].includes(kind) && !['active', 'inactive'].includes(data.status)) return 'وضعیت معتبر نیست.';
    if (kind === 'products' && [data.stock,data.min_stock].some(n=>Math.abs(n*100-Math.round(n*100))>0.0001)) return 'موجودی را حداکثر با دو رقم اعشار وارد کنید.';
    if (kind === 'proformas') {
        if (!data.items.length) return 'حداقل یک محصول به پیش‌فاکتور اضافه کنید.';
        if (!Object.values(quoteAmounts(data)).flat().every(Number.isSafeInteger)) return 'مبلغ پیش‌فاکتور بیش از محدودهٔ محاسبهٔ دقیق است.';
    }
    return '';
}
export function nextQuoteNumber(rows: Row[], year = new Date().getFullYear()) {
    const prefix = `PF-${year}-`;
    const highest = rows.filter(row => row.kind === 'proformas').reduce((max, row) => {
        const suffix = row.data.quote_number?.startsWith(prefix) ? row.data.quote_number.slice(prefix.length) : '';
        return /^\d+$/.test(suffix) ? Math.max(max, Number(suffix)) : max;
    }, 0);
    return prefix + String(highest + 1).padStart(4, '0');
}
export const localDay = (value = new Date()) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
export function addDays(value: string, days: number) { const d = new Date(value + 'T12:00:00'); d.setDate(d.getDate() + days); return localDay(d); }
export function summary(rows: Row[]) { const deals = rows.filter(r => r.kind === 'deals'); const won = deals.filter(r => r.data.stage === 'won'); const lost = deals.filter(r => r.data.stage === 'lost'); return { customers: rows.filter(r => r.kind === 'companies').length, pipeline: deals.filter(r => !['won', 'lost'].includes(r.data.stage)).reduce((s, r) => s + r.data.amount, 0), revenue: won.reduce((s, r) => s + r.data.amount, 0), rate: won.length + lost.length ? Math.round(won.length / (won.length + lost.length) * 100) : 0, openTasks: rows.filter(r => r.kind === 'tasks' && r.data.status !== 'done').length }; }
export function csvCell(v: unknown) { let s = String(v ?? ''); if (/^[\s]*[=+@-]/.test(s))
    s = "'" + s; return '"' + s.replaceAll('"', '""') + '"'; }
export const persianDate = (s: string) => s ? new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'medium' }).format(new Date(s.length === 10 ? s + 'T12:00:00' : s)) : 'تعیین نشده';
export function exportCsv(rows: Row[]) { return '\ufeff' + [['ردیف', 'نوع', 'عنوان', 'ایمیل', 'تلفن', 'شهر', 'مرحله', 'مبلغ (تومان)', 'موعد (شمسی)', 'تاریخ شروع (شمسی)', 'تاریخ پایان (شمسی)', 'وضعیت', 'توضیحات','کد محصول','واحد','قیمت واحد','موجودی','حداقل موجودی','شماره پیش‌فاکتور','مبلغ نهایی پیش‌فاکتور','نوع گردش','تغییر موجودی','مانده انبار','مرجع'], ...rows.map((r,index) => [index+1, labels[r.kind], r.data.name, r.data.email, r.data.phone, r.data.city, r.kind==='deals'?stageLabels[r.data.stage]:'',r.kind==='deals'?r.data.amount:'',persianDate(r.kind==='proformas'?r.data.valid_until:r.data.due),persianDate(r.data.start_date),persianDate(r.data.end_date),r.kind==='proformas'?quoteStatusLabels[r.data.quote_status]:statusLabels[r.data.status],r.data.description,r.kind==='products'?r.data.sku:'',['products','stock_movements'].includes(r.kind)?r.data.unit:'',r.kind==='products'?r.data.price:'',r.kind==='products'?r.data.stock:'',r.kind==='products'?r.data.min_stock:'',r.kind==='proformas'?r.data.quote_number:'',r.kind==='proformas'?quoteAmounts(r.data).total:'',r.kind==='stock_movements'?r.data.movement_type:'',r.kind==='stock_movements'?r.data.movement_quantity:'',r.kind==='stock_movements'?r.data.stock_after:'',r.kind==='stock_movements'?r.data.movement_reference:''])].map(r => r.map(csvCell).join(',')).join('\r\n'); }
