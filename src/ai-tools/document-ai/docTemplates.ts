/**
 * AI DOKUMEN — Template & Variabel (Fase B4 Paper System + Perbaikan
 * Template Profesional).
 *
 * Satu struktur template menjadi sumber bagi: form input (field dinamis,
 * termasuk field bergantung subjenis), instruksi AI (scaffold + aiGuidance),
 * contoh dokumen profesional (sampleHtml, data dummy bertanda CONTOH), dan
 * ekspor (contoh memakai HTML yang sama dengan editor → paperModel →
 * PDF/DOCX, jadi tidak ada format terpisah yang bisa berbeda hasil).
 *
 * Aturan kejujuran (master prompt §2):
 * - Nomor dokumen, nama pihak, tanggal, nilai, dan persetujuan HANYA dari
 *   input pengguna; AI dilarang mengarang (lihat aiGuidance per template).
 * - Tidak ada nomor SNI/pasal/toleransi yang dikarang. Metadata `reference`
 *   membedakan acuan administrasi proyek, ketentuan kontrak, dan standar
 *   teknis; status verifikasinya dinyatakan apa adanya.
 * - Contoh dokumen adalah data dummy yang DITANDAI JELAS sebagai CONTOH dan
 *   tidak pernah menyatakan pekerjaan selesai/disertujui/lulus uji.
 *
 * Kompatibilitas: id 12 template lama tidak berubah; draf lama dan Template
 * Saya tetap berjalan (field/subtype/reference/sampleHtml semuanya opsional).
 */

export interface DocFieldDef {
  key: string;
  label: string;
  required?: boolean;
  type?: 'text' | 'date' | 'textarea' | 'select';
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  /** Bila diisi, field hanya tampil untuk subjenis-subjenis ini. */
  subtypeIds?: string[];
}

export type TemplateVerification = 'terverifikasi' | 'sebagian' | 'belum-terverifikasi';

/** Metadata acuan dokumen — dinyatakan jujur, tidak diklaim sebagai SNI. */
export interface TemplateReference {
  sourceName: string;
  /** Nomor dokumen/standar HANYA bila benar-benar ada & terverifikasi. */
  sourceRef?: string;
  verification: TemplateVerification;
  scope: string;
  reviewedAt: string;
}

export function referenceStatusLabel(v: TemplateVerification): string {
  return v === 'terverifikasi' ? 'Terverifikasi' : v === 'sebagian' ? 'Sebagian terverifikasi' : 'Belum terverifikasi';
}

export interface DocSubtype {
  id: string;
  label: string;
  /** Field tambahan khusus subjenis ini (di luar field dasar template). */
  fields?: DocFieldDef[];
  scaffold: string;
  aiGuidance?: string;
  sampleHtml: string;
}

export interface DocTemplateMeta {
  id: string;
  fields: DocFieldDef[];
  /** Instruksi struktur dokumen untuk AI (kerangka bagian). */
  scaffold: string;
  /** Larangan & aturan isi untuk AI (anti fakta karangan). */
  aiGuidance?: string;
  /** Metadata acuan + status verifikasi. */
  reference?: TemplateReference;
  /** Subjenis dengan field/scaffold/contoh sendiri. */
  subtypes?: DocSubtype[];
  /** Contoh dokumen lengkap (template tanpa subjenis). */
  sampleHtml?: string;
}

/** Baris penanda wajib di awal setiap contoh dokumen. */
export const CONTOH_BANNER_HTML =
  '<p><strong>CONTOH</strong> — seluruh nama, nomor, tanggal, dan nilai pada dokumen ini adalah data dummy untuk menunjukkan struktur. Ganti dengan data sebenarnya sebelum dokumen dipakai secara resmi.</p>';

/** Resolusi template efektif untuk satu subjenis terpilih. */
export function resolveTemplate(meta: DocTemplateMeta, subtypeId?: string): DocTemplateMeta {
  const sub = meta.subtypes?.find((s) => s.id === subtypeId) ?? meta.subtypes?.[0];
  if (!sub) return meta;
  const activeId = sub.id;
  // Field subjenis aktif kehilangan penanda subtypeIds-nya: pada template
  // hasil resolusi field itu berlaku tanpa syarat (divalidasi & dirender).
  const fields = [
    ...meta.fields
      .filter((f) => !f.subtypeIds || f.subtypeIds.includes(activeId))
      .map((f) => {
        const { subtypeIds: _drop, ...rest } = f;
        return rest;
      }),
    ...(sub.fields ?? []),
  ];
  return {
    id: meta.id,
    fields,
    scaffold: sub.scaffold,
    aiGuidance: [meta.aiGuidance, sub.aiGuidance].filter(Boolean).join(' '),
    reference: meta.reference,
    sampleHtml: sub.sampleHtml,
  };
}

export function subtypeLabel(meta: DocTemplateMeta, subtypeId?: string): string {
  const sub = meta.subtypes?.find((s) => s.id === subtypeId) ?? meta.subtypes?.[0];
  return sub?.label ?? '';
}

/* ------------------------------------------------------------------ */
/* Field bersama                                                       */
/* ------------------------------------------------------------------ */

const F_NOMOR: DocFieldDef = { key: 'nomorDokumen', label: 'Nomor Dokumen', required: true, placeholder: 'mis. 012/BA/X/2026' };
const F_TANGGAL: DocFieldDef = { key: 'tanggalDokumen', label: 'Tanggal Dokumen', required: true, type: 'date' };
const F_LOKASI: DocFieldDef = { key: 'lokasi', label: 'Lokasi Pekerjaan', placeholder: 'Alamat / lokasi proyek' };
const F_PIHAK1: DocFieldDef = { key: 'pihakPertama', label: 'Pihak Pertama (nama & jabatan)', placeholder: 'mis. PT ABC — Direktur Proyek' };
const F_PIHAK2: DocFieldDef = { key: 'pihakKedua', label: 'Pihak Kedua (nama & jabatan)', placeholder: 'mis. CV XYZ — Site Manager' };
const F_NOKONTRAK: DocFieldDef = { key: 'nomorKontrak', label: 'Nomor Kontrak / SPK (bila ada)', placeholder: 'Nomor kontrak yang menjadi dasar dokumen' };

const REVIEWED = '2026-10-22';
const REF_ADMIN: TemplateReference = {
  sourceName: 'Praktik administrasi proyek konstruksi Indonesia (dokumen berbasis kontrak/SPK)',
  verification: 'sebagian',
  scope: 'Format administrasi — BUKAN format yang diatur SNI. Struktur mengikuti praktik umum administrasi proyek dan harus disesuaikan dengan dokumen kontrak, ketentuan instansi, dan SOP organisasi.',
  reviewedAt: REVIEWED,
};

/* ------------------------------------------------------------------ */
/* Pembangun contoh (data dummy, bertanda CONTOH)                      */
/* ------------------------------------------------------------------ */

const TTD2 = (kiri: string, kanan: string): string =>
  `<table><tbody><tr><td>${kiri}<br><br><br><br>( Nama jelas &amp; tanda tangan )</td><td>${kanan}<br><br><br><br>( Nama jelas &amp; tanda tangan )</td></tr></tbody></table>`;

