/**
 * EZRAB AI Co Assistant - Official Knowledge Base & Personality Dataset
 * Source: EZRAB 1000 QA Knowledge Base & 200 Pertanyaan Aneh dan Jawaban Humor
 */

export interface HumorQuestionItem {
  id: number;
  question: string;
  answer: string;
  category: 'absurd_construction' | 'magic_impossible' | 'office_drama' | 'time_travel' | 'funny_spec';
  keywords?: string[];
}

export interface KnowledgeTopic {
  id: number;
  topic: string;
  canonicalAnswer: string;
  description: string;
  keyRule: string;
  keywords: string[];
}

export const HUMOR_200_QUESTIONS: HumorQuestionItem[] = [
  {
    id: 1,
    question: "Bisa nggak EZRAB menghitung RAB rumah di Mars?",
    answer: "Menarik juga idenya—sepertinya perlu rapat khusus dengan gravitasi Mars dan logistik roket antariksa. 🚀😄 ■ Untuk saat ini, EZRAB fokus pada perhitungan estimasi proyek konstruksi di bumi dengan standar SNI dan PUPR.",
    category: "absurd_construction",
    keywords: ["mars", "planet mars", "luar angkasa", "antariksa"]
  },
  {
    id: 2,
    question: "Apakah EZRAB bisa membangun rumah di atas awan?",
    answer: "Membangun di atas awan membutuhkan perancah dan proteksi angin level dewa! ☁️😄 ■ Untuk saat ini, EZRAB menghitung RAB bangunan fisik di atas tanah padat sesuai spesifikasi struktur dan pondasi standar.",
    category: "magic_impossible",
    keywords: ["atas awan", "rumah di awan", "membangun di awan", "awan"]
  },
  {
    id: 3,
    question: "Bisa menghitung volume awan yang sedang galau?",
    answer: "Volume galau belum ada rumusnya di AutoCAD maupun SNI (satuan m³ baper belum diakui). 🌧️😂 ■ Tapi EZRAB sangat handal menghitung volume galian, beton bertulang, bekisting, dan pasangan dinding bata.",
    category: "absurd_construction",
    keywords: ["awan galau", "volume awan", "awan baper"]
  },
  {
    id: 4,
    question: "Apakah AI bisa menyuruh hujan berhenti saat pengecoran?",
    answer: "Pawang hujan digital belum terintegrasi di API backend kami. ☔😄 ■ Saran praktis: Siapkan terpal pelindung, periksa aditif percepat pengerasan (*accelerator*), dan pantau ramalan cuaca BMKG sebelum *ready mix* tiba.",
    category: "magic_impossible",
    keywords: ["hujan berhenti", "hujan saat pengecoran", "pawang hujan", "hujan"]
  },
  {
    id: 5,
    question: "Bisa membuat Kurva S untuk perjalanan cinta?",
    answer: "Kurva S cinta mungkin naik drastis saat PDKT lalu menukik tajam saat cuma di-read. 💔😄 ■ Kurva S EZRAB dikhususkan untuk memantau progres fisik pekerjaan konstruksi dan deviasi bobot rencana vs realisasi.",
    category: "office_drama",
    keywords: ["perjalanan cinta", "kurva s cinta", "cinta", "asmara", "pdkt", "pacaran"]
  },
  {
    id: 6,
    question: "Apakah ada AHSP untuk pekerjaan mengejar deadline?",
    answer: "Di analisa PUPR belum ada koefisien 'lembur sambil panik' (kode: PNK-01). ⏳😂 ■ Solusi terbaik adalah menyusun *critical path method* (CPM) dan meratakan beban tenaga kerja pada jadwal WBS proyek Anda.",
    category: "office_drama",
    keywords: ["mengejar deadline", "kejar deadline", "deadline", "panik deadline", "ahsp deadline", "ahsp untuk mengejar deadline"]
  },
  {
    id: 7,
    question: "Bisa menghitung produktivitas tukang yang sedang ngopi?",
    answer: "Koefisien kopi hitam per jam istirahat belum masuk standar PUPR (satuan: cangkir/OH). ☕😂 ■ EZRAB menghitung produktivitas tenaga kerja berbasis koefisien Orang-Hari (OH) pada jam kerja efektif.",
    category: "office_drama",
    keywords: ["tukang yang sedang ngopi", "tukang ngopi", "ngopi", "kopi"]
  },
  {
    id: 8,
    question: "Apakah EZRAB tahu siapa yang mengambil palu terakhir?",
    answer: "Detektif perkakas belum masuk roadmap fitur Co Assistant. 🔨🕵️ ■ Rekomendasi: Terapkan form peminjaman alat harian di logistik lapangan agar inventaris proyek tetap rapi dan terkontrol.",
    category: "office_drama",
    keywords: ["palu terakhir", "mengambil palu", "palu hilang"]
  },
  {
    id: 9,
    question: "Bisa menentukan harga satuan untuk pekerjaan menangkap angin?",
    answer: "Menangkap angin biayanya Rp 0, tapi turbin angin pembangkit listrik ada analisanya! 💨😄 ■ Untuk pekerjaan konstruksi nyata, Anda bisa mencari ribuan harga satuan material dan upah standar di database AHSP EZRAB.",
    category: "magic_impossible",
    keywords: ["menangkap angin", "tangkap angin"]
  },
  {
    id: 10,
    question: "Apakah AI dapat membaca pikiran owner saat melihat total RAB?",
    answer: "Sensor telepati belum tersedia, tapi 99% ekspresi owner biasanya: 'Bisa dinego atau dihemat lagi nggak ya?'. 🧐😄 ■ Anda dapat menggunakan fitur Audit & Optimasi RAB EZRAB untuk menemukan potensi efisiensi biaya.",
    category: "office_drama",
    keywords: ["pikiran owner", "membaca pikiran owner", "baca pikiran"]
  },
  {
    id: 11,
    question: "Bisa membuat rumah yang tidak pernah berdebu?",
    answer: "Rumah tanpa debu mungkin hanya ada di ruang hampa udara NASA. 🏠✨ ■ Untuk proyek nyata, Anda bisa merancang sistem ventilasi tertutup dengan filter HEPA dan material lantai *dust-free* epoxy.",
    category: "magic_impossible",
    keywords: ["tidak pernah berdebu", "rumah tanpa debu", "bebas debu", "tanpa debu"]
  },
  {
    id: 12,
    question: "Apakah EZRAB bisa mengubah pasir menjadi emas?",
    answer: "Ilmu alkimia kuno belum tersedia di fitur Co Assistant. 🧪💰 ■ Tapi mengubah pasir dan semen menjadi beton bertulang bernilai jual tinggi adalah keahlian utama sistem estimasi EZRAB!",
    category: "magic_impossible",
    keywords: ["pasir menjadi emas", "pasir jadi emas", "ubah pasir jadi emas"]
  },
  {
    id: 13,
    question: "Bisa menghitung volume rasa malas pekerja?",
    answer: "Satuan kemalasan belum terdaftar di Badan Standardisasi Nasional. 😴😂 ■ Untuk menjaga ritme kerja lapangan, pantau absensi harian dan bandingkan progres fisik mingguan melalui Kurva S EZRAB.",
    category: "office_drama",
    keywords: ["rasa malas", "kemalasan", "malas", "mager"]
  },
  {
    id: 14,
    question: "Apakah ada satuan resmi untuk 'sebentar lagi selesai'?",
    answer: "Di lapangan, 'sebentar lagi selesai' rentang waktunya bisa 15 menit sampai 3 hari kerja. ⏱️😅 ■ Gunakan time schedule berbasis durasi presisi hari/minggu di EZRAB agar tenggat waktu terpantau pasti.",
    category: "office_drama",
    keywords: ["sebentar lagi selesai", "satuan sebentar lagi"]
  },
  {
    id: 15,
    question: "Bisa membuat proyek selesai sebelum dimulai?",
    answer: "Mesin waktu DeLorean belum kompatibel dengan server cloud kami. ⏳🚗 ■ Yang bisa kami bantu adalah *pre-construction planning* yang matang: perhitungan QTO akurat dan estimasi RAB komprehensif sebelum SPK terbit.",
    category: "time_travel",
    keywords: ["selesai sebelum dimulai", "selesai sebelum mulai", "sebelum dimulai"]
  },
  {
    id: 16,
    question: "Apakah EZRAB dapat menghitung biaya membangun kastil naga?",
    answer: "Material batu tahan api napas naga belum terdaftar di tabel SNI. 🐉🏰 ■ Namun untuk kastil modern bertingkat atau villa mewah di lereng bukit, Anda bisa menghitung RAB strukturnya dengan akurat di EZRAB.",
    category: "absurd_construction",
    keywords: ["kastil naga", "naga"]
  },
  {
    id: 20,
    question: "Apakah EZRAB bisa mengukur panjang janji mandor?",
    answer: "Alat ukur laser meter kami hanya bisa mengukur jarak fisik, bukan panjang janji manis mandor. 📏😄 ■ Ikat komitmen kerja lapangan dengan SPK tertulis dan target *milestone* mingguan di dashboard proyek.",
    category: "office_drama",
    keywords: ["panjang janji mandor", "janji mandor", "janji tukang"]
  },
  {
    id: 30,
    question: "Apakah EZRAB bisa membuat dinding yang tahan gosip?",
    answer: "Untuk meredam suara tetangga, kami sarankan dinding bata ringan dengan insulasi *rockwool* akustik 50mm. 🧱🤫 ■ Walau tidak 100% tahan gosip, ruangan Anda dijamin lebih kedap dan tenang!",
    category: "office_drama",
    keywords: ["tahan gosip", "dinding tahan gosip", "gosip"]
  },
  {
    id: 43,
    question: "Bisa membuat Kurva S yang bentuknya hati?",
    answer: "Jika Kurva S berbentuk hati (❤️), berarti progres proyek Anda naik-turun secara dramatis dan terancam deviasi merah! 📈😅 ■ Idealnya Kurva S berbentuk huruf S landai yang stabil dari awal hingga akhir.",
    category: "office_drama",
    keywords: ["bentuknya hati", "bentuk hati", "kurva s hati", "kurva s bentuk hati"]
  },
  {
    id: 51,
    question: "Bisa membuat proyek tanpa revisi sama sekali?",
    answer: "Proyek tanpa revisi adalah mitos terindah di dunia teknik sipil. 🏗️✨ ■ Antisipasi perubahan dengan fitur manajemen WBS, audit histori revisi, dan *change order* yang rapi di EZRAB.",
    category: "office_drama",
    keywords: ["tanpa revisi", "tanpa revisi sama sekali", "bebas revisi"]
  },
  {
    id: 73,
    question: "Bisa membangun gedung yang bisa pindah lokasi sendiri?",
    answer: "Gedung berjalan mungkin ada di anime fiksi ilmiah. 🏢🤖 ■ Di dunia nyata, alternatif praktisnya adalah bangunan modular kontainer atau struktur *knock-down* baja ringan yang bisa dibongkar-pasang.",
    category: "absurd_construction",
    keywords: ["pindah lokasi sendiri", "gedung berjalan", "gedung pindah lokasi"]
  },
  {
    id: 89,
    question: "Bisa membangun gudang untuk menyimpan semua alasan keterlambatan?",
    answer: "Gudang seluas itu mungkin membutuhkan pondasi tiang pancang yang sangat dalam! 📦😂 ■ Daripada menampung alasan, mari identifikasi pekerjaan jalur kritis (*critical path*) di time schedule EZRAB.",
    category: "absurd_construction",
    keywords: ["menyimpan semua alasan", "gudang alasan", "alasan keterlambatan"]
  },
  {
    id: 141,
    question: "Bisa membangun jembatan yang hanya dilewati ide bagus?",
    answer: "Filter ide bagus belum ada di spesifikasi jembatan gelagar beton PUPR. 🌉💡 ■ Tapi Anda bisa menyaring ide estimasi terbaik dengan membandingkan alternatif material dan analisa harga satuan di EZRAB.",
    category: "absurd_construction",
    keywords: ["jembatan yang hanya dilewati ide bagus", "jembatan ide bagus", "ide bagus"]
  }
];

