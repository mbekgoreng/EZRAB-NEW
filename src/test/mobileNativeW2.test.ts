/**
 * Native Mobile Gelombang 2 (TERAKHIR) — penjaga kontrak presentasi
 * native per menu lanjutan (mandat owner 2026-11-09/10: "buat native per
 * menu dari galeri" + "buat yang terbaik").
 *
 * Kontrak yang dijaga (pemeriksaan statis pola baca-file):
 *  - Kurva S & Jadwal: geometri garis memakai scurveSmoothPath bersama;
 *    model Kurva S estimator diekstrak ke useKurvaSModel (dipakai kedua
 *    presentasi); modal tambah/edit ManajemenProyek adalah konstanta
 *    yang sama di kedua cabang; komponen mobile dirender hanya sempit.
 *  - Template RAB: derivasi kartu bersama (templateCardDisplay), modal
 *    desktop dibuka dari layar native lewat handler yang sama
 *    (trailingModals bersama).
 *  - Dokumen Proyek: handleSelectJob & categoryTabs bersama; overlay
 *    penutup (trailingOverlays) sama; DocumentWorkspace tidak berubah.
 *  - Laporan: handleExportExcel diekstrak dari tombol desktop dan
 *    dipakai kedua presentasi; cabang native hanya tab Rekapitulasi.
 *  - Keuangan: tabContent konstanta yang sama; summary asli dari
 *    ProjectFinanceRepository (calculateFinanceSummary tetap di view).
 *  - Material & Harga: empat titik pilihan di MaterialDatabaseView;
 *    handler inspector/override bersama; Resource Library kartu native
 *    dari filteredRecords yang sama.
 *  - Terkunci tanpa perubahan paksa: DED AI & AI Document (shell
 *    fullscreen + CSS responsif internal), Menu mobile (MobileMenuSheet
 *    26 entri), Pengaturan (pola PG overhaul R26), Game Space (daftar
 *    kartu satu kolom bawaan).
 *  - Tidak ada angka galeri yang di-hardcode di komponen Gelombang 2.
 *
 * Run (repo): npx --yes tsx src/test/mobileNativeW2.test.ts
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const read = (rel: string): string => readFileSync(join(repo, rel), 'utf8');
const has = (rel: string): boolean => existsSync(join(repo, rel));

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean): void => {
  if (cond) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; console.log(`  ✗ GAGAL: ${name}`); }
};

const css = read('src/styles/mobile-native-w1.css');
check('CSS memuat blok GELOMBANG 2', css.includes('GELOMBANG 2'));
check('CSS W2: grid KPI (.mnw-kpi-grid)', css.includes('.mnw-kpi-grid'));
check('CSS W2: bingkai grafik geser (.mnw-chartscroll)', css.includes('.mnw-chartscroll'));
check('CSS W2: gerak dimatikan pada reduced-motion', css.includes('@media (prefers-reduced-motion: reduce)'));

/* --- 2. Kurva S & Jadwal ------------------------------------------------ */
check('modul bersama scurvePath ada', has('src/lib/scurvePath.ts'));
check('scurvePath mengekspor scurveSmoothPath', read('src/lib/scurvePath.ts').includes('export const scurveSmoothPath'));
const mpv = read('src/components/management/ManajemenProyekView.tsx');
check('ManajemenProyekView mengimpor scurveSmoothPath bersama', mpv.includes("from '../../lib/scurvePath'"));
check('ManajemenProyekView tidak lagi mendefinisikan scurveSmoothPath sendiri', !mpv.includes('const scurveSmoothPath ='));
check('modal ManajemenProyek diekstrak jadi konstanta bersama', mpv.includes('const addTaskModal') && mpv.includes('const editProgressModal'));
check('modal yang sama dirender di cabang mobile & desktop', (mpv.match(/\{addTaskModal\}/g) || []).length >= 2);
check('ManajemenProyekView memilih MobileManajemenProyek saat sempit', mpv.includes('if (isNarrowMobile)') && mpv.includes('<MobileManajemenProyek'));
const mmp = read('src/components/mobile/MobileManajemenProyek.tsx');
check('MobileManajemenProyek memakai scurveSmoothPath bersama', mmp.includes("from '../../lib/scurvePath'"));
check('MobileManajemenProyek: grafik dalam bingkai geser', mmp.includes('mnw-chartscroll'));
check('MobileManajemenProyek: aksi update/hapus tahapan dipertahankan', mmp.includes('onEditTask') && mmp.includes('onDeleteTask'));

