/**
 * /api/invitations/list — Secure Invitation endpoint (Fase C).
 * Implementasi: api/_lib/invitations/handler.js + service.js.
 * Fail-closed: 503 NOT_CONFIGURED bila backend autentikasi/database
 * server-side belum dikonfigurasi. Tidak pernah mencatat token mentah.
 */
import { defaultHandlers } from '../_lib/invitations/handler.js';

export default defaultHandlers.list;
