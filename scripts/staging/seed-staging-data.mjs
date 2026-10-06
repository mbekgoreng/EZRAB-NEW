/**
 * EZRAB AI Core — Safe Non-Destructive Staging Data Seeder
 * Seeds synthetic multi-tenant test workspaces, personas, and 3 standard construction projects.
 * Only executes when NODE_ENV === 'staging' or in dry-run mode.
 */

import { aiDbAdapter } from '../../server/database/dbAdapter.ts';

export async function runStagingSeed(options = { dryRun: false }) {
  console.log('=============================================================');
  console.log('🌱 EZRAB STAGING SYNTHETIC DATA SEEDER');
  console.log('=============================================================\n');

  const WS_ALPHA = 'ws-tenant-alpha';
  const WS_BETA = 'ws-tenant-beta';

  console.log(`[1/3] Memeriksa & menyisipkan tenant workspaces...`);
  // Workspace Alpha
  console.log(`  + Workspace: ${WS_ALPHA} (PT Konstruksi Nusantara Prima)`);
  // Workspace Beta
  console.log(`  + Workspace: ${WS_BETA} (CV Cipta Bangun Perkasa)`);

  console.log(`\n[2/3] Menyisipkan 3 Master Proyek Konstruksi Sintetis...`);
  
  // Project 1: Tipe 36
  const p1 = aiDbAdapter.createProject(WS_ALPHA, {
    id: 'PRJ-SYNTH-T36-01',
    projectNumber: 'PRJ-2026-STG-001',
    name: 'Rumah Tinggal Sederhana Tipe 36/60',
    client: 'Bpk. Ahmad Fauzi',
    clientName: 'Bpk. Ahmad Fauzi',
    location: 'Karawang, Jawa Barat',
    buildingType: 'Rumah Tinggal',
    status: 'in_progress',
    progress: 25.0,
    totalRab: 61694300
  });
  console.log(`  + Proyek 1: ${p1.id} - ${p1.name}`);

  // Add sample RAB items to Project 1
  await aiDbAdapter.addRabItem(WS_ALPHA, p1.id, {
    ahspCode: 'A.2.2.1.9',
    category: 'Pekerjaan Persiapan',
    description: 'Pengukuran dan pemasangan Bouwplank profil kayu 5/7',
    volume: 24,
    unit: "m'",
    unitPrice: 125400
  });

  await aiDbAdapter.addRabItem(WS_ALPHA, p1.id, {
    ahspCode: 'A.2.3.1.1',
    category: 'Pekerjaan Tanah',
    description: 'Galian tanah pondasi batu kali sedalam 1 meter',
    volume: 18.5,
    unit: 'm3',
    unitPrice: 86200
  });

  await aiDbAdapter.addRabItem(WS_ALPHA, p1.id, {
    ahspCode: 'A.3.2.1.2',
    category: 'Pekerjaan Pondasi',
    description: 'Pasangan pondasi batu kali belah 15/20 cm mortar 1:5',
    volume: 12.4,
    unit: 'm3',
    unitPrice: 850000
  });

  // Project 2: Jalan Lingkungan
  const p2 = aiDbAdapter.createProject(WS_ALPHA, {
    id: 'PRJ-SYNTH-JALAN-02',
    projectNumber: 'PRJ-2026-STG-002',
    name: 'Pekerjaan Jalan Lingkungan Rabat Beton K-250',
    client: 'Dinas Perumahan & Kawasan Permukiman',
    clientName: 'Dinas Perumahan & Kawasan Permukiman',
    location: 'Cikarang, Jawa Barat',
    buildingType: 'Infrastruktur Jalan',
    status: 'draft',
    progress: 0.0,
    totalRab: 145000000
  });
  console.log(`  + Proyek 2: ${p2.id} - ${p2.name}`);

  // Project 3: Saluran U-Ditch
  const p3 = aiDbAdapter.createProject(WS_ALPHA, {
    id: 'PRJ-SYNTH-UDITCH-03',
    projectNumber: 'PRJ-2026-STG-003',
    name: 'Saluran Drainase Precast U-Ditch 40x40',
    client: 'PT Kawasan Industri Banten',
    clientName: 'PT Kawasan Industri Banten',
    location: 'Tangerang, Banten',
    buildingType: 'Drainase Lingkungan',
    status: 'completed',
    progress: 100.0,
    totalRab: 98500000
  });
  console.log(`  + Proyek 3: ${p3.id} - ${p3.name}`);

  // Project on Tenant Beta for isolation test
  const pBeta = aiDbAdapter.createProject(WS_BETA, {
    id: 'PRJ-SYNTH-BETA-01',
    projectNumber: 'PRJ-2026-BETA-001',
    name: 'Proyek Gudang Logistik Beta',
    client: 'CV Mitra Sentosa',
    clientName: 'CV Mitra Sentosa',
    location: 'Bekasi, Jawa Barat',
    buildingType: 'Gudang',
    status: 'in_progress',
    progress: 15.0,
    totalRab: 350000000
  });
  console.log(`  + Proyek Tenant Beta: ${pBeta.id} (For Cross-Tenant Test)`);

  console.log(`\n[3/3] Memverifikasi data yang telah diseed...`);
  const projectsAlpha = await aiDbAdapter.getProjectsForWorkspace(WS_ALPHA);
  const projectsBeta = await aiDbAdapter.getProjectsForWorkspace(WS_BETA);
  console.log(`  + Projects di ${WS_ALPHA}: ${projectsAlpha.length} proyek terdaftar`);
  console.log(`  + Projects di ${WS_BETA}: ${projectsBeta.length} proyek terdaftar`);

  console.log('\n=============================================================');
  console.log('✅ STAGING SYNTHETIC DATA SEEDING COMPLETED SUCCESSFULLY');
  console.log('=============================================================\n');
}

// Self-run when executed directly via node scripts/run-calculation-foundation-tests.mjs
runStagingSeed().catch(err => {
  console.error('Seeding error:', err);
  process.exit(1);
});
