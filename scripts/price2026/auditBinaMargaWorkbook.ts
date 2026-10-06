import { execSync } from 'child_process';
import * as path from 'path';

console.log('Running Bina Marga Workbook Forensic Audit...');
const pyScript = path.join(process.cwd(), 'scripts', 'price2026', 'auditBinaMargaWorkbook.py');
try {
  execSync(`python "${pyScript}"`, { stdio: 'inherit' });
  console.log('Audit completed. See EZRAB_BINA_MARGA_2026_EXCEL_AUDIT.md');
} catch (err) {
  console.error('Failed to run audit:', err);
  process.exit(1);
}