function baSample(o: {
  judul: string;
  nomor: string;
  uraianJudul: string;
  uraian: string;
  tabel?: string;
  catatan: string;
}): string {
  return [
    CONTOH_BANNER_HTML,
    `<h1 style="text-align: center">${o.judul}</h1>`,
    `<p style="text-align: center">Nomor: ${o.nomor}</p>`,
    '<p>Pada hari ini, Kamis, tanggal dua puluh dua Oktober tahun dua ribu dua puluh enam (22-10-2026), bertempat di lokasi Proyek Pembangunan Rumah Tinggal 2 Lantai (contoh), kami yang bertanda tangan di bawah ini:</p>',
    '<p><strong>PIHAK PERTAMA</strong> — A. Contoh, ST, Site Manager PT Contoh Konstruksi, bertindak untuk dan atas nama kontraktor pelaksana.</p>',
    '<p><strong>PIHAK KEDUA</strong> — B. Teladan, ST, Pengawas Lapangan PT Contoh Konsultan, bertindak untuk dan atas nama konsultan pengawas.</p>',
    '<h2>A. Dasar Pelaksanaan</h2>',
    '<ol><li>Kontrak/SPK Nomor 045/SPK/CONTOH/X/2026 (dummy).</li><li>Gambar kerja dan spesifikasi teknis yang disetujui para pihak.</li><li>Instruksi lapangan yang tercatat pada laporan harian terkait.</li></ol>',
    '<h2>B. Maksud dan Tujuan</h2>',
    `<p>Berita acara ini dibuat untuk mencatat secara tertulis ${o.uraianJudul} agar menjadi acuan administrasi para pihak.</p>`,
    `<h2>C. ${o.uraianJudul.charAt(0).toUpperCase() + o.uraianJudul.slice(1)}</h2>`,
    o.uraian,
    o.tabel ?? '',
    '<h2>D. Catatan dan Tindak Lanjut</h2>',
    `<p>${o.catatan}</p>`,
    '<h2>E. Penutup</h2>',
    '<p>Berita acara ini dibuat dengan sebenarnya berdasarkan pemeriksaan/pengukuran bersama di lapangan dan ditandatangani para pihak untuk dipergunakan sebagaimana mestinya. Status penerimaan akhir pekerjaan mengikuti keputusan pihak yang berwenang sesuai kontrak.</p>',
    '<p>Lampiran: dokumentasi foto lapangan dan daftar periksa terkait (bila ada).</p>',
    '<p style="text-align: center">Dibuat di lokasi proyek, pada tanggal tersebut di atas.</p>',
    TTD2('PIHAK PERTAMA<br>PT Contoh Konstruksi', 'PIHAK KEDUA<br>PT Contoh Konsultan'),
  ].join('');
}

function suratSample(o: {
  perihal: string;
  tujuan: string;
  isi: string;
  tembusan?: string;
}): string {
  return [
    CONTOH_BANNER_HTML,
    '<p>Nomor: 021/SRT/CONTOH/X/2026<br>Lampiran: —<br>Perihal: ' + o.perihal + '</p>',
    '<p style="text-align: right">Kota Contoh, 22 Oktober 2026</p>',
    `<p>Kepada Yth.<br><strong>${o.tujuan}</strong><br>di tempat</p>`,
    '<p>Dengan hormat,</p>',
    o.isi,
    '<p>Demikian surat ini kami sampaikan. Atas perhatian dan kerja samanya kami ucapkan terima kasih.</p>',
    '<p>Hormat kami,<br><strong>PT Contoh Konstruksi</strong></p>',
    TTD2('C. Pemimpin, ST<br>Project Manager', '&nbsp;'),
    o.tembusan ? `<p>Tembusan: ${o.tembusan}</p>` : '',
  ].join('');
}

/* ------------------------------------------------------------------ */
/* Template bawaan                                                     */
/* ------------------------------------------------------------------ */

const BA_SCAFFOLD_INTI =
  'Struktur: judul BERITA ACARA, nomor & tanggal, pembuka (hari/tanggal/waktu/lokasi, nama proyek & nomor kontrak bila ada), identitas PIHAK PERTAMA dan PIHAK KEDUA (nama, jabatan, kapasitas), dasar pelaksanaan, maksud & tujuan, uraian hasil, tabel hasil bila relevan, catatan/kekurangan/tindak lanjut, pernyataan penutup, blok tanda tangan kedua pihak, keterangan lampiran.';

