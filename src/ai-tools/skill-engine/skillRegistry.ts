/**
 * EZRAB AI — Skill Engine: SkillRegistry + validasi startup (BARU, Phase 2 W3).
 *
 * Registry skill modular di atas registry tool live. Katalog tool DIINJEKSI
 * (bukan diimpor) — alasannya: mengimpor toolRegistry.ts menarik graf
 * database harga multi-MB dan modul ini harus tetap ringan + dapat diuji
 * tanpa provider/DOM. Saat cutover, pemanggil membangun katalog dari
 * listToolDefinitions() live lewat buildToolCatalog() (lihat MIGRATION-PLAN).
 *
 * Validasi startup (fail-closed, pola TOOL_REGISTRY_DUPLICATE):
 * duplikat id, tool tak dikenal / tak tersedia, skema hilang, peran tak
 * valid, langganan tak valid, deklarasi paralel tak aman, skill mutasi
 * tanpa approval, retry tak berbatas pada skill mutasi, estimasi biaya
 * tanpa basis ukur, pelanggaran isolasi FULL_AI.
 */
import { checkDedIsolation } from './dedIsolation';
import {
  SERVER_ROLE_TAXONOMY,
  SUBSCRIPTION_ORDER,
  type SkillDefinition,
} from './types';

export type KnownToolPermission = 'read-only' | 'draft' | 'consequential';

export interface KnownToolInfo {
  permission: KnownToolPermission;
  available: boolean;
}

/** Katalog tool live: nama tool -> izin + ketersediaan. */
export type ToolCatalog = ReadonlyMap<string, KnownToolInfo>;

/**
 * Bangun katalog dari definisi tool live (bentuk yang dikembalikan
 * listToolDefinitions() di toolRegistry.ts). Dipakai pemanggil cutover —
 * modul ini sendiri tidak mengimpor registry tool.
 */
export function buildToolCatalog(
  defs: ReadonlyArray<{ name: string; permission: KnownToolPermission; available: boolean }>,
): ToolCatalog {
  const map = new Map<string, KnownToolInfo>();
  for (const d of defs) {
    if (map.has(d.name)) {
      throw new Error(`TOOL_CATALOG_DUPLICATE: tool "${d.name}" muncul dua kali.`);
    }
    map.set(d.name, { permission: d.permission, available: d.available });
  }
  return map;
}

export const SKILL_VALIDATION_CODES = [
  'DUPLICATE_SKILL_ID',
  'INVALID_SKILL_ID',
  'INVALID_VERSION',
  'MISSING_FIELD',
  'MISSING_INPUT_SCHEMA',
  'MISSING_OUTPUT_SCHEMA',
  'UNKNOWN_TOOL',
  'UNAVAILABLE_TOOL',
  'INVALID_ROLE',
  'INVALID_SUBSCRIPTION',
  'UNSAFE_PARALLEL',
  'APPROVAL_REQUIRED',
  'INVALID_TIMEOUT',
  'INVALID_RETRY',
  'UNMEASURED_COST_ESTIMATE',
  'DED_ISOLATION_VIOLATION',
] as const;

export type SkillValidationCode = (typeof SKILL_VALIDATION_CODES)[number];

export class SkillValidationError extends Error {
  readonly code: SkillValidationCode;
  readonly skillId: string;
  readonly details: string[];

  constructor(code: SkillValidationCode, skillId: string, details: string[]) {
    super(`SKILL_VALIDATION_${code}: skill "${skillId}": ${details.join('; ')}`);
    this.name = 'SkillValidationError';
    this.code = code;
    this.skillId = skillId;
    this.details = details;
  }
}

const SKILL_ID_RE = /^[a-z][a-z0-9-]*$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

export const MIN_SKILL_TIMEOUT_MS = 1_000;
export const MAX_SKILL_TIMEOUT_MS = 300_000;
export const MAX_RETRY_ATTEMPTS = 5;

/**
 * Validasi satu definisi terhadap katalog tool. Murni (tanpa efek samping) —
 * mengembalikan daftar {code, message}; kosong = sah.
 */
