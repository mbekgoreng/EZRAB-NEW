/**
 * api/_lib/invitations/email.js — abstraksi email undangan (Fase F).
 *
 * Audit Fase A: repo TIDAK memiliki provider email transaksional apa pun
 * (tidak ada Resend/SendGrid/Nodemailer/SMTP di package.json maupun kode).
 * Karena itu:
 *
 * - Provider default = MockEmailProvider ("sink"): TIDAK mengirim apa pun
 *   ke luar; ia mencatat percobaan ke outbox in-memory dan melaporkan
 *   delivered=false. Status email undangan karena itu tetap 'not_sent'
 *   (atau 'failed' bila percobaan dinyatakan gagal) — TIDAK PERNAH 'sent'
 *   palsu.
 * - ResendEmailProvider tersedia dan hanya aktif bila RESEND_API_KEY dan
 *   EMAIL_FROM sama-sama diset di env server. `delivered=true` hanya bila
 *   API Resend menjawab 2xx dengan id pesan. Sender HARUS dari domain yang
 *   sudah diverifikasi di Resend oleh pemilik (mis. no-reply@ezrab.site) —
 *   kode ini tidak dapat dan tidak mengklaim memverifikasi domain.
 * - Token mentah hanya muncul di badan email (tujuan sahnya) dan TIDAK
 *   PERNAH ditulis ke log oleh modul ini.
 */

export function renderInvitationEmail({ inviteeName, companyName, role, link, expiresAtIso }) {
  const firstName = String(inviteeName || '').trim() || 'Bapak/Ibu';
  const expiryText = new Date(expiresAtIso).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta', dateStyle: 'full', timeStyle: 'short',
  });
  const subject = `Undangan bergabung ke ${companyName} di EZRAB`;
  const text = [
    `Halo ${firstName},`,
    '',
    `Anda diundang bergabung ke workspace ${companyName} di EZRAB sebagai ${role}.`,
    '',
    `Terima undangan (berlaku sampai ${expiryText} WIB, 24 jam sejak dikirim):`,
    link,
    '',
    'Jika Anda tidak mengharapkan undangan ini, abaikan email ini dan hubungi administrator workspace Anda.',
    '',
    '— Tim EZRAB',
  ].join('\n');
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1e293b;line-height:1.6">
<p>Halo ${escapeHtml(firstName)},</p>
<p>Anda diundang bergabung ke workspace <strong>${escapeHtml(companyName)}</strong> di EZRAB sebagai <strong>${escapeHtml(role)}</strong>.</p>
<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="background:#2563eb;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700">Terima Undangan</a></p>
<p>Undangan berlaku sampai ${escapeHtml(expiryText)} WIB (24 jam sejak dikirim).</p>
<p>Jika Anda tidak mengharapkan undangan ini, abaikan email ini dan hubungi administrator workspace Anda.</p>
<p>— Tim EZRAB</p>
</body></html>`;
  return { subject, text, html };
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** Sink lokal: tidak mengirim email sungguhan. */
export class MockEmailProvider {
  constructor() {
    this.name = 'mock-sink';
    this.outbox = [];
  }

  async sendInvitationEmail(payload) {
    const rendered = renderInvitationEmail(payload);
    // Token TIDAK dicatat: outbox hanya menyimpan metadata aman.
    this.outbox.push({
      to: payload.to,
      subject: rendered.subject,
      at: new Date().toISOString(),
      delivered: false,
      reason: 'mock_provider_no_real_send',
    });
    return { delivered: false, status: 'not_sent', provider: this.name, reason: 'mock_provider_no_real_send' };
  }
}

/** Provider Resend — aktif hanya dengan env lengkap; tidak dipakai di tes. */
export class ResendEmailProvider {
  constructor(env = process.env, fetchImpl = fetch) {
    this.name = 'resend';
    this.apiKey = String(env.RESEND_API_KEY || '').trim();
    this.from = String(env.EMAIL_FROM || '').trim();
    this.fetchImpl = fetchImpl;
  }

  static isConfigured(env = process.env) {
    return Boolean(String(env.RESEND_API_KEY || '').trim() && String(env.EMAIL_FROM || '').trim());
  }

  async sendInvitationEmail(payload) {
    if (!this.apiKey || !this.from) {
      return { delivered: false, status: 'failed', provider: this.name, reason: 'provider_not_configured' };
    }
    const rendered = renderInvitationEmail(payload);
    try {
      const res = await this.fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: this.from,
          to: [payload.to],
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
        }),
      });
      if (!res.ok) {
        return { delivered: false, status: 'failed', provider: this.name, reason: `provider_http_${res.status}` };
      }
      const data = await res.json().catch(() => null);
      if (!data || !data.id) {
        return { delivered: false, status: 'failed', provider: this.name, reason: 'provider_no_message_id' };
      }
      return { delivered: true, status: 'sent', provider: this.name, messageId: data.id };
    } catch {
      return { delivered: false, status: 'failed', provider: this.name, reason: 'provider_network_error' };
    }
  }
}

/** Pilih provider dari env: Resend bila terkonfigurasi penuh, else sink. */
export function getEmailProvider(env = process.env) {
  if (ResendEmailProvider.isConfigured(env)) return new ResendEmailProvider(env);
  return new MockEmailProvider();
}
