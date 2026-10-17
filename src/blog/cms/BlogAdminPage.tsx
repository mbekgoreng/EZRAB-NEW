/**
 * Halaman CMS blog (/app/blog) — workspace internal.
 *
 * AKSES: wajib sesi role AKTIF dengan capability 'manage-blog'.
 * - Tanpa sesi role → ditolak (tidak ikut mode open).
 * - Sesi role tanpa capability → ditolak.
 * Capability ini TIDAK diberikan ke role demo manapun secara default;
 * pemberian dilakukan manual di src/auth/roleAccounts.ts.
 *
 * PERSISTENCE: InMemoryBlogAdminStore — JELAS NON-PRODUKSI, data hilang
 * saat refresh. BUKAN localStorage. Produksi memakai Supabase
 * (migration disiapkan di supabase/migrations/20261017_blog_cms.sql,
 * BELUM diaplikasikan).
 */
import React, { useMemo, useState } from 'react';
import { useRole } from '../../auth/RoleContext';
import { getClientBlogRepository } from '../repo';
import type { BlogArticle, BlogStatus } from '../types';
import { InMemoryBlogAdminStore } from './store';
import { ArticleEditor, STATUS_LABEL } from './ArticleEditor';

const PAGE_SIZE = 10;

const STATUS_FILTERS: ('all' | BlogStatus)[] = ['all', 'draft', 'review', 'scheduled', 'published', 'archived'];

