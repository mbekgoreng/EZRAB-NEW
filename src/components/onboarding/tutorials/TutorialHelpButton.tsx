/**
 * TutorialHelpButton — tombol "?" untuk membuka tutorial dari halaman fitur.
 *
 * Pakai: <TutorialHelpButton tutorialId="proyek" />
 * Membuka tutorial via event; aman jika tutorial tidak tersedia (tombol disembunyikan).
 */
import { getTutorial, openTutorial } from './tutorialRegistry';

interface Props {
  tutorialId: string;
  /** label aksesibilitas kustom */
  label?: string;
}

export function TutorialHelpButton({ tutorialId, label }: Props) {
  const tutorial = getTutorial(tutorialId);
  if (!tutorial) return null;

  return (
    <button
      onClick={() => openTutorial(tutorialId)}
      aria-label={label ?? `Buka tutorial: ${tutorial.title}`}
      title={tutorial.title}
      data-tutorial-help={tutorialId}
      style={{
        width: 30,
        height: 30,
        borderRadius: 9999,
        border: '1px solid var(--ez-color-border-line)',
        background: 'var(--ez-color-surface)',
        color: 'var(--ez-color-primary)',
        fontSize: 15,
        fontWeight: 800,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      ?
    </button>
  );
}

export default TutorialHelpButton;
