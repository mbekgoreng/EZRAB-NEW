import { spawn } from 'child_process';
import fs from 'fs';

async function runBrowserProof() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const port = 9241;
  const userDataDir = 'C:\\Users\\mbekd\\AppData\\Local\\Temp\\chrome-proof-a1-exact-' + Date.now();

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

  console.log('Navigating to http://127.0.0.1:4185/app/ahsp...');
  await send('Page.navigate', { url: 'http://127.0.0.1:4185/app/ahsp' });
  await new Promise((r) => setTimeout(r, 2000));

  // Dismiss onboarding modal
  await send('Runtime.evaluate', {
    expression: `(() => {
      const skipBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Lewati'));
      if (skipBtn) skipBtn.click();
    })()`,
  });
  await new Promise((r) => setTimeout(r, 1000));

  // Click "Rincian Koefisien" specifically on A.1.01.a.1 card using code button ancestry
  console.log('Targeting exact A.1.01.a.1 card...');
  const detailClicked = await send('Runtime.evaluate', {
    expression: `(() => {
      const codeBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'A.1.01.a.1');
      if (!codeBtn) return 'NOT_FOUND_CODE_BTN';
      // Go up to the card container
      let cur = codeBtn;
      while (cur && (!cur.innerText.includes('Harga Satuan (HSP):') || cur.tagName !== 'DIV')) {
        cur = cur.parentElement;
      }
      if (!cur) return 'NOT_FOUND_CARD';
      const rincianBtn = Array.from(cur.querySelectorAll('button')).find(b => b.innerText.includes('Rincian Koefisien'));
      if (rincianBtn) {
        rincianBtn.click();
        return 'CLICKED_OK';
      }
      return 'NOT_FOUND_RINCIAN_BTN';
    })()`,
    returnByValue: true,
  });

  console.log('Detail click result:', detailClicked.result.value);
  await new Promise((r) => setTimeout(r, 1500));

  // Capture Screenshot: A.1.01.a.1 Detail Modal (priced at Rp 8.150 with L.01 and L.04 breakdown)
  const screenshotModalA1 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('browser_proof_modal_a1_priced.png', Buffer.from(screenshotModalA1.data, 'base64'));
  console.log('Saved: browser_proof_modal_a1_priced.png');

  // Close modal
  await send('Runtime.evaluate', {
    expression: `(() => {
      const closeBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText === '✕' || b.innerText.includes('Tutup'));
      if (closeBtn) closeBtn.click();
    })()`,
  });
  await new Promise((r) => setTimeout(r, 1000));

  // Click "+ RAB" on A.1.01.a.1 card
  console.log('Clicking + RAB on exact A.1.01.a.1 card...');
  const addClicked = await send('Runtime.evaluate', {
    expression: `(() => {
      const codeBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'A.1.01.a.1');
      if (!codeBtn) return 'NOT_FOUND_CODE_BTN';
      let cur = codeBtn;
      while (cur && (!cur.innerText.includes('Harga Satuan (HSP):') || cur.tagName !== 'DIV')) {
        cur = cur.parentElement;
      }
      if (!cur) return 'NOT_FOUND_CARD';
      const addBtn = Array.from(cur.querySelectorAll('button')).find(b => b.innerText.includes('+ RAB'));
      if (addBtn) {
        addBtn.click();
        return 'CLICKED_OK';
      }
      return 'NOT_FOUND_ADD_BTN';
    })()`,
    returnByValue: true,
  });

  console.log('Add clicked result:', addClicked.result.value);
  await new Promise((r) => setTimeout(r, 1000));

  // Set input volume = 15
  await send('Runtime.evaluate', {
    expression: `(() => {
      const input = document.querySelector('input[type="number"]');
      if (input) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        nativeInputValueSetter.call(input, '15');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`,
  });
  await new Promise((r) => setTimeout(r, 1000));

  // Capture Screenshot: A.1.01.a.1 Add to RAB modal with volume 15
  const screenshotAddA1 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('browser_proof_add_rab_a1_priced.png', Buffer.from(screenshotAddA1.data, 'base64'));
  console.log('Saved: browser_proof_add_rab_a1_priced.png');

  ws.close();
  chromeProcess.kill();
  console.log('Done capturing exact priced proofs!');
}

runBrowserProof().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
