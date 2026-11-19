// Suite: Bootstrap workspace server-side pasca-signup (Phase 2 W5).
// - Idempotensi: bootstrap ganda = satu workspace + satu keanggotaan.
// - Non-owner TIDAK PERNAH menjadi SUPER_ADMIN; owner allowlist menjadi
//   SUPER_ADMIN; allowlist hilang = fail-closed pada hak istimewa.
// - Balapan: rantai per-user in-process + id workspace deterministik
//   (UUIDv5) dengan retry 23505 untuk lintas-instance.
// - Billing HANYA ter-provision sesudah keanggotaan ada.
// - Input klien (role/workspace) tidak pernah dipercaya.
// Repository = InMemory; tanpa jaringan/DB nyata.
// Jalankan dari root repo: npx --yes tsx src/test/bootstrapWorkspace.test.ts
import {
  BOOTSTRAP_NAMESPACE_UUID,
  InMemoryWorkspaceRepository,
  createBootstrapService,
  deterministicWorkspaceId,
  isOwnerEmail,
  parseBootstrapAllowlist,
  uuidv5,
} from '../../api/_lib/workspaceBootstrap.js';
import { InMemoryBillingRepository, loadLedgerSnapshot } from '../../api/_lib/billingStore.js';
import { createCreditLedger } from '../../api/_lib/creditLedger.js';