check('hook model Kurva S ada', has('src/components/estimator/useKurvaSModel.ts'));
const kModel = read('src/components/estimator/useKurvaSModel.ts');
check('useKurvaSModel memakai engine kejujuran kurva yang sama', kModel.includes('buildLaporanKurvaS') && kModel.includes('evaluateEstimatorKurvaS'));
check('useKurvaSModel membaca ProjectContext (sumber data sama)', kModel.includes('useProject()'));
const kurvaView = read('src/components/estimator/EstimatorKurvaSView.tsx');
check('EstimatorKurvaSView memakai useKurvaSModel', kurvaView.includes('useKurvaSModel(currentProject, items)'));
check('EstimatorKurvaSView memilih MobileKurvaS saat sempit', kurvaView.includes('<MobileKurvaS model={model} />'));
const mKurva = read('src/components/mobile/MobileKurvaS.tsx');
check('MobileKurvaS menampilkan panel kejujuran yang sama', mKurva.includes('Data Kurva S Tidak Tersedia'));
check('MobileKurvaS: kartu distribusi per tahapan (bukan tabel)', mKurva.includes('categorySchedule.map'));
check('MobileKurvaS: grafik dalam bingkai geser', mKurva.includes('mnw-chartscroll'));

/* --- 3. Template RAB ------------------------------------------------------ */
check('modul derivasi kartu template ada', has('src/components/templates/templateCardDisplay.ts'));
check('templateCardDisplay mengekspor deriveTemplateCardDisplay', read('src/components/templates/templateCardDisplay.ts').includes('export const deriveTemplateCardDisplay'));
const tplView = read('src/components/templates/TemplateRabCatalogView.tsx');
check('TemplateRabCatalogView memakai derive bersama di kartu desktop', tplView.includes('deriveTemplateCardDisplay('));
check('CATEGORY_ITEMS diekspor untuk presentasi mobile', tplView.includes('export const CATEGORY_ITEMS'));
check('modal template diekstrak jadi trailingModals bersama', tplView.includes('const trailingModals'));
check('TemplateRabCatalogView memilih MobileTemplateRab saat sempit', tplView.includes('<MobileTemplateRab'));
const mTpl = read('src/components/mobile/MobileTemplateRab.tsx');
check('MobileTemplateRab menurunkan kartu via derive bersama', mTpl.includes('deriveTemplateCardDisplay('));
check('MobileTemplateRab membuka modal yang sama (preview/apply props)', mTpl.includes('onPreview') && mTpl.includes('onApply'));

/* --- 5. Dokumen Proyek ----------------------------------------------------- */
const tender = read('src/components/document/TenderDocumentsView.tsx');
check('handleSelectJob diekstrak & dipakai kartu desktop', tender.includes('const handleSelectJob') && tender.includes('onClick={() => handleSelectJob(proj)}'));
check('categoryTabs menjadi konstanta bersama', tender.includes('const categoryTabs') && tender.includes('{categoryTabs.map((tab) => {'));
check('overlay Dokumen diekstrak jadi trailingOverlays bersama', tender.includes('const trailingOverlays'));
check('layar pilih pekerjaan sempit -> MobileDokumenPilihPekerjaan', tender.includes('<MobileDokumenPilihPekerjaan'));
check('layar utama sempit -> MobileDokumenProyek', tender.includes('<MobileDokumenProyek'));
check('DocumentWorkspace tetap cabang bersama (tidak diubah)', tender.includes('if (activeDocumentDef)'));
const mDoc = read('src/components/mobile/MobileDokumenProyek.tsx');
check('MobileDokumenProyek membaca filteredCardData (data sama)', mDoc.includes('filteredCardData'));
check('MobileDokumenProyek membuka DocumentWorkspace lewat prop yang sama', mDoc.includes('onOpenDocument'));

