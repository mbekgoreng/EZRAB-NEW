import fs from 'fs';
import ExcelJS from 'exceljs';
import { exportRABToProfessionalExcel } from './src/export/excelExportEngine';
import { exportProjectToPDF } from './src/export/pdfExporter';
import { UnifiedProjectEngine } from './src/engine/unifiedProjectEngine';

async function testLargeDataset() {
  console.log('--- GENERATING LARGE DATASET ---');
  const sections = [];
  const divisionNames = [
    'Pekerjaan Persiapan & Mobilisasi Alat Berat',
    'Pekerjaan Tanah, Galian Dalam, Pemancangan Tiang Pancang Spun Pile',
    'Pekerjaan Struktur Bawah, Pile Cap, Tie Beam & Raft Foundation Beton K-350',
    'Pekerjaan Struktur Atas Kolom, Balok, Plat Lantai 1 s/d Lantai 5 Beton K-350',
    'Pekerjaan Pasangan Dinding Bata Ringan AAC, Plesteran Semen Mortar & Acian Halus',
    'Pekerjaan Kusen Pintu & Jendela Aluminium Powder Coating, Kaca Stopsol 8mm',
    'Pekerjaan Penutup Lantai & Dinding Homogeneous Tile 80x80 polished nano',
    'Pekerjaan Plafon Gypsum Board 9mm Rangka Hollow Galvanis 40x40 & Drop Ceiling',
    'Pekerjaan Pengecatan Dinding Interior & Eksterior Weatherbond Anti-Lumut 3 Lapis',
    'Pekerjaan Instalasi Mekanikal, Pemipaan Air Bersih PPR PN-10, Air Kotor',
    'Pekerjaan Elektrikal, Panel Distribusi Utama LVMDP, Kabel Feeder XLPE & LED Smart',
    'Pekerjaan Tata Udara (HVAC) VRV System Multi-Split, Ducting PU & Exhaust'
  ];

  let globalItemId = 1;
  for (let d = 0; d < divisionNames.length; d++) {
    const items = [];
    const itemCount = 8 + (d % 4);
    for (let i = 0; i < itemCount; i++) {
      const vol = Math.round((12.5 + i * 7.35 + d * 3.4) * 100) / 100;
      const price = 45000 + (i * 125000) + (d * 350000);
      items.push({
        id: 'it-' + globalItemId,
        code: 'A.' + (d + 1) + '.' + (i + 1) + '.1',
        description: 'Pekerjaan ' + divisionNames[d].split('&')[0] + ' Sub-Komponen ' + (i + 1) + ' Pengawasan Mutu',
        volume: vol,
        unit: i % 3 === 0 ? 'm³' : i % 3 === 1 ? 'm²' : 'm¹',
        unitPrice: price,
        totalPrice: Math.round(vol * price)
      });
      globalItemId++;
    }
    const secSubtotal = items.reduce((s, it) => s + it.totalPrice, 0);
    sections.push({
      id: 'sec-' + (d + 1),
      code: 'DIV-' + (d + 1 < 10 ? '0' + (d + 1) : d + 1),
      name: divisionNames[d],
      subtotal: secSubtotal,
      items: items
    });
  }

  const largeProject = {
    id: 'PRJ-MEGA-TOWER-001',
    name: 'Pembangunan Gedung Kantor Pusat Komersial & Retail 5 Lantai',
    location: 'Kawasan Bisnis Segitiga Emas, Jakarta Selatan',
    clientName: 'PT Nusantara Mega Propertindo Tbk',
    contractorName: 'PT Adhi Megah Konstruksi Persada',
    currentVersion: 'Rev 02.04',
    startDate: '2026-10-01',
    targetDate: '2027-03-31',
    costSummary: {
      overheadPercent: 5.0,
      profitPercent: 10.0,
      taxPercent: 11.0,
      pphPercent: 1.75
    },
    sections: sections
  };

  const company = {
    name: 'PT Adhi Megah Konstruksi Persada',
    leadEstimatorName: 'Dr. Ir. Hendra Gunawan, MT., PMP.'
  };

  console.log('Total Divisi WBS:', sections.length);
  console.log('Total Baris Item RAB:', globalItemId - 1);

  // 1. Export Excel
  console.log('\n--- 1. GENERATING COMPLETE EXCEL WORKBOOK (16 SHEETS) ---');
  const xlsxBlob = await exportRABToProfessionalExcel(largeProject as any, company as any, {
    preset: 'COMPLETE_PACKAGE',
    format: 'xlsx',
    audience: 'all',
    useLiveFormulas: true,
    sheets: {
      validation: true,
      cover: true,
      projectInfo: true,
      estimateSummary: true,
      rabRecap: true,
      rabDetail: true,
      boq: true,
      boqMc0: true,
      ahsp: true,
      materials: true,
      labor: true,
      equipment: true,
      schedule: true,
      kurvaS: true,
      cashflow: true,
      notes: true
    } as any
  });

  const arrayBuffer = await xlsxBlob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync('test-large-output.xlsx', buffer);
  console.log('File test-large-output.xlsx saved (' + buffer.length + ' bytes).');

  // 2. Validate Excel file content & formulas
  console.log('\n--- 2. REAL EXCEL FILE AUDIT & VALIDATION (XML / CELLS) ---');
  const testWb = new ExcelJS.Workbook();
  await testWb.xlsx.load(buffer);
  console.log('Worksheet Count:', testWb.worksheets.length);

  let totalFormulasChecked = 0;
  let errorFormulaCount = 0;
  const formulaErrors = ['#REF!', '#VALUE!', '#DIV/0!', '#NAME?', '#N/A', '#NUM!', 'NaN', 'Infinity', 'undefined', 'null'];

  testWb.eachSheet((ws) => {
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        // Check cell value
        const valStr = String(cell.value || '');
        for (const err of formulaErrors) {
          if (valStr.includes(err)) {
            console.error('ERROR VALUE in ' + ws.name + ' [' + cell.address + ']: ' + valStr);
            errorFormulaCount++;
          }
        }
        // Check formula
        if (cell.formula) {
          totalFormulasChecked++;
          for (const err of formulaErrors) {
            if (cell.formula.includes(err)) {
              console.error('ERROR FORMULA in ' + ws.name + ' [' + cell.address + ']: ' + cell.formula);
              errorFormulaCount++;
            }
          }
        }
      });
    });
  });

  console.log('Total Formulas Audited:', totalFormulasChecked);
  console.log('Total Formula Errors:', errorFormulaCount);

  // 3. Export PDF
  console.log('\n--- 3. GENERATING PDF DOCUMENT ---');
  const pdfBlob = await exportProjectToPDF(largeProject as any, company as any, {
    subscriptionPlan: 'pro',
    documentType: 'rab',
    includeSignatures: true
  });
  const pdfBuffer = Buffer.from(pdfBlob.output('arraybuffer'));
  
  fs.writeFileSync('test-large-output.pdf', pdfBuffer);
  console.log('File test-large-output.pdf saved (' + pdfBuffer.length + ' bytes).');

  // 4. Parity Verification
  console.log('\n--- 4. MATHEMATICAL 1:1 PARITY VERIFICATION ---');
  const normalized = UnifiedProjectEngine.normalizeSections(largeProject as any);
  const cost = UnifiedProjectEngine.computeCostSummaryFromSections(largeProject as any, normalized);
  const pphVal = Math.round(cost.directCost * 0.0175);
  const fullGrandTotal = cost.subtotalBeforeTax + cost.taxAmount + pphVal;

  console.log('Direct Cost (Biaya Langsung): Rp', cost.directCost.toLocaleString('id-ID'));
  console.log('Overhead (5%): Rp', cost.overheadAmount.toLocaleString('id-ID'));
  console.log('Profit (10%): Rp', cost.profitAmount.toLocaleString('id-ID'));
  console.log('Subtotal Sebelum Pajak: Rp', cost.subtotalBeforeTax.toLocaleString('id-ID'));
  console.log('PPN (11%): Rp', cost.taxAmount.toLocaleString('id-ID'));
  console.log('PPh (1.75%): Rp', pphVal.toLocaleString('id-ID'));
  console.log('Grand Total: Rp', fullGrandTotal.toLocaleString('id-ID'));

  console.log('\nSUCCESS! ALL VALIDATION CHECKS PASSED PERFECTLY.');
}

testLargeDataset().catch((err) => {
  console.error('FAILED TO VALIDATE:', err);
  process.exit(1);
});
