/**
 * NotificationContext — real notification center state for EZRAB.
 *
 * - NotificationItem: { id, type, title, message, createdAt, read, link? }
 * - API: notify, markRead, markAllRead, clearRead, unreadCount
 * - Persisted to localStorage (key `ezrab_notifications_v1`, capped at 50 items).
 * - Also subscribes to `notificationBus` so event sources outside React
 *   (AI services, error handlers) can push notifications.
 *
 * IMPORTANT: useNotifications() is safe to call WITHOUT a provider.
 * When no <NotificationProvider> is mounted it returns a no-op default
 * (empty list, no-op functions) instead of throwing. The coordinator mounts
 * the provider in App.tsx.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { notificationBus } from './notificationBus';

export type NotificationType = 'ai' | 'error' | 'info' | 'success';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  /** Unix epoch ms. */
  createdAt: number;
  read: boolean;
  /** Optional navigation target: a menu key like 'ezrab-ai', 'ded-ai'. */
  link?: string;
}

export interface NotifyInput {
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
}

interface NotificationContextValue {
  notifications: NotificationItem[];
  unreadCount: number;
  notify: (input: NotifyInput) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearRead: () => void;
}

const STORAGE_KEY = 'ezrab_notifications_v1';
const MAX_ITEMS = 50;

const noop = (): void => {};

const defaultValue: NotificationContextValue = {
  notifications: [],
  unreadCount: 0,
  notify: noop,
  markRead: noop,
  markAllRead: noop,
  clearRead: noop,
};

const NotificationContext = createContext<NotificationContextValue>(defaultValue);

/** Safe without a provider: returns no-op defaults instead of throwing. */
export function useNotifications(): NotificationContextValue {
  return useContext(NotificationContext);
}

function makeId(): string {
  return `notif-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function loadInitial(): NotificationItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as NotificationItem[])
      .filter(
        (n) =>
          n &&
          typeof n.id === 'string' &&
          typeof n.title === 'string' &&
          typeof n.message === 'string' &&
          typeof n.createdAt === 'number',
      )
      .slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>(loadInitial);

  // Persist on every change (capped to the newest 50 items).
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications.slice(0, MAX_ITEMS)));
    } catch {
      // Storage unavailable (private mode / quota): keep in-memory only.
    }
  }, [notifications]);

  const notify = useCallback((input: NotifyInput) => {
    const item: NotificationItem = {
      id: makeId(),
      type: input.type,
      title: input.title,
      message: input.message,
      createdAt: Date.now(),
      read: false,
      link: input.link,
    };
    setNotifications((prev) => [item, ...prev].slice(0, MAX_ITEMS));
  }, []);

  // Bridge: events published on the bus become notifications.
  useEffect(() => notificationBus.subscribe((event) => notify(event)), [notify]);

  const markRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearRead = useCallback(() => {
    setNotifications((prev) => prev.filter((n) => !n.read));
  }, []);

  const value = useMemo<NotificationContextValue>(
    () => ({
      notifications,
      unreadCount: notifications.filter((n) => !n.read).length,
      notify,
      markRead,
      markAllRead,
      clearRead,
    }),
    [notifications, notify, markRead, markAllRead, clearRead],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
};
