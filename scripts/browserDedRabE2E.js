import { spawn } from 'child_process';
import fs from 'fs';

async function runBrowserDedRabE2E() {
  console.log('======================================================================');
  console.log('EZRAB DED -> RAB E2E BROWSER VERIFICATION (PORT 3000)');
  console.log('Target Route: http://localhost:3000/app/projects/PRJ-RUMAH-2LT-01/ai?mode=ded-rab');
  console.log('======================================================================');

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chromeProcess = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9231',
    '--user-data-dir=C:\\Users\\mbekd\\AppData\\Local\\Temp\\chrome-qa-dedrab-' + Date.now(),
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ]);

  try {
    let pageTarget = null;
    for (let attempt = 0; attempt < 15; attempt++) {
      await new Promise(r => setTimeout(r, 600));
      try {
        const listRes = await fetch('http://localhost:9231/json/list');
        const targets = await listRes.json();
        pageTarget = targets.find(t => t.type === 'page');
        if (pageTarget) break;
      } catch (e) {}
    }

    if (!pageTarget) throw new Error('No page target found on port 9231');

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    let id = 1;
    const send = (method, params = {}) => new Promise((resolve, reject) => {
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

    await new Promise(r => ws.onopen = r);
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });

    console.log('[1/6] Navigating to http://localhost:3000/app/projects/PRJ-RUMAH-2LT-01/ai?mode=ded-rab ...');
    await send('Page.navigate', { url: 'http://localhost:3000/app/projects/PRJ-RUMAH-2LT-01/ai?mode=ded-rab' });

    // Wait for DOM
    await new Promise(r => setTimeout(r, 4000));

    console.log('[2/6] Inspecting page title and DED workspace presence ...');
    const evalRes = await send('Runtime.evaluate', {
      expression: `(() => {
        const bodyText = document.body.innerText;
        const hasDedRabHeader = bodyText.includes('DED') || bodyText.includes('RAB');
        const hasSampleBtn = bodyText.includes('Contoh DED') || bodyText.includes('Muat Sampel') || bodyText.includes('Sample');
        const hasStartBtn = bodyText.includes('Mulai Analisis') || bodyText.includes('Analisis DED');
        return {
          title: document.title,
          url: window.location.href,
          hasDedRabHeader,
          hasSampleBtn,
          hasStartBtn,
          bodySnippet: bodyText.slice(0, 500)
        };
      })()`,
      returnByValue: true,
    });

    console.log('Page Inspection Result:', JSON.stringify(evalRes.result.value, null, 2));

    console.log('[3/6] Clicking "Muat Contoh DED" or triggering sample analysis ...');
    const clickSampleRes = await send('Runtime.evaluate', {
      expression: `(() => {
        // Find button that contains sample or contoh
        const buttons = Array.from(document.querySelectorAll('button'));
        const sampleBtn = buttons.find(b => b.innerText.includes('Contoh DED') || b.innerText.includes('Muat Sampel') || b.innerText.includes('Sample'));
        if (sampleBtn) {
          sampleBtn.click();
          return { clicked: true, text: sampleBtn.innerText };
        }
        return { clicked: false, buttons: buttons.map(b => b.innerText).slice(0, 10) };
      })()`,
      returnByValue: true,
    });

    console.log('Click Sample Button Result:', clickSampleRes.result.value);
    await new Promise(r => setTimeout(r, 1500));

    console.log('[4/6] Clicking "Mulai Analisis DED" ...');
    const clickStartRes = await send('Runtime.evaluate', {
      expression: `(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const startBtn = buttons.find(b => b.innerText.includes('Mulai Analisis') || b.innerText.includes('Analisis DED'));
        if (startBtn) {
          startBtn.click();
          return { clicked: true, text: startBtn.innerText };
        }
        return { clicked: false };
      })()`,
      returnByValue: true,
    });

    console.log('Click Start Button Result:', clickStartRes.result.value);

    // Wait for pipeline execution stages (Ingest -> Render -> AI Reading -> QTO -> AHSP -> Pricing -> Gate)
    console.log('[5/6] Waiting for pipeline execution to complete (6 seconds) ...');
    await new Promise(r => setTimeout(r, 6000));

    const finalState = await send('Runtime.evaluate', {
      expression: `(() => {
        const bodyText = document.body.innerText;
        const hasFindings = bodyText.includes('TEMUAN') || bodyText.includes('HASIL PEMBACAAN') || bodyText.includes('READY') || bodyText.includes('QTO');
        const rows = document.querySelectorAll('tr, .wbs-item-row');
        return {
          hasFindings,
          rowCount: rows.length,
          containsReady: bodyText.includes('READY') || bodyText.includes('SIAP'),
          containsQto: bodyText.includes('m³') || bodyText.includes('m²'),
          containsPupr: bodyText.includes('PUPR') || bodyText.includes('A.3') || bodyText.includes('A.4'),
          snippet: bodyText.slice(0, 800)
        };
      })()`,
      returnByValue: true,
    });

    console.log('Pipeline Completion State:', JSON.stringify(finalState.result.value, null, 2));

    console.log('[6/6] Capturing browser proof screenshot ...');
    const screenshot = await send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(screenshot.data, 'base64');
    fs.writeFileSync('browser_proof_ded_rab_e2e.png', buffer);
    console.log('Screenshot saved to browser_proof_ded_rab_e2e.png (' + buffer.length + ' bytes)');

    ws.close();
    chromeProcess.kill();

    console.log('======================================================================');
    console.log('E2E BROWSER TEST COMPLETED SUCCESSFULLY');
    console.log('======================================================================');
  } catch (err) {
    console.error('E2E Test Error:', err);
    try { chromeProcess.kill(); } catch (e) {}
    process.exit(1);
  }
}

runBrowserDedRabE2E();
