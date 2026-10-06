import { generateKurvaSData, checkKurvaSRequirements } from './src/engine/kurvaSEngine';
import { UnifiedProjectEngine } from './src/engine/unifiedProjectEngine';

function testKurvaS() {
  console.log('--- TESTING S-CURVE LOGIC & CONSTRAINTS ---');

  const dummySections: any[] = [
    { id: '1', code: 'DIV-01', name: 'Persiapan', subtotal: 10000000, items: [] },
    { id: '2', code: 'DIV-02', name: 'Struktur', subtotal: 50000000, items: [] },
    { id: '3', code: 'DIV-03', name: 'Arsitektur', subtotal: 30000000, items: [] },
    { id: '4', code: 'DIV-04', name: 'MEP', subtotal: 10000000, items: [] },
  ];
  const grandTotal = 100000000;

  const points = generateKurvaSData(dummySections, grandTotal, '2026-10-01', '2027-01-31');
  console.log('Total Weeks Generated:', points.length);

  let prevCum = 0;
  let isMonotonic = true;
  let exceed100 = false;
  let totalWeightSum = 0;

  points.forEach((p, idx) => {
    totalWeightSum += p.plannedWeeklyPercent;
    if (p.cumulativePlannedPercent < prevCum) {
      isMonotonic = false;
      console.error(`Cumulative progress decreased at week ${p.weekIndex}: ${p.cumulativePlannedPercent} < ${prevCum}`);
    }
    if (p.cumulativePlannedPercent > 100.01) {
      exceed100 = true;
      console.error(`Cumulative progress exceeded 100% at week ${p.weekIndex}: ${p.cumulativePlannedPercent}`);
    }
    prevCum = p.cumulativePlannedPercent;
  });

  const finalCum = points[points.length - 1].cumulativePlannedPercent;
  console.log('Final Cumulative Percent:', finalCum + '%');
  console.log('Sum of Weekly Weights:', Math.round(totalWeightSum * 100) / 100 + '%');
  console.log('Is Monotonically Non-Decreasing:', isMonotonic);
  console.log('Does NOT Exceed 100%:', !exceed100);

  if (Math.abs(finalCum - 100.0) < 0.01 && isMonotonic && !exceed100) {
    console.log('[PASS] S-Curve strict mathematical requirements verified.');
  } else {
    console.error('[FAIL] S-Curve failed requirements.');
    process.exit(1);
  }
}

testKurvaS();
