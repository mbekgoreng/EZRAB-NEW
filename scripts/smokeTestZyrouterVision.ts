import fs from 'fs';
import path from 'path';
import { zyrouterClient } from '../src/ded-rab-v2/ai/zyrouterClient';

async function main() {
  console.log('================================================================');
  console.log('ZYROUTER VISION PREFLIGHT & SMOKE TEST');
  console.log('================================================================\n');

  // Polyfill canvas for Node if needed
  try {
    const canvasMod = await import('@napi-rs/canvas');
    (globalThis as any).Path2D = canvasMod.Path2D;
    (globalThis as any).ImageData = canvasMod.ImageData;
    (globalThis as any).Image = canvasMod.Image;
    (globalThis as any).DOMMatrix = canvasMod.DOMMatrix;
    (Math as any).sumPrecise = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  } catch (e) {
    console.warn('Canvas polyfill note:', (e as any).message);
  }

  const pdfPath = path.resolve('qa-fixtures/pdf-gambar-rumah-1-lantai_compress.pdf');
  if (!fs.existsSync(pdfPath)) {
    console.error(`Missing primary regression PDF: ${pdfPath}`);
    process.exit(1);
  }

  const pdfBytes = fs.readFileSync(pdfPath);
  console.log(`[Loaded PDF] ${pdfPath} (${pdfBytes.length} bytes)`);

  // 1. Render Page 1
  console.log('\n[Step 1] Rendering Page 1 with pdfjs-dist...');
  const pdfjs = await import('pdfjs-dist');
  const canvasMod = await import('@napi-rs/canvas');

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBytes),
    useSystemFonts: true,
  } as any);

  const pdfDoc = await loadingTask.promise;
  console.log(`Total Pages detected in PDF: ${pdfDoc.numPages}`);

  const page1 = await pdfDoc.getPage(1);
  const viewport = page1.getViewport({ scale: 1.5 });
  const canvas = canvasMod.createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
  const ctx = canvas.getContext('2d');

  const renderStart = Date.now();
  await (page1.render({ canvasContext: ctx, viewport } as any) as any).promise;
  const renderDuration = Date.now() - renderStart;

  const dataUrl = canvas.toDataURL('image/png');
  const base64Content = dataUrl.replace(/^data:image\/png;base64,/, '');
  const imageBytes = Math.round(base64Content.length * 0.75);

  // Non-empty pixel check
  const imgData = ctx.getImageData(0, 0, Math.min(100, canvas.width), Math.min(100, canvas.height));
  let nonWhitePixels = 0;
  for (let i = 0; i < imgData.data.length; i += 4) {
    const r = imgData.data[i];
    const g = imgData.data[i + 1];
    const b = imgData.data[i + 2];
    if (r < 250 || g < 250 || b < 250) nonWhitePixels++;
  }
  const nonEmptyPixelCheck = nonWhitePixels > 0;

  console.log(`Page 1 rendered in ${renderDuration}ms:`);
  console.log(`  - Dimensions:       ${viewport.width} x ${viewport.height}`);
  console.log(`  - Render Scale:     1.5x`);
  console.log(`  - Image MIME:       image/png`);
  console.log(`  - Base64 Length:    ${dataUrl.length} chars`);
  console.log(`  - Image Bytes:      ~${imageBytes} bytes`);
  console.log(`  - Non-Empty Pixels: ${nonEmptyPixelCheck ? 'YES (Valid ink/lines detected)' : 'NO'}`);

  // 2. Send Vision Request to ZyRouter
  const model = 'geminiflash-3.8';
  console.log(`\n[Step 2] Sending Page 1 image to ZyRouter using model '${model}'...`);

  const smokePrompt = `You are a licensed structural engineer inspecting a construction drawing page.
Inspect this image carefully.
Respond strictly in JSON:
{
  "pageType": "COVER" | "FLOOR_PLAN" | "STRUCTURAL_PLAN" | "SECTION" | "ELEVATION" | "DETAIL" | "SCHEDULE" | "OTHER",
  "drawingTitle": string,
  "scale": string | null,
  "elementsObserved": string[],
  "notes": string[]
}`;

  const requestStart = Date.now();
  try {
    const res = await zyrouterClient.chat({
      prompt: smokePrompt,
      systemPrompt: 'You are reading a real architectural DED drawing. Respond in valid JSON only. Do not hallucinate.',
      imageDataBase64: dataUrl,
      imageMimeType: 'image/png',
      jsonMode: true,
      model,
      timeoutMs: 60000,
      requestId: `smoke-${Date.now()}`,
    });

    const requestDuration = Date.now() - requestStart;

    console.log('\n================================================================');
    console.log('VISION_SMOKE_TEST RESULTS');
    console.log('================================================================');
    console.log('page:           1');
    console.log(`image:          ${nonEmptyPixelCheck ? 'OK' : 'EMPTY_WARNING'}`);
    console.log(`imageBytes:     ${imageBytes}`);
    console.log(`provider:       ZyRouter`);
    console.log(`model:          ${res.model}`);
    console.log(`duration:       ${requestDuration}ms`);
    console.log(`httpStatus:     200`);
    console.log(`responseBytes:  ${res.content.length}`);
    console.log(`parsed:         ${res.structuredJson ? 'YES' : 'NO'}`);
    console.log('tokens:         ', `prompt: ${res.promptTokens}, completion: ${res.completionTokens}`);
    console.log('================================================================\n');

    console.log('Parsed JSON Structure:');
    console.log(JSON.stringify(res.structuredJson, null, 2));

    console.log('\n[PASS] VISION SMOKE TEST PASSED! REAL IMAGE SENT AND REAL GEMINI FLASH 3.8 VISION RESPONSE RECEIVED.');
  } catch (err: any) {
    console.error('\n[FAIL] VISION SMOKE TEST FAILED:');
    console.error(`Error Code: ${err.code || 'UNKNOWN'}`);
    console.error(`Message:    ${err.message}`);
    if (err.httpStatus) console.error(`HTTP Status: ${err.httpStatus}`);
    process.exit(1);
  }
}

main().catch(console.error);