export function validateSkillDefinition(
  def: SkillDefinition,
  catalog: ToolCatalog,
): Array<{ code: SkillValidationCode; message: string }> {
  const errors: Array<{ code: SkillValidationCode; message: string }> = [];
  const add = (code: SkillValidationCode, message: string) => errors.push({ code, message });

  if (!SKILL_ID_RE.test(def.id)) {
    add('INVALID_SKILL_ID', `id "${def.id}" harus kebab-case diawali huruf kecil`);
  }
  if (!SEMVER_RE.test(def.version)) {
    add('INVALID_VERSION', `version "${def.version}" harus semver mayor.minor.patch`);
  }
  if (!def.displayName || !def.displayName.trim()) {
    add('MISSING_FIELD', 'displayName wajib diisi');
  }
  if (!def.description || !def.description.trim()) {
    add('MISSING_FIELD', 'description wajib diisi');
  }
  if (!def.triggers || def.triggers.length === 0) {
    add('MISSING_FIELD', 'triggers wajib berisi minimal satu trigger');
  }

  // Skema input/output wajib ada (K-01: kontrak standar antar-tahap).
  if (!def.inputSchema || !Array.isArray(def.inputSchema.fields)) {
    add('MISSING_INPUT_SCHEMA', 'inputSchema.fields wajib ada (boleh array kosong)');
  } else {
    for (const f of def.inputSchema.fields) {
      if (f.type === 'select' && (!f.enum || f.enum.length === 0)) {
        add('MISSING_INPUT_SCHEMA', `medan input "${f.name}" bertipe select tanpa enum`);
      }
    }
  }
  if (!def.outputSchema || !Array.isArray(def.outputSchema.fields)) {
    add('MISSING_OUTPUT_SCHEMA', 'outputSchema.fields wajib ada');
  } else if (def.outputSchema.fields.length === 0) {
    add('MISSING_OUTPUT_SCHEMA', 'outputSchema.fields wajib berisi minimal satu medan');
  }

  // Setiap tool harus dikenal + tersedia di registry live (tanpa referensi menggantung).
  for (const tool of def.allowedTools ?? []) {
    const known = catalog.get(tool);
    if (!known) {
      add('UNKNOWN_TOOL', `tool "${tool}" tidak ada di registry tool live`);
    } else if (!known.available) {
      add('UNAVAILABLE_TOOL', `tool "${tool}" terdaftar tapi available=false (sengaja ditutup)`);
    }
  }

  // Peran: hanya taksonomi server (K-16 — peran demo ditolak eksplisit).
  if (!def.allowedRoles || def.allowedRoles.length === 0) {
    add('INVALID_ROLE', 'allowedRoles wajib berisi minimal satu peran server');
  } else {
    for (const role of def.allowedRoles) {
      if (!(SERVER_ROLE_TAXONOMY as readonly string[]).includes(role)) {
        add(
          'INVALID_ROLE',
          `peran "${role}" bukan taksonomi server ${JSON.stringify(SERVER_ROLE_TAXONOMY)}`,
        );
      }
    }
  }

  if (!Object.prototype.hasOwnProperty.call(SUBSCRIPTION_ORDER, def.requiredSubscription)) {
    add('INVALID_SUBSCRIPTION', `requiredSubscription tidak dikenal: ${def.requiredSubscription}`);
  }

  // Kebijakan approval dideklarasikan per skill (bukan aturan blanket):
  // perintah deterministik yang dijalankan langsung oleh instruksi eksplisit
  // user hari ini (mis. "buat proyek X") TIDAK dipaksa menambah konfirmasi
  // — instruksinya sendiri adalah persetujuan. Yang diwajibkan registry
  // hanyalah bentuk kebijakan: approver hanya 'user', TTL positif bila ada.
  // Skill yang mendeklarasikan requiresApproval=true ditegakkan executor.
  if (def.approvalPolicy && def.approvalPolicy.approver !== 'user') {
    add('APPROVAL_REQUIRED', 'approver hanya boleh "user"');
  }
  if (
    def.approvalPolicy?.ttlMs !== undefined &&
    (typeof def.approvalPolicy.ttlMs !== 'number' || def.approvalPolicy.ttlMs <= 0)
  ) {
    add('APPROVAL_REQUIRED', 'approval ttlMs harus > 0 bila diisi');
  }

  // Paralel aman HANYA untuk read-only murni (Keputusan A).
  if (def.parallelSafe) {
    if (def.riskLevel !== 'READ_ONLY') {
      add(
        'UNSAFE_PARALLEL',
        `parallelSafe=true tidak sah untuk riskLevel ${def.riskLevel} (hanya READ_ONLY)`,
      );
    }
    for (const tool of def.allowedTools ?? []) {
      const known = catalog.get(tool);
      if (known && known.permission !== 'read-only') {
        add(
          'UNSAFE_PARALLEL',
          `parallelSafe=true tidak sah: tool "${tool}" berizin ${known.permission}`,
        );
      }
    }
  }

  const timeoutMs = def.timeoutPolicy?.timeoutMs;
  if (
    typeof timeoutMs !== 'number' ||
    timeoutMs < MIN_SKILL_TIMEOUT_MS ||
    timeoutMs > MAX_SKILL_TIMEOUT_MS
  ) {
    add(
      'INVALID_TIMEOUT',
      `timeoutMs harus ${MIN_SKILL_TIMEOUT_MS}..${MAX_SKILL_TIMEOUT_MS}, didapat ${timeoutMs}`,
    );
  }

  const retry = def.retryPolicy;
  const isMutating = def.riskLevel === 'MUTATION' || def.riskLevel === 'POTENTIAL_MUTATION';
  if (!retry || typeof retry.maxAttempts !== 'number' || retry.maxAttempts < 1 || retry.maxAttempts > MAX_RETRY_ATTEMPTS) {
    add('INVALID_RETRY', `maxAttempts harus 1..${MAX_RETRY_ATTEMPTS}`);
  } else if (isMutating && retry.maxAttempts !== 1) {
    // Mutasi tidak boleh di-retry buta — retry mutasi butuh persetujuan baru.
    add('INVALID_RETRY', `skill ${def.riskLevel} wajib maxAttempts=1 (tanpa retry buta)`);
  }
  if (retry && (typeof retry.backoffMs !== 'number' || retry.backoffMs < 0)) {
    add('INVALID_RETRY', 'backoffMs harus >= 0');
  }

  // Anti-fabrikasi biaya (Keputusan B): estimasi tanpa basis ukur dilarang.
  if (def.usageMetadata?.estimatedCostBasis === 'UNMEASURED' && def.usageMetadata.estimatedCredits !== null) {
    add(
      'UNMEASURED_COST_ESTIMATE',
      'estimatedCostBasis UNMEASURED mewajibkan estimatedCredits=null (tanpa angka karangan)',
    );
  }
  if (def.usageMetadata?.estimatedCostBasis === 'OBSERVED') {
    const c = def.usageMetadata.estimatedCredits;
    if (typeof c !== 'number' || c < 0) {
      add('UNMEASURED_COST_ESTIMATE', 'estimatedCostBasis OBSERVED mewajibkan estimatedCredits angka >= 0');
    }
  }

  for (const msg of checkDedIsolation(def.dedMode, def.dataSources)) {
    add('DED_ISOLATION_VIOLATION', msg);
  }

  return errors;
}

