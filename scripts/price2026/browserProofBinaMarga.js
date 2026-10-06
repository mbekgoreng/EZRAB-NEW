import { spawn } from 'child_process';
import fs from 'fs';

async function runBrowserProofBinaMarga() {
  console.log('========================================================');
  console.log('STARTING ENHANCED BROWSER PROOF FOR BINA MARGA 2026');
  console.log('========================================================');

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const port = 9245;
  const userDataDir = 'C:\\Users\\mbekd\\AppData\\Local\\Temp\\chrome-proof-bm-' + Date.now();

  const chromeProcess = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ]);

  let pageTarget = null;
  for (let attempt = 0; attempt < 25; attempt++) {
    await new Promise((r) => setTimeout(r, 400));
    try {
      const listRes = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await listRes.json();
      pageTarget = targets.find((t) => t.type === 'page');
      if (pageTarget) break;
    } catch (e) {}
  }

  if (!pageTarget) {
    chromeProcess.kill();
    throw new Error(`No page target found on port ${port}`);
  }

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  let id = 1;
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const msgId = id++;
      const handler = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id === msgId) {
          ws.removeEventListener('message', handler);
          if (msg.error) reject(msg.error);
          else resolve(msg.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });

  await new Promise((r) => (ws.onopen = r));
  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');
  await send('Network.enable');
  await send('Network.clearBrowserCache');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });

  // Navigate to app and set onboarding flags in localStorage
  console.log('Navigating to http://127.0.0.1:4185/app/ahsp...');
  await send('Page.navigate', { url: 'http://127.0.0.1:4185/app/ahsp' });
  console.log('Waiting 12 seconds for initial bundle compilation...');
  await new Promise((r) => setTimeout(r, 12000));

  // Dismiss onboarding modal if open and set localStorage flags
  await send('Runtime.evaluate', {
    expression: `(() => {
      localStorage.setItem('ezrab_onboarding_completed', 'true');
      localStorage.setItem('has_seen_onboarding', 'true');
      localStorage.setItem('ezrab_tour_dismissed', 'true');
      const closeBtn = document.querySelector('button[aria-label="Close"], button.onboarding-close, button:has(svg.lucide-x)');
      if (closeBtn) closeBtn.click();
      const skipBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Lewati'));
      if (skipBtn) skipBtn.click();
    })()`,
  });

  await new Promise((r) => setTimeout(r, 2000));

  // Select "Bina Marga" domain in tab / filter
  console.log('Selecting Bina Marga domain tab in UI...');
  const selectResult = await send('Runtime.evaluate', {
    expression: `(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const bmBtn = buttons.find(b => b.innerText.includes('Bina Marga'));
      if (bmBtn) {
        bmBtn.click();
        return 'Clicked Bina Marga tab: ' + bmBtn.innerText;
      }
      return 'Bina Marga tab button not found among ' + buttons.length + ' buttons';
    })()`,
  });
  console.log('Domain select result:', selectResult?.result?.value);

  await new Promise((r) => setTimeout(r, 3000));

  // Screenshot 1: Clean Bina Marga Catalog View
  const screenshot1 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('browser_proof_bm_1_catalog.png', Buffer.from(screenshot1.data, 'base64'));
  console.log('Saved: browser_proof_bm_1_catalog.png');

  // Click DIVISI 2 button to show Drainase items
  console.log('Selecting DIVISI 2 (Drainase)...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const pills = Array.from(document.querySelectorAll('button'));
      const div2 = pills.find(b => b.innerText.includes('DIVISI 2'));
      if (div2) {
        div2.click();
        return 'Clicked DIVISI 2';
      }
      return 'DIVISI 2 not found';
    })()`,
  });

  await new Promise((r) => setTimeout(r, 1500));

  // Screenshot 2: Divisi 2 Catalog View (Drainase items with prices)
  const screenshotDiv2 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('browser_proof_bm_2_divisi2.png', Buffer.from(screenshotDiv2.data, 'base64'));
  console.log('Saved: browser_proof_bm_2_divisi2.png');

  // Search specifically for 2.1.(1) in catalog search input
  console.log('\nSearching for item 2.1.(1) in catalog...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const input = document.querySelector('input[placeholder*="Cari kode"]');
      if (input) {
        input.value = '2.1.(1)';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`,
  });

  await new Promise((r) => setTimeout(r, 1500));

  // Open Detail Modal for 2.1.(1)
  console.log('\nOpening detail modal for 2.1.(1)...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const detailBtns = Array.from(document.querySelectorAll('button')).filter(b => 
        b.innerText.includes('Detail') || b.innerText.includes('Rincian') || b.innerText.includes('Lihat')
      );
      if (detailBtns.length > 0) {
        detailBtns[0].click();
        return 'Clicked detail button';
      }
      return 'Detail button not found';
    })()`,
  });

  await new Promise((r) => setTimeout(r, 1500));

  const screenshotModal = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('browser_proof_bm_3_detail_modal.png', Buffer.from(screenshotModal.data, 'base64'));
  console.log('Saved: browser_proof_bm_3_detail_modal.png');

  // Close modal
  await send('Runtime.evaluate', {
    expression: `(() => {
      const closeBtn = document.querySelector('button[aria-label="Close"], button:has(svg.lucide-x)');
      if (closeBtn) closeBtn.click();
    })()`,
  });
  await new Promise((r) => setTimeout(r, 1000));

  // Open Add to RAB Modal for 2.1.(1)
  console.log('\nOpening + RAB modal for 2.1.(1)...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const rabBtns = Array.from(document.querySelectorAll('button')).filter(b => 
        b.innerText.includes('+ RAB') || b.innerText.includes('Tambah ke RAB')
      );
      if (rabBtns.length > 0) {
        rabBtns[0].click();
        return 'Clicked + RAB button';
      }
      return '+ RAB button not found';
    })()`,
  });

  await new Promise((r) => setTimeout(r, 1500));

  // Set volume to 10
  await send('Runtime.evaluate', {
    expression: `(() => {
      const input = document.querySelector('input[type="number"]');
      if (input) {
        input.value = '10';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`,
  });

  await new Promise((r) => setTimeout(r, 1000));

  const screenshotRab = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('browser_proof_bm_4_add_to_rab.png', Buffer.from(screenshotRab.data, 'base64'));
  console.log('Saved: browser_proof_bm_4_add_to_rab.png');

  // Close RAB modal and detail modal
  await send('Runtime.evaluate', {
    expression: `(() => {
      const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Batal'));
      if (cancelBtn) cancelBtn.click();
      const tutupBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Tutup'));
      if (tutupBtn) tutupBtn.click();
      const closeButtons = Array.from(document.querySelectorAll('button[aria-label="Close"], button:has(svg.lucide-x)'));
      closeButtons.forEach(b => b.click());
    })()`,
  });
  await new Promise((r) => setTimeout(r, 1500));

  // Reset category to "Semua Kategori" to see Divisi 1
  console.log('Resetting to Semua Kategori...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const pills = Array.from(document.querySelectorAll('button'));
      const allCat = pills.find(b => b.innerText.includes('Semua Kategori'));
      if (allCat) allCat.click();
    })()`,
  });
  await new Promise((r) => setTimeout(r, 1500));

  // Search specifically for 1.2 in catalog search input
  console.log('\nTesting Missing Item 1.2 (Mobilisasi)...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const input = document.querySelector('input[placeholder*="Cari kode"]');
      if (input) {
        input.value = '1.2';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`,
  });
  await new Promise((r) => setTimeout(r, 1500));

  // Click Detail button on 1.2 Mobilisasi card
  await send('Runtime.evaluate', {
    expression: `(() => {
      const cards = Array.from(document.querySelectorAll('.rounded-xl, .bg-white, .border')).filter(el => el.innerText && el.innerText.includes('Mobilisasi'));
      if (cards.length > 0) {
        const btn = cards[0].querySelector('button');
        if (btn) btn.click();
        return 'Clicked card button';
      }
      const detailBtns = Array.from(document.querySelectorAll('button')).filter(b => 
        b.innerText.includes('Detail') || b.innerText.includes('Rincian') || b.innerText.includes('Lihat')
      );
      if (detailBtns.length > 0) {
        detailBtns[0].click();
        return 'Clicked detail button on 1.2';
      }
      return 'Detail button not found';
    })()`,
  });
  await new Promise((r) => setTimeout(r, 1500));

  const screenshotMissing = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('browser_proof_bm_5_missing_item.png', Buffer.from(screenshotMissing.data, 'base64'));
  console.log('Saved: browser_proof_bm_5_missing_item.png');

  console.log('\n========================================================');
  console.log('ALL BROWSER PROOF SCREENSHOTS CAPTURED SUCCESSFULLY!');
  console.log('  1. browser_proof_bm_1_catalog.png');
  console.log('  2. browser_proof_bm_2_divisi2.png');
  console.log('  3. browser_proof_bm_3_detail_modal.png');
  console.log('  4. browser_proof_bm_4_add_to_rab.png');
  console.log('  5. browser_proof_bm_5_missing_item.png');
  console.log('========================================================');

  ws.close();
  chromeProcess.kill();
}

runBrowserProofBinaMarga().catch((err) => {
  console.error('Browser proof error:', err);
  process.exit(1);
});
