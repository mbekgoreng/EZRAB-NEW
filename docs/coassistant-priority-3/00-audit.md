# EZRAB CoAssistant Priority 3 — Audit & Baseline Architecture

## 1. Scope
Audit kapabilitas AI konstruksi tingkat lanjut:
- Vision AI DED extraction & conflict detection.
- Deterministic QTO dari approved dataset.
- Multi-domain construction framework (Building, Road, Water, Civil).
- Scenario comparison & cost optimization advisor.
- Site photo progress monitoring.
- 3D Viewer stableId integration bridge.

## 2. Temuan & Batasan Keamanan
- Hasil ekstraksi Vision AI selalu berstatus `DRAFT` atau `NEEDS_REVIEW` sampai diverifikasi manusia.
- Tidak ada angka kalkulasi yang dibuat dari tebakan visual; seluruh QTO bersumber dari formula geometri resmi.
- Foto progres lapangan strictly berstatus `OBSERVATION (NOT VERIFIED)`.
