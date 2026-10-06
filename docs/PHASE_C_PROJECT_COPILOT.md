# EZRAB PHASE C — PROJECT COPILOT ARCHITECTURE & IMPLEMENTATION SPECIFICATION

## 1. Executive Summary

EZRAB Phase C completes the transition from isolated AI experiments into an integrated, deterministic, and project-aware **EZRAB Project Copilot**.

Phase C directly resolves:
* **F-02: Floating CoAssistant ↔ MagicAiSuperView session asynchrony**: Both chat surfaces now share an authoritative, reactive conversation repository (`unifiedConversationStore.ts`) backed by an in-memory event bus and persistent project storage.
* **Unified AI Tool Orchestration**: Centralized AI Tool Registry (`aiToolRegistry.ts`) exposing 9 core construction tools with strict schema validation and 3-tier permission enforcement (`INFORMATION`, `SUGGESTION`, `ACTION`).
* **Zero-Hallucination & Fail-Closed Core Authority**: AI never guesses prices, formulas, or project facts. All numbers and updates route through deterministic EZRAB engines (`PriceResolver`, `Universal Calculator Engine`, `UnifiedProjectContext`, `ProjectFinanceRepository`, `LocalDocumentRepository`).
* **Safe Mutation Pipeline**: AI cannot directly mutate project databases. Every mutation generates a structured `AIActionProposal` requiring user approval, idempotency tracking, and immutable audit logging.
* **Deterministic Intent Matching & Regex Collision Fix**: Audited pattern matching resolves collisions (e.g. `pekerja` vs `pekerjaan`) without false-positive mutation triggers.

---

## 2. Architecture Overview

```text
USER INTERACTION SURFACES
┌─────────────────────────────────┐       ┌─────────────────────────────────┐
│  Floating CoAssistant Chatbox   │       │      Magic AI SuperView         │
└────────────────┬────────────────┘       └────────────────┬────────────────┘
                 │                                         │
                 └───────────────────┬─────────────────────┘
                                     │
                                     ▼
                   ┌───────────────────────────────────┐
                   │    Unified Conversation Store     │
                   │    - Reactive Event Bus           │
                   │    - Project Isolation Gate       │
                   │    - Multi-Turn Message State     │
                   └─────────────────┬─────────────────┘
                                     │
                                     ▼
                   ┌───────────────────────────────────┐
                   │     EZRAB Project Copilot         │
                   │       (Orchestration Layer)       │
                   └─────────────────┬─────────────────┘
                                     │
                                     ▼
                   ┌───────────────────────────────────┐
                   │        AI Tool Registry           │
                   │    - 3-Tier Permission Matrix     │
                   │    - Input Schema Validation      │
                   │    - Provenance Tracking          │
                   └───────┬───────────┬───────────────┘
                           │           │
         ┌─────────────────┘           └─────────────────┐
         ▼                                               ▼
┌──────────────────┐                           ┌──────────────────┐
│ INFORMATION /    │                           │ ACTION (MUTATION)│
│ SUGGESTION       │                           │ - Proposal Gate  │
│ (Read-Only)      │                           │ - User Approval  │
│ - getProjectCtx  │                           │ - Idempotency    │
│ - getRabTotal    │                           │ - Audit Log      │
│ - getRabGroup    │                           └────────┬─────────┘
│ - resolvePrice   │                                    │
│ - calculateQty   │                                    ▼
│ - searchAHSP     │                           ┌──────────────────┐
│ - getDocStatus   │                           │ Action Executor  │
│ - getFinance     │                           └────────┬─────────┘
└────────┬─────────┘                                    │
         │                                              │
         └───────────────────────┬──────────────────────┘
                                 │
                                 ▼
                   ┌───────────────────────────────────┐
                   │        EZRAB CORE ENGINES         │
                   │  - Pricing Engine (Tier 1-4)      │
                   │  - Document Engine                │
                   │  - QTO / Parametric Calc Engine   │
                   │  - Finance Engine                 │
                   └─────────────────┬─────────────────┘
                                     │
                                     ▼
                   ┌───────────────────────────────────┐
                   │      PROJECT SOURCE OF TRUTH      │
                   └───────────────────────────────────┘
```

---

## 3. Resolution of F-02 (Conversation Synchronization)

### The Problem
In legacy versions, `EzrabCoAssistantChatbox.tsx` and `MagicAiSuperView.tsx` maintained distinct conversation states. Messages typed into the floating assistant did not appear in the SuperView, creating split context and user confusion.

### The Solution
1. **Canonical Conversation Model (`conversationTypes.ts`)**:
   - `AIConversation`: Has `id`, `projectId`, `messages`, `contextSnapshot`, timestamps.
   - `AIMessage`: Carries role, badges, tool calls, tool results, and proposal payloads.
