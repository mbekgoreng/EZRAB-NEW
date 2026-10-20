import React, { useState, useCallback } from 'react';
import { RabWizard, type RabWizardData } from './RabWizard';
import { AiDesignStudio } from './AiDesignStudio';
import type { HouseSpec } from './specEngine';
import type { spreadsheetToWorkItems } from './designToRabBridge';

interface DesignWizardFlowProps {
  initialPrompt?: string;
  onComplete?: (spec: HouseSpec, items: ReturnType<typeof spreadsheetToWorkItems>) => void;
  onClose?: () => void;
}

type Phase = 'wizard' | 'design';

/**
 * Alur terpadu: Wizard RAB → AI Design Studio.
 *
 * 1. Pengguna mengisi wizard (tipe, dimensi, ruang, lokasi, kualitas).
 * 2. Data wizard diubah menjadi prompt desain.
 * 3. AI Design Studio menampilkan spec → denah 2D → 3D → spreadsheet.
 * 4. Pengguna menyetujui → data siap ke QTO/RAB.
 */
export const DesignWizardFlow: React.FC<DesignWizardFlowProps> = ({
  initialPrompt, onComplete, onClose,
}) => {
  const [phase, setPhase] = useState<Phase>(initialPrompt ? 'design' : 'wizard');
  const [designPrompt, setDesignPrompt] = useState(initialPrompt || '');

  const wizardToPrompt = useCallback((data: RabWizardData): string => {
    const rooms: string[] = [];
    if (data.kamarTidur > 0) rooms.push(`${data.kamarTidur} kamar tidur`);
    if (data.kamarMandi > 0) rooms.push(`${data.kamarMandi} kamar mandi`);
    if (data.ruangTamu) rooms.push('ruang tamu');
    if (data.dapur) rooms.push('dapur');
    if (data.carport) rooms.push('carport');
    const luas = (data.bangunanLebar * data.bangunanPanjang).toFixed(0);
    return `Buatkan rumah ${data.lantai} lantai luas bangunan ${luas} m², ` +
      `ukuran ${data.bangunanLebar} × ${data.bangunanPanjang} m, ${rooms.join(', ')}.`;
  }, []);

  const handleWizardComplete = useCallback((data: RabWizardData) => {
    setDesignPrompt(wizardToPrompt(data));
    setPhase('design');
  }, [wizardToPrompt]);

  return (
    <div>
      {phase === 'wizard' ? (
        <RabWizard
          onComplete={handleWizardComplete}
          onCancel={() => onClose?.()}
        />
      ) : (
        <div>
          <button
            onClick={() => setPhase('wizard')}
            style={{
              marginBottom: 12, padding: '7px 14px', borderRadius: 10,
              border: '1px solid var(--ez-color-border)', background: 'var(--ez-color-surface)',
              color: 'var(--ez-color-text-secondary)', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            }}
          >
            ← Ubah Spesifikasi Wizard
          </button>
          <AiDesignStudio
            initialPrompt={designPrompt}
            onApprove={(spec, items) => onComplete?.(spec, items)}
          />
        </div>
      )}
    </div>
  );
};

export default DesignWizardFlow;
