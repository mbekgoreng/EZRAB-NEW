/**
 * src/test/secureInvitation.test.ts — Fase I master prompt Secure Invitation.
 *
 * Menguji domain + service + handler undangan dengan repository IN-MEMORY
 * dan provider email MOCK (sink). Tidak ada database eksternal, tidak ada
 * email sungguhan, tidak ada Supabase live. Jalur produksi (Supabase +
 * fungsi DB accept_workspace_invitation) tercermin oleh adapter in-memory
 * dengan semantik yang sama; perbedaan itu dinyatakan jujur di laporan.
 *
 * Jalankan: npx tsx src/test/secureInvitation.test.ts
 */
// @ts-nocheck — suite ini mengimpor modul JS (api/_lib) tanpa deklarasi tipe.
import {
  INVITABLE_ROLES,
  buildInvitationLink,
  computeExpiresAt,
  effectiveStatus,
  generateInvitationToken,
  hashInvitationToken,
  isInvitableRole,
  normalizeEmail,
  resolvePublicBaseUrl,
  safeAdminView,
} from '../../api/_lib/invitations/core.js';
import { InMemoryInvitationRepository } from '../../api/_lib/invitations/repository.js';
import { MockEmailProvider, renderInvitationEmail } from '../../api/_lib/invitations/email.js';
import * as svc from '../../api/_lib/invitations/service.js';
import { createHandlers } from '../../api/_lib/invitations/handler.js';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const T0 = Date.parse('2026-10-22T00:00:00.000Z');
const WS1 = 'ws-sinergi';
const WS2 = 'ws-lain';
const ADMIN = { id: 'admin-1', email: 'admin@sinergi.co.id' };
const ADMIN2 = { id: 'admin-2', email: 'admin@lain.co.id' };
const ESTIMATOR_MEMBER = { id: 'est-0', email: 'est0@sinergi.co.id' };

function makeDeps(nowMs = T0, emailProvider = new MockEmailProvider()) {
  const repo = new InMemoryInvitationRepository();
  repo.seedWorkspace(WS1, 'PT Sinergi Konstruksi Nusantara');
  repo.seedWorkspace(WS2, 'PT Lain Sejahtera');
  repo.seedMembership(WS1, ADMIN.id, 'SUPER_ADMIN');
  repo.seedMembership(WS2, ADMIN2.id, 'SUPER_ADMIN');
  repo.seedMembership(WS1, ESTIMATOR_MEMBER.id, 'ESTIMATOR');
  repo.seedProject('p-1', WS1);
  repo.seedProject('p-2', WS1);
  return { repo, emailProvider, baseUrl: 'https://ezrab.site', nowMs };
}

class FailingEmailProvider {
  name = 'failing-stub';
  async sendInvitationEmail() { return { delivered: false, status: 'failed', provider: this.name, reason: 'stub_failure' }; }
}

