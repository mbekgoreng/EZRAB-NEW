/**
 * EZRAB service worker — jembatan notifikasi browser (fase 1: TANPA push server).
 *
 * Tugas file ini hanya dua:
 * 1. Membuat `registration.showNotification()` tersedia (Chrome/Android mewajibkan
 *    notifikasi dari service worker; halaman tidak boleh memakai `new Notification`
 *    saja di sana).
 * 2. Menangani klik notifikasi: fokuskan tab EZRAB yang sudah ada dan kirim pesan
 *    { type: 'ezrab-navigate', menu } ke client; bridge di halaman
 *    (src/notifications/browserNotify.ts) meneruskannya ke navigasi aplikasi —
 *    jalur yang sama persis dengan klik item di lonceng notifikasi.
 *
 * BATAS FASE INI: tidak ada Push API / push subscription / backend push.
 * Notifikasi hanya menjangkau selama aplikasi terbuka di tab mana pun pada
 * browser yang sama (termasuk tab background). Backend push butuh endpoint
 * server baru — tertahan batas 12 Serverless Function Vercel Hobby (sudah
 * penuh) dan keputusan owner menunda backend.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const link = typeof data.link === 'string' && data.link ? data.link : null;

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of windowClients) {
        if ('focus' in client) {
          await client.focus();
          // Halaman yang menerima pesan ini menavigasi ke menu tujuan lewat
          // handler yang terdaftar di bridge (jalur klik lonceng).
          client.postMessage({ type: 'ezrab-navigate', menu: link });
          return;
        }
      }
      // Tidak ada tab EZRAB terbuka: buka workspace; menu tujuan tidak bisa
      // dipulihkan dari cold start (state menu hidup di halaman, bukan URL).
      if (self.clients.openWindow) {
        await self.clients.openWindow('/app');
      }
    })(),
  );
});
