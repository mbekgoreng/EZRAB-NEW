import { HUMOR_200_QUESTIONS, SAFE_REFUSAL_RESPONSES, findKnowledgeBaseAutoAnswer } from '../data/knowledgeBaseData';

export type PersonalityTone =
  | 'SERIOUS'
  | 'CASUAL'
  | 'JOKING'
  | 'CONFUSED'
  | 'FRUSTRATED'
  | 'URGENT'
  | 'SECURITY_SENSITIVE';

export interface PersonalityEvaluation {
  tone: PersonalityTone;
  isHumorAllowed: boolean;
  humorResponse?: string;
  isSecuritySensitive: boolean;
  safeRefusal?: string;
  styleInstructions: string;
}

export class PersonalityEngine {
  /**
   * Evaluate message for tone, security sensitivity, humor potential, knowledge auto-answer, and safe refusal
   */
  public evaluate(message: string): PersonalityEvaluation {
    const q = message.toLowerCase().trim();

    // 1. Check Explicit Adversarial / Attack / Data Exfiltration (STRICT NO HUMOR)
    const isSecuritySensitive = this.detectSecuritySensitivity(q);
    if (isSecuritySensitive) {
      const refusal = this.getSecurityRefusal(q);
      return {
        tone: 'SECURITY_SENSITIVE',
        isHumorAllowed: false,
        isSecuritySensitive: true,
        safeRefusal: refusal,
        styleInstructions: 'Tegas, profesional, aman, tolak dengan sopan tanpa humor.'
      };
    }

    // 2. Check Knowledge Base Auto-Answers (1000 QA & 200 Humor Dataset)
    const kbAutoAnswer = findKnowledgeBaseAutoAnswer(message);
    if (kbAutoAnswer) {
      const isHumor = kbAutoAnswer.includes('cabang di planet lain') || kbAutoAnswer.includes('rapat kecil dengan gravitasi');
      return {
        tone: isHumor ? 'JOKING' : 'SERIOUS',
        isHumorAllowed: isHumor,
        humorResponse: kbAutoAnswer,
        isSecuritySensitive: false,
        styleInstructions: isHumor
          ? 'Gunakan humor ringan yang ramah, lalu jelaskan batasan fitur dan tawarkan alternatif konstruksi nyata.'
          : 'Jawaban resmi akurat berbasis knowledge base standar EZRAB.'
      };
    }

    // 3. Check for Greetings / Sapaan Umum
    const greetingMatch = this.detectGreeting(q);
    if (greetingMatch) {
      return {
        tone: 'CASUAL',
        isHumorAllowed: false,
        isSecuritySensitive: false,
        humorResponse: greetingMatch,
        styleInstructions: 'Ramah, natural, singkat, responsif, jangan berikan penjelasan teknis panjang.'
      };
    }

    // 4. Check for "Apa Kabar?" / How are you
    const howAreYouMatch = this.detectHowAreYou(q);
    if (howAreYouMatch) {
      return {
        tone: 'CASUAL',
        isHumorAllowed: false,
        isSecuritySensitive: false,
        humorResponse: howAreYouMatch,
        styleInstructions: 'Ramah, bersahabat, tawarkan bantuan secara ringan tanpa mengklaim emosi/tubuh manusia.'
      };
    }

    // 5. Check for Thanks / Terima Kasih
    const thanksMatch = this.detectThanks(q);
    if (thanksMatch) {
      return {
        tone: 'CASUAL',
        isHumorAllowed: false,
        isSecuritySensitive: false,
        humorResponse: thanksMatch,
        styleInstructions: 'Sopan, apresiatif, ramah, singkat.'
      };
    }

    // 6. Check for Goodbye / Salam Penutup
    const goodbyeMatch = this.detectGoodbye(q);
    if (goodbyeMatch) {
      return {
        tone: 'CASUAL',
        isHumorAllowed: false,
        isSecuritySensitive: false,
        humorResponse: goodbyeMatch,
        styleInstructions: 'Hangat, sopan, mendoakan kelancaran proyek.'
      };
    }

    // 7. Check for Small Talk / Percakapan Ringan
    const smallTalkMatch = this.detectSmallTalk(q);
    if (smallTalkMatch) {
      return {
        tone: 'CASUAL',
        isHumorAllowed: false,
        isSecuritySensitive: false,
        humorResponse: smallTalkMatch,
        styleInstructions: 'Menemani dengan ramah, arahkan ke fitur EZRAB secara natural.'
      };
    }

    // 8. Check for AI Identity queries
    const identityMatch = this.detectIdentityQuery(q);
    if (identityMatch) {
      return {
        tone: 'SERIOUS',
        isHumorAllowed: false,
        isSecuritySensitive: false,
        humorResponse: identityMatch,
        styleInstructions: 'Jelaskan identitas resmi sebagai EZRAB Magic AI / AI Co Assistant dan fitur-fitur konstruksi yang nyata.'
      };
    }

    // 9. Check for AI Capability queries
    const capabilityMatch = this.detectCapabilityQuery(q);
    if (capabilityMatch) {
      return {
        tone: 'SERIOUS',
        isHumorAllowed: false,
        isSecuritySensitive: false,
        humorResponse: capabilityMatch,
        styleInstructions: 'Jelaskan cakupan fitur RAB, QTO, AHSP, Kurva S, dan laporan proyek.'
      };
    }

    // 10. Check for Time & Date queries
    const timeMatch = this.detectTimeQuery(q);
    if (timeMatch) {
      return {
        tone: 'CASUAL',
        isHumorAllowed: false,
        isSecuritySensitive: false,
        humorResponse: timeMatch,
        styleInstructions: 'Gunakan waktu sistem nyata secara akurat.'
      };
    }

    // 11. Check for Strange / Absurd / Humorous Questions (Fallback pattern)
    const humorMatch = this.findHumorMatch(q);
    if (humorMatch) {
      return {
        tone: 'JOKING',
        isHumorAllowed: true,
        humorResponse: humorMatch,
        isSecuritySensitive: false,
        styleInstructions: 'Gunakan humor ringan yang ramah, lalu jelaskan batasan fitur dan tawarkan alternatif konstruksi nyata.'
      };
    }

    // 7. Frustrated / Confused / Urgent / Serious / Casual detection
    if (q.includes('bingung') || q.includes('tidak mengerti') || q.includes('maksudnya') || q.includes('gimana sih') || q.includes('mulai dari mana')) {
      return {
        tone: 'CONFUSED',
        isHumorAllowed: false,
        isSecuritySensitive: false,
        styleInstructions: 'Jelaskan secara sederhana, langkah demi langkah, sabar dan solutif.'
      };
    }

    if (q.includes('rusak') || q.includes('error') || q.includes('gagal terus') || q.includes('kesal') || q.includes('kenapa salah')) {
      return {
        tone: 'FRUSTRATED',
        isHumorAllowed: false,
        isSecuritySensitive: false,
        styleInstructions: 'Tenang, empatik, fokus langsung pada solusi teknis tanpa menyalahkan user.'
      };
    }

    if (q.includes('cepat') || q.includes('urgent') || q.includes('segera') || q.includes('deadline') || q.includes('sekarang juga')) {
      return {
        tone: 'URGENT',
        isHumorAllowed: false,
        isSecuritySensitive: false,
        styleInstructions: 'Langsung berikan langkah praktis dan poin penting tanpa basa-basi berlebih.'
      };
    }

    if (q.includes('haha') || q.includes('wkwk') || q.includes('lucu') || q.includes('bercanda') || q.includes('joke')) {
      return {
        tone: 'JOKING',
        isHumorAllowed: true,
        isSecuritySensitive: false,
        styleInstructions: 'Boleh membalas dengan santai dan humor ringan yang relevan dengan dunia proyek.'
      };
    }

    // Default tone: Serious for technical estimation, Casual for general chat
    return {
      tone: 'CASUAL',
      isHumorAllowed: false,
      isSecuritySensitive: false,
      styleInstructions: 'Komunikatif, profesional, ringkas, mudah dipahami, akurat.'
    };
  }

