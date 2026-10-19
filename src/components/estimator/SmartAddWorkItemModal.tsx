import React, { useState, useMemo, useEffect } from 'react';
import {
  Sparkles,
  BookOpen,
  PenTool,
  LayoutTemplate,
  Copy,
  Search,
  Plus,
  X,
  ArrowLeft,
  Check,
  Layers,
  AlertCircle,
  Building,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Edit3,
  Loader2,
  FileText,
} from 'lucide-react';
import { RabItem, VolumeSourceType } from '../../types';
import { officialAhspRepository } from '../../data/nationalCostDatabase/officialAhspRepository';
import { NationalAHSPItem } from '../../data/nationalCostDatabase/types';
import { WORK_CATEGORIES } from '../../data/mockData';
import { masterBuildingTemplateRegistry } from '../../data/buildingTemplates/masterTemplateRegistry';
import { MasterBuildingTemplate, TemplateWorkItem } from '../../data/buildingTemplates/schema/types';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';
import { priceResolver2026 } from '../../data/priceDatabase2026/resolver';
import { honestVolume } from '../../engine/honestVolume';

export type AddItemMode = 'selector' | 'ahsp' | 'manual' | 'ai' | 'template' | 'duplicate';

export interface SmartAddWorkItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddItem: (itemData: Omit<RabItem, 'id'>) => Promise<void> | void;
  onAddMultipleItems?: (itemsData: Omit<RabItem, 'id'>[]) => Promise<void> | void;
  existingItems?: RabItem[];
  activeCategory?: string;
  initialMode?: AddItemMode;
  currentProjectId?: string | null;
  userRole?: string;
}

const COMMON_UNITS = ['m¹', 'm²', 'm³', 'kg', 'unit', 'bh', 'ls', 'ttk', 'set', 'btg', 'zak'];

