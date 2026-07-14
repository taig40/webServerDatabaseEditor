import { create } from 'zustand';

export interface ToastMessage {
  id: string;
  text: string;
  type: 'success' | 'error' | 'info';
}

interface ToastStore {
  toasts: ToastMessage[];
  addToast: (text: string, type?: 'success' | 'error' | 'info', duration?: number) => void;
  removeToast: (id: string) => void;
}

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
  },
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));

export const toast = {
  success: (text: string, duration?: number) => useToastStore.getState().addToast(text, 'success', duration),
  error: (text: string, duration?: number) => useToastStore.getState().addToast(text, 'error', duration),
  info: (text: string, duration?: number) => useToastStore.getState().addToast(text, 'info', duration),
};
