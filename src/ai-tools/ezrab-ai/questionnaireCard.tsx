/**
 * questionnaireCard.tsx — Kartu kuesioner spesifikasi adaptif
 * (Adaptive Questionnaire 2026-11-12).
 *
 * Dirender DI DALAM gelembung pesan asisten pada tampilan percakapan
 * kanonis yang sama (pola yang sama dengan PlanControls) — bukan form
 * eksternal, bukan wizard, bukan modal. State pilihan lokal komponen;
 * kirim jawaban lewat onSubmit ke registry (submitQuestionnaireAnswers)
 * yang menerapkannya ke konteks kanonis. Pilihan yang tidak diisi =
 * "Belum ditentukan" (dilewati) — pengguna tidak dipaksa menjawab.
 *
 * Sesudah terkirim, kartu menjadi ringkasan baca-saja dengan tombol
 * "Ubah jawaban" untuk membuka & mengirim ulang (penerapan ulang
 * menimpa jawaban lama per pertanyaan dan mencatat koreksinya).
 */
import React, { useMemo, useState } from 'react';
import { Check, ClipboardList, Pencil } from 'lucide-react';
import type { QuestionnairePayload, QuestionnaireQuestion } from './questionnaire';
import type { QuestionnaireAnswerRecord } from './universalIntake';

const SKIP_ID = '__skip__';
const CUSTOM_ID = '__custom__';

interface DraftAnswer {
  selectedIds: string[];
  customText: string;
  skipped: boolean;
}

const emptyDraft = (): DraftAnswer => ({ selectedIds: [], customText: '', skipped: false });

export function QuestionnaireCard(props: {
  payload: QuestionnairePayload;
  submitted: boolean;
  onSubmit: (answers: Record<string, QuestionnaireAnswerRecord>) => void;
}): React.ReactNode {
  const { payload, submitted, onSubmit } = props;
  const [editing, setEditing] = useState(!submitted);
  const [drafts, setDrafts] = useState<Record<string, DraftAnswer>>({});

  const questions = payload.questions;
  const setDraft = (key: string, patch: Partial<DraftAnswer>) =>
    setDrafts((prev) => ({ ...prev, [key]: { ...(prev[key] ?? emptyDraft()), ...patch } }));

  const toggleMulti = (q: QuestionnaireQuestion, id: string) => {
    const cur = drafts[q.key] ?? emptyDraft();
    const has = cur.selectedIds.includes(id);
    setDraft(q.key, {
      selectedIds: has ? cur.selectedIds.filter((x) => x !== id) : [...cur.selectedIds, id],
      skipped: false,
    });
  };

  const canSubmit = useMemo(() => questions.length > 0, [questions.length]);

  const handleSubmit = () => {
    const out: Record<string, QuestionnaireAnswerRecord> = {};
    for (const q of questions) {
      const d = drafts[q.key] ?? emptyDraft();
      const custom = d.customText.trim();
      const useCustom = custom.length > 0;
      if (d.skipped || (d.selectedIds.length === 0 && !useCustom)) {
        out[q.key] = { selectedIds: [], customText: null, status: 'skipped' };
        continue;
      }
      out[q.key] = {
        selectedIds: [...d.selectedIds],
        customText: useCustom ? custom : null,
        status: 'answered',
      };
    }
    onSubmit(out);
    setEditing(false);
  };

  if (!editing && submitted) {
    return (
      <div className="ezq-card ezq-done">
        <div className="ezq-head">
          <ClipboardList size={15} />
          <span>Jawaban kuesioner tersimpan di konteks proyek.</span>
        </div>
        <button type="button" className="ezq-editbtn" onClick={() => setEditing(true)}>
          <Pencil size={13} /> Ubah jawaban
        </button>
      </div>
    );
  }

  return (
    <div className="ezq-card">
      <div className="ezq-head">
        <ClipboardList size={15} />
        <span>Kuesioner spesifikasi — jawab yang sudah diputuskan, sisanya boleh dilewati.</span>
      </div>
      {questions.map((q, i) => {
        const d = drafts[q.key] ?? emptyDraft();
        return (
          <fieldset key={q.key} className="ezq-q">
            <legend className="ezq-qtitle">
              {i + 1}. {q.prompt}
            </legend>
            <div className="ezq-opts">
              {q.options.map((o) => {
                const active = d.selectedIds.includes(o.id) && !d.skipped;
                return (
                  <button
                    key={o.id}
                    type="button"
                    className={`ezq-opt${active ? ' active' : ''}`}
                    aria-pressed={active}
                    onClick={() =>
                      q.kind === 'multi'
                        ? toggleMulti(q, o.id)
                        : setDraft(q.key, { selectedIds: [o.id], skipped: false })
                    }
                  >
                    {q.kind === 'multi' && (
                      <span className="ezq-check">{active && <Check size={12} />}</span>
                    )}
                    {o.label}
                  </button>
                );
              })}
              <button
                type="button"
                  className={`ezq-opt ezq-skip${d.skipped ? ' active' : ''}`}
                aria-pressed={d.skipped}
                onClick={() => setDraft(q.key, { selectedIds: [], skipped: true })}
              >
                Belum ditentukan
              </button>
            </div>
            {(q.allowCustom || q.kind === 'text') && (
              <input
                className="ezq-custom"
                type="text"
                value={d.customText}
                placeholder={
                  q.kind === 'text' ? 'Tulis jawaban Anda…' : 'Atau tulis jawaban khusus…'
                }
                onChange={(e) => setDraft(q.key, { customText: e.target.value, skipped: false })}
              />
            )}
          </fieldset>
        );
      })}
      <button type="button" className="ezq-submit" disabled={!canSubmit} onClick={handleSubmit}>
        Kirim Jawaban &amp; Tinjau Brief
      </button>
    </div>
  );
}

// Id penanda internal (dipakai tes kontrak sumber) — bukan state.
export const QUESTIONNAIRE_SKIP_ID = SKIP_ID;
export const QUESTIONNAIRE_CUSTOM_ID = CUSTOM_ID;
