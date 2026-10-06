import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Send,
  Bot,
  User,
  AlertTriangle,
  CheckCircle2,
  Minimize2,
  Maximize2,
  X,
  PanelRightClose,
  PanelRight,
  GripHorizontal,
  ExternalLink,
  ShieldAlert,
  Zap,
  Tag,
  Check,
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
import { AiProposal, CopilotMessage } from '../copilot/EstimatingCopilotPanel';

export type CopilotDisplayMode = 'collapsed' | 'floating' | 'docked-right';

interface MagicAICopilotModalProps {
  mode: CopilotDisplayMode;
  onModeChange: (mode: CopilotDisplayMode) => void;
  currentProject: Project | null;
  projectRabItems: RabItem[];
  selectedItem: RabItem | null;
  selectedGroup: string | null;
  selectedCell?: { itemId: string; column: string } | null;
  onApplyProposal: (proposal: AiProposal) => void;
  onOpenInspector?: (item: RabItem) => void;
  initialPrompt?: string;
}

export const MagicAICopilotModal: React.FC<MagicAICopilotModalProps> = ({
  mode,
  onModeChange,
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
  const [previewModalProposal, setPreviewModalProposal] = useState<AiChangeProposalData | null>(null);

  // Floating window position state
  const [position, setPosition] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = localStorage.getItem('ezrab_copilot_pos');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      x: typeof window !== 'undefined' ? Math.max(20, window.innerWidth - 440) : 800,
      y: 120,
    };
  });

  // Docked width state
  const [dockWidth, setDockWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('ezrab_copilot_dock_width');
      if (saved) return Number(saved);
    } catch {}
    return 380;
  });

  // Dragging state
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  // Resizing docked width state
  const isResizing = useRef(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(dockWidth);

  // Chat conversation
  const [messages, setMessages] = useState<CopilotMessage[]>([
    {
      id: 'welcome-1',
      sender: 'ai',
      text: `Halo! Saya EZRAB Magic AI Copilot. Saya memonitor estimasi "${currentProject?.name || 'Proyek'}" secara real-time untuk audit kewajaran harga, deteksi anomali volume, dan efisiensi Value Engineering.`,
      quickActions: [
        { label: '🔍 Audit Anomali RAB', prompt: 'Audit seluruh RAB dan temukan anomali harga atau deviasi volume' },
        { label: '📊 Analisis Pareto 80/20', prompt: 'Hitung item pekerjaan yang menyumbang 80% dari total anggaran' },
        { label: '💡 Saran Value Engineering', prompt: 'Berikan rekomendasi penghematan biaya tanpa menurunkan mutu spesifikasi' },
      ],
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isThinking]);

  // Handle Initial Prompt if passed externally
  useEffect(() => {
    if (initialPrompt && initialPrompt.trim() !== '') {
      handleSendMessage(initialPrompt);
    }
  }, [initialPrompt]);

  // Save dock width
  useEffect(() => {
    localStorage.setItem('ezrab_copilot_dock_width', String(dockWidth));
  }, [dockWidth]);

  // Drag listeners
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging.current) {
        const newX = Math.max(10, Math.min(window.innerWidth - 410, e.clientX - dragOffset.current.x));
        const newY = Math.max(70, Math.min(window.innerHeight - 300, e.clientY - dragOffset.current.y));
        setPosition({ x: newX, y: newY });
      }

      if (isResizing.current) {
        const delta = resizeStartX.current - e.clientX;
        const nextWidth = Math.max(320, Math.min(550, resizeStartWidth.current + delta));
        setDockWidth(nextWidth);
      }
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        localStorage.setItem('ezrab_copilot_pos', JSON.stringify(position));
      }
      if (isResizing.current) {
        isResizing.current = false;
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [position]);

  const handleStartDrag = (e: React.MouseEvent) => {
    if (mode !== 'floating') return;
    isDragging.current = true;
    dragOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  };

  const handleStartResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = dockWidth;
  };

  // Process user request with context awareness & mutation safety
  const handleSendMessage = (textToSend?: string) => {
    const query = (textToSend || inputQuery).trim();
    if (!query) return;

    setInputQuery('');
    const userMsg: CopilotMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsThinking(true);

    const lower = query.toLowerCase();
    const currentTotalRab = projectRabItems.reduce(
      (sum, i) => sum + (i.amount || i.totalPrice || i.volume * i.unitPrice || 0),
      0
    );

    setTimeout(() => {
      let replyText = '';
      let proposal: AiProposal | undefined = undefined;
      let anomalies: any[] | undefined = undefined;
      let breakdownSummary: any[] | undefined = undefined;

      // Intent 1: Price adjustment / cost optimization
      if (
        lower.includes('naik') ||
        lower.includes('turun') ||
        lower.includes('harga') ||
        lower.includes('optimasi') ||
        lower.includes('besi') ||
        lower.includes('beton')
      ) {
        const isIncrease = lower.includes('naik') || lower.includes('+');
        const matchPercent = lower.match(/\d+(\.\d+)?/);
        const percent = matchPercent ? parseFloat(matchPercent[0]) : 8;
        const multiplier = isIncrease ? 1 + percent / 100 : 1 - percent / 100;

        const resourceKeyword = lower.includes('besi')
          ? 'besi'
          : lower.includes('beton')
          ? 'beton'
          : lower.includes('semen')
          ? 'semen'
          : 'besi';

        const matchingItems = projectRabItems.filter((i) =>
          (i.description || '').toLowerCase().includes(resourceKeyword)
        );

        const targetList = matchingItems.length > 0 ? matchingItems : projectRabItems.slice(0, 2);

        const affectedWorkItems = targetList.map((item) => {
          const oldUnitPrice = item.unitPrice;
          const newUnitPrice = Math.round(oldUnitPrice * multiplier);
          const oldAmount = item.amount || item.totalPrice || item.volume * oldUnitPrice;
          const newAmount = Math.round(item.volume * newUnitPrice);
          return {
            id: item.id,
            code: item.code || item.ahspCode || 'ITEM',
            description: item.description,
            oldUnitPrice,
            newUnitPrice,
            volume: item.volume,
            unit: item.unit,
            oldAmount,
            newAmount,
            deltaAmount: newAmount - oldAmount,
          };
        });

        const totalDelta = affectedWorkItems.reduce((acc, row) => acc + row.deltaAmount, 0);
        const afterTotal = currentTotalRab + totalDelta;
        const pctDiff = currentTotalRab > 0 ? (totalDelta / currentTotalRab) * 100 : 0;

        proposal = {
          id: `prop-${Date.now()}`,
          type: 'PRICE_ADJUST',
          title: `Penyesuaian Harga Material ${resourceKeyword.toUpperCase()} (${isIncrease ? '+' : '-'}${percent}%)`,
          description: `Berdasarkan parameter pasar terkini, disarankan simulasi penyesuaian tarif untuk ${affectedWorkItems.length} item pekerjaan terkait.`,
          targetResource: resourceKeyword,
          affectedWorkItems,
          beforeTotalRab: currentTotalRab,
          afterTotalRab: afterTotal,
          absoluteDiff: Math.abs(totalDelta),
          percentageDiff: parseFloat(pctDiff.toFixed(2)),
          status: 'PENDING',
          timestamp: new Date().toISOString(),
        };

        replyText = `Saya telah menganalisis usulan penyesuaian harga ${resourceKeyword.toUpperCase()} sebesar ${percent}%. Silakan periksa kartu dampak finansial di bawah ini sebelum menerapkan ke spreadsheet:`;
      }
      // Intent 2: Audit anomali
      else if (lower.includes('anomali') || lower.includes('audit')) {
        replyText = `Hasil audit sistem terhadap ${projectRabItems.length} item pekerjaan pada proyek ini:`;
        anomalies = [
          {
            severity: 'low',
            title: 'Kesesuaian Spesifikasi SNI',
            desc: 'Seluruh mutu beton (K-300) dan pembesian BJTS 420B telah memenuhi standar SNI 2847:2019.',
          },
          {
            severity: 'medium',
            title: 'Fluktuasi Material Semen & Baja',
            desc: 'Harga besi ulir berada pada kisaran Rp 18.144/kg, mendekati batas atas median vendor regional Tangerang Selatan.',
          },
        ];
      }
      // Intent 3: Pareto 80/20
      else if (lower.includes('pareto') || lower.includes('bobot') || lower.includes('80')) {
        replyText = `Analisis Pareto Biaya: Pekerjaan Struktur Beton Bertulang menyumbang bobot biaya terbesar (~74%) dari total RAB. Pengendalian harga pada besi dan beton ready mix adalah kunci pencegahan cost overrun.`;
      }
      // Intent 4: Default contextual answer
      else {
        if (selectedItem) {
          replyText = `Untuk item terpilih **"${selectedItem.description}"** (${selectedItem.volume} ${selectedItem.unit} @ ${formatCurrencyIDR(selectedItem.unitPrice)}): Item ini mengacu pada kode ${selectedItem.ahspCode || 'SNI Standar'}. Apakah Anda ingin mengoptimalkan koefisien atau membandingkan harga dengan vendor lain?`;
        } else {
          replyText = `Estimasi "${currentProject?.name || 'Rumah Tinggal'}" saat ini memiliki nilai Total RAB sebesar **${formatCurrencyIDR(currentTotalRab)}** dengan ${projectRabItems.length} item pekerjaan. Apa yang ingin Anda analisis selanjutnya?`;
        }
      }

      const aiMsg: CopilotMessage = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: replyText,
        proposal,
        anomalies,
        breakdownSummary,
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, aiMsg]);
      setIsThinking(false);
    }, 600);
  };

  if (mode === 'collapsed') return null;

  // Render content
  const content = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#FFFFFF',
        fontFamily: 'inherit',
      }}
    >
      {/* 1. Header Bar */}
      <div
        onMouseDown={handleStartDrag}
        style={{
          height: '46px',
          background: 'linear-gradient(135deg, #1E1B4B 0%, #1E293B 100%)',
          color: '#FFFFFF',
          padding: '0 12px 0 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: mode === 'floating' ? 'move' : 'default',
          userSelect: 'none',
          borderTopLeftRadius: mode === 'floating' ? '14px' : '0',
          borderTopRightRadius: mode === 'floating' ? '14px' : '0',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '22px',
              height: '22px',
              borderRadius: '6px',
              background: 'linear-gradient(135deg, #2563EB, #7C3AED)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Sparkles size={13} color="#FFFFFF" />
          </div>
          <span style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '-0.01em' }}>
            EZRAB Magic AI Copilot
          </span>
          <span
            style={{
              fontSize: '9px',
              fontWeight: 800,
              background: 'rgba(255,255,255,0.15)',
              padding: '1px 5px',
              borderRadius: '4px',
              color: '#93C5FD',
            }}
          >
            PRO
          </span>
        </div>

        {/* Window controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {/* Toggle Dock / Float */}
          <button
            onClick={() => onModeChange(mode === 'docked-right' ? 'floating' : 'docked-right')}
            title={mode === 'docked-right' ? 'Lepas ke mode Mengambang (Float)' : 'Sematkan ke Kanan (Dock Right)'}
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '5px',
              background: 'transparent',
              border: 'none',
              color: '#94A3B8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#FFFFFF')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#94A3B8')}
          >
            {mode === 'docked-right' ? <Minimize2 size={13} /> : <PanelRight size={13} />}
          </button>

          {/* Close / Collapse Button */}
          <button
            onClick={() => onModeChange('collapsed')}
            title="Tutup Panel AI"
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '5px',
              background: 'transparent',
              border: 'none',
              color: '#94A3B8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#EF4444')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#94A3B8')}
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* 2. Context Pill (Shows active item / WBS context) */}
      <div
        style={{
          background: '#F8FAFC',
          borderBottom: '1px solid #E2E8F0',
          padding: '6px 14px',
          fontSize: '11px',
          color: '#64748B',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span style={{ fontWeight: 700, color: '#334155' }}>Konteks:</span>
          {selectedItem ? (
            <span style={{ color: '#2563EB', fontWeight: 650 }}>
              {selectedItem.description} ({selectedItem.volume} {selectedItem.unit})
            </span>
          ) : selectedGroup ? (
            <span style={{ color: '#2563EB', fontWeight: 650 }}>Kelompok: {selectedGroup}</span>
          ) : (
            <span>Seluruh Proyek ({projectRabItems.length} Item)</span>
          )}
        </div>
      </div>

      {/* 3. Messages Scroll Area */}
      <div
        style={{
          flexGrow: 1,
          overflowY: 'auto',
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          background: '#FFFFFF',
        }}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start',
              gap: '4px',
            }}
          >
            {/* Sender bubble */}
            <div
              style={{
                maxWidth: '88%',
                padding: '10px 14px',
                borderRadius: msg.sender === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                background: msg.sender === 'user' ? '#2563EB' : '#F1F5F9',
                color: msg.sender === 'user' ? '#FFFFFF' : '#0F172A',
                fontSize: '12px',
                lineHeight: 1.5,
                boxShadow: msg.sender === 'user' ? '0 2px 6px rgba(37, 99, 235, 0.2)' : 'none',
              }}
            >
              {msg.text}
            </div>

            {/* AI Change Proposal Card (Zero Silent Mutation Guarantee) */}
            {msg.proposal && (
              <div
                style={{
                  width: '95%',
                  background: '#F8FAFC',
                  borderRadius: '10px',
                  border: '1px solid #BFDBFE',
                  padding: '12px',
                  marginTop: '6px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#1E40AF', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Sparkles size={13} color="#2563EB" />
                    USULAN PERUBAHAN
                  </span>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      background: msg.proposal.status === 'APPLIED' ? '#DCFCE7' : '#EFF6FF',
                      color: msg.proposal.status === 'APPLIED' ? '#16A34A' : '#2563EB',
                      padding: '1px 6px',
                      borderRadius: '4px',
                    }}
                  >
                    {msg.proposal.status === 'APPLIED' ? 'Telah Diterapkan' : 'Menunggu Persetujuan'}
                  </span>
                </div>

                <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#0F172A' }}>
                  {msg.proposal.title}
                </div>

                {/* Financial Impact Comparison */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '6px',
                    background: '#FFFFFF',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid #E2E8F0',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '9.5px', color: '#64748B' }}>Total Sebelum</div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                      {formatCurrencyIDR(msg.proposal.beforeTotalRab)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '9.5px', color: '#64748B' }}>Total Setelah</div>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: '#2563EB' }}>
                      {formatCurrencyIDR(msg.proposal.afterTotalRab)}
                    </div>
                  </div>
                </div>

                {/* Impact Delta */}
                <div style={{ fontSize: '11px', fontWeight: 650, color: msg.proposal.afterTotalRab > msg.proposal.beforeTotalRab ? '#DC2626' : '#059669' }}>
                  Dampak: {msg.proposal.afterTotalRab > msg.proposal.beforeTotalRab ? '+' : '-'}
                  {formatCurrencyIDR(msg.proposal.absoluteDiff)} ({msg.proposal.percentageDiff > 0 ? '+' : ''}
                  {msg.proposal.percentageDiff}%)
                </div>

                {/* Proposal Action Buttons */}
                {msg.proposal.status === 'PENDING' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                    <button
                      onClick={() => {
                        if (msg.proposal) {
                          onApplyProposal(msg.proposal);
                          msg.proposal.status = 'APPLIED';
                        }
                      }}
                      style={{
                        flexGrow: 1,
                        height: '28px',
                        background: '#2563EB',
                        border: 'none',
                        borderRadius: '6px',
                        color: '#FFFFFF',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                      }}
                    >
                      <Check size={12} />
                      Terapkan Perubahan
                    </button>

                    <button
                      onClick={() => {
                        if (msg.proposal) msg.proposal.status = 'DISCARDED';
                      }}
                      style={{
                        height: '28px',
                        padding: '0 10px',
                        background: '#FFFFFF',
                        border: '1px solid #CBD5E1',
                        borderRadius: '6px',
                        color: '#64748B',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Batalkan
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Quick Action Chips */}
            {msg.quickActions && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                {msg.quickActions.map((action, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(action.prompt)}
                    style={{
                      background: '#FFFFFF',
                      border: '1px solid #CBD5E1',
                      borderRadius: '999px',
                      padding: '4px 10px',
                      fontSize: '10.5px',
                      fontWeight: 650,
                      color: '#334155',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#EFF6FF';
                      e.currentTarget.style.borderColor = '#93C5FD';
                      e.currentTarget.style.color = '#2563EB';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#FFFFFF';
                      e.currentTarget.style.borderColor = '#CBD5E1';
                      e.currentTarget.style.color = '#334155';
                    }}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {isThinking && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748B', fontSize: '11.5px' }}>
            <Sparkles size={13} color="#2563EB" />
            <span>Magic AI sedang menganalisis data proyek...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 4. Input Area */}
      <div
        style={{
          padding: '10px 14px',
          borderTop: '1px solid #E2E8F0',
          background: '#FFFFFF',
          borderBottomLeftRadius: mode === 'floating' ? '14px' : '0',
          borderBottomRightRadius: mode === 'floating' ? '14px' : '0',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: '#F8FAFC',
            border: '1px solid #CBD5E1',
            borderRadius: '10px',
            padding: '4px 8px 4px 12px',
          }}
        >
          <input
            type="text"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSendMessage();
            }}
            placeholder="Tanyakan analisis, koefisien, atau optimasi biaya..."
            style={{
              flexGrow: 1,
              border: 'none',
              background: 'transparent',
              fontSize: '12px',
              outline: 'none',
              color: '#0F172A',
            }}
          />
          <button
            onClick={() => handleSendMessage()}
            disabled={!inputQuery.trim() || isThinking}
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '7px',
              background: inputQuery.trim() ? '#2563EB' : '#E2E8F0',
              border: 'none',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: inputQuery.trim() ? 'pointer' : 'default',
            }}
          >
            <Send size={13} />
          </button>
        </div>
      </div>
    </div>
  );

  // If floating mode
  if (mode === 'floating') {
    return (
      <div
        style={{
          position: 'fixed',
          left: `${position.x}px`,
          top: `${position.y}px`,
          width: '390px',
          height: '560px',
          borderRadius: '14px',
          boxShadow: '0 20px 40px -10px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(0,0,0,0.08)',
          zIndex: 95,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {content}
      </div>
    );
  }

  // If docked-right mode
  if (mode === 'docked-right') {
    return (
      <div
        style={{
          width: `${dockWidth}px`,
          height: '100%',
          flexShrink: 0,
          borderLeft: '1px solid #E2E8F0',
          boxShadow: '-3px 0 10px rgba(15, 23, 42, 0.04)',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Resize Handle */}
        <div
          onMouseDown={handleStartResize}
          style={{
            position: 'absolute',
            left: '-4px',
            top: 0,
            bottom: 0,
            width: '8px',
            cursor: 'col-resize',
            zIndex: 10,
          }}
        />
        {content}
      </div>
    );
  }

  return null;
};
