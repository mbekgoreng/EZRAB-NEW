/**
 * NotificationBell — bell icon + unread badge + notification panel.
 *
 * - Bell button shows an unread count badge (99+ capped).
 * - Clicking toggles the dropdown panel; clicking outside closes it.
 * - "Tandai semua dibaca" marks everything read.
 * - Clicking an item marks it read and forwards it to onItemClick (e.g. navigate).
 * - Times render as Indonesian relative time ("5 menit yang lalu").
 *
 * Works without a provider: useNotifications() falls back to no-op defaults,
 * so the bell renders an empty state until the coordinator mounts
 * <NotificationProvider> in App.tsx.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Bell, CheckCircle2, AlertCircle, Info, Sparkles, Trash2 } from 'lucide-react';
import {
  useNotifications,
  type NotificationItem,
  type NotificationType,
} from './NotificationContext';
import { useI18n } from '../i18n';

interface NotificationBellProps {
  isNarrowMobile?: boolean;
  onItemClick?: (item: NotificationItem) => void;
  onOpenSettings?: () => void;
}

function formatRelative(ts: number): string {
  const diffMs = Date.now() - ts;
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'baru saja';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} menit yang lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam yang lalu`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} hari yang lalu`;
  return new Date(ts).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function TypeIcon({ type }: { type: NotificationType }): React.ReactElement {
  switch (type) {
    case 'success':
      return <CheckCircle2 size={16} color="#10B981" />;
    case 'error':
      return <AlertCircle size={16} color="#EF4444" />;
    case 'ai':
      return <Sparkles size={16} color="#7C3AED" />;
    case 'info':
    default:
      return <Info size={16} color="#2563EB" />;
  }
}

const TYPE_LABEL: Record<NotificationType, string> = {
  ai: 'AI',
  error: 'ERROR',
  info: 'INFO',
  success: 'BERHASIL',
};

export const NotificationBell: React.FC<NotificationBellProps> = ({
  isNarrowMobile = false,
  onItemClick,
  onOpenSettings,
}) => {
  const { t } = useI18n();
  const { notifications, unreadCount, markRead, markAllRead, clearRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleItemClick = (item: NotificationItem) => {
    if (!item.read) markRead(item.id);
    if (onItemClick) onItemClick(item);
  };

  return (
    <div style={{ position: 'relative' }} ref={rootRef}>
      <button
        onClick={() => setOpen(!open)}
        aria-label={t('notif.judul')}
        aria-expanded={open}
        style={{
          position: 'relative',
          width: '38px',
          height: '38px',
          borderRadius: '9px',
          background: open ? '#EFF6FF' : 'transparent',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: open ? '#2563EB' : '#64748B',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => {
          if (!open) {
            e.currentTarget.style.background = '#F8FAFC';
            e.currentTarget.style.color = '#0F172A';
          }
        }}
        onMouseLeave={(e) => {
          if (!open) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = '#64748B';
          }
        }}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '6px',
              right: '6px',
              minWidth: '15px',
              height: '15px',
              padding: '0 3px',
              borderRadius: '999px',
              background: '#EF4444',
              color: '#FFFFFF',
              fontSize: '9.5px',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid #FFFFFF',
              boxSizing: 'border-box',
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Panel notifikasi"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: isNarrowMobile ? '-60px' : '0',
            width: isNarrowMobile ? '310px' : '360px',
            background: '#FFFFFF',
            borderRadius: '14px',
            border: '1px solid #E5E7EB',
            boxShadow: '0 12px 32px rgba(15,23,42,0.12)',
            zIndex: 100,
            overflow: 'hidden',
            animation: 'ezrabFadeIn 0.18s ease-out',
          }}
        >
          <div
            style={{
              padding: '14px 16px',
              borderBottom: '1px solid #F1F5F9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#FAFAFA',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#0F172A' }}>{t('notif.judul')}</span>
              {unreadCount > 0 && (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    background: '#EFF6FF',
                    color: '#2563EB',
                    padding: '1px 7px',
                    borderRadius: '999px',
                  }}
                >
                  {unreadCount} belum dibaca
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  color: '#2563EB',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                {t('notif.tandai_dibaca')}
              </button>
            )}
          </div>

          <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>
                {t('notif.kosong')}
              </div>
            ) : (
              notifications.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleItemClick(item);
                    }
                  }}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid #F1F5F9',
                    display: 'flex',
                    gap: '12px',
                    background: item.read ? '#FFFFFF' : '#F8FAFC',
                    transition: 'background 0.15s ease',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#F1F5F9';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = item.read ? '#FFFFFF' : '#F8FAFC';
                  }}
                >
                  <div style={{ marginTop: '2px', flexShrink: 0 }}>
                    <TypeIcon type={item.type} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          color: '#64748B',
                          background: '#F1F5F9',
                          padding: '1px 5px',
                          borderRadius: '4px',
                        }}
                      >
                        {TYPE_LABEL[item.type]}
                      </span>
                      <span style={{ fontSize: '11px', color: '#94A3B8', whiteSpace: 'nowrap' }}>
                        {formatRelative(item.createdAt)}
                      </span>
                    </div>
                    <div style={{ fontSize: '12.5px', fontWeight: 650, color: '#0F172A', marginTop: '3px' }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748B', lineHeight: 1.4, marginTop: '2px' }}>
                      {item.message}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div
            style={{
              padding: '10px 16px',
              background: '#FAFAFA',
              borderTop: '1px solid #F1F5F9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <button
              onClick={clearRead}
              disabled={!notifications.some((n) => n.read)}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: '12px',
                fontWeight: 600,
                color: !notifications.some((n) => n.read) ? '#CBD5E1' : '#94A3B8',
                cursor: !notifications.some((n) => n.read) ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
              title="Hapus notifikasi yang sudah dibaca"
            >
              <Trash2 size={13} />
              Hapus dibaca
            </button>
            <button
              onClick={() => {
                setOpen(false);
                if (onOpenSettings) onOpenSettings();
              }}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: '12px',
                fontWeight: 650,
                color: '#2563EB',
                cursor: 'pointer',
              }}
            >
              {t('notif.lihat_semua')} →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
