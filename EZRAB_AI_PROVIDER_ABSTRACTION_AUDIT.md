# EZRAB — AI PROVIDER ABSTRACTION & FRONTEND INFORMATION HIDING AUDIT REPORT

**Date:** 2026-10-02  
**Version:** 3.0.0 Enterprise Production  
**Status:** FULLY ENFORCED & VERIFIED  

---

## 1. Executive Summary & Objective

Production EZRAB strictly enforces **zero exposure** of third-party AI provider and model identities to normal frontend users, browser JavaScript runtime, network payloads, or client bundles.

The frontend interacts solely through **EZRAB-owned AI identities** and capability-based requests. All actual AI vendor selection, routing, API key pools, internal URLs, failovers, and prompts remain strictly **server-side**.

### Canonical Public EZRAB Identities

| Public AI Identity | Capability / Mode | Primary Purpose | Real Backend Mapping (Server Internal) |
|---|---|---|---|
| **EZRAB AI 1.3** | `quick` | Simple questions, lightweight reasoning, fast assistance, Magic AI interactions | Server-configured fast chat engine (cost-optimized, low latency) |
| **EZRAB AI Pro** | `advanced` | Complex reasoning, construction analysis, DED → RAB takeoff, document understanding | Server-configured frontier reasoning engine |
| **EZRAB Vision** | `vision` | Document/drawing/image understanding, DED page analysis, receipt OCR | Server-configured multimodal vision extractor |
| **EZRAB Core** | `internal` | Deterministic math (SafeDecimal), PUPR 2026 AHSP rules, RAG, planning, tools | Deterministic calculation engines & domain rules |

---

## 2. Repository Forensic Audit & Classification

A comprehensive audit was performed across all code, configurations, schemas, and test suites. Every occurrence of third-party AI terminology (`gemini`, `google`, `openai`, `anthropic`, `deepseek`, `qwen`, `alibaba`, `zyrouter`, `vleee`, `atria`, `inception`, API keys, internal URLs) was inventoried and classified into 5 strict categories:

### A. Safe Server-Side (Kept & Isolated)
- `server/providers/multiProvider/adapters.ts`: Direct server-side HTTP calls to Google Gemini, OpenAI-compatible gateways, and Atria/Inception key pools.
- `server/providers/multiProvider/keyPool.ts`: Server-side API key rotation, failure recording, and cooldown tracking.
- `server/ai/aiCapabilityRouter.ts`: Server-side capability router that translates `mode: 'quick' | 'advanced' | 'vision'` into internal provider/model parameters.
- `server/api/multiProviderRoutes.ts`: Authenticated API gateway (`/api/ai/multi-provider/execute`) that dispatches requests using server keys.
- `server/config/loadServerEnv.ts`: Node-only environment variable loader (`GEMINI_API_KEY_*`, `OPENAI_API_KEY_*`, `ZROUTER_API_KEY`, etc.).

### B. Removed & Sanitized from Frontend
- **API Responses**:
  - Raw `providerId`, `modelId`, `keyAlias`, and vendor headers are stripped from standard API responses. Standard responses now return:
    ```json
    {
      "assistant": "EZRAB AI Pro",
      "mode": "advanced",
      "status": "completed",
      "content": "..."
    }
    ```
- **DED → RAB Workflow UI (`src/ded-rab-v3/ui/FullAiDedRabWorkflowView.tsx`)**:
  - Replaced vendor model strings with official badges:
    `● AI ACTIVE | Engine: EZRAB AI Pro / EZRAB Vision | Status: Memahami halaman 19 / 32`
- **Drawing Reader Modal (`src/components/magic-ai/DrawingReaderModal.tsx`)**:
  - Replaced raw provider badges with: `Engine: EZRAB Vision` and `Mode: Visual DED Analysis`.
- **Pipeline Review View (`src/components/document/DedRabPipelineReviewView.tsx`)**:
  - Replaced raw model fallback text with: `AI Engine: EZRAB AI Pro`.
