/**
 * chatConversationStoreMultiTab.test.ts — WP02-DEFECT-1 (RELEASE BLOCKER):
 * race last-write-wins peta utuh di UnifiedConversationStore.
 *
 * Gaya plain-tsx: `npx --yes tsx src/test/chatConversationStoreMultiTab.test.ts`
 *
 * Dua "tab" = dua instance UnifiedConversationStore hidup bersamaan atas
 * SATU localStorage shim (konstruktor diakses lewat cast — private di TS,
 * tetapi inilah satu-satunya cara memegang dua tab simultan dalam satu
 * proses; singleton modul tidak dipakai langsung oleh tes ini).
 * Storage event lintas-tab disimulasikan dengan memanggil listener
 * `window` 'storage' yang didaftarkan hardenedStorage — jalur nyata
 * (onExternalStorageChange -> refreshFromStorage), bukan mock jalur.
 *
 * Perilaku yang di-pin:
 *  - tulis tab A + tulis tab B (proyek berbeda ATAU percakapan sama) ->
 *    keduanya bertahan di storage (repro A08/B18/C20);
 *  - tulis basi tidak menghapus yang baru (merge-on-save);
 *  - hapusan user tidak dibangkitkan tab basi (tombstone tersimpan);
 *  - append pasca-hapus menggantikan tombstone (fail-closed: aktivitas
 *    eksplisit yang lebih baru menang atas hapusan lama);
 *  - clearMessages tidak dibangkitkan simpan berikutnya;
 *  - perilaku satu-tab identik (byte storage == peta lokal, tanpa kunci
 *    tombstone bila tidak ada hapusan);
 *  - refresh eksternal menggabungkan pesan tab lain ke memori hidup.
 */

