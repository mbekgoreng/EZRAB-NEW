import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Settings,
  User,
  Building2,
  Users,
  Bell,
  Calculator,
  Coins,
  FileSpreadsheet,
  Shield,
  ShieldCheck,
  CreditCard,
  HelpCircle,
  Save,
  Check,
  Plus,
  Mail,
  Phone,
  Briefcase,
  Layers,
  Lock,
  Download,
  Upload,
  AlertCircle,
  ExternalLink,
  Eye,
  FileText,
  Trash2,
  RefreshCw,
  Sparkles,
  Bot,
  Zap,
  Activity,
  FolderKanban,
  Database,
  DatabaseBackup,
  Truck,
  HardHat,
  Package,
  Ruler,
  Calendar,
  Percent,
  SlidersHorizontal,
  Search,
  CheckCircle2,
  Clock,
  History,
  FileCheck,
  Tag,
  ArrowRight,
  ShieldAlert,
  X,
  FileUp,
  MapPin,
  TrendingUp,
  Globe,
  Info,
  Play,
  LogOut,
} from 'lucide-react';
import { ClientUserManagementService, WorkspaceMember } from '../../services/userManagementService';
import { AddUserModal } from './AddUserModal';
import { TeamInvitationsPanel } from './TeamInvitationsPanel';
import { UserRole, Project } from '../../types';
import { useProject } from '../../context/ProjectContext';
import { useI18n, LANG_OPTIONS, type Lang } from '../../i18n';
import { dictionaries } from '../../i18n/dictionaries';
import { useRole } from '../../auth/RoleContext';
import { useAuth } from '../../auth/AuthContext';
import { logoutAll } from '../../auth/logoutAll';
import { navigateTo } from '../../routing/routes';
import { ONBOARDING_OPEN_EVENT } from '../onboarding/OnboardingTour';
import { TutorialCenter } from '../onboarding/tutorials/TutorialCenter';
import { SuggestionComplaintBox } from './SuggestionComplaintBox';
import { useCurrency } from '../../context/CurrencyContext';
import {
  CURRENCY_DEFINITIONS,
  SUPPORTED_CURRENCIES,
  convertIdrToDisplay,
  evaluateRate,
  formatCurrency,
  formatRateLine,
  formatRateTimestamp,
  type ForeignCurrencyCode,
} from '../../services/currencyService';

/** Versi aplikasi — tampil di section "Informasi Sistem". Sinkron dengan package.json. */
const APP_VERSION = '2.0.0';
const APP_BUILD = 'Production';
import { settingsAuditService, SettingsAuditEntry, SettingsCategory, SettingsScope } from '../../services/settingsAuditService';
import { computeProjectInfoTotal } from '../../services/projectInfoTotal';
import { resolveProjectFormConfig } from '../../engine/projectCostConfig';
import { BrowserNotifyControl } from '../../notifications/BrowserNotifyControl';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';
import { useCreditSimulation } from '../../ai-credits/useCreditSimulation';
import { CREDIT_PLAN_TO_PLAN_ID } from '../../ai-credits/config';
import { getPlanDefinition } from '../../billing/plans';
import { MaterialDatabaseService } from '../../domain/material/materialDatabaseService';
// P1-A (Backup & Restore — R-01): satu-satunya pemakai UI modul backup.
import {
  BACKUP_DATASET_LABELS,
  BACKUP_EXCLUDED_NOTE,
  BACKUP_REMINDER_DAYS,
  MAX_IMPORT_BYTES,
  createBackup,
  createSafetyBackup,
  downloadBackup,
  getBackupReminderState,
  getBackupSummary,
  getSafetySlotContent,
  getSafetySlotInfo,
  recordBackupExport,
  restoreBackup,
  validateBackup,
  type BackupReminderState,
  type BackupSummary,
  type RestoreValidation,
  type SafetySlotInfo,
} from '../../engine/storage/backupRestore';

export type SettingsTabId =
  // Level 1: Account
  | 'account'
  | 'profile'
  | 'notifications'
  | 'security'
  // Level 2: Workspace
  | 'workspace'
  | 'company'
  | 'users'
  | 'roles'
  | 'branding'
  | 'subscription'
  // Master Data
  | 'master-data'
  // Estimator
  | 'estimator'
  | 'rab'
  | 'pricing'
  // DED & Volume
  | 'ded-volume'
  | 'calculation'
  // Documents
  | 'documents'
  | 'export'
  // Schedule & Progress
  | 'schedule'
  // Cost
  | 'cost'
  // Integrations
  | 'integrations'
  // System
  | 'system'
  | 'audit-log'
  | 'backup'
  | 'help'
  // Project-Scoped Tabs
  | 'project-info'
  | 'project-estimator'
  | 'project-ded'
  | 'project-documents'
  | 'project-schedule'
  | 'project-cost';

interface UnifiedSettingsViewProps {
  initialTab?: SettingsTabId | string;
  initialScope?: 'GLOBAL' | 'PROJECT';
  onNavigateTab?: (tab: string) => void;
  /** Keluar workspace (dari WorkspaceView: reset co-assistant + landing). */
  onLogout?: () => void;
}

interface SearchableSettingItem {
  id: SettingsTabId;
  scope: 'GLOBAL' | 'PROJECT';
  categoryLabel: string;
  title: string;
  description: string;
  keywords: string[];
}