export const TEMPLATE_META: Record<string, DocTemplateMeta> = {
  'berita-acara': {
    id: 'berita-acara',
    fields: [
      F_NOMOR, F_TANGGAL,
      { key: 'waktu', label: 'Waktu (jam)', placeholder: 'mis. 10.00 WIB' },
      F_LOKASI, F_NOKONTRAK, F_PIHAK1, F_PIHAK2,
      { key: 'dasarPelaksanaan', label: 'Dasar Pelaksanaan / Referensi Kontrak', type: 'textarea', placeholder: 'Dasar kontrak, instruksi, atau kesepakatan yang melandasi berita acara' },
      { key: 'masaPemeliharaan', label: 'Masa Pemeliharaan (khusus serah terima)', subtypeIds: ['serah-terima'], placeholder: 'mis. 180 hari kalender sejak serah terima' },
      { key: 'periode', label: 'Periode Opname', required: true, subtypeIds: ['opname'], placeholder: 'mis. 1–31 Oktober 2026' },
    ],
    scaffold: BA_SCAFFOLD_INTI,
    aiGuidance:
      'DILARANG menyatakan pekerjaan telah diterima sempurna, volume telah disetujui, atau pembayaran berhak diproses kecuali pengguna menyatakannya secara eksplisit dalam input. Hasil pemeriksaan/pengukuran ditulis apa adanya, termasuk kekurangan dan selisih. Nama pihak, nomor kontrak, dan tanggal hanya dari DATA DOKUMEN/input pengguna.',
    reference: REF_ADMIN,
    subtypes: [
      {
        id: 'serah-terima',
        label: 'Berita Acara Serah Terima Pekerjaan',
        scaffold: BA_SCAFFOLD_INTI + ' Khusus serah terima: uraian hasil pemeriksaan akhir, daftar kekurangan (punch list) bila ada beserta status penyelesaian dan tindak lanjutnya, pernyataan serah terima lingkup pekerjaan, masa pemeliharaan bila diberikan pengguna.',
        sampleHtml: baSample({
          judul: 'BERITA ACARA SERAH TERIMA PEKERJAAN',
          nomor: '001/BAST/CONTOH/X/2026',
          uraianJudul: 'hasil pemeriksaan dan serah terima pekerjaan',
          uraian:
            '<p>Berdasarkan pemeriksaan bersama terhadap hasil pekerjaan pada lingkup yang diserahterimakan, dicatat hal-hal berikut:</p><ol><li>Lingkup pekerjaan yang diperiksa: pekerjaan struktur lantai 1 (contoh).</li><li>Hasil pemeriksaan dicatat apa adanya pada tabel daftar kekurangan di bawah; item yang belum selesai dinyatakan terbuka, bukan dianggap diterima.</li></ol>' +
            '<table><tbody><tr><th>No</th><th>Daftar Kekurangan / Temuan</th><th>Status Penyelesaian</th><th>Tindak Lanjut</th></tr><tr><td>1</td><td>Perapihan sambungan bekisting kolom grid B (contoh)</td><td>Dalam perbaikan</td><td>Diselesaikan kontraktor, diperiksa ulang bersama</td></tr><tr><td>2</td><td>[ISI: temuan berikutnya — kosongkan bila tidak ada]</td><td>—</td><td>—</td></tr></tbody></table>',
          catatan: 'Daftar kekurangan di atas wajib diselesaikan dan diperiksa ulang sebelum serah terima dinyatakan final oleh pihak yang berwenang. Masa pemeliharaan mengikuti ketentuan kontrak yang diberikan pengguna.',
        }),
      },
      {
        id: 'pemeriksaan',
        label: 'Berita Acara Pemeriksaan Pekerjaan',
        scaffold: BA_SCAFFOLD_INTI + ' Khusus pemeriksaan: tabel hasil pemeriksaan per item (item yang diperiksa, hasil pemeriksaan, keterangan), temuan ketidaksesuaian bila ada, dan rekomendasi tindak lanjut beserta penanggung jawabnya.',
        sampleHtml: baSample({
          judul: 'BERITA ACARA PEMERIKSAAN PEKERJAAN',
          nomor: '002/BAP/CONTOH/X/2026',
          uraianJudul: 'hasil pemeriksaan pekerjaan',
          uraian:
            '<p>Pemeriksaan dilakukan bersama terhadap item pekerjaan berikut. Hasil ditulis berdasarkan pengamatan dan pengukuran di lapangan pada saat pemeriksaan.</p>' +
            '<table><tbody><tr><th>No</th><th>Item yang Diperiksa</th><th>Hasil Pemeriksaan</th><th>Keterangan</th></tr><tr><td>1</td><td>Posisi dan dimensi kolom lantai 1 (contoh)</td><td>Sesuai gambar kerja terpasang</td><td>Diukur bersama di lapangan</td></tr><tr><td>2</td><td>Permukaan beton kolom (contoh)</td><td>Ditemukan keropos ringan pada 1 titik</td><td>Perbaikan permukaan, diperiksa ulang</td></tr></tbody></table>',
          catatan: 'Item dengan temuan ketidaksesuaian wajib diperbaiki dan diperiksa ulang; hasil pemeriksaan ulang dicatat pada berita acara tersendiri.',
        }),
      },
      {
        id: 'opname',
        label: 'Berita Acara Opname / Pengukuran Volume',
        scaffold: BA_SCAFFOLD_INTI + ' Khusus opname: WAJIB tabel hasil pengukuran dengan kolom No | Uraian Pekerjaan | Satuan | Volume Kontrak/Acuan | Volume Hasil Pengukuran | Selisih | Keterangan. Selisih = volume hasil pengukuran dikurangi volume kontrak/acuan. Cantumkan periode opname.',
        aiGuidance: 'Volume hasil pengukuran HANYA dari data yang diberikan pengguna; bila pengguna tidak memberikan angka, biarkan sel volume bertanda [ISI: volume hasil pengukuran] — jangan memperkirakan volume.',
        sampleHtml: baSample({
          judul: 'BERITA ACARA OPNAME / PENGUKURAN VOLUME',
          nomor: '003/BAO/CONTOH/X/2026',
          uraianJudul: 'hasil pengukuran volume pekerjaan periode contoh',
          uraian:
            '<p>Pengukuran bersama dilakukan terhadap volume pekerjaan terpasang untuk periode 1–22 Oktober 2026 (contoh). Hasil pengukuran dicatat pada tabel berikut; angka pada contoh ini adalah dummy dan selisih dihitung dari angka dummy tersebut.</p>' +
            '<table><tbody><tr><th>No</th><th>Uraian Pekerjaan</th><th>Satuan</th><th>Volume Kontrak/Acuan</th><th>Volume Hasil Pengukuran</th><th>Selisih</th><th>Keterangan</th></tr>' +
            '<tr><td>1</td><td>Pekerjaan kolom beton bertulang (contoh)</td><td>m3</td><td>12,00</td><td>11,50</td><td>-0,50</td><td>Diukur bersama di lapangan</td></tr>' +
            '<tr><td>2</td><td>Pekerjaan pasangan bata merah (contoh)</td><td>m2</td><td>150,00</td><td>148,25</td><td>-1,75</td><td>Diukur bersama di lapangan</td></tr></tbody></table>',
          catatan: 'Selisih volume dicatat apa adanya dan menjadi bahan evaluasi para pihak; berita acara ini tidak dengan sendirinya menyatakan persetujuan pembayaran.',
        }),
      },
      {
        id: 'kesepakatan',
        label: 'Berita Acara Rapat / Kesepakatan Lapangan',
        scaffold: BA_SCAFFOLD_INTI + ' Khusus kesepakatan lapangan: pokok-pokok kesepakatan bernomor, tabel tindak lanjut (tindakan, penanggung jawab, tenggat), dan isu yang belum disepakati bila ada.',
        aiGuidance: 'Kesepakatan yang ditulis harus benar-benar dinyatakan pengguna sebagai kesepakatan; usulan yang masih dibahas dicatat sebagai pembahasan, bukan kesepakatan.',
        sampleHtml: baSample({
          judul: 'BERITA ACARA KESEPAKATAN LAPANGAN',
          nomor: '004/BAK/CONTOH/X/2026',
          uraianJudul: 'kesepakatan hasil rapat lapangan',
          uraian:
            '<p>Rapat lapangan dihadiri para pihak terkait. Pokok yang dibahas dan disepakati dicatat sebagai berikut (isi contoh bersifat dummy):</p><ol><li>Urutan pekerjaan minggu berikutnya mengikuti jadwal yang dibagikan pada rapat.</li><li>Setiap perubahan lapangan dicatat pada laporan harian dan dikonfirmasi tertulis.</li></ol>' +
            '<table><tbody><tr><th>No</th><th>Tindak Lanjut</th><th>Penanggung Jawab</th><th>Tenggat</th></tr><tr><td>1</td><td>[ISI: tindakan yang disepakati]</td><td>[ISI: nama penanggung jawab]</td><td>[ISI: tanggal]</td></tr></tbody></table>',
          catatan: 'Isu yang belum mencapai kesepakatan dicatat terpisah sebagai isu terbuka dan dibahas kembali pada rapat berikutnya.',
        }),
      },
      {
        id: 'tambah-kurang',
        label: 'Berita Acara Pekerjaan Tambah-Kurang',
        scaffold: BA_SCAFFOLD_INTI + ' Khusus tambah-kurang: tabel pekerjaan tambah dan kurang (uraian, jenis tambah/kurang, satuan, volume perubahan, keterangan), dasar instruksi perubahan, dan pernyataan bahwa perhitungan nilai mengikuti dokumen perhitungan terpisah sesuai kontrak.',
        aiGuidance: 'Jangan mencantumkan nilai harga/nilai kontrak perubahan kecuali pengguna memberikannya; berita acara ini mencatat lingkup dan volume perubahan, bukan persetujuan nilai.',
        sampleHtml: baSample({
          judul: 'BERITA ACARA PEKERJAAN TAMBAH-KURANG',
          nomor: '005/BATK/CONTOH/X/2026',
          uraianJudul: 'pekerjaan tambah dan pekerjaan kurang',
          uraian:
            '<p>Berdasarkan instruksi tertulis pemberi tugas (dummy), para pihak mencatat perubahan lingkup pekerjaan sebagai berikut:</p>' +
            '<table><tbody><tr><th>No</th><th>Uraian Pekerjaan</th><th>Jenis</th><th>Satuan</th><th>Volume Perubahan</th><th>Keterangan</th></tr><tr><td>1</td><td>Penambahan partisi ruang (contoh)</td><td>Tambah</td><td>m2</td><td>24,00</td><td>Instruksi lapangan tertulis (dummy)</td></tr><tr><td>2</td><td>Pengurangan pekerjaan plester area gudang (contoh)</td><td>Kurang</td><td>m2</td><td>18,00</td><td>Sesuai gambar revisi (dummy)</td></tr></tbody></table>' +
            '<p>Perhitungan nilai atas perubahan di atas mengikuti dokumen perhitungan terpisah sesuai ketentuan kontrak; berita acara ini tidak mencantumkan nilai harga.</p>',
          catatan: 'Pekerjaan tambah dilaksanakan setelah instruksi tertulis diterima; pekerjaan kurang tidak dilaksanakan sejak berita acara ini ditandatangani.',
        }),
      },
    ],
  },
  surat: {
    id: 'surat',
    fields: [
      F_NOMOR, F_TANGGAL,
      { key: 'tujuanSurat', label: 'Tujuan Surat (Yth.)', required: true, placeholder: 'Nama/jabatan & instansi tujuan' },
      { key: 'perihal', label: 'Perihal', required: true },
      { key: 'lampiran', label: 'Lampiran (bila ada)', placeholder: 'mis. 1 berkas' },
      { key: 'tembusan', label: 'Tembusan (bila ada)', placeholder: 'Pihak penerima tembusan' },
      { key: 'acara', label: 'Nama Acara', required: true, subtypeIds: ['undangan'], placeholder: 'mis. Rapat Koordinasi Mingguan' },
      { key: 'waktuTempat', label: 'Hari/Tanggal, Jam & Tempat', required: true, subtypeIds: ['undangan'], placeholder: 'mis. Senin, 2 Nov 2026, 09.00 WIB, Kantor Proyek' },
      { key: 'nomorSuratDirujuk', label: 'Nomor Surat yang Dirujuk (klarifikasi/tanggapan)', subtypeIds: ['klarifikasi'], placeholder: 'Nomor surat pihak lain yang ditanggapi' },
      { key: 'lokasiPemeriksaan', label: 'Lokasi / Item yang Diminta Diperiksa', required: true, subtypeIds: ['permintaan-pemeriksaan'] },
      { key: 'waktuPemeriksaan', label: 'Waktu Pemeriksaan yang Diajukan', required: true, subtypeIds: ['permintaan-pemeriksaan'], placeholder: 'mis. Jumat, 30 Okt 2026 pukul 09.00 WIB' },
    ],
    scaffold:
      'Struktur surat resmi: kop perusahaan (dari profil), nomor, lampiran, perihal, tanggal, tujuan & alamat penerima, salam pembuka, paragraf pembuka (konteks), isi sistematis, tanggal/tindakan yang diminta bila relevan, penutup, nama + jabatan + blok tanda tangan pejabat berwenang, tembusan bila ada.',
    aiGuidance:
      'Bahasa Indonesia formal, ringkas, tanpa paragraf generik berulang. Nomor surat, nama pejabat, lampiran, dan dasar hukum/kontrak HANYA dari field/input pengguna; bila kosong tulis [ISI: ...] — jangan mengarang. Jangan memaksakan format surat instansi pemerintah pada surat perusahaan swasta.',
    reference: REF_ADMIN,
    subtypes: [
      {
        id: 'permohonan',
        label: 'Surat Permohonan',
        scaffold: 'Surat permohonan: konteks/latar belakang singkat, maksud permohonan dinyatakan tegas, rincian yang dimohon, batas waktu yang diharapkan bila diberikan pengguna, penutup sopan.',
        sampleHtml: suratSample({
          perihal: 'Permohonan Persetujuan Material (Contoh)',
          tujuan: 'Bapak/Ibu Pimpinan PT Contoh Konsultan selaku Konsultan Pengawas',
          isi: '<p>Bersama surat ini kami mengajukan permohonan persetujuan atas material yang akan digunakan pada pekerjaan struktur, sebagaimana daftar material terlampir (contoh). Data teknis material mengikuti dokumen yang diberikan pengguna dan tidak diubah dalam surat ini.</p><p>Kami mohon persetujuan atau tanggapan tertulis agar pekerjaan dapat berjalan sesuai jadwal. Apabila diperlukan, kami siap mempresentasikan contoh material pada kesempatan pertama.</p>',
          tembusan: 'Arsip proyek (contoh).',
        }),
      },
      {
        id: 'pemberitahuan',
        label: 'Surat Pemberitahuan',
        scaffold: 'Surat pemberitahuan: hal yang diberitahukan dinyatakan di awal isi, latar belakang seperlunya, dampak/tindak lanjut bila ada, kontak penanggung jawab bila diberikan pengguna.',
        sampleHtml: suratSample({
          perihal: 'Pemberitahuan Jadwal Pekerjaan (Contoh)',
          tujuan: 'Bapak/Ibu Pimpinan PT Contoh Konsultan selaku Konsultan Pengawas',
          isi: '<p>Bersama surat ini kami memberitahukan bahwa pekerjaan pengecoran lantai 2 (contoh) dijadwalkan ulang mengikuti kesiapan lapangan dan hasil pemeriksaan pembesian. Jadwal pengganti serta urutan pekerjaan kami sampaikan pada laporan harian terkait.</p><p>Pemberitahuan ini dibuat agar para pihak dapat menyesuaikan kehadiran dan pengawasan di lapangan.</p>',
        }),
      },
      {
        id: 'undangan',
        label: 'Surat Undangan',
        scaffold: 'Surat undangan: maksud undangan, nama acara, hari/tanggal/jam/tempat (dari field), agenda singkat, permohonan konfirmasi kehadiran, penutup.',
        sampleHtml: suratSample({
          perihal: 'Undangan Rapat Koordinasi (Contoh)',
          tujuan: 'Bapak/Ibu Pimpinan PT Contoh Konsultan selaku Konsultan Pengawas',
          isi: '<p>Bersama surat ini kami mengundang Bapak/Ibu untuk menghadiri Rapat Koordinasi Mingguan (contoh) yang akan dilaksanakan pada:</p><p>Hari/Tanggal: Senin, 2 November 2026 (contoh)<br>Waktu: 09.00 WIB s.d. selesai<br>Tempat: Kantor Proyek (contoh)</p><p>Agenda: evaluasi progres mingguan, kendala lapangan, dan rencana pekerjaan minggu berikutnya. Mengingat pentingnya rapat, kami mohon konfirmasi kehadiran.</p>',
          tembusan: 'Seluruh peserta rapat (contoh).',
        }),
      },
      {
        id: 'penyampaian-laporan',
        label: 'Surat Penyampaian Laporan',
        scaffold: 'Surat penyampaian laporan: laporan yang disampaikan (judul & periode dari input), dasar kewajiban penyampaian bila ada, daftar lampiran sebenar-benarnya, pernyataan kesiapan klarifikasi.',
        sampleHtml: suratSample({
          perihal: 'Penyampaian Laporan Kemajuan Pekerjaan (Contoh)',
          tujuan: 'Bapak/Ibu Pimpinan Pemberi Tugas (Contoh)',
          isi: '<p>Bersama surat ini kami sampaikan Laporan Kemajuan Pekerjaan periode contoh sebagaimana terlampir. Laporan disusun berdasarkan catatan pelaksanaan di lapangan dan dokumen proyek terkait.</p><p>Apabila diperlukan penjelasan lebih lanjut, kami siap memberikan klarifikasi pada kesempatan yang Bapak/Ibu tentukan.</p>',
        }),
      },
      {
        id: 'klarifikasi',
        label: 'Surat Klarifikasi / Tanggapan',
        scaffold: 'Surat klarifikasi/tanggapan: surat/hal yang dirujuk (nomor surat dari field), pokok yang diklarifikasi per butir, penjelasan berdasarkan fakta/dokumen yang diberikan pengguna, kesimpulan tanggapan.',
        aiGuidance: 'Klarifikasi hanya berdasarkan fakta dan dokumen yang diberikan pengguna; jangan menambahkan pengakuan, janji, atau dasar hukum yang tidak diberikan.',
        sampleHtml: suratSample({
          perihal: 'Klarifikasi atas Surat Konsultan Pengawas (Contoh)',
          tujuan: 'Bapak/Ibu Pimpinan PT Contoh Konsultan selaku Konsultan Pengawas',
          isi: '<p>Menanggapi surat Bapak/Ibu nomor [ISI: nomor surat yang dirujuk] perihal permintaan klarifikasi (contoh), bersama ini kami sampaikan penjelasan sebagai berikut:</p><ol><li>Pokok pertama dijelaskan berdasarkan dokumen/catatan yang diberikan pengguna.</li><li>Pokok berikutnya ditulis apa adanya; hal yang belum dapat dipastikan dinyatakan belum dapat dipastikan, bukan ditebak.</li></ol>',
        }),
      },
      {
        id: 'permintaan-pemeriksaan',
        label: 'Surat Permintaan Pemeriksaan Pekerjaan',
        scaffold: 'Surat permintaan pemeriksaan: item/lokasi pekerjaan yang siap diperiksa (dari field), waktu pemeriksaan yang diajukan (dari field), dasar kesiapan (pemeriksaan internal selesai dinyatakan pengguna), permohonan kehadiran pengawas.',
        aiGuidance: 'Jangan menyatakan pekerjaan sudah memenuhi syarat/lulus; surat ini hanya MEMINTA pemeriksaan — hasil pemeriksaan ditentukan pihak pemeriksa.',
        sampleHtml: suratSample({
          perihal: 'Permintaan Pemeriksaan Pekerjaan (Contoh)',
          tujuan: 'Bapak/Ibu Pimpinan PT Contoh Konsultan selaku Konsultan Pengawas',
          isi: '<p>Bersama surat ini kami mengajukan permintaan pemeriksaan atas pekerjaan pembesian balok lantai 2 (contoh) yang menurut catatan internal kami telah siap diperiksa. Kami mengajukan waktu pemeriksaan pada Jumat, 30 Oktober 2026 pukul 09.00 WIB (contoh) di lokasi pekerjaan.</p><p>Hasil pemeriksaan sepenuhnya merupakan kewenangan pihak pemeriksa; kami akan menindaklanjuti setiap catatan yang diberikan.</p>',
        }),
      },
    ],
  },

  'laporan-harian': {
    id: 'laporan-harian',
    fields: [
      F_TANGGAL,
      { key: 'nomorLaporan', label: 'Nomor Laporan / Revisi', placeholder: 'mis. LH-045 Rev. 0' },
      F_LOKASI,
      { key: 'cuaca', label: 'Cuaca & Kondisi Lapangan', placeholder: 'Diisi sesuai kondisi aktual, mis. Cerah berawan' },
      { key: 'pelaksana', label: 'Kontraktor / Pelaksana', placeholder: 'Nama pelaksana pekerjaan' },
      { key: 'pengawas', label: 'Pengawas / Pihak Terkait', placeholder: 'Nama pengawas lapangan' },
    ],
    scaffold:
      'Struktur LAPORAN HARIAN — Bagian A Identitas: nama proyek, nomor kontrak bila ada, lokasi, tanggal, nomor laporan & revisi, pelaksana, pengawas, cuaca & kondisi lapangan. Bagian B Realisasi pekerjaan: tabel No | Uraian Pekerjaan | Lokasi/Segmen | Satuan | Volume Hari Ini | Volume Kumulatif | Target/Acuan | Keterangan. Bagian C Sumber daya: tenaga kerja per posisi, peralatan (jumlah/kondisi), material utama (jumlah, satuan, status penerimaan bila diketahui). Bagian D Kendala & tindak lanjut: kendala lapangan, cuaca, gangguan/keterlambatan, instruksi lapangan yang benar-benar diberikan, tindakan korektif, rencana pekerjaan besok. Bagian E Dokumentasi & pengesahan: keterangan foto (nomor, waktu, lokasi), nama & jabatan pembuat laporan, kolom pemeriksaan/persetujuan sesuai tata kelola proyek.',
    aiGuidance:
      'JANGAN mengarang volume harian, volume kumulatif, jumlah tenaga kerja, kondisi cuaca, atau persetujuan pengawas. Data yang tidak diberikan pengguna ditulis [ISI: ...] dan kolom volume aktual dikosongkan/ditandai "—", BUKAN diisi angka perkiraan sebagai realisasi.',
    reference: {
      sourceName: 'Praktik pelaporan berkala pekerjaan konstruksi; kerangka umum UU No. 2 Tahun 2017 tentang Jasa Konstruksi',
      verification: 'sebagian',
      scope: 'Undang-undang memberi kerangka jasa konstruksi, BUKAN format formulir laporan. Isi & format rinci laporan harian mengikuti dokumen kontrak, pedoman proyek, dan SOP organisasi.',
      reviewedAt: REVIEWED,
    },
    sampleHtml: [
      CONTOH_BANNER_HTML,
      '<h1 style="text-align: center">LAPORAN HARIAN PEKERJAAN</h1>',
      '<h2>A. Identitas Laporan</h2>',
      '<p>Nama Proyek: Pembangunan Rumah Tinggal 2 Lantai (contoh)<br>Nomor Kontrak: 045/SPK/CONTOH/X/2026 (dummy)<br>Lokasi: [ISI: lokasi pekerjaan]<br>Tanggal Laporan: 22 Oktober 2026 (contoh)<br>Nomor Laporan/Revisi: LH-045 Rev. 0 (contoh)<br>Pelaksana: PT Contoh Konstruksi<br>Pengawas: [ISI: nama pengawas]<br>Cuaca &amp; Kondisi Lapangan: — (diisi sesuai kondisi aktual hari laporan)</p>',
      '<h2>B. Realisasi Pekerjaan</h2>',
      '<p>Volume aktual TIDAK dicontohkan dengan angka — kolom volume pada contoh ini sengaja dikosongkan karena realisasi hanya boleh diisi dari pengukuran/catatan lapangan yang sebenarnya.</p>',
      '<table><tbody><tr><th>No</th><th>Uraian Pekerjaan</th><th>Lokasi / Segmen</th><th>Satuan</th><th>Volume Hari Ini</th><th>Volume Kumulatif</th><th>Target / Acuan</th><th>Keterangan</th></tr>' +
        '<tr><td>1</td><td>Pekerjaan kolom beton bertulang (contoh uraian)</td><td>Lantai 1</td><td>m3</td><td>—</td><td>—</td><td>[ISI: target/acuan]</td><td>—</td></tr>' +
        '<tr><td>2</td><td>Pekerjaan pasangan bata merah (contoh uraian)</td><td>Lantai 1</td><td>m2</td><td>—</td><td>—</td><td>[ISI: target/acuan]</td><td>—</td></tr></tbody></table>',
      '<h2>C. Sumber Daya</h2>',
      '<p><strong>Tenaga kerja</strong> (jumlah diisi dari absensi aktual):</p>',
      '<table><tbody><tr><th>No</th><th>Posisi</th><th>Jumlah (orang)</th><th>Keterangan</th></tr><tr><td>1</td><td>Mandor</td><td>—</td><td>—</td></tr><tr><td>2</td><td>Tukang</td><td>—</td><td>—</td></tr><tr><td>3</td><td>Pekerja</td><td>—</td><td>—</td></tr></tbody></table>',
      '<p><strong>Peralatan:</strong> [ISI: peralatan yang digunakan beserta jumlah/kondisinya].</p>',
      '<p><strong>Material utama:</strong></p>',
      '<table><tbody><tr><th>No</th><th>Material</th><th>Jumlah</th><th>Satuan</th><th>Status Penerimaan</th></tr><tr><td>1</td><td>[ISI: material yang diterima hari ini — kosongkan bila tidak ada]</td><td>—</td><td>—</td><td>[ISI: diterima / diperiksa / ditolak]</td></tr></tbody></table>',
      '<h2>D. Kendala dan Tindak Lanjut</h2>',
      '<p>Kendala Lapangan: [ISI: kendala aktual — tulis "Tidak ada" bila memang tidak ada, jangan dikarang.]<br>Instruksi Lapangan: [ISI: hanya instruksi yang benar-benar diberikan.]<br>Tindakan Korektif: [ISI: tindakan yang diambil.]<br>Rencana Pekerjaan Besok: [ISI: rencana pekerjaan hari berikutnya.]</p>',
      '<h2>E. Dokumentasi dan Pengesahan</h2>',
      '<table><tbody><tr><th>No</th><th>Keterangan Foto</th><th>Waktu</th><th>Lokasi</th></tr><tr><td>1</td><td>[ISI: keterangan foto dokumentasi]</td><td>[ISI: waktu]</td><td>[ISI: lokasi]</td></tr></tbody></table>',
      TTD2('Dibuat oleh,<br>Pelaksana Lapangan', 'Diperiksa oleh,<br>Pengawas Lapangan'),
    ].join(''),
  },
  notulen: {
    id: 'notulen',
    fields: [
      F_TANGGAL,
      { key: 'nomorNotulen', label: 'Nomor Notulen', placeholder: 'mis. NOT-012/X/2026' },
      { key: 'tempatRapat', label: 'Tempat / Media Rapat', placeholder: 'mis. Kantor Proyek / daring' },
      { key: 'waktuRapat', label: 'Waktu Mulai – Selesai', placeholder: 'mis. 09.00 – 11.00 WIB' },
      { key: 'pemimpinRapat', label: 'Pimpinan Rapat', placeholder: 'Nama & jabatan' },
      { key: 'notulis', label: 'Notulis', placeholder: 'Nama pencatat notulen' },
    ],
    scaffold:
      'Struktur NOTULEN RAPAT: judul & nomor notulen, tanggal, waktu mulai–selesai, lokasi/media rapat, agenda, pimpinan rapat & notulis, daftar peserta (nama, instansi/jabatan), pokok pembahasan per agenda, keputusan yang BENAR-BENAR disepakati, tabel tindak lanjut (No | Isu/Tindakan | Keputusan/Hasil yang Diharapkan | Penanggung Jawab | Tenggat | Status), isu terbuka/belum diputuskan, jadwal rapat berikutnya bila disepakati, pengesahan/distribusi bila diperlukan.',
    aiGuidance:
      'Bedakan secara tegas antara USULAN, PEMBAHASAN, dan KEPUTUSAN FINAL. DILARANG mengubah saran atau usulan peserta menjadi keputusan rapat. Nama peserta, penanggung jawab, dan tenggat HANYA dari input pengguna; bila tidak tersedia tulis [ISI: ...]. Keputusan yang belum tercapai dicatat sebagai isu terbuka.',
    reference: REF_ADMIN,
    sampleHtml: [
      CONTOH_BANNER_HTML,
      '<h1 style="text-align: center">NOTULEN RAPAT KOORDINASI PROYEK</h1>',
      '<p style="text-align: center">Nomor: NOT-012/CONTOH/X/2026 (dummy)</p>',
      '<p>Tanggal: Rabu, 22 Oktober 2026 (contoh)<br>Waktu: 09.00 – 11.00 WIB (contoh)<br>Tempat: Kantor Proyek (contoh)<br>Pimpinan Rapat: [ISI: nama &amp; jabatan]<br>Notulis: [ISI: nama notulis]</p>',
      '<h2>A. Agenda</h2>',
      '<ol><li>Evaluasi progres pekerjaan.</li><li>Kendala lapangan dan tindak lanjutnya.</li><li>Rencana pekerjaan periode berikutnya.</li></ol>',
      '<h2>B. Peserta</h2>',
      '<table><tbody><tr><th>No</th><th>Nama</th><th>Instansi / Jabatan</th><th>Kehadiran</th></tr><tr><td>1</td><td>[ISI: nama peserta]</td><td>[ISI: instansi/jabatan]</td><td>[ISI: hadir/izin]</td></tr></tbody></table>',
      '<h2>C. Pokok Pembahasan</h2>',
      '<p><strong>Agenda 1 — Evaluasi progres:</strong> dibahas perkembangan pekerjaan berdasarkan laporan berkala. Usulan peserta dicatat sebagai usulan dan TIDAK otomatis menjadi keputusan.</p>',
      '<p><strong>Agenda 2 — Kendala lapangan:</strong> [ISI: ringkasan pembahasan sesuai jalannya rapat.]</p>',
      '<h2>D. Keputusan</h2>',
      '<p>Keputusan hanya dicatat bila benar-benar disepakati dalam rapat. Pada contoh ini keputusan dinyatakan DITUNDA menunggu data progres yang terverifikasi — contoh tidak mengarang kesepakatan.</p>',
      '<h2>E. Tindak Lanjut</h2>',
      '<table><tbody><tr><th>No</th><th>Isu / Tindakan</th><th>Keputusan / Hasil yang Diharapkan</th><th>Penanggung Jawab</th><th>Tenggat</th><th>Status</th></tr>' +
        '<tr><td>1</td><td>Penyusunan data progres terverifikasi (contoh)</td><td>Ditunda — dibahas kembali setelah data tersedia</td><td>[ISI: nama penanggung jawab]</td><td>[ISI: tanggal]</td><td>Terbuka</td></tr></tbody></table>',
      '<h2>F. Isu Terbuka &amp; Rapat Berikutnya</h2>',
      '<p>Isu terbuka: [ISI: isu yang belum diputuskan — kosongkan bila tidak ada.]<br>Rapat berikutnya: [ISI: jadwal bila disepakati.]</p>',
      '<p>Notulen ini dibagikan kepada seluruh peserta rapat untuk ditindaklanjuti sesuai bagian masing-masing.</p>',
      TTD2('Notulis', 'Pimpinan Rapat'),
    ].join(''),
  },
  'checklist-qc': {
    id: 'checklist-qc',
    fields: [
      F_TANGGAL, F_LOKASI,
      { key: 'itemPemeriksaan', label: 'Item / Area Pemeriksaan', required: true, placeholder: 'mis. Kolom lantai 1 grid A–C' },
      { key: 'jenisPekerjaan', label: 'Jenis Pekerjaan', required: true, placeholder: 'mis. Pekerjaan beton bertulang' },
      { key: 'tahapanPekerjaan', label: 'Tahapan Pekerjaan', placeholder: 'mis. Sebelum pengecoran / sesudah pembesian' },
      { key: 'referensiGambar', label: 'Referensi Gambar / Spesifikasi', placeholder: 'Nomor gambar & dokumen spesifikasi yang berlaku' },
      { key: 'acuanTeknis', label: 'Acuan Teknis (spesifikasi/ITP/standar dari dokumen proyek)', type: 'textarea', placeholder: 'Isi dari dokumen proyek Anda — jangan menebak nomor standar' },
      { key: 'standarRelevan', label: 'Standar Relevan & Status Verifikasinya', placeholder: 'mis. Spesifikasi teknis proyek Bab 5 (terverifikasi dari dokumen proyek)' },
    ],
    scaffold:
      'Struktur CHECKLIST QC — A. Identitas inspeksi: proyek, lokasi/segmen, jenis pekerjaan, tanggal inspeksi, nomor checklist, kontraktor & pengawas, referensi gambar/spesifikasi, acuan teknis. B. Tabel pemeriksaan: No | Item Pemeriksaan | Kriteria Penerimaan | Referensi (Spesifikasi/Gambar/ITP/Standar) | Metode Pemeriksaan | Hasil/Nilai Aktual | Satuan | Status (Lulus/Tidak Lulus/Belum Diperiksa) | Catatan & Tindakan Korektif. C. Penutup: daftar ketidaksesuaian, tindakan korektif, penanggung jawab, target penyelesaian, pemeriksaan ulang, tanda tangan pihak terkait, kolom lampiran hasil uji & foto.',
    aiGuidance:
      'Kriteria penerimaan HANYA dari spesifikasi teknis/gambar/ITP yang diberikan pengguna. DILARANG mencantumkan angka toleransi, kuat tekan, slump, kepadatan, atau ketebalan tanpa acuan tertulis dari pengguna — bila acuan tidak diberikan, tulis pada sel kriteria: "Sesuai spesifikasi teknis/gambar kerja yang berlaku — acuan perlu dilengkapi". Status setiap item DEFAULT "Belum Diperiksa"; status Lulus hanya bila pengguna memberikan hasil pemeriksaannya. DILARANG menyatakan checklist ini memenuhi SNI. Bila acuan teknis belum terverifikasi, tampilkan penanda "Acuan perlu dilengkapi/dikonfirmasi".',
    reference: {
      sourceName: 'Spesifikasi teknis proyek, gambar kerja, dan ITP (Inspection & Test Plan) proyek yang berlaku',
      verification: 'belum-terverifikasi',
      scope: 'Acuan teknis spesifik WAJIB dilengkapi dari dokumen proyek pengguna. Template ini adalah format formulir pemeriksaan umum dan TIDAK mengklaim kesesuaian terhadap SNI atau standar tertentu.',
      reviewedAt: REVIEWED,
    },
    sampleHtml: [
      CONTOH_BANNER_HTML,
      '<h1 style="text-align: center">CHECKLIST PEMERIKSAAN MUTU (QC)</h1>',
      '<p><strong>Acuan perlu dilengkapi/dikonfirmasi:</strong> kriteria penerimaan pada contoh ini bersifat umum. Isi acuan teknis dari spesifikasi/gambar/ITP proyek Anda sebelum checklist dipakai; contoh ini tidak menyatakan kesesuaian terhadap standar tertentu.</p>',
      '<h2>A. Identitas Inspeksi</h2>',
      '<p>Proyek: Pembangunan Rumah Tinggal 2 Lantai (contoh)<br>Lokasi/Segmen: Lantai 1 (contoh)<br>Jenis Pekerjaan: Pekerjaan beton bertulang (contoh)<br>Tanggal Inspeksi: 22 Oktober 2026 (contoh)<br>Nomor Checklist: QC-012 (contoh)<br>Kontraktor: PT Contoh Konstruksi<br>Pengawas: [ISI: nama pengawas]<br>Referensi Gambar/Spesifikasi: [ISI: nomor gambar &amp; dokumen spesifikasi]<br>Acuan Teknis: [ISI: acuan dari dokumen proyek]</p>',
      '<h2>B. Tabel Pemeriksaan</h2>',
      '<table><tbody><tr><th>No</th><th>Item Pemeriksaan</th><th>Kriteria Penerimaan</th><th>Referensi (Spesifikasi/Gambar/ITP/Standar)</th><th>Metode Pemeriksaan</th><th>Hasil / Nilai Aktual</th><th>Satuan</th><th>Status</th><th>Catatan &amp; Tindakan Korektif</th></tr>' +
        '<tr><td>1</td><td>Dimensi dan posisi elemen struktur</td><td>Sesuai gambar kerja yang disetujui — acuan perlu dilengkapi</td><td>[ISI: no. gambar]</td><td>Pengukuran langsung di lapangan</td><td>—</td><td>—</td><td>Belum Diperiksa</td><td>—</td></tr>' +
        '<tr><td>2</td><td>Kondisi visual permukaan beton (keropos/retak)</td><td>Tidak terdapat keropos atau retak yang melampaui ketentuan spesifikasi teknis — acuan perlu dilengkapi</td><td>[ISI: acuan spesifikasi]</td><td>Pemeriksaan visual</td><td>—</td><td>—</td><td>Belum Diperiksa</td><td>—</td></tr>' +
        '<tr><td>3</td><td>Kelurusan dan kerataan elemen (plumb &amp; level)</td><td>Sesuai ketentuan spesifikasi teknis proyek — acuan perlu dilengkapi</td><td>[ISI: acuan spesifikasi]</td><td>Waterpass / unting-unting</td><td>—</td><td>—</td><td>Belum Diperiksa</td><td>—</td></tr>' +
        '<tr><td>4</td><td>Kelengkapan dokumen mutu (hasil uji &amp; sertifikat material)</td><td>Dokumen tersedia dan sesuai daftar dokumen mutu proyek</td><td>[ISI: daftar dokumen mutu]</td><td>Pemeriksaan dokumen</td><td>—</td><td>—</td><td>Belum Diperiksa</td><td>—</td></tr></tbody></table>',
      '<h2>C. Penutup</h2>',
      '<p>Daftar Ketidaksesuaian: [ISI: diisi hanya dari hasil pemeriksaan yang sebenarnya.]<br>Tindakan Korektif: [ISI: tindakan perbaikan yang disepakati.]<br>Penanggung Jawab: [ISI: nama]<br>Target Penyelesaian: [ISI: tanggal]<br>Pemeriksaan Ulang: dilakukan setelah tindakan korektif selesai dan dicatat pada checklist pemeriksaan ulang.<br>Lampiran: hasil pengujian dan foto pemeriksaan (bila ada).</p>',
      TTD2('Pemeriksa QC', 'Pengawas / Kontraktor'),
    ].join(''),
  },
  bebas: {
    id: 'bebas',
    fields: [
      {
        key: 'jenisDokumen', label: 'Jenis Dokumen', type: 'select',
        options: [
          { value: 'surat', label: 'Surat' },
          { value: 'berita-acara', label: 'Berita Acara' },
          { value: 'laporan', label: 'Laporan' },
          { value: 'notulen', label: 'Notulen / Catatan Rapat' },
          { value: 'checklist', label: 'Checklist / Formulir' },
          { value: 'lainnya', label: 'Lainnya (jelaskan di instruksi)' },
        ],
      },
      { key: 'tujuanDokumen', label: 'Tujuan Dokumen', placeholder: 'Untuk apa dokumen ini dibuat' },
      { key: 'penerimaDokumen', label: 'Pembaca / Penerima', placeholder: 'Siapa yang akan membaca/menerima dokumen' },
      {
        key: 'gayaBahasa', label: 'Gaya Bahasa', type: 'select',
        options: [
          { value: 'formal', label: 'Formal' },
          { value: 'semi-formal', label: 'Semi-formal' },
          { value: 'ringkas-teknis', label: 'Ringkas & teknis' },
        ],
      },
      { key: 'strukturDiinginkan', label: 'Struktur yang Diinginkan', type: 'textarea', placeholder: 'Bagian-bagian dokumen yang Anda inginkan, bila ada' },
      { key: 'instruksiKhusus', label: 'Instruksi Khusus', type: 'textarea', placeholder: 'Ketentuan khusus isi/format dokumen' },
    ],
    scaffold: 'Struktur bebas mengikuti instruksi pengguna; tetap rapi dengan judul dan bagian yang jelas.',
    aiGuidance:
      'Draf Bebas tetap tunduk pada aturan integritas: bila jenis dokumen tidak jelas, susun struktur yang paling masuk akal dan tandai bagian yang perlu dilengkapi dengan [ISI: ...]. JANGAN mengarang fakta, angka, nama, tanggal, persetujuan, atau nilai teknis. Proyek terkait dan profil kop mengikuti pilihan pengguna di form.',
    reference: {
      sourceName: 'Struktur dokumen profesional umum EZRAB',
      verification: 'belum-terverifikasi',
      scope: 'Mengikuti jenis dokumen dan instruksi pengguna; acuan teknis mengikuti dokumen yang dipilih/dijelaskan pengguna.',
      reviewedAt: REVIEWED,
    },
    sampleHtml: [
      CONTOH_BANNER_HTML,
      '<h1 style="text-align: center">[ISI: Judul Dokumen]</h1>',
      '<h2>A. Pendahuluan</h2>',
      '<p>Paragraf pembuka menjelaskan konteks dan tujuan dokumen secara ringkas. Fakta, nama, tanggal, dan angka hanya berasal dari instruksi serta data yang Anda berikan.</p>',
      '<h2>B. Isi</h2>',
      '<p>Isi disusun mengikuti struktur yang Anda minta. Bila jenis dokumen tidak disebutkan, AI menyusun struktur yang paling masuk akal dan menandai bagian yang perlu Anda lengkapi seperti ini: [ISI: keterangan yang perlu dilengkapi].</p>',
      '<h2>C. Penutup</h2>',
      '<p>Penutup merangkum tindak lanjut yang benar-benar Anda sebutkan. Dokumen ini berstatus DRAF sampai Anda meninjaunya.</p>',
      TTD2('[ISI: nama & jabatan penandatangan]', '&nbsp;'),
    ].join(''),
  },

  bast: {
    id: 'bast',
    fields: [F_NOMOR, F_TANGGAL, F_PIHAK1, F_PIHAK2, { key: 'nomorKontrak', label: 'Nomor Kontrak / SPK', placeholder: 'Nomor kontrak yang menjadi dasar serah terima' }],
    scaffold:
      'Struktur BERITA ACARA SERAH TERIMA: dasar kontrak, pernyataan serah terima pekerjaan, lingkup & kondisi hasil pekerjaan, daftar lampiran/dokumen serah terima, masa pemeliharaan bila disebutkan pengguna, penutup, tanda tangan kedua pihak.',
    aiGuidance: 'Jangan menyatakan pekerjaan diterima sempurna atau pembayaran berhak diproses kecuali pengguna menyatakannya secara eksplisit.',
    reference: REF_ADMIN,
  },
  opname: {
    id: 'opname',
    fields: [F_NOMOR, F_TANGGAL, F_PIHAK1, F_PIHAK2, { key: 'periode', label: 'Periode Opname', placeholder: 'mis. 1–31 Oktober 2026' }],
    scaffold:
      'Struktur BERITA ACARA OPNAME: dasar, periode pengukuran, tabel hasil opname (uraian pekerjaan, volume kontrak, volume terpasang, selisih, keterangan), kesimpulan progres, tanda tangan.',
    aiGuidance: 'Volume terpasang hanya dari data pengguna; jangan memperkirakan volume.',
    reference: REF_ADMIN,
  },
  'laporan-mingguan': {
    id: 'laporan-mingguan',
    fields: [F_TANGGAL, { key: 'mingguKe', label: 'Minggu Ke-', placeholder: 'mis. 12' }, F_LOKASI],
    scaffold:
      'Struktur: ringkasan progres (rencana vs realisasi), pekerjaan selesai minggu ini, pekerjaan berjalan, tabel material & tenaga, kendala & solusi, foto/dokumentasi (tandai [ISI: tautan/keterangan foto] bila tidak diberikan), rencana minggu depan.',
    aiGuidance: 'Angka progres hanya dari data pengguna; jangan mengarang persentase realisasi.',
    reference: REF_ADMIN,
  },
  'laporan-k3': {
    id: 'laporan-k3',
    fields: [F_TANGGAL, F_LOKASI, { key: 'petugasK3', label: 'Petugas K3', placeholder: 'Nama petugas K3' }],
    scaffold:
      'Struktur LAPORAN K3: kondisi umum lokasi, toolbox meeting, inspeksi APD & peralatan, temuan unsafe act/condition (tabel), insiden/nearmiss (hanya bila diberikan pengguna), tindak lanjut & penanggung jawab.',
    aiGuidance: 'Insiden/nearmiss jangan dikarang; tulis hanya yang diberikan pengguna.',
    reference: {
      sourceName: 'Praktik pelaporan K3 (keselamatan & kesehatan kerja) proyek konstruksi',
      verification: 'belum-terverifikasi',
      scope: 'Format mengikuti rencana K3 proyek, ketentuan kontrak, dan SOP organisasi — bukan format baku yang diatur SNI.',
      reviewedAt: REVIEWED,
    },
  },
  'surat-penawaran': {
    id: 'surat-penawaran',
    fields: [F_NOMOR, F_TANGGAL, { key: 'tujuanSurat', label: 'Tujuan Surat (Yth.)', required: true }, { key: 'perihal', label: 'Perihal', required: true }],
    scaffold:
      'Struktur SURAT PENAWARAN: pembuka, ruang lingkup yang ditawarkan, masa berlaku penawaran, syarat & ketentuan umum; rincian harga HANYA bila pengguna memberikan angkanya — jangan mengarang harga, tandai [ISI: rincian harga] bila belum diberikan.',
    reference: REF_ADMIN,
  },
  'surat-undangan': {
    id: 'surat-undangan',
    fields: [F_NOMOR, F_TANGGAL, { key: 'tujuanSurat', label: 'Tujuan Undangan (Yth.)', required: true }, { key: 'acara', label: 'Nama Acara', required: true }, { key: 'waktuTempat', label: 'Hari/Tanggal, Jam & Tempat', required: true, placeholder: 'mis. Senin, 2 Nov 2026, 09.00 WIB, Kantor Proyek' }],
    scaffold:
      'Struktur SURAT UNDANGAN: pembuka, maksud undangan, hari/tanggal/jam/tempat acara, agenda singkat, permohonan konfirmasi kehadiran, penutup, tanda tangan pengundang.',
    reference: REF_ADMIN,
  },
};

