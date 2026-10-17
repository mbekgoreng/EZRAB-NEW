/**
 * View markdown yang sudah disanitasi DOMPurify.
 * SSR-safe: renderMarkdownSafe dipanggil saat render; di browser memakai
 * window, di Node (prerender) memakai domWindow yang didaftarkan via
 * setNodeDomWindow().
 */
import React, { useMemo } from 'react';
import { renderMarkdownSafe } from '../markdown';

export const MarkdownView: React.FC<{ markdown: string; className?: string }> = ({
  markdown,
  className,
}) => {
  const html = useMemo(() => renderMarkdownSafe(markdown), [markdown]);
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
};

export default MarkdownView;
