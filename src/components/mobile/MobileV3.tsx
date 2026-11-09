/**
 * MobileV3 — lapisan presentasi mode HP dari mockup v3 yang DI-ACC owner
 * (2026-11-08, ~/workspace/your_files/EZRAB-MOBILE-NATIVE/mockup-v3.html).
 *
 * Prinsip: komponen ini HANYA dirender pada viewport sempit (<768px) oleh
 * WorkspaceView dan hanya memakai data nyata aplikasi (proyek, RAB,
 * notifikasi, paket simulasi). Fungsi & data tidak berubah — yang berubah
 * presentasi mobile. Desktop tidak tersentuh.
 *
 * Aset visual: foto & ikon navigasi hasil generate AI dari folder aset
 * mockup (src/assets/mobile-v3/), logo memakai file resmi repo
 * (public/images/ezrab-logo.png), maskot kartu AI memakai artwork kepala
 * 2D kiriman owner 2026-11-09 (src/assets/mascot-ezrab-kepala-2d.webp).
 */
import React, { useMemo, useState } from 'react';
import {
  formatRpShort,
  formatRpFull,
  projectStatusMeta,
  setProyekPhotos,
  projectPhoto,
} from './mobileV3Utils';
import {
  Bell,
  Home,
  Folder,
  Plus,
  CheckCircle2,
  AlertCircle,
  Info,
  Sparkles,
  ChevronRight,
  X,
  LayoutDashboard,
  FolderKanban,
  FileSpreadsheet,
  Calculator,
  Ruler,
  Info as InfoIcon,
  FileCheck,
  LineChart,
  FileText,
  Settings,
  Package,
  Database,
  HardHat,
  Truck,
  Tag,
  Receipt,
  Files,
  Calendar,
  Crown,
  Send,
  Trash2,
  LayoutGrid,
  Gamepad2,
  type LucideIcon,
} from 'lucide-react';
import type { Project, RabItem } from '../../types';
import { useI18n } from '../../i18n';
import { useNotifications, type NotificationItem } from '../../notifications/NotificationContext';
import { useRole } from '../../auth/RoleContext';
import { useCreditSimulation } from '../../ai-credits/useCreditSimulation';
import { CREDIT_PLAN_LABELS } from '../../ai-credits/featureGate';
import { openEzrabAI } from '../../ai-tools/aiNavigation';
import { exportItemAmount } from '../../export/priceIntegrity';

import photoHero from '../../assets/mobile-v3/photo-hero.jpg';
import photoProyekA from '../../assets/mobile-v3/photo-proyek-a.jpg';
import photoProyekB from '../../assets/mobile-v3/photo-proyek-b.jpg';
import photoProyekC from '../../assets/mobile-v3/photo-proyek-c.jpg';
import photoTerkait from '../../assets/mobile-v3/photo-terkait.jpg';

// Suntik daftar foto ilustrasi proyek ke mobileV3Utils (modul itu bebas
// impor aset agar fungsi murninya bisa diuji di runner Node).
setProyekPhotos([photoProyekA, photoProyekB, photoProyekC]);
import mascotAsli from '../../assets/mascot-ezrab-kepala-2d.webp';

/* ------------------------------------------------- utils: mobileV3Utils */
/* Fungsi murni (formatRp*, projectStatusMeta, projectPhoto) tinggal di
 * ./mobileV3Utils agar bisa diuji tanpa mengimpor aset gambar; diekspor
 * ulang di sini supaya permukaan ekspor MobileV3 tidak berubah. */
export { formatRpShort, formatRpFull, projectStatusMeta, projectPhoto };

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || 'EZ';

const greetingForHour = (h: number): string => {
  if (h < 11) return 'Selamat pagi';
  if (h < 15) return 'Selamat siang';
  if (h < 19) return 'Selamat sore';
  return 'Selamat malam';
};

/* ------------------------------------------------------- bottom nav (pil) */

export type MobileNavTab = 'beranda' | 'proyek' | 'notif' | 'menu';

interface MobileBottomNavV3Props {
  activeTab: MobileNavTab | null;
  onTab: (tab: MobileNavTab) => void;
  onCreateProject: () => void;
}

