/**
 * Minimal .env loader for server-side processes (vite dev middleware & standalone server).
 * Vite's loadEnv() does NOT populate process.env, so server code that reads
 * process.env.GEMINI_API_KEY_* would otherwise see nothing.
 *
 * Rules:
 * - Only sets variables that are NOT already defined in process.env (shell wins).
 * - Never logs values. Never exports to client code.
 */

import fs from 'node:fs';
import path from 'node:path';

const loadedFiles = new Set<string>();

export function loadServerEnv(startDir?: string): void {
  if (typeof window !== 'undefined' || typeof process === 'undefined' || !process.cwd) return;
  const dir = startDir || process.cwd();
  const envFiles = [
    path.resolve(dir, '.env'),
    path.resolve(dir, '.env.local'),
  ];

  for (const envFile of envFiles) {
    if (loadedFiles.has(envFile)) continue;
    if (!fs.existsSync(envFile)) continue;

    const content = fs.readFileSync(envFile, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      // Strip surrounding quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      // .env.local takes precedence over .env
      if (envFile.endsWith('.local') || process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
    loadedFiles.add(envFile);
  }
}