export const BlogAdminPage: React.FC = () => {
  const { session, hasCapability } = useRole();
  const canManage = !!session && hasCapability('manage-blog');

  const store = useMemo(
    () => new InMemoryBlogAdminStore(getClientBlogRepository().listAll()),
    []
  );
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | BlogStatus>('all');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<BlogArticle | null | 'new'>(null);
  const [tick, setTick] = useState(0);

  const { items, total } = useMemo(
    () => store.list({ query, status: statusFilter, page, pageSize: PAGE_SIZE }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, query, statusFilter, page, tick]
  );
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (!canManage) {
    return (
      <main style={{ padding: '48px 24px', maxWidth: 560, margin: '0 auto' }}>
        <div
          role="alert"
          style={{
            background: 'var(--ez-color-surface)',
            border: '1px solid var(--ez-color-border)',
            borderRadius: 18,
            padding: 32,
            textAlign: 'center',
          }}
        >
          <h1 style={{ fontSize: 20, color: 'var(--ez-color-text-primary)', margin: '0 0 12px' }}>
            Akses CMS Blog Ditolak
          </h1>
          <p style={{ color: 'var(--ez-color-text-muted)', fontSize: 14, lineHeight: 1.65, margin: '0 0 8px' }}>
            {!session
              ? 'Halaman ini membutuhkan sesi role aktif dengan capability manage-blog. Masuk via "Masuk per Role" terlebih dahulu.'
              : `Role "${session.name}" tidak memiliki capability manage-blog.`}
          </p>
          <p style={{ color: 'var(--ez-color-text-muted)', fontSize: 12.5, lineHeight: 1.6, margin: 0 }}>
            Capability <code>manage-blog</code> sengaja tidak diberikan ke role demo manapun secara default.
          </p>
        </div>
      </main>
    );
  }

  if (editing) {
    return (
      <main style={{ padding: '20px 24px', background: 'var(--ez-color-background)', minHeight: 'calc(100vh - 64px)' }}>
        <ArticleEditor
          store={store}
          initial={editing === 'new' ? null : editing}
          authorName={session?.name || 'CMS'}
          onClose={() => setEditing(null)}
          onChanged={() => setTick((t) => t + 1)}
        />
      </main>
    );
  }

  return (
    <main style={{ padding: '20px 24px', background: 'var(--ez-color-background)', minHeight: 'calc(100vh - 64px)' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, color: 'var(--ez-color-text-primary)' }}>Blog CMS</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ez-color-text-muted)' }}>
              Kelola artikel EZRAB Blog — {total} artikel
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditing('new')}
            style={{
              marginLeft: 'auto',
              padding: '10px 18px',
              borderRadius: 12,
              border: 'none',
              background: 'var(--ez-color-primary)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 13.5,
              cursor: 'pointer',
            }}
          >
            + Artikel Baru
          </button>
        </div>

        <div
          role="note"
          style={{
            background: '#fffbeb',
            border: '1px solid #fde68a',
            color: '#92400e',
            borderRadius: 12,
            padding: '10px 16px',
            fontSize: 12.5,
            lineHeight: 1.55,
          }}
        >
          Mode <strong>in-memory</strong> (non-produksi): perubahan hilang saat halaman di-refresh.
          Produksi memakai Supabase — migration disiapkan di{' '}
          <code>supabase/migrations/20261017_blog_cms.sql</code> (belum diaplikasikan).
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="search"
            placeholder="Cari judul / kategori / tag…"
            aria-label="Cari artikel"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            style={{
              flex: '1 1 220px',
              maxWidth: 340,
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid var(--ez-color-border)',
              fontSize: 13.5,
              fontFamily: 'inherit',
              background: 'var(--ez-color-surface)',
              color: 'var(--ez-color-text-primary)',
            }}
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="Filter status">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={statusFilter === s}
                onClick={() => {
                  setStatusFilter(s);
                  setPage(1);
                }}
                style={{
                  padding: '8px 14px',
                  borderRadius: 999,
                  border: '1px solid var(--ez-color-border)',
                  background: statusFilter === s ? 'var(--ez-color-primary)' : 'var(--ez-color-surface)',
                  color: statusFilter === s ? '#fff' : 'var(--ez-color-text-primary)',
                  fontWeight: 700,
                  fontSize: 12.5,
                  cursor: 'pointer',
                }}
              >
                {s === 'all' ? 'Semua' : STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        <div
          style={{
            background: 'var(--ez-color-surface)',
            border: '1px solid var(--ez-color-border)',
            borderRadius: 16,
            overflow: 'hidden',
          }}
        >
          {items.length === 0 ? (
            <p style={{ padding: 32, textAlign: 'center', color: 'var(--ez-color-text-muted)', fontSize: 14 }}>
              Tidak ada artikel yang cocok.
            </p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr style={{ background: 'var(--ez-color-surface-secondary)', textAlign: 'left' }}>
                  <th style={{ padding: '12px 16px' }}>Judul</th>
                  <th style={{ padding: '12px 16px' }}>Kategori</th>
                  <th style={{ padding: '12px 16px' }}>Status</th>
                  <th style={{ padding: '12px 16px' }}>Diperbarui</th>
                  <th style={{ padding: '12px 16px' }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.slug} style={{ borderTop: '1px solid var(--ez-color-border)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--ez-color-text-primary)' }}>
                      {a.title}
                      <div style={{ fontWeight: 400, fontSize: 12, color: 'var(--ez-color-text-muted)' }}>
                        /blog/{a.slug}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--ez-color-text-muted)' }}>{a.category}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          fontSize: 11.5,
                          fontWeight: 800,
                          padding: '3px 10px',
                          borderRadius: 999,
                          background: a.status === 'published' ? '#dcfce7' : '#eef2ff',
                          color: a.status === 'published' ? '#166534' : '#3730a3',
                        }}
                      >
                        {STATUS_LABEL[a.status]}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--ez-color-text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(a.updatedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        onClick={() => setEditing(a)}
                        style={{
                          padding: '7px 14px',
                          borderRadius: 10,
                          border: '1px solid var(--ez-color-border)',
                          background: 'var(--ez-color-surface)',
                          color: 'var(--ez-color-text-primary)',
                          fontWeight: 700,
                          fontSize: 12.5,
                          cursor: 'pointer',
                        }}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid var(--ez-color-border)', background: 'var(--ez-color-surface)', cursor: 'pointer' }}
            >
              ‹ Sebelumnya
            </button>
            <span style={{ fontSize: 13, color: 'var(--ez-color-text-muted)' }}>
              Halaman {page} dari {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid var(--ez-color-border)', background: 'var(--ez-color-surface)', cursor: 'pointer' }}
            >
              Berikutnya ›
            </button>
          </div>
        )}
      </div>
    </main>
  );
};

export default BlogAdminPage;