let pass = 0;
let fail = 0;
const failures: string[] = [];
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL  ${name}`); }
}

const OWNER_EMAIL = 'owner@example.id';
const USER_EMAIL = 'pengguna@example.id';
const USER_ID = 'user-aaaaaaaa-0001';
const OWNER_ID = 'user-bbbbbbbb-0002';

async function freeOnceBalance(repo: InMemoryBillingRepository, accountId: string) {
  const snap = await loadLedgerSnapshot(repo, accountId, { ownerUserId: USER_ID, workspaceId: 'ws' });
  return createCreditLedger(snap.store).getBalance(accountId, Date.now());
}

function setup(opts: { allowlist?: string; billing?: boolean; delayMs?: number } = {}) {
  const wsRepo = new InMemoryWorkspaceRepository({ delayMs: opts.delayMs || 0 });
  const billingRepo = opts.billing === false ? null : new InMemoryBillingRepository();
  const service = createBootstrapService({
    workspaceRepo: wsRepo,
    billingRepo,
    allowlist: parseBootstrapAllowlist({ EZRAB_BOOTSTRAP_OWNER_EMAILS: opts.allowlist || '' } as any),
    sleep: () => Promise.resolve(),
  });
  return { wsRepo, billingRepo, service };
}

console.log('=== [1] Parsing allowlist owner (env server-side) ===');
{
  const set = parseBootstrapAllowlist({ EZRAB_BOOTSTRAP_OWNER_EMAILS: 'Owner@X.id, admin@y.id ,owner@x.id,' } as any);
  check('allowlist: lowercase + trim + dedup (2 unik)', set.size === 2 && set.has('owner@x.id') && set.has('admin@y.id'));
  check('allowlist kosong bila env tidak ada', parseBootstrapAllowlist({} as any).size === 0);
  check('allowlist kosong bila env string kosong', parseBootstrapAllowlist({ EZRAB_BOOTSTRAP_OWNER_EMAILS: '   ' } as any).size === 0);
  check('isOwnerEmail case-insensitive', isOwnerEmail('OWNER@X.ID', set) === true);
  check('isOwnerEmail menolak email di luar allowlist', isOwnerEmail('lain@x.id', set) === false);
  check('isOwnerEmail menolak email null', isOwnerEmail(null, set) === false);
  check('isOwnerEmail menolak allowlist kosong', isOwnerEmail('owner@x.id', new Set()) === false);
}

console.log('=== [2] Id workspace deterministik (UUIDv5) ===');
{
  const a = deterministicWorkspaceId(USER_ID);
  const b = deterministicWorkspaceId(USER_ID);
  const c = deterministicWorkspaceId(OWNER_ID);
  check('user sama → id workspace sama', a === b);
  check('user beda → id workspace beda', a !== c);
  check(
    'format UUIDv5 valid',
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(a),
  );
  check('uuidv5 deterministik untuk nama sama', uuidv5(BOOTSTRAP_NAMESPACE_UUID, 'n') === uuidv5(BOOTSTRAP_NAMESPACE_UUID, 'n'));
}

console.log('=== [3] Bootstrap pengguna biasa → ESTIMATOR, bukan admin ===');
{
  const { wsRepo, billingRepo, service } = setup({ allowlist: OWNER_EMAIL });
  const r: any = await service.bootstrap({ userId: USER_ID, email: USER_EMAIL });
  check('bootstrap ok + created', r.ok === true && r.created === true);
  check('peran ESTIMATOR (bukan SUPER_ADMIN)', r.role === 'ESTIMATOR');
  check('workspaceId = id deterministik', r.workspaceId === deterministicWorkspaceId(USER_ID));
  check('tepat 1 workspace', wsRepo.workspaces.size === 1);
  check('tepat 1 keanggotaan', wsRepo.memberships.size === 1);
  check('profil dipastikan ada', wsRepo.profiles.has(USER_ID));
  check('allowlist terkonfigurasi dilaporkan', r.ownerAllowlistConfigured === true);
  const account = await billingRepo!.getBillingAccountByWorkspace(r.workspaceId);
  check('akun billing ter-provision untuk workspace bootstrap', Boolean(account));
  check('Free-once 100 terbit pada bootstrap pertama', r.freeOnceGranted === true && r.billingProvisioned === true);
  const bal: any = await freeOnceBalance(billingRepo!, account!.id);
  check('saldo Free-once = 100', bal.freeOnceAvailable === 100);
}

console.log('=== [4] Bootstrap owner allowlist → SUPER_ADMIN ===');
{
  const { wsRepo, service } = setup({ allowlist: OWNER_EMAIL });
  const r: any = await service.bootstrap({ userId: OWNER_ID, email: 'Owner@Example.ID' });
  check('bootstrap owner ok + created', r.ok === true && r.created === true);
  check('peran SUPER_ADMIN untuk email allowlist (case-insensitive)', r.role === 'SUPER_ADMIN');
  check('satu workspace, satu membership owner', wsRepo.workspaces.size === 1 && wsRepo.memberships.size === 1);
}

console.log('=== [5] Idempotensi: bootstrap ganda = satu workspace/membership ===');
{
  const { wsRepo, billingRepo, service } = setup({ allowlist: OWNER_EMAIL });
  const r1: any = await service.bootstrap({ userId: USER_ID, email: USER_EMAIL });
  const r2: any = await service.bootstrap({ userId: USER_ID, email: USER_EMAIL });
  check('bootstrap kedua ok + created:false', r2.ok === true && r2.created === false);
  check('workspaceId sama pada bootstrap kedua', r2.workspaceId === r1.workspaceId);
  check('peran sama pada bootstrap kedua', r2.role === r1.role);
  check('tetap 1 workspace sesudah bootstrap ganda', wsRepo.workspaces.size === 1);
  check('tetap 1 membership sesudah bootstrap ganda', wsRepo.memberships.size === 1);
  check('Free-once TIDAK terbit dua kali', r2.freeOnceGranted === false);
  const account = await billingRepo!.getBillingAccountByWorkspace(r1.workspaceId);
  const bal: any = await freeOnceBalance(billingRepo!, account!.id);
  check('saldo Free-once tetap 100 sesudah bootstrap ganda', bal.freeOnceAvailable === 100);
}

console.log('=== [6] Allowlist hilang → fail-closed pada hak istimewa ===');
{
  const { service } = setup({ allowlist: '' });
  const r: any = await service.bootstrap({ userId: OWNER_ID, email: OWNER_EMAIL });
  check('bootstrap tetap ok tanpa allowlist (mekanisme jalan)', r.ok === true);
  check('tanpa allowlist, kandidat owner HANYA ESTIMATOR', r.role === 'ESTIMATOR');
  check('ownerAllowlistConfigured:false dilaporkan jujur', r.ownerAllowlistConfigured === false);
}

console.log('=== [7] Konfigurasi hilang → gagal tertutup dengan error jelas ===');
{
  const noRepo = createBootstrapService({});
  const r1: any = await noRepo.bootstrap({ userId: USER_ID, email: USER_EMAIL });
  check('tanpa repo workspace → 503 BOOTSTRAP_NOT_CONFIGURED', r1.ok === false && r1.status === 503 && r1.error === 'BOOTSTRAP_NOT_CONFIGURED');
  const { service } = setup({ allowlist: OWNER_EMAIL });
  const r2: any = await service.bootstrap({ userId: '', email: USER_EMAIL });
  check('tanpa userId → 401 AUTH_REQUIRED', r2.ok === false && r2.status === 401 && r2.error === 'AUTH_REQUIRED');
  const r3: any = await service.bootstrap(null as any);
  check('tanpa input → 401 AUTH_REQUIRED', r3.ok === false && r3.status === 401);
}

console.log('=== [8] Balapan in-process: dua bootstrap konkuren = satu workspace ===');
{
  const { wsRepo, service } = setup({ allowlist: OWNER_EMAIL });
  const [a, b]: any[] = await Promise.all([
    service.bootstrap({ userId: USER_ID, email: USER_EMAIL }),
    service.bootstrap({ userId: USER_ID, email: USER_EMAIL }),
  ]);
  check('kedua bootstrap konkuren ok', a.ok === true && b.ok === true);
  check('kedua mengembalikan workspaceId sama', a.workspaceId === b.workspaceId);
  check('tepat 1 workspace sesudah balapan in-process', wsRepo.workspaces.size === 1);
  check('tepat 1 membership sesudah balapan in-process', wsRepo.memberships.size === 1);
  check('tepat satu yang created:true', (a.created === true) !== (b.created === true));
}

console.log('=== [9] Balapan lintas-instance: inti tanpa rantai, repo tertunda ===');
{
  // Dua service (dua "instance") berbagi satu repo; inti bootstrapCore
  // dipanggil langsung tanpa rantai per-user — konvergensi HANYA lewat
  // id deterministik + retry 23505.
  const wsRepo = new InMemoryWorkspaceRepository({ delayMs: 5 });
  const billingRepo = new InMemoryBillingRepository();
  const allowlist = parseBootstrapAllowlist({ EZRAB_BOOTSTRAP_OWNER_EMAILS: OWNER_EMAIL } as any);
  const s1 = createBootstrapService({ workspaceRepo: wsRepo, billingRepo, allowlist, sleep: () => Promise.resolve() });
  const s2 = createBootstrapService({ workspaceRepo: wsRepo, billingRepo, allowlist, sleep: () => Promise.resolve() });
  const [a, b]: any[] = await Promise.all([
    s1.bootstrapCore({ userId: USER_ID, email: USER_EMAIL }),
    s2.bootstrapCore({ userId: USER_ID, email: USER_EMAIL }),
  ]);
  check('kedua inti konkuren ok', a.ok === true && b.ok === true);
  check('kedua mengembalikan workspaceId sama', a.workspaceId === b.workspaceId);
  check('tepat 1 workspace sesudah balapan lintas-instance', wsRepo.workspaces.size === 1);
  check('tepat 1 membership sesudah balapan lintas-instance', wsRepo.memberships.size === 1);
}

console.log('=== [10] Input klien tidak dipercaya ===');
{
  const { service } = setup({ allowlist: OWNER_EMAIL });
  const r: any = await service.bootstrap({ userId: USER_ID, email: USER_EMAIL, role: 'SUPER_ADMIN' } as any);
  check('role SUPER_ADMIN dari klien diabaikan → ESTIMATOR', r.ok === true && r.role === 'ESTIMATOR');
  const r2: any = await service.bootstrap({ userId: USER_ID, email: USER_EMAIL, workspaceId: 'ws-palsu' } as any);
  check('workspaceId dari klien diabaikan → id deterministik', r2.ok === true && r2.workspaceId === deterministicWorkspaceId(USER_ID));
}

console.log('=== [11] Billing hanya sesudah keanggotaan ada ===');
{
  // Repo yang selalu gagal menyisipkan membership (bukan konflik):
  class FailingMembershipRepo extends InMemoryWorkspaceRepository {
    override async insertMembership(_row: any): Promise<any> {
      throw new Error('membership_insert_failed');
    }
  }
  const wsRepo = new FailingMembershipRepo();
  const billingRepo = new InMemoryBillingRepository();
  const service = createBootstrapService({
    workspaceRepo: wsRepo,
    billingRepo,
    allowlist: parseBootstrapAllowlist({ EZRAB_BOOTSTRAP_OWNER_EMAILS: OWNER_EMAIL } as any),
    sleep: () => Promise.resolve(),
  });
  const r: any = await service.bootstrap({ userId: USER_ID, email: USER_EMAIL });
  check('gagal membership → bootstrap !ok 503', r.ok === false && r.status === 503);
  check('TIDAK ADA akun billing bila membership gagal', billingRepo.accounts.size === 0);

  // Repo billing tidak terkonfigurasi: bootstrap tetap ok, flag jujur.
  const { service: s2 } = setup({ allowlist: OWNER_EMAIL, billing: false });
  const r2: any = await s2.bootstrap({ userId: USER_ID, email: USER_EMAIL });
  check('tanpa repo billing → bootstrap tetap ok', r2.ok === true && r2.created === true);
  check('billingNotConfigured:true dilaporkan', r2.billingProvisioned === false && r2.billingNotConfigured === true);
}

console.log('=== [12] Keanggotaan yang sudah ada dihormati (tanpa workspace baru) ===');
{
  const { wsRepo, service } = setup({ allowlist: OWNER_EMAIL });
  wsRepo.seedMembership('ws-undangan', USER_ID, 'ESTIMATOR');
  const r: any = await service.bootstrap({ userId: USER_ID, email: USER_EMAIL });
  check('bootstrap mengembalikan workspace undangan', r.ok === true && r.created === false && r.workspaceId === 'ws-undangan');
  check('tidak ada workspace baru dibuat', wsRepo.workspaces.size === 0);
  check('peran dari keanggotaan yang ada', r.role === 'ESTIMATOR');
}

console.log(`\nHasil bootstrapWorkspace: ${pass} lolos, ${fail} gagal`);
if (fail > 0) {
  console.log('GAGAL:', failures.join(' | '));
  process.exit(1);
}
console.log('SEMUA TEST BOOTSTRAP WORKSPACE LOLOS');
