import { spawn } from 'child_process';
import http from 'http';

async function run() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const userDataDir = 'C:\\Users\\mbekd\\.gemini\\antigravity-ide\\brain\\6dd160cd-e009-4a07-9996-c195976e3d0c\\chrome-profile';
  
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9222',
    `--user-data-dir=${userDataDir}`,
    '--window-size=1440,900',
    '--disable-gpu'
  ]);

  await new Promise(r => setTimeout(r, 2000));

  // Get debug targets
  const targets = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });

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
  await send('Page.navigate', { url: 'http://localhost:3002/' });

  await new Promise(r => setTimeout(r, 2000));

  // Set localStorage and navigate to qto-vc
  await send('Runtime.evaluate', {
    expression: `
      localStorage.setItem('ezrab_active_menu', 'qto-vc');
      window.location.reload();
    `
  });

  await new Promise(r => setTimeout(r, 3000));

  // Take screenshot
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  import('fs').then(fs => {
    fs.writeFileSync('qa-qto-current.png', Buffer.from(shot.data, 'base64'));
    console.log('Saved qa-qto-current.png');
  });

  // Evaluate sidebar DOM
  const domInfo = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const split = document.querySelector('.ezrab-workstation-split');
        const scrollable = document.querySelector('.ezrab-workstation-scrollable');
        const rows = Array.from(document.querySelectorAll('.ezrab-calc-compact-row'));
        const groups = scrollable ? Array.from(scrollable.children) : [];

        return {
          splitStyle: split ? {
            display: getComputedStyle(split).display,
            gridTemplateColumns: getComputedStyle(split).gridTemplateColumns,
            height: getComputedStyle(split).height
          } : null,
          scrollableStyle: scrollable ? {
            display: getComputedStyle(scrollable).display,
            maxHeight: getComputedStyle(scrollable).maxHeight,
            height: getComputedStyle(scrollable).height,
            overflow: getComputedStyle(scrollable).overflow
          } : null,
          groupBoxes: groups.map(g => {
            const rect = g.getBoundingClientRect();
            return {
              tag: g.tagName,
              text: g.innerText.slice(0, 30),
              top: rect.top,
              bottom: rect.bottom,
              height: rect.height,
              computedHeight: getComputedStyle(g).height,
              position: getComputedStyle(g).position,
              display: getComputedStyle(g).display,
              overflow: getComputedStyle(g).overflow
            };
          }),
          rowCount: rows.length
        };
      })()
    `,
    returnByValue: true
  });

  console.log('DOM Info:', JSON.stringify(domInfo, null, 2));

  chrome.kill();
  process.exit(0);
}

run().catch(console.error);
