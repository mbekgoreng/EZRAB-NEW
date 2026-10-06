import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Layers,
  Sparkles,
  Calculator,
  Save,
  RotateCcw,
  Plus,
  Trash2,
  TrendingUp,
  ShieldCheck,
  History,
  FileText,
  Building2,
  Info,
  CheckCircle2,
} from 'lucide-react';
import {
  RabItem,
  WorkItem,
  AHSPComponent,
  AHSPProjectSnapshot,
  WorkItemAuditEntry,
} from '../../types';
import { useProject } from '../../context/ProjectContext';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';
import { SafeDecimalEngine } from '../../engine/safeDecimalEngine';
import { ALL_OFFICIAL_AHSP_ITEMS } from '../../data/nationalCostDatabase/masterRegistry';
import { getPriceDatabase } from '../../data/indonesianPrices';

export interface WorkItemInspectorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  // Accepts either a RabItem or a WorkItem
  rabItem?: RabItem | null;
  workItem?: WorkItem | null;
  onItemUpdated?: (updatedItem: RabItem | WorkItem) => void;
  onAskAiWithContext?: (prompt: string, itemData: any) => void;
}

export const WorkItemInspectorDrawer: React.FC<WorkItemInspectorDrawerProps> = ({
  isOpen,
  onClose,
  rabItem,
  workItem,
  onItemUpdated,
  onAskAiWithContext,
}) => {
  const {
    currentProject,
    projectRabItems,
    updateRabItemFull,
    updateWorkItem,
    createVersionSnapshot,
  } = useProject();

  // Active Tab
  const [activeTab, setActiveTab] = useState<'AHSP' | 'IMPACT' | 'SOURCE' | 'AUDIT'>('AHSP');

  // Baseline Initial Item Information
  const initialData = useMemo(() => {
    if (rabItem) {
      return {
        id: rabItem.id,
        code: rabItem.code || rabItem.ahspCode || 'ITEM-01',
        description: rabItem.description || 'Pekerjaan Konstruksi',
        category: rabItem.category || rabItem.sectionName || '01. PEKERJAAN PERSIAPAN',
        volume: Number(rabItem.volume) || 1,
        unit: rabItem.unit || 'ls',
        unitPrice: Number(rabItem.unitPrice) || 0,
        totalPrice: Number(rabItem.amount) || Number(rabItem.totalPrice) || (Number(rabItem.volume) * Number(rabItem.unitPrice)) || 0,
        source: rabItem.volumeSource || 'MANUAL',
        ahspCode: rabItem.ahspCode || rabItem.code || '',
        ahspSnapshot: rabItem.ahspSnapshot,
        overheadPercent: rabItem.overheadPercent !== undefined ? rabItem.overheadPercent : 5,
        profitPercent: rabItem.profitPercent !== undefined ? rabItem.profitPercent : 10,
        otherComponentsPercent: rabItem.otherComponentsPercent !== undefined ? rabItem.otherComponentsPercent : 0,
        auditTrail: rabItem.auditTrail || [],
        notes: rabItem.notes || '',
      };
    } else if (workItem) {
      return {
        id: workItem.id,
        code: workItem.code || workItem.ahspCode || 'ITEM-01',
        description: workItem.name || workItem.ahspDescription || 'Pekerjaan Konstruksi',
        category: workItem.category || '01. PEKERJAAN PERSIAPAN',
        volume: Number(workItem.volume) || 1,
        unit: workItem.unit || 'ls',
        unitPrice: Number(workItem.unitPrice) || 0,
        totalPrice: Number(workItem.totalAmount) || (Number(workItem.volume) * Number(workItem.unitPrice)) || 0,
        source: workItem.source || 'MANUAL',
        ahspCode: workItem.ahspCode || workItem.code || '',
        ahspSnapshot: workItem.ahspSnapshot,
        overheadPercent: workItem.overheadPercent !== undefined ? workItem.overheadPercent : 5,
        profitPercent: workItem.profitPercent !== undefined ? workItem.profitPercent : 10,
        otherComponentsPercent: workItem.otherComponentsPercent !== undefined ? workItem.otherComponentsPercent : 0,
        auditTrail: workItem.auditTrail || [],
        notes: workItem.notes || '',
      };
    }
    return null;
  }, [rabItem, workItem]);

  // Working State for AHSP Components
  const [materials, setMaterials] = useState<AHSPComponent[]>([]);
  const [labors, setLabors] = useState<AHSPComponent[]>([]);
  const [equipments, setEquipments] = useState<AHSPComponent[]>([]);

  // Working State for Markups
  const [overheadPct, setOverheadPct] = useState<number>(5);
  const [profitPct, setProfitPct] = useState<number>(10);
  const [otherPct, setOtherPct] = useState<number>(0);

  // New Resource Form Input State
  const [newResCategory, setNewResCategory] = useState<'MATERIAL' | 'LABOR' | 'EQUIPMENT'>('MATERIAL');
  const [newResName, setNewResName] = useState('');
  const [newResCoeff, setNewResCoeff] = useState<number>(1);
  const [newResUnit, setNewResUnit] = useState('kg');
  const [newResPrice, setNewResPrice] = useState<number>(0);
  const [showAddResourceRow, setShowAddResourceRow] = useState(false);

  // Success Notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Responsive mobile state
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window !== 'undefined') return window.innerWidth < 768;
    return false;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Initialize or Load AHSP Breakdown
  useEffect(() => {
    if (!initialData) return;

    setOverheadPct(initialData.overheadPercent);
    setProfitPct(initialData.profitPercent);
    setOtherPct(initialData.otherComponentsPercent);

    // 1. If snapshot exists, use it
    if (initialData.ahspSnapshot) {
      setMaterials(initialData.ahspSnapshot.materialComponents || []);
      setLabors(initialData.ahspSnapshot.laborComponents || []);
      setEquipments(initialData.ahspSnapshot.equipmentComponents || []);
      return;
    }

    // 2. Try to find matching AHSP in National Database
    const cleanCode = (initialData.ahspCode || initialData.code || '').trim().toLowerCase();
    const cleanDesc = (initialData.description || '').trim().toLowerCase();

    const matchedNational = ALL_OFFICIAL_AHSP_ITEMS.find((item) => {
      const itemCode = (item.code || '').trim().toLowerCase();
      const itemName = (item.name || '').trim().toLowerCase();
      return (
        (cleanCode && itemCode === cleanCode) ||
        (cleanDesc && itemName.includes(cleanDesc)) ||
        (cleanDesc && cleanDesc.includes(itemName))
      );
    });

    const priceDb = getPriceDatabase();
    const resolvePrice = (name: string, fallback: number) => {
      const match = priceDb.find((p) => p.name.toLowerCase().includes(name.toLowerCase()));
      return match && match.price > 0 ? match.price : fallback;
    };

    if (matchedNational) {
      const mats: AHSPComponent[] = (matchedNational.materialComponents || []).map((c, i) => ({
        id: `mat-${Date.now()}-${i}`,
        code: c.code || `MAT-${i + 1}`,
        name: c.name || 'Bahan',
        unit: c.unit || 'satuan',
        coefficient: c.coefficient || 1,
        unitPrice: resolvePrice(c.name, c.unitPrice || 0),
        total: SafeDecimalEngine.safeMultiply(c.coefficient || 1, resolvePrice(c.name, c.unitPrice || 0), 2),
        resourceType: 'MATERIAL',
      }));

      const labs: AHSPComponent[] = (matchedNational.laborComponents || []).map((c, i) => ({
        id: `lab-${Date.now()}-${i}`,
        code: c.code || `LAB-${i + 1}`,
        name: c.name || 'Tenaga',
        unit: c.unit || 'OH',
        coefficient: c.coefficient || 1,
        unitPrice: resolvePrice(c.name, c.unitPrice || 0),
        total: SafeDecimalEngine.safeMultiply(c.coefficient || 1, resolvePrice(c.name, c.unitPrice || 0), 2),
        resourceType: 'LABOR',
      }));

      const eqps: AHSPComponent[] = (matchedNational.equipmentComponents || []).map((c, i) => ({
        id: `eqp-${Date.now()}-${i}`,
        code: c.code || `EQP-${i + 1}`,
        name: c.name || 'Alat',
        unit: c.unit || 'jam',
        coefficient: c.coefficient || 1,
        unitPrice: resolvePrice(c.name, c.unitPrice || 0),
        total: SafeDecimalEngine.safeMultiply(c.coefficient || 1, resolvePrice(c.name, c.unitPrice || 0), 2),
        resourceType: 'EQUIPMENT',
      }));

      setMaterials(mats);
      setLabors(labs);
      setEquipments(eqps);
    } else {
      // 3. Fallback: Create structured default components based on unitPrice
      const basePrice = initialData.unitPrice > 0 ? initialData.unitPrice : 100000;
      const matPart = Math.round(basePrice * 0.6);
      const labPart = Math.round(basePrice * 0.35);
      const eqpPart = Math.round(basePrice * 0.05);

      setMaterials([
        {
          id: `mat-${Date.now()}-0`,
          code: 'MAT-01',
          name: `Material Utama (${initialData.description})`,
          unit: initialData.unit || 'unit',
          coefficient: 1.0,
          unitPrice: matPart,
          total: matPart,
          resourceType: 'MATERIAL',
        },
      ]);
      setLabors([
        {
          id: `lab-${Date.now()}-0`,
          code: 'LAB-01',
          name: 'Pekerja / Tukang Terampil',
          unit: 'OH',
          coefficient: 1.0,
          unitPrice: labPart,
          total: labPart,
          resourceType: 'LABOR',
        },
      ]);
      if (eqpPart > 0) {
        setEquipments([
          {
            id: `eqp-${Date.now()}-0`,
            code: 'EQP-01',
            name: 'Alat Bantu / Perkakas',
            unit: 'ls',
            coefficient: 1.0,
            unitPrice: eqpPart,
            total: eqpPart,
            resourceType: 'EQUIPMENT',
          },
        ]);
      } else {
        setEquipments([]);
      }
    }
  }, [initialData]);

  // ---------------------------------------------------------------------------
  // CALCULATIONS: Direct Cost, Markups & Final Unit Price
  // ---------------------------------------------------------------------------
  const totalMaterial = useMemo(
    () => materials.reduce((sum, item) => SafeDecimalEngine.safeAdd(sum, item.total, 2), 0),
    [materials]
  );

  const totalLabor = useMemo(
    () => labors.reduce((sum, item) => SafeDecimalEngine.safeAdd(sum, item.total, 2), 0),
    [labors]
  );

  const totalEquipment = useMemo(
    () => equipments.reduce((sum, item) => SafeDecimalEngine.safeAdd(sum, item.total, 2), 0),
    [equipments]
  );

  const directCost = useMemo(
    () => SafeDecimalEngine.safeAdd(SafeDecimalEngine.safeAdd(totalMaterial, totalLabor, 2), totalEquipment, 2),
    [totalMaterial, totalLabor, totalEquipment]
  );

  const overheadNominal = useMemo(
    () => Math.round((directCost * (overheadPct || 0)) / 100),
    [directCost, overheadPct]
  );

  const profitNominal = useMemo(
    () => Math.round((directCost * (profitPct || 0)) / 100),
    [directCost, profitPct]
  );

  const otherNominal = useMemo(
    () => Math.round((directCost * (otherPct || 0)) / 100),
    [directCost, otherPct]
  );

  const calculatedUnitPrice = useMemo(
    () => directCost + overheadNominal + profitNominal + otherNominal,
    [directCost, overheadNominal, profitNominal, otherNominal]
  );

  const calculatedTotalItemPrice = useMemo(
    () => Math.round(calculatedUnitPrice * (initialData?.volume || 1)),
    [calculatedUnitPrice, initialData?.volume]
  );

  // ---------------------------------------------------------------------------
  // LIVE IMPACT & COMPARISON METRICS (BEFORE vs AFTER vs DELTA)
  // ---------------------------------------------------------------------------
  const baselineUnitPrice = initialData?.unitPrice || 0;
  const baselineTotalItemPrice = initialData?.totalPrice || 0;
  const unitPriceDifference = calculatedUnitPrice - baselineUnitPrice;
  const unitPriceDifferencePercent = baselineUnitPrice > 0
    ? ((unitPriceDifference / baselineUnitPrice) * 100).toFixed(2)
    : '0';

  const itemTotalDifference = calculatedTotalItemPrice - baselineTotalItemPrice;

  // Impact on Total RAB
  const currentTotalRab = useMemo(
    () => projectRabItems.reduce((acc, item) => acc + (Number(item.amount) || Number(item.totalPrice) || 0), 0),
    [projectRabItems]
  );
  const newTotalRab = currentTotalRab + itemTotalDifference;

  // ---------------------------------------------------------------------------
  // COMPONENT EDIT HANDLERS
  // ---------------------------------------------------------------------------
  const handleUpdateComponent = (
    category: 'MATERIAL' | 'LABOR' | 'EQUIPMENT',
    index: number,
    field: 'coefficient' | 'unitPrice' | 'name' | 'unit',
    value: any
  ) => {
    const updater = (list: AHSPComponent[]) => {
      const updated = [...list];
      const target = { ...updated[index] };

      if (field === 'coefficient') {
        const coeff = parseFloat(value) || 0;
        target.coefficient = coeff;
        target.total = SafeDecimalEngine.safeMultiply(coeff, target.unitPrice, 2);
      } else if (field === 'unitPrice') {
        const price = parseFloat(value) || 0;
        target.unitPrice = price;
        target.total = SafeDecimalEngine.safeMultiply(target.coefficient, price, 2);
      } else if (field === 'name') {
        target.name = value;
      } else if (field === 'unit') {
        target.unit = value;
      }

      updated[index] = target;
      return updated;
    };

    if (category === 'MATERIAL') setMaterials(updater);
    if (category === 'LABOR') setLabors(updater);
    if (category === 'EQUIPMENT') setEquipments(updater);
  };

  const handleDeleteComponent = (category: 'MATERIAL' | 'LABOR' | 'EQUIPMENT', index: number) => {
    if (category === 'MATERIAL') setMaterials((prev) => prev.filter((_, i) => i !== index));
    if (category === 'LABOR') setLabors((prev) => prev.filter((_, i) => i !== index));
    if (category === 'EQUIPMENT') setEquipments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddResource = () => {
    if (!newResName.trim()) return;

    const newComp: AHSPComponent = {
      id: `custom-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      code: `RES-${Date.now().toString().slice(-4)}`,
      name: newResName.trim(),
      unit: newResUnit.trim() || 'unit',
      coefficient: newResCoeff > 0 ? newResCoeff : 1,
      unitPrice: newResPrice >= 0 ? newResPrice : 0,
      total: SafeDecimalEngine.safeMultiply(newResCoeff > 0 ? newResCoeff : 1, newResPrice >= 0 ? newResPrice : 0, 2),
      resourceType: newResCategory,
    };

    if (newResCategory === 'MATERIAL') setMaterials((prev) => [...prev, newComp]);
    if (newResCategory === 'LABOR') setLabors((prev) => [...prev, newComp]);
    if (newResCategory === 'EQUIPMENT') setEquipments((prev) => [...prev, newComp]);

    // Reset Form
    setNewResName('');
    setNewResCoeff(1);
    setNewResPrice(0);
    setShowAddResourceRow(false);
  };

  // ---------------------------------------------------------------------------
  // SAVE / CANCEL / RESET ACTIONS
  // ---------------------------------------------------------------------------
  const handleResetToStandard = () => {
    if (!initialData) return;
    const cleanCode = (initialData.ahspCode || initialData.code || '').trim().toLowerCase();
    const matchedNational = ALL_OFFICIAL_AHSP_ITEMS.find(
      (item) => (item.code || '').trim().toLowerCase() === cleanCode
    );

    if (matchedNational) {
      setMaterials(
        (matchedNational.materialComponents || []).map((c, i) => ({
          ...c,
          id: `mat-reset-${i}`,
          total: SafeDecimalEngine.safeMultiply(c.coefficient, c.unitPrice || 0, 2),
          resourceType: 'MATERIAL',
        }))
      );
      setLabors(
        (matchedNational.laborComponents || []).map((c, i) => ({
          ...c,
          id: `lab-reset-${i}`,
          total: SafeDecimalEngine.safeMultiply(c.coefficient, c.unitPrice || 0, 2),
          resourceType: 'LABOR',
        }))
      );
      setEquipments(
        (matchedNational.equipmentComponents || []).map((c, i) => ({
          ...c,
          id: `eqp-reset-${i}`,
          total: SafeDecimalEngine.safeMultiply(c.coefficient, c.unitPrice || 0, 2),
          resourceType: 'EQUIPMENT',
        }))
      );
    }
    setOverheadPct(5);
    setProfitPct(10);
    setOtherPct(0);
    setToastMessage('Nilai AHSP telah direset ke baseline standar.');
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleSaveChanges = () => {
    if (!initialData) return;

    const snapshot: AHSPProjectSnapshot = {
      ahspId: initialData.id,
      code: initialData.code,
      name: initialData.description,
      unit: initialData.unit,
      version: '2026.1',
      laborComponents: labors,
      materialComponents: materials,
      equipmentComponents: equipments,
      unitPrice: calculatedUnitPrice,
      sourceDocument: 'Permen PUPR No. 1 2022 / SE DJBK 2026 (Customized)',
      isCustomModified: true,
      snapshotTimestamp: new Date().toISOString(),
    };

    const newAuditEntry: WorkItemAuditEntry = {
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      author: 'Lead Estimator (EZRAB Workspace)',
      action: 'Modifikasi Koefisien & Analisa AHSP',
      previousUnitPrice: baselineUnitPrice,
      newUnitPrice: calculatedUnitPrice,
      previousAmount: baselineTotalItemPrice,
      newAmount: calculatedTotalItemPrice,
      notes: `Direct Cost: ${formatCurrencyIDR(directCost)} | Overhead: ${overheadPct}% | Profit: ${profitPct}%`,
    };

    const updatedAuditTrail = [newAuditEntry, ...(initialData.auditTrail || [])];

    if (rabItem) {
      const updatedRabItem: Partial<RabItem> = {
        unitPrice: calculatedUnitPrice,
        amount: calculatedTotalItemPrice,
        totalPrice: calculatedTotalItemPrice,
        materialPrice: totalMaterial,
        laborPrice: totalLabor,
        equipmentPrice: totalEquipment,
        ahspSnapshot: snapshot,
        overheadPercent: overheadPct,
        profitPercent: profitPct,
        otherComponentsPercent: otherPct,
        auditTrail: updatedAuditTrail,
      };

      updateRabItemFull(rabItem.id, updatedRabItem);
      if (onItemUpdated) {
        onItemUpdated({ ...rabItem, ...updatedRabItem });
      }
    } else if (workItem) {
      const updatedWorkItem: Partial<WorkItem> = {
        unitPrice: calculatedUnitPrice,
        totalAmount: calculatedTotalItemPrice,
        materialPrice: totalMaterial,
        laborPrice: totalLabor,
        equipmentPrice: totalEquipment,
        ahspSnapshot: snapshot,
        overheadPercent: overheadPct,
        profitPercent: profitPct,
        otherComponentsPercent: otherPct,
        auditTrail: updatedAuditTrail,
        updatedAt: new Date().toISOString(),
      };

      updateWorkItem(workItem.id, updatedWorkItem);
      if (onItemUpdated) {
        onItemUpdated({ ...workItem, ...updatedWorkItem });
      }
    }

    createVersionSnapshot(`Update AHSP ${initialData.code} (${initialData.description})`);
    setToastMessage('Analisa AHSP & Harga Satuan berhasil diperbarui!');
    setTimeout(() => {
      setToastMessage(null);
      onClose();
    }, 800);
  };

  if (!isOpen || !initialData) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        justifyContent: isMobile ? 'center' : 'flex-end',
        alignItems: isMobile ? 'flex-end' : 'stretch',
        background: 'rgba(15, 23, 42, 0.5)',
        backdropFilter: 'blur(3px)',
        transition: 'all 0.2s ease-in-out',
      }}
    >
      {/* Sliding Inspector Panel / Bottom Sheet */}
      <div
        className={isMobile ? 'ezrab-bottom-sheet' : ''}
        style={{
          width: isMobile ? '100%' : '740px',
          maxWidth: '100%',
          height: isMobile ? '92vh' : '100%',
          maxHeight: isMobile ? '92vh' : '100%',
          borderTopLeftRadius: isMobile ? '18px' : '0',
          borderTopRightRadius: isMobile ? '18px' : '0',
          background: '#FFFFFF',
          boxShadow: isMobile ? '0 -10px 25px -5px rgba(0,0,0,0.2)' : '-10px 0 25px -5px rgba(0,0,0,0.15)',
          display: 'flex',
          flexDirection: 'column',
          animation: isMobile ? 'slideUpBottom 0.25s cubic-bezier(0.16, 1, 0.3, 1)' : 'slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          overflow: 'hidden',
        }}
      >
        {/* Mobile Swipe Handle Indicator */}
        {isMobile && (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '8px', paddingBottom: '2px', background: '#F8FAFC' }}>
            <div style={{ width: '40px', height: '4px', borderRadius: '999px', background: '#CBD5E1' }} />
          </div>
        )}

        {/* -------------------------------------------------------------------
            1. DRAWER HEADER
           ------------------------------------------------------------------- */}
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid #E2E8F0',
            background: '#F8FAFC',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: '#EFF6FF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#2563EB',
              }}
            >
              <Layers size={18} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    fontWeight: 750,
                    background: '#2563EB',
                    color: '#FFFFFF',
                    padding: '1px 6px',
                    borderRadius: '4px',
                  }}
                >
                  {initialData.code}
                </span>
                <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>
                  {initialData.category}
                </span>
              </div>
              <h2
                style={{
                  fontSize: '15px',
                  fontWeight: 800,
                  color: '#0F172A',
                  margin: '2px 0 0',
                  letterSpacing: '-0.01em',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '480px',
                }}
              >
                {initialData.description}
              </h2>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {onAskAiWithContext && (
              <button
                onClick={() =>
                  onAskAiWithContext(
                    `Audit dan optimasi koefisien AHSP untuk item pekerjaan: ${initialData.code} - ${initialData.description}. Volume ${initialData.volume} ${initialData.unit}.`,
                    { item: initialData, materials, labors, equipments, directCost, calculatedUnitPrice }
                  )
                }
                title="Tanya Magic AI tentang item ini"
                style={{
                  height: '30px',
                  padding: '0 10px',
                  borderRadius: '6px',
                  background: '#F0FDF4',
                  border: '1px solid #BBF7D0',
                  color: '#166534',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  cursor: 'pointer',
                }}
              >
                <Sparkles size={13} color="#16A34A" />
                <span>Ask AI</span>
              </button>
            )}

            <button
              onClick={onClose}
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '6px',
                border: '1px solid #E2E8F0',
                background: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#64748B',
                cursor: 'pointer',
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* -------------------------------------------------------------------
            2. WORK ITEM SUMMARY KEY METRICS
           ------------------------------------------------------------------- */}
        <div
          style={{
            padding: isMobile ? '10px 14px' : '12px 20px',
            background: '#FFFFFF',
            borderBottom: '1px solid #E2E8F0',
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(auto-fit, minmax(130px, 1fr))' : 'repeat(5, 1fr)',
            gap: isMobile ? '8px' : '10px',
            flexShrink: 0,
          }}
        >
          <div style={{ background: '#F8FAFC', padding: '8px 10px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
            <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 650, display: 'block', textTransform: 'uppercase' }}>Volume</span>
            <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
              {initialData.volume.toLocaleString('id-ID')} <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>{initialData.unit}</span>
            </div>
          </div>

          <div style={{ background: '#F8FAFC', padding: '8px 10px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
            <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 650, display: 'block', textTransform: 'uppercase' }}>Harga Satuan (Awal)</span>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#475569', marginTop: '2px' }}>
              {formatCurrencyIDR(baselineUnitPrice)}
            </div>
          </div>

          <div style={{ background: '#EFF6FF', padding: '8px 10px', borderRadius: '6px', border: '1px solid #BFDBFE' }}>
            <span style={{ fontSize: '10px', color: '#1E40AF', fontWeight: 700, display: 'block', textTransform: 'uppercase' }}>Harga Satuan (Hasil)</span>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#1D4ED8', marginTop: '2px' }}>
              {formatCurrencyIDR(calculatedUnitPrice)}
            </div>
          </div>

          <div style={{ background: '#F8FAFC', padding: '8px 10px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
            <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 650, display: 'block', textTransform: 'uppercase' }}>Total Nilai Item</span>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
              {formatCurrencyIDR(calculatedTotalItemPrice)}
            </div>
          </div>

          <div style={{ background: '#F8FAFC', padding: '8px 10px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
            <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 650, display: 'block', textTransform: 'uppercase' }}>Sumber Volume</span>
            <div style={{ marginTop: '2px' }}>
              <span
                style={{
                  fontSize: '9.5px',
                  fontWeight: 750,
                  padding: '2px 5px',
                  borderRadius: '4px',
                  background: initialData.source === 'CALCULATOR' ? '#DCFCE7' : '#F1F5F9',
                  color: initialData.source === 'CALCULATOR' ? '#166534' : '#334155',
                  textTransform: 'uppercase',
                }}
              >
                {initialData.source}
              </span>
            </div>
          </div>
        </div>

        {/* -------------------------------------------------------------------
            3. TAB NAVIGATION
           ------------------------------------------------------------------- */}
        <div
          style={{
            display: 'flex',
            padding: '0 20px',
            borderBottom: '1px solid #E2E8F0',
            background: '#FAFAFA',
            gap: '16px',
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => setActiveTab('AHSP')}
            style={{
              padding: '10px 4px',
              fontSize: '12px',
              fontWeight: activeTab === 'AHSP' ? 750 : 600,
              color: activeTab === 'AHSP' ? '#2563EB' : '#64748B',
              borderBottom: activeTab === 'AHSP' ? '2px solid #2563EB' : '2px solid transparent',
              background: 'transparent',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Calculator size={14} />
            <span>Rincian AHSP & Komponen</span>
          </button>

          <button
            onClick={() => setActiveTab('IMPACT')}
            style={{
              padding: '10px 4px',
              fontSize: '12px',
              fontWeight: activeTab === 'IMPACT' ? 750 : 600,
              color: activeTab === 'IMPACT' ? '#2563EB' : '#64748B',
              borderBottom: activeTab === 'IMPACT' ? '2px solid #2563EB' : '2px solid transparent',
              background: 'transparent',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <TrendingUp size={14} />
            <span>Dampak Biaya (Before / After)</span>
            {unitPriceDifference !== 0 && (
              <span
                style={{
                  fontSize: '9.5px',
                  fontWeight: 800,
                  padding: '1px 5px',
                  borderRadius: '10px',
                  background: unitPriceDifference > 0 ? '#FEE2E2' : '#DCFCE7',
                  color: unitPriceDifference > 0 ? '#991B1B' : '#166534',
                }}
              >
                {unitPriceDifference > 0 ? `+${unitPriceDifferencePercent}%` : `${unitPriceDifferencePercent}%`}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('SOURCE')}
            style={{
              padding: '10px 4px',
              fontSize: '12px',
              fontWeight: activeTab === 'SOURCE' ? 750 : 600,
              color: activeTab === 'SOURCE' ? '#2563EB' : '#64748B',
              borderBottom: activeTab === 'SOURCE' ? '2px solid #2563EB' : '2px solid transparent',
              background: 'transparent',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <FileText size={14} />
            <span>Sumber Regulasi</span>
          </button>

          <button
            onClick={() => setActiveTab('AUDIT')}
            style={{
              padding: '10px 4px',
              fontSize: '12px',
              fontWeight: activeTab === 'AUDIT' ? 750 : 600,
              color: activeTab === 'AUDIT' ? '#2563EB' : '#64748B',
              borderBottom: activeTab === 'AUDIT' ? '2px solid #2563EB' : '2px solid transparent',
              background: 'transparent',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <History size={14} />
            <span>Audit Trail ({initialData.auditTrail?.length || 0})</span>
          </button>
        </div>

        {/* -------------------------------------------------------------------
            4. TAB CONTENT AREA (SCROLLABLE)
           ------------------------------------------------------------------- */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', background: '#FFFFFF' }}>
          {activeTab === 'AHSP' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* SECTION A: MATERIAL */}
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
                <div
                  style={{
                    background: '#F1F5F9',
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid #CBD5E1',
                  }}
                >
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ background: '#2563EB', color: '#FFFFFF', padding: '1px 5px', borderRadius: '3px', fontSize: '10px' }}>A</span>
                    BAHAN / MATERIAL
                  </span>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A' }}>
                    {formatCurrencyIDR(totalMaterial)}
                  </span>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '11px' }}>
                      <th style={{ padding: '6px 10px', textAlign: 'left', width: '38%' }}>Komponen Bahan</th>
                      <th style={{ padding: '6px 8px', textAlign: 'center', width: '16%' }}>Koefisien</th>
                      <th style={{ padding: '6px 8px', textAlign: 'center', width: '12%' }}>Satuan</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', width: '18%' }}>Harga Dasar</th>
                      <th style={{ padding: '6px 10px', textAlign: 'right', width: '16%' }}>Subtotal</th>
                      <th style={{ padding: '6px 6px', textAlign: 'center', width: '6%' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {materials.map((m, idx) => (
                      <tr key={m.id || idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '6px 10px' }}>
                          <input
                            type="text"
                            value={m.name}
                            onChange={(e) => handleUpdateComponent('MATERIAL', idx, 'name', e.target.value)}
                            style={{ width: '100%', border: 'none', background: 'transparent', fontSize: '12px', fontWeight: 600, color: '#0F172A' }}
                          />
                        </td>
                        <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                          <input
                            type="number"
                            step="any"
                            value={m.coefficient}
                            onChange={(e) => handleUpdateComponent('MATERIAL', idx, 'coefficient', e.target.value)}
                            style={{
                              width: '70px',
                              textAlign: 'center',
                              height: '24px',
                              borderRadius: '4px',
                              border: '1px solid #CBD5E1',
                              fontSize: '11.5px',
                              fontWeight: 700,
                              background: '#F8FAFC',
                            }}
                          />
                        </td>
                        <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                          <input
                            type="text"
                            value={m.unit}
                            onChange={(e) => handleUpdateComponent('MATERIAL', idx, 'unit', e.target.value)}
                            style={{
                              width: '45px',
                              textAlign: 'center',
                              height: '24px',
                              borderRadius: '4px',
                              border: '1px solid #CBD5E1',
                              fontSize: '11.5px',
                              color: '#64748B',
                            }}
                          />
                        </td>
                        <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                          <input
                            type="number"
                            value={m.unitPrice}
                            onChange={(e) => handleUpdateComponent('MATERIAL', idx, 'unitPrice', e.target.value)}
                            style={{
                              width: '95px',
                              textAlign: 'right',
                              height: '24px',
                              borderRadius: '4px',
                              border: '1px solid #CBD5E1',
                              fontSize: '11.5px',
                              fontWeight: 650,
                            }}
                          />
                        </td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#0F172A' }}>
                          {formatCurrencyIDR(m.total)}
                        </td>
                        <td style={{ padding: '4px', textAlign: 'center' }}>
                          <button
                            onClick={() => handleDeleteComponent('MATERIAL', idx)}
                            style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: '2px' }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* SECTION B: UPAH / LABOR */}
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
                <div
                  style={{
                    background: '#F1F5F9',
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid #CBD5E1',
                  }}
                >
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ background: '#10B981', color: '#FFFFFF', padding: '1px 5px', borderRadius: '3px', fontSize: '10px' }}>B</span>
                    TENAGA KERJA / UPAH
                  </span>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A' }}>
                    {formatCurrencyIDR(totalLabor)}
                  </span>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '11px' }}>
                      <th style={{ padding: '6px 10px', textAlign: 'left', width: '38%' }}>Jenis Tenaga</th>
                      <th style={{ padding: '6px 8px', textAlign: 'center', width: '16%' }}>Koefisien</th>
                      <th style={{ padding: '6px 8px', textAlign: 'center', width: '12%' }}>Satuan</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', width: '18%' }}>Upah Standar</th>
                      <th style={{ padding: '6px 10px', textAlign: 'right', width: '16%' }}>Subtotal</th>
                      <th style={{ padding: '6px 6px', textAlign: 'center', width: '6%' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {labors.map((l, idx) => (
                      <tr key={l.id || idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '6px 10px' }}>
                          <input
                            type="text"
                            value={l.name}
                            onChange={(e) => handleUpdateComponent('LABOR', idx, 'name', e.target.value)}
                            style={{ width: '100%', border: 'none', background: 'transparent', fontSize: '12px', fontWeight: 600, color: '#0F172A' }}
                          />
                        </td>
                        <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                          <input
                            type="number"
                            step="any"
                            value={l.coefficient}
                            onChange={(e) => handleUpdateComponent('LABOR', idx, 'coefficient', e.target.value)}
                            style={{
                              width: '70px',
                              textAlign: 'center',
                              height: '24px',
                              borderRadius: '4px',
                              border: '1px solid #CBD5E1',
                              fontSize: '11.5px',
                              fontWeight: 700,
                              background: '#F8FAFC',
                            }}
                          />
                        </td>
                        <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                          <input
                            type="text"
                            value={l.unit}
                            onChange={(e) => handleUpdateComponent('LABOR', idx, 'unit', e.target.value)}
                            style={{
                              width: '45px',
                              textAlign: 'center',
                              height: '24px',
                              borderRadius: '4px',
                              border: '1px solid #CBD5E1',
                              fontSize: '11.5px',
                              color: '#64748B',
                            }}
                          />
                        </td>
                        <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                          <input
                            type="number"
                            value={l.unitPrice}
                            onChange={(e) => handleUpdateComponent('LABOR', idx, 'unitPrice', e.target.value)}
                            style={{
                              width: '95px',
                              textAlign: 'right',
                              height: '24px',
                              borderRadius: '4px',
                              border: '1px solid #CBD5E1',
                              fontSize: '11.5px',
                              fontWeight: 650,
                            }}
                          />
                        </td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#0F172A' }}>
                          {formatCurrencyIDR(l.total)}
                        </td>
                        <td style={{ padding: '4px', textAlign: 'center' }}>
                          <button
                            onClick={() => handleDeleteComponent('LABOR', idx)}
                            style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: '2px' }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* SECTION C: ALAT / EQUIPMENT */}
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
                <div
                  style={{
                    background: '#F1F5F9',
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid #CBD5E1',
                  }}
                >
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ background: '#F59E0B', color: '#FFFFFF', padding: '1px 5px', borderRadius: '3px', fontSize: '10px' }}>C</span>
                    PERALATAN / ALAT
                  </span>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A' }}>
                    {formatCurrencyIDR(totalEquipment)}
                  </span>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '11px' }}>
                      <th style={{ padding: '6px 10px', textAlign: 'left', width: '38%' }}>Nama Alat</th>
                      <th style={{ padding: '6px 8px', textAlign: 'center', width: '16%' }}>Koefisien</th>
                      <th style={{ padding: '6px 8px', textAlign: 'center', width: '12%' }}>Satuan</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', width: '18%' }}>Sewa / Harga</th>
                      <th style={{ padding: '6px 10px', textAlign: 'right', width: '16%' }}>Subtotal</th>
                      <th style={{ padding: '6px 6px', textAlign: 'center', width: '6%' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {equipments.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: '10px', textAlign: 'center', color: '#94A3B8', fontSize: '11.5px' }}>
                          Tidak menggunakan alat berat / mekanis khusus (peralatan standar termasuk dalam upah).
                        </td>
                      </tr>
                    ) : (
                      equipments.map((e, idx) => (
                        <tr key={e.id || idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '6px 10px' }}>
                            <input
                              type="text"
                              value={e.name}
                              onChange={(eVal) => handleUpdateComponent('EQUIPMENT', idx, 'name', eVal.target.value)}
                              style={{ width: '100%', border: 'none', background: 'transparent', fontSize: '12px', fontWeight: 600, color: '#0F172A' }}
                            />
                          </td>
                          <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                            <input
                              type="number"
                              step="any"
                              value={e.coefficient}
                              onChange={(eVal) => handleUpdateComponent('EQUIPMENT', idx, 'coefficient', eVal.target.value)}
                              style={{
                                width: '70px',
                                textAlign: 'center',
                                height: '24px',
                                borderRadius: '4px',
                                border: '1px solid #CBD5E1',
                                fontSize: '11.5px',
                                fontWeight: 700,
                                background: '#F8FAFC',
                              }}
                            />
                          </td>
                          <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                            <input
                              type="text"
                              value={e.unit}
                              onChange={(eVal) => handleUpdateComponent('EQUIPMENT', idx, 'unit', eVal.target.value)}
                              style={{
                                width: '45px',
                                textAlign: 'center',
                                height: '24px',
                                borderRadius: '4px',
                                border: '1px solid #CBD5E1',
                                fontSize: '11.5px',
                                color: '#64748B',
                              }}
                            />
                          </td>
                          <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                            <input
                              type="number"
                              value={e.unitPrice}
                              onChange={(eVal) => handleUpdateComponent('EQUIPMENT', idx, 'unitPrice', eVal.target.value)}
                              style={{
                                width: '95px',
                                textAlign: 'right',
                                height: '24px',
                                borderRadius: '4px',
                                border: '1px solid #CBD5E1',
                                fontSize: '11.5px',
                                fontWeight: 650,
                              }}
                            />
                          </td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#0F172A' }}>
                            {formatCurrencyIDR(e.total)}
                          </td>
                          <td style={{ padding: '4px', textAlign: 'center' }}>
                            <button
                              onClick={() => handleDeleteComponent('EQUIPMENT', idx)}
                              style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: '2px' }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* QUICK ADD RESOURCE ACCORDION */}
              <div>
                {!showAddResourceRow ? (
                  <button
                    onClick={() => setShowAddResourceRow(true)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      background: '#F1F5F9',
                      border: '1px dashed #94A3B8',
                      color: '#2563EB',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <Plus size={14} />
                    <span>+ Tambah Komponen Baru ke Analisa Ini</span>
                  </button>
                ) : (
                  <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '8px', border: '1px solid #CBD5E1' }}>
                    <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>
                      Tambah Komponen Baru
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '120px 2fr 80px 80px 120px auto', gap: '8px' }}>
                      <select
                        value={newResCategory}
                        onChange={(e: any) => setNewResCategory(e.target.value)}
                        style={{ height: '30px', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '11.5px', padding: '0 4px' }}
                      >
                        <option value="MATERIAL">A. Material</option>
                        <option value="LABOR">B. Upah</option>
                        <option value="EQUIPMENT">C. Alat</option>
                      </select>

                      <input
                        type="text"
                        placeholder="Nama Komponen..."
                        value={newResName}
                        onChange={(e) => setNewResName(e.target.value)}
                        style={{ height: '30px', borderRadius: '4px', border: '1px solid #CBD5E1', padding: '0 8px', fontSize: '11.5px' }}
                      />

                      <input
                        type="number"
                        step="any"
                        placeholder="Koef"
                        value={newResCoeff}
                        onChange={(e) => setNewResCoeff(parseFloat(e.target.value) || 0)}
                        style={{ height: '30px', borderRadius: '4px', border: '1px solid #CBD5E1', padding: '0 6px', textAlign: 'center', fontSize: '11.5px' }}
                      />

                      <input
                        type="text"
                        placeholder="Satuan"
                        value={newResUnit}
                        onChange={(e) => setNewResUnit(e.target.value)}
                        style={{ height: '30px', borderRadius: '4px', border: '1px solid #CBD5E1', padding: '0 6px', textAlign: 'center', fontSize: '11.5px' }}
                      />

                      <input
                        type="number"
                        placeholder="Harga (Rp)"
                        value={newResPrice}
                        onChange={(e) => setNewResPrice(parseFloat(e.target.value) || 0)}
                        style={{ height: '30px', borderRadius: '4px', border: '1px solid #CBD5E1', padding: '0 8px', textAlign: 'right', fontSize: '11.5px' }}
                      />

                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          onClick={handleAddResource}
                          style={{
                            height: '30px',
                            padding: '0 10px',
                            borderRadius: '4px',
                            background: '#2563EB',
                            color: '#FFFFFF',
                            border: 'none',
                            fontSize: '11.5px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Tambah
                        </button>
                        <button
                          onClick={() => setShowAddResourceRow(false)}
                          style={{
                            height: '30px',
                            padding: '0 8px',
                            borderRadius: '4px',
                            background: '#E2E8F0',
                            border: 'none',
                            fontSize: '11.5px',
                            cursor: 'pointer',
                          }}
                        >
                          Batal
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ---------------------------------------------------------------
                  CALCULATION SUMMARY CARD: DIRECT COST + OVERHEAD + PROFIT
                 --------------------------------------------------------------- */}
              <div
                style={{
                  background: '#F8FAFC',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  padding: '14px',
                  marginTop: '6px',
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Building2 size={15} color="#2563EB" />
                  REKAPITULASI BIAYA & MARKUP PEKERJAAN
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
                  {/* Direct Cost */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '6px', borderBottom: '1px dashed #E2E8F0' }}>
                    <span style={{ color: '#475569', fontWeight: 600 }}>Biaya Langsung (Direct Cost = A + B + C)</span>
                    <span style={{ fontWeight: 750, color: '#0F172A' }}>{formatCurrencyIDR(directCost)}</span>
                  </div>

                  {/* Overhead */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#475569' }}>
                      <span>Biaya Overhead</span>
                      <input
                        type="number"
                        value={overheadPct}
                        onChange={(e) => setOverheadPct(parseFloat(e.target.value) || 0)}
                        style={{
                          width: '45px',
                          height: '22px',
                          textAlign: 'center',
                          borderRadius: '4px',
                          border: '1px solid #CBD5E1',
                          fontSize: '11px',
                          fontWeight: 700,
                        }}
                      />
                      <span>%</span>
                    </div>
                    <span style={{ fontWeight: 650, color: '#334155' }}>+ {formatCurrencyIDR(overheadNominal)}</span>
                  </div>

                  {/* Profit */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#475569' }}>
                      <span>Keuntungan Pemborong (Profit)</span>
                      <input
                        type="number"
                        value={profitPct}
                        onChange={(e) => setProfitPct(parseFloat(e.target.value) || 0)}
                        style={{
                          width: '45px',
                          height: '22px',
                          textAlign: 'center',
                          borderRadius: '4px',
                          border: '1px solid #CBD5E1',
                          fontSize: '11px',
                          fontWeight: 700,
                        }}
                      />
                      <span>%</span>
                    </div>
                    <span style={{ fontWeight: 650, color: '#334155' }}>+ {formatCurrencyIDR(profitNominal)}</span>
                  </div>

                  {/* Other components */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#475569' }}>
                      <span>Komponen K3 / Asuransi (Lainnya)</span>
                      <input
                        type="number"
                        value={otherPct}
                        onChange={(e) => setOtherPct(parseFloat(e.target.value) || 0)}
                        style={{
                          width: '45px',
                          height: '22px',
                          textAlign: 'center',
                          borderRadius: '4px',
                          border: '1px solid #CBD5E1',
                          fontSize: '11px',
                          fontWeight: 700,
                        }}
                      />
                      <span>%</span>
                    </div>
                    <span style={{ fontWeight: 650, color: '#334155' }}>+ {formatCurrencyIDR(otherNominal)}</span>
                  </div>

                  {/* Final Unit Price */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingTop: '8px',
                      borderTop: '2px solid #CBD5E1',
                      marginTop: '4px',
                    }}
                  >
                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A' }}>
                      HARGA SATUAN FINAL (Rp/{initialData.unit})
                    </span>
                    <span style={{ fontSize: '15px', fontWeight: 850, color: '#2563EB' }}>
                      {formatCurrencyIDR(calculatedUnitPrice)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: IMPACT MATRIX */}
          {activeTab === 'IMPACT' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div
                style={{
                  background: '#F0FDF4',
                  borderRadius: '8px',
                  border: '1px solid #BBF7D0',
                  padding: '14px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                }}
              >
                <Info size={18} color="#16A34A" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div style={{ fontSize: '12px', color: '#166534', lineHeight: 1.5 }}>
                  <strong>Live Cost Impact Engine:</strong> Setiap perubahan koefisien atau harga satuan dihitung secara langsung untuk menunjukkan perbandingan biaya sebelum dan sesudah modifikasi.
                </div>
              </div>

              {/* Comparison Table */}
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                      <th style={{ padding: '10px 14px', textAlign: 'left', color: '#64748B' }}>Komponen Metrik</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right', color: '#64748B' }}>Sebelum (Baseline)</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right', color: '#2563EB' }}>Sesudah (Modifikasi)</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right', color: '#0F172A' }}>Selisih (Delta)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 650, color: '#334155' }}>Harga Satuan (Unit Price)</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: '#64748B' }}>{formatCurrencyIDR(baselineUnitPrice)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 750, color: '#2563EB' }}>{formatCurrencyIDR(calculatedUnitPrice)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: unitPriceDifference >= 0 ? '#DC2626' : '#16A34A' }}>
                        {unitPriceDifference >= 0 ? `+${formatCurrencyIDR(unitPriceDifference)}` : formatCurrencyIDR(unitPriceDifference)}
                        <span style={{ fontSize: '11px', marginLeft: '6px' }}>({unitPriceDifference >= 0 ? `+${unitPriceDifferencePercent}%` : `${unitPriceDifferencePercent}%`})</span>
                      </td>
                    </tr>

                    <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 650, color: '#334155' }}>Subtotal Item ({initialData.volume} {initialData.unit})</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: '#64748B' }}>{formatCurrencyIDR(baselineTotalItemPrice)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 750, color: '#2563EB' }}>{formatCurrencyIDR(calculatedTotalItemPrice)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: itemTotalDifference >= 0 ? '#DC2626' : '#16A34A' }}>
                        {itemTotalDifference >= 0 ? `+${formatCurrencyIDR(itemTotalDifference)}` : formatCurrencyIDR(itemTotalDifference)}
                      </td>
                    </tr>

                    <tr style={{ background: '#F8FAFC' }}>
                      <td style={{ padding: '12px 14px', fontWeight: 800, color: '#0F172A' }}>Total RAB Proyek ({currentProject ? currentProject.name : 'Aktif'})</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#64748B' }}>{formatCurrencyIDR(currentTotalRab)}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 850, color: '#2563EB' }}>{formatCurrencyIDR(newTotalRab)}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 850, color: itemTotalDifference >= 0 ? '#DC2626' : '#16A34A' }}>
                        {itemTotalDifference >= 0 ? `+${formatCurrencyIDR(itemTotalDifference)}` : formatCurrencyIDR(itemTotalDifference)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: REGULATORY SOURCE */}
          {activeTab === 'SOURCE' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ background: '#F8FAFC', padding: '14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', marginBottom: '6px' }}>
                  Pedoman & Standar Acuan AHSP
                </div>
                <p style={{ fontSize: '12px', color: '#475569', margin: '0 0 10px', lineHeight: 1.5 }}>
                  Analisa Harga Satuan Pekerjaan (AHSP) ini merujuk pada standar teknis resmi Kementerian Pekerjaan Umum dan Perumahan Rakyat (PUPR):
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11.5px', color: '#334155' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ShieldCheck size={14} color="#2563EB" />
                    <span><strong>Regulasi:</strong> Peraturan Menteri PUPR No. 1 Tahun 2022 & Surat Edaran DJBK 2026</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ShieldCheck size={14} color="#2563EB" />
                    <span><strong>Domain:</strong> Cipta Karya / Bina Marga / Sumber Daya Air</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ShieldCheck size={14} color="#2563EB" />
                    <span><strong>Wilayah Acuan Harga:</strong> {currentProject?.location || 'DKI Jakarta / Nasional'} (Indeks Harga 1.00)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: AUDIT TRAIL */}
          {activeTab === 'AUDIT' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontSize: '12.5px', fontWeight: 750, color: '#0F172A', marginBottom: '4px' }}>
                Riwayat Perubahan & Audit Log
              </div>

              {(!initialData.auditTrail || initialData.auditTrail.length === 0) ? (
                <div style={{ textAlign: 'center', padding: '30px 10px', color: '#94A3B8', fontSize: '12px', border: '1px dashed #CBD5E1', borderRadius: '8px' }}>
                  Belum ada catatan modifikasi untuk item pekerjaan ini.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {initialData.auditTrail.map((audit) => (
                    <div
                      key={audit.id}
                      style={{
                        padding: '10px 12px',
                        background: '#F8FAFC',
                        borderRadius: '6px',
                        border: '1px solid #E2E8F0',
                        fontSize: '11.5px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 700, color: '#0F172A' }}>{audit.action}</span>
                        <span style={{ color: '#64748B', fontSize: '10.5px' }}>{new Date(audit.timestamp).toLocaleString('id-ID')}</span>
                      </div>
                      <div style={{ color: '#475569', marginBottom: '4px' }}>
                        Oleh: <strong>{audit.author}</strong>
                      </div>
                      <div style={{ display: 'flex', gap: '12px', color: '#334155' }}>
                        <span>Harga Satuan: {formatCurrencyIDR(audit.previousUnitPrice)} → <strong>{formatCurrencyIDR(audit.newUnitPrice)}</strong></span>
                      </div>
                      {audit.notes && (
                        <div style={{ marginTop: '4px', fontSize: '11px', color: '#64748B', fontStyle: 'italic' }}>
                          {audit.notes}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* -------------------------------------------------------------------
            5. DRAWER FOOTER ACTIONS
           ------------------------------------------------------------------- */}
        <div
          style={{
            padding: isMobile ? '12px 16px max(12px, env(safe-area-inset-bottom, 12px))' : '12px 20px',
            borderTop: '1px solid #E2E8F0',
            background: '#F8FAFC',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={handleResetToStandard}
              className="ezrab-touch-target"
              style={{
                height: '38px',
                padding: '0 12px',
                borderRadius: '6px',
                background: '#FFFFFF',
                border: '1px solid #CBD5E1',
                color: '#475569',
                fontSize: '12px',
                fontWeight: 650,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <RotateCcw size={13} />
              <span>Reset Standar</span>
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={onClose}
              className="ezrab-touch-target"
              style={{
                height: '38px',
                padding: '0 14px',
                borderRadius: '6px',
                background: '#FFFFFF',
                border: '1px solid #CBD5E1',
                color: '#475569',
                fontSize: '12px',
                fontWeight: 650,
                cursor: 'pointer',
              }}
            >
              Batal
            </button>

            <button
              onClick={handleSaveChanges}
              className="ezrab-touch-target"
              style={{
                height: '38px',
                padding: '0 18px',
                borderRadius: '6px',
                background: '#2563EB',
                color: '#FFFFFF',
                border: 'none',
                fontSize: '12px',
                fontWeight: 750,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 4px rgba(37,99,235,0.2)',
              }}
            >
              <Save size={14} />
              <span>Simpan Perubahan</span>
            </button>
          </div>
        </div>

        {/* TOAST FEEDBACK */}
        {toastMessage && (
          <div
            style={{
              position: 'absolute',
              bottom: '70px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: '#0F172A',
              color: '#FFFFFF',
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 600,
              boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)',
              zIndex: 1100,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <CheckCircle2 size={15} color="#10B981" />
            <span>{toastMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
};
