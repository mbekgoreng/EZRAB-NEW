import '../../../styles/landing-motion.css';

/**
 * Motion enhancer untuk permukaan publik (beranda & /faq).
 * Menambahkan animasi advanced tanpa mengubah markup komponen:
 * - split-text kata-per-kata pada judul (hero, workflow, [data-split])
 *   dengan stagger rise + unblur; elemen ber-gradient-text (background-
 *   clip:text) dibungkus utuh agar clip-nya tidak rusak.
 * - reveal blok .mrv/.mrv-on via IntersectionObserver ([data-reveal]
 *   + selektor otomatis hero/workflow/footer).
 * - tilt 3D + glare mengikuti kursor pada kartu NON-interaktif
 *   (tile/hcard), aktif hanya SETELAH kartu selesai reveal (.rv-on).
 *   Kartu harga (.plan) SENGAJA tidak di-tilt: tilt menggeser tombol
 *   CTA di dalamnya di antara mousedown–mouseup sehingga klik pertama
 *   bisa hilang (D-06, Batch G1).
 * - TIDAK ADA magnetic pada tombol: magnetic menggeser tombol CTA
 *   hingga ±10px mengikuti kursor — mekanisme paling jelas untuk klik
 *   pertama yang "tidak jalan" (D-06). Dihapus Batch G1; kilau hover
 *   (CSS) tetap ada sebagai umpan balik visual.
 * - parallax ringan stage hero mengikuti scroll.
 * - kelas .motion-sway pada maskot (bob + sway).
 * Menghormati prefers-reduced-motion: semua dilewati, konten tampil
 * penuh via kelas .motion-off. Mengembalikan fungsi cleanup.
 */
export function enhanceLandingMotion(root: HTMLElement): () => void {
  const cleanups: Array<() => void> = [];
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    root.classList.add('motion-off');
    return () => root.classList.remove('motion-off');
  }

  /* ---------- split-text ---------- */
  const splitWords = (el: HTMLElement) => {
    if (el.dataset.splitDone) return;
    el.dataset.splitDone = '1';
    let idx = 0;
    const wrapWord = (text: string): HTMLSpanElement => {
      const w = document.createElement('span');
      w.className = 'mw';
      w.style.setProperty('--d', `${Math.min(idx++ * 55, 620)}ms`);
      w.textContent = text;
      return w;
    };
    const process = (parent: Node) => {
      Array.from(parent.childNodes).forEach((child) => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          (child.textContent || '').split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) frag.appendChild(document.createTextNode(' '));
            else frag.appendChild(wrapWord(part));
          });
          parent.replaceChild(frag, child);
        } else if (child.nodeType === 1) {
          const cel = child as HTMLElement;
          const clip = window.getComputedStyle(cel).webkitBackgroundClip;
          if (clip === 'text') {
            // Elemen gradient-text: bungkus utuh, jangan dipecah isinya.
            const w = document.createElement('span');
            w.className = 'mw';
            w.style.setProperty('--d', `${Math.min(idx++ * 55, 620)}ms`);
            cel.parentNode?.replaceChild(w, cel);
            w.appendChild(cel);
          } else {
            process(cel);
          }
        }
      });
    };
    process(el);
    el.classList.add('split-host');
  };

  const splitTargets = root.querySelectorAll<HTMLElement>(
    '.ch-headline, .ez-wf-heading, [data-split]'
  );
  splitTargets.forEach(splitWords);

  /* ---------- reveal ---------- */
  const revealSet = new Set<HTMLElement>();
  const addReveal = (el: Element | null, delay = 0) => {
    if (!el) return;
    const hel = el as HTMLElement;
    if (delay) hel.style.setProperty('--d', `${delay}ms`);
    revealSet.add(hel);
  };
  splitTargets.forEach((el) => addReveal(el));
  root
    .querySelectorAll(
      '.ch-subheadline, .ch-cta-row, .ch-hero-note, .ez-wf-eyebrow, .ez-wf-body, .ez-wf-cta-link, .ez-wf-pipeline-right, [data-reveal]'
    )
    .forEach((el) => addReveal(el));
  root.querySelectorAll('.ch-feature-icons li').forEach((el, i) => addReveal(el, i * 90));
  root
    .querySelectorAll('.ezai-footer .fgrid > div')
    .forEach((el, i) => addReveal(el, i * 90));

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('mrv-on');
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -7% 0px' }
  );
  revealSet.forEach((el) => {
    el.classList.add('mrv');
    io.observe(el);
  });
  cleanups.push(() => io.disconnect());

  /* ---------- tilt 3D + glare ---------- */
  const addTilt = (el: HTMLElement, max = 7) => {
    if (el.dataset.tiltDone) return;
    el.dataset.tiltDone = '1';
    el.setAttribute('data-tilt', '');
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      // Di dalam showcase, tilt hanya setelah reveal selesai agar
      // transform reveal tidak dilawan.
      if (el.closest('.ezai-scope') && !el.classList.contains('rv-on')) return;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.transform = `perspective(900px) rotateX(${((0.5 - y) * max).toFixed(2)}deg) rotateY(${((x - 0.5) * max).toFixed(2)}deg)`;
        el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
        el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
        el.classList.add('tilting');
      });
    };
    const onLeave = () => {
      cancelAnimationFrame(raf);
      el.style.transform = '';
      el.classList.remove('tilting');
    };
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    cleanups.push(() => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
    });
  };
  // D-06: .plan DIKELUARKAN — kartu harga berisi tombol CTA; tilt
  // menggeser tombol di bawah kursor di antara mousedown dan mouseup.
  root
    .querySelectorAll<HTMLElement>('.ezai-scope .tile, .ezai-scope .hcard')
    .forEach((el) => addTilt(el));

  /* ---------- magnetic: DIHAPUS (D-06, Batch G1) ----------
     Magnetic menggeser tombol CTA utama hingga ±10px mengikuti kursor,
     sehingga mouseup bisa mendarat di luar tombol yang ditekan saat
     mousedown — klik pertama hilang tanpa jejak. Tidak ada pengganti:
     tombol CTA tidak boleh bergerak di bawah kursor. Kilau hover CSS
     (.ch-cta-primary::after) tetap memberi umpan balik visual. */

  /* ---------- maskot sway ---------- */
  root
    .querySelectorAll('.mascot-cta, .mascot-hero')
    .forEach((el) => el.classList.add('motion-sway'));

  /* ---------- parallax stage hero ---------- */
  const stage = root.querySelector<HTMLElement>('.ch-hero-stage');
  if (stage) {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        if (y < window.innerHeight * 1.2) {
          stage.style.transform = `translateY(${(y * 0.05).toFixed(1)}px)`;
        }
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    cleanups.push(() => window.removeEventListener('scroll', onScroll));
  }

  return () => cleanups.forEach((fn) => fn());
}
