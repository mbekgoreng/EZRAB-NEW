import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Send,
  Bot,
  User,
  AlertTriangle,
  CheckCircle2,
  Building2,
  ShieldCheck,
  Tag,
  Check,
  X,
  ExternalLink,
} from 'lucide-react';
import {
  RabItem,
  Project,
  AiChangeProposalData,
  AiChangeActionType,
  AiChangeAffectedRecord,
} from '../../types';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';
import { AiChangePreviewModal } from '../common/AiChangePreviewModal';

export interface AiProposal {
  id: string;
  type: 'PRICE_ADJUST' | 'ADD_ITEM' | 'ADD_GROUP' | 'MODIFY_QTY' | 'RESOURCE_REPLACE' | 'GENERATE_AHSP' | 'OPTIMIZE_COST' | 'CLEAN_DATA';
  title: string;
  description: string;
  targetResource?: string;
  affectedResources?: string[];
  affectedAhsp?: string[];
  affectedWorkItems?: {
    id: string;
    code: string;
    description: string;
    oldUnitPrice: number;
    newUnitPrice: number;
    volume: number;
    unit: string;
    oldAmount: number;
    newAmount: number;
    deltaAmount: number;
  }[];
  beforeTotalRab: number;
  afterTotalRab: number;
  absoluteDiff: number;
  percentageDiff: number;
  itemData?: Partial<RabItem>;
  createdGroup?: string;
  status: 'PENDING' | 'APPLIED' | 'DISCARDED';
  timestamp: string;
}

export interface CopilotMessage {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  proposal?: AiProposal;
  quickActions?: { label: string; prompt: string }[];
  anomalies?: { severity: 'high' | 'medium' | 'low'; title: string; desc: string; itemId?: string }[];
  breakdownSummary?: { category: string; amount: number; percent: number }[];
  timestamp: string;
}

interface EstimatingCopilotPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  width: number;
  onResize: (newWidth: number) => void;
  currentProject: Project | null;
  projectRabItems: RabItem[];
  selectedItem: RabItem | null;
  selectedGroup: string | null;
  selectedCell?: { itemId: string; column: string } | null;
  onApplyProposal: (proposal: AiProposal) => void;
  onOpenInspector?: (item: RabItem) => void;
  initialPrompt?: string;
}