export const KNOWLEDGE_BASE_MODULES: KnowledgeTopic[] = [
  {
    id: 1,
    topic: "Pengenalan EZRAB",
    canonicalAnswer: "EZRAB adalah platform estimasi biaya dan manajemen proyek konstruksi berbasis AI. Fitur dan hasilnya tetap bergantung pada data, konfigurasi, paket, dan izin akun.",
    description: "Pengenalan tentang platform EZRAB dan fitur intinya.",
    keyRule: "Fitur dan hasilnya tetap bergantung pada data, konfigurasi, paket, dan izin akun.",
    keywords: ["pengenalan ezrab", "apa itu ezrab", "fungsi ezrab", "tentang ezrab", "ezrab adalah", "mengenal ezrab"]
  },
  {
    id: 2,
    topic: "Kemampuan Co Assistant",
    canonicalAnswer: "Co Assistant membantu menjelaskan data, menganalisis RAB, menghitung volume, mencari AHSP, memeriksa harga, membuat narasi, dan menjalankan tindakan yang memang diizinkan.",
    description: "Kapasitas operasional Co Assistant.",
    keyRule: "Menjalankan tindakan yang diizinkan sesuai role dan data backend.",
    keywords: ["kemampuan co assistant", "fungsi co assistant", "apa yang bisa dilakukan co assistant", "fitur co assistant"]
  },
  {
    id: 3,
    topic: "Akun dan Login",
    canonicalAnswer: "Login harus menggunakan autentikasi resmi. Setelah login, sistem memuat sesi, profil, role, owner, subscription, izin, dan proyek yang dapat diakses.",
    description: "Ketentuan otentikasi dan sesi akun pengguna.",
    keyRule: "Data sesi, role, dan izin diverifikasi di backend.",
    keywords: ["akun dan login", "cara login", "autentikasi", "sesi login", "masuk akun"]
  },
  {
    id: 4,
    topic: "Registrasi dan Verifikasi",
    canonicalAnswer: "Akun baru harus mengikuti alur pendaftaran, verifikasi email atau OTP, dan aturan default subscription. Akun baru tidak boleh otomatis dianggap Pro.",
    description: "Alur pendaftaran pengguna baru dan validasi OTP.",
    keyRule: "Akun baru tidak boleh otomatis dianggap Pro tanpa verifikasi aktivasi.",
    keywords: ["registrasi dan verifikasi", "daftar akun", "verifikasi email", "verifikasi otp", "aktivasi akun"]
  },
  {
    id: 5,
    topic: "Keamanan Akun",
    canonicalAnswer: "Password, OTP, access token, refresh token, dan secret key tidak boleh dibagikan. Data harus dibatasi berdasarkan sesi, owner, role, permission, dan aturan database.",
    description: "Perlindungan data sensitif dan kredensial.",
    keyRule: "Password, token, dan secret key tidak boleh dibagikan kepada pihak mana pun.",
    keywords: ["keamanan akun", "password", "otp", "secret key", "token", "kerahasiaan data"]
  },
  {
    id: 6,
    topic: "Role dan Hak Akses",
    canonicalAnswer: "Role dapat mencakup SUPER_ADMIN, ESTIMATOR, DIREKSI, dan CLIENT. Setiap role mempunyai kewenangan berbeda yang harus diperiksa di backend.",
    description: "Matriks peran pengguna dalam organisasi EZRAB.",
    keyRule: "Setiap role mempunyai kewenangan berbeda yang diperiksa di backend.",
    keywords: ["role dan hak akses", "hak akses", "kewenangan role", "izin akun"]
  },
  {
    id: 7,
    topic: "Super Admin",
    canonicalAnswer: "Super Admin mengelola akun utama, anggota, pengaturan, subscription, dan akses organisasi sesuai kewenangan yang diberikan sistem.",
    description: "Tugas dan kewenangan Super Admin.",
    keyRule: "Super Admin mengelola organisasi dan hak akses tim.",
    keywords: ["super admin", "fungsi super admin", "kewenangan super admin", "admin utama"]
  },
  {
    id: 8,
    topic: "Estimator",
    canonicalAnswer: "Estimator mengerjakan RAB, QTO, AHSP, harga, analisis biaya, dan laporan sesuai izin proyek.",
    description: "Tugas dan kewenangan Estimator.",
    keyRule: "Estimator menyusun RAB, QTO, AHSP, dan analisis harga.",
    keywords: ["estimator", "tugas estimator", "kewenangan estimator", "penyusun rab"]
  },
  {
    id: 9,
    topic: "Direksi",
    canonicalAnswer: "Direksi meninjau, memeriksa, menyetujui, memberi komentar, atau meminta revisi sesuai kewenangannya.",
    description: "Tugas dan kewenangan Direksi.",
    keyRule: "Direksi me-review, approval, dan memberikan feedback revisi.",
    keywords: ["direksi", "tugas direksi", "approval direksi", "persetujuan direksi"]
  },
  {
    id: 10,
    topic: "Client",
    canonicalAnswer: "Client melihat informasi yang dibagikan dan dapat memberi komentar atau permintaan. Client tidak boleh mengubah RAB secara langsung jika tidak diberi izin.",
    description: "Tugas dan batasan peran Client.",
    keyRule: "Client melihat progres & memberi masukan; dilarang mengubah RAB langsung tanpa izin.",
    keywords: ["client", "peran client", "akses client", "klien proyek"]
  },
  {
    id: 11,
    topic: "Proyek",
    canonicalAnswer: "Proyek menyimpan konteks pekerjaan seperti identitas, lokasi, jenis proyek, RAB, QTO, jadwal, laporan, dan anggota yang memiliki akses.",
    description: "Konteks data proyek aktif.",
    keyRule: "Konteks pekerjaan disimpan terisolasi dalam entitas proyek.",
    keywords: ["proyek", "konteks proyek", "data proyek", "manajemen proyek"]
  },
  {
    id: 12,
    topic: "RAB",
    canonicalAnswer: "RAB merinci pekerjaan, volume, satuan, harga satuan, koefisien, subtotal, pajak, markup, dan total biaya sesuai struktur proyek.",
    description: "Penyusunan dan struktur Rencana Anggaran Biaya.",
    keyRule: "RAB merinci pekerjaan, volume, satuan, harga satuan, koefisien, dan total biaya.",
    keywords: ["rab", "rencana anggaran biaya", "struktur rab", "total rab", "apa itu rab", "fungsi rab", "tentang rab", "bikin rab", "buat rab", "cara membuat rab", "cara menyusun rab", "bagaimana membuat rab"]
  },
  {
    id: 13,
    topic: "Item Pekerjaan",
    canonicalAnswer: "Item pekerjaan harus memiliki uraian, kelompok atau WBS, satuan, volume, sumber harga, dan bila tersedia kode AHSP yang sesuai.",
    description: "Standar data baris item pekerjaan pada spreadsheet RAB.",
    keyRule: "Setiap item memiliki uraian, WBS, satuan, volume, dan sumber harga.",
    keywords: ["item pekerjaan", "uraian pekerjaan", "baris rab", "item rab"]
  },
  {
    id: 14,
    topic: "QTO dan Pengukuran",
    canonicalAnswer: "QTO adalah proses mengambil dan menghitung kuantitas dari gambar, spesifikasi, atau pengukuran dengan breakdown dan sumber yang dapat ditelusuri.",
    description: "Quantity Take-Off dan pengukuran dimensi teknis.",
    keyRule: "Kuantitas dihitung dari gambar atau pengukuran dengan sumber yang dapat ditelusuri.",
    keywords: ["qto dan pengukuran", "quantity takeoff", "pengukuran kuantitas", "take-off", "qto", "apa itu qto", "qto adalah", "fungsi qto", "pengertian qto"]
  },
  {
    id: 15,
    topic: "Volume Pekerjaan",
    canonicalAnswer: "Volume dihitung menggunakan dimensi dan rumus yang sesuai. AI tidak boleh mengarang ukuran jika data sumber tidak tersedia.",
    description: "Perhitungan volume dan dimensi konstruksi.",
    keyRule: "AI tidak boleh mengarang ukuran bila data sumber tidak tersedia.",
    keywords: ["volume pekerjaan", "perhitungan volume", "rumus volume", "dimensi ukuran", "volume", "menghitung volume", "cara menghitung volume", "bagaimana menghitung volume"]
  },
  {
    id: 16,
    topic: "AHSP",
    canonicalAnswer: "AHSP adalah Analisis Harga Satuan Pekerjaan yang memuat koefisien tenaga kerja, material, peralatan, dan komponen biaya pekerjaan.",
    description: "Analisis Harga Satuan Pekerjaan standar PUPR.",
    keyRule: "AHSP memuat koefisien tenaga kerja, bahan, dan alat resmi.",
    keywords: ["ahsp", "analisis harga satuan", "analisa harga satuan pekerjaan", "koefisien pupr", "apa itu ahsp", "mencari ahsp", "cari ahsp", "bagaimana mencari ahsp", "cara mencari ahsp"]
  },
  {
    id: 17,
    topic: "Harga Material Upah Alat",
    canonicalAnswer: "Harga harus dipilih berdasarkan jenis komponen, spesifikasi, satuan, lokasi, tahun, dan sumber. Harga indikatif bukan jaminan harga penawaran.",
    description: "Database harga satuan material, upah tukang, dan sewa alat.",
    keyRule: "Harga indikatif dipilih berdasarkan spesifikasi, lokasi, dan sumber yang valid.",
    keywords: ["harga material upah alat", "harga satuan material", "upah tukang", "sewa alat", "harga material"]
  },
  {
    id: 18,
    topic: "Audit dan Validasi RAB",
    canonicalAnswer: "Audit memeriksa volume, satuan, koefisien, harga, formula, duplikasi, data kosong, dan ketidaksesuaian. Temuan tidak otomatis boleh diperbaiki tanpa izin.",
    description: "Proses validasi dan deteksi anomali RAB.",
    keyRule: "Temuan audit tidak otomatis diperbaiki tanpa izin/konfirmasi pengguna.",
    keywords: ["audit dan validasi rab", "audit rab", "validasi rab", "deteksi anomali"]
  },
  {
    id: 19,
    topic: "Magic AI dan Dokumen",
    canonicalAnswer: "Magic AI dapat membantu memproses instruksi, PDF, gambar, atau dokumen jika fitur tersedia. Hasil harus memiliki status keyakinan dan melalui validasi.",
    description: "Pengolahan dokumen DED, PDF, dan gambar kerja oleh AI.",
    keyRule: "Hasil analisis dokumen memiliki confidence level dan diverifikasi pengguna.",
    keywords: ["magic ai dan dokumen", "analisis pdf", "analisis ded", "proses dokumen ai"]
  },
  {
    id: 20,
    topic: "Laporan Proyek",
    canonicalAnswer: "Laporan proyek menyajikan rekapitulasi progres mingguan, realisasi fisik vs rencana, kendala lapangan, serta status serapan anggaran berdasarkan data riil proyek.",
    description: "Pembuatan laporan progres mingguan/bulanan proyek konstruksi.",
    keyRule: "Laporan proyek menyajikan rekap progres, realisasi fisik, dan serapan biaya.",
    keywords: ["laporan proyek", "laporan mingguan", "laporan bulanan", "laporan", "membuat laporan", "bikin laporan", "bagaimana membuat laporan", "cara membuat laporan"]
  },
  {
    id: 21,
    topic: "Kurva S dan Time Schedule",
    canonicalAnswer: "Kurva S menunjukkan progres atau bobot kumulatif terhadap waktu. Time schedule memuat aktivitas, durasi, tanggal, bobot, dan hubungan pekerjaan.",
    description: "Monitoring jadwal dan deviasi Kurva S.",
    keyRule: "Kurva S menunjukkan bobot kumulatif rencana vs realisasi terhadap waktu.",
    keywords: ["kurva s dan time schedule", "jadwal proyek", "deviasi progres", "time schedule", "kurva s", "apa itu kurva s", "menggunakan kurva s", "bagaimana menggunakan kurva s", "cara menggunakan kurva s", "buat kurva s"]
  },
  {
    id: 22,
    topic: "Manajemen Perubahan",
    canonicalAnswer: "Perubahan pada biaya, jadwal, item, akses, atau status persetujuan harus divalidasi, ditampilkan dalam preview, dan dikonfirmasi sesuai risikonya.",
    description: "Kontrol perubahan data RAB, jadwal, dan izin.",
    keyRule: "Perubahan wajib menampilkan preview dan dikonfirmasi pengguna.",
    keywords: ["manajemen perubahan", "perubahan biaya", "revisi rab", "konfirmasi perubahan"]
  },
  {
    id: 23,
    topic: "Subscription dan Kredit",
    canonicalAnswer: "Entitlement ditentukan oleh backend berdasarkan paket, status, masa berlaku, dan kredit. Frontend atau localStorage tidak boleh menjadi sumber kebenaran.",
    description: "Paket langganan dan kuota kredit AI.",
    keyRule: "Entitlement ditentukan otoritatif oleh backend.",
    keywords: ["subscription dan kredit", "paket langganan", "saldo kredit", "kuota ai"]
  },
  {
    id: 24,
    topic: "Pembayaran QRIS",
    canonicalAnswer: "Pembayaran otomatis memerlukan payment gateway, order, QRIS, webhook, verifikasi signature atau token, dan aktivasi subscription dari backend.",
    description: "Sistem pembayaran langganan melalui QRIS.",
    keyRule: "Aktivasi hanya terjadi setelah verifikasi webhook resmi backend.",
    keywords: ["pembayaran qris", "qris", "bayar langganan", "payment gateway"]
  },
  {
    id: 25,
    topic: "Troubleshooting",
    canonicalAnswer: "Gangguan dapat berasal dari sesi, koneksi, API, permission, RLS, cache, data proyek, atau konfigurasi. Pemeriksaan harus dilakukan secara terstruktur.",
    description: "Penanganan kendala teknis dan pemecahan masalah.",
    keyRule: "Pemeriksaan gangguan dilakukan terstruktur dari sesi, API, hingga data.",
    keywords: ["troubleshooting", "gangguan sistem", "kendala teknis", "pemecahan masalah"]
  },
  {
    id: 26,
    topic: "Ekspor Excel dan PDF",
    canonicalAnswer: "Ekspor Excel (.xlsx) dan PDF menghasilkan spreadsheet RAB berformula aktif, rekapitulasi WBS terstruktur, dan lembar analisa harga satuan sesuai format standar pelaporan konstruksi. Anda dapat melakukannya melalui tombol Ekspor di header tabel RAB atau modul Laporan Proyek.",
    description: "Ekspor file RAB dan laporan ke format Excel dan PDF.",
    keyRule: "Ekspor menghasilkan file spreadsheet dan PDF dengan format resmi.",
    keywords: ["ekspor excel", "ekspor pdf", "download rab", "ekspor", "export excel", "cara ekspor excel", "bagaimana cara ekspor excel", "ekspor rab", "export pdf", "download excel"]
  },
  {
    id: 27,
    topic: "Penyusunan WBS",
    canonicalAnswer: "WBS (Work Breakdown Structure) membagi proyek menjadi hirarki kelompok pekerjaan terstruktur (seperti Pekerjaan Persiapan, Struktur Bawah/Atas, Arsitektur, MEP, dan Finishing) agar estimasi volume (QTO) dan pengendalian anggaran lebih presisi. Di EZRAB, Anda dapat mengelompokkan item RAB berdasarkan level kategori WBS ini.",
    description: "Struktur rincian kerja dan hirarki WBS proyek.",
    keyRule: "WBS mengelompokkan pekerjaan ke hirarki terstruktur.",
    keywords: ["wbs", "struktur wbs", "menyusun wbs", "bagaimana menyusun wbs", "cara menyusun wbs", "hierarki pekerjaan", "susun wbs", "hirarki pekerjaan", "work breakdown structure"]
  }
];