  private detectSecuritySensitivity(q: string): boolean {
    const sensitiveTerms = [
      'password',
      'otp',
      'api key',
      'apikey',
      'server key',
      'server_key',
      'service_role',
      'service_role_key',
      'access token',
      'refresh token',
      'secret key',
      'bypass payment',
      'bypass kredit',
      'bypass credit',
      'bypass auth',
      'bypass permission',
      'sql injection',
      'drop table',
      'drop database',
      'delete from',
      'hapus database',
      'hapus audit log',
      'buka data user lain',
      'lihat project user lain',
      'data proyek user lain',
      'data user lain',
      'user lain',
      'workspace lain',
      'ubah saya jadi super admin',
      'ubah role saya jadi super admin',
      'ubah role',
      'ganti role',
      'jadikan saya admin',
      'jadikan super admin',
      'role escalation',
      'curi data',
      'curi',
      'intip data'
    ];
    return sensitiveTerms.some(term => q.includes(term));
  }

  private getSecurityRefusal(q: string): string {
    if (q.includes('password') || q.includes('otp') || q.includes('token') || q.includes('server key') || q.includes('api key') || q.includes('secret')) {
      return SAFE_REFUSAL_RESPONSES.SECRET_KEYS;
    }
    if (q.includes('role') || q.includes('super admin') || q.includes('escalation')) {
      return SAFE_REFUSAL_RESPONSES.ROLE_ESCALATION;
    }
    if (q.includes('drop') || q.includes('hapus database') || q.includes('audit log')) {
      return SAFE_REFUSAL_RESPONSES.DATA_DESTRUCTION;
    }
    if (q.includes('sql') || q.includes('select *') || q.includes('query mentah')) {
      return SAFE_REFUSAL_RESPONSES.RAW_SQL;
    }
    if (q.includes('user lain') || q.includes('workspace lain')) {
      return SAFE_REFUSAL_RESPONSES.FOREIGN_TENANT;
    }
    return 'Permintaan ini tidak dapat diproses demi mematuhi kebijakan keamanan dan integritas data EZRAB.';
  }