/**
 * Navbar bawah v3 — varian B (pilihan owner 2026-11-09): bar flat
 * ikon-saja tanpa label, ikon garis Lucide, item aktif biru pekat +
 * titik di bawahnya, slot Profil diisi maskot kepala 2D. Tombol buat
 * proyek = ikon + polos sejajar. Titik merah Notifikasi hanya tampil
 * bila unreadCount nyata > 0 dari NotificationContext.
 */
export const MobileBottomNavV3: React.FC<MobileBottomNavV3Props> = ({ activeTab, onTab, onCreateProject }) => {
  const { unreadCount } = useNotifications();
  const item = (
    tab: MobileNavTab,
    label: string,
    Icon: LucideIcon,
  ) => {
    const active = activeTab === tab;
    return (
      <button
        type="button"
        className={`mv3-nav-item${active ? ' is-active' : ''}`}
        onClick={() => onTab(tab)}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
      >
        <span className="mv3-nav-icwrap">
          <Icon size={23} strokeWidth={2} />
          {tab === 'notif' && unreadCount > 0 && <span className="mv3-nav-dot" aria-label={`${unreadCount} belum dibaca`} />}
        </span>
        <span className="mv3-nav-under" aria-hidden="true" />
      </button>
    );
  };
  return (
    <nav className="mv3-bottom-nav" aria-label="Navigasi bawah mobile v3">
      {item('beranda', 'Beranda', Home)}
      {item('proyek', 'Proyek', Folder)}
      <button
        type="button"
        className="mv3-nav-item mv3-nav-create"
        onClick={onCreateProject}
        aria-label="Buat proyek baru"
      >
        <span className="mv3-nav-icwrap">
          <Plus size={23} strokeWidth={2} />
        </span>
        <span className="mv3-nav-under" aria-hidden="true" />
      </button>
      {item('notif', 'Notifikasi', Bell)}
      <button
        type="button"
        className={`mv3-nav-item${activeTab === 'menu' ? ' is-active' : ''}`}
        onClick={() => onTab('menu')}
        aria-label="Profil"
        aria-current={activeTab === 'menu' ? 'page' : undefined}
      >
        <span className="mv3-nav-icwrap">
          <img src={mascotAsli} alt="" className="mv3-nav-mascot" draggable={false} />
        </span>
        <span className="mv3-nav-under" aria-hidden="true" />
      </button>
    </nav>
  );
};

/* ------------------------------------------------------- panel notifikasi */

