import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { SupabaseIdentityResolver } from '../auth/supabaseIdentityResolver';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function loadEnvSafe(): Record<string, string> {
  const envPath = path.resolve(process.cwd(), '.env');
  const env: Record<string, string> = {};
  if (!fs.existsSync(envPath)) return env;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  }
  return env;
}

export async function runRealSupabaseIntegrationTests(): Promise<void> {
  const env = loadEnvSafe();

  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;
  const secretKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

  console.log('[REAL SUPABASE] Starting live integration test suite against configured instance...');

  // 1. Config presence check
  assert(Boolean(url), 'SUPABASE_URL is missing in environment');
  assert(Boolean(publishableKey), 'SUPABASE_PUBLISHABLE_KEY is missing in environment');
  assert(Boolean(secretKey), 'SUPABASE_SECRET_KEY is missing in environment');

  const parsedUrl = new URL(url!);
  assert(parsedUrl.protocol === 'https:', 'SUPABASE_URL must use HTTPS protocol');
  assert(parsedUrl.hostname.endsWith('.supabase.co'), 'SUPABASE_URL must be a valid Supabase domain');

  console.log('[REAL SUPABASE] 1. Config format verified (HTTPS Supabase endpoint and required credentials are present; values are not logged).');

  // 2. Real Client Connectivity (Publishable Client)
  console.log('[REAL SUPABASE] 2. Testing real publishable client authentication endpoint...');
  const pubClient = createClient(url!, publishableKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const sessionRes = await pubClient.auth.getSession();
  assert(sessionRes.error === null, `Publishable client session check failed: ${sessionRes.error?.message}`);
  console.log('[REAL SUPABASE] 2. Publishable client successfully connected to Supabase Auth.');

  // 3. Real Admin Client Connectivity (Server Secret Key)
  console.log('[REAL SUPABASE] 3. Testing real server-side admin client with Secret Key...');
  const adminClient = createClient(url!, secretKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const usersRes = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1 });
  assert(usersRes.error === null, `Admin client listUsers check failed: ${usersRes.error?.message}`);
  assert(Array.isArray(usersRes.data.users), 'Admin client must return array of users');
  console.log('[REAL SUPABASE] 3. Admin client successfully verified with Supabase service.');

  // 4. Read-only required-table checks through the server-side client. `head`
  // avoids returning any project or user records to the test output.
  const requiredTables = [
    'profiles',
    'workspaces',
    'workspace_members',
    'projects',
    'project_members',
    'audit_logs',
  ];
  console.log('[REAL SUPABASE] 4. Checking required application tables with read-only, zero-row requests...');
  for (const table of requiredTables) {
    const tableResult = await adminClient.from(table).select('*', { head: true, count: 'exact' });
    assert(!tableResult.error, `Required table is unavailable: ${table}`);
  }
  console.log('[REAL SUPABASE] 4. All required application tables are reachable through the server-side client.');

  // 5. PostgREST's OpenAPI document exposes the live API table/column shape
  // without returning application rows. It cannot expose PostgreSQL indexes,
  // foreign keys, constraints, RLS policies, or migration history.
  const schemaResponse = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: secretKey!, authorization: `Bearer ${secretKey!}` },
  });
  assert(schemaResponse.ok, 'Live PostgREST schema document is unavailable');
  const schemaDocument = await schemaResponse.json() as Record<string, any>;
  const schemas = schemaDocument.components?.schemas || schemaDocument.definitions || {};
  const expectedColumns: Record<string, string[]> = {
    profiles: ['id'], workspaces: ['id', 'name'], workspace_members: ['workspace_id', 'user_id', 'role'],
    projects: ['id', 'workspace_id', 'name'], project_members: ['project_id', 'workspace_id', 'user_id'],
    audit_logs: ['id', 'event_code'],
  };
  const exposesSchemas = Object.keys(schemas).length > 0;
  if (exposesSchemas) {
    for (const [table, columns] of Object.entries(expectedColumns)) {
      const properties = schemas[table]?.properties;
      assert(properties && columns.every((column) => Object.prototype.hasOwnProperty.call(properties, column)), `Live schema does not expose expected columns for ${table}`);
    }
    console.log('[REAL SUPABASE] 5. Live API schema exposes the expected table columns (metadata only).');
  } else {
    console.log('[REAL SUPABASE] 5. Live API schema metadata is not exposed; columns/types/FKs/RLS require database or Management API audit.');
  }

  // 6. Real SupabaseIdentityResolver verification with invalid token
  console.log('[REAL SUPABASE] 6. Testing SupabaseIdentityResolver against live Supabase server with invalid Bearer token...');
  const resolver = new SupabaseIdentityResolver({
    supabaseUrl: url!,
    supabaseKey: secretKey! || publishableKey!,
  });

  const resolvedIdentity = await resolver.resolve({
    authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature',
  });
  assert(resolvedIdentity === null, 'SupabaseIdentityResolver must reject forged/invalid Bearer token without crashing');
  console.log('[REAL SUPABASE] 6. SupabaseIdentityResolver live validation verified (fraudulent token safely rejected).');

  // 7. JWKS Key Distribution Verification
  console.log('[REAL SUPABASE] 7. Testing live JWKS endpoint availability...');
  const jwksUrl = env.SUPABASE_JWKS_URL || `${url}/auth/v1/.well-known/jwks.json`;
  const jwksRes = await fetch(jwksUrl);
  assert(jwksRes.status === 200, `JWKS endpoint returned status ${jwksRes.status}`);
  const jwksJson = (await jwksRes.json()) as { keys?: any[] };
  assert(Array.isArray(jwksJson.keys) && jwksJson.keys.length > 0, 'JWKS must return at least one signing key');
  console.log('[REAL SUPABASE] 7. JWKS endpoint verified online.');

  console.log('===> STATUS: CONNECTIVITY VERIFIED ONLY (this test does not verify signup, session lifecycle, durable membership, or official project context).');
}

runRealSupabaseIntegrationTests().catch((err) => {
  console.error('[REAL SUPABASE TEST FAILED]', err);
  process.exitCode = 1;
});
