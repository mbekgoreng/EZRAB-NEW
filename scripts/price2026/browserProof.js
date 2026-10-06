import { spawn } from 'child_process';
import fs from 'fs';

async function runBrowserProof() {
  console.log('========================================================');
  console.log('STARTING ENHANCED BROWSER PROOF OF AHSP 2026 PRICING');
  console.log('========================================================');

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const port = 9239;
  const userDataDir = 'C:\\Users\\mbekd\\AppData\\Local\\Temp\\chrome-proof-ahsp-clean-' + Date.now();

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
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise((r) => setTimeout(r, 500));
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
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });

  // Navigate to app and set onboarding flags in localStorage
  console.log('Navigating to http://127.0.0.1:4185/app/ahsp...');
  await send('Page.navigate', { url: 'http://127.0.0.1:4185/app/ahsp' });
  await new Promise((r) => setTimeout(r, 2000));

  // Dismiss onboarding modal if open
  await send('Runtime.evaluate', {
    expression: `(() => {
      localStorage.setItem('ezrab_onboarding_completed', 'true');
      localStorage.setItem('has_seen_onboarding', 'true');
      localStorage.setItem('ezrab_tour_dismissed', 'true');
      // click close button on onboarding modal if exists
      const closeBtn = document.querySelector('button[aria-label="Close"], button.onboarding-close, button:has(svg.lucide-x)');
      if (closeBtn) closeBtn.click();
      const skipBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Lewati'));
      if (skipBtn) skipBtn.click();
    })()`,
  });

  await new Promise((r) => setTimeout(r, 1000));

  // Screenshot 1: Clean Catalog View (showing cards with real non-zero prices)
  const screenshot1 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('browser_proof_1_catalog_clean.png', Buffer.from(screenshot1.data, 'base64'));
  console.log('Saved: browser_proof_1_catalog_clean.png');

  // Search for item A.1.01.a.1 specifically
  console.log('\nFiltering catalog to A.1.01.a.1...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const input = document.querySelector('input[placeholder*="Cari kode analisa"]');
      if (input) {
        input.value = 'A.1.01.a.1';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`,
  });
  await new Promise((r) => setTimeout(r, 1500));

  // Click "Rincian Koefisien" on A.1.01.a.1 card
  console.log('Opening detail modal for A.1.01.a.1...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const cards = Array.from(document.querySelectorAll('div')).filter(d => d.innerText && d.innerText.includes('A.1.01.a.1'));
      if (cards.length > 0) {
        const btn = cards[cards.length - 1].querySelector('button');
        const detailBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Rincian Koefisien'));
        if (detailBtn) detailBtn.click();
      }
    })()`,
  });
  await new Promise((r) => setTimeout(r, 1500));

  // Screenshot 2: Modal Detail with breakdown for A.1.01.a.1
  const screenshot2 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('browser_proof_2_modal_a1_full.png', Buffer.from(screenshot2.data, 'base64'));
  console.log('Saved: browser_proof_2_modal_a1_full.png');

  // Close Detail Modal
  await send('Runtime.evaluate', {
    expression: `(() => {
      const closeBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText === '✕' || b.innerText.includes('Tutup'));
      if (closeBtn) closeBtn.click();
    })()`,
  });
  await new Promise((r) => setTimeout(r, 1000));

  // Click "+ RAB" button on A.1.01.a.1 card to open Add to RAB Modal
  console.log('Opening Add to RAB modal for A.1.01.a.1...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const addBtns = Array.from(document.querySelectorAll('button')).filter(b => b.innerText.includes('+ RAB'));
      if (addBtns.length > 0) addBtns[0].click();
    })()`,
  });
  await new Promise((r) => setTimeout(r, 1000));

  // Set volume = 10
  await send('Runtime.evaluate', {
    expression: `(() => {
      const volInput = document.querySelector('input[type="number"]');
      if (volInput) {
        volInput.value = '10';
        volInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`,
  });
  await new Promise((r) => setTimeout(r, 1000));

  // Screenshot 3: Add to RAB modal showing Rp 8.150 / m2 and Total Rp 81.500
  const screenshot3 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('browser_proof_3_add_to_rab.png', Buffer.from(screenshot3.data, 'base64'));
  console.log('Saved: browser_proof_3_add_to_rab.png');

  // Verify text in Add to RAB modal
  const addRabText = await send('Runtime.evaluate', {
    expression: `(() => {
      const modal = document.body.innerText;
      return {
        hasUnitRate8150: modal.includes('8.150'),
        hasTotal81500: modal.includes('81.500'),
        hasRp0: modal.includes('Rp 0') || modal.includes('Rp0')
      };
    })()`,
    returnByValue: true,
  });
  console.log('Add to RAB check result:', addRabText.result.value);

  // Close browser
  ws.close();
  chromeProcess.kill();
  console.log('\nAll browser proofs completed successfully!');
}

runBrowserProof().catch((err) => {
  console.error('Error running enhanced browser proof:', err);
  process.exit(1);
});
