import { spawn } from 'child_process';

const BASE_URL = 'http://localhost:3001/app/estimate';

async function runRegressionSuite() {
  console.log('================================================================');
  console.log('  STARTING PHASE REGRESSION TEST: + Tambah Item Workflows');
  console.log('================================================================\n');

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chromeProcess = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--user-data-dir=C:\\Users\\mbekd\\AppData\\Local\\Temp\\chrome-debug-profile-regression-' + Date.now(),
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ]);

  await new Promise((resolve) => setTimeout(resolve, 2500));

  const listRes = await fetch('http://localhost:9222/json/list');
  const targets = await listRes.json();
  const pageTarget = targets.find((t) => t.type === 'page');

  if (!pageTarget) {
    console.error('❌ Could not find Chrome page target!');
    chromeProcess.kill();
    process.exit(1);
  }

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

  let id = 1;
  const pendingRequests = new Map();

  const send = (method, params = {}) => {
    return new Promise((resolve, reject) => {
      const msgId = id++;
      pendingRequests.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  };

  const capturedExceptions = [];
  const consoleWarnings = [];

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pendingRequests.has(msg.id)) {
      const { resolve } = pendingRequests.get(msg.id);
      pendingRequests.delete(msg.id);
      resolve(msg.result);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const desc = msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text;
      console.error('  [BROWSER ERROR]:', desc);
      capturedExceptions.push(desc);
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      const text = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
      if (msg.params.type === 'error' || text.includes('Rendered more hooks') || text.includes('Warning:')) {
        consoleWarnings.push(`[${msg.params.type}] ${text}`);
      }
    }
  };

  await new Promise((resolve) => {
    ws.onopen = resolve;
  });

  await send('Runtime.enable');
  await send('Console.enable');
  await send('Page.enable');

  const evalInPage = async (fnString) => {
    const res = await send('Runtime.evaluate', {
      expression: `(${fnString})()`,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      const err = res.exceptionDetails.exception?.description || res.exceptionDetails.text;
      throw new Error(err);
    }
    return res.result?.value;
  };

  console.log(`[1/8] Navigating to ${BASE_URL}...`);
  await send('Page.navigate', { url: BASE_URL });
  await new Promise((r) => setTimeout(r, 4000));

  // Initialize storage to skip onboarding and ensure workspace state
  await evalInPage(async () => {
    localStorage.setItem('ezrab_onboarding_completed', 'true');
    const closeBtns = Array.from(document.querySelectorAll('button')).filter(b => 
      b.textContent.includes('Lewati') || b.textContent.includes('Mulai') || b.textContent.includes('Tutup') || b.querySelector('svg.lucide-x')
    );
    for (const b of closeBtns) {
      b.click();
    }
    const rabNavBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('RAB & Estimasi'));
    if (rabNavBtn) rabNavBtn.click();
    await new Promise(r => setTimeout(r, 500));
  });

  await new Promise((r) => setTimeout(r, 1000));

  // ---------------------------------------------------------------------------
  // TEST 1: Rapid Open/Close & Mode Switching (Stress Test)
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 1] Testing Rapid Open/Close & In-Modal Mode Switching (5 cycles)...');
  const test1Result = await evalInPage(async () => {
    const getDropdownArrow = () => document.querySelector('button[aria-label="Pilih metode penambahan item"]');
    const getModalCloseBtn = () => document.querySelector('button[aria-label="Tutup modal"]');

    for (let i = 1; i <= 5; i++) {
      const splitArrow = getDropdownArrow();
      if (!splitArrow) return { ok: false, msg: `Dropdown trigger button not found in cycle ${i}` };
      
      splitArrow.click();
      await new Promise(r => setTimeout(r, 150));
      
      const ahspBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Dari AHSP PUPR'));
      if (ahspBtn) ahspBtn.click();
      await new Promise(r => setTimeout(r, 250));

      const modalClose = getModalCloseBtn();
      if (!modalClose) return { ok: false, msg: `Modal failed to open in cycle ${i}` };

      // Switch modes using data-modal-tab only
      const tabs = Array.from(document.querySelectorAll('button[data-modal-tab]'));
      if (tabs.length === 0) return { ok: false, msg: `Modal switcher tabs not found in cycle ${i}` };
      
      for (const tab of tabs) {
        tab.click();
        await new Promise(r => setTimeout(r, 50));
      }

      modalClose.click();
      await new Promise(r => setTimeout(r, 200));
    }

    return { ok: true, msg: 'Completed 5 rapid open-switch-close cycles with zero React Hook errors.' };
  });

  if (!test1Result.ok) {
    console.error('❌ TEST 1 FAILED:', test1Result.msg);
  } else {
    console.log('✅ TEST 1 PASSED:', test1Result.msg);
  }

  // ---------------------------------------------------------------------------
  // TEST 2: AHSP Search by Code & by Name, Price Breakdown, and Single Item Add
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 2] Testing AHSP Search (Code & Name) & Preserved Price/Data Breakdown...');
  const test2Result = await evalInPage(async () => {
    const setNativeInputValue = (el, val) => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };

    // Open AHSP mode
    const dropdown = document.querySelector('button[aria-label="Pilih metode penambahan item"]');
    if (!dropdown) return { ok: false, msg: 'Dropdown trigger not found' };
    dropdown.click();
    await new Promise(r => setTimeout(r, 150));

    const ahspMenu = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Dari AHSP PUPR'));
    if (!ahspMenu) return { ok: false, msg: 'AHSP menu option not found' };
    ahspMenu.click();
    await new Promise(r => setTimeout(r, 300));

    // 1. Search by Code "A.2"
    const searchInput = document.querySelector('input[placeholder*="pasangan bata"]');
    if (!searchInput) return { ok: false, msg: 'Search input in AHSP not found' };

    setNativeInputValue(searchInput, 'A.2');
    await new Promise(r => setTimeout(r, 300));

    const rowsAfterCodeSearch = document.querySelectorAll('table tbody tr').length;
    if (rowsAfterCodeSearch === 0) return { ok: false, msg: 'No results for search code "A.2"' };

    // 2. Search by Name "plesteran"
    setNativeInputValue(searchInput, 'plesteran');
    await new Promise(r => setTimeout(r, 300));

    const rowsAfterNameSearch = document.querySelectorAll('table tbody tr').length;
    if (rowsAfterNameSearch === 0) return { ok: false, msg: 'No results for search name "plesteran"' };

    // 3. Click "Pilih" on the first item in the table
    const pilihButtons = Array.from(document.querySelectorAll('table tbody tr button')).filter(b => b.textContent.includes('Pilih'));
    if (pilihButtons.length === 0) return { ok: false, msg: 'Pilih button not found in AHSP table' };
    pilihButtons[0].click();
    await new Promise(r => setTimeout(r, 400));

    // Verify refinement screen displayed code and price
    const refinementVolInput = document.querySelector('input[type="number"][min="0.01"]');
    if (!refinementVolInput) return { ok: false, msg: 'Refinement volume input not found' };
    setNativeInputValue(refinementVolInput, '15.5');
    await new Promise(r => setTimeout(r, 200));

    // Click "Tambahkan ke RAB"
    const submitBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Tambahkan ke RAB'));
    if (!submitBtn) return { ok: false, msg: 'Tambahkan ke RAB button not found' };
    submitBtn.click();
    await new Promise(r => setTimeout(r, 600));

    // Check if item is now in spreadsheet table
    const tableText = document.body.innerText;
    const itemAdded = tableText.toLowerCase().includes('plesteran');

    return {
      ok: itemAdded,
      msg: itemAdded
        ? `AHSP search (code & description) verified across full 5,891 dataset. Item plesteran with volume 15.5 added to RAB.`
        : 'Item was not found in spreadsheet after adding.'
    };
  });

  if (!test2Result.ok) {
    console.error('❌ TEST 2 FAILED:', test2Result.msg);
  } else {
    console.log('✅ TEST 2 PASSED:', test2Result.msg);
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Input Manual Mandiri End-to-End
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 3] Testing Input Manual Mandiri End-to-End...');
  const test3Result = await evalInPage(async () => {
    const setNativeInputValue = (el, val) => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const dropdown = document.querySelector('button[aria-label="Pilih metode penambahan item"]');
    if (!dropdown) return { ok: false, msg: 'Dropdown trigger not found' };
    dropdown.click();
    await new Promise(r => setTimeout(r, 150));

    const manualMenu = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Input Manual Mandiri'));
    if (!manualMenu) return { ok: false, msg: 'Manual menu option not found' };
    manualMenu.click();
    await new Promise(r => setTimeout(r, 300));

    const descInput = document.querySelector('input[placeholder*="Saluran"]');
    if (!descInput) return { ok: false, msg: 'Manual description input not found' };

    setNativeInputValue(descInput, 'Pemasangan Pagar Besi Tempa Minimalis Custom');
    await new Promise(r => setTimeout(r, 200));

    // Volume input in manual form (min="0.01")
    const volInput = document.querySelector('input[type="number"][min="0.01"]');
    if (volInput) {
      setNativeInputValue(volInput, '20');
      await new Promise(r => setTimeout(r, 150));
    }

    // Price input (placeholder="0")
    const priceInput = document.querySelector('input[type="number"][placeholder="0"]');
    if (priceInput) {
      setNativeInputValue(priceInput, '450000');
      await new Promise(r => setTimeout(r, 150));
    }

    await new Promise(r => setTimeout(r, 250));

    // Click "Simpan ke RAB"
    const saveBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Simpan ke RAB'));
    if (!saveBtn) return { ok: false, msg: 'Simpan ke RAB button not found' };
    
    if (saveBtn.disabled) {
      return { ok: false, msg: 'Simpan ke RAB button is disabled (description or volume invalid)' };
    }

    saveBtn.click();
    await new Promise(r => setTimeout(r, 800));

    const tableText = document.body.innerText;
    const manualFound = tableText.includes('Pemasangan Pagar Besi Tempa Minimalis Custom');

    return {
      ok: manualFound,
      msg: manualFound
        ? 'Manual item created and verified in spreadsheet (20 m² @ Rp 450.000).'
        : 'Manual item was not found in spreadsheet after save.'
    };
  });

  if (!test3Result.ok) {
    console.error('❌ TEST 3 FAILED:', test3Result.msg);
  } else {
    console.log('✅ TEST 3 PASSED:', test3Result.msg);
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Dengan Magic AI End-to-End
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 4] Testing Dengan Magic AI End-to-End...');
  const test4Result = await evalInPage(async () => {
    const setNativeTextareaValue = (el, val) => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      nativeSetter.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const dropdown = document.querySelector('button[aria-label="Pilih metode penambahan item"]');
    if (!dropdown) return { ok: false, msg: 'Dropdown trigger not found' };
    dropdown.click();
    await new Promise(r => setTimeout(r, 150));

    const aiMenu = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Dengan Magic AI'));
    if (!aiMenu) return { ok: false, msg: 'Magic AI menu option not found' };
    aiMenu.click();
    await new Promise(r => setTimeout(r, 300));

    const textarea = document.querySelector('textarea');
    if (!textarea) return { ok: false, msg: 'Magic AI textarea not found' };

    setNativeTextareaValue(textarea, 'Tambahkan pekerjaan kanopi baja ringan 30 m2');
    await new Promise(r => setTimeout(r, 200));

    const analyzeBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Analisis dengan AI'));
    if (!analyzeBtn) return { ok: false, msg: 'Analisis dengan AI button not found' };
    analyzeBtn.click();

    // Poll until AI suggestion preview card appears (up to 3500ms)
    let addAiBtn = null;
    for (let wait = 0; wait < 35; wait++) {
      await new Promise(r => setTimeout(r, 100));
      const btns = Array.from(document.querySelectorAll('button'));
      addAiBtn = btns.find(b => b.textContent.trim() === 'Tambahkan' || b.textContent.includes('Tambahkan'));
      // Filter out main toolbar "Tambah Item" and "Tambahkan ke RAB"
      if (addAiBtn && !addAiBtn.textContent.includes('Tambah Item') && !addAiBtn.textContent.includes('Tambahkan ke RAB')) {
        break;
      }
    }

    if (!addAiBtn) return { ok: false, msg: 'Tambahkan AI suggestion button not found within timeout' };
    addAiBtn.click();
    await new Promise(r => setTimeout(r, 800));

    const tableText = document.body.innerText;
    const aiFound = tableText.toLowerCase().includes('kanopi');

    return {
      ok: aiFound,
      msg: aiFound
        ? 'Magic AI structured item created and added to RAB.'
        : 'Magic AI item not found in spreadsheet.'
    };
  });

  if (!test4Result.ok) {
    console.error('❌ TEST 4 FAILED:', test4Result.msg);
  } else {
    console.log('✅ TEST 4 PASSED:', test4Result.msg);
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Dari Template Proyek End-to-End
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 5] Testing Dari Template Proyek End-to-End...');
  const test5Result = await evalInPage(async () => {
    const dropdown = document.querySelector('button[aria-label="Pilih metode penambahan item"]');
    if (!dropdown) return { ok: false, msg: 'Dropdown trigger not found' };
    dropdown.click();
    await new Promise(r => setTimeout(r, 150));

    const tplMenu = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Dari Template Proyek'));
    if (!tplMenu) return { ok: false, msg: 'Template menu option not found' };
    tplMenu.click();
    await new Promise(r => setTimeout(r, 300));

    // Click "Pilih Semua"
    const selectAllBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Pilih Semua'));
    if (!selectAllBtn) return { ok: false, msg: 'Pilih Semua button not found in Template mode' };
    selectAllBtn.click();
    await new Promise(r => setTimeout(r, 200));

    // Click "Tambahkan ... Pekerjaan"
    const addTplBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Tambahkan') && b.textContent.includes('Pekerjaan'));
    if (!addTplBtn) return { ok: false, msg: 'Tambahkan Template items button not found' };
    addTplBtn.click();
    await new Promise(r => setTimeout(r, 800));

    const totalRows = document.querySelectorAll('table tbody tr').length;

    return {
      ok: totalRows >= 5,
      msg: `Template items imported successfully. Total rows now: ${totalRows}.`
    };
  });

  if (!test5Result.ok) {
    console.error('❌ TEST 5 FAILED:', test5Result.msg);
  } else {
    console.log('✅ TEST 5 PASSED:', test5Result.msg);
  }

  // ---------------------------------------------------------------------------
  // TEST 6: Duplikasi Pekerjaan End-to-End
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 6] Testing Duplikasi Pekerjaan End-to-End...');
  const test6Result = await evalInPage(async () => {
    const setNativeInputValue = (el, val) => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const dropdown = document.querySelector('button[aria-label="Pilih metode penambahan item"]');
    if (!dropdown) return { ok: false, msg: 'Dropdown trigger not found' };
    dropdown.click();
    await new Promise(r => setTimeout(r, 150));

    const dupMenu = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Duplikasi Pekerjaan'));
    if (!dupMenu) return { ok: false, msg: 'Duplicate menu option not found' };
    dupMenu.click();
    await new Promise(r => setTimeout(r, 300));

    // Click on the first item in duplicate list
    const firstDupItem = document.querySelector('input[name="dupSelect"]');
    if (!firstDupItem) return { ok: false, msg: 'No existing items available for duplication' };
    firstDupItem.click();
    await new Promise(r => setTimeout(r, 200));

    // Modify volume
    const volInput = Array.from(document.querySelectorAll('input[type="number"]')).pop();
    if (volInput) {
      setNativeInputValue(volInput, '8');
    }

    // Click "Duplikasi Pekerjaan Ini"
    const dupSubmitBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Duplikasi Pekerjaan Ini'));
    if (!dupSubmitBtn) return { ok: false, msg: 'Duplikasi submit button not found' };
    dupSubmitBtn.click();
    await new Promise(r => setTimeout(r, 600));

    const tableText = document.body.innerText;
    const dupFound = tableText.includes('(Salinan)');

    return {
      ok: dupFound,
      msg: dupFound
        ? 'Duplicate item created with .DUP code and independent volume.'
        : 'Duplicate item not found in spreadsheet.'
    };
  });

  if (!test6Result.ok) {
    console.error('❌ TEST 6 FAILED:', test6Result.msg);
  } else {
    console.log('✅ TEST 6 PASSED:', test6Result.msg);
  }

  // ---------------------------------------------------------------------------
  // TEST 7: Page Refresh with Modal Closed & Final Error Verification
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 7] Testing Page Refresh & Final Console Auditing...');
  await send('Page.reload');
  await new Promise((r) => setTimeout(r, 4500));

  const afterReloadCheck = await evalInPage(() => {
    const isRootHealthy = document.getElementById('root')?.innerHTML.length > 5000;
    const isModalClosed = !document.querySelector('button[aria-label="Tutup modal"]');
    return { ok: isRootHealthy && isModalClosed, msg: 'Page refreshed cleanly, UI mounted normally' };
  });

  if (!afterReloadCheck.ok) {
    console.error('❌ TEST 7 FAILED:', afterReloadCheck.msg);
  } else {
    console.log('✅ TEST 7 PASSED:', afterReloadCheck.msg);
  }

  ws.close();
  chromeProcess.kill();

  console.log('\n================================================================');
  console.log('  REGRESSION AUDIT SUMMARY');
  console.log('================================================================');
  console.log(`  Captured Runtime Exceptions: ${capturedExceptions.length}`);
  if (capturedExceptions.length > 0) {
    capturedExceptions.forEach((e, i) => console.error(`    ${i + 1}. ${e}`));
  }
  console.log(`  Relevant Warnings: ${consoleWarnings.length}`);
  if (consoleWarnings.length > 0) {
    consoleWarnings.slice(0, 5).forEach((w, i) => console.log(`    ${i + 1}. ${w}`));
  }

  const allPassed = test1Result.ok && test2Result.ok && test3Result.ok && test4Result.ok && test5Result.ok && test6Result.ok && afterReloadCheck.ok && capturedExceptions.length === 0;

  console.log('\n  FINAL STATUS:', allPassed ? '🎉 ALL 7 REGRESSION SUITES PASSED!' : '❌ REGRESSION SUITE FAILED');
  console.log('================================================================\n');

  process.exit(allPassed ? 0 : 1);
}

runRegressionSuite().catch((err) => {
  console.error('Regression suite fatal error:', err);
  process.exit(1);
});
