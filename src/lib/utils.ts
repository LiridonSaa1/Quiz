import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { supabase } from '../supabase';
import { buildLegacyNotificationMessage, isMissingNotificationsColumnError } from './notificationSchema';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString();
}

export function formatTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours > 0 ? `${hours}h ` : ""}${mins}m`;
}

export async function sendNotification(
  userId: string,
  title: string,
  message: string,
  type: 'info' | 'success' | 'warning' | 'error' = 'info'
) {
  if (!userId || !String(userId).trim()) {
    return;
  }

  try {
    let payload: Record<string, unknown> = {
      user_id: userId,
      title,
      message,
      type,
      read: false,
      created_at: new Date().toISOString(),
    };

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { error } = await supabase.from('notifications').insert(payload);
      if (!error) return;

      if (isMissingNotificationsColumnError(error, 'title') && 'title' in payload) {
        const { title: _title, ...rest } = payload;
        void _title;
        payload = {
          ...rest,
          message: buildLegacyNotificationMessage(title, message),
        };
        continue;
      }

      if (isMissingNotificationsColumnError(error, 'read') && 'read' in payload) {
        const { read: _read, ...rest } = payload;
        void _read;
        payload = {
          ...rest,
          read_at: null,
        };
        continue;
      }

      console.error('Error sending notification:', error);
      return;
    }
  } catch (error) {
    console.error('Error sending notification:', error);
  }
}
