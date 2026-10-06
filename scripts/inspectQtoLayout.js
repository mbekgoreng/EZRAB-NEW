import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';

async function waitForChrome(port, maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/json`, (r) => {
          let d = '';
          r.on('data', c => d += c);
          r.on('end', () => resolve(JSON.parse(d)));
        });
        req.on('error', reject);
        req.setTimeout(500, () => { req.destroy(); reject(new Error('timeout')); });
      });
      return res;
    } catch {
      await new Promise(r => setTimeout(r, 300));
    }
  }
  throw new Error('Chrome did not start in time');
}

async function run() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const userDataDir = 'C:\\Users\\mbekd\\.gemini\\antigravity-ide\\brain\\6dd160cd-e009-4a07-9996-c195976e3d0c\\chrome-profile-' + Date.now();
  
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9333',
    `--user-data-dir=${userDataDir}`,
    '--window-size=1440,900',
    '--disable-gpu',
    'http://localhost:3002/'
  ]);

  const targets = await waitForChrome(9333);
  const pageTarget = targets.find(t => t.type === 'page') || targets[0];
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

  let id = 1;
  function send(method, params = {}) {
    return new Promise((resolve) => {
      const msgId = id++;
      const handler = (event) => {
        const res = JSON.parse(event.data);
        if (res.id === msgId) {
          ws.removeEventListener('message', handler);
          resolve(res.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  await new Promise(r => ws.onopen = r);
  await send('Page.enable');
  await send('DOM.enable');
  await send('Runtime.enable');
  await send('Log.enable');

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Runtime.consoleAPICalled') {
      console.log('BROWSER CONSOLE:', msg.params.type, msg.params.args.map(a => a.value || a.description));
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      console.error('BROWSER EXCEPTION:', msg.params.exceptionDetails);
    }
  });

  await send('Page.navigate', { url: 'http://localhost:3002/app/projects/PRJ-RUMAH-2LT-01/qto?view=calculator&skip_tour=true' });
  await new Promise(r => setTimeout(r, 4000));

  // 1. Capture initial view
  const shot1 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('qa-qto-step1-initial.png', Buffer.from(shot1.data, 'base64'));

  // 2. Click "Tutup Semua"
  await send('Runtime.evaluate', {
    expression: `
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Tutup Semua'));
      if (btn) btn.click();
    `
  });
  await new Promise(r => setTimeout(r, 600));
  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('qa-qto-step2-collapsed.png', Buffer.from(shot2.data, 'base64'));

  // 3. Click "Buka Semua"
  await send('Runtime.evaluate', {
    expression: `
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Buka Semua'));
      if (btn) btn.click();
    `
  });
  await new Promise(r => setTimeout(r, 600));

  // 4. Scroll the sidebar catalog down
  await send('Runtime.evaluate', {
    expression: `
      const scrollable = document.querySelector('.ezrab-workstation-scrollable');
      if (scrollable) scrollable.scrollTop = 420;
    `
  });
  await new Promise(r => setTimeout(r, 600));
  const shot3 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('qa-qto-step3-scrolled-catalog.png', Buffer.from(shot3.data, 'base64'));

  // 5. Scroll the main scrollable container down
  await send('Runtime.evaluate', {
    expression: `
      const container = Array.from(document.querySelectorAll('div')).find(e => e.scrollHeight > e.clientHeight + 20 && getComputedStyle(e).overflowY === 'auto');
      if (container) {
        container.scrollTop = 320;
      }
    `
  });
  await new Promise(r => setTimeout(r, 600));
  const shot4 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('qa-qto-step4-scrolled-sticky-success.png', Buffer.from(shot4.data, 'base64'));

  console.log('All QA verification screenshots captured successfully!');

  chrome.kill();
  process.exit(0);
}

run().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