  private findHumorMatch(q: string): string | undefined {
    // 1. Direct dataset lookup
    for (const item of HUMOR_200_QUESTIONS) {
      if (q.includes(item.question.toLowerCase().slice(0, 20))) {
        return item.answer;
      }
    }

    // 2. Pattern detection for absurd queries
    if (q.includes('mars') || q.includes('luar angkasa') || q.includes('alien') || q.includes('ufo')) {
      return 'Menarik juga idenya—sepertinya perlu rapat khusus dengan gravitasi dan logistik roket. 🚀😄 ■ Untuk saat ini, EZRAB fokus pada perhitungan estimasi proyek konstruksi di bumi.';
    }
    if (q.includes('rumah di atas awan') || q.includes('mengecat langit') || q.includes('tangga ke bintang') || q.includes('pelangi')) {
      return 'Kalau proyeknya di atas awan, spek perancah dan K3-nya luar biasa tinggi! ☁️😄 ■ EZRAB saat ini menghitung RAB proyek fisik berbasis SNI dan PUPR.';
    }
    if (q.includes('rasa malas') || q.includes('mager') || q.includes('ngopi tukang') || q.includes('janji mandor')) {
      return 'Untuk rasa malas, satuannya belum tersedia di AHSP—mungkin mager/hari. 😂 ■ EZRAB menghitung produktivitas kerja berdasarkan koefisien standar OH (Orang-Hari) pada jam kerja riil.';
    }
    if (q.includes('perjalanan cinta') || q.includes('hati') || q.includes('patah hati') || q.includes('jodoh')) {
      return 'Kurvanya mungkin naik saat chat dibalas dan turun saat cuma di-read. 💔😄 ■ Kurva S EZRAB dikhususkan untuk memantau progres fisik pekerjaan konstruksi.';
    }

    return undefined;
  }

