import { notificationsAPI } from '@/lib/api';

export type NotificationType = 'task_assigned' | 'upload' | 'comment' | 'doc_updated' | 'project_updated';

export interface StoredNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  /** Email of the user who should see this notification */
  assigneeEmail: string;
  taskId?: string;
  taskTitle?: string;
  at: Date;
  read: boolean;
}

const STORAGE_KEY = 'otcr_notifications';

function serialize(items: StoredNotification[]): string {
  return JSON.stringify(
    items.map((n) => ({
      ...n,
      at: n.at instanceof Date ? n.at.toISOString() : n.at,
    }))
  );
}

function deserialize(raw: string): StoredNotification[] {
  try {
    const parsed = JSON.parse(raw) as Array<Omit<StoredNotification, 'at'> & { at: string }>;
    return parsed.map((n) => ({ ...n, at: new Date(n.at) }));
  } catch {
    return [];
  }
}

export function loadNotifications(): StoredNotification[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? deserialize(raw) : [];
}

function saveNotifications(items: StoredNotification[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, serialize(items));
}

export function getNotificationsForUser(userEmail: string | null): StoredNotification[] {
  if (!userEmail) return [];
  return loadNotifications()
    .filter((n) => n.assigneeEmail === userEmail)
    .sort((a, b) => (b.at.getTime ? b.at.getTime() : 0) - (a.at.getTime ? a.at.getTime() : 0));
}

export function addNotification(notification: Omit<StoredNotification, 'id' | 'read' | 'at'>): void {
  const list = loadNotifications();
  const newOne: StoredNotification = {
    ...notification,
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    at: new Date(),
    read: false,
  };
  saveNotifications([newOne, ...list]);

  // Mirror bell notifications to backend so they can flow through Slack if configured.
  void notificationsAPI
    .mirrorBellNotification({
      assigneeEmail: notification.assigneeEmail,
      title: notification.title,
      message: notification.message,
      type: notification.type,
      taskId: notification.taskId,
      taskTitle: notification.taskTitle,
    })
    .catch(() => {
      // Keep local bell notifications working even when backend/slack delivery fails.
    });
}

export function upsertNotifications(notifications: Array<Omit<StoredNotification, 'read'>>): void {
  const existing = loadNotifications();
  const byId = new Map(existing.map((item) => [item.id, item]));

  for (const notification of notifications) {
    const current = byId.get(notification.id);
    byId.set(notification.id, {
      ...notification,
      read: current?.read ?? false,
    });
  }

  const merged = Array.from(byId.values()).sort(
    (a, b) => b.at.getTime() - a.at.getTime(),
  );
  saveNotifications(merged);
}

/** Add a "new task assigned" notification for one assignee. */
export function notifyTaskAssigned(assigneeEmail: string, taskTitle: string, taskId: string): void {
  addNotification({
    type: 'task_assigned',
    title: 'New task added',
    message: `A new task was assigned to you: "${taskTitle}"`,
    assigneeEmail,
    taskId,
    taskTitle: taskTitle,
  });
}

export function markNotificationRead(id: string): void {
  const list = loadNotifications().map((n) => (n.id === id ? { ...n, read: true } : n));
  saveNotifications(list);
}
