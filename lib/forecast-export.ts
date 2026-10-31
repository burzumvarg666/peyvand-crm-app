import ExcelJS from 'exceljs';
import type {Row} from './crm';
import {forecastMonthLabel} from './forecast';
export function buildForecastWorkbook(items:Row[],allRows:Row[],months:string[]){
 const wb=new ExcelJS.Workbook();wb.creator='Peyvand CRM';wb.created=new Date();
 const sheet=wb.addWorksheet('Forecast N+5',{views:[{state:'frozen',xSplit:4,ySplit:2,rightToLeft:false}]});
 const byId=new Map(allRows.map(r=>[r.id,r]));
 const title=sheet.addRow(['Forecast N+5 · kg / IRR · '+forecastMonthLabel(months[0])+' – '+forecastMonthLabel(months.at(-1)!)]);sheet.mergeCells(1,1,1,months.length*2+5);title.height=30;
 sheet.addRow(['Customer','Description','Material','Category',...months.flatMap((m,i)=>[`${i===0?'N':`N+${i}`} ${m} (kg)`,`${i===0?'N':`N+${i}`} ${m} (IRR)`]),'Reason']);
 for(const row of items){if(row.kind!=='forecasts')continue;const p=byId.get(row.data.forecast_product_id);sheet.addRow([byId.get(row.parent_id||'')?.data.name||'',p?.data.name||row.data.name,row.data.sku,row.data.category,...months.flatMap(month=>{const m=row.data.forecast_months.find(m=>m.month===month);return [m?.quantity??null,m?.amount??null];}),row.data.description]);}
 sheet.columns.forEach((col,i)=>{col.width=i<2?30:i===months.length*2+4?38:22;});
 sheet.autoFilter={from:{row:2,column:1},to:{row:Math.max(2,sheet.rowCount),column:months.length*2+5}};
 sheet.eachRow((row,index)=>{row.height=index<=2?32:28;row.eachCell({includeEmpty:true},cell=>{cell.font={name:'Arial',size:11,color:{argb:'FF315541'}};cell.alignment={vertical:'middle',wrapText:true};if(typeof cell.value==='number')cell.numFmt='#,##0.##';if(index<=2){cell.font={name:'Arial',size:11,bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF175747'}};}else if(index%2===1)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF2F7F3'}};});});
 return wb;
}
export async function exportForecastExcel(items:Row[],allRows:Row[],months:string[]){return new Uint8Array(await buildForecastWorkbook(items,allRows,months).xlsx.writeBuffer());}
