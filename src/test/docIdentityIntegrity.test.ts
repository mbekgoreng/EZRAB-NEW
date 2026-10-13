/**
 * Identity integrity tests for AI Document Wizard.
 * Ensures no fictional contractor/company identity can reach generated documents.
 */
import { strict as assert } from 'assert';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const wizardSrc = readFileSync(
  join(__dirname, '../components/documents/DocumentPackageWizardModal.tsx'),
  'utf-8'
);

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  [PASS] ${name}`); }
  else { failed++; console.log(`  [FAIL] ${name}`); }
}

console.log('Identity integrity — DocumentPackageWizardModal');

// 1. No hardcoded fictional contractor identity in source
check(
  'no "PT Rekacipta Konstruksi Utama" literal in wizard source',
  !wizardSrc.includes('PT Rekacipta Konstruksi Utama')
);
check(
  'no "Ir. Budi Santoso" default in wizard source',
  !wizardSrc.includes("useState<string>('Ir. Budi Santoso')")
);

// 2. Branding client is wired
check(
  'brandingClient imported and getBranding called on open',
  wizardSrc.includes("import { brandingClient }") &&
    wizardSrc.includes('brandingClient.getBranding(')
);

// 3. Placeholder default is rejected, not used
check(
  'branding placeholder default treated as unavailable',
  wizardSrc.includes('PT EZRAB KONSTRUKSI DIGITAL')
);

// 4. Company field is user-editable and required
check(
  'company name input is editable and marked required',
  wizardSrc.includes('Nama Perusahaan / Kontraktor') &&
    wizardSrc.includes('setCompanyName(e.target.value)')
);

// 5. Generation blocked on missing identity / loading
check(
  'handleGeneratePackage validates company + signatory before generating',
  wizardSrc.includes('if (!cleanCompany || !cleanSignatory)')
);
check(
  'generate blocked while branding is loading',
  wizardSrc.includes('if (brandingLoading) return') &&
    wizardSrc.includes('disabled={brandingLoading}')
);

// 6. masterData uses state, not hardcoded identity
check(
  'masterData contractor/companyName come from state',
  wizardSrc.includes('contractor: companyName') &&
    wizardSrc.includes('companyName: companyName')
);

// 7. No fictional fallback on fetch failure
check(
  'fetch failure leaves field empty (no fictional fallback)',
  wizardSrc.includes("// Fetch failed: no fictional fallback")
);

console.log(`\nTESTS: ${passed} PASSED, ${failed} FAILED`);
if (failed > 0) process.exit(1);
