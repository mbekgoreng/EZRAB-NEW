/** Daftar isi artikel (anchor ke heading h2/h3). */
import React from 'react';
import type { BlogTocItem } from '../types';

export const Toc: React.FC<{ items: BlogTocItem[] }> = ({ items }) => {
  if (items.length === 0) return null;
  return (
    <aside className="ezb-toc" aria-label="Daftar isi">
      <h2>Daftar Isi</h2>
      <ol>
        {items.map((item) => (
          <li key={item.id} className={item.depth === 3 ? 'ezb-toc-h3' : undefined}>
            <a href={`#${item.id}`}>{item.text}</a>
          </li>
        ))}
      </ol>
    </aside>
  );
};

export default Toc;
