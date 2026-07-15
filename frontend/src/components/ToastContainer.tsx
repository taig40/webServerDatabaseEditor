import React from 'react';
import { useToastStore } from '../store/useToastStore';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const toasts = useToastStore((state) => state.toasts);
  const removeToast = useToastStore((state) => state.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[99999] flex flex-col gap-2 pointer-events-none max-w-md w-full items-end select-none">
      {toasts.map((t) => {
        const isSuccess = t.type === 'success';
        const isError = t.type === 'error';
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-xl shadow-2xl border backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-bottom-5 w-auto max-w-full ${
              isSuccess
                ? 'bg-[#0f1f1a]/95 border-emerald-500/40 text-emerald-200'
                : isError
                ? 'bg-[#2a1215]/95 border-rose-500/40 text-rose-200'
                : 'bg-[#0f1b26]/95 border-cyan-500/40 text-cyan-200'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {isSuccess && <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />}
              {isError && <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />}
              {!isSuccess && !isError && <Info className="w-5 h-5 text-cyan-400 shrink-0" />}
              <span className="text-sm font-medium leading-snug break-words" data-testid="toast-message">{t.text}</span>
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="p-1 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors shrink-0 ml-2"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default ToastContainer;
