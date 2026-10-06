import fs from 'fs';
import path from 'path';
import { zyrouterClient } from '../src/ded-rab-v2/ai/zyrouterClient';

async function testPage2() {
  console.log('--- Testing Page 2 Real Vision with geminiflash-3.8 ---');
  const canvasMod = await import('@napi-rs/canvas');
  (globalThis as any).Path2D = canvasMod.Path2D;
  (globalThis as any).ImageData = canvasMod.ImageData;
  (globalThis as any).Image = canvasMod.Image;
  (globalThis as any).DOMMatrix = canvasMod.DOMMatrix;
  (Math as any).sumPrecise = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

  const pdfjs = await import('pdfjs-dist');
  const pdfPath = path.resolve('qa-fixtures/pdf-gambar-rumah-1-lantai_compress.pdf');
  const pdfBytes = fs.readFileSync(pdfPath);
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(pdfBytes), useSystemFonts: true } as any);
  const pdfDoc = await loadingTask.promise;
  const page2 = await pdfDoc.getPage(2);
  const viewport = page2.getViewport({ scale: 1.5 });
  const canvas = canvasMod.createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
  const ctx = canvas.getContext('2d');
  const renderStart = Date.now();
  await (page2.render({ canvasContext: ctx, viewport } as any) as any).promise;
  const renderDuration = Date.now() - renderStart;

  const dataUrl = canvas.toDataURL('image/png');
  const base64Len = dataUrl.length;
  const imageBytes = Math.round((base64Len - 22) * 0.75);

  console.log(`Page 2 Rendered in ${renderDuration}ms:`);
  console.log(`- Dimensions: ${viewport.width} x ${viewport.height}`);
  console.log(`- Scale: 1.5x`);
  console.log(`- Base64 Length: ${base64Len} chars (~${imageBytes} bytes)`);

  const prompt = `Inspect this architectural floor plan (Page 2).
Extract the following strictly from what is visibly annotated:
1. drawingTitle
2. scale
3. roomNames (with dimensions if visible)
4. walls (dimensions, grid lines, or perimeter)
5. columnMarkers (e.g. K1, K2, or structural markers)
6. doorWindowOpenings (e.g. P1, P2, J1, J2)
7. notes

Respond in valid JSON format:
{
  "drawingTitle": string,
  "scale": string,
  "rooms": Array<{ name: string, dimensions?: string }>,
  "walls": Array<{ description: string, lengthMeters?: number }>,
  "columns": Array<{ tag: string, count?: number }>,
  "openings": Array<{ tag: string, type: "DOOR" | "WINDOW", count?: number }>,
  "notes": string[]
}`;

  console.log('Sending real image to ZyRouter (geminiflash-3.8)...');
  const startAi = Date.now();
  const res = await zyrouterClient.chat({
    prompt,
    systemPrompt: 'You are reading a real architectural DED drawing. Respond in valid JSON only. Do not hallucinate.',
    imageDataBase64: dataUrl,
    imageMimeType: 'image/png',
    jsonMode: true,
    model: 'geminiflash-3.8',
    timeoutMs: 60000,
  });

  const aiDuration = Date.now() - startAi;
  console.log(`AI Response received in ${aiDuration}ms!`);
  console.log(`Token usage: prompt=${res.promptTokens}, completion=${res.completionTokens}, total=${res.totalTokens}`);
  console.log('Extracted Data:');
  console.log(JSON.stringify(res.structuredJson, null, 2));
}

testPage2().catch(e => {
  console.error('Test Page 2 Error:', e);
  process.exit(1);
});
