import { chromium } from 'playwright';
import path from 'path';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  const artifactDir = 'C:\\Users\\mbekd\\.gemini\\antigravity\\brain\\253a3cd6-6582-4eed-9ca1-c0ae04b61451';

  console.log('Navigating to http://localhost:4182 ...');
  await page.goto('http://localhost:4182', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // 1. Material Database View
  // Find "Database" or "Material & Harga" in sidebar/workspace
  console.log('Looking for Material & Harga navigation...');
  const matNav = await page.$('text=Material & Harga');
  if (matNav) {
    await matNav.click();
    await page.waitForTimeout(1000);
  }

  await page.screenshot({
    path: path.join(artifactDir, 'qa-database-materials.png'),
    fullPage: false,
  });
  console.log('Screenshot saved: qa-database-materials.png');

  // 2. Click "Upah Tenaga Kerja" Tab
  console.log('Switching to Upah Tenaga Kerja tab...');
  const upahTab = await page.$('button:has-text("Upah Tenaga Kerja")');
  if (upahTab) {
    await upahTab.click();
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: path.join(artifactDir, 'qa-database-upah.png'),
      fullPage: false,
    });
    console.log('Screenshot saved: qa-database-upah.png');
  }

  // 3. Click "Peralatan & Alat Berat" Tab
  console.log('Switching to Peralatan & Alat Berat tab...');
  const alatTab = await page.$('button:has-text("Peralatan & Alat Berat")');
  if (alatTab) {
    await alatTab.click();
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: path.join(artifactDir, 'qa-database-alat.png'),
      fullPage: false,
    });
    console.log('Screenshot saved: qa-database-alat.png');
  }

  // 4. Open Spreadsheet Sync Modal
  console.log('Opening Spreadsheet Sync Modal...');
  const sheetBtn = await page.$('button:has-text("Spreadsheet Sync")');
  if (sheetBtn) {
    await sheetBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: path.join(artifactDir, 'qa-spreadsheet-sync-modal.png'),
      fullPage: false,
    });
    console.log('Screenshot saved: qa-spreadsheet-sync-modal.png');

    // Close modal
    const closeBtn = await page.$('button:has-text("Tutup"), button:has-text("Batal")');
    if (closeBtn) await closeBtn.click();
    await page.waitForTimeout(500);
  }

  await browser.close();
  console.log('QA Screenshots completed successfully.');
}

main().catch((err) => {
  console.error('Error taking screenshots:', err);
  process.exit(1);
});