2. **Authoritative Store (`unifiedConversationStore.ts`)**:
   - Both surfaces access the singleton `unifiedConversationStore`.
   - Any message appended or updated dispatches events (`MESSAGE_CREATED`, `MESSAGE_UPDATED`, `ACTION_PROPOSED`, etc.).
   - Both surfaces subscribe to the store and re-render in real time.
3. **Seamless Transition Controls**:
   - Header button in `EzrabCoAssistantChatbox` enables `onOpenSuperView(conversationId)`.
   - Header button in `MagicAiSuperView` enables `onOpenFloatingChat(conversationId)`.

---

## 4. Centralized AI Tool Registry & 3-Tier Permissions

### Permission Matrix
| Category | Mode | Mutation Allowed | Approval Required | Execution Behavior |
| :--- | :--- | :---: | :---: | :--- |
| **INFORMATION** | `information` | **No** | **No** | Immediate read-only execution from Core |
| **SUGGESTION** | `suggestion` | **No** | **No** | Immediate analysis/warning generation |
| **ACTION** | `action` | **Yes** | **YES (Strict Gate)** | Generates `AIActionProposal` with `PENDING` status; zero DB mutation until explicit user approval |

### Registered Core Tools
1. `getProjectContext`: Fetches isolated context across all construction domains.
2. `getRabTotal`: Computes deterministic grand total and item count from active RAB.
3. `getRabGroup`: Retrieves item breakdown and subtotal for specific work categories (Struktur, Arsitektur, etc.).
4. `calculateQuantity`: Deterministic parametric volume computation (L × W × H, area, unit conversion) without NaN drift.
5. `resolvePrice`: Queries hierarchical price resolution engine (Project Override → Project Price → Master DB → Regional → Fail Closed).
6. `searchAHSP`: Searches authoritative PUPR AHSP database for valid codes and coefficients.
7. `getFinanceSummary`: Evaluates contract value, cashflow, and variance via `ProjectFinanceRepository`.
8. `getDocumentStatus`: Audits status and completeness of standard project documents against `DOCUMENT_REGISTRY`.
9. `proposeAddRabItem`: Generates formal `AIActionProposal` for work additions without auto-mutating source of truth.

---

## 5. Fail-Closed Project Isolation

Every conversation and tool invocation strictly checks:
```ts
if (!context.projectId || context.projectId.trim() === '') {
  throw new ProjectIsolationError('MISSING_PROJECT_ID', 'Project ID is required.');
}
if (conversation.projectId !== context.projectId) {
  throw new ProjectIsolationError(
    'CROSS_PROJECT_BREACH',
    `Conversation ${conversation.id} belonging to project ${conversation.projectId} cannot access context of project ${context.projectId}`
  );
}
```
Cross-project context leakage immediately fails closed and is logged.

---

## 6. Action Safety, Idempotency & Audit Trail

### User Approval Flow
1. **Proposal Generation**: Tool returns `proposal` with before/after state, confidence, and source provenance.
2. **Preview UI**: Renders an interactive Action Proposal card with `Setujui` and `Tolak` buttons.
3. **Approval Verification**: `aiActionExecutor.executeApprovedAction` verifies `approval.approved === true`.
4. **Idempotency Check**: Uses `idempotencyKey` (`conversationId:messageId:toolCallId`). Duplicate submissions return cached result with `IDEMPOTENCY_DUPLICATE` without applying duplicate mutations.
5. **Audit Trail**: Every action transition (`PENDING`, `APPROVED`, `REJECTED`, `EXECUTED`) is recorded in `aiActionAudit` with timestamps, userId, toolName, and arguments.

---

## 7. Deterministic Intent Routing & Regex Collision Fix

In `aiProviderEngine.ts`, regex patterns for labor wage queries (`pekerja`) previously collided with work item queries (`pekerjaan`):
* Audited word boundary checks and intent prioritization ensure queries like `"berapa upah pekerja"` trigger labor AHSP queries.
* Queries like `"tambahkan pekerjaan keramik"` trigger action proposals.
* Labor information queries are strictly prevented from generating accidental mutation proposals.

---

## 8. Verification & Test Coverage

All test suites pass simultaneously:
* **TypeScript Compilation**: 0 errors (`npx tsc --noEmit`).
* **Core Test Suite**: 74/74 tests PASS (`npm test`).
* **Phase B Test Suite**: 18/18 tests PASS (`npm run test:phaseB`).
* **Phase C Test Suite**: 71/71 tests PASS (`npm run test:phaseC`).
