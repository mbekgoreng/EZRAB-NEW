/**
 * EZRAB AI Core — Safe Environment Contract Validator (Zero Secret Exposure)
 * Checks presence, formatting, and safety of environment variables without printing secret values.
 */

import fs from 'fs';
import path from 'path';

const REQUIRED_VARS = [
  { name: 'NODE_ENV', expectedValues: ['staging', 'production', 'test', 'development'] },
  { name: 'PORT', pattern: /^\d+$/ },
  { name: 'EZRAB_AUTH_MODE', expectedValues: ['trusted', 'legacy-development'] },
  { name: 'SUPABASE_URL', pattern: /^https:\/\/[a-zA-Z0-9_-]+\.supabase\.co/ },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', minLength: 20, isSecret: true },
  { name: 'EZRAB_AI_CORE_URL', pattern: /^http:\/\/(127\.0\.0\.1|localhost):\d+/ }
];

function maskValue(val) {
  if (!val) return '<NOT_SET>';
  if (val.length <= 8) return '****';
  return `${val.slice(0, 4)}...${val.slice(-4)} (Length: ${val.length})`;
}

async function run() {
  console.log('=============================================================');
  console.log('🔒 EZRAB STAGING SAFE ENVIRONMENT AUDIT (ZERO SECRET LEAKAGE)');
  console.log('=============================================================\n');

  let hasError = false;

  for (const item of REQUIRED_VARS) {
    const val = process.env[item.name];
    if (!val) {
      console.log(`[MISSING] ${item.name}: Wajib disetel untuk staging.`);
      hasError = true;
      continue;
    }

    if (item.expectedValues && !item.expectedValues.includes(val)) {
      console.log(`[INVALID] ${item.name}: Nilai '${val}' tidak valid. Expected: ${item.expectedValues.join(', ')}`);
      hasError = true;
      continue;
    }

    if (item.pattern && !item.pattern.test(val)) {
      console.log(`[FORMAT_MISMATCH] ${item.name}: Format nilai tidak memenuhi pola standar.`);
      hasError = true;
      continue;
    }

    if (item.minLength && val.length < item.minLength) {
      console.log(`[TOO_SHORT] ${item.name}: Panjang karakter (${val.length}) di bawah minimum (${item.minLength}).`);
      hasError = true;
      continue;
    }

    const display = item.isSecret ? maskValue(val) : val;
    console.log(`[VALID] ${item.name} -> ${display}`);
  }

  console.log('\n-------------------------------------------------------------');
  if (hasError) {
    console.log('⚠️ Environment audit menemukan variabel yang belum disetel.');
    console.log('ℹ️ Pastikan telah menyalin .env.staging.example ke .env.staging');
  } else {
    console.log('✅ ALL REQUIRED ENVIRONMENT VARIABLES ARE PROPERLY CONFIGURED');
  }
  console.log('=============================================================\n');
}

run().catch(err => {
  console.error('Fatal env validation error:', err);
  process.exit(1);
});
