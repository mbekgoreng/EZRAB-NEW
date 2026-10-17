/** Breadcrumb publik blog. */
import React from 'react';

export interface Crumb {
  label: string;
  href?: string;
}

export const Breadcrumb: React.FC<{ items: Crumb[] }> = ({ items }) => (
  <nav className="ezb-breadcrumb" aria-label="Breadcrumb">
    {items.map((item, i) => (
      <React.Fragment key={`${item.label}-${i}`}>
        {i > 0 && (
          <span className="ezb-sep" aria-hidden="true">
            /
          </span>
        )}
        {item.href && i < items.length - 1 ? (
          <a href={item.href}>{item.label}</a>
        ) : (
          <span aria-current={i === items.length - 1 ? 'page' : undefined}>{item.label}</span>
        )}
      </React.Fragment>
    ))}
  </nav>
);

export default Breadcrumb;
