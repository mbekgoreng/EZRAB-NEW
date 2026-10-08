/**
 * notificationBus — standalone event emitter for application notifications.
 *
 * Event sources (AI chat completion, AI errors, Co-Assistant failures, ...) can
 * publish notifications through this bus WITHOUT importing the React context.
 * The <NotificationProvider> subscribes to the bus and funnels published
 * events into the notification store.
 *
 * This module intentionally has zero imports from NotificationContext to avoid
 * import cycles (services -> bus -> context -> components -> services).
 */

export interface NotificationEvent {
  type: 'ai' | 'error' | 'info' | 'success';
  title: string;
  message: string;
  /** Optional navigation target: a menu key like 'ezrab-ai', 'ded-ai', 'dokumen-ai'. */
  link?: string;
}

type NotificationSubscriber = (event: NotificationEvent) => void;

const subscribers = new Set<NotificationSubscriber>();

export const notificationBus = {
  /** Subscribe to notification events. Returns an unsubscribe function. */
  subscribe(fn: NotificationSubscriber): () => void {
    subscribers.add(fn);
    return () => {
      subscribers.delete(fn);
    };
  },

  /** Publish a notification event to all subscribers. Never throws. */
  publish(event: NotificationEvent): void {
    subscribers.forEach((fn) => {
      try {
        fn(event);
      } catch (err) {
        console.error('[notificationBus] subscriber error:', err);
      }
    });
  },
};
