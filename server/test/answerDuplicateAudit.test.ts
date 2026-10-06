import { autoAnswerEngine } from '../services/autoAnswerEngine';
import { aiOrchestrator } from '../orchestrator/aiOrchestrator';

export async function runAnswerDuplicateAudit(): Promise<void> {
  console.log('\n=============================================================');
  console.log('🔍 AUDITING AI RESPONSES FOR DUPLICATES & MONOTONY');
  console.log('=============================================================\n');

  await autoAnswerEngine.initialize();

  const testQuestions = [
    // Greetings & Small talk
    { group: 'Greetings', q: 'halo' },
    { group: 'Greetings', q: 'hai' },
    { group: 'Greetings', q: 'selamat pagi' },
    { group: 'Greetings', q: 'apa kabar?' },
    { group: 'Greetings', q: 'kamu siapa?' },
    { group: 'Greetings', q: 'bisa bantu apa?' },

    // Technical construction questions
    { group: 'Tech Construction', q: 'Apa itu RAB?' },
    { group: 'Tech Construction', q: 'Apa itu QTO?' },
    { group: 'Tech Construction', q: 'Bagaimana mencari AHSP?' },
    { group: 'Tech Construction', q: 'Bagaimana menghitung volume?' },
    { group: 'Tech Construction', q: 'Bagaimana membuat laporan?' },
    { group: 'Tech Construction', q: 'Bagaimana menggunakan Kurva S?' },
    { group: 'Tech Construction', q: 'Bagaimana menyusun WBS?' },
    { group: 'Tech Construction', q: 'Bagaimana cara ekspor excel?' },

    // General questions from 9999 dataset
    { group: 'General 9999', q: 'Bagaimana cara mengatur waktu?' },
    { group: 'General 9999', q: 'Bagaimana belajar efektif?' },
    { group: 'General 9999', q: 'Bagaimana cara menjaga fokus?' },
    { group: 'General 9999', q: 'Bagaimana cara mengambil keputusan?' },
    { group: 'General 9999', q: 'Bagaimana cara mengatasi stres kerja?' },
    { group: 'General 9999', q: 'Bagaimana cara meningkatkan produktivitas tim?' },

    // Serious questions
    { group: 'Serious Procedures', q: 'Apa prosedur aman untuk memastikan akun aman?' },
    { group: 'Serious Procedures', q: 'Apa prosedur aman untuk menangani pembayaran belum terverifikasi?' },
    { group: 'Serious Procedures', q: 'Apa prosedur aman untuk menangani proyek terlambat?' },
    { group: 'Serious Procedures', q: 'Apa prosedur aman untuk memeriksa RAB terlalu tinggi?' },

    // Absurd/humor questions
    { group: 'Humor/Absurd', q: 'Bisa nggak EZRAB menghitung RAB rumah di Mars?' },
    { group: 'Humor/Absurd', q: 'Apakah EZRAB bisa membangun rumah di atas awan?' },
    { group: 'Humor/Absurd', q: 'Bisa membuat Kurva S untuk perjalanan cinta?' },
    { group: 'Humor/Absurd', q: 'Apakah ada AHSP untuk pekerjaan mengejar deadline?' },
    { group: 'Humor/Absurd', q: 'Ada AHSP untuk mengejar deadline?' },
    { group: 'Humor/Absurd', q: 'mars' },
    { group: 'Humor/Absurd', q: 'Bisa menghitung produktivitas tukang yang sedang ngopi?' }
  ];

  const answerMap = new Map<string, Array<{ group: string; q: string }>>();
  const allResults: Array<{ group: string; q: string; answer: string }> = [];

  for (const item of testQuestions) {
    const res = await aiOrchestrator.handleChat({
      workspaceId: 'ws-default-ezrab',
      projectId: 'PRJ-TROPIS-MODERN-01',
      userId: 'test-user',
      message: item.q
    });

    const ans = res.content.trim();
    allResults.push({ group: item.group, q: item.q, answer: ans });

    if (!answerMap.has(ans)) {
      answerMap.set(ans, []);
    }
    answerMap.get(ans)!.push(item);
  }

  console.log('--- ALL QUESTION-ANSWER PAIRS ---');
  for (const r of allResults) {
    console.log(`\n[${r.group}] Q: "${r.q}"\n-> A: "${r.answer.substring(0, 160)}${r.answer.length > 160 ? '...' : ''}"`);
  }

  console.log('\n=============================================================');
  console.log('📊 DUPLICATE AUDIT FINDINGS');
  console.log('=============================================================');

  let duplicateGroupCount = 0;
  for (const [ans, questions] of answerMap.entries()) {
    if (questions.length > 1) {
      duplicateGroupCount++;
      console.log(`\n❌ DUPLICATE GROUP #${duplicateGroupCount} (${questions.length} questions share same answer):`);
      questions.forEach(q => console.log(`   - [${q.group}] "${q.q}"`));
      console.log(`   Shared Answer: "${ans.substring(0, 180)}..."`);
    }
  }

  console.log('\n=============================================================');
  console.log(`Total Tested Questions : ${testQuestions.length}`);
  console.log(`Unique Answers         : ${answerMap.size}`);
  console.log(`Duplicate Answer Groups: ${duplicateGroupCount}`);
  console.log('=============================================================\n');
}

runAnswerDuplicateAudit().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
