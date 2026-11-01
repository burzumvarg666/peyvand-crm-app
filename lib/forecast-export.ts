import ExcelJS from 'exceljs';
import type {Row} from './crm';
import {forecastMonthLabel,forecastComparison} from './forecast';
export function buildForecastWorkbook(items:Row[],allRows:Row[],months:string[]){
 const wb=new ExcelJS.Workbook();wb.creator='Peyvand CRM';wb.created=new Date();
 const reportTitle=months.length===1?'Monthly Forecast':'Forecast N+5';
 const sheet=wb.addWorksheet(reportTitle,{views:[{state:'frozen',xSplit:4,ySplit:2,rightToLeft:false}]});
 const byId=new Map(allRows.map(r=>[r.id,r]));
 const title=sheet.addRow([reportTitle+' · kg / IRR · '+forecastMonthLabel(months[0])+' – '+forecastMonthLabel(months.at(-1)!)]);sheet.mergeCells(1,1,1,months.length*2+5);title.height=30;
 sheet.addRow(['Customer','Description','Material','Category',...months.flatMap((m,i)=>[`${i===0?'N':`N+${i}`} ${m} (kg)`,`${i===0?'N':`N+${i}`} ${m} (IRR)`]),'Reason']);
 for(const row of items){if(row.kind!=='forecasts')continue;const p=byId.get(row.data.forecast_product_id);sheet.addRow([byId.get(row.parent_id||'')?.data.name||'',p?.data.name||row.data.name,row.data.forecast_material||row.data.sku,row.data.category,...months.flatMap(month=>{const m=row.data.forecast_months.find(m=>m.month===month);return [m?.quantity??null,m?.amount??null];}),row.data.description]);}
 sheet.columns.forEach((col,i)=>{col.width=i<2?30:i===months.length*2+4?38:22;});
 sheet.autoFilter={from:{row:2,column:1},to:{row:Math.max(2,sheet.rowCount),column:months.length*2+5}};
 sheet.eachRow((row,index)=>{row.height=index<=2?32:28;row.eachCell({includeEmpty:true},cell=>{cell.font={name:'Arial',size:11,color:{argb:'FF315541'}};cell.alignment={vertical:'middle',wrapText:true};if(typeof cell.value==='number')cell.numFmt='#,##0.##';if(index<=2){cell.font={name:'Arial',size:11,bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF175747'}};}else if(index%2===1)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF2F7F3'}};});});
 const detail=wb.addWorksheet('Monthly comparison',{views:[{state:'frozen',xSplit:2,ySplit:1}]});
 detail.addRow(['Customer','Description','Material','Category','Month','Basis','Prod','Cons','Planned (kg)','Actual dispatched (kg)','Actual - planned (kg)','Variance / planned']);
 for(const row of items){if(row.kind!=='forecasts')continue;for(const month of months){const cell=row.data.forecast_months.find(m=>m.month===month),c=forecastComparison(cell);detail.addRow([byId.get(row.parent_id||'')?.data.name||'',byId.get(row.data.forecast_product_id)?.data.name||row.data.name,row.data.forecast_material||'',row.data.category,month,cell?.basis==='otm'?'OTM':'Forecast',cell?.production??null,cell?.consumption??null,c.planned,c.actual,c.delta,c.percent===null?null:c.percent/100]);}}
 detail.columns.forEach((col,i)=>{col.width=i<2?32:22;});detail.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,detail.rowCount),column:12}};
 detail.eachRow((row,index)=>{row.eachCell({includeEmpty:true},(cell,colNumber)=>{cell.font={name:'Arial',size:11};cell.alignment={vertical:'middle'};if(index===1){cell.font={name:'Arial',size:11,bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF175747'}};}else if(typeof cell.value==='number')cell.numFmt=colNumber===12?'0.00%':'#,##0.##';});});
 return wb;
}
export async function exportForecastExcel(items:Row[],allRows:Row[],months:string[]){return new Uint8Array(await buildForecastWorkbook(items,allRows,months).xlsx.writeBuffer());}