/** Template bawaan BARU (di luar 6 lama yang dirender via i18n di DocCreator). */
export const EXTRA_BUILTIN_TEMPLATES: Array<{ id: string; name: string; desc: string }> = [
  { id: 'bast', name: 'Berita Acara Serah Terima', desc: 'Serah terima hasil pekerjaan dari kontraktor ke pemilik, berbasis kontrak/SPK.' },
  { id: 'opname', name: 'Berita Acara Opname', desc: 'Pengukuran volume terpasang per periode dengan tabel perbandingan kontrak.' },
  { id: 'laporan-mingguan', name: 'Laporan Mingguan', desc: 'Progres mingguan: rencana vs realisasi, kendala, dan rencana minggu depan.' },
  { id: 'laporan-k3', name: 'Laporan K3', desc: 'Laporan keselamatan kerja: inspeksi, temuan, dan tindak lanjut.' },
  { id: 'surat-penawaran', name: 'Surat Penawaran', desc: 'Penawaran pekerjaan/jasa — harga hanya dari angka yang Anda berikan.' },
  { id: 'surat-undangan', name: 'Surat Undangan', desc: 'Undangan rapat/pertemuan resmi dengan agenda dan waktu yang jelas.' },
];

/* ------------------------------------------------------------------ */
/* Field values → blok deterministik                                   */
/* ------------------------------------------------------------------ */