  public detectGreeting(q: string): string | undefined {
    const raw = q.trim().replace(/[?!.,]/g, '').toLowerCase();

    // 1. Time-specific greetings
    if (raw.includes('pagi') || raw.includes('selamat pagi')) {
      return "Selamat pagi! Saya EZRAB Magic AI. Semangat beraktivitas! Ada estimasi biaya atau RAB proyek yang ingin kita tinjau pagi ini?";
    }
    if (raw.includes('siang') || raw.includes('selamat siang')) {
      return "Selamat siang! Saya EZRAB Magic AI. Siap membantu kelancaran perhitungan QTO, RAB, atau analisa harga proyek Anda.";
    }
    if (raw.includes('sore') || raw.includes('selamat sore')) {
      return "Selamat sore! Bagaimana progres proyek hari ini? Ada yang ingin direkap atau dianalisis bersama EZRAB?";
    }
    if (raw.includes('malam') || raw.includes('selamat malam')) {
      return "Selamat malam! Tetap siap mendampingi pekerjaan estimasi dan perencanaan proyek konstruksi Anda di EZRAB. Ada yang bisa dibantu?";
    }
    if (raw.includes('assalamualaikum') || raw.includes('assalamu\'alaikum') || raw.includes('assalammualaikum')) {
      return "Wa'alaikumsalam! Selamat datang di EZRAB Magic AI. Ada yang bisa saya bantu terkait RAB, AHSP, atau manajemen proyek Anda?";
    }

    // 2. Capability / Assistance Greetings
    if (raw.includes('bisa bantu apa') || raw.includes('ada yang bisa bantu') || raw.includes('bisa bantu?') || raw.includes('bisa tolong')) {
      return "Saya dapat membantu Anda menghitung volume pekerjaan (QTO), menyusun RAB, mencocokkan AHSP PUPR 2026, memantau Kurva S, hingga membuat laporan proyek. Mau mulai dari fitur mana?";
    }

    // 3. Short casual greetings
    if (raw === 'hai' || raw === 'hi' || raw === 'hai ai' || raw === 'hi ai' || raw === 'hai ezrab') {
      return "Hai! Senang menyapa Anda. Ada proyek atau perhitungan anggaran yang ingin kita kerjakan hari ini?";
    }

    if (raw === 'yo' || raw === 'yow' || raw === 'hei' || raw === 'hey' || raw === 'hey ai') {
      return "Halo! Saya EZRAB Magic AI siap membantu. Ada yang bisa saya bantu untuk estimasi proyek Anda?";
    }

    const generalGreetings = [
      'halo', 'hallow', 'hello', 'halo ai', 'halo ezrab', 'permisi', 'test', 'tes', 'cek',
      'ada orang', 'ada ai', 'bisa dengar', 'kamu aktif', 'kamu online', 'apakah kamu ada',
      'bot', 'ai', 'hello there', 'p', 'ping', 'test 1 2 3', 'localhost', 'local host'
    ];

    if (generalGreetings.includes(raw) || (raw.length <= 15 && generalGreetings.some(g => raw === g || raw.startsWith(g + ' ') || raw.endsWith(' ' + g)))) {
      return "Halo! Saya EZRAB Magic AI. Ada yang ingin Anda tanyakan tentang proyek, RAB, QTO, AHSP, atau manajemen proyek?";
    }
    return undefined;
  }

  public detectHowAreYou(q: string): string | undefined {
    const queries = [
      'apa kabar', 'apakabar', 'bagaimana kabarnya', 'gimana kabarnya', 'kamu apa kabar',
      'ai, apa kabar', 'ai apa kabar', 'ezrab apa kabar', 'sehat', 'kamu sehat',
      'baik-baik saja', 'lagi sibuk', 'lagi ngapain', 'sedang apa', 'kamu lagi apa',
      'lagi apa', 'bagaimana keadaanmu', 'kabarmu bagaimana', 'semua baik', 'hari ini bagaimana',
      'bagaimana harimu', 'apakah kamu baik-baik saja', 'are you okay', 'kabar?'
    ];
    if (queries.some(term => q.includes(term))) {
      return "Saya baik dan siap membantu Anda di EZRAB. Mau membahas RAB, QTO, AHSP, Kurva S, laporan proyek, atau hal lainnya?";
    }
    return undefined;
  }

