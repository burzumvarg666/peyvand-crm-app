import {quoteAmounts, type Row} from './crm';
import {toRial, persianIntegerWords} from './proforma-money';
const amount = (n: number) => new Intl.NumberFormat('fa-IR', {maximumFractionDigits: 6}).format(n);
const faDate = (s: string) => s ? new Intl.DateTimeFormat('fa-IR-u-ca-persian', {dateStyle:'medium'}).format(new Date(s.length === 10 ? s + 'T12:00:00' : s)) : 'تعیین نشده';
const safe = (v: unknown) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
export function proformaHtml(row: Row, rows: Row[], _organization: string) {
    void _organization; // Preserve the existing caller signature; the seller is explicitly named.
    const data = row.data, totals = quoteAmounts(data), customer = rows.find(r => r.id === row.parent_id);
    const money = (n: number) => amount(toRial(n));
    const value = (label: string, v: unknown, ltr = false) => v ? `<p><b>${label}:</b> <bdi${ltr ? ' dir="ltr"' : ''}>${safe(v)}</bdi></p>` : '';
    const lines = data.items.map((item, i) => `<tr>
      <td>${amount(i + 1)}</td>
      <td class="product"><span dir="auto">${safe(item.name)}</span>${item.product_code ? `<small>کد محصول: <bdi dir="ltr">${safe(item.product_code)}</bdi></small>` : ''}</td>
      <td>${safe(item.unit || 'عدد')}</td>
      <td>${item.package_count != null ? amount(item.package_count) : '—'}</td>
      <td>${item.package_amount != null ? amount(item.package_amount) : '—'}</td>
      <td><bdi dir="ltr">${amount(item.quantity)}</bdi></td>
      <td class="number"><bdi dir="ltr">${money(item.unit_price)}</bdi></td>
      <td class="number"><bdi dir="ltr">${money(totals.lines[i])}</bdi></td>
    </tr>`).join('');
    const bank = [value('بانک', data.bank_name), value('صاحب حساب', data.account_holder), value('شماره حساب', data.account_number, true), value('شماره شبا', data.iban, true)].join('');
    const seller = [value('آدرس', data.seller_address), value('تلفن', data.seller_phone, true), value('کد پستی', data.seller_postal_code, true)].join('');
    return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>${safe(data.letter_number || data.quote_number || data.name)}</title><link rel="stylesheet" href="/fonts/vazir/font-face.css"><style>
    @page{size:A4;margin:12mm 11mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{direction:rtl;margin:0;color:#172e2a;font-family:Vazir,Tahoma,Arial,sans-serif;font-size:10pt;line-height:1.8}
    header{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;align-items:start;padding-bottom:13px;border-bottom:3px solid #175747}
    h1{margin:8px 0 0;font-size:23pt;line-height:1.4}.seller-name{margin:0;font-size:15pt;font-weight:700}.meta{min-width:190px;font-size:9pt}.meta p{margin:0;display:flex;justify-content:space-between;gap:16px}.meta bdi{font-variant-numeric:tabular-nums}.meta b{font-weight:500;white-space:nowrap}
    h2{font-size:10pt;margin:0 0 5px;color:#175747}p{margin:3px 0}b{font-weight:600}.info{margin:15px 0;background:#f3f7f5;border:1px solid #cbd9d3;padding:10px 13px;display:grid;grid-template-columns:1fr 1fr;gap:3px 20px}.info h2,.address{grid-column:1/-1}.info p{margin:0;overflow-wrap:anywhere}.address{white-space:pre-wrap}.currency{text-align:left;font-size:8.5pt;margin:7px 0}
    table{direction:rtl;border-collapse:collapse;width:100%;table-layout:fixed;margin:0 0 14px}thead{display:table-header-group}th,td{border:1px solid #cbd9d3;padding:8px 4px;text-align:center;vertical-align:middle;overflow-wrap:anywhere}th{background:#175747;color:white;font-size:8pt;line-height:1.7;font-weight:600}td{font-size:8.5pt}th.product,td.product{text-align:right;padding-right:9px;padding-left:7px}td.product>span{display:block;white-space:normal}td.product small{display:block;font-size:7.5pt;color:#566d63;margin-top:3px}tbody tr:nth-child(even){background:#f5f8f6}.number{font-variant-numeric:tabular-nums;white-space:nowrap;font-size:8pt}tr{break-inside:avoid}
    .settlement{display:grid;grid-template-columns:minmax(0,1fr) minmax(270px,46%);gap:18px;align-items:start;break-inside:avoid}.bank{padding:10px 0;font-size:9pt}.bank p{overflow-wrap:anywhere}.totals p{display:flex;justify-content:space-between;gap:12px;margin:0;padding:5px 8px}.totals b{white-space:nowrap;font-variant-numeric:tabular-nums}.totals .total{background:#e8f1ec;border-top:2px solid #175747;font-size:11pt;font-weight:700;margin-top:5px}.words{padding:9px 12px;background:#f3f7f5;border:1px solid #d3ded7;font-size:9pt;break-inside:avoid;margin:12px 0}
    .conditions{margin:13px 0;font-size:9pt;white-space:pre-wrap;overflow-wrap:anywhere}.note{border-top:1px solid #d3ded7;padding-top:9px}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:22px;break-inside:avoid}.signatures>div{border-top:1px solid #bdccc3;text-align:center;min-height:75px;padding-top:8px;font-size:9pt;color:#52685e}.seller-contact{margin-top:12px;border-top:2px solid #175747;padding-top:8px;font-size:8.5pt;overflow-wrap:anywhere}.seller-contact p{margin:0}
    @media screen{body{max-width:1000px;margin:24px auto;padding:0 20px}}
    </style></head><body>
    <header><div><p class="seller-name">شرکت رنگ کانسای ایرانیان</p><h1>پیش‌فاکتور</h1></div><div class="meta"><p><b>شماره نامه:</b><bdi dir="ltr">${safe(data.letter_number || '—')}</bdi></p><p><b>شماره پیش‌فاکتور:</b><bdi dir="ltr">${safe(data.quote_number || '—')}</bdi></p><p><b>تاریخ:</b><span>${safe(faDate(data.quote_date || row.created_at))}</span></p><p><b>اعتبار تا:</b><span>${safe(faDate(data.valid_until))}</span></p></div></header>
    <section class="info"><h2>مشخصات خریدار</h2>${value('نام مشتری / شرکت', customer?.data.name || 'تعیین نشده')}${value('تلفن', customer?.data.phone || '—')}${value('ایمیل', customer?.data.email)}${value('فکس', data.buyer_fax)}<p class="address"><b>آدرس:</b> ${safe(data.billing_address?.trim() || customer?.data.address || 'ثبت نشده')}</p></section>
    <p class="currency">واحد مبالغ: ریال</p>
    <table><colgroup><col style="width:5%"><col style="width:27%"><col style="width:7%"><col style="width:7%"><col style="width:10%"><col style="width:10%"><col style="width:16%"><col style="width:18%"></colgroup><thead><tr><th>ردیف</th><th class="product">محصول</th><th>واحد</th><th>تعداد بسته</th><th>مقدار هر بسته</th><th>مقدار کل</th><th>قیمت واحد<br>(ریال)</th><th>مبلغ ردیف<br>(ریال)</th></tr></thead><tbody>${lines}</tbody></table>
    <section class="settlement"><div class="bank">${bank ? `<h2>اطلاعات پرداخت</h2>${bank}` : ''}</div><div class="totals"><p><span>جمع محصولات</span><b>${money(totals.subtotal)}</b></p><p><span>تخفیف (${amount(data.discount_percent)}٪)</span><b>${money(totals.discount)}</b></p><p><span>مالیات (${amount(data.tax_percent)}٪)</span><b>${money(totals.tax)}</b></p><p class="total"><span>مبلغ نهایی</span><b>${money(totals.total)} ریال</b></p></div></section>
    <p class="words"><b>مبلغ به حروف:</b> ${persianIntegerWords(toRial(totals.total))} ریال</p>
    <section class="conditions">${value('روش تسویه', data.payment_method)}${value('زمان و شرایط تحویل', data.delivery_terms)}${data.terms ? `<p class="note"><b>شرایط و ضوابط:</b><br>${safe(data.terms)}</p>` : ''}${data.description ? `<p class="note"><b>توضیحات:</b><br>${safe(data.description)}</p>` : ''}</section>
    <section class="signatures"><div>مهر و امضای فروشنده</div><div>تأیید خریدار</div></section>${seller ? `<section class="seller-contact">${seller}</section>` : ''}
    </body></html>`;
}
