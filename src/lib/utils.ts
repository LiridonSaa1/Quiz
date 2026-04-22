import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { supabase } from '../supabase';

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
    const { error } = await supabase.from('notifications').insert({
      user_id: userId,
      title,
      message,
      type,
      read: false,
      created_at: new Date().toISOString(),
    });
    if (error) {
      console.error('Error sending notification:', error);
    }
  } catch (error) {
    console.error('Error sending notification:', error);
  }
}
