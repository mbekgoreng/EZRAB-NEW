# EZRAB routing architecture

## Audit (before normalisation)

- **Stack:** React 19, Vite 6, TypeScript. No routing library is installed.
- **Existing route system:** `WorkspaceView` owns a local `activeMenu` string. Public navigation uses fragments and `App` persists a `viewMode` in local storage.
- **Project context:** `ProjectContext` is the current state boundary. It persists `currentProjectId` and project data in browser storage, but has no URL synchronisation.
- **Auth:** `AuthModal` is a client-side demonstration modal, with no session, API, middleware, server guard, role model, or entitlement service.
- **Errors/guards:** there are no meaningful 404, 403, project-access, or route guard states.

## Canonical routes implemented now

| Scope | Canonical route | Current module |
| --- | --- | --- |
| Global | `/app/projects` | Manajemen Proyek |
| Global | `/app/dashboard` | Portfolio dashboard |
| Project | `/app/projects/:projectId` | Project dashboard |
| Project | `/estimate` | Estimator Spreadsheet |
| Project | `/estimate?view=work-items` | Daftar Pekerjaan |
| Project | `/qto` / `?view=calculator` | QTO / Volume Calculator |
| Project | `/ahsp` | AHSP |
| Project | `/resources?type=material|labor|equipment|suppliers` | Resource Library |
| Project | `/schedule`, `/curve-s` | Planning views |
| Project | `/reports/rab|boq|recap|ahsp` | Laporan subviews |
| Project | `/ai` | Existing full AI workspace (secondary) |
| Account | `/app/account/preferences` | Existing Pengaturan page |

## Migration table

| Previous menu state | Canonical URL |
| --- | --- |
| `rab-estimasi` | `/app/projects/:projectId/estimate` |
| `qto`, `qto-vc` | `/app/projects/:projectId/qto` or `?view=calculator` |
| `ahsp-2026` | `/app/projects/:projectId/ahsp` |
| `database-material`, `database-upah`, `database-alat` | `/app/projects/:projectId/resources?type=…` |
| `boq`, `rekapitulasi`, `laporan` | `/app/projects/:projectId/reports/…` |
| `manajemen-proyek` | `/app/projects/:projectId` |
| `pengaturan` | `/app/account/preferences` |

## Deliberate limits

Authentication and authorisation are not claimed as implemented: the current app has no real identity/session or server/API boundary. The browser route layer validates project existence locally and reserves typed guard/entitlement seams, but server-side project authorisation must be added with the future backend.

`/cashflow`, billing, referrals, project settings, and account profile are intentionally not created because the product has no corresponding real UI yet.
