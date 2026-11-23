/**
 * I11 — Vision enablement gate (Stage 2).
 *
 * THE production safety lock for the DED drawing-vision layer. Vision
 * calls cost paid provider tokens, so the layer must be impossible to
 * switch on from production UI or by accident. Three locks, all required:
 *
 *   1. CALLER OPT-IN — the service caller passes `visionEnabled: true`.
 *      No production caller does today (grep-proven 2026-11-22: only
 *      tests pass it, and only to `runVisionForDedService` directly).
 *      There is NO UI toggle for this option anywhere, by design.
 *   2. ENV FLAG — `VITE_DED_VISION_ENABLED` must be exactly `'true'`.
 *      Absent / any other value = OFF (default false). In a Vite browser
 *      build the value is baked in at BUILD time from the build
 *      environment — it is not readable from localStorage, a query
 *      parameter, or any user-controlled input, so no user action can
 *      set it. In Node/tsx (tests, pilot harness) it is read from
 *      `process.env` at runtime.
 *   3. NON-PRODUCTION RUNTIME — the runtime must NOT be production:
 *      Vite `import.meta.env.PROD` is false, AND `NODE_ENV` /
 *      `VERCEL_ENV` / `APP_ENV` are not `'production'`. This lock is
 *      INDEPENDENT of the flag: even if someone sets
 *      `VITE_DED_VISION_ENABLED=true` in Vercel Production env vars, a
 *      production build still has `PROD === true` and the gate stays
 *      shut. A misconfigured flag can never open vision in production.
 *
 * WHERE THE GATE LIVES — the SERVICE layer only (ded-ai-estimate and
 * ded-full-ai services, the production entry surface). The pipeline
 * entry `runVisionForDedService` keeps its pure boolean gate
 * (`visionEnabled === true`) untouched: it is the test seam (the
 * pipeline suite drives it directly with stub responders and no env
 * var), and the pilot harness drives it directly with explicit
 * authorization. The services are the only production callers of the
 * pipeline entry, and they apply this gate before passing `true` down.
 *
 * HOW TO ENABLE (pilot / test only):
 *   - Node/tsx (pilot harness, tests):
 *       VITE_DED_VISION_ENABLED=true NODE_ENV=test npx tsx <script>
 *     (NODE_ENV unset also works — only the literal value
 *     'production' closes the gate — but set NODE_ENV=test explicitly
 *     so the intent is visible.)
 *   - Browser dev server: put `VITE_DED_VISION_ENABLED=true` in the
 *     dev `.env` and run `vite dev` (PROD is false there).
 *   - Vercel Preview / Production: CANNOT be enabled — production
 *     builds have PROD === true, so the gate stays shut regardless of
 *     the flag. Enabling vision on a deployment needs a code change
 *     (and an owner decision), never an env-var flip.
 */

export const DED_VISION_ENV_VAR = 'VITE_DED_VISION_ENABLED';

/**
 * Read one env var across runtimes. Node/tsx first (`process.env`),
 * then Vite (`import.meta.env`, build-time inlined). Both reads are
 * guarded — neither global is guaranteed in the other runtime.
 * Returns undefined when the var is absent in both.
 */
export function readVisionEnvVar(name: string): string | undefined {
  try {
    const nodeEnv =
      typeof process !== 'undefined' && process && typeof process.env === 'object'
        ? (process.env as Record<string, string | undefined>)
        : undefined;
    if (nodeEnv && typeof nodeEnv[name] === 'string') return nodeEnv[name];
  } catch {
    /* process.env unreadable in this runtime — fall through to import.meta */
  }
  try {
    const viteEnv =
      typeof import.meta !== 'undefined' && import.meta && typeof (import.meta as { env?: unknown }).env === 'object'
        ? ((import.meta as { env: Record<string, string | undefined> }).env as Record<
            string,
            string | undefined
          >)
        : undefined;
    if (viteEnv && typeof viteEnv[name] === 'string') return viteEnv[name];
  } catch {
    /* import.meta.env unreadable in this runtime */
  }
  return undefined;
}

/**
 * True when the runtime is a production runtime, by ANY signal:
 * Vite build mode (`import.meta.env.PROD`), or a production marker in
 * the process environment (`NODE_ENV` / `VERCEL_ENV` / `APP_ENV`).
 * Unknown/absent signals do NOT count as production — the flag (lock 2)
 * still has to be set explicitly, so an unknown runtime cannot enable
 * vision by accident either.
 */
export function isProductionRuntime(): boolean {
  try {
    const viteEnv =
      typeof import.meta !== 'undefined' && import.meta && typeof (import.meta as { env?: unknown }).env === 'object'
        ? ((import.meta as { env: Record<string, unknown> }).env as Record<string, unknown>)
        : undefined;
    if (viteEnv && viteEnv.PROD === true) return true;
  } catch {
    /* ignore — fall through to process.env signals */
  }
  const nodeEnv = readVisionEnvVar('NODE_ENV');
  if (nodeEnv === 'production') return true;
  if (readVisionEnvVar('VERCEL_ENV') === 'production') return true;
  if (readVisionEnvVar('APP_ENV') === 'production') return true;
  return false;
}

/**
 * Locks 2 + 3: the environment arms vision only when the flag is
 * exactly `'true'` AND the runtime is not production. Default: false.
 * Pure (reads env at call time — no cached state, so a test can flip
 * the env between calls).
 */
export function isVisionEnvironmentEnabled(): boolean {
  if (readVisionEnvVar(DED_VISION_ENV_VAR) !== 'true') return false;
  if (isProductionRuntime()) return false;
  return true;
}

/**
 * The service-layer gate: all three locks. `requested` is the caller's
 * `options.visionEnabled`. Returns true only when the caller asked AND
 * the environment arms vision (flag + non-production runtime).
 */
export function resolveVisionEnabled(requested: boolean | undefined): boolean {
  if (requested !== true) return false;
  return isVisionEnvironmentEnabled();
}

/**
 * Human-readable reason the gate is closed (for warnings/logs), or null
 * when the gate is open. Never reveals env values — only which lock
 * failed.
 */
export function visionGateClosedReason(requested: boolean | undefined): string | null {
  if (requested !== true) return 'caller did not request vision (visionEnabled !== true)';
  if (readVisionEnvVar(DED_VISION_ENV_VAR) !== 'true') {
    return `env flag ${DED_VISION_ENV_VAR} is not exactly 'true'`;
  }
  if (isProductionRuntime()) return 'production runtime — vision cannot be enabled in production';
  return null;
}