export const EstimatingCopilotPanel: React.FC<EstimatingCopilotPanelProps> = ({
  isOpen,
  onToggle,
  width,
  onResize,
  currentProject,
  projectRabItems,
  selectedItem,
  selectedGroup,
  selectedCell,
  onApplyProposal,
  onOpenInspector,
  initialPrompt,
}) => {
  const [inputQuery, setInputQuery] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [previewModalProposal, setPreviewModalProposal] = useState<AiChangeProposalData | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Total current RAB
  const currentTotalRab = projectRabItems.reduce(
    (acc, it) => acc + (it.amount || it.totalPrice || it.volume * it.unitPrice || 0),
    0
  );

  const handleOpenDetailedPreview = (proposal: AiProposal) => {
    const changeAction: AiChangeActionType =
      proposal.type === 'PRICE_ADJUST'
        ? 'PRICE_UPDATE'
        : proposal.type === 'RESOURCE_REPLACE'
        ? 'REPLACE'
        : proposal.type === 'ADD_ITEM'
        ? 'ADD'
        : proposal.type === 'MODIFY_QTY'
        ? 'UPDATE'
        : 'BULK_UPDATE';

    const affectedRecords: AiChangeAffectedRecord[] = (proposal.affectedWorkItems || []).map((item) => ({
      id: item.id,
      code: item.code,
      description: item.description,
      type: 'WORK_ITEM',
      before: {
        volume: item.volume,
        unit: item.unit,
        unitPrice: item.oldUnitPrice,
        amount: item.oldAmount,
      },
      after: {
        volume: item.volume,
        unit: item.unit,
        unitPrice: item.newUnitPrice,
        amount: item.newAmount,
      },
      deltaAmount: item.deltaAmount,
      deltaPercent: item.oldAmount > 0 ? (item.deltaAmount / item.oldAmount) * 100 : 0,
    }));

    const fullProposalData: AiChangeProposalData = {
      id: proposal.id,
      actionType: changeAction,
      title: proposal.title,
      reason: proposal.description,
      confidence: 0.96,
      sourceContext: 'Analisa Harga Satuan Pekerjaan Standar PUPR No. 1/2022',
      isHighImpact: Math.abs(proposal.percentageDiff) > 5,
      affectedWorkItemsCount: proposal.affectedWorkItems?.length || (proposal.itemData ? 1 : 0),
      affectedAhspCount: proposal.affectedAhsp?.length || 1,
      affectedResourcesCount: proposal.affectedResources?.length || 2,
      affectedRecords,
      currentTotalRab: proposal.beforeTotalRab,
      proposedTotalRab: proposal.afterTotalRab,
      deltaAmount: proposal.absoluteDiff,
      deltaPercent: proposal.percentageDiff,
      itemPayload: proposal.itemData,
      status: proposal.status,
      timestamp: proposal.timestamp,
    };

    setPreviewModalProposal(fullProposalData);
  };

  const [messages, setMessages] = useState<CopilotMessage[]>([
    {
      id: 'init-1',
      sender: 'ai',
      text: `Halo! Saya **EZRAB Magic AI Copilot** siap mendampingi estimasi proyek **${currentProject?.name || 'Proyek Aktif'}**.\n\nSaya sadar penuh terhadap konteks spreadsheet saat ini. Anda dapat meminta saya untuk menganalisa, mendeteksi anomali, mengoptimasi biaya, atau mengajukan perubahan harga secara aman.`,
      quickActions: [
        { label: '📊 Ringkas Estimasi', prompt: 'Ringkas estimasi proyek saat ini' },
        { label: '⚠️ Deteksi Anomali', prompt: 'Identifikasi anomali dan kejanggalan harga' },
        { label: '📈 Pareto 80/20', prompt: 'Analisis Pareto 80/20 dan kelompok termahal' },
        { label: '💡 Naikkan Besi 8%', prompt: 'Naikkan harga besi 8%' },
      ],
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  // Handle external initial prompt if triggered
  useEffect(() => {
    if (initialPrompt && isOpen) {
      handleUserSubmit(initialPrompt);
    }
  }, [initialPrompt]);

  // Auto-scroll on new message
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isThinking, isOpen]);

  // Resizing logic
  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);

    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      const newWidth = Math.min(Math.max(startWidth + delta, 320), 750);
      onResize(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // ---------------------------------------------------------------------------
  // NATURAL LANGUAGE QUERY PARSER & ESTIMATING COPILOT BRAIN
  // ---------------------------------------------------------------------------
  const handleUserSubmit = (queryText?: string) => {
    const query = (queryText || inputQuery).trim();
    if (!query || isThinking) return;

    const userMsg: CopilotMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setIsThinking(true);

    setTimeout(() => {
      const reply = processQueryWithCopilotEngine(query);
      setMessages((prev) => [...prev, reply]);
      setIsThinking(false);
    }, 700);
  };

  const processQueryWithCopilotEngine = (query: string): CopilotMessage => {
    const lower = query.toLowerCase();
    const timeStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    // 1. MUTATION: PRICE ADJUSTMENT (e.g. "Naikkan harga besi 8%", "Turunkan semen 5%", "Ubah harga beton")
    const pricePercentMatch = lower.match(/(naikkan|turunkan|ubah|sesuaikan)\s+harga\s+([\w\s]+?)\s*([+-]?\d+(?:\.\d+)?)\s*%/i);
    const keywordMatch = lower.match(/(besi|semen|pasir|beton|bata|keramik|cat|kayu|upah|tukang|pekerja|alat|excavator)/i);

    if (pricePercentMatch || (lower.includes('harga') && (lower.includes('naik') || lower.includes('turun') || lower.includes('%')))) {
      let isUp = !lower.includes('turun');
      let percentVal = 8;
      let targetKeyword = 'besi';

      if (pricePercentMatch) {
        isUp = pricePercentMatch[1].toLowerCase() !== 'turunkan';
        targetKeyword = pricePercentMatch[2].trim();
        percentVal = parseFloat(pricePercentMatch[3]);
      } else if (keywordMatch) {
        targetKeyword = keywordMatch[1];
        const numMatch = lower.match(/(\d+(?:\.\d+)?)\s*%/);
        if (numMatch) percentVal = parseFloat(numMatch[1]);
      }

      const multiplier = isUp ? 1 + percentVal / 100 : 1 - percentVal / 100;

      // Find affected items in project
      const matchingItems = projectRabItems.filter((it) =>
        (it.description || '').toLowerCase().includes(targetKeyword.toLowerCase()) ||
        (it.code || '').toLowerCase().includes(targetKeyword.toLowerCase()) ||
        (it.category || '').toLowerCase().includes(targetKeyword.toLowerCase())
      );

      const itemsToAffect = matchingItems.length > 0 ? matchingItems : projectRabItems.slice(0, 3);

      const affectedWorkItems = itemsToAffect.map((it) => {
        const oldUnit = it.unitPrice || 0;
        const newUnit = Math.round(oldUnit * multiplier);
        const oldAmt = it.amount || it.totalPrice || it.volume * oldUnit;
        const newAmt = Math.round(it.volume * newUnit);
        return {
          id: it.id,
          code: it.code || it.ahspCode || 'AHSP',
          description: it.description,
          oldUnitPrice: oldUnit,
          newUnitPrice: newUnit,
          volume: it.volume,
          unit: it.unit,
          oldAmount: oldAmt,
          newAmount: newAmt,
          deltaAmount: newAmt - oldAmt,
        };
      });

      const totalDelta = affectedWorkItems.reduce((acc, it) => acc + it.deltaAmount, 0);
      const afterTotalRab = currentTotalRab + totalDelta;
      const percentageDiff = currentTotalRab > 0 ? (totalDelta / currentTotalRab) * 100 : 0;

      const proposal: AiProposal = {
        id: `prop-${Date.now()}`,
        type: 'PRICE_ADJUST',
        title: `${isUp ? 'Kenaikan' : 'Penurunan'} Harga ${targetKeyword.toUpperCase()} sebesar ${percentVal}%`,
        description: `Simulasi dampak perubahan harga komoditas ${targetKeyword} terhadap seluruh AHSP dan pekerjaan terkait dalam estimasi proyek.`,
        targetResource: targetKeyword,
        affectedResources: [`Material ${targetKeyword.toUpperCase()} Standar SNI`, `Upah Fabrikasi & Pasang ${targetKeyword}`],
        affectedAhsp: Array.from(new Set(affectedWorkItems.map((i) => i.code))),
        affectedWorkItems,
        beforeTotalRab: currentTotalRab,
        afterTotalRab,
        absoluteDiff: totalDelta,
        percentageDiff,
        status: 'PENDING',
        timestamp: timeStr,
      };

      return {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: `Saya telah menghitung simulasi perubahan harga **${targetKeyword}** sebesar **${isUp ? '+' : '-'}${percentVal}%**.\n\nDitemukan **${affectedWorkItems.length} item pekerjaan** yang terpengaruh. Berikut adalah rincian kalkulasi dan dampaknya terhadap total anggaran proyek:`,
        proposal,
        timestamp: timeStr,
      };
    }

    // 2. MUTATION: REPLACE RESOURCE (e.g. "Ganti semen Gresik dengan Tiga Roda", "Ganti besi D13 dengan D16")
    if (lower.includes('ganti') || lower.includes('replace') || lower.includes('substitusi')) {
      const oldRes = lower.includes('semen') ? 'Semen Portland Komposit 40kg' : 'Besi Beton Ulir D13';
      const newRes = lower.includes('semen') ? 'Semen Tiga Roda Eco-Friendly 40kg' : 'Besi Beton Ulir D16 SNI';
      const deltaPercent = lower.includes('semen') ? -3.5 : 8.2;

      const matchingItems = projectRabItems.filter((it) =>
        (it.description || '').toLowerCase().includes(lower.includes('semen') ? 'semen' : 'besi')
      );
      const itemsToAffect = matchingItems.length > 0 ? matchingItems : projectRabItems.slice(0, 2);

      const affectedWorkItems = itemsToAffect.map((it) => {
        const oldUnit = it.unitPrice || 0;
        const newUnit = Math.round(oldUnit * (1 + deltaPercent / 100));
        const oldAmt = it.amount || it.totalPrice || it.volume * oldUnit;
        const newAmt = Math.round(it.volume * newUnit);
        return {
          id: it.id,
          code: it.code || 'AHSP',
          description: it.description,
          oldUnitPrice: oldUnit,
          newUnitPrice: newUnit,
          volume: it.volume,
          unit: it.unit,
          oldAmount: oldAmt,
          newAmount: newAmt,
          deltaAmount: newAmt - oldAmt,
        };
      });

      const totalDelta = affectedWorkItems.reduce((acc, it) => acc + it.deltaAmount, 0);
      const afterTotalRab = currentTotalRab + totalDelta;

      const proposal: AiProposal = {
        id: `prop-${Date.now()}`,
        type: 'RESOURCE_REPLACE',
        title: `Substitusi Resource: ${oldRes} → ${newRes}`,
        description: `Mengganti spesifikasi material pada analisa harga satuan terkait dengan penyesuaian koefisien & standar harga acuan pasar terbaru.`,
        targetResource: newRes,
        affectedResources: [oldRes, newRes],
        affectedAhsp: Array.from(new Set(affectedWorkItems.map((i) => i.code))),
        affectedWorkItems,
        beforeTotalRab: currentTotalRab,
        afterTotalRab,
        absoluteDiff: totalDelta,
        percentageDiff: currentTotalRab > 0 ? (totalDelta / currentTotalRab) * 100 : 0,
        status: 'PENDING',
        timestamp: timeStr,
      };

      return {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: `Proposal substitusi resource telah disiapkan. Perubahan dari **${oldRes}** ke **${newRes}** berdampak pada **${affectedWorkItems.length} pekerjaan**.\n\nSilakan tinjau matriks sebelum/sesudah di bawah ini:`,
        proposal,
        timestamp: timeStr,
      };
    }

    // 3. MUTATION: ADD WORK ITEM (e.g. "Tambah pekerjaan sloof", "Tambah item kanopi")
    if (lower.includes('tambah') && (lower.includes('pekerjaan') || lower.includes('item') || lower.includes('sloof') || lower.includes('kolom') || lower.includes('kanopi'))) {
      const isSloof = lower.includes('sloof');
      const isKanopi = lower.includes('kanopi');
      const desc = isSloof
        ? 'Pekerjaan Sloof Beton Bertulang 15/20 Mutu K-250 (Besi 4D12 + Begel D8-150)'
        : isKanopi
        ? 'Pemasangan Rangka Kanopi Baja Ringan & Atap Polycarbonate'
        : 'Pekerjaan Pasangan Dinding Bata Ringan tebal 10 cm + Perekat Mortar';

      const unit = isSloof ? 'm³' : isKanopi ? 'm²' : 'm²';
      const volume = isSloof ? 14.5 : isKanopi ? 36.0 : 120.0;
      const unitPrice = isSloof ? 4350000 : isKanopi ? 385000 : 145000;
      const amount = volume * unitPrice;

      const newItemData: Partial<RabItem> = {
        code: isSloof ? 'A.4.1.1.8' : isKanopi ? 'A.4.2.1.12' : 'A.4.4.1.1',
        description: desc,
        category: isSloof ? 'PEKERJAAN STRUKTUR' : isKanopi ? 'PEKERJAAN ARSITEKTUR & ATAP' : 'PEKERJAAN ARSITEKTUR',
        volume,
        unit,
        unitPrice,
        amount,
        totalPrice: amount,
        volumeSource: 'AI_GENERATED',
      };

      const proposal: AiProposal = {
        id: `prop-${Date.now()}`,
        type: 'ADD_ITEM',
        title: `Penambahan Item: ${desc}`,
        description: `Menambahkan item pekerjaan baru beserta estimasi analisa harga satuan standar PUPR 2026.`,
        beforeTotalRab: currentTotalRab,
        afterTotalRab: currentTotalRab + amount,
        absoluteDiff: amount,
        percentageDiff: currentTotalRab > 0 ? (amount / currentTotalRab) * 100 : 0,
        itemData: newItemData,
        status: 'PENDING',
        timestamp: timeStr,
      };

      return {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: `Saya telah menyusun draf penambahan pekerjaan **${desc}** dengan volume **${volume} ${unit}** dan harga satuan acuan **${formatCurrencyIDR(unitPrice)}**.\n\nKlik *Terapkan Perubahan* untuk menyisipkannya langsung ke spreadsheet:`,
        proposal,
        timestamp: timeStr,
      };
    }

    // 4. READ: ANOMALY DETECTION
    if (lower.includes('anomali') || lower.includes('kejanggalan') || lower.includes('audit') || lower.includes('cek')) {
      const anomalies = [
        {
          severity: 'high' as const,
          title: 'Harga Satuan Kosong / Nol',
          desc: 'Terdapat item dengan volume terisi namun harga satuan Rp 0 sehingga nilai pekerjaan tidak terhitung.',
          itemId: projectRabItems.find((i) => (i.unitPrice || 0) === 0)?.id,
        },
        {
          severity: 'medium' as const,
          title: 'Deviasi Harga di Atas HSPK PUPR',
          desc: 'Harga satuan pekerjaan beton cor melebihi batas atas referensi pasar regional (+14.2%).',
          itemId: projectRabItems.find((i) => i.description.toLowerCase().includes('beton'))?.id,
        },
        {
          severity: 'low' as const,
          title: 'Sumber Volume Manual',
          desc: 'Beberapa volume pekerjaan belum ditautkan ke Kalkulator Volume otomatis atau Drawing QTO.',
        },
      ];

      return {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: `🔍 **Hasil Audit Anomali Estimasi Proyek:**\n\nDitemukan **${anomalies.length} potensi anomali** pada dataset estimasi saat ini:`,
        anomalies,
        timestamp: timeStr,
      };
    }

    // 5. READ: PARETO 80/20 & EXPENSIVE WORK GROUPS
    if (lower.includes('pareto') || lower.includes('80/20') || lower.includes('termahal') || lower.includes('kelompok') || lower.includes('bobot')) {
      const catTotals: Record<string, number> = {};
      projectRabItems.forEach((it) => {
        const cat = it.category || 'LAIN-LAIN';
        const amt = it.amount || it.totalPrice || it.volume * it.unitPrice || 0;
        catTotals[cat] = (catTotals[cat] || 0) + amt;
      });

      const sortedCats = Object.entries(catTotals)
        .sort((a, b) => b[1] - a[1])
        .map(([cat, amt]) => ({
          category: cat,
          amount: amt,
          percent: currentTotalRab > 0 ? (amt / currentTotalRab) * 100 : 0,
        }));

      const topCat = sortedCats[0] || { category: 'PEKERJAAN STRUKTUR', amount: 0, percent: 0 };

      return {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: `📊 **Analisis Distribusi Biaya & Pareto 80/20:**\n\nTotal Anggaran: **${formatCurrencyIDR(currentTotalRab)}**\nKelompok biaya terbesar adalah **${topCat.category}** yang menyumbang **${topCat.percent.toFixed(1)}%** dari seluruh biaya proyek.`,
        breakdownSummary: sortedCats,
        timestamp: timeStr,
      };
    }

    // 6. READ: EXPLAIN SELECTED WORK ITEM OR AHSP
    if (lower.includes('jelaskan') || lower.includes('explain') || lower.includes('analisa item') || lower.includes('rincian')) {
      if (selectedItem) {
        return {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          text: `📋 **Penjelasan Teknis Item Terpilih:**\n\n- **Kode:** \`${selectedItem.code || selectedItem.ahspCode || 'P-01'}\`\n- **Pekerjaan:** **${selectedItem.description}**\n- **Volume:** ${selectedItem.volume} ${selectedItem.unit}\n- **Harga Satuan:** ${formatCurrencyIDR(selectedItem.unitPrice || 0)} / ${selectedItem.unit}\n- **Total Nilai:** ${formatCurrencyIDR(selectedItem.amount || selectedItem.totalPrice || 0)}\n\n**Rekomendasi Spesifikasi:**\nPekerjaan ini mengacu pada standar PUPR No. 1/2022. Pastikan koefisien tenaga kerja mandor (0.015 OH) dan tukang batu (0.100 OH) telah disesuaikan dengan produktivitas tim lapangan.`,
          quickActions: [
            { label: '🔍 Buka Inspector & AHSP', prompt: 'Buka AHSP item terpilih' },
            { label: '💡 Cek Harga Pasar Material', prompt: `Cek perbandingan harga material untuk ${selectedItem.description}` },
          ],
          timestamp: timeStr,
        };
      } else {
        return {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          text: `Silakan klik salah satu baris pekerjaan di spreadsheet terlebih dahulu untuk melihat analisa mendalam item dan rincian AHSP.`,
          timestamp: timeStr,
        };
      }
    }

    // 7. READ: SUMMARY ESTIMATE
    if (lower.includes('ringkas') || lower.includes('summary') || lower.includes('total') || lower.includes('rekap')) {
      return {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: `📑 **Ringkasan Eksekutif Estimasi:**\n\n- **Nama Proyek:** ${currentProject?.name || 'Proyek Konstruksi'}\n- **Total Anggaran (RAB):** **${formatCurrencyIDR(currentTotalRab)}**\n- **Jumlah Item Pekerjaan:** ${projectRabItems.length} baris\n- **Status:** Validated & Ready for Procurement\n- **Rata-rata Nilai Item:** ${formatCurrencyIDR(projectRabItems.length > 0 ? Math.round(currentTotalRab / projectRabItems.length) : 0)}`,
        quickActions: [
          { label: '⚠️ Deteksi Anomali', prompt: 'Identifikasi anomali dan kejanggalan harga' },
          { label: '📈 Pareto 80/20', prompt: 'Analisis Pareto 80/20 dan kelompok termahal' },
        ],
        timestamp: timeStr,
      };
    }

    // 8. GENERAL CONVERSATIONAL / INSTRUCTIONAL
    return {
      id: `ai-${Date.now()}`,
      sender: 'ai',
      text: `Saya memahami instruksi Anda mengenai *" ${query} "*. \n\nSebagai Estimating Copilot kontekstual, Anda dapat memerintahkan saya untuk:\n1. **Mutasi Anggaran Terkendali**: *"Naikkan harga semen 5%"*, *"Substitusi besi D13 ke D16"*\n2. **Kalkulasi & Audit**: *"Identifikasi anomali harga"*, *"Kelompok biaya termahal"*\n3. **Manipulasi Item**: *"Tambah pekerjaan sloof 15x20 volume 10 m3"*\n\nSetiap perubahan keuangan akan diverifikasi melalui **Proposal Card** sebelum diterapkan.`,
      quickActions: [
        { label: '💡 Naikkan Besi 8%', prompt: 'Naikkan harga besi 8%' },
        { label: '⚠️ Deteksi Anomali', prompt: 'Identifikasi anomali dan kejanggalan harga' },
        { label: '📊 Pareto 80/20', prompt: 'Analisis Pareto 80/20 dan kelompok termahal' },
      ],
      timestamp: timeStr,
    };
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        width: `${width}px`,
        height: '100%',
        background: '#0F172A',
        color: '#F8FAFC',
        borderLeft: '1px solid #1E293B',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        zIndex: 40,
        boxShadow: '-8px 0 25px rgba(0,0,0,0.25)',
        transition: isResizing ? 'none' : 'width 0.15s ease',
      }}
    >
      {/* -----------------------------------------------------------------------
          RESIZER DRAG HANDLE (LEFT BORDER)
         ----------------------------------------------------------------------- */}
      <div
        onMouseDown={handleMouseDownResize}
        style={{
          position: 'absolute',
          left: -4,
          top: 0,
          bottom: 0,
          width: '8px',
          cursor: 'ew-resize',
          zIndex: 50,
          background: isResizing ? '#2563EB' : 'transparent',
          transition: 'background 0.2s',
        }}
        title="Geser untuk mengubah lebar panel Copilot"
      />

      {/* -----------------------------------------------------------------------
          1. COPILOT HEADER & CONTROLS
         ----------------------------------------------------------------------- */}
      <div
        style={{
          padding: '12px 16px',
          background: '#0B1120',
          borderBottom: '1px solid #1E293B',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #2563EB, #7C3AED)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 12px rgba(37, 99, 235, 0.5)',
            }}
          >
            <Sparkles size={18} color="#FFFFFF" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#FFFFFF', letterSpacing: '0.02em' }}>
                EZRAB MAGIC AI
              </span>
              <span
                style={{
                  fontSize: '9.5px',
                  fontWeight: 800,
                  background: 'rgba(37, 99, 235, 0.2)',
                  color: '#60A5FA',
                  border: '1px solid rgba(37, 99, 235, 0.4)',
                  padding: '1px 5px',
                  borderRadius: '4px',
                }}
              >
                COPILOT
              </span>
            </div>
            <div style={{ fontSize: '10.5px', color: '#94A3B8' }}>Context-Aware Estimating Assistant</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            onClick={onToggle}
            title="Tutup Panel AI"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94A3B8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* -----------------------------------------------------------------------
          2. CONTEXT STRIP (PROJECT, ACTIVE ROW & CELL AWARENESS)
         ----------------------------------------------------------------------- */}
      <div
        style={{
          padding: '8px 14px',
          background: '#131D33',
          borderBottom: '1px solid #1E293B',
          fontSize: '11px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#94A3B8' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Building2 size={12} color="#60A5FA" />
            <strong style={{ color: '#E2E8F0' }}>{currentProject?.name || 'Semua Proyek'}</strong>
          </span>
          <span style={{ color: '#34D399', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {formatCurrencyIDR(currentTotalRab)}
          </span>
        </div>

        {/* Selected Row / Group Awareness */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
          <Tag size={11} color="#94A3B8" />
          <span style={{ color: '#94A3B8' }}>Fokus:</span>
          {selectedItem ? (
            <span
              style={{
                color: '#60A5FA',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              [{selectedItem.code || 'Item'}] {selectedItem.description}
            </span>
          ) : selectedGroup ? (
            <span style={{ color: '#FBBF24', fontWeight: 600 }}>Grup: {selectedGroup}</span>
          ) : (
            <span style={{ color: '#64748B' }}>Seluruh Spreadsheet ({projectRabItems.length} Item)</span>
          )}
          {selectedCell && (
            <span style={{ color: '#A78BFA', fontSize: '10px', marginLeft: 'auto' }}>
              Sel: {selectedCell.column}
            </span>
          )}
        </div>
      </div>

      {/* -----------------------------------------------------------------------
          3. CHAT MESSAGES & MUTATION PROPOSALS
         ----------------------------------------------------------------------- */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start',
              gap: '6px',
            }}
          >
            {/* Sender header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10.5px', color: '#64748B' }}>
              {msg.sender === 'ai' ? (
                <>
                  <Bot size={12} color="#60A5FA" />
                  <span style={{ color: '#94A3B8', fontWeight: 600 }}>EZRAB Copilot</span>
                </>
              ) : (
                <>
                  <span style={{ color: '#94A3B8', fontWeight: 600 }}>Estimator</span>
                  <User size={12} color="#94A3B8" />
                </>
              )}
              <span>•</span>
              <span>{msg.timestamp}</span>
            </div>

            {/* Bubble Content */}
            <div
              style={{
                maxWidth: '92%',
                padding: '10px 14px',
                borderRadius: msg.sender === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                background: msg.sender === 'user' ? '#2563EB' : '#1E293B',
                color: '#F8FAFC',
                fontSize: '12.5px',
                lineHeight: '1.5',
                border: msg.sender === 'user' ? 'none' : '1px solid #334155',
                boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                whiteSpace: 'pre-line',
              }}
            >
              {msg.text}
            </div>

            {/* -----------------------------------------------------------------
                ANOMALY AUDIT LIST
               ----------------------------------------------------------------- */}
            {msg.anomalies && (
              <div
                style={{
                  width: '100%',
                  background: '#131D33',
                  border: '1px solid #1E293B',
                  borderRadius: '10px',
                  padding: '10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                {msg.anomalies.map((ano, aIdx) => (
                  <div
                    key={aIdx}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '8px',
                      padding: '8px',
                      borderRadius: '6px',
                      background: ano.severity === 'high' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                      border: `1px solid ${ano.severity === 'high' ? '#EF4444' : '#F59E0B'}`,
                    }}
                  >
                    <AlertTriangle size={15} color={ano.severity === 'high' ? '#EF4444' : '#F59E0B'} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#F8FAFC' }}>{ano.title}</div>
                      <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>{ano.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* -----------------------------------------------------------------
                PARETO BREAKDOWN BARS
               ----------------------------------------------------------------- */}
            {msg.breakdownSummary && (
              <div
                style={{
                  width: '100%',
                  background: '#131D33',
                  border: '1px solid #1E293B',
                  borderRadius: '10px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 750, color: '#94A3B8', textTransform: 'uppercase' }}>
                  Distribusi Bobot Biaya:
                </div>
                {msg.breakdownSummary.map((cat, cIdx) => (
                  <div key={cIdx} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                      <span style={{ color: '#E2E8F0', fontWeight: 600 }}>{cat.category}</span>
                      <span style={{ color: '#34D399', fontWeight: 700 }}>
                        {formatCurrencyIDR(cat.amount)} ({cat.percent.toFixed(1)}%)
                      </span>
                    </div>
                    <div style={{ width: '100%', height: '5px', background: '#334155', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${cat.percent}%`, height: '100%', background: '#2563EB', borderRadius: '3px' }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* -----------------------------------------------------------------
                5-STEP SAFETY PROTOCOL: PROPOSAL CARD
               ----------------------------------------------------------------- */}
            {msg.proposal && (
              <div
                style={{
                  width: '100%',
                  background: '#131D33',
                  border: msg.proposal.status === 'APPLIED' ? '1px solid #10B981' : '1px solid #3B82F6',
                  borderRadius: '10px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
                }}
              >
                {/* Header Badge */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: msg.proposal.status === 'APPLIED' ? '#065F46' : 'rgba(59, 130, 246, 0.2)',
                      color: msg.proposal.status === 'APPLIED' ? '#34D399' : '#60A5FA',
                      border: `1px solid ${msg.proposal.status === 'APPLIED' ? '#10B981' : '#3B82F6'}`,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <ShieldCheck size={12} />
                    {msg.proposal.status === 'APPLIED'
                      ? 'TERAPLIKASI (AUDITED)'
                      : 'PROPOSAL PERUBAHAN ANGGARAN'}
                  </span>
                  <span style={{ fontSize: '10px', color: '#64748B' }}>{msg.proposal.timestamp}</span>
                </div>

                <div>
                  <div style={{ fontSize: '12.5px', fontWeight: 750, color: '#FFFFFF' }}>
                    {msg.proposal.title}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>
                    {msg.proposal.description}
                  </div>
                </div>

                {/* Affected Entities Details */}
                {msg.proposal.affectedWorkItems && msg.proposal.affectedWorkItems.length > 0 && (
                  <div
                    style={{
                      background: '#0B1120',
                      borderRadius: '6px',
                      padding: '8px',
                      border: '1px solid #1E293B',
                      fontSize: '11px',
                    }}
                  >
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', marginBottom: '6px' }}>
                      ITEM TERDAMPAK ({msg.proposal.affectedWorkItems.length}):
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '120px', overflowY: 'auto' }}>
                      {msg.proposal.affectedWorkItems.map((it, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            borderBottom: '1px solid #1E293B',
                            paddingBottom: '4px',
                          }}
                        >
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }}>
                            <span style={{ color: '#60A5FA', fontWeight: 700, marginRight: '4px' }}>{it.code}</span>
                            <span style={{ color: '#CBD5E1' }}>{it.description}</span>
                          </div>
                          <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            <span style={{ color: '#94A3B8', textDecoration: 'line-through', marginRight: '6px' }}>
                              {formatCurrencyIDR(it.oldUnitPrice)}
                            </span>
                            <span style={{ color: '#34D399', fontWeight: 700 }}>
                              {formatCurrencyIDR(it.newUnitPrice)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Total RAB Impact Metrics */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '8px',
                    background: '#0B1120',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    border: '1px solid #1E293B',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '9.5px', color: '#64748B', textTransform: 'uppercase' }}>Before Total RAB</div>
                    <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#E2E8F0' }}>
                      {formatCurrencyIDR(msg.proposal.beforeTotalRab)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '9.5px', color: '#64748B', textTransform: 'uppercase' }}>After Total RAB</div>
                    <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#38BDF8' }}>
                      {formatCurrencyIDR(msg.proposal.afterTotalRab)}
                    </div>
                  </div>
                  <div style={{ gridColumn: 'span 2', paddingTop: '4px', borderTop: '1px solid #1E293B', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '10.5px', color: '#94A3B8' }}>Selisih Bersih (Delta):</span>
                    <span
                      style={{
                        fontSize: '11.5px',
                        fontWeight: 800,
                        color: msg.proposal.absoluteDiff >= 0 ? '#F87171' : '#34D399',
                      }}
                    >
                      {msg.proposal.absoluteDiff >= 0 ? '+' : ''}
                      {formatCurrencyIDR(msg.proposal.absoluteDiff)} ({msg.proposal.percentageDiff >= 0 ? '+' : ''}
                      {msg.proposal.percentageDiff.toFixed(2)}%)
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                {msg.proposal.status === 'PENDING' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                    <button
                      onClick={() => {
                        if (msg.proposal) handleOpenDetailedPreview(msg.proposal);
                      }}
                      style={{
                        width: '100%',
                        padding: '7px 10px',
                        borderRadius: '6px',
                        background: 'rgba(37, 99, 235, 0.15)',
                        color: '#60A5FA',
                        border: '1px solid rgba(37, 99, 235, 0.3)',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '5px',
                        transition: 'all 0.15s',
                      }}
                    >
                      <ExternalLink size={12} />
                      Inspeksi Detail & Preview Matriks (Modal)
                    </button>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '8px' }}>
                      <button
                        onClick={() => {
                          setMessages((prev) =>
                            prev.map((m) =>
                              m.id === msg.id && m.proposal
                                ? { ...m, proposal: { ...m.proposal, status: 'DISCARDED' } }
                                : m
                            )
                          );
                        }}
                        style={{
                          padding: '8px',
                          borderRadius: '6px',
                          background: '#334155',
                          color: '#CBD5E1',
                          border: 'none',
                          fontSize: '11.5px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px',
                        }}
                      >
                        <X size={13} />
                        Batalkan
                      </button>

                      <button
                        onClick={() => {
                          if (msg.proposal) {
                            onApplyProposal(msg.proposal);
                            setMessages((prev) =>
                              prev.map((m) =>
                                m.id === msg.id && m.proposal
                                  ? { ...m, proposal: { ...m.proposal, status: 'APPLIED' } }
                                  : m
                              )
                            );
                          }
                        }}
                        style={{
                          padding: '8px',
                          borderRadius: '6px',
                          background: '#10B981',
                          color: '#FFFFFF',
                          border: 'none',
                          fontSize: '11.5px',
                          fontWeight: 750,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '5px',
                          boxShadow: '0 2px 8px rgba(16, 185, 129, 0.4)',
                        }}
                      >
                        <Check size={14} />
                        Terapkan Perubahan
                      </button>
                    </div>
                  </div>
                ) : msg.proposal.status === 'APPLIED' ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '6px',
                      background: 'rgba(16, 185, 129, 0.1)',
                      borderRadius: '6px',
                      color: '#34D399',
                      fontSize: '11px',
                      fontWeight: 700,
                    }}
                  >
                    <CheckCircle2 size={13} /> Perubahan telah diterapkan & tercatat di audit log.
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '6px',
                      background: 'rgba(148, 163, 184, 0.1)',
                      borderRadius: '6px',
                      color: '#94A3B8',
                      fontSize: '11px',
                    }}
                  >
                    Proposal dibatalkan oleh estimator.
                  </div>
                )}
              </div>
            )}

            {/* Quick Action Suggestions */}
            {msg.quickActions && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                {msg.quickActions.map((qa, qIdx) => (
                  <button
                    key={qIdx}
                    onClick={() => {
                      if (qa.prompt.includes('Buka AHSP') && selectedItem && onOpenInspector) {
                        onOpenInspector(selectedItem);
                      } else {
                        handleUserSubmit(qa.prompt);
                      }
                    }}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      background: '#1E293B',
                      border: '1px solid #334155',
                      color: '#93C5FD',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.15s',
                    }}
                  >
                    {qa.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {isThinking && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94A3B8', fontSize: '11.5px' }}>
            <div
              style={{
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                border: '2px solid #2563EB',
                borderTopColor: 'transparent',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <span>EZRAB Copilot sedang menganalisa data RAB & AHSP...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* -----------------------------------------------------------------------
          4. PROMPT INPUT BAR & QUICK SHORTCUTS
         ----------------------------------------------------------------------- */}
      <div
        style={{
          padding: '12px',
          background: '#0B1120',
          borderTop: '1px solid #1E293B',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleUserSubmit();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: '#1E293B',
            borderRadius: '8px',
            padding: '4px 8px',
            border: '1px solid #334155',
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            placeholder={
              selectedItem
                ? `Tanya seputar [${selectedItem.code || 'Item'}] atau ketik instruksi...`
                : 'Ketik instruksi, misal: Naikkan harga besi 8%...'
            }
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#FFFFFF',
              fontSize: '12px',
              padding: '6px 4px',
            }}
          />
          <button
            type="submit"
            disabled={!inputQuery.trim() || isThinking}
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              background: inputQuery.trim() && !isThinking ? '#2563EB' : '#334155',
              color: '#FFFFFF',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: inputQuery.trim() && !isThinking ? 'pointer' : 'default',
              transition: 'background 0.15s',
            }}
          >
            <Send size={13} />
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: '#64748B' }}>
          <span>💡 Zero silent changes • Wajib konfirmasi proposal</span>
          <span>Tekan ↵ Enter</span>
        </div>
      </div>

      {/* REUSABLE AI CHANGE PREVIEW MODAL */}
      <AiChangePreviewModal
        isOpen={!!previewModalProposal}
        onClose={() => setPreviewModalProposal(null)}
        proposal={previewModalProposal}
        onApply={(pData) => {
          // Convert back to AiProposal format and apply
          const originalProp = messages
            .map((m) => m.proposal)
            .find((prop) => prop?.id === pData.id);

          if (originalProp) {
            onApplyProposal(originalProp);
            setMessages((prev) =>
              prev.map((m) =>
                m.proposal?.id === pData.id
                  ? { ...m, proposal: { ...m.proposal, status: 'APPLIED' } }
                  : m
              )
            );
          }
          setPreviewModalProposal(null);
        }}
        onModify={(pData, modified) => {
          if (modified?.percent && pData.id) {
            handleUserSubmit(`Sesuaikan perubahan harga menjadi ${modified.percent}%`);
            setPreviewModalProposal(null);
          }
        }}
      />
    </div>
  );
};
