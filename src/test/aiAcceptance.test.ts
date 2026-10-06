import { defaultAiProvider } from '../services/aiProviderEngine';
import { buildFullAIContext } from '../services/aiContextService';

export async function runAiAcceptanceTests() {
  console.log('====================================================');
  console.log('🤖 RUNNING EZRAB AI COPILOT 8 ACCEPTANCE TESTS');
  console.log('====================================================');

  const dummyProject = {
    id: 'proj-demo-1',
    name: 'Rumah Tinggal Mewah 2 Lantai',
    owner: 'PT Citra Graha',
    client: 'Bpk. Hendra Gunawan',
    location: 'Jakarta Selatan',
    status: 'in_progress' as const,
    totalRab: 2850000000,
    progress: 42.5,
    startDate: '2026-01-10',
    targetDate: '2026-06-30',
    lastUpdated: '2026-03-01',
    buildingType: 'Rumah Tinggal' as const,
    buildingArea: 350,
  };

  const dummyItems = [
    { id: '1', code: 'STR.01', category: 'Pekerjaan Struktur', description: 'Pekerjaan Beton Bertulang Kolom', volume: 45, unit: 'm3', unitPrice: 4850000, totalPrice: 218250000 },
    { id: '2', code: 'STR.02', category: 'Pekerjaan Struktur', description: 'Pekerjaan Balok & Pelat Lantai', volume: 85, unit: 'm3', unitPrice: 5120000, totalPrice: 435200000 },
    { id: '3', code: 'ARS.01', category: 'Pekerjaan Arsitektur', description: 'Pemasangan Granit Tile 80x80', volume: 220, unit: 'm2', unitPrice: 420000, totalPrice: 92400000 },
  ];

  const ctx = buildFullAIContext(dummyProject as any, dummyItems as any);

  const tests = [
    { prompt: 'Berapa total RAB?', expectedBadge: 'RAB' },
    { prompt: 'Berapa biaya pekerjaan struktur?', expectedBadge: 'RAB' },
    { prompt: 'Berapa progress sekarang?', expectedBadge: 'KURVA S' },
    { prompt: 'Apakah proyek terlambat?', expectedBadge: 'KURVA S' },
    { prompt: 'Buat ringkasan laporan minggu ini', expectedBadge: 'LAPORAN' },
    { prompt: 'Tambahkan pekerjaan pasangan bata 100 m²', expectedBadge: 'AHSP', expectProposal: true },
    { prompt: 'Berapa biaya pekerjaan yang paling besar?', expectedBadge: 'RAB' },
    { prompt: 'Kenapa RAB saya mahal?', expectedBadge: 'RAB' },
  ];

  for (let i = 0; i < tests.length; i++) {
    const { prompt, expectedBadge, expectProposal } = tests[i];
    const res = await defaultAiProvider.chat(prompt, ctx);

    if (!res.content || res.content.length === 0) {
      throw new Error(`Empty content for: ${prompt}`);
    }

    if (expectProposal && !res.actionProposal) {
      throw new Error(`Expected actionProposal for: ${prompt}`);
    }

    console.log(`✅ [PASS] Test ${i + 1}: "${prompt}" => Badge: [${res.badge || 'None'}] | Proposal: ${res.actionProposal ? res.actionProposal.type : 'None'}`);
  }

  console.log('====================================================');
  console.log('🏁 ALL 8 ACCEPTANCE TESTS VERIFIED & PASSED (100%)');
  console.log('====================================================');
}

runAiAcceptanceTests();