async function main() {
  console.log('== CORE ==');
  const tokA = generateInvitationToken();
  const tokB = generateInvitationToken();
  check('C1 token acak 43 char base64url & unik', tokA.length === 43 && tokA !== tokB);
  check('C2 hash != token mentah, 64 hex, deterministik',
    hashInvitationToken(tokA) !== tokA && /^[a-f0-9]{64}$/.test(hashInvitationToken(tokA)) &&
    hashInvitationToken(tokA) === hashInvitationToken(tokA));
  check('C3 expiry default tepat 24 jam',
    computeExpiresAt(T0).getTime() - T0 === 24 * 3600 * 1000);
  check('C4 role whitelist: ESTIMATOR boleh, SUPER_ADMIN tidak',
    isInvitableRole('ESTIMATOR') && !isInvitableRole('SUPER_ADMIN') && INVITABLE_ROLES.includes('ESTIMATOR'));
  check('C5 normalisasi email', normalizeEmail('  Budi@Example.COM ') === 'budi@example.com');
  check('C6 link dibangun dari base URL konfigurasi',
    buildInvitationLink('https://ezrab.site/', 'abc') === 'https://ezrab.site/accept-invitation/abc');
  check('C7 base URL production menolak env vercel.app',
    resolvePublicBaseUrl({ VERCEL_ENV: 'production', PUBLIC_APP_URL: 'https://x.vercel.app' }, 'https://ezrab.site') === 'https://ezrab.site');
  check('C8 base URL production menerima domain resmi',
    resolvePublicBaseUrl({ VERCEL_ENV: 'production', PUBLIC_APP_URL: 'https://ezrab.site' }, '') === 'https://ezrab.site');
  const emailContent = renderInvitationEmail({
    inviteeName: 'Sari', companyName: 'PT Sinergi Konstruksi Nusantara', role: 'ESTIMATOR',
    link: 'https://ezrab.site/accept-invitation/xyz', expiresAtIso: new Date(T0 + 86400000).toISOString(),
  });
  check('C9 isi email: perusahaan, role, tombol/link, expiry, kontak admin',
    emailContent.text.includes('PT Sinergi Konstruksi Nusantara') && emailContent.text.includes('ESTIMATOR') &&
    emailContent.html.includes('Terima Undangan') && emailContent.text.includes('hubungi administrator'));

  console.log('== CREATE (kasus 1,2,3,4) ==');
  {
    const deps = makeDeps();
    const r = await svc.createInvitation(deps, ADMIN, {
      name: 'Sari Estimator', email: ' Sari@Example.com ', role: 'ESTIMATOR', workspaceId: WS1, projectIds: ['p-1'],
    });
    check('1 admin berwenang membuat undangan', r.ok === true && r.status === 201);
    check('1 status awal Pending', r.invitation?.status === 'PENDING');
    check('4 expiry 24 jam dari pembuatan',
      Date.parse(r.invitation.expiresAt) - T0 === 24 * 3600 * 1000, r.invitation?.expiresAt);
    check('1 token mentah hanya di respons pembuatan; DB menyimpan hash',
      typeof r.rawToken === 'string' && r.rawToken.length === 43);
    const stored = await deps.repo.findByTokenHash(hashInvitationToken(r.rawToken));
    check('1 hash tersimpan cocok & bukan token mentah',
      !!stored && stored.token_hash === hashInvitationToken(r.rawToken) && stored.token_hash !== r.rawToken);
    check('1 email ternormalisasi', stored?.email === 'sari@example.com');
    check('1 link memakai base URL konfigurasi', r.link === `https://ezrab.site/accept-invitation/${r.rawToken}`);
    check('15 mock email: status not_sent, bukan terkirim', r.email?.status === 'not_sent');
    const outboxJson = JSON.stringify((deps.emailProvider as any).outbox);
    check('15/8 outbox mock tidak memuat token mentah', !outboxJson.includes(r.rawToken));

    const denied = await svc.createInvitation(deps, ESTIMATOR_MEMBER, {
      name: 'X Y', email: 'x@example.com', role: 'ESTIMATOR', workspaceId: WS1,
    });
    check('2 anggota non-admin tidak dapat membuat undangan', denied.ok === false && denied.status === 403);
    const outsider = await svc.createInvitation(deps, { id: 'ghost', email: 'g@x.co' }, {
      name: 'X Y', email: 'x@example.com', role: 'ESTIMATOR', workspaceId: WS1,
    });
    check('2 non-anggota tidak dapat membuat undangan', outsider.ok === false && outsider.status === 403);

    const sa = await svc.createInvitation(deps, ADMIN, {
      name: 'X Y', email: 'sa@example.com', role: 'SUPER_ADMIN', workspaceId: WS1,
    });
    check('3 undangan role Super Admin ditolak', sa.ok === false && sa.status === 400);
    const badRole = await svc.createInvitation(deps, ADMIN, {
      name: 'X Y', email: 'o@example.com', role: 'OWNER', workspaceId: WS1,
    });
    check('3 role tak dikenal ditolak', badRole.ok === false && badRole.status === 400);

    const dup = await svc.createInvitation(deps, ADMIN, {
      name: 'Sari Lagi', email: 'sari@example.com', role: 'ESTIMATOR', workspaceId: WS1,
    });
    check('C+ duplikat undangan pending aktif ditolak 409', dup.ok === false && dup.status === 409);
  }

  console.log('== VALIDATE + REDEEM (kasus 5,6,11,12,13,18) ==');
  {
    const deps = makeDeps();
    const c = await svc.createInvitation(deps, ADMIN, {
      name: 'Bima', email: 'bima@example.com', role: 'ESTIMATOR', workspaceId: WS1, projectIds: ['p-1'],
    });
    const v = await svc.validateInvitationToken(deps, c.rawToken);
    check('5 token valid: ringkasan aman (perusahaan, role, status)',
      v.ok === true && v.summary.company === 'PT Sinergi Konstruksi Nusantara' &&
      v.summary.role === 'ESTIMATOR' && v.summary.status === 'PENDING');
    check('5 ringkasan tidak memuat email penuh/token/hash',
      v.summary.emailMasked.includes('***') && !JSON.stringify(v.summary).includes(c.rawToken) &&
      !JSON.stringify(v.summary).includes(hashInvitationToken(c.rawToken)));

    const bad = await svc.validateInvitationToken(deps, generateInvitationToken());
    check('6 token tidak valid ditolak generik', bad.ok === false && bad.status === 404);

    const wrongEmail = await svc.redeemInvitation(deps, { id: 'user-9', email: 'oranglain@example.com' }, c.rawToken);
    check('11 email lain tidak dapat mengambil undangan', wrongEmail.ok === false && wrongEmail.status === 403);
    const still = await deps.repo.findByTokenHash(hashInvitationToken(c.rawToken));
    check('14 kegagalan redeem tidak mengonsumsi undangan (tetap PENDING)', still?.status === 'PENDING');

    const ok = await svc.redeemInvitation(deps, { id: 'user-9', email: 'Bima@Example.com' }, c.rawToken);
    check('5/13 redeem berhasil oleh akun dengan email yang sama', ok.ok === true && ok.role === 'ESTIMATOR');
    const membership = await deps.repo.getMembership(WS1, 'user-9');
    check('12 role & workspace dari data tersimpan (ESTIMATOR, ws benar)',
      membership?.role === 'ESTIMATOR' && membership?.workspace_id === WS1);
    check('18 akses proyek hanya yang diizinkan (p-1 ya, p-2 tidak)',
      deps.repo.projectMembers.has('p-1:user-9') && !deps.repo.projectMembers.has('p-2:user-9'));

    const again = await svc.redeemInvitation(deps, { id: 'user-9', email: 'bima@example.com' }, c.rawToken);
    check('8 token yang sudah digunakan ditolak', again.ok === false && again.status === 410);
  }

  console.log('== KONKURENSI (kasus 10) ==');
  {
    const deps = makeDeps();
    const c = await svc.createInvitation(deps, ADMIN, {
      name: 'Rina', email: 'rina@example.com', role: 'ESTIMATOR', workspaceId: WS1,
    });
    const user = { id: 'user-10', email: 'rina@example.com' };
    const [r1, r2] = await Promise.all([
      svc.redeemInvitation(deps, user, c.rawToken),
      svc.redeemInvitation(deps, user, c.rawToken),
    ]);
    const successes = [r1, r2].filter((r) => r.ok).length;
    check('10 dua redeem bersamaan: tepat satu berhasil', successes === 1, `r1=${r1.ok} r2=${r2.ok}`);
  }

  console.log('== EXPIRY + REVOKE (kasus 7,9) ==');
  {
    const deps = makeDeps();
    const c = await svc.createInvitation(deps, ADMIN, {
      name: 'Joko', email: 'joko@example.com', role: 'ESTIMATOR', workspaceId: WS1,
    });
    const depsLater = { ...deps, nowMs: T0 + 25 * 3600 * 1000 };
    const vLate = await svc.validateInvitationToken(depsLater, c.rawToken);
    check('7 token kedaluwarsa tidak dapat ditebus (validate)', vLate.ok === false);
    const rLate = await svc.redeemInvitation(depsLater, { id: 'user-11', email: 'joko@example.com' }, c.rawToken);
    check('7 redeem kedaluwarsa ditolak 410', rLate.ok === false && rLate.status === 410 && rLate.error === 'EXPIRED');

    const c2 = await svc.createInvitation(deps, ADMIN, {
      name: 'Dewi', email: 'dewi@example.com', role: 'CLIENT', workspaceId: WS1,
    });
    const rv = await svc.revokeInvitation(deps, ADMIN, c2.invitation.id);
    check('9 admin dapat membatalkan undangan pending', rv.ok === true && rv.invitation.status === 'REVOKED');
    const rRevoked = await svc.redeemInvitation(deps, { id: 'user-12', email: 'dewi@example.com' }, c2.rawToken);
    check('9 redeem token yang dibatalkan ditolak', rRevoked.ok === false && rRevoked.error === 'REVOKED');
    const rvByEstimator = await svc.revokeInvitation(deps, ESTIMATOR_MEMBER, c.invitation.id);
    check('9 non-admin tidak dapat membatalkan', rvByEstimator.ok === false && rvByEstimator.status === 403);
  }

  console.log('== RESEND (kasus 16) ==');
  {
    const deps = makeDeps();
    const c = await svc.createInvitation(deps, ADMIN, {
      name: 'Agus', email: 'agus@example.com', role: 'ESTIMATOR', workspaceId: WS1,
    });
    const rs = await svc.resendInvitation(deps, ADMIN, c.invitation.id);
    check('16 resend menerbitkan token baru', rs.ok === true && rs.rawToken !== c.rawToken);
    check('16 resend mengaitkan resend_of & expiry baru 24 jam',
      rs.invitation.resendOf === c.invitation.id && Date.parse(rs.invitation.expiresAt) - T0 === 24 * 3600 * 1000);
    const oldRedeem = await svc.redeemInvitation(deps, { id: 'user-13', email: 'agus@example.com' }, c.rawToken);
    check('16 token lama tidak dapat digunakan setelah resend', oldRedeem.ok === false);
    const newRedeem = await svc.redeemInvitation(deps, { id: 'user-13', email: 'agus@example.com' }, rs.rawToken);
    check('16 token baru dapat digunakan', newRedeem.ok === true);
  }

  console.log('== LIST & VISIBILITAS (kasus 17) ==');
  {
    const deps = makeDeps();
    await svc.createInvitation(deps, ADMIN, { name: 'Anggota A', email: 'a@example.com', role: 'ESTIMATOR', workspaceId: WS1 });
    const listAdmin = await svc.listInvitations(deps, ADMIN, WS1, 'ALL');
    check('17 admin workspace dapat melihat daftarnya', listAdmin.ok === true && listAdmin.invitations.length === 1);
    const listCross = await svc.listInvitations(deps, ADMIN2, WS1, 'ALL');
    check('17 admin workspace LAIN tidak dapat melihat undangan ws-1', listCross.ok === false && listCross.status === 403);
    const listEstimator = await svc.listInvitations(deps, ESTIMATOR_MEMBER, WS1, 'ALL');
    check('17 anggota non-admin tidak dapat melihat daftar', listEstimator.ok === false && listEstimator.status === 403);
    check('17 tampilan admin tidak memuat token_hash',
      !('token_hash' in (listAdmin.invitations[0] as any)) && !JSON.stringify(listAdmin.invitations).includes('token_hash'));
    const pendingOnly = await svc.listInvitations(deps, ADMIN, WS1, 'PENDING');
    check('17 filter Pending bekerja', pendingOnly.ok === true && pendingOnly.invitations.every((i: any) => i.status === 'PENDING'));
  }

  console.log('== EMAIL GAGAL (kasus 15) ==');
  {
    const deps = makeDeps(T0, new FailingEmailProvider());
    const c = await svc.createInvitation(deps, ADMIN, {
      name: 'Rudi', email: 'rudi@example.com', role: 'ESTIMATOR', workspaceId: WS1,
    });
    check('15 kegagalan email: undangan tetap dibuat, status email = failed (bukan sent)',
      c.ok === true && c.email?.status === 'failed' && c.invitation.emailStatus === 'failed');
    check('15 audit tercatat tanpa token',
      deps.repo.audits.some((a: any) => a.event_code === 'invitation.created') &&
      !JSON.stringify(deps.repo.audits).includes(c.rawToken));
  }

  console.log('== HANDLER HTTP (endpoint tipis) ==');
  {
    const deps = makeDeps();
    const handlers = createHandlers({
      getRepo: () => deps.repo,
      getEmailProvider: () => deps.emailProvider,
      authenticate: async (req: any) => {
        const who = req.headers['x-test-user'];
        if (who === 'admin') return { ok: true, method: 'jwt', user: ADMIN };
        if (who === 'estimator') return { ok: true, method: 'jwt', user: ESTIMATOR_MEMBER };
        return { ok: false, method: 'jwt', reason: 'missing_token' };
      },
      nowMs: T0,
    });
    const mkReq = (opts: any = {}) => ({
      method: opts.method || 'POST',
      url: opts.url || '/api/invitations/create',
      headers: { host: 'localhost', ...(opts.user ? { 'x-test-user': opts.user } : {}) },
      socket: { remoteAddress: '127.0.0.1' },
      body: opts.body,
    });
    const mkRes = () => {
      const res: any = { statusCode: 0, body: null, headers: {} };
      res.status = (c: number) => { res.statusCode = c; return res; };
      res.json = (o: any) => { res.body = o; return res; };
      res.setHeader = (k: string, v: string) => { res.headers[k] = v; };
      res.end = () => res;
      return res;
    };

    let res = mkRes();
    await handlers.create(mkReq({ user: 'admin', body: { name: 'Tono', email: 'tono@example.com', role: 'ESTIMATOR', workspaceId: WS1 } }), res);
    check('H1 POST create oleh admin → 201 + link sekali tampil, tanpa hash',
      res.statusCode === 201 && typeof res.body.link === 'string' && res.body.link.includes('/accept-invitation/') &&
      !JSON.stringify(res.body).includes('token_hash'));

    res = mkRes();
    await handlers.create(mkReq({ body: { name: 'Tono', email: 'tono2@example.com', role: 'ESTIMATOR', workspaceId: WS1 } }), res);
    check('H2 POST create tanpa login → 401', res.statusCode === 401);

    res = mkRes();
    await handlers.create(mkReq({ user: 'estimator', body: { name: 'Tono', email: 'tono3@example.com', role: 'ESTIMATOR', workspaceId: WS1 } }), res);
    check('H3 POST create oleh non-admin → 403', res.statusCode === 403);

    const notConfigured = createHandlers({ getRepo: () => null, getEmailProvider: () => deps.emailProvider, authenticate: async () => ({ ok: true, user: ADMIN }) });
    res = mkRes();
    await notConfigured.create(mkReq({ user: 'admin', body: {} }), res);
    check('H4 backend belum dikonfigurasi → 503 NOT_CONFIGURED (fail-closed)', res.statusCode === 503 && res.body.error === 'NOT_CONFIGURED');

    res = mkRes();
    await handlers.validate(mkReq({ url: '/api/invitations/validate', body: { token: generateInvitationToken() } }), res);
    check('H5 POST validate token asing → 404 generik anti-enumerasi',
      res.statusCode === 404 && res.body.message === 'Tautan undangan tidak valid atau sudah tidak berlaku. Minta admin workspace mengirim ulang undangan Anda.');
  }

  console.log('== STATUS EFEKTIF ==');
  {
    const inv: any = { status: 'PENDING', expires_at: new Date(T0 + 1000).toISOString() };
    check('S1 PENDING lewat expiry terbaca EXPIRED', effectiveStatus(inv, T0 + 2000) === 'EXPIRED');
    const view = safeAdminView({ ...inv, id: 'x', workspace_id: WS1, email: 'e@x.co', role: 'ESTIMATOR' }, T0 + 2000);
    check('S2 admin view menampilkan status efektif', view.status === 'EXPIRED');
  }

  console.log(`\n=== HASIL: ${pass} PASS, ${fail} FAIL ===`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error('SUITE ERROR', e); process.exit(1); });