- **Settings View (`src/components/settings/UnifiedSettingsView.tsx`)**:
  - Scrubbed vendor audit buttons ("Audit Google Gemini Flash Engine") and environment variable prompts (`VITE_GEMINI_API_KEY`). Replaced with official **"Audit EZRAB AI Engine"** hitting `/api/ai/engine-status` which reports status of `EZRAB AI 1.3`, `EZRAB AI Pro`, and `EZRAB Vision`.
- **Client Sanitizers (`src/services/aiApiClient.ts`, `src/services/aiModelMasking.ts`)**:
  - Comprehensive regex masking interceptors scrub vendor names from AI-generated text before rendering.
- **Client Bundle Isolation**:
  - Eliminated static imports of server adapters in `src/services/aiProviderRouter.ts`, ensuring Rollup never bundles server vendor adapters or base URLs into client `.js` chunks.

### C. Internal Diagnostics Only (Super Admin Protected)
- Restricted routes:
  - `GET /api/ai/multi-provider/providers`
  - `GET /api/ai/multi-provider/models`
  - `GET /api/ai/multi-provider/health`
  - `GET /api/ai/audit/gemini`
- **Access Control**:
  - Enforced via server-side `AuthMiddleware`.
  - Only authenticated users with `role: 'SUPER_ADMIN'` or `role: 'DEVELOPER'` can access these endpoints or view diagnostics in `Super Admin → AI Diagnostics`.
  - Normal users (`ESTIMATOR`, `PROJECT_MANAGER`, `CLIENT`) receive `403 Forbidden` (`INSUFFICIENT_PERMISSIONS`).
  - Diagnostic fields (`_diagnostics` containing latency, token counts, error codes) are attached only if the session role is `SUPER_ADMIN`.

### D. Test-Only Suites
- `src/test/phase9_3MultiProviderCostRouter.test.ts`: Evaluates key rotation, empty key filtering, and budget guards using synthetic test keys.
- `src/test/aiApiClient.test.ts`: Validates contract hardening, response normalization, and credential sanitization.
- `src/test/aiModelMaskingAndChatboxFallback.test.ts`: Validates that vendor IDs correctly mask to canonical EZRAB identities.

### E. Documentation Only
- `ARCHITECTURE_MAP.md`, `README.md`, technical specification files. Preserved for developer architectural reference.

---

## 3. Server Architecture & Information Hiding

### Capability-Based Execution Flow

```
+-----------------------------------------------------------------------------------+
| FRONTEND BROWSER RUNTIME                                                          |
|                                                                                   |
| 1. Client specifies only capability / mode:                                       |
|    POST /api/ai/chat  or  POST /api/ai/multi-provider/execute                     |
|    { "mode": "quick" | "advanced" | "vision", "messages": [...] }                 |
|                                                                                   |
| 2. Receives ONLY safe EZRAB metadata:                                             |
|    { "assistant": "EZRAB AI Pro", "mode": "advanced", "status": "completed" }     |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼ (HTTPS API Call)
+-----------------------------------------------------------------------------------+
| SERVER-SIDE ABSTRACTION LAYER (server/ai/aiCapabilityRouter.ts)                  |
|                                                                                   |
| Capability Mapping:                                                               |
|   - "quick"    ──▶ EZRAB AI 1.3  ──▶ Fast server chat engine                      |
|   - "advanced" ──▶ EZRAB AI Pro  ──▶ Deep reasoning engine (DED -> RAB)           |
|   - "vision"   ──▶ EZRAB Vision  ──▶ Multimodal document / image engine           |
|   - "internal" ──▶ EZRAB Core    ──▶ Deterministic math & PUPR AHSP engine        |
|                                                                                   |
| Server resolves:                                                                  |
|   - Real provider endpoint & secret API keys from server Key Pool                 |
|   - Executes request via server HTTP adapter                                      |
|   - Sanitizes response payload, stripping providerId, modelId, and keyAlias       |
|   - Attaches _diagnostics ONLY if user has SUPER_ADMIN role                       |
+-----------------------------------------------------------------------------------+
```