  public detectThanks(q: string): string | undefined {
    const thanksTerms = [
      'terima kasih', 'terimakasih', 'makasih', 'thanks', 'thank you', 'syukran', 'matur nuwun', 'kamsia', 'makasih ya'
    ];
    if (thanksTerms.some(term => q.includes(term))) {
      return "Sama-sama! Senang bisa membantu Anda di EZRAB. Ada lagi yang perlu dihitung atau diperiksa?";
    }
    return undefined;
  }

  public detectGoodbye(q: string): string | undefined {
    const goodbyeTerms = [
      'sampai jumpa', 'dadah', 'bye', 'goodbye', 'selamat tinggal', 'see you', 'pamit'
    ];
    if (goodbyeTerms.some(term => q.includes(term))) {
      return "Sampai jumpa! Semoga proyek Anda berjalan lancar dan sukses selalu. Jangan ragu untuk menyapa saya kembali jika butuh bantuan.";
    }
    return undefined;
  }

  public detectSmallTalk(q: string): string | undefined {
    const smallTalkTerms = [
      'temani saya', 'temanin saya', 'lagi sibuk', 'capek tidak', 'saya sedang bosan', 'bosan nih', 'ngobrol yuk', 'semangat'
    ];
    if (smallTalkTerms.some(term => q.includes(term))) {
      return "Saya selalu siap menemani dan membantu pekerjaan estimasi serta pengelolaan proyek Anda di EZRAB. Apa yang sedang ingin Anda kerjakan hari ini?";
    }
    return undefined;
  }

  public detectIdentityQuery(q: string): string | undefined {
    const identityTerms = [
      'kamu siapa', 'siapa kamu', 'kamu itu apa', 'apa nama kamu', 'namamu siapa',
      'kamu ai apa', 'kamu bot', 'kamu manusia', 'kamu robot', 'kamu chatgpt',
      'kamu ezrab', 'apa itu ezrab ai', 'apa itu ezrab magic ai', 'ezrab magic ai itu apa'
    ];
    if (identityTerms.some(term => q.includes(term))) {
      return "Saya adalah **EZRAB Magic AI**, asisten digital cerdas resmi untuk estimasi konstruksi, penyusunan RAB, perhitungan QTO, analisa harga satuan (AHSP standar PUPR), analisis DED, Kurva S, dan laporan proyek di platform EZRAB.";
    }
    return undefined;
  }

  public detectCapabilityQuery(q: string): string | undefined {
    const capTerms = [
      'kamu bisa apa', 'apa yang bisa kamu lakukan', 'bisa bantu apa', 'bisa apa saja',
      'fungsi kamu apa', 'fitur apa saja', 'kemampuan kamu apa', 'kamu dapat membantu apa'
    ];
    if (capTerms.some(term => q.includes(term))) {
      return `Saya dapat membantu Anda dalam:
1. **Penyusunan & Optimasi RAB**: Menghitung anggaran dan mendeteksi anomali biaya.
2. **Quantity Take-Off (QTO)**: Menghitung volume pekerjaan dari spesifikasi atau gambar kerja DED.
3. **Analisa Harga Satuan (AHSP)**: Mengintegrasikan koefisien material, upah, dan alat sesuai standar PUPR 2026.
4. **Kurva S & Jadwal**: Memantau progres mingguan dan deviasi keterlambatan proyek.
5. **Laporan Proyek**: Menyusun draf laporan mingguan proyek secara otomatis.

Ada bagian pekerjaan yang ingin kita mulai sekarang?`;
    }
    return undefined;
  }

  public detectTimeQuery(q: string): string | undefined {
    const timeTerms = ['jam berapa sekarang', 'sekarang jam berapa', 'hari ini tanggal berapa', 'sekarang tanggal berapa', 'besok hari apa'];
    if (timeTerms.some(term => q.includes(term))) {
      const now = new Date();
      const dateStr = now.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      return `Saat ini adalah hari **${dateStr}**, pukul **${timeStr} WIB**. Sistem EZRAB beroperasi normal dan siap membantu pekerjaan Anda.`;
    }
    return undefined;
  }
}

export const personalityEngine = new PersonalityEngine();
