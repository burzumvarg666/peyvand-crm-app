import ExcelJS from 'exceljs';
import { labels, stageLabels, statusLabels, quoteStatusLabels, automationTriggerLabels, automationActionLabels, quoteAmounts, type Row } from './crm';

const amount = (n: number) => new Intl.NumberFormat('fa-IR').format(n);
const faDate = (s: string) => s ? new Intl.DateTimeFormat('fa-IR-u-ca-persian', {dateStyle:'medium'}).format(new Date(s.length === 10 ? s + 'T12:00:00' : s)) : 'تعیین نشده';
const safe = (v: unknown) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replaceAll('&', '&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
export const movementLabels = { in: 'ورود کالا', out: 'خروج کالا', adjustment: 'اصلاح شمارش', opening: 'موجودی اولیه' };

export function proformaHtml(row: Row, rows: Row[], organization: string) {
    const data = row.data, totals = quoteAmounts(data), customer = rows.find(r => r.id === row.parent_id);
    const lines = data.items.map((item, i) => `<tr><td>${amount(i+1)}</td><td>${safe(item.name)}</td><td>${safe(item.unit || 'عدد')}</td><td class="number">${amount(item.quantity)}</td><td class="number">${amount(item.unit_price)}</td><td class="number">${amount(totals.lines[i])}</td></tr>`).join('');
    return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>${safe(data.quote_number || data.name)}</title><style>
    @font-face{font-family:Vazirmatn;src:url('/fonts/vazirmatn-arabic.woff2') format('woff2');font-weight:100 900;font-display:block}
    @page{size:A4;margin:15mm 13mm}*{box-sizing:border-box}body{margin:0;color:#203e36;font-family:Vazirmatn,Tahoma,Arial,sans-serif;font-size:11pt;line-height:1.85}
    header{display:flex;justify-content:space-between;border-bottom:3px solid #175747;padding-bottom:15px;margin-bottom:20px}h1{font-size:26pt;line-height:1.4;margin:0 0 4px}h2{font-size:13pt;margin:0}.muted{color:#586f67;font-size:10pt}.meta{text-align:left}.meta b{display:block;font-size:13pt}.info{padding:12px 15px;background:#f1f6f3;border:1px solid #d7e3dc;margin:16px 0;overflow-wrap:anywhere}.info p{margin:2px 0}.info b{margin-left:5px}
    table{border-collapse:collapse;width:100%;table-layout:fixed;margin:18px 0}thead{display:table-header-group}th,td{border-bottom:1px solid #d5e0da;padding:9px 6px;text-align:right;vertical-align:top;overflow-wrap:anywhere}th{background:#175747;color:white;font-size:10pt;font-weight:600}th:first-child{width:7%}th:nth-child(2){width:31%}th:nth-child(3){width:9%}th:nth-child(4){width:10%}th:nth-child(5){width:21%}th:nth-child(6){width:22%}tbody tr:nth-child(even){background:#f6f9f7}tr{break-inside:avoid}.number{font-variant-numeric:tabular-nums;text-align:left;direction:rtl}
    .totals{width:65%;margin-right:auto;break-inside:avoid}.totals p{display:flex;justify-content:space-between;margin:0;padding:5px 10px;gap:20px}.totals .total{background:#e9f3ed;border-top:2px solid #175747;font-weight:700;font-size:13pt;margin-top:7px}.note{white-space:pre-wrap;overflow-wrap:anywhere;margin-top:20px;border-top:1px solid #d5e0da;padding-top:12px}.signatures{display:flex;justify-content:space-between;margin-top:30px;padding:18px 0 50px;break-inside:avoid;border-top:1px solid #d5e0da;color:#586f67}.footer{color:#697e74;font-size:9pt;text-align:center;margin-top:20px}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    </style></head><body><header><div><h1>پیش‌فاکتور</h1><h2>${safe(organization)}</h2><div class="muted">${safe(data.name)}</div></div><div class="meta"><b dir="ltr">${safe(data.quote_number || 'بدون شماره')}</b><div>تاریخ صدور: ${safe(faDate(row.created_at))}</div><div>اعتبار تا: ${safe(faDate(data.valid_until))}</div><div class="muted">${safe(quoteStatusLabels[data.quote_status])}</div></div></header>
    <section class="info"><p><b>مشتری:</b>${safe(customer?.data.name || 'مشتری حذف شده یا تعیین نشده')}</p>${customer?.data.phone ? `<p><b>تلفن:</b><span dir="ltr">${safe(customer.data.phone)}</span></p>`:''}${customer?.data.city ? `<p><b>شهر:</b>${safe(customer.data.city)}</p>`:''}<p class="muted">تمام مبالغ به تومان است.</p></section>
    <table><thead><tr><th>ردیف</th><th>محصول / خدمت</th><th>واحد</th><th>تعداد</th><th>قیمت واحد</th><th>مبلغ ردیف</th></tr></thead><tbody>${lines}</tbody></table>
    <section class="totals"><p><span>جمع اقلام</span><b>${amount(totals.subtotal)}</b></p><p><span>تخفیف (${amount(data.discount_percent)}٪)</span><b>${amount(totals.discount)}</b></p><p><span>مالیات (${amount(data.tax_percent)}٪)</span><b>${amount(totals.tax)}</b></p><p class="total"><span>مبلغ نهایی</span><b>${amount(totals.total)} تومان</b></p></section>
    ${data.description?`<p class="note"><b>توضیحات:</b><br>${safe(data.description)}</p>`:''}<section class="signatures"><span>مهر و امضای فروشنده</span><span>تأیید خریدار</span></section><div class="footer">این سند پیش‌فاکتور است. ثبت خروج کالا در بخش انبارداری انجام می‌شود.</div></body></html>`;
}

type Value = string | number | Date;
const excelDate = (s: string): Value => s ? faDate(s) : '';
export function buildWorkbook(items: Row[], allRows: Row[] = items) {
    const wb = new ExcelJS.Workbook(); wb.creator = 'Peyvand CRM'; wb.created = new Date();
    const parentName = (row: Row) => allRows.find(p => p.id === row.parent_id)?.data.name || '';
    const kind = items.length && items.every(r => r.kind === items[0].kind) ? items[0].kind : '';
    let headers: string[], values: Value[][];
    if (kind === 'products') {
        headers = ['نام محصول','کد محصول','دسته‌بندی','واحد','قیمت فروش (تومان)','موجودی','حداقل موجودی','وضعیت','توضیحات'];
        values = items.map(({data:d}) => [d.name,d.sku,d.category,d.unit,d.price,d.stock,d.min_stock,statusLabels[d.status],d.description]);
    } else if (kind === 'proformas') {
        headers = ['شماره پیش‌فاکتور','عنوان','مشتری','تاریخ صدور (شمسی)','اعتبار (شمسی)','وضعیت','جمع اقلام (تومان)','تخفیف (تومان)','مالیات (تومان)','مبلغ نهایی (تومان)'];
        values = items.map(r => { const t=quoteAmounts(r.data); return [r.data.quote_number,r.data.name,parentName(r),excelDate(r.created_at),excelDate(r.data.valid_until),quoteStatusLabels[r.data.quote_status],t.subtotal,t.discount,t.tax,t.total]; });
    } else if (kind === 'stock_movements') {
        headers = ['محصول','نوع عملیات','تغییر موجودی','موجودی پس از عملیات','تاریخ (شمسی)','مرجع','توضیحات'];
        values = items.map(r => [parentName(r) || r.data.name,movementLabels[r.data.movement_type],r.data.movement_quantity,r.data.stock_after,excelDate(r.created_at),r.data.movement_reference,r.data.description]);
    } else if (kind === 'automations') {
        headers=['نام قانون','محرک','اقدام','مرحله هدف','روز','فعال','توضیحات'];
        values=items.map(({data:d})=>[d.name,automationTriggerLabels[d.automation_trigger],automationActionLabels[d.automation_action],stageLabels[d.automation_stage],d.automation_days,d.automation_enabled&&d.status==='active'?'بله':'خیر',d.description]);
    } else {
        headers = ['شناسه','نوع','عنوان','مشتری / محصول مرتبط','ایمیل','تلفن','شهر','مرحله فروش','مبلغ (تومان)','موعد (شمسی)','تاریخ شروع (شمسی)','تاریخ پایان (شمسی)','وضعیت','توضیحات'];
        values=items.map(r=>[r.id,r.kind==='companies'&&r.data.status==='lead'?'سرنخ':labels[r.kind],r.data.name,parentName(r),r.data.email,r.data.phone,r.data.city,r.kind==='deals'?stageLabels[r.data.stage]:'',r.kind==='deals'?r.data.amount:r.kind==='proformas'?quoteAmounts(r.data).total:r.kind==='products'?r.data.price:0,excelDate(r.data.due),excelDate(r.data.start_date),excelDate(r.data.end_date),r.kind==='proformas'?quoteStatusLabels[r.data.quote_status]:statusLabels[r.data.status],r.data.description]);
    }
    function addSheet(name: string, columns: string[], data: Value[][]) {
        const sheet=wb.addWorksheet(name,{views:[{state:'frozen',ySplit:1,rightToLeft:true}],pageSetup:{orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:1'}});
        sheet.addRow(columns); sheet.addRows(data);
        sheet.autoFilter={from:'A1',to:{row:Math.max(1,sheet.rowCount),column:columns.length}};
        sheet.columns.forEach((col,i)=>{col.width=/عنوان|نام|محصول|توضیحات|مرتبط/.test(columns[i])?34:22;});
        sheet.eachRow((row,index)=>{row.height=index===1?38:32;row.eachCell(cell=>{cell.font={name:'Tahoma',size:11,color:{argb:'FF234438'}};cell.alignment={vertical:'middle',horizontal:'right',readingOrder:'rtl',wrapText:true};if(typeof cell.value==='number')cell.numFmt='#,##0.##';if(cell.value instanceof Date)cell.numFmt='yyyy-mm-dd';if(index===1){cell.font={name:'Tahoma',size:11,bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF175747'}};}else if(index%2===0)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF0F6F2'}};});});
        return sheet;
    }
    addSheet(kind ? labels[kind] : 'رکوردها',['ردیف',...headers],values.map((row,index)=>[index+1,...row]));
    const quotes=items.filter(r=>r.kind==='proformas');
    if(quotes.length){
        const lines: Value[][]=[];
        for(const q of quotes)for(const item of q.data.items)lines.push([q.data.quote_number,parentName(q),item.name,item.unit||'عدد',item.quantity,item.unit_price,Math.round(item.quantity*item.unit_price)]);
        const sheet=addSheet('اقلام پیش‌فاکتور',['شماره پیش‌فاکتور','مشتری','محصول','واحد','تعداد','قیمت واحد (تومان)','مبلغ ردیف (تومان)'],lines);
        for(let r=2;r<=sheet.rowCount;r++)sheet.getCell(`G${r}`).value={formula:`ROUND(E${r}*F${r},0)`,result:lines[r-2][6] as number};
    }
    return wb;
}
export async function exportExcel(items: Row[], allRows: Row[]=items){const buffer=await buildWorkbook(items,allRows).xlsx.writeBuffer();return new Uint8Array(buffer);}