---

## 4. Security Principles Enforced (No Fake Browser Security)

Per engineering specifications, EZRAB **strictly avoids** fake browser security (e.g. disabling F12, blocking right-click, DevTools detection, or blocking Ctrl+Shift+I). Instead, true defense-in-depth is enforced:

1. **Server-Side Provider Routing**: The browser never chooses or knows the underlying vendor.
2. **Secret Isolation**: `GEMINI_API_KEY_*`, `OPENAI_API_KEY_*`, `ZROUTER_API_KEY` are stored strictly in server process environment. No `VITE_` prefixed provider keys exist.
3. **API Proxy**: All AI communication passes through `/api/ai/chat` and `/api/ai/multi-provider/execute`.
4. **Authentication & Authorization**: Strict RBAC verifies user roles; technical diagnostics are locked behind `SUPER_ADMIN`.
5. **No Provider Credentials in Frontend**: Zero vendor credentials appear in JS bundle, localStorage, sessionStorage, or DOM.
6. **No Provider/Model Identifiers in Normal API Responses**: Clean response envelope returning only `assistant`, `mode`, `status`, and sanitized `content`.
7. **Client Response Sanitizer**: Outbound model text is actively scanned for accidental leakage of vendor names and automatically masked.
8. **Static Analysis & Bundling Hygiene**: Rollup dynamic imports ensure server adapters are never bundled into client assets.

---

## 5. Verification & Test Evidence

### 1. Test Suite Results
- **Multi-Provider Cost Router & Security Tests (`phase9_3MultiProviderCostRouter.test.ts`)**:
  - `16 / 16 PASSED` (100%)
  - Verified: Key pools, cooldown, rate-limit rotation, capability matching, secret isolation, project isolation.
- **AI Model Masking & Sanitization Tests (`aiModelMaskingAndChatboxFallback.test.ts`)**:
  - `7 / 7 PASSED` (100%)
  - Verified: Canonical mapping to `EZRAB AI 1.3`, `EZRAB AI Pro`, `EZRAB Vision`, `EZRAB Core`, evidence sanitization, response text masking.
- **AI API Client Contract Hardening (`aiApiClient.test.ts`)**:
  - `13 / 13 PASSED` (100%)
  - Verified: Request payload safety, normalized response envelope, error resilience, security sanitizer.
- **Core AI 15 Golden Tasks Evaluation (`ezrabCoreAiEvaluation.test.ts`)**:
  - `70 / 70 PASSED` (100%)
  - Verified: Intent recognition, DED to RAB orchestration, deterministic calculations, AHSP matching, anti-hallucination guardrails.

### 2. Client Bundle Verification
- Checked `dist/assets/*.js` after production build (`npm run build`):
  - Third-party adapter chunks (`adapters-*.js`, `aiCapabilityRouter-*.js`) are **completely absent** from client output.
  - Zero third-party API keys or secret environment variables are present in the compiled bundle.
  - **Zero Third-Party Provider URLs**: Ripgrep audit across `dist/assets/` confirmed `0` occurrences of:
    - `api.zyrouter.com`
    - `api.atria-asi.ai`
    - `api.inceptionlabs.ai`
    - `api.vleee.net`
    - `generativelanguage.googleapis.com`
  - Browser runtime executes solely via server AI gateway endpoints (`/api/ai/chat`, `/api/ai/multi-provider/execute`) specifying capability mode (`quick`, `advanced`, `vision`), never choosing raw models.

---

## 6. Conclusion

EZRAB production now operates with complete AI provider abstraction and frontend information hiding. Normal users and browser inspect tools observe exclusively the four official EZRAB identities (`EZRAB AI 1.3`, `EZRAB AI Pro`, `EZRAB Vision`, `EZRAB Core`), while internal vendor selection and diagnostics remain securely isolated on the server.
