import { blank, type Row, type Kind, type State } from './crm';
export function demoState(): State {
    const org = '00000000-0000-4000-8000-000000000001';
    const user = '00000000-0000-4000-8000-000000000002';
    const rows: Row[] = [];
    const add = (kind: Kind, name: string, data: Partial<Row['data']> = {}, parent_id: string | null = null) => { const id = crypto.randomUUID(); rows.push({ id, org_id: org, kind, parent_id, data: { ...blank(), name, ...data }, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), version: 1 }); return id; };
    const today = new Date();
    const day = (n: number) => { const d = new Date(today); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    const a = add('companies', 'صنایع سپهر', { industry: 'تولید و صنعت', city: 'تهران', phone: '۰۲۱–۰۰۰۰۰۰۰۰', email: 'sepehr@example.com', description: 'مشتری نمونه برای بررسی روند فروش' });
    const b = add('companies', 'گروه آفتاب', { industry: 'خدمات', city: 'اصفهان', status: 'lead', email: 'aftab@example.com' });
    const c = add('companies', 'پارس تجارت', { industry: 'بازرگانی', city: 'شیراز', email: 'pars@example.com' });
    const d = add('companies', 'استودیو مدار', { industry: 'فناوری', city: 'تهران', status: 'lead' });
    add('contacts', 'سارا احمدی', { position: 'مدیر خرید', email: 'sara@example.com' }, a);
    add('contacts', 'علی کریمی', { position: 'مدیر فروش', email: 'ali@example.com' }, b);
    add('contacts', 'مریم رضایی', { position: 'مدیرعامل', email: 'maryam@example.com' }, c);
    add('deals', 'قرارداد تأمین سالانه', { amount: 420000000, stage: 'negotiation', due: day(4) }, a);
    add('deals', 'توسعه همکاری آفتاب', { amount: 180000000, stage: 'proposal', due: day(7) }, b);
    add('deals', 'سفارش فصل پاییز', { amount: 95000000, stage: 'qualified', due: day(12) }, c);
    add('deals', 'همکاری با استودیو مدار', { amount: 65000000, stage: 'lead', due: day(18) }, d);
    add('deals', 'تمدید قرارداد سپهر', { amount: 260000000, stage: 'won', due: day(-3) }, a);
    add('deals', 'پروژه آزمایشی', { amount: 30000000, stage: 'lost', due: day(-8) }, b);
    add('tasks', 'پیگیری تأیید پیش‌فاکتور', { status: 'open', priority: 'high', due: day(0), assignee: user }, a);
    add('tasks', 'تماس با مدیر خرید آفتاب', { status: 'open', priority: 'normal', due: day(1), assignee: user }, b);
    add('tasks', 'ارسال پیشنهاد همکاری', { status: 'open', priority: 'high', due: day(-1), assignee: user }, d);
    add('tasks', 'ثبت نتیجه جلسه', { status: 'done', due: day(-2) }, c);
    add('notes', 'جلسه آشنایی', { description: 'نیازهای اولیه بررسی شد. پیشنهاد قیمت پس از تکمیل مشخصات ارسال شود.' }, a);
    const paint=add('products','پوشش اپوکسی صنعتی',{sku:'PR-1001',category:'پوشش صنعتی',unit:'کیلوگرم',price:420000,stock:240,min_stock:50});
    const thinner=add('products','تینر مخصوص اپوکسی',{sku:'PR-1002',category:'حلال',unit:'لیتر',price:180000,stock:12,min_stock:20});
    const primer=add('products','پرایمر ضدخوردگی',{sku:'PR-1003',category:'آستر صنعتی',unit:'کیلوگرم',price:350000,stock:0,min_stock:30});
    for(const id of [paint,thinner]){const p=rows.find(r=>r.id===id)!;add('stock_movements',p.data.name,{unit:p.data.unit,movement_type:'opening',movement_quantity:p.data.stock,stock_after:p.data.stock,description:'موجودی اولیهٔ نمایشی'},id);}
    add('proformas','تأمین پوشش خط تولید',{quote_number:'PF-'+today.getFullYear()+'-0001',quote_status:'sent',valid_until:day(3),discount_percent:5,tax_percent:0,items:[{product_id:paint,name:'پوشش اپوکسی صنعتی',unit:'کیلوگرم',quantity:100,unit_price:420000},{product_id:thinner,name:'تینر مخصوص اپوکسی',unit:'لیتر',quantity:25,unit_price:180000}]},a);
    add('proformas','پیشنهاد تأمین پرایمر',{quote_number:'PF-'+today.getFullYear()+'-0002',quote_status:'draft',valid_until:day(14),items:[{product_id:primer,name:'پرایمر ضدخوردگی',unit:'کیلوگرم',quantity:80,unit_price:350000}]},c);
    add('proformas','پوشش تعمیرات دوره‌ای',{quote_number:'PF-'+today.getFullYear()+'-0003',quote_status:'accepted',valid_until:day(-3),items:[{product_id:paint,name:'پوشش اپوکسی صنعتی',unit:'کیلوگرم',quantity:60,unit_price:420000}]},a);
    add('automations','پیگیری پس از پیشنهاد قیمت',{automation_trigger:'stage_change',automation_stage:'proposal',automation_action:'create_task',automation_days:2,description:'با مشتری تماس بگیرید و نتیجهٔ بررسی پیشنهاد را ثبت کنید.'});
    add('automations','یادآوری پایان اعتبار پیشنهاد',{automation_trigger:'quote_expiry',automation_action:'notify',automation_days:3,description:'اعتبار پیش‌فاکتور را با مشتری بررسی کنید.'});
    rows.filter(r=>r.kind==='deals').forEach((r,i)=>{r.created_at=day(-[8,21,36,50,65,78][i])+'T10:00:00.000Z';});
    return { org: { id: org, name: 'فضای کاری نمونه' }, role: 'admin', user: { id: user, email: 'demo@example.com' }, records: rows, members: [{ user_id: user, email: 'demo@example.com', role: 'admin' }], invites: [], audit: rows.filter(r=>r.kind==='products'||r.kind==='proformas').slice(0,4).map(r=>({id:crypto.randomUUID(),record_id:r.id,action:'INSERT',label:r.data.name,created_at:r.created_at,actor_id:user})) };
}