let passed = 0;
let failed = 0;
const failures: string[] = [];
async function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  PASS ${name}`);
  } catch (e: unknown) {
    failed += 1;
    const msg = e instanceof Error ? e.message : String(e);
    failures.push(name);
    console.log(`  FAIL ${name}: ${msg}`);
  }
}
const assert = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(msg);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ---------- localStorage + window shim (node) ---------- */
function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
    raw: map,
  };
}
const storage = makeStorage();
(globalThis as Record<string, unknown>).localStorage = storage;

// Shim window: store + safeStorage memakai window.localStorage;
// hardenedStorage memakai window.addEventListener('storage', ...).
const storageListeners = new Set<(e: { key: string | null; newValue: string | null }) => void>();
(globalThis as Record<string, unknown>).addEventListener = (
  type: string,
  fn: (e: { key: string | null; newValue: string | null }) => void,
) => {
  if (type === 'storage') storageListeners.add(fn);
};
(globalThis as Record<string, unknown>).removeEventListener = (
  type: string,
  fn: (e: { key: string | null; newValue: string | null }) => void,
) => {
  if (type === 'storage') storageListeners.delete(fn);
};
(globalThis as Record<string, unknown>).window = globalThis;

/** Kirim storage event ke SEMUA listener (tab penulis ikut menerima —
 *  no-op baginya karena saveToStorage sudah mengadopsi hasil merge). */
function fireStorageEvent(key: string): void {
  const ev = { key, newValue: storage.getItem(key) };
  for (const fn of Array.from(storageListeners)) fn(ev);
}

const CONV_KEY = 'ezrab_unified_conversations_v2';
const TOMB_KEY = 'ezrab_unified_conversations_v2_deleted';

type StoredConv = { id: string; projectId: string; messages: Array<{ id: string; content: string }> };
function readStored(): StoredConv[] {
  const raw = storage.getItem(CONV_KEY);
  if (!raw) return [];
  return JSON.parse(raw) as StoredConv[];
}
function storedConv(id: string): StoredConv | undefined {
  return readStored().find((c) => c.id === id);
}

async function main(): Promise<void> {
  console.log('chatConversationStoreMultiTab.test (WP02-DEFECT-1)');
  const mod = await import('../services/ai/conversation/unifiedConversationStore');
  const Ctor = mod.UnifiedConversationStore as unknown as new () => mod.UnifiedConversationStore;
  type Store = InstanceType<typeof Ctor>;

  const freshTabs = (): { tabA: Store; tabB: Store } => {
    storage.clear();
    // Singleton modul ikut me-refresh lewat listener-nya sendiri; reset
    // agar tidak membawa state antar-skenario.
    mod.UnifiedConversationStore.resetInstance();
    const tabA = new Ctor();
    const tabB = new Ctor();
    return { tabA, tabB };
  };
  const send = (tab: Store, convId: string, projectId: string, text: string) =>
    tab.appendMessage(convId, projectId, { role: 'user', content: text });

  // --- MT-01: repro A08 — dua tab, dua proyek, kirim bergantian -------
  await check('MT-01 dua tab dua proyek: kirim bergantian, keduanya bertahan di storage', () => {
    const { tabA, tabB } = freshTabs();
    const convA = tabA.createConversation('PRJ-MT-A', 'Percakapan A');
    const convB = tabB.createConversation('PRJ-MT-B', 'Percakapan B');
    // Tab B belum melihat conv A (dibuat sesudah konstruktor B) — persis
    // kondisi race: peta in-memory B basi.
    send(tabA, convA.id, 'PRJ-MT-A', 'Buatkan RAB jalan beton 2 km');
    fireStorageEvent(CONV_KEY);
    send(tabB, convB.id, 'PRJ-MT-B', 'Buatkan RAB jalan beton 1 km');
    fireStorageEvent(CONV_KEY);
    send(tabA, convA.id, 'PRJ-MT-A', 'lebar 6 m');
    fireStorageEvent(CONV_KEY);
    send(tabB, convB.id, 'PRJ-MT-B', 'budget 300jt');
    fireStorageEvent(CONV_KEY);
    const a = storedConv(convA.id);
    const b = storedConv(convB.id);
    assert(a && a.messages.length === 2, `conv A harus 2 pesan, dapat ${a?.messages.length}`);
    assert(b && b.messages.length === 2, `conv B harus 2 pesan, dapat ${b?.messages.length}`);
    assert(a.messages[0].content.includes('2 km'), 'pesan A#1 utuh');
    assert(b.messages[1].content.includes('300jt'), 'pesan B#2 utuh');
  });

  // --- MT-02: repro B18 — dua tab, percakapan aktif yang SAMA ---------
  await check('MT-02 dua tab satu percakapan: append silang di-union, tidak ada pesan hilang', () => {
    const { tabA, tabB } = freshTabs();
    const conv = tabA.createConversation('PRJ-MT-P', 'Percakapan P');
    fireStorageEvent(CONV_KEY); // B me-refresh: kini B memegang conv yang sama
    assert(tabB.getConversation(conv.id, 'PRJ-MT-P') !== null, 'B melihat percakapan sesudah refresh');
    send(tabA, conv.id, 'PRJ-MT-P', 'kandang 300jt');
    send(tabB, conv.id, 'PRJ-MT-P', 'kolam renang');
    fireStorageEvent(CONV_KEY);
    send(tabA, conv.id, 'PRJ-MT-P', 'lebar jalan 6 m');
    send(tabB, conv.id, 'PRJ-MT-P', 'pagar keliling');
    fireStorageEvent(CONV_KEY); // konvergensi butuh refresh terakhir di A
    const s = storedConv(conv.id);
    assert(s && s.messages.length === 4, `union harus 4 pesan, dapat ${s?.messages.length}`);
    const texts = s.messages.map((m) => m.content);
    for (const t of ['kandang 300jt', 'kolam renang', 'lebar jalan 6 m', 'pagar keliling']) {
      assert(texts.includes(t), `pesan "${t}" hilang dari union`);
    }
    // Urutan deterministik & konvergen: kedua tab melihat urutan sama.
    const orderA = tabA.getConversation(conv.id, 'PRJ-MT-P')!.messages.map((m) => m.id);
    const orderB = tabB.getConversation(conv.id, 'PRJ-MT-P')!.messages.map((m) => m.id);
    assert(JSON.stringify(orderA) === JSON.stringify(orderB), 'urutan pesan tidak konvergen antar-tab');
  });

  // --- MT-03: tulis basi tidak menghapus yang baru ---------------------
  await check('MT-03 tab basi yang menyimpan tidak menghapus percakapan baru tab lain', () => {
    const { tabA, tabB } = freshTabs();
    const convB = tabB.createConversation('PRJ-MT-B', 'Percakapan B');
    send(tabB, convB.id, 'PRJ-MT-B', 'pesan B yang baru');
    // Tab A TIDAK me-refresh (basi total) lalu membuat percakapan sendiri.
    const convA = tabA.createConversation('PRJ-MT-A', 'Percakapan A');
    send(tabA, convA.id, 'PRJ-MT-A', 'pesan A basi');
    const b = storedConv(convB.id);
    const a = storedConv(convA.id);
    assert(b && b.messages.length === 1, 'pesan baru B terhapus oleh simpan basi A');
    assert(a && a.messages.length === 1, 'pesan A tidak tersimpan');
  });

  // --- MT-04: hapusan tidak dibangkitkan simpan tab penghapus ---------
  await check('MT-04 hapusan tidak dibangkitkan oleh simpan berikutnya di tab yang sama', () => {
    const { tabA } = freshTabs();
    const conv = tabA.createConversation('PRJ-MT-A', 'Percakapan A');
    send(tabA, conv.id, 'PRJ-MT-A', 'pesan yang akan dihapus');
    assert(tabA.deleteConversation(conv.id, 'PRJ-MT-A') === true, 'delete melaporkan sukses');
    assert(storedConv(conv.id) === undefined, 'percakapan masih di storage sesudah hapus');
    const conv2 = tabA.createConversation('PRJ-MT-A', 'Percakapan A2');
    send(tabA, conv2.id, 'PRJ-MT-A', 'pesan baru sesudah hapus');
    assert(storedConv(conv.id) === undefined, 'hapusan dibangkitkan simpan berikutnya');
    assert(readStored().length === 1, 'storage harus hanya berisi percakapan baru');
  });

  // --- MT-05: hapusan tidak dibangkitkan simpan tab BASI ---------------
  await check('MT-05 hapusan tidak dibangkitkan oleh simpan tab basi yang masih memegang salinan', async () => {
    const { tabA, tabB } = freshTabs();
    const convX = tabA.createConversation('PRJ-MT-A', 'Percakapan X');
    send(tabA, convX.id, 'PRJ-MT-A', 'pesan X');
    fireStorageEvent(CONV_KEY); // B kini memegang X di memori
    assert(tabB.getConversation(convX.id, 'PRJ-MT-A') !== null, 'B harus memegang X sebelum hapus');
    await sleep(5); // pastikan deletedAt > updatedAt X
    assert(tabA.deleteConversation(convX.id, 'PRJ-MT-A') === true, 'delete melaporkan sukses');
    assert(storedConv(convX.id) === undefined, 'X masih di storage sesudah hapus');
    assert(storage.getItem(TOMB_KEY) !== null, 'tombstone tidak tersimpan di storage');
    // B TIDAK me-refresh (basi) lalu menyimpan percakapan lain.
    const convY = tabB.createConversation('PRJ-MT-B', 'Percakapan Y');
    send(tabB, convY.id, 'PRJ-MT-B', 'pesan Y dari tab basi');
    assert(storedConv(convX.id) === undefined, 'X dibangkitkan simpan tab basi');
    assert(storedConv(convY.id)?.messages.length === 1, 'pesan Y tidak tersimpan');
  });

  // --- MT-06: refresh eksternal menjatuhkan hapusan dari memori tab basi
  await check('MT-06 refresh eksternal menjatuhkan percakapan terhapus + emit CONVERSATION_DELETED', async () => {
    const { tabA, tabB } = freshTabs();
    const convX = tabA.createConversation('PRJ-MT-A', 'Percakapan X');
    send(tabA, convX.id, 'PRJ-MT-A', 'pesan X');
    fireStorageEvent(CONV_KEY);
    const events: string[] = [];
    tabB.subscribe((ev) => {
      if (ev.conversationId === convX.id) events.push(ev.type);
    });
    await sleep(5);
    tabA.deleteConversation(convX.id, 'PRJ-MT-A');
    fireStorageEvent(CONV_KEY); // B menerima event hapusan
    assert(tabB.getConversation(convX.id, 'PRJ-MT-A') === null, 'B masih memegang X sesudah refresh');
    assert(events.includes('CONVERSATION_DELETED'), `B tidak menerima CONVERSATION_DELETED (dapat: ${events})`);
  });

  // --- MT-07: append pasca-hapus menggantikan tombstone (fail-closed) ---
  await check('MT-07 append pasca-hapus dari tab lain menggantikan tombstone (pesan baru tidak hilang)', async () => {
    const { tabA, tabB } = freshTabs();
    const convX = tabA.createConversation('PRJ-MT-A', 'Percakapan X');
    send(tabA, convX.id, 'PRJ-MT-A', 'pesan lama X');
    fireStorageEvent(CONV_KEY);
    await sleep(5);
    tabA.deleteConversation(convX.id, 'PRJ-MT-A');
    // B tidak me-refresh; user di B mengirim ke X (aktivitas eksplisit
    // yang LEBIH BARU daripada hapusan) — pesan baru ini tidak boleh
    // hilang; konsekuensinya percakapan bangkit beserta pesan lamanya.
    await sleep(5);
    send(tabB, convX.id, 'PRJ-MT-A', 'pesan baru pasca-hapus');
    const s = storedConv(convX.id);
    assert(s !== undefined, 'append pasca-hapus hilang (tombstone membunuh pesan baru)');
    assert(s.messages.some((m) => m.content === 'pesan baru pasca-hapus'), 'pesan baru tidak ada di storage');
    assert(storage.getItem(TOMB_KEY) === null, 'tombstone tidak dicabut sesudah digantikan');
  });

  // --- MT-08: clearMessages tidak dibangkitkan --------------------------
  await check('MT-08 clearMessages: pesan lama tidak bangkit pada simpan berikutnya', () => {
    const { tabA } = freshTabs();
    const conv = tabA.createConversation('PRJ-MT-A', 'Percakapan A');
    send(tabA, conv.id, 'PRJ-MT-A', 'pesan lama 1');
    send(tabA, conv.id, 'PRJ-MT-A', 'pesan lama 2');
    tabA.clearMessages(conv.id, 'PRJ-MT-A');
    assert(storedConv(conv.id)?.messages.length === 0, 'storage tidak kosong sesudah clear');
    send(tabA, conv.id, 'PRJ-MT-A', 'pesan baru sesudah clear');
    const s = storedConv(conv.id);
    assert(s && s.messages.length === 1, `pesan lama bangkit sesudah clear (n=${s?.messages.length})`);
    assert(s.messages[0].content === 'pesan baru sesudah clear', 'isi pesan pasca-clear salah');
  });

  // --- MT-09: perilaku satu-tab identik ---------------------------------
  await check('MT-09 satu-tab: byte storage == peta lokal, tanpa kunci tombstone', () => {
    const { tabA } = freshTabs();
    const conv = tabA.createConversation('PRJ-MT-A', 'Percakapan A');
    send(tabA, conv.id, 'PRJ-MT-A', 'pesan satu');
    send(tabA, conv.id, 'PRJ-MT-A', 'pesan dua');
    tabA.updateConversationTitle(conv.id, 'PRJ-MT-A', 'Judul Baru');
    const stored = readStored();
    const local = tabA.listConversations('PRJ-MT-A');
    assert(stored.length === 1 && local.length === 1, 'jumlah percakapan tidak cocok');
    assert(
      JSON.stringify(stored[0]) === JSON.stringify(local[0]),
      'byte storage tidak identik dengan peta lokal satu-tab',
    );
    assert(storage.getItem(TOMB_KEY) === null, 'kunci tombstone muncul tanpa hapusan');
  });

  // --- MT-10: refresh eksternal menggabungkan pesan ke memori hidup -----
  await check('MT-10 refresh eksternal: tab pasif melihat pesan tab lain tanpa reload', () => {
    const { tabA, tabB } = freshTabs();
    const conv = tabA.createConversation('PRJ-MT-A', 'Percakapan A');
    fireStorageEvent(CONV_KEY);
    const events: string[] = [];
    tabB.subscribe((ev) => {
      if (ev.conversationId === conv.id) events.push(ev.type);
    });
    send(tabA, conv.id, 'PRJ-MT-A', 'pesan dari tab A');
    // B belum refresh: belum melihat pesan.
    assert(tabB.getConversation(conv.id, 'PRJ-MT-A')!.messages.length === 0, 'B melihat pesan sebelum refresh');
    fireStorageEvent(CONV_KEY);
    const seen = tabB.getConversation(conv.id, 'PRJ-MT-A')!;
    assert(seen.messages.length === 1, 'B tidak melihat pesan sesudah refresh');
    assert(seen.messages[0].content === 'pesan dari tab A', 'isi pesan refresh salah');
    assert(events.includes('CONVERSATION_UPDATED'), `B tidak menerima CONVERSATION_UPDATED (dapat: ${events})`);
  });

  // --- MT-11: storage rusak tidak memblokir simpan ----------------------
  await check('MT-11 storage rusak: simpan fail-closed ke peta lokal tanpa throw', () => {
    storage.clear();
    mod.UnifiedConversationStore.resetInstance();
    storage.setItem(CONV_KEY, '{bukan-json');
    const tabA = new Ctor();
    const conv = tabA.createConversation('PRJ-MT-A', 'Percakapan A');
    send(tabA, conv.id, 'PRJ-MT-A', 'pesan sesudah korup');
    const s = storedConv(conv.id);
    assert(s && s.messages.length === 1, 'simpan gagal sesudah storage korup');
    assert(tabA.getLastSaveResult()?.ok === true, 'lastSaveResult tidak ok sesudah fail-closed save');
  });

  console.log(`\nchatConversationStoreMultiTab: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(`FAILURES: ${failures.join(', ')}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