export class SkillRegistry {
  private readonly defs = new Map<string, SkillDefinition>();
  private readonly catalog: ToolCatalog;

  constructor(catalog: ToolCatalog) {
    this.catalog = catalog;
  }

  /** Katalog tool yang dipakai registry ini (read-only). */
  getToolCatalog(): ToolCatalog {
    return this.catalog;
  }

  /** Daftarkan satu skill; throw SkillValidationError bila tidak sah. */
  register(def: SkillDefinition): SkillDefinition {
    if (this.defs.has(def.id)) {
      throw new SkillValidationError('DUPLICATE_SKILL_ID', def.id, [
        `skill "${def.id}" sudah terdaftar`,
      ]);
    }
    const errors = validateSkillDefinition(def, this.catalog);
    if (errors.length > 0) {
      throw new SkillValidationError(errors[0].code, def.id, errors.map((e) => e.message));
    }
    // Simpan salinan beku agar definisi tidak berubah sesudah registrasi.
    // (Freeze dipakai sebagai efek samping, bukan lewat nilai kembalian
    // Object.freeze — nilai kembalian itu bertipe Readonly<> dan tidak
    // dapat di-assign ke SkillDefinition yang array-nya mutable.)
    const frozen: SkillDefinition = {
      ...def,
      triggers: [...def.triggers],
      allowedTools: [...def.allowedTools],
      allowedRoles: [...def.allowedRoles],
    };
    Object.freeze(frozen);
    Object.freeze(frozen.triggers);
    Object.freeze(frozen.allowedTools);
    Object.freeze(frozen.allowedRoles);
    this.defs.set(def.id, frozen);
    return frozen;
  }

  /** Daftarkan banyak skill sekaligus; gagal di definisi pertama yang tidak sah. */
  registerAll(defs: ReadonlyArray<SkillDefinition>): SkillDefinition[] {
    return defs.map((d) => this.register(d));
  }

  get(id: string): SkillDefinition | null {
    return this.defs.get(id) ?? null;
  }

  has(id: string): boolean {
    return this.defs.has(id);
  }

  list(): SkillDefinition[] {
    return [...this.defs.values()];
  }

  listEnabled(): SkillDefinition[] {
    return this.list().filter((d) => d.enabled);
  }

  /** Cari skill berdasarkan trigger (kind + value), mis. intent ChatIntent. */
  findByTrigger(kind: SkillDefinition['triggers'][number]['kind'], value: string): SkillDefinition[] {
    return this.list().filter((d) =>
      d.triggers.some((t) => t.kind === kind && t.value === value),
    );
  }

  /** Validasi ulang seluruh registry (gerbang startup). */
  validateAll(): Array<{ skillId: string; code: SkillValidationCode; message: string }> {
    const out: Array<{ skillId: string; code: SkillValidationCode; message: string }> = [];
    for (const def of this.defs.values()) {
      for (const e of validateSkillDefinition(def, this.catalog)) {
        out.push({ skillId: def.id, code: e.code, message: e.message });
      }
    }
    return out;
  }
}

/** Pabrik registry tervalidasi: throw bila ada definisi yang tidak sah. */
export function createValidatedRegistry(
  defs: ReadonlyArray<SkillDefinition>,
  catalog: ToolCatalog,
): SkillRegistry {
  const registry = new SkillRegistry(catalog);
  registry.registerAll(defs);
  return registry;
}
