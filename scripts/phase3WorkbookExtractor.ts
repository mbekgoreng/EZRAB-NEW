import * as fs from 'fs';
import * as crypto from 'crypto';
import * as path from 'path';
import * as XLSX from 'xlsx';

const WORKBOOK_PATH = path.resolve('EZRAB_VOLUME_CALCULATOR_MASTER.xlsx');

export interface SheetMeta {
  index: number;
  name: string;
  rowCount: number;
  colCount: number;
  range: string;
  formulaCount: number;
  constantCount: number;
  formulas: Array<{ cell: string; formula: string; value: any }>;
  sampleCells: Record<string, any>;
}

export interface WorkbookInventory {
  filename: string;
  sha256: string;
  byteLength: number;
  extractedAt: string;
  sheetCount: number;
  sheets: SheetMeta[];
}

export function extractWorkbookData(): WorkbookInventory {
  const fileBuffer = fs.readFileSync(WORKBOOK_PATH);
  const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex').toUpperCase();

  const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellFormula: true, cellHTML: false });

  const sheetMetas: SheetMeta[] = [];

  workbook.SheetNames.forEach((name, idx) => {
    const sheet = workbook.Sheets[name];
    const range = sheet['!ref'] || 'A1';
    const decodedRange = XLSX.utils.decode_range(range);

    let formulaCount = 0;
    let constantCount = 0;
    const formulas: Array<{ cell: string; formula: string; value: any }> = [];
    const sampleCells: Record<string, any> = {};

    for (const cellAddress in sheet) {
      if (cellAddress.startsWith('!')) continue;
      const cell = sheet[cellAddress];
      if (!cell) continue;

      if (cell.f) {
        formulaCount++;
        formulas.push({
          cell: cellAddress,
          formula: cell.f,
          value: cell.v,
        });
      } else if (cell.v !== undefined && cell.v !== null && cell.v !== '') {
        constantCount++;
      }

      // Record sample cells for evaluation
      sampleCells[cellAddress] = {
        v: cell.v,
        t: cell.t,
        f: cell.f || null,
        w: cell.w || null,
      };
    }

    sheetMetas.push({
      index: idx,
      name,
      rowCount: decodedRange.e.r + 1,
      colCount: decodedRange.e.c + 1,
      range,
      formulaCount,
      constantCount,
      formulas,
      sampleCells,
    });
  });

  const inventory: WorkbookInventory = {
    filename: 'EZRAB_VOLUME_CALCULATOR_MASTER.xlsx',
    sha256: hash,
    byteLength: fileBuffer.length,
    extractedAt: new Date().toISOString(),
    sheetCount: sheetMetas.length,
    sheets: sheetMetas,
  };

  return inventory;
}

if (typeof process !== 'undefined' && process.argv && process.argv[1]?.includes('phase3WorkbookExtractor')) {
  const inv = extractWorkbookData();
  console.log(`Workbook: ${inv.filename}`);
  console.log(`SHA-256: ${inv.sha256}`);
  console.log(`Sheets (${inv.sheetCount}):`, inv.sheets.map(s => `${s.index}: ${s.name} (${s.formulaCount} formulas)`).join(', '));
  fs.writeFileSync('phase3_workbook_inventory.json', JSON.stringify(inv, null, 2));
  console.log('Saved inventory to phase3_workbook_inventory.json');
}
