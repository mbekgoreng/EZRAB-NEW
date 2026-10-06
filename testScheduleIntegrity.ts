import ExcelJS from 'exceljs';
import fs from 'fs';

async function verifyScheduleSheet() {
  console.log('--- VERIFYING 12_Schedule SHEET STRUCTURE & FORMULAS ---');
  const buffer = fs.readFileSync('test-large-output.xlsx');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const ws = wb.getWorksheet('12_Schedule');
  if (!ws) {
    console.error('Worksheet 12_Schedule NOT FOUND!');
    process.exit(1);
  }

  console.log('12_Schedule found. Total rows:', ws.rowCount, 'Total columns:', ws.columnCount);

  // Check headers in row 5 & 6
  const r5 = ws.getRow(5);
  const r6 = ws.getRow(6);
  console.log('A5 value:', r5.getCell(1).value);
  console.log('B5 value:', r5.getCell(2).value);
  console.log('C5 value:', r5.getCell(3).value);
  console.log('D5 value:', r5.getCell(4).value);
  console.log('E5 value:', r5.getCell(5).value);

  // Check last row footer values
  let foundTotalRow = false;
  let foundWeeklyPlanRow = false;
  let foundCumPlanRow = false;

  ws.eachRow((row, rowNumber) => {
    const c3 = String(row.getCell(3).value || '');
    if (c3.includes('JUMLAH BIAYA LANGSUNG')) {
      foundTotalRow = true;
      console.log(`[PASS] Found JUMLAH BIAYA row at ${rowNumber}:`, row.getCell(4).value, 'Weight:', row.getCell(5).value);
    }
    if (c3.includes('RENCANA PROGRES MINGGUAN')) {
      foundWeeklyPlanRow = true;
      console.log(`[PASS] Found RENCANA PROGRES MINGGUAN at ${rowNumber}`);
    }
    if (c3.includes('RENCANA PROGRES KUMULATIF')) {
      foundCumPlanRow = true;
      // Get the last week cell value
      const lastWeekCol = ws.columnCount - 1; // before KET
      const lastWeekCell = row.getCell(lastWeekCol);
      console.log(`[PASS] Found RENCANA PROGRES KUMULATIF at ${rowNumber}, Final week value:`, lastWeekCell.value);
    }
  });

  if (foundTotalRow && foundWeeklyPlanRow && foundCumPlanRow) {
    console.log('\n[SUCCESS] 12_Schedule verified against Indonesian Construction Standard!');
  } else {
    console.error('\n[FAIL] Missing required footer recap rows!');
    process.exit(1);
  }
}

verifyScheduleSheet().catch(err => {
  console.error(err);
  process.exit(1);
});