/* --- 4. Laporan ------------------------------------------------------------- */
const lap = read('src/components/reports/LaporanView.tsx');
check('formatPriceCell diekspor untuk presentasi mobile', lap.includes('export const formatPriceCell'));
check('handleExportExcel diekstrak dari tombol desktop', lap.includes('const handleExportExcel = async () =>') && lap.includes('onClick={handleExportExcel}'));
check('modal Laporan menjadi trailingModals bersama', lap.includes('const trailingModals'));
check('cabang native Laporan hanya tab Rekapitulasi', lap.includes("isNarrowMobile && activeTab === 'rekapitulasi'"));
const mLap = read('src/components/mobile/MobileLaporan.tsx');
check('MobileLaporan memakai tipe LaporanSummary bersama', mLap.includes('LaporanSummary'));
check('MobileLaporan memakai formatPriceCell bersama', mLap.includes("from '../reports/LaporanView'"));
check('MobileLaporan: ekspor memakai handler yang sama (props)', mLap.includes('onExportExcel') && mLap.includes('onExportPdf') && mLap.includes('onExportPackage'));

/* --- 6. Keuangan ------------------------------------------------------------- */
const fin = read('src/components/finance/ProjectFinanceView.tsx');
check('summary keuangan tetap dihitung view (calculateFinanceSummary)', fin.includes('calculateFinanceSummary'));
check('isi sub-tab Keuangan menjadi tabContent bersama', fin.includes('const tabContent'));
check('Keuangan sempit -> MobileKeuangan dengan tabContent yang sama', fin.includes('<MobileKeuangan') && fin.includes('{tabContent}'));
const mFin = read('src/components/mobile/MobileKeuangan.tsx');
check('MobileKeuangan memakai tipe ProjectFinanceSummary asli', mFin.includes('ProjectFinanceSummary'));
check('MobileKeuangan memformat dengan formatRupiah bersama', mFin.includes("from '../../engine/formulaEngine'"));
check('MobileKeuangan menampilkan piutang & arus kas asli', mFin.includes('totalReceivable') && mFin.includes('netCashFlow'));

/* --- 7. Material & Harga + Resource Library ---------------------------------- */
const mat = read('src/components/materials/MaterialDatabaseView.tsx');
check('MaterialDatabaseView: tabel material desktop hanya non-sempit', mat.includes("activeCategoryTab === 'MATERIALS' && !isNarrowMobile"));
check('MaterialDatabaseView: kartu material saat sempit', mat.includes('mode="MATERIALS"'));
check('MaterialDatabaseView: kartu upah saat sempit', mat.includes('mode="LABOR"'));
check('MaterialDatabaseView: kartu peralatan saat sempit', mat.includes('mode="EQUIPMENT"'));
check('MaterialDatabaseView: kartu harga proyek saat sempit', mat.includes('mode="PROJECT_PRICE"'));
check('handler inspector material bersama dipakai baris desktop', mat.includes('onClick={() => handleInspectMaterial(mat)}'));
check('derivasi harga kartu dari service yang sama (materialPriceInfo)', mat.includes('const materialPriceInfo'));
const mMat = read('src/components/mobile/MobileMaterialDb.tsx');
check('MobileMaterialDb memakai LaborDatabaseService yang sama', mMat.includes('LaborDatabaseService'));
check('MobileMaterialDb memakai projectPriceEngine yang sama', mMat.includes('projectPriceEngine'));
const reslib = read('src/components/resources/ResourceLibraryView.tsx');
check('ResourceLibrary sempit -> MobileResourceLibrary dari filteredRecords', reslib.includes('<MobileResourceLibrary') && reslib.includes('records={filteredRecords}'));
const mRes = read('src/components/mobile/MobileResourceLibrary.tsx');
check('MobileResourceLibrary mempertahankan aksi Detail (compare)', mRes.includes('onCompare'));

