import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { FaqItem } from './faqData';
import '../styles/faq.css';

interface FaqAccordionProps {
  items: FaqItem[];
  /** Awalan unik per permukaan (home / fitur / faq) agar ID aria tidak bentrok. */
  idPrefix: string;
}

/**
 * Akordeon FAQ aksesibel dari dataset kanonis (src/faq/faqData.ts).
 * Satu item terbuka pada satu waktu; tombol semantik dengan
 * aria-expanded/aria-controls; panel region berlabel; keyboard native
 * (Enter/Spasi pada <button>). Animasi diringkas di CSS dan dimatikan
 * untuk prefers-reduced-motion.
 */
export const FaqAccordion: React.FC<FaqAccordionProps> = ({ items, idPrefix }) => {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="faq-acc-list">
      {items.map((item) => {
        const open = openId === item.id;
        const btnId = `${idPrefix}-q-${item.id}`;
        const panelId = `${idPrefix}-a-${item.id}`;
        return (
          <div className={`faq-acc-item${open ? ' open' : ''}`} key={item.id}>
            <h3 className="faq-acc-heading">
              <button
                type="button"
                className="faq-acc-q"
                id={btnId}
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpenId(open ? null : item.id)}
              >
                <span>{item.question}</span>
                <ChevronDown size={19} className="faq-acc-chevron" aria-hidden="true" />
              </button>
            </h3>
            {open && (
              <div className="faq-acc-a" id={panelId} role="region" aria-labelledby={btnId}>
                <p>{item.answer}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
