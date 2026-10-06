import fs from 'fs';
import path from 'path';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

const migration = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/20260913_auth_membership_foundation.sql'), 'utf8');
assert(/create or replace function public\.handle_new_auth_user\(\)/i.test(migration), 'profile trigger function is declared');
assert(/security definer/i.test(migration) && /set search_path = public/i.test(migration), 'trigger function has a safe execution context');
assert(/on conflict \(id\) do update/i.test(migration), 'profile creation is idempotent');
assert(/after insert on auth\.users/i.test(migration), 'profile creation runs for new Auth users');
assert(!/user_metadata.*role/i.test(migration), 'profile trigger does not make role authoritative');
console.log('PASS migration profile trigger: safe, idempotent, and non-authoritative metadata');
