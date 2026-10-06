/**
 * Asset loader and vector fallbacks for EZRAB PDF generation
 */

declare const process: any;

// Cached data URI of official EZRAB emblem
let cachedEmblemDataUrl: string | null = null;
let cachedLogoDataUrl: string | null = null;

// Safe dynamic import helper for Node environment that bundlers won't try to analyze
async function safeNodeImport(moduleName: string): Promise<any> {
  try {
    const dynamicImport = new Function('m', 'return import(m)');
    return await dynamicImport(moduleName);
  } catch {
    return null;
  }
}

/**
 * Loads image as Base64 Data URL supporting both Browser and Node.js environments
 */
export async function loadOfficialEzrabEmblem(): Promise<string | null> {
  if (cachedEmblemDataUrl) return cachedEmblemDataUrl;

  try {
    // 1. Browser environment
    if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
      const resp = await fetch('/images/ez-emblem.png');
      if (resp.ok) {
        const blob = await resp.blob();
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            cachedEmblemDataUrl = reader.result as string;
            resolve(cachedEmblemDataUrl);
          };
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      }
    }

    // 2. Node.js environment
    const globalProcess = typeof process !== 'undefined' ? process : (globalThis as any).process;
    if (globalProcess && globalProcess.versions && globalProcess.versions.node) {
      const fs = await safeNodeImport('fs');
      const path = await safeNodeImport('path');
      if (fs && path) {
        const candidate = path.resolve(globalProcess.cwd(), 'public', 'images', 'ez-emblem.png');
        if (fs.existsSync(candidate)) {
          const buffer = fs.readFileSync(candidate);
          cachedEmblemDataUrl = `data:image/png;base64,${buffer.toString('base64')}`;
          return cachedEmblemDataUrl;
        }
      }
    }
  } catch (err) {
    console.warn('[pdfAssets] Could not load ez-emblem.png:', err);
  }

  return null;
}

/**
 * Loads official EZRAB full horizontal logo (Mark + Typography)
 */
export async function loadOfficialEzrabLogo(): Promise<string | null> {
  if (cachedLogoDataUrl) return cachedLogoDataUrl;

  try {
    // 1. Browser environment
    if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
      const resp = await fetch('/images/ezrab-logo.png');
      if (resp.ok) {
        const blob = await resp.blob();
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            cachedLogoDataUrl = reader.result as string;
            resolve(cachedLogoDataUrl);
          };
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      }
    }

    // 2. Node.js environment
    const globalProcess = typeof process !== 'undefined' ? process : (globalThis as any).process;
    if (globalProcess && globalProcess.versions && globalProcess.versions.node) {
      const fs = await safeNodeImport('fs');
      const path = await safeNodeImport('path');
      if (fs && path) {
        const candidate = path.resolve(globalProcess.cwd(), 'public', 'images', 'ezrab-logo.png');
        if (fs.existsSync(candidate)) {
          const buffer = fs.readFileSync(candidate);
          cachedLogoDataUrl = `data:image/png;base64,${buffer.toString('base64')}`;
          return cachedLogoDataUrl;
        }
      }
    }
  } catch (err) {
    console.warn('[pdfAssets] Could not load ezrab-logo.png:', err);
  }

  return null;
}