export function missingRequiredFields(meta: DocTemplateMeta | undefined, values: Record<string, string>): string[] {
  if (!meta) return [];
  // Field yang masih bertanda subtypeIds bersifat kondisional — hanya
  // berlaku setelah template diresolusi ke subjenisnya (resolveTemplate).
  return meta.fields
    .filter((f) => f.required && !f.subtypeIds && !(values[f.key] || '').trim())
    .map((f) => f.label);
}

/** Blok data pengguna untuk prompt — AI wajib memakai nilai ini persis. */
export function buildFieldBlock(meta: DocTemplateMeta | undefined, values: Record<string, string>): string {
  if (!meta) return '';
  const lines = meta.fields
    .filter((f) => (values[f.key] || '').trim())
    .map((f) => `- ${f.label}: ${values[f.key].trim()}`);
  const parts: string[] = [];
  if (lines.length) {
    parts.push(`DATA DOKUMEN (diisi pengguna — gunakan persis, jangan diubah/dikarang):\n${lines.join('\n')}`);
  }
  if (meta.scaffold) parts.push(`KERANGKA STRUKTUR: ${meta.scaffold}`);
  if (meta.aiGuidance) parts.push(`PANDUAN KEJUJURAN ISI: ${meta.aiGuidance}`);
  return parts.join('\n');
}