export const SmartAddWorkItemModal: React.FC<SmartAddWorkItemModalProps> = ({
  isOpen,
  onClose,
  onAddItem,
  onAddMultipleItems,
  existingItems = [],
  activeCategory = 'Pekerjaan Persiapan & Bowplank',
  initialMode = 'selector',
  currentProjectId,
  userRole = 'ESTIMATOR',
}) => {
  const [activeMode, setActiveMode] = useState<AddItemMode>(initialMode || 'selector');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Target WBS Category
  const [targetCategory, setTargetCategory] = useState<string>(activeCategory || 'Pekerjaan Persiapan & Bowplank');

  // AHSP State
  const [ahspSearch, setAhspSearch] = useState<string>('');
  const [ahspCategoryFilter, setAhspCategoryFilter] = useState<string>('ALL');
  const [selectedAhspItem, setSelectedAhspItem] = useState<NationalAHSPItem | null>(null);
  const [ahspCustomVolume, setAhspCustomVolume] = useState<number>(1);
  const [ahspCustomPrice, setAhspCustomPrice] = useState<number>(0);
  const [bulkSelectedAhspCodes, setBulkSelectedAhspCodes] = useState<Set<string>>(new Set());

  // Manual State
  const [manualCode, setManualCode] = useState<string>('');
  const [manualDescription, setManualDescription] = useState<string>('');
  const [manualVolume, setManualVolume] = useState<number>(1);
  const [manualUnit, setManualUnit] = useState<string>('m²');
  // Fase 4A: simpan input mentah agar "kosong" bisa dibedakan dari "nol eksplisit".
  // Kosong -> NaN -> factory menetapkan PRICE_UNRESOLVED ("Harga belum diisi").
  // Nol eksplisit -> 0 -> PRICE_RESOLVED (nol adalah harga nyata).
  const [manualUnitPriceRaw, setManualUnitPriceRaw] = useState<string>('');
  const manualUnitPrice = manualUnitPriceRaw.trim() === '' ? NaN : Number(manualUnitPriceRaw);
  const [manualNotes, setManualNotes] = useState<string>('');

  // AI State
  const [aiPrompt, setAiPrompt] = useState<string>('');
  const [aiIsGenerating, setAiIsGenerating] = useState<boolean>(false);
  const [aiGeneratedItem, setAiGeneratedItem] = useState<{
    code: string;
    description: string;
    category: string;
    volume: number;
    unit: string;
    unitPrice: number;
    notes: string;
  } | null>(null);
  const [aiIsEditingPreview, setAiIsEditingPreview] = useState<boolean>(false);

  // Template State
  const allTemplates = useMemo(() => {
    try {
      const list = masterBuildingTemplateRegistry.getAllTemplates();
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }, []);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedTemplateItemIds, setSelectedTemplateItemIds] = useState<Set<string>>(new Set());

  const currentTemplate = useMemo(() => {
    return allTemplates.find((t: MasterBuildingTemplate) => t.id === selectedTemplateId) || allTemplates[0];
  }, [allTemplates, selectedTemplateId]);

  // Duplicate State
  const [duplicateSearch, setDuplicateSearch] = useState<string>('');
  const [selectedDuplicateItem, setSelectedDuplicateItem] = useState<RabItem | null>(null);
  const [duplicateNewDescription, setDuplicateNewDescription] = useState<string>('');
  const [duplicateNewVolume, setDuplicateNewVolume] = useState<number>(1);
  const [duplicateNewCategory, setDuplicateNewCategory] = useState<string>(activeCategory || 'Pekerjaan Persiapan & Bowplank');

  const activeAhspItems = useMemo(() => officialAhspRepository.getActiveOfficialAhsp(), []);
  const availableAhspCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const it of activeAhspItems) {
      if (it.category) cats.add(it.category);
    }
    return Array.from(cats).sort();
  }, [activeAhspItems]);

  // Filtered & Paginated AHSP Items
  const filteredAhsp = useMemo(() => {
    return activeAhspItems.filter((item) => {
      const q = ahspSearch.toLowerCase();
      const matchSearch =
        !ahspSearch ||
        item.name.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        (item.category || '').toLowerCase().includes(q) ||
        (item.sourceDocument || '').toLowerCase().includes(q);
      const matchCat = ahspCategoryFilter === 'ALL' || item.category === ahspCategoryFilter;
      return matchSearch && matchCat;
    });
  }, [ahspSearch, ahspCategoryFilter]);

  const displayedAhsp = useMemo(() => {
    return filteredAhsp.slice(0, 100);
  }, [filteredAhsp]);

  // Reset lifecycle when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveMode(initialMode || 'selector');
      setTargetCategory(activeCategory || 'Pekerjaan Persiapan & Bowplank');
      setErrorMessage(null);
      setIsSubmitting(false);

      setSelectedAhspItem(null);
      setAhspCustomVolume(1);
      setAhspCustomPrice(0);
      setBulkSelectedAhspCodes(new Set());

      setManualCode('');
      setManualDescription('');
      setManualVolume(1);
      setManualUnit('m²');
      setManualUnitPriceRaw('');
      setManualNotes('');

      setAiPrompt('');
      setAiGeneratedItem(null);
      setAiIsEditingPreview(false);

      setSelectedTemplateItemIds(new Set());
      const list = masterBuildingTemplateRegistry.getAllTemplates();
      if (list && list.length > 0) {
        setSelectedTemplateId(list[0].id);
      }

      setSelectedDuplicateItem(null);
      setDuplicateNewDescription('');
      setDuplicateNewVolume(1);
      setDuplicateNewCategory(activeCategory || 'Pekerjaan Persiapan & Bowplank');
    }
  }, [isOpen, initialMode, activeCategory]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // ---------------------------------------------------------------------------
  // HANDLERS: AHSP Workflow
  // ---------------------------------------------------------------------------
  const handleSelectAhspForRefinement = (ahsp: NationalAHSPItem) => {
    setSelectedAhspItem(ahsp);
    setAhspCustomVolume(1);
    const comp = priceResolver2026.resolveAhspUnitPrice(ahsp);
    setAhspCustomPrice(comp.unitPrice || 0);
  };

  const handleSaveSingleAhsp = async () => {
    if (!selectedAhspItem) return;

    if (ahspCustomVolume <= 0) {
      setErrorMessage('Volume pekerjaan harus lebih dari 0.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const comp = priceResolver2026.resolveAhspUnitPrice(selectedAhspItem);
      // Integrity: jangan ubah null menjadi 0. Factory akan menetapkan
      // PRICE_UNRESOLVED + NEEDS_VERIFICATION untuk harga null.
      const effectiveUnitPrice = ahspCustomPrice > 0 ? ahspCustomPrice : comp.unitPrice;
      const amount = effectiveUnitPrice != null ? Math.round(ahspCustomVolume * effectiveUnitPrice) : 0;
      await onAddItem({
        no: existingItems.length + 1,
        sectionName: targetCategory,
        category: targetCategory,
        code: selectedAhspItem.code,
        description: selectedAhspItem.name,
        volume: ahspCustomVolume,
        unit: selectedAhspItem.unit,
        materialPrice: comp.material.subtotalPerUnit || 0,
        laborPrice: comp.labor.subtotalPerUnit || 0,
        equipmentPrice: comp.equipment.subtotalPerUnit || 0,
        unitPrice: effectiveUnitPrice,
        amount,
        totalPrice: amount,
        volumeSource: 'AHSP 2026' as any,
        ahspCode: selectedAhspItem.code,
        // verificationStatus: biarkan factory yang menentukan dari priceStatus
      });
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menambahkan item AHSP ke RAB.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBulkAddAhsp = async () => {
    if (bulkSelectedAhspCodes.size === 0) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const itemsToInsert: Omit<RabItem, 'id'>[] = [];
      const selectedAhspList = activeAhspItems.filter((i) => bulkSelectedAhspCodes.has(i.code));

      selectedAhspList.forEach((ahsp, idx) => {
        const comp = priceResolver2026.resolveAhspUnitPrice(ahsp);
        // Integrity: jangan ubah null menjadi 0. Factory menetapkan status yang benar.
        const up = comp.unitPrice;
        const amt = up != null ? up * 1 : 0;
        itemsToInsert.push({
          no: existingItems.length + idx + 1,
          sectionName: targetCategory,
          category: targetCategory,
          code: ahsp.code,
          description: ahsp.name,
          volume: 1,
          unit: ahsp.unit,
          materialPrice: comp.material.subtotalPerUnit || 0,
          laborPrice: comp.labor.subtotalPerUnit || 0,
          equipmentPrice: comp.equipment.subtotalPerUnit || 0,
          unitPrice: up,
          amount: amt,
          totalPrice: amt,
          volumeSource: 'AHSP 2026' as any,
          ahspCode: ahsp.code,
          // verificationStatus: biarkan factory yang menentukan dari priceStatus
        });
      });

      if (onAddMultipleItems) {
        await onAddMultipleItems(itemsToInsert);
      } else {
        for (const it of itemsToInsert) {
          await onAddItem(it);
        }
      }
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menambahkan banyak item AHSP.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // HANDLERS: Manual Workflow
  // ---------------------------------------------------------------------------
  const handleSaveManual = async () => {
    if (!manualDescription.trim()) {
      setErrorMessage('Uraian pekerjaan wajib diisi.');
      return;
    }
    if (manualVolume <= 0) {
      setErrorMessage('Volume pekerjaan harus lebih besar dari 0.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const hasPrice = Number.isFinite(manualUnitPrice);
      const amount = hasPrice ? Math.round(manualVolume * manualUnitPrice) : 0;
      await onAddItem({
        no: existingItems.length + 1,
        sectionName: targetCategory,
        category: targetCategory,
        code: manualCode.trim() || `MAN.${(existingItems.length + 1).toString().padStart(2, '0')}`,
        description: manualDescription.trim(),
        volume: manualVolume,
        unit: manualUnit.trim() || 'm²',
        unitPrice: manualUnitPrice,
        amount,
        totalPrice: amount,
        volumeSource: 'MANUAL',
        ahspCode: '',
        verificationStatus: 'NEEDS_VERIFICATION',
      });
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menyimpan item manual.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // HANDLERS: AI Workflow
  // ---------------------------------------------------------------------------
  const handleGenerateAiItem = async () => {
    if (!aiPrompt.trim()) {
      setErrorMessage('Tuliskan kebutuhan pekerjaan yang ingin diestimasi AI.');
      return;
    }
    setErrorMessage(null);
    setAiIsGenerating(true);

    try {
      const { AiToolsProviderClient } = await import('../../ai-tools/providerClient');
      const client = new AiToolsProviderClient();

      const systemPrompt = `Anda adalah estimator konstruksi Indonesia. Analisis permintaan pekerjaan dan kembalikan JSON:
{
  "description": "nama pekerjaan lengkap",
  "category": "kategori pekerjaan",
  "volume": number,
  "unit": "m2|m3|kg|titik|ls|bh",
  "unitPrice": number|null,
  "notes": "catatan spesifikasi"
}
Jika harga tidak pasti, unitPrice = null. Jangan mengarang harga.`;

      const result = await client.execute({
        productId: 'EZRAB_AI',
        prompt: aiPrompt.trim(),
        systemPrompt,
        jsonMode: true,
        temperature: 0.3,
        maxTokens: 1000,
      });

      if (!result.success) {
        throw new Error(result.message || 'AI tidak dapat memproses permintaan.');
      }

      let parsed: any = null;
      try {
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : result.content);
      } catch {
        throw new Error('Respons AI tidak valid.');
      }

      setAiGeneratedItem({
        code: `AI.${(existingItems.length + 1).toString().padStart(2, '0')}`,
        description: parsed.description || aiPrompt.trim(),
        category: parsed.category || targetCategory,
        volume: typeof parsed.volume === 'number' ? parsed.volume : 1,
        unit: parsed.unit || 'm²',
        unitPrice: typeof parsed.unitPrice === 'number' ? parsed.unitPrice : null,
        notes: parsed.notes || 'Dianalisis oleh EZRAB AI.',
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menganalisis dengan AI. Coba lagi.');
    } finally {
      setAiIsGenerating(false);
    }
  };

  const handleSaveAiItem = async () => {
    if (!aiGeneratedItem) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const amount = Math.round(aiGeneratedItem.volume * aiGeneratedItem.unitPrice);
      await onAddItem({
        no: existingItems.length + 1,
        sectionName: aiGeneratedItem.category,
        category: aiGeneratedItem.category,
        code: aiGeneratedItem.code,
        description: aiGeneratedItem.description,
        volume: aiGeneratedItem.volume,
        unit: aiGeneratedItem.unit,
        unitPrice: aiGeneratedItem.unitPrice,
        amount,
        totalPrice: amount,
        volumeSource: 'CALCULATOR',
        ahspCode: '',
        verificationStatus: 'NEEDS_VERIFICATION',
      });
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menambahkan saran AI ke RAB.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // HANDLERS: Template Workflow
  // ---------------------------------------------------------------------------

  const handleSaveTemplateItems = async () => {
    if (!currentTemplate || selectedTemplateItemIds.size === 0) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const itemsToInsert: Omit<RabItem, 'id'>[] = [];
      (currentTemplate.workItems || []).forEach((item: TemplateWorkItem, idx: number) => {
        if (selectedTemplateItemIds.has(item.stableId)) {
          // Phase 2J P1 fix: no fabricated fallback price. Null stays null.
          const estPrice = item.ahspCandidates?.[0]?.unitPriceEstimate ?? null;
          const defaultVol = 1;
          const amount = estPrice == null ? null : Math.round(defaultVol * estPrice);
          itemsToInsert.push({
            no: existingItems.length + itemsToInsert.length + 1,
            sectionName: targetCategory,
            category: targetCategory,
            code: item.wbsCode || `TPL.${(idx + 1).toString().padStart(2, '0')}`,
            description: item.name,
            volume: defaultVol,
            unit: item.unit || 'm²',
            unitPrice: estPrice,
            amount,
            totalPrice: amount,
            volumeSource: 'AHSP 2026' as any,
            ahspCode: item.defaultAhspCode || '',
            verificationStatus: 'VERIFIED',
            priceStatus: estPrice == null ? 'PRICE_UNRESOLVED' : 'PRICE_RESOLVED',
          });
        }
      });

      if (itemsToInsert.length > 0) {
        if (onAddMultipleItems) {
          await onAddMultipleItems(itemsToInsert);
        } else {
          for (const it of itemsToInsert) {
            await onAddItem(it);
          }
        }
      }
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menambahkan item template ke RAB.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // HANDLERS: Duplicate Workflow
  // ---------------------------------------------------------------------------
  const handleSelectDuplicateItem = (item: RabItem) => {
    setSelectedDuplicateItem(item);
    setDuplicateNewDescription(`${item.description} (Salinan)`);
    setDuplicateNewVolume(honestVolume(item.volume));
    setDuplicateNewCategory(item.sectionName || item.category || targetCategory);
  };

  const handleSaveDuplicate = async () => {
    if (!selectedDuplicateItem) return;
    if (!duplicateNewDescription.trim()) {
      setErrorMessage('Uraian pekerjaan baru harus diisi.');
      return;
    }
    if (duplicateNewVolume <= 0) {
      setErrorMessage('Volume duplikasi harus lebih besar dari 0.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      // Aturan Phase 2J: null price → null amount (jangan jadi 0 di storage).
      const dupPrice = selectedDuplicateItem.unitPrice;
      const amount = dupPrice == null ? null : Math.round(duplicateNewVolume * dupPrice);
      await onAddItem({
        no: existingItems.length + 1,
        sectionName: duplicateNewCategory,
        category: duplicateNewCategory,
        code: `${selectedDuplicateItem.code || 'ITEM'}.DUP`,
        description: duplicateNewDescription.trim(),
        volume: duplicateNewVolume,
        unit: selectedDuplicateItem.unit,
        unitPrice: selectedDuplicateItem.unitPrice,
        amount,
        totalPrice: amount,
        volumeSource: selectedDuplicateItem.volumeSource || 'MANUAL',
        ahspCode: selectedDuplicateItem.ahspCode,
        verificationStatus: selectedDuplicateItem.verificationStatus || 'VERIFIED',
        // Fase 4A: warisi status harga agar duplikat item tanpa harga
        // tidak berubah menjadi "resolved" diam-diam.
        priceStatus: selectedDuplicateItem.priceStatus,
      });
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menduplikasi item pekerjaan.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        backdropFilter: 'blur(5px)',
        padding: '16px',
      }}
    >
      <div
        style={{
          background: 'var(--ez-color-surface)',
          borderRadius: '16px',
          width: activeMode === 'selector' ? '740px' : '920px',
          maxWidth: '96vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)',
          overflow: 'hidden',
          transition: 'all 0.2s ease',
        }}
      >
        {/* MODAL HEADER */}
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--ez-color-border-line)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--ez-color-surface-secondary)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {activeMode !== 'selector' && (
              <button
                onClick={() => {
                  setActiveMode('selector');
                  setSelectedAhspItem(null);
                  setErrorMessage(null);
                }}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  border: '1px solid var(--ez-hue-slate-border)',
                  background: 'var(--ez-color-surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: 'var(--ez-color-text-slate)',
                }}
                title="Kembali ke Pilihan Metode"
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <div>
              <h2 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                {activeMode === 'selector' && 'Tambah Pekerjaan ke RAB'}
                {activeMode === 'ahsp' && 'Database Standar AHSP PUPR 2026'}
                {activeMode === 'manual' && 'Input Pekerjaan Manual'}
                {activeMode === 'ai' && 'Rancang Pekerjaan via Magic AI'}
                {activeMode === 'template' && 'Pilih Item dari Library Template'}
                {activeMode === 'duplicate' && 'Duplikasi dari Pekerjaan Eksisting'}
              </h2>
              <span style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)' }}>
                {activeMode === 'selector' && 'Pilih cara menambahkan pekerjaan ke RAB proyek Anda.'}
                {activeMode === 'ahsp' && 'Cari analisa standar nasional untuk diadopsi ke lembar RAB.'}
                {activeMode === 'manual' && 'Ketik rincian pekerjaan kustom dan tentukan volume serta harga.'}
                {activeMode === 'ai' && 'AI membantu mengestimasi spesifikasi dan harga pasar wajar.'}
                {activeMode === 'template' && 'Pilih paket pekerjaan dari template bangunan siap pakai.'}
                {activeMode === 'duplicate' && 'Salin item yang sudah ada dengan ID dan volume yang terisolasi.'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              border: 'none',
              background: 'transparent',
              color: 'var(--ez-color-text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* QUICK METHOD SWITCHER TABS */}
        <div style={{ display: 'flex', background: 'var(--ez-color-surface-tertiary)', borderBottom: '1px solid var(--ez-color-border-line)', padding: '4px 12px', gap: '6px', overflowX: 'auto' }}>
          {[
            { id: 'selector', label: 'Pilih Metode', icon: Layers },
            { id: 'ahsp', label: '📚 Dari AHSP', icon: BookOpen },
            { id: 'manual', label: '✏️ Manual', icon: PenTool },
            { id: 'ai', label: '🤖 Dengan AI', icon: Sparkles },
            { id: 'template', label: '📋 Dari Template', icon: LayoutTemplate },
            { id: 'duplicate', label: '📑 Duplikasi', icon: Copy },
          ].map((tab) => {
            const isActive = activeMode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                data-modal-tab={tab.id}
                onClick={() => {
                  setActiveMode(tab.id as AddItemMode);
                  setSelectedAhspItem(null);
                  setErrorMessage(null);
                }}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  background: isActive ? 'var(--ez-color-surface)' : 'transparent',
                  color: isActive ? 'var(--ez-color-primary)' : 'var(--ez-color-text-muted)',
                  fontSize: '11.5px',
                  fontWeight: isActive ? 750 : 550,
                  boxShadow: isActive ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  whiteSpace: 'nowrap',
                }}
              >
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ERROR NOTIFICATION BANNER */}
        {errorMessage && (
          <div
            style={{
              padding: '8px 16px',
              background: 'var(--ez-hue-red-bg)',
              borderBottom: '1px solid var(--ez-hue-rose-border)',
              color: 'var(--ez-hue-red-text)',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <AlertCircle size={15} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* MODAL BODY */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {/* ===================================================================
              MODE 1: SELECTOR CARDS
             =================================================================== */}
          {activeMode === 'selector' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
              {/* 1. Dari AHSP */}
              <div
                onClick={() => setActiveMode('ahsp')}
                style={{
                  border: '1.5px solid var(--ez-hue-blue-bg-deep)',
                  borderRadius: 'var(--ez-radius-control)',
                  padding: '16px',
                  background: 'var(--ez-color-surface)',
                  cursor: 'pointer',
                  transition: 'all 0.18s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: '0 2px 4px rgba(37, 99, 235, 0.04)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--ez-color-primary)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 16px rgba(37, 99, 235, 0.12)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--ez-hue-blue-bg-deep)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(37, 99, 235, 0.04)';
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '10px',
                        background: 'var(--ez-hue-blue-bg)',
                        border: '1px solid var(--ez-hue-blue-border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '20px',
                      }}
                    >
                      📚
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: 'var(--ez-radius-pill)', background: 'var(--ez-hue-blue-bg-deep)', color: 'var(--ez-hue-blue-text-deep)' }}>
                      PUPR 2026
                    </span>
                  </div>
                  <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: '0 0 6px 0' }}>
                    Dari AHSP
                  </h3>
                  <p style={{ fontSize: '11.5px', color: 'var(--ez-color-text-muted)', lineHeight: '1.45', margin: 0 }}>
                    Gunakan pekerjaan dari database AHSP resmi yang tersedia lengkap dengan koefisien baku.
                  </p>
                </div>
                <div style={{ marginTop: '16px', fontSize: '12px', fontWeight: 750, color: 'var(--ez-color-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>Pilih AHSP</span>
                  <span>→</span>
                </div>
              </div>

              {/* 2. Manual */}
              <div
                onClick={() => setActiveMode('manual')}
                style={{
                  border: '1.5px solid #D1FAE5',
                  borderRadius: 'var(--ez-radius-control)',
                  padding: '16px',
                  background: 'var(--ez-color-surface)',
                  cursor: 'pointer',
                  transition: 'all 0.18s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: '0 2px 4px rgba(16, 185, 129, 0.04)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#10B981';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 16px rgba(16, 185, 129, 0.12)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#D1FAE5';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(16, 185, 129, 0.04)';
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '10px',
                        background: 'var(--ez-hue-emerald-bg)',
                        border: '1px solid var(--ez-hue-green-border-deep)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '20px',
                      }}
                    >
                      ✏️
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: 'var(--ez-radius-pill)', background: '#D1FAE5', color: 'var(--ez-hue-green-text-deep)' }}>
                      Fleksibel
                    </span>
                  </div>
                  <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: '0 0 6px 0' }}>
                    Manual
                  </h3>
                  <p style={{ fontSize: '11.5px', color: 'var(--ez-color-text-muted)', lineHeight: '1.45', margin: 0 }}>
                    Buat pekerjaan sendiri dengan mengisi uraian, volume, satuan, dan harga satuan secara mandiri.
                  </p>
                </div>
                <div style={{ marginTop: '16px', fontSize: '12px', fontWeight: 750, color: 'var(--ez-hue-green-text)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>Buat Manual</span>
                  <span>→</span>
                </div>
              </div>

              {/* 3. Dengan AI */}
              <div
                onClick={() => setActiveMode('ai')}
                style={{
                  border: '1.5px solid var(--ez-hue-indigo-bg)',
                  borderRadius: 'var(--ez-radius-control)',
                  padding: '16px',
                  background: 'var(--ez-color-surface)',
                  cursor: 'pointer',
                  transition: 'all 0.18s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: '0 2px 4px rgba(99, 102, 241, 0.04)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#6366F1';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 16px rgba(99, 102, 241, 0.14)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--ez-hue-indigo-bg)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(99, 102, 241, 0.04)';
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '10px',
                        background: 'linear-gradient(135deg, var(--ez-hue-indigo-bg-soft) 0%, var(--ez-hue-indigo-bg) 100%)',
                        border: '1px solid #C7D2FE',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '20px',
                      }}
                    >
                      🤖
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: 'var(--ez-radius-pill)', background: 'var(--ez-hue-indigo-bg)', color: '#3730A3' }}>
                      Magic AI
                    </span>
                  </div>
                  <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: '0 0 6px 0' }}>
                    Dengan AI
                  </h3>
                  <p style={{ fontSize: '11.5px', color: 'var(--ez-color-text-muted)', lineHeight: '1.45', margin: 0 }}>
                    Jelaskan pekerjaan dalam bahasa natural dan EZRAB membantu menyusun rincian estimasinya.
                  </p>
                </div>
                <div style={{ marginTop: '16px', fontSize: '12px', fontWeight: 750, color: 'var(--ez-hue-indigo-text)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>Gunakan AI</span>
                  <span>→</span>
                </div>
              </div>

              {/* 4. Dari Template */}
              <div
                onClick={() => setActiveMode('template')}
                style={{
                  border: '1.5px solid var(--ez-hue-amber-bg-deep)',
                  borderRadius: 'var(--ez-radius-control)',
                  padding: '16px',
                  background: 'var(--ez-color-surface)',
                  cursor: 'pointer',
                  transition: 'all 0.18s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: '0 2px 4px rgba(245, 158, 11, 0.04)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#F59E0B';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 16px rgba(245, 158, 11, 0.12)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--ez-hue-amber-bg-deep)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(245, 158, 11, 0.04)';
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '10px',
                        background: 'var(--ez-hue-amber-bg)',
                        border: '1px solid var(--ez-hue-amber-border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '20px',
                      }}
                    >
                      📋
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: 'var(--ez-radius-pill)', background: 'var(--ez-hue-amber-bg-deep)', color: 'var(--ez-hue-amber-text-dark)' }}>
                      Paket WBS
                    </span>
                  </div>
                  <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: '0 0 6px 0' }}>
                    Dari Template
                  </h3>
                  <p style={{ fontSize: '11.5px', color: 'var(--ez-color-text-muted)', lineHeight: '1.45', margin: 0 }}>
                    Gunakan paket pekerjaan dari template bangunan (Rumah, Ruko, Gudang, Masjid, Kantor).
                  </p>
                </div>
                <div style={{ marginTop: '16px', fontSize: '12px', fontWeight: 750, color: 'var(--ez-hue-amber-text-deep)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>Pilih Template</span>
                  <span>→</span>
                </div>
              </div>

              {/* 5. Duplikasi */}
              <div
                onClick={() => setActiveMode('duplicate')}
                style={{
                  border: '1.5px solid #CFFAFE',
                  borderRadius: 'var(--ez-radius-control)',
                  padding: '16px',
                  background: 'var(--ez-color-surface)',
                  cursor: 'pointer',
                  transition: 'all 0.18s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: '0 2px 4px rgba(6, 182, 212, 0.04)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#06B6D4';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 16px rgba(6, 182, 212, 0.12)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#CFFAFE';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(6, 182, 212, 0.04)';
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '10px',
                        background: '#ECFEFF',
                        border: '1px solid #A5F3FC',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '20px',
                      }}
                    >
                      📑
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: 'var(--ez-radius-pill)', background: '#CFFAFE', color: '#155E75' }}>
                      Cepat
                    </span>
                  </div>
                  <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: '0 0 6px 0' }}>
                    Duplikasi
                  </h3>
                  <p style={{ fontSize: '11.5px', color: 'var(--ez-color-text-muted)', lineHeight: '1.45', margin: 0 }}>
                    Salin pekerjaan yang sudah ada dalam proyek ini dengan penyesuaian nama dan volume.
                  </p>
                </div>
                <div style={{ marginTop: '16px', fontSize: '12px', fontWeight: 750, color: '#0891B2', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>Duplikasi</span>
                  <span>→</span>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================
              MODE 2: AHSP PICKER & REFINEMENT
             =================================================================== */}
          {activeMode === 'ahsp' && !selectedAhspItem && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ez-color-text-slate)', display: 'block', marginBottom: '4px' }}>
                    Tujuan Kelompok WBS:
                  </label>
                  <select
                    value={targetCategory}
                    onChange={(e) => setTargetCategory(e.target.value)}
                    style={{ width: '100%', height: '34px', padding: '0 10px', borderRadius: '6px', border: '1.5px solid #2563EB', fontSize: '12px', fontWeight: 650, color: 'var(--ez-hue-blue-text-deep)', background: 'var(--ez-hue-blue-bg)' }}
                  >
                    {WORK_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ez-color-text-slate)', display: 'block', marginBottom: '4px' }}>
                    Kategori AHSP:
                  </label>
                  <select
                    value={ahspCategoryFilter}
                    onChange={(e) => setAhspCategoryFilter(e.target.value)}
                    style={{ width: '100%', height: '34px', padding: '0 10px', borderRadius: '6px', border: '1px solid var(--ez-hue-slate-border)', fontSize: '12px' }}
                  >
                    <option value="ALL">Semua Kategori AHSP ({activeAhspItems.length} item)</option>
                    {availableAhspCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ez-color-text-slate)', display: 'block', marginBottom: '4px' }}>
                    Cari Kode / Uraian / Keyword:
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '10px' }} />
                    <input
                      type="text"
                      placeholder="Contoh: pasangan bata, beton k-250..."
                      value={ahspSearch}
                      onChange={(e) => setAhspSearch(e.target.value)}
                      style={{ width: '100%', height: '34px', paddingLeft: '32px', borderRadius: '6px', border: '1px solid var(--ez-hue-slate-border)', fontSize: '12px' }}
                    />
                  </div>
                </div>
              </div>

              {/* Table of AHSP Items */}
              <div style={{ border: '1px solid var(--ez-color-border-line)', borderRadius: '8px', maxHeight: '380px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--ez-color-surface-secondary)', borderBottom: '1px solid var(--ez-hue-slate-border)', zIndex: 2 }}>
                    <tr>
                      <th style={{ padding: '8px 8px', width: '36px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={filteredAhsp.length > 0 && bulkSelectedAhspCodes.size === filteredAhsp.length}
                          onChange={() => {
                            if (bulkSelectedAhspCodes.size === filteredAhsp.length) {
                              setBulkSelectedAhspCodes(new Set());
                            } else {
                              setBulkSelectedAhspCodes(new Set(filteredAhsp.map((i) => i.code)));
                            }
                          }}
                          style={{ accentColor: 'var(--ez-color-primary)', cursor: 'pointer' }}
                        />
                      </th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', width: '100px' }}>Kode AHSP</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left' }}>Uraian Pekerjaan</th>
                      <th style={{ padding: '8px 8px', textAlign: 'center', width: '60px' }}>Satuan</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', width: '120px' }}>Harga Satuan</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center', width: '110px' }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedAhsp.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: '36px 16px', textAlign: 'center', color: '#94A3B8' }}>
                          Tidak ada data AHSP yang sesuai dengan kata kunci "{ahspSearch}".
                        </td>
                      </tr>
                    ) : (
                      displayedAhsp.map((item) => {
                        const isBulkChecked = bulkSelectedAhspCodes.has(item.code);
                        return (
                          <tr
                            key={item.id}
                            style={{
                              borderBottom: '1px solid var(--ez-color-surface-tertiary)',
                              background: isBulkChecked ? 'var(--ez-hue-blue-bg)' : 'var(--ez-color-surface)',
                            }}
                          >
                            <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={isBulkChecked}
                                onChange={() => {
                                  setBulkSelectedAhspCodes((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(item.code)) next.delete(item.code);
                                    else next.add(item.code);
                                    return next;
                                  });
                                }}
                                style={{ accentColor: 'var(--ez-color-primary)', cursor: 'pointer' }}
                              />
                            </td>
                            <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--ez-color-primary)' }}>
                              {item.code}
                            </td>
                            <td style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--ez-color-text-strong)' }}>{item.name}</td>
                            <td style={{ padding: '8px 8px', textAlign: 'center', color: 'var(--ez-color-text-muted)' }}>{item.unit}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--ez-color-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                              {(() => {
                                const up = priceResolver2026.resolveAhspUnitPrice(item).unitPrice;
                                return up !== null && up > 0 ? formatCurrencyIDR(up) : '—';
                              })()}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                              <button
                                onClick={() => handleSelectAhspForRefinement(item)}
                                style={{
                                  height: '28px',
                                  padding: '0 12px',
                                  borderRadius: '5px',
                                  background: 'var(--ez-color-primary)',
                                  border: 'none',
                                  color: '#FFFFFF',
                                  fontSize: '11px',
                                  fontWeight: 750,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                <span>Pilih</span>
                                <span>→</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
                {filteredAhsp.length > 100 && (
                  <div style={{ padding: '8px 12px', background: 'var(--ez-color-surface-secondary)', color: 'var(--ez-color-text-muted)', fontSize: '11px', textAlign: 'center', borderTop: '1px solid var(--ez-color-border-line)' }}>
                    Menampilkan 100 dari {filteredAhsp.length} data analisa AHSP. Gunakan kolom pencarian di atas untuk menyaring lebih spesifik.
                  </div>
                )}
              </div>

              {bulkSelectedAhspCodes.size > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--ez-hue-blue-bg)', border: '1px solid var(--ez-hue-blue-border)', padding: '10px 16px', borderRadius: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ez-hue-blue-text-deep)' }}>
                    {bulkSelectedAhspCodes.size} pekerjaan AHSP dipilih untuk kelompok "{targetCategory}"
                  </span>
                  <button
                    onClick={handleBulkAddAhsp}
                    disabled={isSubmitting}
                    style={{
                      height: '34px',
                      padding: '0 18px',
                      borderRadius: '6px',
                      background: 'var(--ez-color-primary)',
                      color: '#FFFFFF',
                      border: 'none',
                      fontSize: '12px',
                      fontWeight: 750,
                      cursor: isSubmitting ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    <span>{isSubmitting ? 'Menambahkan...' : `Tambahkan ${bulkSelectedAhspCodes.size} Pekerjaan`}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* AHSP REFINEMENT VIEW */}
          {activeMode === 'ahsp' && selectedAhspItem && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '640px', margin: '0 auto' }}>
              <div style={{ background: 'var(--ez-color-surface-secondary)', borderRadius: '10px', border: '1px solid var(--ez-color-border-line)', padding: '16px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Pekerjaan AHSP Terpilih:
                </div>
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: '0 0 10px 0' }}>
                  {selectedAhspItem.name}
                </h3>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '12px' }}>
                  <div>
                    <span style={{ color: 'var(--ez-color-text-muted)' }}>Kode AHSP: </span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--ez-color-primary)' }}>{selectedAhspItem.code}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--ez-color-text-muted)' }}>Satuan: </span>
                    <span style={{ fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>{selectedAhspItem.unit}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--ez-color-text-muted)' }}>Sumber: </span>
                    <span style={{ fontWeight: 700, color: 'var(--ez-hue-green-text)' }}>AHSP 2024 / PUPR</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--ez-color-text-slate)', display: 'block', marginBottom: '4px' }}>
                    WBS Tujuan: <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <select
                    value={targetCategory}
                    onChange={(e) => setTargetCategory(e.target.value)}
                    style={{ width: '100%', height: '36px', padding: '0 10px', borderRadius: '6px', border: '1px solid var(--ez-hue-slate-border)', fontSize: '12.5px', fontWeight: 600 }}
                  >
                    {WORK_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--ez-color-text-slate)', display: 'block', marginBottom: '4px' }}>
                    Volume ({selectedAhspItem.unit}): <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    value={ahspCustomVolume}
                    onChange={(e) => setAhspCustomVolume(parseFloat(e.target.value) || 0)}
                    style={{ width: '100%', height: '36px', padding: '0 10px', borderRadius: '6px', border: '1px solid var(--ez-hue-slate-border)', fontSize: '13px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--ez-color-text-slate)', display: 'block', marginBottom: '4px' }}>
                  Harga Satuan (Otomatis dari Price Engine AHSP):
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="number"
                    value={ahspCustomPrice}
                    onChange={(e) => setAhspCustomPrice(parseFloat(e.target.value) || 0)}
                    style={{ width: '100%', height: '36px', padding: '0 10px', borderRadius: '6px', border: '1px solid var(--ez-hue-slate-border)', fontSize: '13px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
                  />
                </div>
              </div>

              {/* Live Subtotal Card */}
              <div style={{ background: 'var(--ez-hue-blue-bg)', borderRadius: '8px', border: '1px solid var(--ez-hue-blue-border)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--ez-hue-blue-text-deep)', display: 'block' }}>Total Biaya Pekerjaan:</span>
                  <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ez-color-primary-hover)', fontVariantNumeric: 'tabular-nums' }}>
                    {formatCurrencyIDR(Math.round(ahspCustomVolume * ahspCustomPrice))}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setSelectedAhspItem(null)}
                    style={{
                      height: '36px',
                      padding: '0 14px',
                      borderRadius: '6px',
                      border: '1px solid var(--ez-hue-slate-border)',
                      background: 'var(--ez-color-surface)',
                      color: 'var(--ez-color-text-slate)',
                      fontSize: '12px',
                      fontWeight: 650,
                      cursor: 'pointer',
                    }}
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleSaveSingleAhsp}
                    disabled={isSubmitting || ahspCustomVolume <= 0}
                    style={{
                      height: '36px',
                      padding: '0 18px',
                      borderRadius: '6px',
                      background: 'var(--ez-color-primary)',
                      color: '#FFFFFF',
                      border: 'none',
                      fontSize: '12.5px',
                      fontWeight: 750,
                      cursor: isSubmitting || ahspCustomVolume <= 0 ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    <span>{isSubmitting ? 'Menambahkan...' : 'Tambahkan ke RAB'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================
              MODE 3: MANUAL INPUT WORKFLOW
             =================================================================== */}
          {activeMode === 'manual' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '720px', margin: '0 auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--ez-color-text-slate)', display: 'block', marginBottom: '4px' }}>
                    Kelompok WBS: <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <select
                    value={targetCategory}
                    onChange={(e) => setTargetCategory(e.target.value)}
                    style={{ width: '100%', height: '36px', padding: '0 10px', borderRadius: '6px', border: '1px solid var(--ez-hue-slate-border)', fontSize: '12.5px', fontWeight: 600 }}
                  >
                    {WORK_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--ez-color-text-slate)', display: 'block', marginBottom: '4px' }}>
                    Kode Pekerjaan (Opsional):
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: A.1.1 atau KST.01"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    style={{ width: '100%', height: '36px', padding: '0 10px', borderRadius: '6px', border: '1px solid var(--ez-hue-slate-border)', fontSize: '12.5px' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--ez-color-text-slate)', display: 'block', marginBottom: '4px' }}>
                  Uraian Pekerjaan: <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="Misal: Pembuatan Saluran U-Ditch 30x30 cm + Tutup Heavy Duty"
                  value={manualDescription}
                  onChange={(e) => setManualDescription(e.target.value)}
                  style={{ width: '100%', height: '36px', padding: '0 12px', borderRadius: '6px', border: '1px solid var(--ez-hue-slate-border)', fontSize: '12.5px', fontWeight: 600 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.5fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--ez-color-text-slate)', display: 'block', marginBottom: '4px' }}>
                    Volume: <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    value={manualVolume}
                    onChange={(e) => setManualVolume(parseFloat(e.target.value) || 0)}
                    style={{ width: '100%', height: '36px', padding: '0 10px', borderRadius: '6px', border: '1px solid var(--ez-hue-slate-border)', fontSize: '12.5px', fontVariantNumeric: 'tabular-nums' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--ez-color-text-slate)', display: 'block', marginBottom: '4px' }}>
                    Satuan: <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="m¹, m², m³, kg"
                    value={manualUnit}
                    onChange={(e) => setManualUnit(e.target.value)}
                    style={{ width: '100%', height: '36px', padding: '0 10px', borderRadius: '6px', border: '1px solid var(--ez-hue-slate-border)', fontSize: '12.5px' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--ez-color-text-slate)', display: 'block', marginBottom: '4px' }}>
                    Harga Satuan (Rp):
                  </label>
                  <input
                    type="number"
                    placeholder="0"
value={manualUnitPriceRaw}
                    onChange={(e) => setManualUnitPriceRaw(e.target.value)}
                    style={{ width: '100%', height: '36px', padding: '0 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12.5px', fontVariantNumeric: 'tabular-nums' }}
                  />
                </div>
              </div>

              {/* Quick Unit Pills */}
              <div>
                <span style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)', marginRight: '6px' }}>Pilihan Cepat Satuan:</span>
                <div style={{ display: 'inline-flex', gap: '5px', flexWrap: 'wrap' }}>
                  {COMMON_UNITS.map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setManualUnit(u)}
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: manualUnit === u ? 700 : 500,
                        background: manualUnit === u ? 'var(--ez-hue-blue-bg)' : 'var(--ez-color-surface-tertiary)',
                        color: manualUnit === u ? 'var(--ez-color-primary)' : 'var(--ez-color-text-slate)',
                        border: manualUnit === u ? '1px solid var(--ez-hue-blue-border)' : '1px solid var(--ez-color-border-line)',
                        cursor: 'pointer',
                      }}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--ez-color-text-slate)', display: 'block', marginBottom: '4px' }}>
                  Catatan Spesifikasi (Opsional):
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Menggunakan semen MU-400 dan pasir pasang ayak"
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  style={{ width: '100%', height: '36px', padding: '0 10px', borderRadius: '6px', border: '1px solid var(--ez-hue-slate-border)', fontSize: '12px' }}
                />
              </div>

              {/* Live Calculation Preview Card */}
              <div
                style={{
                  background: 'var(--ez-color-surface-secondary)',
                  borderRadius: '10px',
                  border: '1px solid var(--ez-color-border-line)',
                  padding: '12px 16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
<div style={{ fontSize: '11px', color: '#64748B' }}>Total Nilai Pekerjaan:</div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                    {Number.isFinite(manualUnitPrice)
                      ? formatCurrencyIDR(Math.round(manualVolume * manualUnitPrice))
                      : 'Belum diisi'}
                  </div>
                </div>
                <button
                  onClick={handleSaveManual}
                  disabled={isSubmitting || !manualDescription.trim() || manualVolume <= 0}
                  style={{
                    height: '38px',
                    padding: '0 20px',
                    borderRadius: '8px',
                    background: manualDescription.trim() && manualVolume > 0 ? 'var(--ez-color-primary)' : '#94A3B8',
                    color: '#FFFFFF',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: 750,
                    cursor: manualDescription.trim() && manualVolume > 0 && !isSubmitting ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                  <span>{isSubmitting ? 'Menambahkan...' : 'Simpan ke RAB'}</span>
                </button>
              </div>
            </div>
          )}

          {/* ===================================================================
              MODE 4: AI ADD WORKFLOW
             =================================================================== */}
          {activeMode === 'ai' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '720px', margin: '0 auto' }}>
              <div style={{ background: 'var(--ez-hue-indigo-bg-soft)', border: '1px solid #C7D2FE', borderRadius: '10px', padding: '12px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--ez-hue-indigo-text)', fontWeight: 750, fontSize: '12.5px', marginBottom: '4px' }}>
                  <Sparkles size={16} />
                  <span>Asisten Estimasi AI Konstruksi</span>
                </div>
                <p style={{ fontSize: '11.5px', color: 'var(--ez-hue-indigo-text)', margin: 0, lineHeight: '1.45' }}>
                  Tuliskan pekerjaan yang Anda butuhkan (contoh: <em>"Tambahkan waterproofing kamar mandi 12 m2"</em>). AI akan menyusun estimasi volume, satuan, dan taksiran biaya wajar untuk dikonfirmasi.
                </p>
              </div>

              <div>
                <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--ez-color-text-slate)', display: 'block', marginBottom: '4px' }}>
                  Jelaskan Pekerjaan:
                </label>
                <textarea
                  rows={3}
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Contoh: Tambahkan waterproofing kamar mandi 12 m2 lantai 2..."
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--ez-hue-slate-border)', fontSize: '12.5px', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={handleGenerateAiItem}
                  disabled={aiIsGenerating || !aiPrompt.trim()}
                  style={{
                    height: '36px',
                    padding: '0 16px',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #4338CA 0%, #6366F1 100%)',
                    color: '#FFFFFF',
                    border: 'none',
                    fontSize: '12.5px',
                    fontWeight: 750,
                    cursor: aiIsGenerating || !aiPrompt.trim() ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  {aiIsGenerating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  <span>{aiIsGenerating ? 'Menganalisis Pekerjaan...' : 'Analisis dengan AI'}</span>
                </button>
              </div>

              {/* AI Structured Suggestion Preview Card */}
              {aiGeneratedItem && (
                <div style={{ border: '1.5px solid #818CF8', borderRadius: 'var(--ez-radius-control)', padding: '16px', background: 'var(--ez-color-surface-secondary)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ez-hue-indigo-text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Saran EZRAB AI (Perlu Konfirmasi)
                    </span>
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: 'var(--ez-radius-pill)', background: 'var(--ez-hue-indigo-bg)', color: '#3730A3', fontWeight: 700 }}>
                      {aiGeneratedItem.category}
                    </span>
                  </div>

                  {aiIsEditingPreview ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                      <input
                        type="text"
                        value={aiGeneratedItem.description}
                        onChange={(e) => setAiGeneratedItem({ ...aiGeneratedItem, description: e.target.value })}
                        style={{ height: '34px', padding: '0 10px', borderRadius: '6px', border: '1px solid var(--ez-hue-slate-border)', fontSize: '12.5px' }}
                      />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                        <input
                          type="number"
                          value={aiGeneratedItem.volume}
                          onChange={(e) => setAiGeneratedItem({ ...aiGeneratedItem, volume: parseFloat(e.target.value) || 0 })}
                          style={{ height: '34px', padding: '0 10px', borderRadius: '6px', border: '1px solid var(--ez-hue-slate-border)', fontSize: '12px' }}
                        />
                        <input
                          type="text"
                          value={aiGeneratedItem.unit}
                          onChange={(e) => setAiGeneratedItem({ ...aiGeneratedItem, unit: e.target.value })}
                          style={{ height: '34px', padding: '0 10px', borderRadius: '6px', border: '1px solid var(--ez-hue-slate-border)', fontSize: '12px' }}
                        />
                        <input
                          type="number"
                          value={aiGeneratedItem.unitPrice}
                          onChange={(e) => setAiGeneratedItem({ ...aiGeneratedItem, unitPrice: parseFloat(e.target.value) || 0 })}
                          style={{ height: '34px', padding: '0 10px', borderRadius: '6px', border: '1px solid var(--ez-hue-slate-border)', fontSize: '12px' }}
                        />
                      </div>
                      <button
                        onClick={() => setAiIsEditingPreview(false)}
                        style={{ height: '30px', padding: '0 10px', borderRadius: '6px', border: '1px solid var(--ez-hue-slate-border)', background: 'var(--ez-color-surface)', fontSize: '11.5px', fontWeight: 650, cursor: 'pointer', alignSelf: 'flex-start' }}
                      >
                        Selesai Edit
                      </button>
                    </div>
                  ) : (
                    <>
                      <h4 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: '0 0 6px 0' }}>
                        {aiGeneratedItem.description}
                      </h4>
                      <p style={{ fontSize: '11.5px', color: 'var(--ez-color-text-muted)', margin: '0 0 12px 0', lineHeight: '1.4' }}>
                        {aiGeneratedItem.notes}
                      </p>
                    </>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', background: 'var(--ez-color-surface)', padding: '10px', borderRadius: '8px', border: '1px solid var(--ez-color-border-line)', marginBottom: '12px' }}>
                    <div>
                      <div style={{ fontSize: '10.5px', color: 'var(--ez-color-text-muted)' }}>Volume</div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>
                        {aiGeneratedItem.volume} {aiGeneratedItem.unit}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10.5px', color: 'var(--ez-color-text-muted)' }}>Harga Satuan (Ref)</div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>
                        {formatCurrencyIDR(aiGeneratedItem.unitPrice)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10.5px', color: 'var(--ez-color-text-muted)' }}>Total Biaya</div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ez-color-primary)' }}>
                        {formatCurrencyIDR(aiGeneratedItem.volume * aiGeneratedItem.unitPrice)}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button
                      onClick={() => setAiIsEditingPreview((prev) => !prev)}
                      style={{
                        height: '34px',
                        padding: '0 14px',
                        borderRadius: '6px',
                        border: '1px solid var(--ez-hue-slate-border)',
                        background: 'var(--ez-color-surface)',
                        color: 'var(--ez-color-text-slate)',
                        fontSize: '12px',
                        fontWeight: 650,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Edit3 size={13} />
                      <span>{aiIsEditingPreview ? 'Tutup Edit' : 'Edit'}</span>
                    </button>
                    <button
                      onClick={handleSaveAiItem}
                      disabled={isSubmitting}
                      style={{
                        height: '34px',
                        padding: '0 18px',
                        borderRadius: '6px',
                        background: 'var(--ez-color-primary)',
                        color: '#FFFFFF',
                        border: 'none',
                        fontSize: '12px',
                        fontWeight: 750,
                        cursor: isSubmitting ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                      <span>{isSubmitting ? 'Menambahkan...' : 'Tambahkan'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===================================================================
              MODE 5: TEMPLATE WORKFLOW
             =================================================================== */}
          {activeMode === 'template' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--ez-color-text-slate)' }}>
                  Pilih Template Bangunan:
                </label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => {
                    setSelectedTemplateId(e.target.value);
                    setSelectedTemplateItemIds(new Set());
                  }}
                  style={{ height: '34px', padding: '0 12px', borderRadius: '6px', border: '1px solid var(--ez-hue-slate-border)', fontSize: '12.5px', fontWeight: 650, flex: 1, minWidth: '220px' }}
                >
                  {allTemplates.map((t: MasterBuildingTemplate) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.category})
                    </option>
                  ))}
                </select>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    onClick={() => {
                      if (!currentTemplate?.workItems) return;
                      if (selectedTemplateItemIds.size === currentTemplate.workItems.length) {
                        setSelectedTemplateItemIds(new Set());
                      } else {
                        setSelectedTemplateItemIds(new Set(currentTemplate.workItems.map((w: TemplateWorkItem) => w.stableId)));
                      }
                    }}
                    style={{
                      height: '32px',
                      padding: '0 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--ez-hue-slate-border)',
                      background: 'var(--ez-color-surface)',
                      fontSize: '11px',
                      fontWeight: 650,
                      color: 'var(--ez-color-text-slate)',
                      cursor: 'pointer',
                    }}
                  >
                    {selectedTemplateItemIds.size === (currentTemplate?.workItems?.length || 0)
                      ? 'Batalkan Semua'
                      : 'Pilih Semua'}
                  </button>
                </div>
              </div>

              {/* Template Items List */}
              <div style={{ border: '1px solid var(--ez-color-border-line)', borderRadius: '8px', maxHeight: '360px', overflowY: 'auto' }}>
                {(!currentTemplate?.workItems || currentTemplate.workItems.length === 0) ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#94A3B8', fontSize: '12px' }}>
                    Tidak ada rincian item dalam template ini.
                  </div>
                ) : (
                  currentTemplate.workItems.map((item: TemplateWorkItem, idx: number) => {
                    const isChecked = selectedTemplateItemIds.has(item.stableId);
                    const estPrice = item.ahspCandidates?.[0]?.unitPriceEstimate ?? null;
                    return (
                      <div
                        key={item.stableId + idx}
                        onClick={() => {
                          setSelectedTemplateItemIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(item.stableId)) next.delete(item.stableId);
                            else next.add(item.stableId);
                            return next;
                          });
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '8px 12px',
                          cursor: 'pointer',
                          background: isChecked ? 'var(--ez-hue-blue-bg)' : 'var(--ez-color-surface)',
                          borderBottom: '1px solid var(--ez-color-surface-tertiary)',
                          fontSize: '12px',
                          gap: '10px',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          style={{ accentColor: 'var(--ez-color-primary)', cursor: 'pointer' }}
                        />
                        <div style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--ez-color-primary)', width: '90px' }}>
                          {item.wbsCode || 'WBS.' + (idx + 1)}
                        </div>
<div style={{ flex: 1, fontWeight: 550, color: '#334155' }}>{item.name}</div>
                        <div style={{ color: '#64748B', width: '70px' }}>1 {item.unit}</div>
                        <div style={{ fontWeight: 700, color: '#0F172A', width: '110px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {estPrice == null ? 'Belum ada harga' : formatCurrencyIDR(estPrice)}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)' }}>
                  {selectedTemplateItemIds.size} pekerjaan dipilih
                </span>
                <button
                  onClick={handleSaveTemplateItems}
                  disabled={isSubmitting || selectedTemplateItemIds.size === 0}
                  style={{
                    height: '36px',
                    padding: '0 18px',
                    borderRadius: '8px',
                    background: selectedTemplateItemIds.size > 0 ? 'var(--ez-color-primary)' : '#94A3B8',
                    color: '#FFFFFF',
                    border: 'none',
                    fontSize: '12.5px',
                    fontWeight: 750,
                    cursor: selectedTemplateItemIds.size > 0 && !isSubmitting ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  <span>
                    {isSubmitting
                      ? 'Menambahkan...'
                      : `Tambahkan ${selectedTemplateItemIds.size} Pekerjaan`}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* ===================================================================
              MODE 6: DUPLICATE WORKFLOW
             =================================================================== */}
          {activeMode === 'duplicate' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--ez-color-text-slate)', display: 'block', marginBottom: '4px' }}>
                  Cari Pekerjaan Eksisting dalam Proyek:
                </label>
                <div style={{ position: 'relative' }}>
                  <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '10px' }} />
                  <input
                    type="text"
                    placeholder="Ketik uraian atau kode pekerjaan..."
                    value={duplicateSearch}
                    onChange={(e) => setDuplicateSearch(e.target.value)}
                    style={{ width: '100%', height: '34px', paddingLeft: '32px', borderRadius: '6px', border: '1px solid var(--ez-hue-slate-border)', fontSize: '12px' }}
                  />
                </div>
              </div>

              {/* Existing Items Selector */}
              <div style={{ border: '1px solid var(--ez-color-border-line)', borderRadius: '8px', maxHeight: '240px', overflowY: 'auto' }}>
                {existingItems.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#94A3B8', fontSize: '12px' }}>
                    Belum ada item pekerjaan dalam proyek ini untuk diduplikasi.
                  </div>
                ) : (
                  existingItems
                    .filter((it) => !duplicateSearch || (it.description || '').toLowerCase().includes(duplicateSearch.toLowerCase()))
                    .map((it) => {
                      const isSelected = selectedDuplicateItem?.id === it.id;
                      return (
                        <div
                          key={it.id}
                          onClick={() => handleSelectDuplicateItem(it)}
                          style={{
                            padding: '8px 12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            cursor: 'pointer',
                            background: isSelected ? 'var(--ez-hue-blue-bg)' : 'var(--ez-color-surface)',
                            borderBottom: '1px solid var(--ez-color-surface-tertiary)',
                          }}
                        >
                          <input
                            type="radio"
                            name="dupSelect"
                            checked={isSelected}
                            onChange={() => {}}
                            style={{ accentColor: 'var(--ez-color-primary)', cursor: 'pointer' }}
                          />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '12px', fontWeight: 650, color: 'var(--ez-color-text-primary)' }}>{it.description}</div>
                            <div style={{ fontSize: '10.5px', color: 'var(--ez-color-text-muted)' }}>{it.sectionName || it.category}</div>
                          </div>
                          <div style={{ fontSize: '11.5px', color: 'var(--ez-color-text-muted)' }}>{it.volume} {it.unit}</div>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ez-color-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                            {formatCurrencyIDR(it.unitPrice)}
                          </div>
                        </div>
                      );
                    })
                )}
              </div>

              {/* Duplicate Edit Form */}
              {selectedDuplicateItem && (
                <div style={{ background: 'var(--ez-color-surface-secondary)', borderRadius: '10px', padding: '14px', border: '1px solid var(--ez-color-border-line)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 750, color: 'var(--ez-color-text-primary)', margin: 0 }}>
                    Rincian Pekerjaan Duplikasi Baru:
                  </h4>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ez-color-text-muted)', display: 'block', marginBottom: '2px' }}>
                      Pekerjaan Baru:
                    </label>
                    <input
                      type="text"
                      value={duplicateNewDescription}
                      onChange={(e) => setDuplicateNewDescription(e.target.value)}
                      style={{ width: '100%', height: '34px', padding: '0 10px', borderRadius: '6px', border: '1px solid var(--ez-hue-slate-border)', fontSize: '12.5px', fontWeight: 600 }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ez-color-text-muted)', display: 'block', marginBottom: '2px' }}>
                        WBS Tujuan:
                      </label>
                      <select
                        value={duplicateNewCategory}
                        onChange={(e) => setDuplicateNewCategory(e.target.value)}
                        style={{ width: '100%', height: '34px', padding: '0 10px', borderRadius: '6px', border: '1px solid var(--ez-hue-slate-border)', fontSize: '12px' }}
                      >
                        {WORK_CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ez-color-text-muted)', display: 'block', marginBottom: '2px' }}>
                        Volume ({selectedDuplicateItem.unit}):
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0.01"
                        value={duplicateNewVolume}
                        onChange={(e) => setDuplicateNewVolume(parseFloat(e.target.value) || 0)}
                        style={{ width: '100%', height: '34px', padding: '0 10px', borderRadius: '6px', border: '1px solid var(--ez-hue-slate-border)', fontSize: '12px', fontVariantNumeric: 'tabular-nums' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
<div style={{ fontSize: '12px', color: '#64748B' }}>
                      Total Biaya: <strong style={{ color: '#2563EB' }}>{selectedDuplicateItem.unitPrice != null ? formatCurrencyIDR(Math.round(duplicateNewVolume * selectedDuplicateItem.unitPrice)) : 'Belum ada harga'}</strong>
                    </div>
                    <button
                      onClick={handleSaveDuplicate}
                      disabled={isSubmitting || duplicateNewVolume <= 0 || !duplicateNewDescription.trim()}
                      style={{
                        height: '34px',
                        padding: '0 18px',
                        borderRadius: '6px',
                        background: 'var(--ez-color-primary)',
                        color: '#FFFFFF',
                        border: 'none',
                        fontSize: '12px',
                        fontWeight: 750,
                        cursor: isSubmitting ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                      <span>{isSubmitting ? 'Menambahkan...' : 'Duplikasi Pekerjaan Ini'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
