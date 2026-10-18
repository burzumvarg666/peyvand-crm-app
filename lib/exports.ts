import {toRial} from './proforma-money';
import ExcelJS from 'exceljs';
import { labels, stageLabels, statusLabels, quoteStatusLabels, automationTriggerLabels, automationActionLabels, activityTypeLabels, activityDirectionLabels, quoteAmounts, type Row } from './crm';

const faDate = (s: string) => s ? new Intl.DateTimeFormat('fa-IR-u-ca-persian', {dateStyle:'medium'}).format(new Date(s.length === 10 ? s + 'T12:00:00' : s)) : 'تعیین نشده';
export const movementLabels = { in: 'ورود کالا', out: 'خروج کالا', adjustment: 'اصلاح شمارش', opening: 'موجودی اولیه' };

export {proformaHtml} from './proforma';

type Value = string | number | Date;
const excelDate = (s: string): Value => s ? faDate(s) : '';
export function buildWorkbook(items: Row[], allRows: Row[] = items) {
    const wb = new ExcelJS.Workbook(); wb.creator = 'Peyvand CRM'; wb.created = new Date();
    const parentName = (row: Row) => allRows.find(p => p.id === row.parent_id)?.data.name || '';
    const kind = items.length && items.every(r => r.kind === items[0].kind) ? items[0].kind : '';
    const activitySet = items.length > 0 && items.every(r => r.kind === 'activities' || r.kind === 'tasks');
    let headers: string[], values: Value[][];
    if (kind === 'products') {
        headers = ['نام محصول','کد محصول','نوع محصول','کد رال','دسته‌بندی','واحد','قیمت فروش (تومان)','موجودی','حداقل موجودی','وضعیت','توضیحات'];
        values = items.map(({data:d}) => [d.name,d.sku,({paint:'رنگ',primer:'آستر',clearcoat:'کیلر',other:'سایر'}[d.product_type]),d.ral_code,d.category,d.unit,d.price,d.stock,d.min_stock,statusLabels[d.status],d.description]);
    } else if (kind === 'proformas') {
        headers = ['شماره پیش‌فاکتور','شماره نامه','عنوان','مشتری','تاریخ (شمسی)','اعتبار (شمسی)','وضعیت','جمع محصولات (ریال)','تخفیف (ریال)','مالیات (ریال)','مبلغ نهایی (ریال)'];
        values = items.map(r => { const t=quoteAmounts(r.data); return [r.data.quote_number,r.data.letter_number,r.data.name,parentName(r),excelDate(r.data.quote_date||r.created_at),excelDate(r.data.valid_until),quoteStatusLabels[r.data.quote_status],toRial(t.subtotal),toRial(t.discount),toRial(t.tax),toRial(t.total)]; });
    } else if (kind === 'stock_movements') {
        headers = ['محصول','نوع عملیات','تغییر موجودی','موجودی پس از عملیات','تاریخ (شمسی)','مرجع','توضیحات'];
        values = items.map(r => [parentName(r) || r.data.name,movementLabels[r.data.movement_type],r.data.movement_quantity,r.data.stock_after,excelDate(r.created_at),r.data.movement_reference,r.data.description]);
    } else if (kind === 'automations') {
        headers=['نام قانون','محرک','اقدام','مرحله هدف','روز','فعال','توضیحات'];
        values=items.map(({data:d})=>[d.name,automationTriggerLabels[d.automation_trigger],automationActionLabels[d.automation_action],stageLabels[d.automation_stage],d.automation_days,d.automation_enabled&&d.status==='active'?'بله':'خیر',d.description]);
    } else if (activitySet) {
        headers=['عنوان فعالیت','نوع فعالیت','جهت','مرتبط با','تاریخ (شمسی)','ساعت شروع','ساعت پایان','محل / لینک','نتیجه','اولویت','وضعیت','مسئول','توضیحات'];
        values=items.map(r=>[r.data.name,r.kind==='tasks'?'وظیفه':activityTypeLabels[r.data.activity_type],r.kind==='tasks'?'':activityDirectionLabels[r.data.activity_direction],parentName(r),excelDate(r.data.due),r.kind==='tasks'?'':r.data.activity_time,r.kind==='tasks'?'':r.data.activity_end_time,r.kind==='tasks'?'':r.data.activity_location,r.kind==='tasks'?'':r.data.activity_result,r.data.priority,statusLabels[r.data.status],r.data.assignee,r.data.description]);
    } else {
        headers = ['نوع','عنوان','مشتری / محصول مرتبط','ایمیل','تلفن','شهر','مرحله فروش','مبلغ (تومان)','موعد (شمسی)','تاریخ شروع (شمسی)','تاریخ پایان (شمسی)','وضعیت','توضیحات'];
        values=items.map(r=>[r.kind==='companies'&&r.data.status==='lead'?'سرنخ':labels[r.kind],r.data.name,parentName(r),r.data.email,r.data.phone,r.data.city,r.kind==='deals'?stageLabels[r.data.stage]:'',r.kind==='deals'?r.data.amount:r.kind==='proformas'?quoteAmounts(r.data).total:r.kind==='products'?r.data.price:0,excelDate(r.data.due),excelDate(r.data.start_date),excelDate(r.data.end_date),r.kind==='proformas'?quoteStatusLabels[r.data.quote_status]:statusLabels[r.data.status],r.data.description]);
    }
    function addSheet(name: string, columns: string[], data: Value[][]) {
        const sheet=wb.addWorksheet(name,{views:[{state:'frozen',ySplit:1,rightToLeft:true}],pageSetup:{orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:1'}});
        sheet.addRow(columns); sheet.addRows(data);
        sheet.autoFilter={from:'A1',to:{row:Math.max(1,sheet.rowCount),column:columns.length}};
        sheet.columns.forEach((col,i)=>{col.width=/عنوان|نام|محصول|توضیحات|مرتبط/.test(columns[i])?34:22;});
        sheet.eachRow((row,index)=>{row.height=index===1?38:32;row.eachCell(cell=>{cell.font={name:'Vazir',size:11,color:{argb:'FF234438'}};cell.alignment={vertical:'middle',horizontal:'right',readingOrder:'rtl',wrapText:true};if(typeof cell.value==='number')cell.numFmt='#,##0.##';if(cell.value instanceof Date)cell.numFmt='yyyy-mm-dd';if(index===1){cell.font={name:'Vazir',size:11,bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF175747'}};}else if(index%2===0)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF0F6F2'}};});});
        return sheet;
    }
    addSheet(activitySet ? 'فعالیت‌ها' : kind ? labels[kind] : 'رکوردها',['ردیف',...headers],values.map((row,index)=>[index+1,...row]));
    const quotes=items.filter(r=>r.kind==='proformas');
    if(quotes.length){
        const lines: Value[][]=[];
        for(const q of quotes)for(const [index,item] of q.data.items.entries())lines.push([q.data.quote_number,q.data.letter_number,parentName(q),item.name,item.product_code||'',item.unit||'عدد',item.package_count??'',item.package_amount??'',item.quantity,toRial(item.unit_price),toRial(quoteAmounts(q.data).lines[index])]);
        addSheet('محصولات پیش‌فاکتور',['شماره پیش‌فاکتور','شماره نامه','مشتری','محصول','کد محصول','واحد','تعداد بسته','مقدار هر بسته','مقدار کل','قیمت واحد (ریال)','مبلغ ردیف (ریال)'],lines);
    }
    return wb;
}
export async function exportExcel(items: Row[], allRows: Row[]=items){const buffer=await buildWorkbook(items,allRows).xlsx.writeBuffer();return new Uint8Array(buffer);}
