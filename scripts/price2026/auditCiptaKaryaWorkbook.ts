import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

console.log('Running Cipta Karya Workbook Forensic Audit...');
const pyScript = path.join(process.cwd(), 'scripts', 'price2026', 'auditCiptaKaryaWorkbook.py');
try {
  execSync(`python "${pyScript}"`, { stdio: 'inherit' });
  console.log('Audit completed. See EZRAB_CIPTA_KARYA_EXCEL_AUDIT.md');
} catch (err) {
  console.error('Failed to run audit:', err);
  process.exit(1);
}
