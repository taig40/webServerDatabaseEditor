import { create } from 'zustand';

/** Shape of a single toast notification message. */
export interface ToastMessage {
  id: string;
  text: string;
  type: 'success' | 'error' | 'info';
}

interface ToastStore {
  toasts: ToastMessage[];
  /**
   * Adds a new toast to the queue and schedules its automatic removal.
   *
   * @param text - The message to display.
   * @param type - Visual variant: `"success"`, `"error"`, or `"info"`.
   * @param duration - Auto-dismiss delay in milliseconds (0 = no auto-dismiss).
   * @returns The generated toast ID.
   */
  addToast: (text: string, type?: 'success' | 'error' | 'info', duration?: number) => string;
  /** Immediately removes the toast with the given ID from the queue. */
  removeToast: (id: string) => void;
}

/**
 * Global toast notification store.
 *
 * Manages a queue of transient UI messages.  Prefer the {@link toast} helper
 * object over calling store actions directly in component code.
 *
 * @example
 * ```ts
 * import { toast } from '../store/useToastStore';
 * toast.success(t('item.saved'));
 * toast.error(t('error.generic'));
 * ```
 */
export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (text, type = 'success', duration = 3000) => {
    const id = Math.random().toString(36).substring(2, 9);
    set((state) => ({
      toasts: [...state.toasts, { id, text, type }],
    }));
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      }, duration);
    }
    return id;
  },
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));

/**
 * Imperative helper for firing toasts outside of React components.
 *
 * @example
 * ```ts
 * toast.success('Saved!');
 * toast.error('Something went wrong', 5000);
 * const id = toast.info('Loading…', 0);
 * toast.dismiss(id);
 * ```
 */
export const toast = {
  success: (text: string, duration?: number) => useToastStore.getState().addToast(text, 'success', duration),
  error: (text: string, duration?: number) => useToastStore.getState().addToast(text, 'error', duration),
  info: (text: string, duration?: number) => useToastStore.getState().addToast(text, 'info', duration),
  dismiss: (id: string) => useToastStore.getState().removeToast(id),
};