const notifTime = (ts: number): string => {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'baru saja';
  if (m < 60) return `${m} menit yang lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam yang lalu`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} hari yang lalu`;
  return new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
};

const NotifTypeIcon: React.FC<{ type: NotificationItem['type'] }> = ({ type }) => {
  if (type === 'success') return <CheckCircle2 size={17} color="#16A34A" />;
  if (type === 'error') return <AlertCircle size={17} color="#EF4444" />;
  if (type === 'ai') return <Sparkles size={17} color="#7C3AED" />;
  return <Info size={17} color="#2563EB" />;
};

/** Panel notifikasi mobile v3 — data dari NotificationContext yang sama
 * dengan NotificationBell di TopBar (bukan sumber baru). */
export const MobileNotifSheet: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { notifications, unreadCount, markRead, markAllRead, clearRead } = useNotifications();
  return (
    <div className="mv3-sheet-veil" onClick={onClose} role="presentation">
      <div
        className="mv3-sheet"
        role="dialog"
        aria-label="Notifikasi"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mv3-sheet-head">
          <div>
            <div className="mv3-sheet-title">Notifikasi</div>
            <div className="mv3-sheet-sub">
              {unreadCount > 0 ? `${unreadCount} belum dibaca` : 'Semua sudah dibaca'}
            </div>
          </div>
          <button type="button" className="mv3-icon-btn" onClick={onClose} aria-label="Tutup notifikasi">
            <X size={18} />
          </button>
        </div>
        {notifications.length > 0 && (
          <div className="mv3-sheet-actions">
            <button type="button" onClick={markAllRead}>Tandai semua dibaca</button>
            <button type="button" onClick={clearRead}>
              <Trash2 size={13} /> Hapus yang dibaca
            </button>
          </div>
        )}
        <div className="mv3-sheet-body">
          {notifications.length === 0 ? (
            <div className="mv3-empty">
              <Bell size={26} color="#94A3B8" />
              <p>Belum ada notifikasi.</p>
            </div>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                className={`mv3-notif-row${n.read ? '' : ' is-unread'}`}
                onClick={() => markRead(n.id)}
              >
                <span className="mv3-notif-ic"><NotifTypeIcon type={n.type} /></span>
                <span className="mv3-notif-main">
                  <span className="mv3-notif-title">{n.title}</span>
                  {n.message && <span className="mv3-notif-body">{n.message}</span>}
                  <span className="mv3-notif-time">{notifTime(n.createdAt)}</span>
                </span>
                {!n.read && <span className="mv3-notif-dot" />}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------- menu sheet */

interface MobileMenuEntry {
  id: string;
  labelKey: string;
  icon: LucideIcon;
  tint: string;
  badge?: string;
  action?: 'tutorial';
}

interface MobileMenuGroup {
  labelKey: string;
  entries: MobileMenuEntry[];
}

/** Daftar menu = verbatim Sidebar aplikasi web (id menu + kunci i18n yang
 * sama persis dengan Sidebar.tsx & dictionaries.ts), dikelompokkan seperti
 * mockup v3. */
const MOBILE_MENU_GROUPS: MobileMenuGroup[] = [
  {
    labelKey: 'nav.group_beranda',
    entries: [
      { id: 'dashboard', labelKey: 'nav.home', icon: LayoutDashboard, tint: '#EFF6FF' },
      { id: 'ezrab-ai', labelKey: 'nav.chat_ai', icon: Sparkles, tint: '#F5F3FF', badge: 'AI' },
      { id: 'ded-ai', labelKey: 'nav.ded_ai', icon: FileCheck, tint: '#F5F3FF', badge: 'AI' },
      { id: 'dokumen-ai', labelKey: 'nav.doc_ai', icon: FileText, tint: '#F5F3FF', badge: 'AI' },
    ],
  },
  {
    labelKey: 'nav.group_volume_qto',
    entries: [
      { id: 'proyek', labelKey: 'nav.proyek', icon: FolderKanban, tint: '#EFF6FF' },
      { id: 'qto-vc', labelKey: 'nav.volume_kalkulator', icon: Calculator, tint: '#ECFDF5' },
      { id: 'qto', labelKey: 'nav.rekap_qto', icon: Ruler, tint: '#FFF7ED' },
      { id: 'manajemen-proyek', labelKey: 'nav.jadwal_manajemen', icon: Calendar, tint: '#FDF2F8' },
    ],
  },
  {
    labelKey: 'nav.group_rab',
    entries: [
      { id: 'rab-informasi-proyek', labelKey: 'nav.informasi_proyek', icon: InfoIcon, tint: '#EFF6FF' },
      { id: 'rab-spreadsheet', labelKey: 'nav.rab_spreadsheet', icon: FileSpreadsheet, tint: '#ECFDF5' },
      { id: 'rab-rekapitulasi', labelKey: 'nav.rekap_rab', icon: FileCheck, tint: '#FFF7ED' },
      { id: 'rab-analisa-harga', labelKey: 'nav.analisa_harga', icon: Calculator, tint: '#F5F3FF' },
      { id: 'rab-kurva-s', labelKey: 'nav.kurva_s', icon: LineChart, tint: '#FDF2F8' },
      { id: 'rab-catatan', labelKey: 'nav.catatan', icon: FileText, tint: '#FEFCE8' },
      { id: 'rab-pengaturan', labelKey: 'nav.pengaturan_rab', icon: Settings, tint: '#F1F5F9' },
    ],
  },
  {
    labelKey: 'nav.group_data',
    entries: [
      { id: 'template-rab', labelKey: 'nav.template_rab', icon: LayoutGrid, tint: '#EFF6FF' },
      { id: 'laporan', labelKey: 'nav.laporan', icon: FileText, tint: '#ECFDF5' },
      { id: 'dokumen-tender', labelKey: 'nav.dokumen_proyek', icon: Files, tint: '#FFF7ED' },
      { id: 'keuangan-proyek', labelKey: 'nav.keuangan_proyek', icon: Receipt, tint: '#F5F3FF' },
      { id: 'database-material', labelKey: 'nav.material', icon: Package, tint: '#FDF2F8' },
      { id: 'ahsp-2026', labelKey: 'nav.ahsp', icon: Database, tint: '#EFF6FF' },
      { id: 'database-upah', labelKey: 'nav.upah', icon: HardHat, tint: '#FEFCE8' },
      { id: 'database-alat', labelKey: 'nav.alat', icon: Truck, tint: '#ECFDF5' },
      { id: 'harga-proyek', labelKey: 'nav.harga_proyek', icon: Tag, tint: '#FFF7ED' },
    ],
  },
  {
    labelKey: 'nav.group_lainnya',
    entries: [
      { id: 'pengaturan', labelKey: 'nav.pengaturan', icon: Settings, tint: '#F1F5F9' },
      { id: 'tutorial', labelKey: 'nav.tutorial_ezrab', icon: Gamepad2, tint: '#F5F3FF', action: 'tutorial' },
    ],
  },
];

interface MobileMenuSheetProps {
  activeMenu: string;
  onSelectMenu: (menu: string) => void;
  onOpenSubscription: () => void;
  onOpenTutorial: () => void;
  onClose: () => void;
}

/** Layar Menu mobile v3: kartu profil + langganan (data aplikasi nyata:
 * peran aktif & paket simulasi kredit — dilabeli simulasi seperti Sidebar)
 * lalu SELURUH fitur Sidebar berkelompok. */
export const MobileMenuSheet: React.FC<MobileMenuSheetProps> = ({
  activeMenu,
  onSelectMenu,
  onOpenSubscription,
  onOpenTutorial,
  onClose,
}) => {
  const { t } = useI18n();
  const { activeRole } = useRole();
  const { balance } = useCreditSimulation();
  const roleName = activeRole ? activeRole.name : 'Super Admin';
  const planLabel = CREDIT_PLAN_LABELS[balance.plan] || balance.plan;

  const isActive = (id: string): boolean => {
    if (id === 'rab-spreadsheet') return activeMenu === 'rab-spreadsheet' || activeMenu === 'rab-estimasi';
    if (id === 'qto') return activeMenu === 'qto' || activeMenu === 'qto-rekap';
    if (id === 'database-material') return ['database-material', 'material', 'material-harga', 'harga'].includes(activeMenu);
    if (id === 'ahsp-2026') return ['ahsp-2026', 'ahsp', 'analisa-ahsp'].includes(activeMenu);
    if (id === 'database-upah') return ['database-upah', 'upah'].includes(activeMenu);
    if (id === 'database-alat') return ['database-alat', 'alat'].includes(activeMenu);
    return activeMenu === id;
  };

  return (
    <div className="mv3-menu-page" role="dialog" aria-label="Semua fitur">
      <div className="mv3-menu-head">
        <div>
          <div className="mv3-menu-title">Semua Fitur</div>
          <div className="mv3-menu-sub">Nama persis Sidebar aplikasi web</div>
        </div>
        <button type="button" className="mv3-icon-btn" onClick={onClose} aria-label="Tutup menu">
          <X size={18} />
        </button>
      </div>

      <button type="button" className="mv3-profile-card" onClick={() => onSelectMenu('pengaturan')}>
        <span className="mv3-profile-avatar">{initials(roleName)}</span>
        <span className="mv3-profile-main">
          <span className="mv3-profile-name">{roleName}</span>
          <span className="mv3-profile-sub">Mode demo · ketuk untuk Pengaturan</span>
        </span>
        <span className="mv3-plan-chip">
          <Crown size={12} /> {planLabel}
        </span>
      </button>
      <div className="mv3-plan-note">
        Paket saat ini (simulasi): <strong>{planLabel}</strong> ·{' '}
        <button type="button" className="mv3-inline-link" onClick={onOpenSubscription}>
          Lihat paket & penggunaan
        </button>
      </div>

      {MOBILE_MENU_GROUPS.map((group) => (
        <div key={group.labelKey} className="mv3-menu-group">
          <div className="mv3-menu-group-label">{t(group.labelKey)}</div>
          <div className="mv3-menu-card">
            {group.entries.map((entry) => {
              const Icon = entry.icon;
              const active = isActive(entry.id);
              return (
                <button
                  key={entry.id}
                  type="button"
                  className={`mv3-menu-row${active ? ' is-active' : ''}`}
                  onClick={() => (entry.action === 'tutorial' ? onOpenTutorial() : onSelectMenu(entry.id))}
                >
                  <span className="mv3-menu-ic" style={{ background: entry.tint }}>
                    <Icon size={17} color="#1D4ED8" />
                  </span>
                  <span className="mv3-menu-label">{t(entry.labelKey)}</span>
                  {entry.badge && <span className="mv3-menu-badge">{entry.badge}</span>}
                  <ChevronRight size={16} color="#CBD5E1" />
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <div style={{ height: 12 }} />
    </div>
  );
};

/* ------------------------------------------------------------ beranda v3 */

interface MobileHomeV3Props {
  projects: Project[];
  currentProject: Project | null;
  onNavigate: (menu: string, projectId?: string | null) => void;
  onCreateProject: () => void;
  onOpenProjects: (filter: string) => void;
}

const HOME_TILES: Array<{ id: string; labelKey: string; icon: LucideIcon; tint: string }> = [
  { id: 'rab-spreadsheet', labelKey: 'nav.rab_spreadsheet', icon: FileSpreadsheet, tint: '#EFF6FF' },
  { id: 'qto-vc', labelKey: 'nav.volume_kalkulator', icon: Calculator, tint: '#ECFDF5' },
  { id: 'database-material', labelKey: 'nav.material', icon: Package, tint: '#FFF7ED' },
  { id: 'ahsp-2026', labelKey: 'nav.ahsp', icon: Database, tint: '#F5F3FF' },
];

export const MobileHomeV3: React.FC<MobileHomeV3Props> = ({
  projects,
  currentProject,
  onNavigate,
  onCreateProject,
  onOpenProjects,
}) => {
  const { t } = useI18n();
  const { activeRole } = useRole();
  const [aiQuery, setAiQuery] = useState('');

  const now = new Date();
  const roleName = activeRole ? activeRole.name : 'Super Admin';
  // Sapaan hero maksimal lebar 86%: kata sapaan (≤ "Selamat malam", 13
  // karakter) + ", " dijamin muat satu baris; hanya NAMA yang terpotong
  // ellipsis — nama peran kustom yang panjang tidak lagi membungkus dan
  // menabrak chip di bawahnya.
  const greetingWord = greetingForHour(now.getHours());
  const totalProjects = projects.length;
  const totalItems = projects.reduce((acc, p) => acc + ((p as unknown as { totalItems?: number }).totalItems || 0), 0);
  const totalRab = projects.reduce((acc, p) => acc + (p.totalRab || 0), 0);
  const activeCount = projects.filter((p) => p.status === 'in_progress').length;
  const doneCount = projects.filter((p) => p.status === 'completed' || p.status === 'approved' || p.status === 'COMPLETED').length;
  const progressPct = totalProjects > 0 ? Math.round((doneCount / totalProjects) * 100) : 0;
  const heroProject = currentProject || projects[0] || null;

  const submitAi = () => {
    // EzrabAiEntryContext tidak mengenal sendMode (prompt = prefill yang
    // diisi ke composer Chat AI; pengiriman tetap aksi user di view chat).
    openEzrabAI({
      mode: 'chat',
      prompt: aiQuery.trim() || undefined,
      projectId: heroProject?.id ?? null,
      projectName: heroProject?.name,
      source: 'mobile',
    });
  };

  return (
    <div className="mv3-home">
      {/* Appbar: logo resmi repo (file yang sama dengan aplikasi web) */}
      <div className="mv3-appbar">
        <img src="/images/ezrab-logo.png" alt="EZRAB" className="mv3-logo" />
        <span className="mv3-appbar-avatar">{initials(roleName)}</span>
      </div>

      {/* Hero foto konstruksi (generate AI) + sapaan + chip proyek aktif */}
      <section className="mv3-hero">
        <img src={photoHero} alt="" className="mv3-hero-img" />
        <div className="mv3-hero-shade" />
        <div className="mv3-hero-content">
          <div className="mv3-hero-date">
            {now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
          <h1 className="mv3-hero-title">
            {greetingWord},{' '}
            <span className="mv3-hero-name">{roleName}</span>
          </h1>
          <p className="mv3-hero-sub">Selamat datang di EZRAB</p>
          <button type="button" className="mv3-hero-chip" onClick={() => onOpenProjects('Sedang Dikerjakan')}>
            <CheckCircle2 size={14} color="#4ADE80" />
            Proyek Aktif · {activeCount} proyek berjalan
          </button>
        </div>
      </section>

      {/* 4 statistik ringkas dari data nyata */}
      <section className="mv3-stats" aria-label="Ringkasan">
        <div className="mv3-stat">
          <span className="mv3-stat-num">{totalProjects}</span>
          <span className="mv3-stat-label">Proyek</span>
        </div>
        <div className="mv3-stat">
          <span className="mv3-stat-num">{totalItems}</span>
          <span className="mv3-stat-label">Item RAB</span>
        </div>
        <div className="mv3-stat">
          <span className="mv3-stat-num mv3-stat-num-blue">{formatRpShort(totalRab)}</span>
          <span className="mv3-stat-label">Total Nilai</span>
        </div>
        <div className="mv3-stat">
          <span className="mv3-stat-num mv3-stat-num-green">{progressPct}%</span>
          <span className="mv3-stat-label">Selesai</span>
        </div>
      </section>

      {/* Kartu Ezrab AI: maskot asli + kolom tanya -> Chat AI */}
      <section className="mv3-ai-card">
        <div className="mv3-ai-main">
          <div className="mv3-ai-title">
            <Sparkles size={15} /> Ezrab AI
          </div>
          <p className="mv3-ai-sub">Tanya apa saja tentang RAB, QTO, atau harga material.</p>
          <form
            className="mv3-ai-form"
            onSubmit={(e) => {
              e.preventDefault();
              submitAi();
            }}
          >
            <input
              value={aiQuery}
              onChange={(e) => setAiQuery(e.target.value)}
              placeholder="Tanyakan sesuatu…"
              aria-label="Tanya Ezrab AI"
            />
            <button type="submit" aria-label="Kirim pertanyaan">
              <Send size={16} />
            </button>
          </form>
        </div>
        <img src={mascotAsli} alt="" className="mv3-ai-mascot" />
      </section>

      {/* Menu Utama */}
      <div className="mv3-section-head">
        <span>Menu Utama</span>
        <button type="button" className="mv3-see-all" onClick={() => onNavigate('__menu__')}>
          Lihat Semua <ChevronRight size={14} />
        </button>
      </div>
      <section className="mv3-tiles">
        {HOME_TILES.map((tile) => {
          const Icon = tile.icon;
          return (
            <button key={tile.id} type="button" className="mv3-tile" onClick={() => onNavigate(tile.id)}>
              <span className="mv3-tile-ic" style={{ background: tile.tint }}>
                <Icon size={20} color="#1D4ED8" />
              </span>
              <span className="mv3-tile-label">{t(tile.labelKey)}</span>
            </button>
          );
        })}
      </section>

      {/* Proyek terbaru */}
      {projects.length > 0 && (
        <>
          <div className="mv3-section-head">
            <span>Proyek Terbaru</span>
            <button type="button" className="mv3-see-all" onClick={() => onOpenProjects('Semua Proyek')}>
              Lihat Semua <ChevronRight size={14} />
            </button>
          </div>
          <section className="mv3-home-projects">
            {projects.slice(0, 3).map((p, i) => (
              <MobileProjectCard
                key={p.id}
                project={p}
                index={i}
                onOpen={() => onNavigate('manajemen-proyek', p.id)}
              />
            ))}
          </section>
        </>
      )}

      {projects.length === 0 && (
        <button type="button" className="mv3-empty-cta" onClick={onCreateProject}>
          + Buat proyek pertama Anda
        </button>
      )}
    </div>
  );
};

/* ------------------------------------------------------- kartu proyek v3 */

interface MobileProjectCardProps {
  project: Project;
  index: number;
  onOpen: () => void;
}

/** Kartu proyek mobile v3: thumbnail foto ilustrasi generate (bukan foto
 * proyek asli), titik status berwarna, nilai + progres dari data nyata. */
export const MobileProjectCard: React.FC<MobileProjectCardProps> = ({ project: p, index, onOpen }) => {
  const meta = projectStatusMeta(p);
  const progress = typeof p.progress === 'number' ? Math.max(0, Math.min(100, p.progress)) : null;
  const dateStr = p.updatedAt || p.createdAt
    ? new Date((p.updatedAt || p.createdAt) as string).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';
  return (
    <button type="button" className="mv3-project-card" onClick={onOpen}>
      <img src={p.coverImage || projectPhoto(index)} alt="" className="mv3-project-thumb" loading="lazy" />
      <span className="mv3-project-main">
        <span className="mv3-project-name">{p.name}</span>
        <span className="mv3-project-status">
          <span className="mv3-status-dot" style={{ background: meta.color }} />
          {meta.label}
          {progress !== null && <span className="mv3-project-pct">{progress}%</span>}
        </span>
        {progress !== null && (
          <span className="mv3-progress-track">
            <span className="mv3-progress-fill" style={{ width: `${progress}%` }} />
          </span>
        )}
        <span className="mv3-project-value">
          <span className="mv3-project-amount">{p.totalRab ? formatRpFull(p.totalRab) : 'Belum ada RAB'}</span>
          {dateStr && <span className="mv3-project-date">{dateStr}</span>}
        </span>
      </span>
      <ChevronRight size={17} color="#CBD5E1" />
    </button>
  );
};

/* ------------------------------------------------- daftar proyek mobile v3 */

interface MobileProjectsV3Props {
  projects: Project[];
  initialFilter: string;
  onFilterChange: (filter: string) => void;
  onCreateProject: () => void;
  onOpenProject: (projectId: string) => void;
}

const PROJECT_FILTERS = ['Semua Proyek', 'Draft', 'Sedang Dikerjakan', 'Selesai', 'Arsip'] as const;

export const MobileProjectsV3: React.FC<MobileProjectsV3Props> = ({
  projects,
  initialFilter,
  onFilterChange,
  onCreateProject,
  onOpenProject,
}) => {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    let list = projects;
    if (initialFilter === 'Draft') list = list.filter((p) => p.status === 'draft' || !p.status || (p.status as string) === 'DRAFT');
    else if (initialFilter === 'Sedang Dikerjakan') list = list.filter((p) => p.status === 'in_progress');
    else if (initialFilter === 'Selesai') list = list.filter((p) => p.status === 'completed' || p.status === 'approved' || (p.status as string) === 'COMPLETED');
    else if (initialFilter === 'Arsip') list = list.filter((p) => p.status === 'archived' || p.isArchived);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q));
    return list;
  }, [projects, initialFilter, query]);

  return (
    <div className="mv3-projects">
      <div className="mv3-appbar">
        <img src="/images/ezrab-logo.png" alt="EZRAB" className="mv3-logo" />
      </div>
      <div className="mv3-projects-eyebrow">PORTOFOLIO</div>
      <h1 className="mv3-projects-title">Proyek Saya</h1>
      <div className="mv3-search">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari proyek…" aria-label="Cari proyek" />
      </div>
      <div className="mv3-filter-row">
        {PROJECT_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className={`mv3-filter-chip${initialFilter === f ? ' is-active' : ''}`}
            onClick={() => onFilterChange(f)}
          >
            {f === 'Semua Proyek' ? 'Semua' : f}
          </button>
        ))}
      </div>
      <button type="button" className="mv3-create-btn" onClick={onCreateProject}>
        + Buat Proyek Baru
      </button>
      <div className="mv3-project-list">
        {filtered.length === 0 ? (
          <div className="mv3-empty">
            <FolderKanban size={26} color="#94A3B8" />
            <p>Tidak ada proyek pada filter ini.</p>
          </div>
        ) : (
          filtered.map((p, i) => (
            <MobileProjectCard key={p.id} project={p} index={i} onOpen={() => onOpenProject(p.id)} />
          ))
        )}
      </div>
      <p className="mv3-photo-note">Foto pada kartu adalah ilustrasi generate AI, bukan foto proyek sebenarnya.</p>
    </div>
  );
};

/* ------------------------------------------------- header RAB & QTO v3 */

interface MobileRabQtoHeaderProps {
  family: 'rab' | 'qto';
  onSelectFamily: (family: 'rab' | 'qto') => void;
  currentProject: Project | null;
  rabItems: RabItem[];
  onOpenRelatedProject: () => void;
}

/**
 * Header mobile v3 untuk keluarga RAB/QTO: gradasi + tab segmented yang
 * menavigasi ke view nyata, kartu Total dari total RAB nyata proyek aktif,
 * dan grafik batang mini dari total per divisi (sectionName) item RAB
 * nyata. Bila item RAB kosong, kartu total jatuh ke totalRab proyek dan
 * grafik tidak dirender (tidak mengarang data).
 */
export const MobileRabQtoHeader: React.FC<MobileRabQtoHeaderProps> = ({
  family,
  onSelectFamily,
  currentProject,
  rabItems,
  onOpenRelatedProject,
}) => {
  const { total, divisions } = useMemo(() => {
    const map = new Map<string, number>();
    let sum = 0;
    for (const item of rabItems) {
      const amount = exportItemAmount(item as unknown as Parameters<typeof exportItemAmount>[0]) ?? 0;
      sum += amount;
      const key = (item as unknown as { sectionName?: string; category?: string }).sectionName ||
        (item as unknown as { category?: string }).category || 'Lainnya';
      map.set(key, (map.get(key) || 0) + amount);
    }
    const divs = Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 7);
    return { total: sum, divisions: divs };
  }, [rabItems]);

  const displayTotal = rabItems.length > 0 ? total : currentProject?.totalRab || 0;
  const maxDiv = divisions.length > 0 ? divisions[0].value : 0;

  return (
    <div className="mv3-rabqto">
      <div className="mv3-rabqto-head">
        <div className="mv3-rabqto-title">RAB & QTO</div>
        <div className="mv3-segmented" role="tablist" aria-label="RAB atau QTO">
          <button
            type="button"
            role="tab"
            aria-selected={family === 'rab'}
            className={family === 'rab' ? 'is-active' : ''}
            onClick={() => onSelectFamily('rab')}
          >
            RAB
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={family === 'qto'}
            className={family === 'qto' ? 'is-active' : ''}
            onClick={() => onSelectFamily('qto')}
          >
            QTO
          </button>
        </div>
        <div className="mv3-total-card">
          <div className="mv3-total-main">
            <div className="mv3-total-label">
              TOTAL RAB{currentProject ? ` · ${currentProject.name.toUpperCase()}` : ''}
            </div>
            <div className="mv3-total-value">{formatRpFull(displayTotal)}</div>
            <div className="mv3-total-sub">
              {rabItems.length > 0 ? `${rabItems.length} item terhitung` : 'Belum ada item RAB pada proyek aktif'}
            </div>
          </div>
          {divisions.length > 1 && maxDiv > 0 && (
            <div className="mv3-total-bars" aria-hidden="true">
              {divisions.map((d) => (
                <span
                  key={d.name}
                  className="mv3-total-bar"
                  style={{ height: `${Math.max(14, Math.round((d.value / maxDiv) * 100))}%` }}
                  title={`${d.name}: ${formatRpFull(d.value)}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      {currentProject && (
        <button type="button" className="mv3-related" onClick={onOpenRelatedProject}>
          <img src={photoTerkait} alt="" className="mv3-related-img" />
          <span className="mv3-related-shade" />
          <span className="mv3-related-text">
            <span className="mv3-related-label">PROYEK TERKAIT</span>
            <span className="mv3-related-name">{currentProject.name}</span>
          </span>
        </button>
      )}
    </div>
  );
};