/* --- 1 & 8 & 9. Terkunci: DED/DocAI, Game Space, Menu, Pengaturan ------------- */
const ded = read('src/ai-tools/ded-ai-estimate/view.tsx');
const docai = read('src/ai-tools/document-ai/view.tsx');
// Pola shell BERUBAH atas keputusan owner 2026-11-10 (mockup ter-ACC):
// DED AI + AI Document TIDAK lagi memakai FeatureFullscreenShell — keduanya
// halaman biasa di dalam workspace via FeaturePageShell (sidebar + topbar
// tetap terlihat, halaman tidak scroll). Penguncian W2 lama digantikan.
check('DED AI memakai FeaturePageShell (bukan fullscreen, ACC 2026-11-10)', ded.includes('FeaturePageShell') && !ded.includes('<FeatureFullscreenShell'));
check('AI Document memakai FeaturePageShell (bukan fullscreen, ACC 2026-11-10)', docai.includes('FeaturePageShell') && !docai.includes('<FeatureFullscreenShell'));
const fpCss = read('src/components/feature-shell/feature-page-shell.css');
check('shell halaman punya perlakuan HP (<=700px, konteks disembunyikan)', fpCss.includes('@media (max-width: 700px)') && fpCss.includes('.fp-ctx'));
const wsView = read('src/components/dashboard/WorkspaceView.tsx');
check('WorkspaceView mengunci scroll halaman untuk ded-ai/dokumen-ai', wsView.includes("activeMenu === 'ded-ai'") && wsView.includes("activeMenu === 'dokumen-ai'") && wsView.includes("'hidden'"));
const dedCss = read('src/ai-tools/ded-ai-estimate/dedAi.css');
check('konten DED runtuh satu kolom di HP (<=560px)', dedCss.includes('@media (max-width: 560px)') && dedCss.includes('.dedai-actions'));
const docCss = read('src/ai-tools/document-ai/document-ai.css');
check('konten AI Document runtuh satu kolom (<=900/560px)', docCss.includes('.docai-analayout') && docCss.includes('@media (max-width: 560px)'));
const fixes = read('src/styles/workspace-mobile-fixes.css');
check('panel konteks AI Document membungkus di HP (overhaul R24)', fixes.includes('.docai-ctxrow'));
check('Pengaturan satu kolom pola PG (overhaul R26)', fixes.includes(".ezrab-set-panel [style*='repeat(2, 1fr)']"));
const mv3 = read('src/components/mobile/MobileV3.tsx');
const groupsBlock = mv3.slice(mv3.indexOf('MOBILE_MENU_GROUPS'), mv3.indexOf('interface MobileMenuSheetProps'));
check('Menu mobile = MobileMenuSheet berkelompok', mv3.includes('MobileMenuSheet'));
check('Menu mobile memuat 26 entri fitur Sidebar', (groupsBlock.match(/\{ id: '/g) || []).length === 26);
const gs = read('src/game-space/GameSpaceOverlay.tsx');
check('Game Space menyusun daftar dari kedua katalog', gs.includes('CONSTRUCTION_GAMES') && gs.includes('ARCADE_GAMES'));
check('Game Space: ketuk kartu membuka game (logika tak berubah)', gs.includes('onClick={() => setActiveGame(g)}'));
const gsCss = read('src/game-space/game-space.css');
check('daftar Game Space sudah kartu satu kolom (.gs-cards)', gsCss.includes('.gs-cards { display: flex; flex-direction: column;'));

/* --- pagar anti-hardcode angka galeri ---------------------------------------- */
const w2Files = [
  'src/components/mobile/MobileKurvaS.tsx',
  'src/components/mobile/MobileManajemenProyek.tsx',
  'src/components/mobile/MobileTemplateRab.tsx',
  'src/components/mobile/MobileDokumenProyek.tsx',
  'src/components/mobile/MobileLaporan.tsx',
  'src/components/mobile/MobileKeuangan.tsx',
  'src/components/mobile/MobileMaterialDb.tsx',
  'src/components/mobile/MobileResourceLibrary.tsx',
];
const galleryNumbers = ['1.089.879', '1089879733', '806.640', 'Rp 34.845'];
for (const f of w2Files) {
  const body = read(f);
  check(`${f.split('/').pop()} bebas angka galeri`, !galleryNumbers.some((n) => body.includes(n)));
}

console.log(`\nmobileNativeW2: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