/* ------------------------------------------------------------------ */
/* Template pengguna (lokal)                                           */
/* ------------------------------------------------------------------ */

export interface UserTemplate {
  id: string;
  name: string;
  desc: string;
  baseTemplateId: string;
  scaffold: string;
  /** Contoh isi (HTML) — bila ada, dokumen dimulai dari contoh ini tanpa AI. */
  sampleHtml?: string;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

const LS_UT_KEY = 'ezrab_docai_templates_v1';
const mem = new Map<string, string>();
function lsGet(k: string): string | null {
  try { if (typeof localStorage !== 'undefined') return localStorage.getItem(k); } catch { /* abaikan */ }
  return mem.get(k) ?? null;
}
function lsSet(k: string, v: string): void {
  try { if (typeof localStorage !== 'undefined') { localStorage.setItem(k, v); return; } } catch { /* abaikan */ }
  mem.set(k, v);
}

export function listUserTemplates(includeArchived = true): UserTemplate[] {
  try {
    const raw = lsGet(LS_UT_KEY);
    const arr = raw ? (JSON.parse(raw) as UserTemplate[]) : [];
    return (Array.isArray(arr) ? arr : []).filter((x) => includeArchived || !x.archived);
  } catch {
    return [];
  }
}

function persistUserTemplates(all: UserTemplate[]): void {
  lsSet(LS_UT_KEY, JSON.stringify(all));
}

export function saveUserTemplate(t: UserTemplate): UserTemplate[] {
  const all = listUserTemplates();
  const saved = { ...t, updatedAt: Date.now() };
  const i = all.findIndex((x) => x.id === saved.id);
  if (i >= 0) all[i] = saved;
  else all.push(saved);
  persistUserTemplates(all);
  return all;
}

export function deleteUserTemplate(id: string): UserTemplate[] {
  const all = listUserTemplates().filter((x) => x.id !== id);
  persistUserTemplates(all);
  return all;
}

export function newUserTemplate(partial: Partial<UserTemplate>): UserTemplate {
  return {
    id: `ut_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    desc: '',
    baseTemplateId: 'bebas',
    scaffold: '',
    archived: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...partial,
  };
}