export const UnifiedSettingsView: React.FC<UnifiedSettingsViewProps> = ({
  initialTab = 'profile',
  initialScope,
  onNavigateTab,
  onLogout,
}) => {
  const { currentProject, projects, allRabItems, setCurrentProjectId, updateProject, refreshProjectTotals } = useProject();
  const { t, lang, setLang } = useI18n();
  const { activeRole, logoutRole, hasCapability } = useRole();
  const { session: supabaseSession, signOut: signOutAuth } = useAuth();
  // Tab Paket & Billing menampilkan keadaan SIMULASI kredit saat ini apa
  // adanya (billing nyata belum aktif — tidak ada langganan berbayar yang
  // terverifikasi). Nama/batas/jatah paket dibaca dari definisi kanonis
  // src/billing/plans.ts, bukan teks hardcoded.
  const { balance: creditBalance } = useCreditSimulation();
  const simulatedPlanDef = getPlanDefinition(CREDIT_PLAN_TO_PLAN_ID[creditBalance.plan]);
  const simulatedPlanFacts = [
      simulatedPlanDef.monthlyPriceIdr === 0
      ? t('settings.paket_gratis')
      : `${formatCurrencyIDR(simulatedPlanDef.monthlyPriceIdr)}/bulan`,
    simulatedPlanDef.projectLimit === null
      ? t('settings.paket_tanpa_batas')
      : `${t('settings.paket_maks_a')}${simulatedPlanDef.projectLimit}${t('settings.paket_maks_b')}`,
    simulatedPlanDef.credits.kind === 'initial'
      ? `${simulatedPlanDef.credits.credits.toLocaleString('id-ID')} ${t('settings.paket_kredit_awal')}`
      : `${simulatedPlanDef.credits.credits.toLocaleString('id-ID')} ${t('settings.paket_kredit_periode')}`,
  ].join(' • ');

  // Scope: 'GLOBAL' (Account & Workspace) vs 'PROJECT' (Project Configuration)
  const [scope, setScope] = useState<'GLOBAL' | 'PROJECT'>(() => {
    if (initialScope) return initialScope;
    if (initialTab?.startsWith('project-')) return 'PROJECT';
    return 'GLOBAL';
  });

  // Selected project for project-level settings
  const [selectedProjectId, setSelectedProjectId] = useState<string>(() => {
    return currentProject?.id || (projects[0]?.id ?? '');
  });

  const activeProject = useMemo(() => {
    return projects.find((p) => p.id === selectedProjectId) || currentProject || null;
  }, [projects, selectedProjectId, currentProject]);

  // Backward compatible tab resolution (removes any legacy AI tab)
  const resolveTab = (tabStr?: string): SettingsTabId => {
    if (!tabStr || tabStr === 'ai') return 'profile';
    if (tabStr === 'perusahaan') return 'company';
    if (tabStr === 'general') return 'profile';
    if (tabStr === 'estimasi' || tabStr === 'rab') return 'estimator';
    if (tabStr === 'keamanan') return 'security';
    if (tabStr === 'calculation') return 'ded-volume';
    if (tabStr === 'export') return 'documents';
    return tabStr as SettingsTabId;
  };

  const [activeTab, setActiveTab] = useState<SettingsTabId>(() => resolveTab(initialTab));
  const [savedToast, setSavedToast] = useState(false);
  const [toastMessage, setToastMessage] = useState(t('settings.toast_disimpan'));
  const [addUserModalOpen, setAddUserModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // D-80 (Batch G2): jumlah material dibaca LANGSUNG dari layanan yang
  // sama dengan KPI Resources (MaterialDatabaseService.getAllMaterials)
  // — label hardcode "6.164" sudah basi (jumlah live 9.202). Memo
  // sekali per mount; impor spreadsheet memicu remount view ini lewat
  // navigasi, jadi angka tidak basi antar-kunjungan.
  const liveMaterialCount = useMemo(
    () => MaterialDatabaseService.getInstance().getAllMaterials().length,
    [],
  );

  // Users List State
  const [usersList, setUsersList] = useState<WorkspaceMember[]>(() => ClientUserManagementService.getUsers());
  const currentUser = ClientUserManagementService.getCurrentUser();

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<SettingsAuditEntry[]>(() => settingsAuditService.getLogs());

  // -------------------------------------------------------------
  // P1-A — BACKUP & RESTORE (R-01): state + handler tab 'backup'.
  // Seluruh logika backup ada di engine/storage/backupRestore.ts;
  // blok ini hanya alur UI: ekspor, pratinjau impor, konfirmasi,
  // backup pengaman otomatis, dan muat ulang sesudah restore.
  // -------------------------------------------------------------
  const [backupSummary, setBackupSummary] = useState<BackupSummary | null>(null);
  const [backupReminder, setBackupReminder] = useState<BackupReminderState>(() => getBackupReminderState());
  const [backupReminderDismissed, setBackupReminderDismissed] = useState(false);
  const [backupSafetySlot, setBackupSafetySlot] = useState<SafetySlotInfo>(() => getSafetySlotInfo());
  const [backupBusy, setBackupBusy] = useState<'export' | 'import' | 'restore' | null>(null);
  const [backupNotice, setBackupNotice] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importText, setImportText] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<Extract<RestoreValidation, { ok: true }> | null>(null);
  const [restoreConfirmed, setRestoreConfirmed] = useState(false);
  const [restoreDone, setRestoreDone] = useState<{ restoredKeys: string[]; skippedKeys: string[]; warnings: string[] } | null>(null);
  const backupFileInputRef = useRef<HTMLInputElement | null>(null);

  const formatBackupBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  const refreshBackupTab = () => {
    setBackupSummary(getBackupSummary());
    setBackupReminder(getBackupReminderState());
    setBackupSafetySlot(getSafetySlotInfo());
  };

  useEffect(() => {
    if (activeTab === 'backup') refreshBackupTab();
  }, [activeTab]);

  const handleExportBackup = () => {
    setBackupBusy('export');
    setBackupNotice(null);
    setRestoreDone(null);
    try {
      const result = createBackup();
      if (!result.ok) {
        setBackupNotice({ kind: 'error', text: result.error });
        return;
      }
      downloadBackup(result.content, result.filename);
      recordBackupExport();
      setBackupReminder(getBackupReminderState());
      const warnSuffix =
        result.metadata.warnings && result.metadata.warnings.length > 0
          ? `${t('settings.backup_unduh_warn')}${result.metadata.warnings.join(' ')}`
          : '';
      setBackupNotice({
        kind: 'success',
        text: `${t('settings.backup_unduh_a')}${result.filename} (${formatBackupBytes(result.sizeBytes)}${t('settings.backup_unduh_c')}${warnSuffix}`,
      });
    } catch (e) {
      setBackupNotice({ kind: 'error', text: `${t('settings.backup_gagal_buat_a')}${String((e as Error)?.message || e)}` });
    } finally {
      setBackupBusy(null);
    }
  };

  const handleImportFileSelected = async (file: File | undefined) => {
    if (!file) return;
    setBackupBusy('import');
    setBackupNotice(null);
    setImportPreview(null);
    setImportText(null);
    setRestoreConfirmed(false);
    setRestoreDone(null);
    setImportFileName(file.name);
    try {
      if (file.size > MAX_IMPORT_BYTES) {
        setBackupNotice({
          kind: 'error',
          text: `${t('settings.backup_file_besar_a')}${formatBackupBytes(file.size)}${t('settings.backup_file_besar_b')}${MAX_IMPORT_BYTES / 1024 / 1024}${t('settings.backup_file_besar_c')}`,
        });
        return;
      }
      const text = await file.text();
      const validation = validateBackup(text);
      if (!validation.ok) {
        setBackupNotice({ kind: 'error', text: `${t('settings.backup_file_ditolak_a')}${validation.error}${t('settings.backup_file_ditolak_b')}` });
        return;
      }
      setImportText(text);
      setImportPreview(validation);
    } catch (e) {
      setBackupNotice({ kind: 'error', text: `${t('settings.backup_gagal_baca_a')}${String((e as Error)?.message || e)}` });
    } finally {
      setBackupBusy(null);
    }
  };

  const handleConfirmRestore = () => {
    if (!importText || !importPreview || !restoreConfirmed) return;
    setBackupBusy('restore');
    setBackupNotice(null);
    try {
      // 1. Backup pengaman dari kondisi SAAT INI — wajib sebelum restore.
      const safety = createSafetyBackup();
      if (!safety.ok) {
        setBackupNotice({
          kind: 'error',
          text: `${t('settings.restore_batal_gagal_a')}${safety.error}${t('settings.restore_batal_gagal_b')}`,
        });
        return;
      }
      let safetyDownloaded = false;
      if (safety.content && safety.filename) {
        try {
          downloadBackup(safety.content, safety.filename);
          safetyDownloaded = true;
        } catch {
          // Unduhan gagal — slot lokal tetap menjadi jaring pengaman.
        }
      }
      // Jaring pengaman WAJIB ada di salah satu jalur sebelum restore menulis
      // apa pun: bila slot lokal penuh DAN unduhan gagal, batalkan restore.
      if (!safety.slotStored && !safetyDownloaded) {
        setBackupNotice({
          kind: 'error',
          text: t('settings.restore_batal_penuh'),
        });
        return;
      }
      setBackupSafetySlot(getSafetySlotInfo());
      // 2. Restore (sudah divalidasi di pratinjau; restoreBackup memvalidasi ulang).
      const result = restoreBackup(importText);
      if (!result.ok) {
        setBackupNotice({
          kind: 'error',
          text: `${result.error}${t('settings.restore_error_b')}${safety.filename}${t('settings.restore_error_c')}`,
        });
        return;
      }
      setRestoreDone({ restoredKeys: result.restoredKeys, skippedKeys: result.skippedKeys, warnings: result.warnings });
      setImportPreview(null);
      setImportText(null);
      setRestoreConfirmed(false);
      refreshBackupTab();
    } catch (e) {
      setBackupNotice({ kind: 'error', text: `${t('settings.restore_gagal_a')}${String((e as Error)?.message || e)}` });
    } finally {
      setBackupBusy(null);
    }
  };

  const handleRestoreFromSafetySlot = () => {
    const content = getSafetySlotContent();
    if (!content) {
      setBackupNotice({ kind: 'error', text: t('settings.slot_kosong') });
      return;
    }
    setImportFileName('Backup pengaman (slot lokal)');
    const validation = validateBackup(content);
    if (!validation.ok) {
      setBackupNotice({ kind: 'error', text: `${t('settings.slot_rusak_a')}${validation.error}` });
      return;
    }
    setImportText(content);
    setImportPreview(validation);
    setRestoreConfirmed(false);
    setRestoreDone(null);
    setBackupNotice({
      kind: 'info',
      text: t('settings.slot_pratinjau'),
    });
  };

  useEffect(() => {
    if (initialTab) {
      const resolved = resolveTab(initialTab);
      setActiveTab(resolved);
      if (resolved.startsWith('project-')) {
        setScope('PROJECT');
      } else {
        // D-33/D-34 (Batch G2): tab global (mis. users/security dari menu
        // TopBar) selalu dibuka dalam scope GLOBAL agar nav kiri dan
        // panel kanan selaras — tanpa redirect tab (lihat restrictedTab).
        setScope('GLOBAL');
      }
    }
  }, [initialTab]);

  // -------------------------------------------------------------
  // FORM STATES: LEVEL 1 (ACCOUNT)
  // -------------------------------------------------------------
  const [profileName, setProfileName] = useState(currentUser.name);
  const [profileEmail, setProfileEmail] = useState(currentUser.email);
  // P2 UI-2: jangan tampilkan profil/contoh palsu seolah data pengguna.
  const [profilePhone, setProfilePhone] = useState(currentUser.phone || '');
  const [profileTitle, setProfileTitle] = useState(currentUser.title || '');
  const [profileCompany, setProfileCompany] = useState(currentUser.company || '');

  const [dateFormat, setDateFormat] = useState('DD/MM/YYYY');
  // Mata uang TAMPIL (preferensi display-only, pola ThemeContext): nilai
  // sumber resmi tetap IDR; state lokal lama systemCurrency diganti
  // context agar pilihan berlaku di seluruh aplikasi (RAB, ringkasan).
  const { displayCurrency, setDisplayCurrency, rates, refreshRates, setManualRate, clearManualRate } = useCurrency();
  const [manualRateInput, setManualRateInput] = useState('');
  const [manualRateError, setManualRateError] = useState<string | null>(null);
  const [rateRefreshing, setRateRefreshing] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);

  const [notifProject, setNotifProject] = useState(true);
  const [notifRab, setNotifRab] = useState(true);
  const [notifDed, setNotifDed] = useState(true);
  const [notifQto, setNotifQto] = useState(true);
  const [notifSystem, setNotifSystem] = useState(true);
  const [notifSecurity, setNotifSecurity] = useState(true);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // -------------------------------------------------------------
  // EZRAB AI AUDIT & ENGINE STATUS
  // -------------------------------------------------------------
  const [isAuditingAi, setIsAuditingAi] = useState(false);
  const [aiAuditResult, setAiAuditResult] = useState<{
    connected: boolean;
    latencyMs?: number;
    message?: string;
    lastChecked?: string;
  } | null>(null);

  const handleRunAiAudit = async () => {
    setIsAuditingAi(true);
    const start = Date.now();
    try {
      const res = await fetch('/api/ai/engine-status');
      if (res.ok) {
        const data = await res.json();
        // Kontrak nyata endpoint: status 'ready' | 'no_keys' (BUKAN 'CONNECTED').
        const ready = data.status === 'ready';
        setAiAuditResult({
          connected: ready,
          latencyMs: Date.now() - start,
          message: ready
            ? t('settings.ai_engine_ok')
            : t('settings.ai_engine_no_keys'),
          lastChecked: new Date().toLocaleTimeString('id-ID'),
        });
      } else {
        setAiAuditResult({
          connected: false,
          latencyMs: Date.now() - start,
          message: `${t('settings.ai_engine_http_a')}${res.status}${t('settings.ai_engine_http_b')}`,
          lastChecked: new Date().toLocaleTimeString('id-ID'),
        });
      }
    } catch {
      setAiAuditResult({
        connected: false,
        latencyMs: Date.now() - start,
        message: t('settings.ai_engine_unreachable'),
        lastChecked: new Date().toLocaleTimeString('id-ID'),
      });
    } finally {
      setIsAuditingAi(false);
    }
  };

  // -------------------------------------------------------------
  // FORM STATES: LEVEL 2 (WORKSPACE DEFAULTS)
  // -------------------------------------------------------------
  // P2 UI-2: workspace defaults kosong — bukan identitas contoh.
  // (Owner 2026-10-27: dua field di bawah sebelumnya masih terisi nama
  // contoh — dikosongkan agar konsisten; nilai perusahaan yang sudah
  // tersimpan tidak diubah oleh perubahan default ini.)
  const [workspaceName, setWorkspaceName] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [companyNpwp, setCompanyNpwp] = useState('');
  const [companyDirector, setCompanyDirector] = useState('');
  const [companyLeadEstimator, setCompanyLeadEstimator] = useState('');

  // Master Data & Estimator Defaults
  const [defaultAhspSource, setDefaultAhspSource] = useState('pupr-2026');
  const [defaultRegion, setDefaultRegion] = useState('DKI Jakarta (Indeks 1.00)');
  const [defaultOverhead, setDefaultOverhead] = useState(10);
  const [defaultProfit, setDefaultProfit] = useState(10);
  const [defaultPpn, setDefaultPpn] = useState(11);
  const [defaultWaste, setDefaultWaste] = useState(5);
  const [defaultRounding, setDefaultRounding] = useState('RIBUAN');

  // Documents Defaults
  const [pdfPaperSize, setPdfPaperSize] = useState('A4');
  const [pdfOrientation, setPdfOrientation] = useState('landscape');
  const [showCompanyLogo, setShowCompanyLogo] = useState(true);
  const [showWatermark, setShowWatermark] = useState(false);
  const [docPrefix, setDocPrefix] = useState('EZRAB');

  // Schedule Defaults
  const [defaultWorkingDays, setDefaultWorkingDays] = useState(6);
  const [workingHoursPerDay, setWorkingHoursPerDay] = useState(7);

  // Cost Defaults
  const [costCodeFormat, setCostCodeFormat] = useState('WBS_STANDARD');

  // -------------------------------------------------------------
  // FORM STATES: LEVEL 3 (PROJECT CONFIGURATION)
  // -------------------------------------------------------------
  const [projName, setProjName] = useState(activeProject?.name || '');
  const [projNumber, setProjNumber] = useState(activeProject?.projectNumber || 'PROJ-2026-001');
  const [projClient, setProjClient] = useState(activeProject?.clientName || '');
  const [projLocation, setProjLocation] = useState(activeProject?.location || '');
  const [projBuildingType, setProjBuildingType] = useState(activeProject?.buildingType || 'Rumah Tinggal');
  const [projBuildingArea, setProjBuildingArea] = useState(activeProject?.buildingArea || 120);
  // D-77/NEW-08: nilai awal form proyek dari resolver kanonis (field proyek
  // → costSummary → default mesin) — SAMA dengan yang dibaca Rekapitulasi.
  // Bentuk lama `(field) ?? 0` menghilangkan profit 5% demo (yang hanya
  // hidup di costSummary) sehingga Save polos menulis profitPercent: 0 dan
  // menjatuhkan total emas Rp1.089.879.733 → Rp1.040.339.744.
  const [projOverhead, setProjOverhead] = useState(() => resolveProjectFormConfig(activeProject).overheadPercent);
  const [projProfit, setProjProfit] = useState(() => resolveProjectFormConfig(activeProject).profitPercent);
  const [projPpn, setProjPpn] = useState(() => resolveProjectFormConfig(activeProject).ppnPercent);
  const [projRounding, setProjRounding] = useState((activeProject as any)?.roundingScheme || 'RIBUAN');
  const [projWaste, setProjWaste] = useState((activeProject as any)?.wastePercent ?? 5);
  const [projVolumeDecimals, setProjVolumeDecimals] = useState(2);
  const [projStartDate, setProjStartDate] = useState(activeProject?.startDate || '2026-04-01');
  const [projTargetDate, setProjTargetDate] = useState(activeProject?.targetDate || '2026-10-31');
  /* Informasi Proyek lengkap (owner 2026-10-27, dari daftar screenshot):
   * semua field sudah ada di tipe Project — form lama hanya menampilkan 6.
   * Durasi proyek tidak disimpan terpisah: diturunkan dari
   * startDate → targetDate di tampilan. */
  const [projProvince, setProjProvince] = useState(activeProject?.province || '');
  const [projCityRegency, setProjCityRegency] = useState(activeProject?.cityRegency || '');
  const [projInstitution, setProjInstitution] = useState(activeProject?.institution || '');
  const [projContractType, setProjContractType] = useState(activeProject?.contractType || '');
  const [projFundingSource, setProjFundingSource] = useState(activeProject?.fundingSource || '');
  const [projOwnerName, setProjOwnerName] = useState(activeProject?.ownerName || '');
  const [projConsultantName, setProjConsultantName] = useState(activeProject?.consultantName || '');
  const [projContractorName, setProjContractorName] = useState(activeProject?.contractorName || '');
  const [projBudgetYear, setProjBudgetYear] = useState(activeProject?.budgetYear || new Date().getFullYear());
  /* Pajak opt-in (sinkron dengan EstimatorSettingsView + Rekap): */
  const [projPpnEnabled, setProjPpnEnabled] = useState(() => resolveProjectFormConfig(activeProject).ppnEnabled);
  const [projPphEnabled, setProjPphEnabled] = useState(() => resolveProjectFormConfig(activeProject).pphEnabled);
  const [projPph, setProjPph] = useState(() => resolveProjectFormConfig(activeProject).pphPercent);

  // Sync project form when activeProject changes
  useEffect(() => {
    if (activeProject) {
      // D-77/NEW-08: sinkronisasi memakai resolver kanonis yang sama dengan
      // nilai awal (lihat catatan di atas) — bukan `field ?? 0`.
      const formCfg = resolveProjectFormConfig(activeProject);
      setProjName(activeProject.name || '');
      setProjNumber(activeProject.projectNumber || 'PROJ-2026-001');
      setProjClient(activeProject.clientName || '');
      setProjLocation(activeProject.location || '');
      setProjBuildingType(activeProject.buildingType || 'Rumah Tinggal');
      setProjBuildingArea(activeProject.buildingArea || 120);
      setProjOverhead(formCfg.overheadPercent);
      setProjProfit(formCfg.profitPercent);
      setProjPpn(formCfg.ppnPercent);
      setProjRounding((activeProject as any)?.roundingScheme || 'RIBUAN');
      setProjWaste((activeProject as any)?.wastePercent ?? 5);
      setProjStartDate(activeProject.startDate || '2026-04-01');
      setProjTargetDate(activeProject.targetDate || '2026-10-31');
      setProjProvince(activeProject.province || '');
      setProjCityRegency(activeProject.cityRegency || '');
      setProjInstitution(activeProject.institution || '');
      setProjContractType(activeProject.contractType || '');
      setProjFundingSource(activeProject.fundingSource || '');
      setProjOwnerName(activeProject.ownerName || '');
      setProjConsultantName(activeProject.consultantName || '');
      setProjContractorName(activeProject.contractorName || '');
      setProjBudgetYear(activeProject.budgetYear || new Date().getFullYear());
      setProjPpnEnabled(formCfg.ppnEnabled);
      setProjPphEnabled(formCfg.pphEnabled);
      setProjPph(formCfg.pphPercent);
    }
  }, [activeProject]);

  // Handle Save with Audit Log recording
  const handleSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (scope === 'PROJECT' && activeProject) {
      // Save to ProjectContext (Source of Truth)
      updateProject(activeProject.id, {
        name: projName,
        projectNumber: projNumber,
        clientName: projClient,
        location: projLocation,
        buildingType: projBuildingType as any,
        buildingArea: Number(projBuildingArea),
        startDate: projStartDate,
        targetDate: projTargetDate,
        province: projProvince,
        cityRegency: projCityRegency,
        institution: projInstitution,
        contractType: projContractType,
        fundingSource: projFundingSource,
        ownerName: projOwnerName,
        consultantName: projConsultantName,
        contractorName: projContractorName,
        budgetYear: Number(projBudgetYear),
        overheadPercent: Number(projOverhead),
        profitPercent: Number(projProfit),
        ppnPercent: Number(projPpn),
        ppnEnabled: projPpnEnabled,
        pphEnabled: projPphEnabled,
        pphPercent: Number(projPph),
        taxPercent: Number(projPpn),
        roundingScheme: projRounding,
        wastePercent: Number(projWaste),
      } as any);
      /* Selaraskan kartu total proyek dengan flag/persen pajak yang baru
       * disimpan (lihat refreshProjectTotals di ProjectContext). */
      refreshProjectTotals(activeProject.id);

      // Record audit log
      settingsAuditService.recordChange({
        actor: { id: currentUser.id, name: currentUser.name, role: currentUser.role },
        scope: 'PROJECT',
        projectId: activeProject.id,
        projectName: projName,
        category: 'ESTIMATOR',
        field: 'project_parameters',
        fieldLabel: `Parameter Proyek: ${projName}`,
        oldValue: { overhead: (activeProject as any)?.overheadPercent, ppn: (activeProject as any)?.ppnPercent, ppnEnabled: (activeProject as any)?.ppnEnabled, pphEnabled: (activeProject as any)?.pphEnabled, pph: (activeProject as any)?.pphPercent },
        newValue: { overhead: projOverhead, ppn: projPpn, ppnEnabled: projPpnEnabled, pphEnabled: projPphEnabled, pph: projPph, profit: projProfit, rounding: projRounding },
        reason: 'Pembaruan konfigurasi estimator khusus proyek',
      });

      setToastMessage(`${t('settings.toast_proyek_a')}${projName}${t('settings.toast_proyek_b')}`);
    } else {
      // Global Save
      settingsAuditService.recordChange({
        actor: { id: currentUser.id, name: currentUser.name, role: currentUser.role },
        scope: 'WORKSPACE',
        category: 'WORKSPACE',
        field: 'workspace_settings',
        fieldLabel: 'Pengaturan Global Workspace',
        oldValue: { name: workspaceName, defaultPpn, defaultOverhead },
        newValue: { name: workspaceName, defaultPpn, defaultOverhead, defaultRounding },
        reason: 'Pembaruan preferensi dan standar workspace',
      });

      setToastMessage(t('settings.toast_workspace'));
    }

    setAuditLogs(settingsAuditService.getLogs());
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 3000);
  };

  const handleUserAdded = (newUser: WorkspaceMember) => {
    setUsersList(ClientUserManagementService.getUsers());
    settingsAuditService.recordChange({
      actor: { id: currentUser.id, name: currentUser.name, role: currentUser.role },
      scope: 'WORKSPACE',
      category: 'WORKSPACE',
      field: 'users_list',
      fieldLabel: 'Penambahan Anggota Tim Baru',
      oldValue: `${usersList.length} anggota`,
      newValue: `${usersList.length + 1} anggota (${newUser.name})`,
      reason: `Menambahkan ${newUser.name} sebagai ${newUser.role}`,
    });
    setAuditLogs(settingsAuditService.getLogs());
  };

  // Searchable Settings Catalog for Live Search
  const searchCatalog: SearchableSettingItem[] = useMemo(() => [
    { id: 'profile', scope: 'GLOBAL', categoryLabel: 'Akun', title: t('settings.tab_profil'), description: 'Ubah nama, email, nomor kontak, foto avatar', keywords: ['profil', 'nama', 'email', 'avatar', 'user', 'bahasa', 'tanggal', 'mata uang', 'rupiah', 'idr'] },
    { id: 'notifications', scope: 'GLOBAL', categoryLabel: 'Akun', title: t('settings.tab_notifikasi'), description: 'Preferensi pemberitahuan proyek dan revisi RAB', keywords: ['notifikasi', 'email', 'lonceng', 'alert', 'pemberitahuan'] },
    { id: 'security', scope: 'GLOBAL', categoryLabel: 'Akun', title: t('settings.tab_keamanan'), description: 'Ubah password dan otentikasi 2 faktor', keywords: ['keamanan', 'password', 'kata sandi', 'login', '2fa', 'security'] },
    { id: 'company', scope: 'GLOBAL', categoryLabel: 'Workspace', title: t('settings.tab_perusahaan'), description: 'Nama kantor, NPWP, alamat dan kontak', keywords: ['perusahaan', 'kantor', 'npwp', 'alamat', 'telepon', 'pt', 'cv'] },
    { id: 'users', scope: 'GLOBAL', categoryLabel: 'Workspace', title: t('settings.tab_tim'), description: 'Kelola anggota tim dan undang estimator baru', keywords: ['pengguna', 'tim', 'anggota', 'users', 'undang', 'role'] },
    { id: 'roles', scope: 'GLOBAL', categoryLabel: 'Workspace', title: t('settings.tab_role'), description: 'Matriks izin akses Super Admin, Estimator, Direksi', keywords: ['role', 'hak akses', 'izin', 'permission', 'direksi', 'client', 'editor'] },
    { id: 'subscription', scope: 'GLOBAL', categoryLabel: 'Workspace', title: t('settings.tab_paket'), description: 'Paket saat ini, kuota kredit AI, dan status langganan (simulasi)', keywords: ['paket', 'billing', 'langganan', 'proyek', 'pembayaran', 'invoice'] },
    { id: 'master-data', scope: 'GLOBAL', categoryLabel: 'Master Data', title: t('settings.tab_master'), description: 'Database acuan harga 38 provinsi dan PUPR 2026', keywords: ['master', 'harga', 'ahsp', 'pupr', 'material', 'upah', 'alat'] },
    { id: 'estimator', scope: 'GLOBAL', categoryLabel: 'Estimator', title: t('settings.tab_estimator'), description: 'Persentase overhead acuan, PPN 11%, pembulatan', keywords: ['pajak', 'ppn', 'overhead', 'profit', 'margin', 'pembulatan', 'rab', 'estimator'] },
    { id: 'ded-volume', scope: 'GLOBAL', categoryLabel: 'DED & Volume', title: t('settings.tab_ded'), description: 'Presisi desimal volume dan susut material', keywords: ['ded', 'volume', 'presisi', 'desimal', 'waste', 'susut', 'satuan'] },
    { id: 'documents', scope: 'GLOBAL', categoryLabel: 'Dokumen', title: t('settings.tab_dokumen'), description: 'Standar penomoran dokumen tender dan format PDF', keywords: ['dokumen', 'template', 'pdf', 'penomoran', 'kop', 'tanda tangan', 'surat'] },
    { id: 'schedule', scope: 'GLOBAL', categoryLabel: 'Schedule', title: t('settings.tab_jadwal'), description: 'Hari kerja per minggu dan toleransi kurva-s', keywords: ['jadwal', 'kalender', 'hari kerja', 'kurva s', 'durasi'] },
    { id: 'cost', scope: 'GLOBAL', categoryLabel: 'Cost', title: t('settings.tab_biaya'), description: 'Standar kode akun biaya proyek dan arus kas', keywords: ['cost', 'biaya', 'cost code', 'budget', 'baseline', 'cashflow'] },
    { id: 'integrations', scope: 'GLOBAL', categoryLabel: 'Integrasi', title: t('settings.tab_integrasi'), description: 'Google Drive, Live Spreadsheet Sync, API', keywords: ['integrasi', 'storage', 'api', 'spreadsheet', 'sync', 'excel'] },
    { id: 'audit-log', scope: 'GLOBAL', categoryLabel: 'Sistem', title: t('settings.tab_audit'), description: 'Jejak log perubahan konfigurasi penting', keywords: ['audit', 'log', 'riwayat', 'history', 'jejak', 'perubahan'] },
    { id: 'backup', scope: 'GLOBAL', categoryLabel: 'Sistem', title: 'Cadangan & Pulihkan Data', description: 'Ekspor backup JSON semua data bisnis dan pulihkan dari file backup', keywords: ['backup', 'cadangan', 'pulihkan', 'restore', 'ekspor', 'impor', 'salinan', 'kehilangan data'] },
    // Project Search Items
    { id: 'project-info', scope: 'PROJECT', categoryLabel: 'Khusus Proyek', title: 'Informasi Proyek', description: 'Nama, nomor kontrak, owner, lokasi, luas', keywords: ['proyek', 'info proyek', 'owner', 'kontrak', 'lokasi', 'luas'] },
    { id: 'project-estimator', scope: 'PROJECT', categoryLabel: 'Khusus Proyek', title: 'Estimator & Pajak Proyek', description: 'Overhead proyek, PPN proyek, pembulatan khusus', keywords: ['pajak proyek', 'overhead proyek', 'ppn proyek', 'pembulatan proyek', 'markup proyek'] },
    { id: 'project-ded', scope: 'PROJECT', categoryLabel: 'Khusus Proyek', title: 'DED & Waste Factor Proyek', description: 'Presisi volume dan susut material proyek', keywords: ['waste proyek', 'desimal proyek', 'presisi proyek'] },
    { id: 'project-documents', scope: 'PROJECT', categoryLabel: 'Khusus Proyek', title: 'Dokumen & Tanda Tangan Proyek', description: 'Format nomor surat dan penandatangan proyek', keywords: ['nomor dokumen proyek', 'penandatangan proyek', 'kop proyek'] },
  ], [lang]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return searchCatalog.filter((item) => {
      return (
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.categoryLabel.toLowerCase().includes(q) ||
        item.keywords.some((k) => k.includes(q))
      );
    });
  }, [searchQuery, searchCatalog]);

  const renderRoleBadge = (role: UserRole) => {
    const styles: Record<UserRole, { bg: string; color: string; border: string; label: string }> = {
      SUPER_ADMIN: { bg: 'var(--ez-hue-blue-bg)', color: 'var(--ez-color-primary-hover)', border: 'var(--ez-hue-blue-border)', label: t('settings.role_super_admin') },
      ESTIMATOR: { bg: 'var(--ez-hue-green-bg)', color: 'var(--ez-hue-green-text)', border: 'var(--ez-hue-green-border)', label: t('settings.role_estimator') },
      DIREKSI: { bg: 'var(--ez-hue-purple-bg)', color: 'var(--ez-hue-purple-text)', border: 'var(--ez-hue-purple-border)', label: t('settings.role_direksi') },
      CLIENT: { bg: 'var(--ez-hue-amber-bg)', color: 'var(--ez-hue-amber-text)', border: 'var(--ez-hue-amber-border)', label: t('settings.role_client') },
      EDITOR: { bg: 'var(--ez-color-surface-tertiary)', color: 'var(--ez-color-text-slate)', border: 'var(--ez-color-border)', label: t('settings.role_editor') },
    };
    const s = styles[role] || styles.SUPER_ADMIN;
    return (
      <span
        style={{
          fontSize: '11px',
          fontWeight: 700,
          padding: '2px 8px',
          borderRadius: 'var(--ez-radius-pill)',
          background: s.bg,
          color: s.color,
          border: `1px solid ${s.border}`,
          display: 'inline-flex',
          alignItems: 'center',
          letterSpacing: '0.01em',
        }}
      >
        {s.label}
      </span>
    );
  };

  // Grouped Navigation for Level 1 & 2 (Global Workspace Scope)
  const globalNavGroups = [
    {
      group: t('settings.grup_akun'),
      items: [
        { id: 'profile' as SettingsTabId, label: t('settings.tab_profil'), icon: User },
        { id: 'notifications' as SettingsTabId, label: t('settings.tab_notifikasi'), icon: Bell },
        { id: 'security' as SettingsTabId, label: t('settings.tab_keamanan'), icon: Shield },
      ],
    },
    {
      group: t('settings.grup_workspace'),
      items: [
        { id: 'company' as SettingsTabId, label: t('settings.tab_perusahaan'), icon: Building2 },
        { id: 'users' as SettingsTabId, label: t('settings.tab_tim'), icon: Users },
        { id: 'roles' as SettingsTabId, label: t('settings.tab_role'), icon: Lock },
        { id: 'subscription' as SettingsTabId, label: t('settings.tab_paket'), icon: CreditCard },
      ],
    },
    {
      group: t('settings.grup_teknis'),
      items: [
        { id: 'master-data' as SettingsTabId, label: t('settings.tab_master'), icon: Database },
        { id: 'estimator' as SettingsTabId, label: t('settings.tab_estimator'), icon: Coins },
        { id: 'ded-volume' as SettingsTabId, label: t('settings.tab_ded'), icon: Calculator },
        { id: 'documents' as SettingsTabId, label: t('settings.tab_dokumen'), icon: FileSpreadsheet },
        { id: 'schedule' as SettingsTabId, label: t('settings.tab_jadwal'), icon: Calendar },
        { id: 'cost' as SettingsTabId, label: t('settings.tab_biaya'), icon: TrendingUp },
      ],
    },
    {
      group: t('settings.grup_sistem'),
      items: [
        { id: 'integrations' as SettingsTabId, label: t('settings.tab_integrasi'), icon: RefreshCw },
        { id: 'audit-log' as SettingsTabId, label: t('settings.tab_audit'), icon: History },
        // P1-A (R-01): label hardcode Indonesia seperti tab proyek —
        // dictionaries i18n bukan bagian dari paket ini.
        { id: 'backup' as SettingsTabId, label: t('settings.tab_backup'), icon: DatabaseBackup },
        { id: 'help' as SettingsTabId, label: t('settings.tab_bantuan'), icon: HelpCircle },
      ],
    },
  ];

  /**
   * Pembatasan menu yang jelas-jelas sensitif untuk sesi role demo:
   * - 'users' & 'roles'  → butuh capability 'manage-users'
   * - 'security'         → butuh capability 'manage-security'
   * Tanpa sesi role aktif, resolveCapability mengembalikan false —
   * jadi tab ini JUGA tertutup untuk sesi gerbang-kode-akses saja
   * (komentar lama "tidak ada pembatasan" SALAH; diperbaiki D-33/D-34
   * Batch G2). Kapabilitas TIDAK diberikan ke peran demo default
   * (NEW-07): manajemen pengguna/tim adalah mutasi sensitif yang tidak
   * pantas dibuka untuk semua pengguna demo mode showcase. Yang
   * diperbaiki adalah KEJUJURAN tampilannya: menu dinonaktifkan di
   * TopBar dan tab yang dibuka langsung menampilkan panel penjelasan
   * di tempat — tidak pernah redirect diam-diam ke Profil.
   */
  const isTabAllowed = (tabId: SettingsTabId): boolean => {
    if (tabId === 'users' || tabId === 'roles') return hasCapability('manage-users');
    if (tabId === 'security') return hasCapability('manage-security');
    return true;
  };

  const visibleGlobalNavGroups = globalNavGroups
    .map((g) => ({ ...g, items: g.items.filter((item) => isTabAllowed(item.id)) }))
    .filter((g) => g.items.length > 0);

  // D-33/D-34 (Batch G2): TIDAK ADA LAGI redirect diam-diam ke Profil
  // bila tab aktif tidak diizinkan. Tab tetap terpilih dan panel kanan
  // menampilkan penjelasan "tidak tersedia untuk sesi ini" + kapabilitas
  // yang diperlukan (lihat blok restricted di panel konten). Redirect
  // lama membuat menu TopBar "Manajemen Pengguna & Tim" / "Keamanan
  // Akun" tampak membuka Pengaturan generik.
  const restrictedTab = !isTabAllowed(activeTab)
    ? globalNavGroups.flatMap((g) => g.items).find((item) => item.id === activeTab)
    : undefined;
  const restrictedCapability = activeTab === 'security' ? 'manage-security' : 'manage-users';

  // Grouped Navigation for Level 3 (Project Scope)
  const projectNavItems = [
    { id: 'project-info' as SettingsTabId, label: t('settings.nav_proyek_info'), icon: FolderKanban },
    { id: 'project-estimator' as SettingsTabId, label: t('settings.nav_proyek_estimator'), icon: Coins },
    { id: 'project-ded' as SettingsTabId, label: t('settings.nav_proyek_ded'), icon: Calculator },
    { id: 'project-documents' as SettingsTabId, label: t('settings.nav_proyek_dokumen'), icon: FileText },
    // D-78 (Batch G2, OD-20(a)): label jujur — bagian ini hanya berisi
    // dua field tanggal, bukan kalender hari kerja. Tanpa membangun
    // kalender (di luar otorisasi OD-20(a)).
    { id: 'project-schedule' as SettingsTabId, label: t('settings.nav_proyek_jadwal'), icon: Calendar },
    { id: 'project-cost' as SettingsTabId, label: t('settings.nav_proyek_biaya'), icon: TrendingUp },
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '18px',
        fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        maxWidth: '1680px',
        margin: '0 auto',
        width: '100%',
      }}
    >
      {/* Toast Notification */}
      {savedToast && (
        <div
          className="ez-toast"
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            background: '#0F172A',
            color: '#FFFFFF',
            padding: '12px 20px',
            borderRadius: 'var(--ez-radius-control)',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            zIndex: 9999,
          }}
        >
          <Check size={16} color="#4ADE80" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 1. TOP HEADER & SCOPE SWITCHER                                */}
      {/* ------------------------------------------------------------- */}
      <div
        className="ezrab-set-header"
        style={{
          background: 'var(--ez-color-surface)',
          borderRadius: '20px',
          border: '1px solid #EEF1F6',
          padding: '18px 24px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.045)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: 'var(--ez-radius-control)',
                background: 'var(--ez-hue-blue-bg)',
                border: '1px solid var(--ez-hue-blue-bg-deep)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--ez-color-primary)',
                flexShrink: 0,
              }}
            >
              <Settings size={22} />
            </div>
            <div>
              <div className="ezrab-set-titlerow" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
                  {t('settings.judul')}
                </h1>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: 'var(--ez-radius-pill)',
                    background: scope === 'PROJECT' ? 'var(--ez-hue-amber-bg-deep)' : 'var(--ez-hue-blue-bg)',
                    color: scope === 'PROJECT' ? 'var(--ez-hue-amber-text-dark)' : 'var(--ez-color-primary-hover)',
                    border: scope === 'PROJECT' ? '1px solid var(--ez-hue-amber-border)' : '1px solid var(--ez-hue-blue-bg-deep)',
                  }}
                >
                  {scope === 'PROJECT' ? t('settings.scope_proyek') : t('settings.scope_global')}
                </span>
              </div>
              <p style={{ fontSize: '12.5px', color: 'var(--ez-color-text-muted)', margin: '3px 0 0' }}>
                {scope === 'PROJECT' ? (
                  <>{t('settings.scope_sub_proyek_a')}{activeProject?.name || t('settings.proyek_aktif')}{t('settings.scope_sub_proyek_b')}</>
                ) : (
                  t('settings.scope_sub_global')
                )}
              </p>
            </div>
          </div>

          {/* Right Action: Save Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={handleSave}
              style={{
                height: '38px',
                padding: '0 20px',
                borderRadius: '9px',
                background: 'var(--ez-color-primary)',
                color: '#FFFFFF',
                border: 'none',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 2px 8px rgba(37,99,235,0.25)',
                transition: 'all 0.15s ease',
              }}
            >
              <Save size={15} />
              <span>{t('common.simpan')}</span>
            </button>
          </div>
        </div>

        {/* Scope Switcher Bar & Live Search */}
        <div className="ezrab-set-scopebar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', borderTop: '1px solid var(--ez-color-surface-tertiary)', paddingTop: '12px' }}>
          {/* Level Switcher (Level 1/2 vs Level 3) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--ez-color-surface-tertiary)', padding: '3px', borderRadius: '10px' }}>
            <button
              onClick={() => {
                setScope('GLOBAL');
                if (activeTab.startsWith('project-')) setActiveTab('profile');
              }}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                border: 'none',
                background: scope === 'GLOBAL' ? 'var(--ez-color-surface)' : 'transparent',
                color: scope === 'GLOBAL' ? 'var(--ez-color-primary)' : 'var(--ez-color-text-muted)',
                boxShadow: scope === 'GLOBAL' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease',
              }}
            >
              <Building2 size={14} />
              <span>{t('settings.scope_global_btn')}</span>
            </button>

            <button
              onClick={() => {
                setScope('PROJECT');
                if (!activeTab.startsWith('project-')) setActiveTab('project-info');
              }}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                border: 'none',
                background: scope === 'PROJECT' ? 'var(--ez-color-surface)' : 'transparent',
                color: scope === 'PROJECT' ? 'var(--ez-color-primary)' : 'var(--ez-color-text-muted)',
                boxShadow: scope === 'PROJECT' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease',
              }}
            >
              <FolderKanban size={14} />
              <span>{t('settings.scope_proyek_btn')}</span>
            </button>
          </div>

          {/* Project Selector (Visible in Project Scope) */}
          {scope === 'PROJECT' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-muted)' }}>{t('settings.pilih_proyek')}</span>
              <select
                value={selectedProjectId}
                onChange={(e) => {
                  setSelectedProjectId(e.target.value);
                  setCurrentProjectId(e.target.value);
                }}
                style={{
                  height: '34px',
                  borderRadius: '10px',
                  border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  padding: '0 10px',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.projectNumber || p.id})
                  </option>
                ))}
              </select>

              <button
                onClick={() => onNavigateTab?.('harga-proyek')}
                style={{
                  height: '34px',
                  padding: '0 12px',
                  borderRadius: '10px',
                  border: '1px solid var(--ez-hue-blue-bg-deep)',
                  background: 'var(--ez-hue-blue-bg)',
                  color: 'var(--ez-color-primary-hover)',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Tag size={13} />
                <span>{t('settings.override_harga_btn')}</span>
              </button>
            </div>
          )}

          {/* Live Search Input */}
          <div style={{ position: 'relative', width: '260px' }}>
            <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('settings.cari_placeholder')}
              style={{
                width: '100%',
                height: '34px',
                padding: '0 10px 0 32px',
                borderRadius: '10px',
                border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)',
                fontSize: '12px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', cursor: 'pointer', color: '#94A3B8' }}
              >
                <X size={13} />
              </button>
            )}

            {/* Search Dropdown Results */}
            {searchResults.length > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: '40px',
                  right: 0,
                  width: '340px',
                  maxHeight: '360px',
                  overflowY: 'auto',
                  background: 'var(--ez-color-surface)',
                  borderRadius: '16px',
                  border: '1px solid #EEF1F6',
                  boxShadow: '0 10px 25px rgba(15,23,42,0.12)',
                  zIndex: 50,
                  padding: '6px',
                }}
              >
                <div style={{ padding: '6px 10px', fontSize: '11px', fontWeight: 800, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase' }}>
                  {t('settings.cari_hasil_a')}{searchResults.length}{t('settings.cari_hasil_b')}
                </div>
                {searchResults.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setScope(item.scope);
                      setActiveTab(item.id);
                      setSearchQuery('');
                    }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '8px 10px',
                      borderRadius: '10px',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--ez-color-surface-secondary)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>{item.title}</span>
                      <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--ez-color-primary)', background: 'var(--ez-hue-blue-bg)', padding: '1px 5px', borderRadius: '4px' }}>
                        {item.categoryLabel}
                      </span>
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)' }}>{item.description}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. MAIN SETTINGS WORKSPACE (SIDEBAR + CONTENT PANEL)           */}
      {/* ------------------------------------------------------------- */}
      <div className="ez-settings-layout" style={{ display: 'grid', gridTemplateColumns: '270px 1fr', gap: '20px', alignItems: 'flex-start' }}>
        
        {/* Left Sidebar Navigation */}
        <div
          style={{
            background: 'var(--ez-color-surface)',
            borderRadius: '20px',
            border: '1px solid #EEF1F6',
            padding: '14px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.045)',
          }}
        >
          {scope === 'GLOBAL' ? (
            visibleGlobalNavGroups.map((group) => (
              <div key={group.group} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', padding: '4px 10px', letterSpacing: '0.04em' }}>
                  {group.group}
                </div>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      style={{
                        height: '36px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '0 12px',
                        borderRadius: '9px',
                        border: 'none',
                        background: isActive ? 'var(--ez-hue-blue-bg)' : 'transparent',
                        color: isActive ? 'var(--ez-color-primary)' : 'var(--ez-color-text-muted)',
                        fontSize: '12.5px',
                        fontWeight: isActive ? 700 : 500,
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.12s ease',
                        width: '100%',
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) e.currentTarget.style.background = 'var(--ez-color-surface-secondary)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <Icon size={16} color={isActive ? '#2563EB' : '#64748B'} />
                      <span>{item.label}</span>
                      {/* P1-A: titik pengingat bila backup belum pernah / sudah lama diekspor. */}
                      {item.id === 'backup' && backupReminder.needsReminder && (
                        <span
                          title={
                            backupReminder.lastExportAt
                              ? `${t('settings.cari_ekspor_terakhir_a')}${backupReminder.daysSinceExport}${t('settings.cari_ekspor_terakhir_b')}`
                              : t('settings.cari_belum_ekspor')
                          }
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: '#F59E0B',
                            flexShrink: 0,
                            marginLeft: 'auto',
                          }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', padding: '4px 10px', letterSpacing: '0.04em' }}>
                {t('settings.nav_grup_konfig_proyek')}
              </div>
              {projectNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    style={{
                      height: '36px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '0 12px',
                      borderRadius: '9px',
                      border: 'none',
                      background: isActive ? 'var(--ez-hue-amber-bg-deep)' : 'transparent',
                      color: isActive ? 'var(--ez-hue-amber-text-dark)' : 'var(--ez-color-text-slate)',
                      fontSize: '12.5px',
                      fontWeight: isActive ? 700 : 500,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.12s ease',
                      width: '100%',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'var(--ez-color-surface-secondary)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <Icon size={16} color={isActive ? '#B45309' : '#64748B'} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Content Panel */}
        <div
          className="ezrab-set-panel"
          style={{
            background: 'var(--ez-color-surface)',
            borderRadius: '20px',
            border: '1px solid #EEF1F6',
            padding: '24px 28px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.045)',
            minHeight: '620px',
          }}
        >
          {/* ===================================================================
              D-33/D-34 (Batch G2): TAB TERBATAS — ditampilkan DI TEMPAT
              bila tab aktif memerlukan kapabilitas yang tidak dimiliki
              sesi ini. Menggantikan redirect diam-diam ke Profil.
             =================================================================== */}
          {restrictedTab && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: '0 0 4px' }}>
                  {restrictedTab.label}
                </h3>
                <p style={{ fontSize: '12.5px', color: 'var(--ez-color-text-muted)', margin: 0 }}>
                  {t('settings.terbatas_desc')}
                </p>
              </div>
              <div
                style={{
                  background: 'var(--ez-hue-amber-bg)',
                  border: '1px solid var(--ez-hue-amber-border)',
                  borderRadius: '12px',
                  padding: '16px 18px',
                  fontSize: '13px',
                  lineHeight: 1.6,
                  color: 'var(--ez-color-text-body)',
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: '4px' }}>
                  {t('settings.terbatas_butuh_a')}{restrictedCapability}{t('settings.terbatas_butuh_b')}
                </div>
                <div>
                  {t('settings.terbatas_body')}
                </div>
              </div>
            </div>
          )}
          {/* ===================================================================
              GLOBAL SCOPE: 1. AKUN (PROFIL)
             =================================================================== */}
          {activeTab === 'profile' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: '0 0 4px' }}>
                  {t('settings.profil_judul')}
                </h3>
                <p style={{ fontSize: '12.5px', color: 'var(--ez-color-text-muted)', margin: 0 }}>
                  {t('settings.profil_desc')}
                </p>
              </div>

              {/* Avatar Row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', background: 'var(--ez-color-surface-secondary)', borderRadius: '16px', border: '1px solid #EEF1F6' }}>
                <div
                  style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%',
                    background: 'var(--ez-color-primary)',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '22px',
                    fontWeight: 800,
                  }}
                >
                  {profileName.charAt(0)}
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>{profileName}</div>
                  <div style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)' }}>{profileTitle}</div>
                  <div style={{ marginTop: '6px', fontFamily: 'inherit' }}>{renderRoleBadge(currentUser.role)}</div>
                </div>
              </div>

              <div className="ezrab-set-grid2" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.nama_lengkap')}</label>
                  <input
                    type="text"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.email_akun')}</label>
                  <input
                    type="email"
                    value={profileEmail}
                    onChange={(e) => setProfileEmail(e.target.value)}
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.profil_telp')}</label>
                  <input
                    type="text"
                    value={profilePhone}
                    onChange={(e) => setProfilePhone(e.target.value)}
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.profil_jabatan')}</label>
                  <input
                    type="text"
                    value={profileTitle}
                    onChange={(e) => setProfileTitle(e.target.value)}
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }}
                  />
                </div>
              </div>

              {/* ============ ROLE AKTIF (sesi login per role) ============ */}
              <div style={{ padding: '16px', background: 'var(--ez-color-surface-faint)', borderRadius: '16px', border: '1px solid var(--ez-color-border-soft)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <ShieldCheck size={16} color="var(--ez-hue-violet-text)" />
                  <span style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--ez-color-text-primary)' }}>{t('settings.role_aktif')}</span>
                </div>
                {activeRole ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>{activeRole.name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)' }}>{activeRole.title} · {t('auth.mode_demo')}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        // R2: keluar lewat alur terpusat yang sama dengan
                        // TopBar (role + Supabase + cookie gerbang +
                        // kunci transien), lalu keluar workspace.
                        // Sebelum R2 tombol ini hanya logoutRole.
                        void (async () => {
                          const result = await logoutAll({
                            logoutRole,
                            hasSupabaseSession: !!supabaseSession,
                            signOutSupabase: signOutAuth,
                          });
                          if (!result.allAttemptedOk) {
                            console.warn('[logout] partial failure:', result.errors);
                          }
                          if (onLogout) {
                            onLogout();
                          } else {
                            navigateTo('/');
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }
                        })();
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        height: '34px', padding: '0 14px', borderRadius: '10px',
                        border: '1px solid var(--ez-hue-rose-border)', background: 'var(--ez-color-surface)', color: 'var(--ez-hue-rose-text)',
                        fontSize: '12.5px', fontWeight: 700, cursor: 'pointer',
                      }}
                    >
                      <LogOut size={14} />
                      {t('settings.keluar_role')}
                    </button>
                  </div>
                ) : (
                  <div style={{ fontSize: '12.5px', color: 'var(--ez-color-text-muted)' }}>{t('settings.tidak_ada_role')}</div>
                )}
              </div>

              {/* ============ INFORMASI SISTEM ============ */}
              <div style={{ padding: '16px', background: 'var(--ez-color-surface-secondary)', borderRadius: '16px', border: '1px solid #EEF1F6' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <Info size={16} color="var(--ez-hue-blue-text)" />
                  <span style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--ez-color-text-primary)' }}>{t('settings.sistem_judul')}</span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', margin: '0 0 10px' }}>{t('settings.sistem_desc')}</p>
                <div className="ezrab-set-grid3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  <div style={{ background: 'var(--ez-color-surface)', border: '1px solid #EEF1F6', borderRadius: '10px', padding: '10px 12px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)', fontWeight: 600 }}>{t('settings.versi_aplikasi')}</div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ez-color-text-primary)', marginTop: '2px' }}>v{APP_VERSION}</div>
                  </div>
                  <div style={{ background: 'var(--ez-color-surface)', border: '1px solid #EEF1F6', borderRadius: '10px', padding: '10px 12px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)', fontWeight: 600 }}>{t('settings.versi_build')}</div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ez-color-text-primary)', marginTop: '2px' }}>{APP_BUILD}</div>
                  </div>
                  <div style={{ background: 'var(--ez-color-surface)', border: '1px solid #EEF1F6', borderRadius: '10px', padding: '10px 12px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)', fontWeight: 600 }}>{t('common.bahasa')}</div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ez-color-text-primary)', marginTop: '2px' }}>
                      {LANG_OPTIONS.find((o) => o.id === lang)?.nativeName ?? 'Indonesia'}
                    </div>
                  </div>
                </div>
              </div>

              {/* ============ ULANGI TUTORIAL ============ */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '16px', background: 'var(--ez-hue-blue-bg)', borderRadius: '16px', border: '1px solid var(--ez-hue-blue-border)', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--ez-color-text-primary)' }}>{t('settings.ulangi_tutorial')}</div>
                  <div style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', marginTop: '2px' }}>{t('settings.ulangi_tutorial_desc')}</div>
                </div>
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent(ONBOARDING_OPEN_EVENT))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    height: '38px', padding: '0 18px', borderRadius: '9px',
                    background: 'var(--ez-color-primary)', color: '#FFFFFF', border: 'none',
                    fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(37,99,235,0.25)',
                  }}
                >
                  <Play size={15} />
                  {t('settings.ulangi_tutorial')}
                </button>
              </div>
              {/* Umum */}
              <div style={{ borderTop: '1px solid var(--ez-color-surface-tertiary)', paddingTop: '16px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ez-color-text-body)', display: 'block', marginBottom: '12px' }}>
                  {t('settings.umum_label')}
                </label>
                <div className="ezrab-set-grid2" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.pilih_bahasa')}</label>
                    <select
                      value={lang}
                      onChange={(e) => {
                        const nextLang = e.target.value as Lang;
                        setLang(nextLang);
                        // t() di sini masih closure dari render lama (bahasa sebelum switch),
                        // jadi ambil string toast langsung dari kamus bahasa baru.
                        setToastMessage(dictionaries[nextLang].settings.tersimpan ?? t('settings.tersimpan'));
                        setSavedToast(true);
                      }}
                      style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 10px', marginTop: '6px', background: 'var(--ez-color-surface)' }}
                    >
                      {LANG_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.nativeName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.format_tanggal')}</label>
                    <select
                      value={dateFormat}
                      onChange={(e) => setDateFormat(e.target.value)}
                      style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 10px', marginTop: '6px', background: 'var(--ez-color-surface)' }}
                    >
                      <option value="DD/MM/YYYY">{t('settings.format_tanggal_contoh')}</option>
                      <option value="YYYY-MM-DD">{t('settings.format_tanggal_iso')}</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.mata_uang_tampil')}</label>
                    <select
                      value={displayCurrency}
                      onChange={(e) => setDisplayCurrency(e.target.value as typeof displayCurrency)}
                      style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 10px', marginTop: '6px', background: 'var(--ez-color-surface)' }}
                    >
                      {SUPPORTED_CURRENCIES.map((code) => {
                        const def = CURRENCY_DEFINITIONS[code];
                        return (
                          <option key={code} value={code}>
                            {def.name} ({def.code} - {def.symbol})
                          </option>
                        );
                      })}
                    </select>
                    <div style={{ fontSize: '11.5px', color: 'var(--ez-color-text-muted)', marginTop: '6px' }}>
                      {t('settings.mata_uang_note')}
                    </div>
                    {displayCurrency !== 'IDR' && (() => {
                      const code = displayCurrency as ForeignCurrencyCode;
                      const rate = rates[code];
                      const evaluation = evaluateRate(rate);
                      return (
                        <div style={{ marginTop: '12px', border: '1px solid var(--ez-color-border-strong)', borderRadius: '12px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>
                            {t('settings.kurs_label')} {code}: {rate ? formatRateLine(code, rate.idrPerUnit) : '—'}
                          </div>
                          <div style={{ fontSize: '11.5px', color: 'var(--ez-color-text-muted)' }}>
                            {t('settings.kurs_sumber')} {rate ? `${rate.source}${rate.manual ? t('settings.kurs_manual_flag') : ''}` : '—'} · {t('settings.kurs_diperbarui')} {rate ? formatRateTimestamp(rate.retrievedAtMs) : '—'}
                          </div>
                          <div style={{ fontSize: '11.5px', color: 'var(--ez-color-text-muted)' }}>
                            {t('settings.kurs_status_label')} {evaluation.state === 'available' ? t('settings.kurs_terkini') : evaluation.state === 'stale' ? t('settings.kurs_lama') : evaluation.state === 'expired' ? t('settings.kurs_kedaluwarsa') : evaluation.state === 'invalid' ? t('settings.kurs_tidak_valid') : t('settings.kurs_belum_tersedia')}
                          </div>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              disabled={rateRefreshing}
                              onClick={async () => {
                                setRateRefreshing(true);
                                setRateError(null);
                                const result = await refreshRates();
                                setRateRefreshing(false);
                                if (result.ok) {
                                  setToastMessage(t('settings.toast_kurs_ok'));
                                  setSavedToast(true);
                                } else {
                                  setRateError(result.error || t('settings.toast_kurs_gagal'));
                                }
                              }}
                              style={{ height: '32px', padding: '0 12px', borderRadius: '8px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '12px', fontWeight: 600, cursor: rateRefreshing ? 'wait' : 'pointer' }}
                            >
                              {rateRefreshing ? t('settings.kurs_memperbarui') : t('settings.kurs_perbarui')}
                            </button>
                            {rate?.manual && (
                              <button
                                type="button"
                                onClick={() => {
                                  clearManualRate(code);
                                  setToastMessage(t('settings.toast_kurs_hapus'));
                                  setSavedToast(true);
                                }}
                                style={{ height: '32px', padding: '0 12px', borderRadius: '8px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                              >
                                {t('settings.kurs_hapus_manual')}
                              </button>
                            )}
                          </div>
                          {rateError && (
                            <div style={{ fontSize: '11.5px', color: '#DC2626' }}>{rateError}</div>
                          )}
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={manualRateInput}
                              onChange={(e) => setManualRateInput(e.target.value)}
                              placeholder={`${t('settings.kurs_manual_ph_a')}${code}${t('settings.kurs_manual_ph_b')}`}
                              style={{ flex: '1 1 160px', height: '32px', borderRadius: '8px', border: '1px solid var(--ez-color-border-strong)', color: 'var(--ez-color-text-primary)', fontSize: '12px', padding: '0 10px', background: 'var(--ez-color-surface)' }}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const parsed = parseFloat(manualRateInput);
                                const result = setManualRate(code, parsed);
                                if (!result.ok) {
                                  setManualRateError(result.error || t('settings.kurs_manual_tidak_valid'));
                                  return;
                                }
                                setManualRateError(null);
                                setManualRateInput('');
                                setToastMessage(`Kurs manual ${code} disimpan (${formatCurrency(parsed, 'IDR')} per 1 ${code}).`);
                                setSavedToast(true);
                              }}
                              style={{ height: '32px', padding: '0 12px', borderRadius: '8px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                            >
                              {t('settings.kurs_simpan_manual')}
                            </button>
                          </div>
                          {manualRateError && (
                            <div style={{ fontSize: '11.5px', color: '#DC2626' }}>{manualRateError}</div>
                          )}
                          <div style={{ fontSize: '11.5px', color: 'var(--ez-color-text-muted)' }}>
                            {t('settings.kurs_disclaimer')}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>

          )}

          {/* ===================================================================
              GLOBAL SCOPE: 1. AKUN (NOTIFIKASI)
             =================================================================== */}
          {activeTab === 'notifications' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: '0 0 4px' }}>
                  {t('settings.notif_judul')}
                </h3>
                <p style={{ fontSize: '12.5px', color: 'var(--ez-color-text-muted)', margin: 0 }}>
                  {t('settings.notif_desc')}
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div
                  style={{
                    padding: '14px 16px',
                    borderRadius: '10px',
                    background: 'var(--ez-color-surface-secondary)',
                    border: '1px solid #EEF1F6',
                  }}
                >
                  <BrowserNotifyControl />
                  <div style={{ fontSize: '11.5px', color: 'var(--ez-color-text-muted)', marginTop: '4px' }}>
                    {t('settings.notif_browser_desc')}
                  </div>
                </div>
                {[
                  { label: t('settings.notif_status_judul'), desc: t('settings.notif_status_desc'), checked: notifProject, setChecked: setNotifProject },
                  { label: t('settings.notif_rab_judul'), desc: t('settings.notif_rab_desc'), checked: notifRab, setChecked: setNotifRab },
                  { label: t('settings.notif_ded_judul'), desc: t('settings.notif_ded_desc'), checked: notifDed, setChecked: setNotifDed },
                  { label: t('settings.notif_qto_judul'), desc: t('settings.notif_qto_desc'), checked: notifQto, setChecked: setNotifQto },
                  { label: t('settings.notif_sistem_judul'), desc: t('settings.notif_sistem_desc'), checked: notifSystem, setChecked: setNotifSystem },
                  { label: t('settings.notif_keamanan_judul'), desc: t('settings.notif_keamanan_desc'), checked: notifSecurity, setChecked: setNotifSecurity },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      padding: '14px 16px',
                      borderRadius: '10px',
                      background: 'var(--ez-color-surface-secondary)',
                      border: '1px solid #EEF1F6',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>{item.label}</div>
                      <div style={{ fontSize: '11.5px', color: 'var(--ez-color-text-muted)', marginTop: '2px' }}>{item.desc}</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={(e) => item.setChecked(e.target.checked)}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ===================================================================
              GLOBAL SCOPE: 1. AKUN (KEAMANAN)
             =================================================================== */}
          {activeTab === 'security' && isTabAllowed('security') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: '0 0 4px' }}>
                  {t('settings.keamanan_judul')}
                </h3>
                <p style={{ fontSize: '12.5px', color: 'var(--ez-color-text-muted)', margin: 0 }}>
                  {t('settings.keamanan_desc')}
                </p>
              </div>

              <div style={{ maxWidth: '480px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.keamanan_saat_ini')}</label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••"
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.keamanan_baru')}</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={t('settings.keamanan_min8')}
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.keamanan_konfirmasi')}</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t('settings.keamanan_ulang')}
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }}
                  />
                </div>

                <div style={{ padding: '12px 14px', background: 'var(--ez-hue-blue-bg)', borderRadius: '16px', border: '1px solid var(--ez-hue-blue-bg-deep)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <ShieldCheck size={18} color="var(--ez-hue-blue-text)" />
                  <span style={{ fontSize: '12px', color: 'var(--ez-hue-blue-text-deep)', fontWeight: 500 }}>
                    {t('settings.keamanan_2fa')}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================
              GLOBAL SCOPE: 2. WORKSPACE (PERUSAHAAN)
             =================================================================== */}
          {activeTab === 'company' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: '0 0 4px' }}>
                  {t('settings.perusahaan_judul')}
                </h3>
                <p style={{ fontSize: '12.5px', color: 'var(--ez-color-text-muted)', margin: 0 }}>
                  {t('settings.perusahaan_desc')}
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.perusahaan_nama')}</label>
                  <input
                    type="text"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.perusahaan_npwp')}</label>
                  <input
                    type="text"
                    value={companyNpwp}
                    onChange={(e) => setCompanyNpwp(e.target.value)}
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.perusahaan_direktur')}</label>
                  <input
                    type="text"
                    value={companyDirector}
                    onChange={(e) => setCompanyDirector(e.target.value)}
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.perusahaan_lead')}</label>
                  <input
                    type="text"
                    value={companyLeadEstimator}
                    onChange={(e) => setCompanyLeadEstimator(e.target.value)}
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.perusahaan_telp')}</label>
                  <input
                    type="text"
                    value={companyPhone}
                    onChange={(e) => setCompanyPhone(e.target.value)}
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.perusahaan_email')}</label>
                  <input
                    type="email"
                    value={companyEmail}
                    onChange={(e) => setCompanyEmail(e.target.value)}
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }}
                  />
                </div>

                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.perusahaan_alamat')}</label>
                  <textarea
                    rows={2}
                    value={companyAddress}
                    onChange={(e) => setCompanyAddress(e.target.value)}
                    style={{ width: '100%', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '8px 12px', marginTop: '6px', fontFamily: 'inherit' }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================
              GLOBAL SCOPE: 2. WORKSPACE (TIM & ANGGOTA)
             =================================================================== */}
          {activeTab === 'users' && isTabAllowed('users') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: '0 0 4px' }}>
                    {t('settings.tim_judul')}
                  </h3>
                  <p style={{ fontSize: '12.5px', color: 'var(--ez-color-text-muted)', margin: 0 }}>
                    {t('settings.tim_desc')}
                  </p>
                </div>

                <button
                  onClick={() => setAddUserModalOpen(true)}
                  style={{
                    height: '36px',
                    padding: '0 16px',
                    borderRadius: '10px',
                    background: 'var(--ez-color-primary)',
                    color: '#FFFFFF',
                    border: 'none',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 6px rgba(37,99,235,0.2)',
                  }}
                >
                  <Plus size={15} />
                  <span>{t('settings.tim_tambah')}</span>
                </button>
              </div>

              {/* User Table */}
              <div style={{ border: '1px solid #EEF1F6', borderRadius: '16px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12.5px' }}>
                  <thead>
                    <tr style={{ background: 'var(--ez-color-surface-secondary)', borderBottom: '1px solid var(--ez-color-border-line)', color: 'var(--ez-color-text-slate)', fontWeight: 700 }}>
                      <th style={{ padding: '12px 16px' }}>{t('settings.tim_th_nama')}</th>
                      <th style={{ padding: '12px 16px' }}>{t('settings.tim_th_email')}</th>
                      <th style={{ padding: '12px 16px' }}>{t('settings.tim_th_role')}</th>
                      <th style={{ padding: '12px 16px' }}>{t('settings.tim_th_status')}</th>
                      <th style={{ padding: '12px 16px' }}>{t('settings.tim_th_perusahaan')}</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right' }}>{t('settings.tim_th_aksi')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersList.map((user, idx) => (
                      <tr
                        key={user.id}
                        style={{
                          borderBottom: idx < usersList.length - 1 ? '1px solid var(--ez-color-surface-tertiary)' : 'none',
                          background: 'var(--ez-color-surface)',
                        }}
                      >
                        <td style={{ padding: '12px 16px', fontWeight: 650, color: 'var(--ez-color-text-primary)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div
                              style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                background: 'var(--ez-hue-blue-bg)',
                                color: 'var(--ez-color-primary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                fontSize: '11px',
                              }}
                            >
                              {user.name.charAt(0)}
                            </div>
                            <div>
                              <div>{user.name}</div>
                              <div style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)', fontWeight: 400 }}>{user.title || '-'}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--ez-color-text-slate)' }}>{user.email}</td>
                        <td style={{ padding: '12px 16px' }}>{renderRoleBadge(user.role)}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '2px 7px',
                              borderRadius: 'var(--ez-radius-pill)',
                              background: user.status === 'ACTIVE' ? 'var(--ez-hue-green-bg)' : 'var(--ez-hue-amber-bg)',
                              color: user.status === 'ACTIVE' ? 'var(--ez-hue-green-text-deep)' : 'var(--ez-hue-amber-text)',
                            }}
                          >
                            {user.status === 'ACTIVE' ? t('settings.tim_status_aktif') : t('settings.tim_status_diundang')}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--ez-color-text-muted)' }}>{user.company || t('settings.tim_perusahaan_internal')}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <button
                            onClick={() => alert(`${t('settings.tim_detail_a')}${user.name}${t('settings.tim_detail_b')}${user.role}${t('settings.tim_detail_c')}`)}
                            style={{
                              padding: '4px 10px',
                              borderRadius: '10px',
                              border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-body)',
                              fontSize: '11.5px',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            {t('settings.tim_lihat')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Secure Invitation (Fase E): panel undangan backend — aditif,
                  tidak mengubah daftar anggota demo di atas. */}
              <TeamInvitationsPanel
                workspaceId={currentUser.workspaceId || 'ws-default'}
                workspaceName={currentUser.company || 'PT Sinergi Konstruksi Nusantara'}
              />
            </div>
          )}

          {/* ===================================================================
              GLOBAL SCOPE: 2. WORKSPACE (ROLE & HAK AKSES)
             =================================================================== */}
          {activeTab === 'roles' && isTabAllowed('roles') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: '0 0 4px' }}>
                  {t('settings.roles_judul')}
                </h3>
                <p style={{ fontSize: '12.5px', color: 'var(--ez-color-text-muted)', margin: 0 }}>
                  {t('settings.roles_desc')}
                </p>
              </div>

              <div style={{ border: '1px solid #EEF1F6', borderRadius: '16px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: 'var(--ez-color-surface-secondary)', borderBottom: '1px solid var(--ez-color-border-line)', color: 'var(--ez-color-text-slate)', fontWeight: 700 }}>
                      <th style={{ padding: '12px 16px' }}>{t('settings.roles_th_wewenang')}</th>
                      <th style={{ padding: '12px 14px', textAlign: 'center' }}>{t('settings.role_super_admin')}</th>
                      <th style={{ padding: '12px 14px', textAlign: 'center' }}>{t('settings.role_estimator')}</th>
                      <th style={{ padding: '12px 14px', textAlign: 'center' }}>{t('settings.role_direksi')}</th>
                      <th style={{ padding: '12px 14px', textAlign: 'center' }}>{t('settings.role_client_owner')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { feat: t('settings.roles_feat_rab'), sa: true, est: true, dir: false, cli: false },
                      { feat: t('settings.roles_feat_override'), sa: true, est: true, dir: false, cli: false },
                      { feat: t('settings.roles_feat_markup'), sa: true, est: false, dir: true, cli: false },
                      { feat: t('settings.roles_feat_approve'), sa: true, est: false, dir: true, cli: true },
                      { feat: t('settings.roles_feat_master'), sa: true, est: true, dir: false, cli: false },
                      { feat: t('settings.roles_feat_anggota'), sa: true, est: false, dir: false, cli: false },
                    ].map((row, idx) => (
                      <tr key={row.feat} style={{ borderBottom: idx < 5 ? '1px solid var(--ez-color-surface-tertiary)' : 'none', background: 'var(--ez-color-surface)' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--ez-color-text-primary)' }}>{row.feat}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>{row.sa ? <Check size={16} color="var(--ez-hue-green-text)" style={{ margin: '0 auto' }} /> : <X size={16} color="#94A3B8" style={{ margin: '0 auto' }} />}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>{row.est ? <Check size={16} color="var(--ez-hue-green-text)" style={{ margin: '0 auto' }} /> : <X size={16} color="#94A3B8" style={{ margin: '0 auto' }} />}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>{row.dir ? <Check size={16} color="var(--ez-hue-green-text)" style={{ margin: '0 auto' }} /> : <X size={16} color="#94A3B8" style={{ margin: '0 auto' }} />}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>{row.cli ? <Check size={16} color="var(--ez-hue-green-text)" style={{ margin: '0 auto' }} /> : <X size={16} color="#94A3B8" style={{ margin: '0 auto' }} />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===================================================================
              GLOBAL SCOPE: 2. WORKSPACE (PAKET & BILLING)
             =================================================================== */}
          {activeTab === 'subscription' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: '0 0 4px' }}>
                  {t('settings.paket_judul')}
                </h3>
                <p style={{ fontSize: '12.5px', color: 'var(--ez-color-text-muted)', margin: 0 }}>
                  {t('settings.paket_desc')}
                </p>
              </div>

              <div style={{ padding: '20px', borderRadius: '14px', background: 'linear-gradient(135deg, var(--ez-hue-blue-bg) 0%, var(--ez-hue-blue-bg-deep) 100%)', border: '1px solid var(--ez-hue-blue-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ez-color-primary-hover)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {t('settings.paket_saat_ini')}
                    </span>
                    <h2 style={{ fontSize: '20px', fontWeight: 900, color: 'var(--ez-color-text-primary)', margin: '4px 0 0' }}>
                      {simulatedPlanDef.displayName}
                    </h2>
                    <p style={{ fontSize: '12.5px', color: 'var(--ez-color-text-body)', margin: '4px 0 0' }}>
                      {simulatedPlanFacts}
                    </p>
                    <p style={{ fontSize: '12.5px', color: 'var(--ez-color-text-body)', margin: '4px 0 0' }}>
                      {t('settings.paket_saldo_a')}{creditBalance.total.toLocaleString('id-ID')}{t('settings.paket_saldo_b')}
                    </p>
                  </div>
                  <div style={{ padding: '8px 16px', background: 'var(--ez-color-surface-tertiary)', color: 'var(--ez-color-text-body)', border: '1px solid var(--ez-color-border-strong)', borderRadius: '10px', fontSize: '12.5px', fontWeight: 700 }}>
                    {t('settings.paket_mode_simulasi')}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================
              GLOBAL SCOPE: 3. MASTER DATA
             =================================================================== */}
          {activeTab === 'master-data' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: '0 0 4px' }}>
                  {t('settings.master_judul')}
                </h3>
                <p style={{ fontSize: '12.5px', color: 'var(--ez-color-text-muted)', margin: 0 }}>
                  {t('settings.master_desc')}
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.master_regulasi')}</label>
                  <select
                    value={defaultAhspSource}
                    onChange={(e) => setDefaultAhspSource(e.target.value)}
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 10px', marginTop: '6px', background: 'var(--ez-color-surface)' }}
                  >
                    <option value="pupr-2026">{t('settings.master_reg_2026')}</option>
                    <option value="pupr-2022">{t('settings.master_reg_2022')}</option>
                    <option value="sni-2020">{t('settings.master_reg_sni')}</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.master_wilayah')}</label>
                  <select
                    value={defaultRegion}
                    onChange={(e) => setDefaultRegion(e.target.value)}
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 10px', marginTop: '6px', background: 'var(--ez-color-surface)' }}
                  >
                    <option value="DKI Jakarta (Indeks 1.00)">{t('settings.master_wilayah_dki')}</option>
                    <option value="Jawa Barat / Bandung (Indeks 0.95)">{t('settings.master_wilayah_jabar')}</option>
                    <option value="Jawa Timur / Surabaya (Indeks 0.94)">{t('settings.master_wilayah_jatim')}</option>
                    <option value="Kalimantan Timur / IKN (Indeks 1.25)">{t('settings.master_wilayah_kaltim')}</option>
                  </select>
                </div>
              </div>

              {/* Direct links to master tables */}
              <div style={{ marginTop: '10px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ez-color-text-slate)', display: 'block', marginBottom: '8px' }}>
                  {t('settings.master_akses_cepat')}
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                  {[
                    { label: `${t('settings.master_db_material_a')}${liveMaterialCount.toLocaleString('id-ID')}${t('settings.master_db_material_b')}`, icon: Package, tab: 'database-material' },
                    { label: t('settings.master_db_ahsp'), icon: Database, tab: 'ahsp-2026' },
                    { label: t('settings.master_db_upah'), icon: HardHat, tab: 'database-upah' },
                    { label: t('settings.master_db_alat'), icon: Truck, tab: 'database-alat' },
                  ].map((card) => {
                    const Icon = card.icon;
                    return (
                      <button
                        key={card.label}
                        onClick={() => onNavigateTab?.(card.tab)}
                        style={{
                          padding: '12px',
                          borderRadius: '10px',
                          border: '1px solid #EEF1F6',
                          background: 'var(--ez-color-surface-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--ez-hue-blue-bg)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--ez-color-surface-secondary)')}
                      >
                        <Icon size={18} color="var(--ez-hue-blue-text)" />
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>{card.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================
              GLOBAL SCOPE: 4. ESTIMATOR DEFAULTS
             =================================================================== */}
          {activeTab === 'estimator' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: '0 0 4px' }}>
                  {t('settings.estimator_judul')}
                </h3>
                {/* D-77: nilai-nilai ini HANYA acuan — terverifikasi tidak
                    disimpan dan tidak dibaca jalur mana pun (proyek baru
                    selalu 0%/0% per keputusan owner 2026-11-08; tiap proyek
                    memakai pengaturannya sendiri di tab Proyek). Label lama
                    "saat membuat proyek baru" menyiratkan nilai ini menjadi
                    default proyek baru, padahal tidak pernah diterapkan. */}
                <p style={{ fontSize: '12.5px', color: 'var(--ez-color-text-muted)', margin: 0 }}>
                  {t('settings.estimator_desc')}
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.estimator_overhead')}</label>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    step={0.5}
                    value={defaultOverhead}
                    onChange={(e) => setDefaultOverhead(Number(e.target.value))}
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }}
                  />
                  <span style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px', display: 'block' }}>{t('settings.estimator_overhead_hint')}</span>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.estimator_profit')}</label>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    step={0.5}
                    value={defaultProfit}
                    onChange={(e) => setDefaultProfit(Number(e.target.value))}
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }}
                  />
                  <span style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px', display: 'block' }}>{t('settings.estimator_profit_hint')}</span>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.estimator_ppn')}</label>
                  <input
                    type="number"
                    min={0}
                    max={25}
                    value={defaultPpn}
                    onChange={(e) => setDefaultPpn(Number(e.target.value))}
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }}
                  />
                  <span style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px', display: 'block' }}>{t('settings.estimator_ppn_hint')}</span>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.estimator_rounding')}</label>
                  <select
                    value={defaultRounding}
                    onChange={(e) => setDefaultRounding(e.target.value)}
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 10px', marginTop: '6px', background: 'var(--ez-color-surface)' }}
                  >
                    <option value="RIBUAN">{t('settings.rounding_ribuan')}</option>
                    <option value="RATUSAN">{t('settings.rounding_ratusan')}</option>
                    <option value="EXACT">{t('settings.rounding_exact')}</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================
              GLOBAL SCOPE: 5. DED & VOLUME
             =================================================================== */}
          {activeTab === 'ded-volume' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: '0 0 4px' }}>
                  {t('settings.ded_judul')}
                </h3>
                <p style={{ fontSize: '12.5px', color: 'var(--ez-color-text-muted)', margin: 0 }}>
                  {t('settings.ded_desc')}
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.ded_waste')}</label>
                  <input
                    type="number"
                    value={defaultWaste}
                    onChange={(e) => setDefaultWaste(Number(e.target.value))}
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }}
                  />
                  <span style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px', display: 'block' }}>{t('settings.ded_waste_hint')}</span>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.ded_presisi')}</label>
                  <select
                    value={2}
                    disabled
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 10px', marginTop: '6px', background: 'var(--ez-color-surface-secondary)' }}
                  >
                    <option value={2}>{t('settings.ded_presisi_opt')}</option>
                  </select>
                  {/* D-81 (Batch G2): jelaskan MENGAPA kontrol ini
                      nonaktif — tanpa penjelasan, select yang tampak
                      normal ini terlihat rusak. Gaya nonaktif berasal
                      dari aturan :disabled global (G1 D-11); select
                      ini tidak menimpa opacity-nya. Presisi per proyek
                      diatur di tab "DED & Waste Factor Proyek". */}
                  <span style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px', display: 'block' }}>
                    {t('settings.ded_presisi_note')}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================
              GLOBAL SCOPE: 6. DOKUMEN & EKSPOR
             =================================================================== */}
          {activeTab === 'documents' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: '0 0 4px' }}>
                  {t('settings.dokumen_judul')}
                </h3>
                <p style={{ fontSize: '12.5px', color: 'var(--ez-color-text-muted)', margin: 0 }}>
                  {t('settings.dokumen_desc')}
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.dokumen_kertas')}</label>
                  <select
                    value={pdfPaperSize}
                    onChange={(e) => setPdfPaperSize(e.target.value)}
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 10px', marginTop: '6px', background: 'var(--ez-color-surface)' }}
                  >
                    <option value="A4">{t('settings.dokumen_kertas_a4')}</option>
                    <option value="F4">{t('settings.dokumen_kertas_f4')}</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.dokumen_orientasi')}</label>
                  <select
                    value={pdfOrientation}
                    onChange={(e) => setPdfOrientation(e.target.value)}
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 10px', marginTop: '6px', background: 'var(--ez-color-surface)' }}
                  >
                    <option value="landscape">{t('settings.dokumen_orientasi_landscape')}</option>
                    <option value="portrait">{t('settings.dokumen_orientasi_portrait')}</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.dokumen_prefix')}</label>
                  <input
                    type="text"
                    value={docPrefix}
                    onChange={(e) => setDocPrefix(e.target.value)}
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }}
                  />
                  <span style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px', display: 'block' }}>{t('settings.dokumen_format_nomor')}{docPrefix}/PROYEK/2026</span>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================
              GLOBAL SCOPE: 7. SCHEDULE & PROGRESS
             =================================================================== */}
          {activeTab === 'schedule' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: '0 0 4px' }}>
                  {t('settings.jadwal_judul')}
                </h3>
                <p style={{ fontSize: '12.5px', color: 'var(--ez-color-text-muted)', margin: 0 }}>
                  {t('settings.jadwal_desc')}
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.jadwal_hari')}</label>
                  <select
                    value={defaultWorkingDays}
                    onChange={(e) => setDefaultWorkingDays(Number(e.target.value))}
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 10px', marginTop: '6px', background: 'var(--ez-color-surface)' }}
                  >
                    <option value={6}>{t('settings.jadwal_hari_6')}</option>
                    <option value={5}>{t('settings.jadwal_hari_5')}</option>
                    <option value={7}>{t('settings.jadwal_hari_7')}</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.jadwal_jam')}</label>
                  <input
                    type="number"
                    value={workingHoursPerDay}
                    onChange={(e) => setWorkingHoursPerDay(Number(e.target.value))}
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }}
                  />
                  <span style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px', display: 'block' }}>{t('settings.jadwal_jam_hint')}</span>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================
              GLOBAL SCOPE: 8. COST & BUDGET
             =================================================================== */}
          {activeTab === 'cost' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: '0 0 4px' }}>
                  {t('settings.cost_judul')}
                </h3>
                <p style={{ fontSize: '12.5px', color: 'var(--ez-color-text-muted)', margin: 0 }}>
                  {t('settings.cost_desc')}
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.cost_skema')}</label>
                  <select
                    value={costCodeFormat}
                    onChange={(e) => setCostCodeFormat(e.target.value)}
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 10px', marginTop: '6px', background: 'var(--ez-color-surface)' }}
                  >
                    <option value="WBS_STANDARD">{t('settings.cost_wbs')}</option>
                    <option value="CSI_MASTERFORMAT">{t('settings.cost_csi')}</option>
                    <option value="PU_CODE">{t('settings.cost_pu')}</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================
              GLOBAL SCOPE: 9. INTEGRASI
             =================================================================== */}
          {activeTab === 'integrations' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: '0 0 4px' }}>
                  {t('settings.integrasi_judul')}
                </h3>
                <p style={{ fontSize: '12.5px', color: 'var(--ez-color-text-muted)', margin: 0 }}>
                  {t('settings.integrasi_desc')}
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* 1. Live Spreadsheet Sync */}
                <div style={{ padding: '16px', borderRadius: '16px', background: 'var(--ez-color-surface-secondary)', border: '1px solid #EEF1F6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <FileSpreadsheet size={24} color="var(--ez-hue-green-text)" />
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>{t('settings.integrasi_sync_judul')}</div>
                      <div style={{ fontSize: '11.5px', color: 'var(--ez-color-text-muted)' }}>{t('settings.integrasi_sync_desc')}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ez-hue-green-text)', background: 'var(--ez-pastel-mint)', padding: '3px 10px', borderRadius: 'var(--ez-radius-pill)' }}>
                    {t('settings.integrasi_tersambung')}
                  </span>
                </div>

                {/* 2. EZRAB AI Engine Audit & Status */}
                <div style={{ padding: '20px', borderRadius: '14px', background: 'var(--ez-color-surface)', border: '1.5px solid var(--ez-hue-blue-bg-deep)', boxShadow: '0 2px 8px rgba(37,99,235,0.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'var(--ez-hue-blue-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ez-color-primary)', border: '1px solid var(--ez-hue-blue-border)' }}>
                        <Bot size={22} />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '14.5px', fontWeight: 800, color: 'var(--ez-color-text-primary)' }}>{t('settings.ai_audit_judul')}</span>
                          {/* D-82 (Batch G2): warna badge mengikuti HASIL
                              AUDIT — bukan hijau permanen. Sebelum audit,
                              badge netral abu-abu + tanpa ikon centang
                              (centang hijau di samping "Belum diperiksa"
                              mengklaim sukses yang belum teruji). */}
                          <span style={{
                            fontSize: '11px', fontWeight: 750,
                            color: aiAuditResult == null ? 'var(--ez-color-text-muted)' : aiAuditResult.connected ? 'var(--ez-hue-green-text)' : 'var(--ez-color-danger-strong)',
                            background: aiAuditResult == null ? 'var(--ez-color-surface-tertiary)' : aiAuditResult.connected ? 'var(--ez-hue-green-bg-deep)' : 'var(--ez-hue-red-bg)',
                            border: `1px solid ${aiAuditResult == null ? 'var(--ez-color-border-line)' : aiAuditResult.connected ? '#86EFAC' : 'var(--ez-color-danger)'}`,
                            padding: '2px 8px', borderRadius: 'var(--ez-radius-pill)', display: 'inline-flex', alignItems: 'center', gap: '4px',
                          }}>
                            {aiAuditResult?.connected ? <CheckCircle2 size={12} /> : null}
                            {aiAuditResult == null ? t('settings.ai_audit_belum') : aiAuditResult.connected ? t('settings.ai_audit_ok') : t('settings.ai_audit_gagal')}
                          </span>
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', marginTop: '2px' }}>
                          {t('settings.ai_audit_desc')}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleRunAiAudit}
                      disabled={isAuditingAi}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 16px',
                        borderRadius: '10px',
                        background: 'var(--ez-color-primary)',
                        color: '#FFFFFF',
                        border: 'none',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: isAuditingAi ? 'not-allowed' : 'pointer',
                        opacity: isAuditingAi ? 0.7 : 1,
                        boxShadow: '0 2px 6px rgba(37,99,235,0.25)',
                      }}
                    >
                      <RefreshCw size={13} className={isAuditingAi ? 'animate-spin' : ''} />
                      <span>{isAuditingAi ? t('settings.ai_audit_menguji') : t('settings.ai_audit_uji')}</span>
                    </button>
                  </div>

                  {/* Audit Metrics Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginTop: '14px', marginBottom: '16px' }}>
                    <div style={{ padding: '12px', borderRadius: '10px', background: 'var(--ez-color-surface-secondary)', border: '1px solid #EEF1F6' }}>
                      <div style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)', fontWeight: 600 }}>{t('settings.ai_metric_cluster')}</div>
                      {/* D-82 (Batch G2): status mengikuti hasil audit —
                          "Aktif & Siap Operasi" hardcode mengklaim sukses
                          sebelum audit apa pun dijalankan. */}
                      <div style={{ fontSize: '14px', fontWeight: 800, color: aiAuditResult == null ? 'var(--ez-color-text-muted)' : aiAuditResult.connected ? 'var(--ez-hue-green-text)' : 'var(--ez-color-danger-strong)', marginTop: '4px' }}>
                        {aiAuditResult == null ? t('settings.ai_audit_belum') : aiAuditResult.connected ? t('settings.ai_metric_aktif') : t('settings.ai_metric_tidak')}
                      </div>
                      <div style={{ fontSize: '10.5px', color: '#94A3B8', marginTop: '2px' }}>Server Isolation Guard</div>
                    </div>

                    <div style={{ padding: '12px', borderRadius: '10px', background: 'var(--ez-color-surface-secondary)', border: '1px solid #EEF1F6' }}>
                      <div style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)', fontWeight: 600 }}>{t('settings.ai_metric_quick')}</div>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ez-color-primary)', marginTop: '4px' }}>
                        EZRAB AI 1.3
                      </div>
                      <div style={{ fontSize: '10.5px', color: '#94A3B8', marginTop: '2px' }}>{t('settings.ai_metric_quick_desc')}</div>
                    </div>

                    <div style={{ padding: '12px', borderRadius: '10px', background: 'var(--ez-color-surface-secondary)', border: '1px solid #EEF1F6' }}>
                      <div style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)', fontWeight: 600 }}>{t('settings.ai_metric_pro')}</div>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ez-hue-violet-text)', marginTop: '4px' }}>
                        EZRAB AI Pro
                      </div>
                      <div style={{ fontSize: '10.5px', color: '#94A3B8', marginTop: '2px' }}>{t('settings.ai_metric_pro_desc')}</div>
                    </div>

                    <div style={{ padding: '12px', borderRadius: '10px', background: 'var(--ez-color-surface-secondary)', border: '1px solid #EEF1F6' }}>
                      <div style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)', fontWeight: 600 }}>{t('settings.ai_metric_latensi')}</div>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ez-color-text-primary)', marginTop: '4px' }}>
                        {aiAuditResult?.latencyMs ? `${aiAuditResult.latencyMs} ms` : '—'}
                      </div>
                      {/* D-82 (Batch G2): tanpa pengukuran, tidak ada
                          klaim kecepatan. "Sangat Cepat & Stabil" hardcode
                          muncul bahkan saat latensi belum pernah diukur. */}
                      <div style={{ fontSize: '10.5px', color: aiAuditResult?.latencyMs ? 'var(--ez-hue-green-text)' : '#94A3B8', marginTop: '2px' }}>
                        {aiAuditResult?.latencyMs ? t('settings.ai_metric_terukur') : t('settings.ai_metric_belum_ukur')}
                      </div>
                    </div>
                  </div>

                  {/* Audit Rules & Compliance Checklist */}
                  <div style={{ padding: '14px', borderRadius: '10px', background: 'var(--ez-hue-green-bg)', border: '1px solid var(--ez-hue-green-border)' }}>
                    <div style={{ fontSize: '12px', fontWeight: 750, color: 'var(--ez-hue-green-text-deep)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ShieldCheck size={16} color="var(--ez-hue-green-text-bright)" />
                      <span>{t('settings.ai_audit_hasil')}</span>
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '11.5px', color: 'var(--ez-hue-green-text)', lineHeight: 1.6 }}>
                      <li><strong>{t('settings.ai_iso_label')}</strong> {t('settings.ai_iso_a')}<em>Server-Side Isolation Guard</em>{t('settings.ai_iso_b')}</li>
                      <li><strong>{t('settings.ai_abstraksi_label')}</strong> {t('settings.ai_abstraksi_a')}<em>EZRAB AI 1.3</em>{t('settings.ai_abstraksi_sep1')}<em>EZRAB AI Pro</em>{t('settings.ai_abstraksi_dan')}<em>EZRAB Vision</em>{t('settings.ai_abstraksi_end')}</li>
                      <li><strong>{t('settings.ai_multi_label')}</strong> {t('settings.ai_multi_body')}</li>
                      {/* D-82 (Batch G2): fallback lama MENGARANG sukses
                          ("Baru saja — Semua engine operasional.") saat
                          aiAuditResult null. Kini jujur: belum pernah
                          diaudit. */}
                      <li><strong>{t('settings.ai_terakhir_label')}</strong> {aiAuditResult == null
                        ? t('settings.ai_terakhir_belum')
                        : `${aiAuditResult.lastChecked ?? '—'} — ${aiAuditResult.message ?? '—'}`}</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================
              GLOBAL SCOPE: 10. SISTEM (AUDIT TRAIL & BACKUP)
             =================================================================== */}
          {activeTab === 'audit-log' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: '0 0 4px' }}>
                    {t('settings.audit_judul')}
                  </h3>
                  <p style={{ fontSize: '12.5px', color: 'var(--ez-color-text-muted)', margin: 0 }}>
                    {t('settings.audit_desc')}
                  </p>
                </div>

                <button
                  onClick={() => setAuditLogs(settingsAuditService.getLogs())}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '10px',
                    border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-body)',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <RefreshCw size={13} />
                  <span>{t('settings.audit_refresh')}</span>
                </button>
              </div>

              {/* Audit Log Table */}
              <div style={{ border: '1px solid #EEF1F6', borderRadius: '16px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: 'var(--ez-color-surface-secondary)', borderBottom: '1px solid var(--ez-color-border-line)', color: 'var(--ez-color-text-slate)', fontWeight: 700 }}>
                      <th style={{ padding: '10px 14px' }}>{t('settings.audit_th_waktu')}</th>
                      <th style={{ padding: '10px 14px' }}>{t('settings.audit_th_aktor')}</th>
                      <th style={{ padding: '10px 14px' }}>{t('settings.audit_th_scope')}</th>
                      <th style={{ padding: '10px 14px' }}>{t('settings.audit_th_kategori')}</th>
                      <th style={{ padding: '10px 14px' }}>{t('settings.audit_th_nilai')}</th>
                      <th style={{ padding: '10px 14px' }}>{t('settings.audit_th_alasan')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log) => (
                      <tr key={log.id} style={{ borderBottom: '1px solid var(--ez-color-surface-tertiary)', background: 'var(--ez-color-surface)' }}>
                        <td style={{ padding: '10px 14px', color: 'var(--ez-color-text-muted)', whiteSpace: 'nowrap' }}>
                          {new Date(log.timestamp).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 650, color: 'var(--ez-color-text-primary)' }}>
                          <div>{log.actor.name}</div>
                          <div style={{ fontSize: '10.5px', color: 'var(--ez-color-text-muted)' }}>{log.actor.role}</div>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 800,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: log.scope === 'PROJECT' ? 'var(--ez-hue-amber-bg-deep)' : 'var(--ez-hue-blue-bg)',
                              color: log.scope === 'PROJECT' ? 'var(--ez-hue-amber-text-dark)' : 'var(--ez-color-primary-hover)',
                            }}
                          >
                            {log.scope}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontWeight: 650, color: 'var(--ez-color-text-primary)' }}>{log.fieldLabel}</div>
                          <div style={{ fontSize: '10.5px', color: '#94A3B8' }}>{log.category}</div>
                        </td>
                        <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--ez-hue-green-text)' }}>
                          {typeof log.newValue === 'object' ? JSON.stringify(log.newValue) : String(log.newValue)}
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--ez-color-text-slate)', fontSize: '11.5px' }}>
                          {log.reason || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===================================================================
              GLOBAL SCOPE: 9b. SISTEM (CADANGAN & PULIHKAN) — P1-A (R-01)
              Satu-satunya titik masuk backup/restore di aplikasi. Ekspor
              mengunduh file JSON; impor memvalidasi + pratinjau dulu, lalu
              membuat backup pengaman otomatis sebelum menulis apa pun.
             =================================================================== */}
          {activeTab === 'backup' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: '0 0 4px' }}>
                  {t('settings.backup_judul')}
                </h3>
                <p style={{ fontSize: '12.5px', color: 'var(--ez-color-text-muted)', margin: 0 }}>
                  {t('settings.backup_desc')}
                </p>
              </div>

              {/* Pengingat ekspor (ringan, tidak memblokir, bisa ditutup) */}
              {backupReminder.needsReminder && !backupReminderDismissed ? (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '12px', padding: '12px 14px' }}>
                  <Clock size={16} color="#D97706" style={{ flexShrink: 0, marginTop: '1px' }} />
                  <div style={{ fontSize: '12.5px', color: '#92400E', lineHeight: 1.5 }}>
                    <strong>
                      {backupReminder.lastExportAt ? (
                        <>{t('settings.backup_reminder_terakhir_a')}{backupReminder.daysSinceExport}{t('settings.backup_reminder_terakhir_b')}</>
                      ) : (
                        t('settings.backup_reminder_belum')
                      )}
                    </strong>{' '}
                    {t('settings.backup_reminder_saran_a')}{BACKUP_REMINDER_DAYS}{t('settings.backup_reminder_saran_b')}
                  </div>
                  <button
                    onClick={() => setBackupReminderDismissed(true)}
                    aria-label={t('settings.backup_reminder_tutup_aria')}
                    style={{ marginLeft: 'auto', flexShrink: 0, border: 'none', background: 'transparent', color: '#92400E', fontSize: '12px', fontWeight: 700, cursor: 'pointer', padding: '2px 4px' }}
                  >
                    {t('common.tutup')}
                  </button>
                </div>
              ) : !backupReminder.needsReminder ? (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '12px', padding: '12px 14px' }}>
                  <CheckCircle2 size={16} color="#16A34A" style={{ flexShrink: 0, marginTop: '1px' }} />
                  <div style={{ fontSize: '12.5px', color: '#166534', lineHeight: 1.5 }}>
                    {t('settings.backup_terakhir_label')}
                    <strong>
                      {backupReminder.lastExportAt
                        ? new Date(backupReminder.lastExportAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
                        : '—'}
                    </strong>
                    {t('settings.backup_terakhir_b')}
                  </div>
                </div>
              ) : null}

              {/* Status ekspor / impor / restore */}
              {backupNotice && (
                <div
                  style={{
                    display: 'flex',
                    gap: '10px',
                    alignItems: 'flex-start',
                    background: backupNotice.kind === 'error' ? '#FEF2F2' : backupNotice.kind === 'success' ? '#F0FDF4' : '#EFF6FF',
                    border: `1px solid ${backupNotice.kind === 'error' ? '#FECACA' : backupNotice.kind === 'success' ? '#BBF7D0' : '#BFDBFE'}`,
                    borderRadius: '12px',
                    padding: '12px 14px',
                  }}
                >
                  {backupNotice.kind === 'error' ? (
                    <AlertCircle size={16} color="#DC2626" style={{ flexShrink: 0, marginTop: '1px' }} />
                  ) : backupNotice.kind === 'success' ? (
                    <CheckCircle2 size={16} color="#16A34A" style={{ flexShrink: 0, marginTop: '1px' }} />
                  ) : (
                    <Info size={16} color="#1D4ED8" style={{ flexShrink: 0, marginTop: '1px' }} />
                  )}
                  <div style={{ fontSize: '12.5px', color: backupNotice.kind === 'error' ? '#991B1B' : backupNotice.kind === 'success' ? '#166534' : '#1E40AF', lineHeight: 1.5, wordBreak: 'break-word' }}>
                    {backupNotice.text}
                  </div>
                </div>
              )}

              {/* Restore berhasil — aplikasi HARUS dimuat ulang */}
              {restoreDone && (
                <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '12px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <CheckCircle2 size={16} color="#16A34A" style={{ flexShrink: 0, marginTop: '1px' }} />
                    <div style={{ fontSize: '12.5px', color: '#166534', lineHeight: 1.5 }}>
                      <strong>{t('settings.backup_restore_ok')}</strong> {restoreDone.restoredKeys.length} {t('settings.backup_restore_ok_b')}
                      {restoreDone.skippedKeys.length > 0 && (
                        <span>
                          {' '}{t('settings.backup_restore_lewat_a')}
                          {restoreDone.skippedKeys.map((k) => BACKUP_DATASET_LABELS[k] || k).join(', ')}{t('settings.backup_restore_lewat_b')}
                        </span>
                      )}
                      {restoreDone.warnings.length > 0 && (
                          <span> {t('settings.backup_restore_catatan')}{restoreDone.warnings.join(' ')}</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <button
                      onClick={() => window.location.reload()}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '10px',
                        border: 'none',
                        background: '#16A34A',
                        color: '#fff',
                        fontSize: '12.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <RefreshCw size={14} />
                      <span>{t('settings.backup_muat_ulang')}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* ---------------- EKSPOR ---------------- */}
              <div style={{ border: '1px solid #EEF1F6', borderRadius: '16px', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <h4 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: '0 0 4px' }}>
                      {t('settings.backup_ekspor_judul')}
                    </h4>
                    <p style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', margin: 0 }}>
                      {t('settings.backup_ekspor_desc')}
                    </p>
                  </div>
                  <button
                    onClick={handleExportBackup}
                    disabled={backupBusy !== null}
                    style={{
                      padding: '9px 16px',
                      borderRadius: '10px',
                      border: 'none',
                      background: backupBusy !== null ? '#93C5FD' : '#1D4ED8',
                      color: '#fff',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      cursor: backupBusy !== null ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '7px',
                    }}
                  >
                    <Download size={14} />
                    <span>{backupBusy === 'export' ? t('settings.backup_membuat') : t('settings.backup_unduh_btn')}</span>
                  </button>
                </div>

                {backupSummary ? (
                  <div style={{ fontSize: '12.5px', color: 'var(--ez-color-text-body)', lineHeight: 1.6 }}>
                    <div>
                      {t('settings.backup_summary_a')}
                      <strong>{backupSummary.totalItems.toLocaleString('id-ID')} {t('settings.backup_summary_entri')}</strong>{t('settings.backup_summary_b')}
                      <strong>{backupSummary.datasets.filter((d) => d.present).length} {t('settings.backup_summary_dataset')}</strong>{' '}
                      (±{formatBackupBytes(backupSummary.totalBytes)} {t('settings.backup_summary_c')}
                    </div>
                    <details style={{ marginTop: '8px' }}>
                      <summary style={{ cursor: 'pointer', fontWeight: 700, color: 'var(--ez-color-primary)' }}>
                        {t('settings.backup_rincian')}
                      </summary>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '4px 20px', marginTop: '10px' }}>
                        {backupSummary.datasets
                          .filter((d) => d.present)
                          .sort((a, b) => a.label.localeCompare(b.label, 'id'))
                          .map((d) => (
                            <div key={d.key} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', borderBottom: '1px solid var(--ez-color-surface-tertiary)', padding: '3px 0' }}>
                              <span style={{ color: 'var(--ez-color-text-slate)' }}>{d.label}</span>
                              <strong style={{ color: 'var(--ez-color-text-primary)', whiteSpace: 'nowrap' }}>
                                {d.count.toLocaleString('id-ID')}
                              </strong>
                            </div>
                          ))}
                      </div>
                      {backupSummary.uncoveredEzrabKeys.length > 0 && (
                        <div style={{ marginTop: '10px', fontSize: '11.5px', color: 'var(--ez-color-text-muted)' }}>
                          {t('settings.backup_tidak_tercakup_a')}
                          {backupSummary.uncoveredEzrabKeys.length}{t('settings.backup_tidak_tercakup_b')}
                        </div>
                      )}
                    </details>
                  </div>
                ) : (
                  <div style={{ fontSize: '12.5px', color: 'var(--ez-color-text-muted)' }}>{t('settings.backup_memuat')}</div>
                )}
              </div>

              {/* ---------------- IMPOR ---------------- */}
              <div style={{ border: '1px solid #EEF1F6', borderRadius: '16px', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <h4 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: '0 0 4px' }}>
                      {t('settings.backup_impor_judul')}
                    </h4>
                    <p style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', margin: 0 }}>
                      {t('settings.backup_impor_desc')}
                    </p>
                  </div>
                  <button
                    onClick={() => backupFileInputRef.current?.click()}
                    disabled={backupBusy !== null}
                    style={{
                      padding: '9px 16px',
                      borderRadius: '10px',
                      border: '1px solid var(--ez-color-border-strong)',
                      background: 'var(--ez-color-surface)',
                      color: 'var(--ez-color-text-body)',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      cursor: backupBusy !== null ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '7px',
                    }}
                  >
                    <Upload size={14} />
                    <span>{backupBusy === 'import' ? t('settings.backup_membaca') : t('settings.backup_pilih_file')}</span>
                  </button>
                  <input
                    ref={backupFileInputRef}
                    type="file"
                    accept=".json,application/json"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      void handleImportFileSelected(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </div>

                {importPreview && importFileName && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--ez-color-surface-secondary)', borderRadius: '12px', padding: '14px 16px' }}>
                    <div style={{ fontSize: '12.5px', color: 'var(--ez-color-text-body)', lineHeight: 1.6 }}>
                      <div>
                        <strong>{t('settings.backup_prev_file')}</strong> {importFileName}
                      </div>
                      <div>
                        <strong>{t('settings.backup_prev_dibuat')}</strong>{' '}
                        {new Date(importPreview.metadata.createdAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                        {' · '}Format v{importPreview.metadata.formatVersion}, schema v{importPreview.metadata.schemaVersion}
                      </div>
                      {importPreview.metadata.projectSummary.length > 0 && (
                        <div>
                          <strong>{t('settings.backup_prev_proyek')}</strong>{' '}
                          {importPreview.metadata.projectSummary.map((p) => `${p.name} (${p.itemCount} ${t('settings.backup_prev_item_rab')})`).join('; ')}
                        </div>
                      )}
                      <div>
                        <strong>{t('settings.backup_prev_isi')}</strong>{' '}
                        {Object.entries(importPreview.counts)
                          .filter(([, c]) => c > 0)
                          .sort(([ka], [kb]) => (BACKUP_DATASET_LABELS[ka] || ka).localeCompare(BACKUP_DATASET_LABELS[kb] || kb, 'id'))
                          .map(([k, c]) => `${BACKUP_DATASET_LABELS[k] || k}: ${c.toLocaleString('id-ID')}`)
                          .join(' · ') || t('settings.backup_prev_kosong')}
                      </div>
                      {importPreview.untouchedKeys.length > 0 && (
                        <div style={{ color: 'var(--ez-color-text-muted)' }}>
                          {importPreview.untouchedKeys.length}{t('settings.backup_prev_tidak_ada')}
                        </div>
                      )}
                    </div>

                    {importPreview.warnings.length > 0 && (
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '10px', padding: '10px 12px' }}>
                        <AlertCircle size={15} color="#D97706" style={{ flexShrink: 0, marginTop: '1px' }} />
                        <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '12px', color: '#92400E', lineHeight: 1.6 }}>
                          {importPreview.warnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', padding: '10px 12px' }}>
                      <ShieldAlert size={15} color="#DC2626" style={{ flexShrink: 0, marginTop: '1px' }} />
                      <div style={{ fontSize: '12px', color: '#991B1B', lineHeight: 1.6 }}>
                        <strong>{t('settings.backup_warn_strong_a')}</strong>{t('settings.backup_warn_a')}<strong>{t('settings.backup_warn_strong')}</strong>{' '}
                        {t('settings.backup_warn_b')}
                      </div>
                    </div>

                    <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '12.5px', color: 'var(--ez-color-text-body)', cursor: 'pointer', lineHeight: 1.5 }}>
                      <input
                        type="checkbox"
                        checked={restoreConfirmed}
                        onChange={(e) => setRestoreConfirmed(e.target.checked)}
                        style={{ marginTop: '2px', accentColor: '#DC2626' }}
                      />
                      <span>
                        {t('settings.backup_konfirmasi')}
                      </span>
                    </label>

                    <div>
                      <button
                        onClick={handleConfirmRestore}
                        disabled={!restoreConfirmed || backupBusy !== null}
                        style={{
                          padding: '9px 16px',
                          borderRadius: '10px',
                          border: 'none',
                          background: !restoreConfirmed || backupBusy !== null ? '#FCA5A5' : '#DC2626',
                          color: '#fff',
                          fontSize: '12.5px',
                          fontWeight: 700,
                          cursor: !restoreConfirmed || backupBusy !== null ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '7px',
                        }}
                      >
                        <DatabaseBackup size={14} />
                        <span>{backupBusy === 'restore' ? t('settings.backup_memulihkan') : t('settings.backup_pulihkan_btn')}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* ---------------- SLOT PENGAMAN ---------------- */}
              {backupSafetySlot.exists && (
                <div style={{ border: '1px solid #EEF1F6', borderRadius: '16px', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: 0 }}>
                    {t('settings.backup_slot_judul')}
                  </h4>
                  <p style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', margin: 0, lineHeight: 1.6 }}>
                    {backupSafetySlot.corrupt
                      ? t('settings.backup_slot_rusak')
                      : <>{t('settings.backup_slot_a')}{backupSafetySlot.createdAt ? new Date(backupSafetySlot.createdAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '—'} ({formatBackupBytes(backupSafetySlot.sizeBytes)}{t('settings.backup_slot_b')}</>}
                  </p>
                  {!backupSafetySlot.corrupt && (
                    <div>
                      <button
                        onClick={handleRestoreFromSafetySlot}
                        disabled={backupBusy !== null}
                        style={{
                          padding: '8px 14px',
                          borderRadius: '10px',
                          border: '1px solid var(--ez-color-border-strong)',
                          background: 'var(--ez-color-surface)',
                          color: 'var(--ez-color-text-body)',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: backupBusy !== null ? 'wait' : 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <History size={13} />
                        <span>{t('settings.backup_slot_pratinjau')}</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ---------------- CAKUPAN ---------------- */}
              <details style={{ border: '1px solid #EEF1F6', borderRadius: '16px', padding: '14px 18px' }}>
                <summary style={{ cursor: 'pointer', fontSize: '13px', fontWeight: 800, color: 'var(--ez-color-text-primary)' }}>
                  {t('settings.backup_cakupan_judul')}
                </summary>
                <div style={{ fontSize: '12.5px', color: 'var(--ez-color-text-slate)', lineHeight: 1.7, marginTop: '10px' }}>
                  <p style={{ margin: '0 0 8px' }}>
                    <strong>{t('settings.backup_inc_label')}</strong> {t('settings.backup_inc_body')}
                  </p>
                  <p style={{ margin: '0 0 8px' }}>
                    <strong>{t('settings.backup_exc_label')}</strong> {BACKUP_EXCLUDED_NOTE}
                  </p>
                  <p style={{ margin: '0 0 8px' }}>
                    <strong>{t('settings.backup_catatan_label')}</strong> {t('settings.backup_catatan_a')}<strong>{t('settings.backup_catatan_strong')}</strong>{t('settings.backup_catatan_b')}
                  </p>
                  <p style={{ margin: 0 }}>
                    {t('settings.backup_server_a')}<strong>{t('settings.backup_server_strong')}</strong>{t('settings.backup_server_b')}
                  </p>
                </div>
              </details>
            </div>
          )}

          {/* ===================================================================
              GLOBAL SCOPE: 10. SISTEM (BANTUAN & FAQ)
             =================================================================== */}
          {activeTab === 'help' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: '0 0 4px' }}>
                  {t('settings.bantuan_judul')}
                </h3>
                <p style={{ fontSize: '12.5px', color: 'var(--ez-color-text-muted)', margin: 0 }}>
                  {t('settings.bantuan_desc')}
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[
                  { q: t('settings.faq_1_q'), a: t('settings.faq_1_a') },
                  { q: t('settings.faq_2_q'), a: t('settings.faq_2_a') },
                  { q: t('settings.faq_3_q'), a: t('settings.faq_3_a') },
                ].map((faq) => (
                  <div key={faq.q} style={{ padding: '16px', borderRadius: '16px', background: 'var(--ez-color-surface-secondary)', border: '1px solid #EEF1F6' }}>
                    <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>{faq.q}</div>
                    <div style={{ fontSize: '12.5px', color: 'var(--ez-color-text-slate)', marginTop: '6px', lineHeight: 1.5 }}>{faq.a}</div>
                  </div>
                ))}
              </div>

              <SuggestionComplaintBox />

              <TutorialCenter />
            </div>
          )}

          {/* ===================================================================
              PROJECT SCOPE: 1. INFORMASI PROYEK
             =================================================================== */}
          {activeTab === 'project-info' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: 0 }}>
                    {t('settings.pinfo_judul')}
                  </h3>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ez-hue-amber-text-dark)', background: 'var(--ez-hue-amber-bg-deep)', padding: '2px 10px', borderRadius: 'var(--ez-radius-pill)' }}>
                    {activeProject?.name || t('settings.proyek_nama_badge')}
                  </span>
                </div>
                <p style={{ fontSize: '12.5px', color: 'var(--ez-color-text-muted)', margin: '4px 0 0' }}>
                  {t('settings.pinfo_desc')}
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.pinfo_nama')}</label>
                  <input
                    type="text"
                    value={projName}
                    onChange={(e) => setProjName(e.target.value)}
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.pinfo_nomor')}</label>
                  <input
                    type="text"
                    value={projNumber}
                    onChange={(e) => setProjNumber(e.target.value)}
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.pinfo_klien')}</label>
                  <input
                    type="text"
                    value={projClient}
                    onChange={(e) => setProjClient(e.target.value)}
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.pinfo_lokasi')}</label>
                  <input
                    type="text"
                    value={projLocation}
                    onChange={(e) => setProjLocation(e.target.value)}
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.pinfo_kategori')}</label>
                  <select
                    value={projBuildingType}
                    onChange={(e) => setProjBuildingType(e.target.value as any)}
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 10px', marginTop: '6px', background: 'var(--ez-color-surface)' }}
                  >
                    <option value="Rumah Tinggal">{t('settings.pinfo_tipe_rumah')}</option>
                    <option value="Gedung Kantor">{t('settings.pinfo_tipe_kantor')}</option>
                    <option value="Infrastruktur">{t('settings.pinfo_tipe_infra')}</option>
                    <option value="Gudang & Pabrik">{t('settings.pinfo_tipe_gudang')}</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.pinfo_luas')}</label>
                  <input
                    type="number"
                    value={projBuildingArea}
                    onChange={(e) => setProjBuildingArea(Number(e.target.value))}
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }}
                  />
                </div>

                {/* Field lengkap (owner 2026-10-27) — sebelumnya form ini
                    hanya menampilkan 6 field padahal tipe Project sudah
                    punya semuanya; field kosong dibiarkan kosong (jujur),
                    tidak diisi contoh. */}
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.pinfo_provinsi')}</label>
                  <input type="text" value={projProvince} onChange={(e) => setProjProvince(e.target.value)}                   placeholder={t('settings.pinfo_ph_provinsi')} style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.pinfo_kota')}</label>
                  <input type="text" value={projCityRegency} onChange={(e) => setProjCityRegency(e.target.value)}                   placeholder={t('settings.pinfo_ph_kota')} style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.pinfo_institusi')}</label>
                  <input type="text" value={projInstitution} onChange={(e) => setProjInstitution(e.target.value)}                   placeholder={t('settings.pinfo_ph_institusi')} style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.pinfo_jenis_kontrak')}</label>
                  <input type="text" value={projContractType} onChange={(e) => setProjContractType(e.target.value)}                   placeholder={t('settings.pinfo_ph_kontrak')} style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.pinfo_sumber_dana')}</label>
                  <input type="text" value={projFundingSource} onChange={(e) => setProjFundingSource(e.target.value)}                   placeholder={t('settings.pinfo_ph_dana')} style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.pinfo_pemilik')}</label>
                  <input type="text" value={projOwnerName} onChange={(e) => setProjOwnerName(e.target.value)} style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.pinfo_konsultan')}</label>
                  <input type="text" value={projConsultantName} onChange={(e) => setProjConsultantName(e.target.value)} style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.pinfo_kontraktor')}</label>
                  <input type="text" value={projContractorName} onChange={(e) => setProjContractorName(e.target.value)} style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.pinfo_tahun')}</label>
                  <input type="number" value={projBudgetYear} onChange={(e) => setProjBudgetYear(Number(e.target.value))} style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.pinfo_mulai')}</label>
                  <input type="date" value={projStartDate} onChange={(e) => setProjStartDate(e.target.value)} style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.pinfo_selesai')}</label>
                  <input type="date" value={projTargetDate} onChange={(e) => setProjTargetDate(e.target.value)} style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.pinfo_durasi')}</label>
                  <input type="text" readOnly value={(() => {
                    const s = new Date(projStartDate);
                    const end = new Date(projTargetDate);
                    if (isNaN(s.getTime()) || isNaN(end.getTime()) || end < s) return '—';
                    const days = Math.round((end.getTime() - s.getTime()) / 86400000);
                    return `${days} ${t('settings.pinfo_durasi_hari')} (± ${Math.max(1, Math.ceil(days / 7))} ${t('settings.pinfo_durasi_minggu')})`;
                  })()} style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface-secondary)', color: 'var(--ez-color-text-slate)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }} />
                </div>
              </div>

              {/* Total Nilai RAB — TERHITUNG (read-only, bukan input) dari
                  item RAB proyek, dengan aturan pajak yang SAMA seperti
                  Rekapitulasi (PPN/PPh hanya bila dicentang di tab
                  Estimator & Pajak; item yang sudah termasuk pajak tidak
                  dihitung lagi). Bila proyek belum punya item, tampil
                  jujur "Belum ada item RAB", bukan Rp0. */}
              {(() => {
                // D-76 (Batch G2): item RAB disimpan FLAT di allRabItems
                // (per projectId) — BUKAN di sections[].items proyek
                // (selalu kosong; itulah sebabnya proyek demo 213 item
                // diklaim "Belum ada item RAB"). Cabang `!info` kini
                // hanya tercapai proyek yang BENAR-BENAR kosong.
                const items: any[] = (allRabItems || []).filter(
                  (i: any) => i?.projectId === activeProject?.id,
                );
                /* Rumus dihitung helper bersama (services/projectInfoTotal)
                 * agar kartu ini, Rekapitulasi, dan mesin memakai satu
                 * aturan pajak yang sama dan bisa diuji tanpa React. */
                const info = computeProjectInfoTotal(items, activeProject as any);
                if (!info) {
                  return (
                    <div style={{ padding: '14px 16px', borderRadius: '12px', background: 'var(--ez-color-surface-secondary)', border: '1px solid var(--ez-color-border-line)' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>{t('settings.pinfo_total_judul')}</div>
                      <div style={{ fontSize: '13px', color: 'var(--ez-color-text-slate)', marginTop: '4px' }}>{t('settings.pinfo_total_kosong')}</div>
                    </div>
                  );
                }
                const { total, overheadPercent: ohPct, ppn, pph } = info;
                const converted = (() => {
                  if (displayCurrency === 'IDR') return null;
                  const code = displayCurrency as ForeignCurrencyCode;
                  const res = convertIdrToDisplay({ amount: total, currency: 'IDR', kind: 'mixed' }, code, rates[code]);
                  return res.ok && res.converted ? res.value.value : null;
                })();
                return (
                  <div style={{ padding: '14px 16px', borderRadius: '12px', background: 'var(--ez-color-surface-secondary)', border: '1px solid var(--ez-color-border-line)' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'baseline', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>{t('settings.pinfo_total_judul')}</div>
                        <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ez-color-text-primary)', marginTop: '4px', fontVariantNumeric: 'tabular-nums' }}>
                          {formatCurrencyIDR(total)}
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '2px' }}>
                          {t('settings.pinfo_total_a')}{items.length} {t('settings.pinfo_total_item')}{t('settings.pinfo_total_b')}{ohPct}%{info.profit > 0 ? `${t('settings.pinfo_total_profit')}${info.profitPercent}%` : ''}{ppn > 0 ? ` + PPN` : ''}{pph > 0 ? ` + PPh` : ''}{t('settings.pinfo_total_c')}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.pinfo_tampil')}</label>
                        <select
                          value={displayCurrency}
                          onChange={(e) => setDisplayCurrency(e.target.value as any)}
                          style={{ height: '34px', borderRadius: '8px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', fontWeight: 700, padding: '0 8px' }}
                        >
                          {SUPPORTED_CURRENCIES.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                        {converted != null && (
                          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ez-hue-blue-text)', fontVariantNumeric: 'tabular-nums' }}>
                            ≈ {formatCurrency(converted, displayCurrency)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ===================================================================
              PROJECT SCOPE: 2. ESTIMATOR & PAJAK PROYEK
             =================================================================== */}
          {activeTab === 'project-estimator' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: 0 }}>
                    {t('settings.pest_judul')}
                  </h3>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ez-hue-amber-text-dark)', background: 'var(--ez-hue-amber-bg-deep)', padding: '2px 10px', borderRadius: 'var(--ez-radius-pill)' }}>
                    {activeProject?.name || t('settings.proyek_nama_badge')}
                  </span>
                </div>
                <p style={{ fontSize: '12.5px', color: 'var(--ez-color-text-muted)', margin: '4px 0 0' }}>
                  {t('settings.pest_desc')}
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.pest_overhead')}</label>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    step={0.5}
                    value={projOverhead}
                    onChange={(e) => setProjOverhead(Number(e.target.value))}
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.pest_profit')}</label>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    step={0.5}
                    value={projProfit}
                    onChange={(e) => setProjProfit(Number(e.target.value))}
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.pest_ppn')}</label>
                  <input
                    type="number"
                    min={0}
                    max={25}
                    value={projPpn}
                    onChange={(e) => setProjPpn(Number(e.target.value))}
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }}
                  />
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', fontWeight: 650, color: 'var(--ez-color-text-body)', cursor: 'pointer', marginTop: '8px' }}>
                    <input type="checkbox" checked={projPpnEnabled} onChange={(e) => setProjPpnEnabled(e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#2563EB' }} />
                    {t('settings.pest_ppn_cek')}
                  </label>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.pest_pph')}</label>
                  <input
                    type="number"
                    min={0}
                    max={25}
                    step={0.5}
                    value={projPph}
                    onChange={(e) => setProjPph(Number(e.target.value))}
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }}
                  />
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', fontWeight: 650, color: 'var(--ez-color-text-body)', cursor: 'pointer', marginTop: '8px' }}>
                    <input type="checkbox" checked={projPphEnabled} onChange={(e) => setProjPphEnabled(e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#2563EB' }} />
                    {t('settings.pest_pph_cek')}
                  </label>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.pest_rounding')}</label>
                  <select
                    value={projRounding}
                    onChange={(e) => setProjRounding(e.target.value)}
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 10px', marginTop: '6px', background: 'var(--ez-color-surface)' }}
                  >
                    <option value="RIBUAN">{t('settings.rounding_ribuan')}</option>
                    <option value="RATUSAN">{t('settings.rounding_ratusan')}</option>
                    <option value="EXACT">{t('settings.rounding_exact')}</option>
                  </select>
                </div>
              </div>

              {/* Direct Banner to Project Price Overrides */}
              <div style={{ padding: '16px', borderRadius: 'var(--ez-radius-control)', background: 'var(--ez-hue-blue-bg)', border: '1px solid var(--ez-hue-blue-bg-deep)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Tag size={20} color="var(--ez-hue-blue-text)" />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ez-color-primary-hover)' }}>{t('settings.pest_override_judul')}</div>
                    <div style={{ fontSize: '11.5px', color: 'var(--ez-color-text-muted)' }}>{t('settings.pest_override_desc')}</div>
                  </div>
                </div>
                <button
                  onClick={() => onNavigateTab?.('harga-proyek')}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '10px',
                    background: 'var(--ez-color-primary)',
                    color: '#FFFFFF',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {t('settings.pest_override_btn')}
                </button>
              </div>
            </div>
          )}

          {/* ===================================================================
              PROJECT SCOPE: 3. DED & WASTE FACTOR
             =================================================================== */}
          {activeTab === 'project-ded' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: '0 0 4px' }}>
                  {t('settings.pded_judul')}
                </h3>
                <p style={{ fontSize: '12.5px', color: 'var(--ez-color-text-muted)', margin: 0 }}>
                  {t('settings.pded_desc')}
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.pded_waste')}</label>
                  <input
                    type="number"
                    value={projWaste}
                    onChange={(e) => setProjWaste(Number(e.target.value))}
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.pded_presisi')}</label>
                  <select
                    value={projVolumeDecimals}
                    onChange={(e) => setProjVolumeDecimals(Number(e.target.value))}
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 10px', marginTop: '6px', background: 'var(--ez-color-surface)' }}
                  >
                    <option value={2}>{t('settings.pded_des2')}</option>
                    <option value={3}>{t('settings.pded_des3')}</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================
              PROJECT SCOPE: 4. DOKUMEN & SURAT PROYEK
             =================================================================== */}
          {activeTab === 'project-documents' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: '0 0 4px' }}>
                  {t('settings.pdok_judul')}
                </h3>
                <p style={{ fontSize: '12.5px', color: 'var(--ez-color-text-muted)', margin: 0 }}>
                  {t('settings.pdok_desc')}
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.pdok_format')}</label>
                  <input
                    type="text"
                    defaultValue={`SP/${projNumber}/2026`}
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.pdok_penanda')}</label>
                  <input
                    type="text"
                    defaultValue={companyDirector}
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================
              PROJECT SCOPE: 5. JADWAL PROYEK
             =================================================================== */}
          {activeTab === 'project-schedule' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: '0 0 4px' }}>
                  {t('settings.pjad_judul')}
                </h3>
                <p style={{ fontSize: '12.5px', color: 'var(--ez-color-text-muted)', margin: 0 }}>
                  {t('settings.pjad_desc')}
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.pjad_mulai')}</label>
                  <input
                    type="date"
                    value={projStartDate}
                    onChange={(e) => setProjStartDate(e.target.value)}
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.pjad_selesai')}</label>
                  <input
                    type="date"
                    value={projTargetDate}
                    onChange={(e) => setProjTargetDate(e.target.value)}
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', fontFamily: 'inherit' }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================
              PROJECT SCOPE: 6. COST & BASELINE PROYEK
             =================================================================== */}
          {activeTab === 'project-cost' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: '0 0 4px' }}>
                  {t('settings.pbiaya_judul')}
                </h3>
                <p style={{ fontSize: '12.5px', color: 'var(--ez-color-text-muted)', margin: 0 }}>
                  {t('settings.pbiaya_desc')}
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>{t('settings.pbiaya_pagu')}</label>
                  {/* D-79: nilai lama Rp450.000.000 adalah literal hardcoded
                      dengan caption palsu ("disetujui direksi") — bukan data
                      proyek mana pun. Kini jujur kosong sampai ada fitur
                      penetapan pagu yang sesungguhnya (tidak diisi otomatis
                      dari grand total: pagu adalah keputusan manajemen,
                      bukan turunan RAB). */}
                  <input
                    type="text"
                    defaultValue={t('settings.pbiaya_belum')}
                    disabled
                    style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid var(--ez-color-border-strong)', color: 'var(--ez-color-text-primary)', fontSize: '13px', padding: '0 12px', marginTop: '6px', background: 'var(--ez-color-surface-secondary)', fontWeight: 700 }}
                  />
                  <span style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px', display: 'block' }}>{t('settings.pbiaya_belum_desc')}</span>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Add User Modal */}
      {addUserModalOpen && (
        <AddUserModal
          isOpen={addUserModalOpen}
          onClose={() => setAddUserModalOpen(false)}
          onUserAdded={handleUserAdded}
        />
      )}
    </div>
  );
};

export default UnifiedSettingsView;