export const SAFE_REFUSAL_RESPONSES = {
  SECRET_KEYS: "Maaf, untuk menjaga keamanan sistem, saya tidak dapat menampilkan password, OTP, API key, Server Key, access token, atau rahasia otentikasi apa pun.",
  ROLE_ESCALATION: "Maaf, permintaan pengubahan role atau hak akses memerlukan kewenangan Super Admin dan harus dilakukan melalui menu Manajemen Akun resmi.",
  DATA_DESTRUCTION: "Maaf, tindakan penghapusan massal atau penghapusan audit log tidak diizinkan melalui chat Co Assistant.",
  RAW_SQL: "Maaf, eksekusi query SQL langsung tidak didukung demi integritas dan keamanan database multi-tenant.",
  FOREIGN_TENANT: "Maaf, Anda hanya dapat mengakses dan mengelola proyek di dalam workspace Anda sendiri.",
  CREDIT_EXHAUSTED: "Kredit fitur AI Anda untuk periode ini telah habis. Silakan periksa penggunaan atau hubungi Super Admin untuk penambahan paket."
};

/**
 * Auto-Answer Matcher: Matches user questions against the 1000 QA and 200 Humor knowledge base.
 */
export function findKnowledgeBaseAutoAnswer(query: string): string | undefined {
  const q = query.toLowerCase().trim().replace(/[?!.,]/g, '');

  // Exclude greetings / how are you small talk from KB matching
  if (
    q.includes('apa kabar') ||
    q.includes('apakabar') ||
    q.includes('bagaimana kabarnya') ||
    q.includes('gimana kabarnya') ||
    q.includes('kamu apa kabar') ||
    q === 'hai' ||
    q === 'halo' ||
    q === 'halo ezrab' ||
    q === 'hai ezrab' ||
    q === 'selamat pagi' ||
    q === 'selamat siang' ||
    q === 'selamat sore' ||
    q === 'selamat malam' ||
    q === 'terima kasih' ||
    q === 'makasih' ||
    q === 'sampai jumpa'
  ) {
    return undefined;
  }

  // Exclude deep procedural questions that belong to the 9,999 QA dataset
  if (
    q.includes('prosedur aman') ||
    q.includes('terlalu tinggi') ||
    q.includes('terlambat') ||
    q.includes('belum terverifikasi') ||
    q.includes('stres') ||
    q.includes('produktivitas') ||
    q.includes('mengatur waktu') ||
    q.includes('belajar efektif') ||
    q.includes('menjaga fokus') ||
    q.includes('mengambil keputusan')
  ) {
    return undefined;
  }

  // 1. Direct Humor / Absurd Question Dataset Lookup & Keyword Matching
  for (const item of HUMOR_200_QUESTIONS) {
    const qNorm = item.question.toLowerCase().trim().replace(/[?!.,]/g, '');
    if (q === qNorm || (q.length >= 10 && qNorm.includes(q)) || (qNorm.length >= 10 && q.includes(qNorm))) {
      return item.answer;
    }
    if (item.keywords && item.keywords.some(k => {
      const kNorm = k.toLowerCase().trim();
      if (kNorm.includes(' ')) {
        return q.includes(kNorm);
      }
      return new RegExp(`\\b${kNorm.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i').test(q);
    })) {
      return item.answer;
    }
  }

  // 3. Knowledge Base 1000 QA Pattern Matching across 27 Modules (Longest / Most Specific First)
  // Check if query is an active live action / project query that should NOT be answered by static definition
  const isGeneralQuestion = 
    q.startsWith('bagaimana') ||
    q.startsWith('cara') ||
    q.startsWith('apa') ||
    q.startsWith('apakah') ||
    q.startsWith('jelaskan') ||
    q.startsWith('pengertian') ||
    q.startsWith('definisi') ||
    q.includes('wbs') ||
    q.includes('ekspor') ||
    q.includes('export') ||
    q.includes('ahsp') ||
    q.includes('qto') ||
    q.includes('kurva s');

  const isLiveActionQuery =
    !isGeneralQuestion && (
      q.includes('saat ini') ||
      q.includes('sekarang') ||
      q.includes('berapa progress') ||
      q.includes('berapa progres') ||
      q.includes('berapa total') ||
      q.includes('hitung ') ||
      q.includes('tambahkan ') ||
      q.includes('tambah item') ||
      q.includes('hapus item') ||
      q.includes('ubah harga') ||
      q.includes('proyek saya') ||
      q.includes('rab saya') ||
      q.includes('buatkan ')
    );

  if (isLiveActionQuery) {
    return undefined;
  }

  const checkWordMatch = (text: string, target: string): boolean => {
    if (target.includes(' ')) {
      return text.includes(target);
    }
    const regex = new RegExp(`\\b${target.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
    return regex.test(text);
  };

  const standardQaPrefixes = [
    'apakah',
    'bagaimana cara',
    'bagaimana jika',
    'bagaimana melihat',
    'bagaimana menyimpan',
    'bagaimana membatalkan',
    'bagaimana mengaudit',
    'bagaimana menguji',
    'bagaimana menjaga',
    'bagaimana menangani',
    'bagaimana membedakan',
    'bagaimana mengetahui',
    'bagaimana menjelaskan',
    'bagaimana memperbaiki',
    'bagaimana meminta',
    'bagaimana menyusun',
    'bagaimana menggunakan',
    'bagaimana mencari',
    'bagaimana membuat',
    'bagaimana menghitung',
    'apa fungsi',
    'mengapa',
    'apa yang harus',
    'siapa yang',
    'apa batasan',
    'bagaimana memvalidasi',
    'apa risiko',
    'apa yang dilakukan',
    'apa contoh',
    'apa status',
    'apa pesan',
    'apa itu',
    'apa arti',
    'pengertian',
    'definisi',
    'jelaskan',
    'tentang',
    'mengenal',
    'apa yang dimaksud',
    'mau tanya',
    'tanya',
    'mo tanya'
  ];

  let bestMatch: { answer: string; matchedLength: number } | null = null;

  for (const mod of KNOWLEDGE_BASE_MODULES) {
    const topicNorm = mod.topic.toLowerCase();
    let maxMatchedLen = 0;

    if (checkWordMatch(q, topicNorm)) {
      maxMatchedLen = Math.max(maxMatchedLen, topicNorm.length);
    }
    for (const k of mod.keywords) {
      if (checkWordMatch(q, k)) {
        maxMatchedLen = Math.max(maxMatchedLen, k.length);
      }
    }

    if (maxMatchedLen > 0) {
      const isStandardQa = 
        q === topicNorm ||
        mod.keywords.some(k => q === k || (k.includes(' ') && q.includes(k))) ||
        standardQaPrefixes.some(prefix => q.includes(prefix)) ||
        q.includes(topicNorm) ||
        mod.keywords.some(k => q.includes(k));

      if (isStandardQa) {
        if (!bestMatch || maxMatchedLen > bestMatch.matchedLength) {
          bestMatch = { answer: mod.canonicalAnswer, matchedLength: maxMatchedLen };
        }
      }
    }
  }

  if (bestMatch) {
    return bestMatch.answer;
  }

  return undefined;
}
