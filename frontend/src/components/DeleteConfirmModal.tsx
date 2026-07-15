import React, { useEffect, useRef } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { useLanguageStore } from '../store/useLanguageStore';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DeleteConfirmModalProps {
  /** Controla a visibilidade do modal */
  isOpen: boolean;
  /** Label descritivo para exibição: ex. "Item #501 – Red Potion" */
  entityLabel: string;
  /** Indica se a deleção está em progresso (spinner no botão) */
  isDeleting?: boolean;
  /** Chamado quando o usuário confirma a exclusão */
  onConfirm: () => void;
  /** Chamado quando o usuário cancela ou fecha o modal */
  onCancel: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  entityLabel,
  isDeleting = false,
  onConfirm,
  onCancel,
}) => {
  const t = useLanguageStore((state) => state.t);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Fecha com Escape e foca o botão de cancelar ao abrir (acessibilidade)
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, isDeleting, onCancel]);

  if (!isOpen) return null;

  return (
    // Backdrop — clique fora cancela (se não estiver deletando)
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={() => { if (!isDeleting) onCancel(); }}
    >
      {/* Card do Modal */}
      <div
        className="relative w-full max-w-md mx-4 bg-[#13131f] border border-red-500/20 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden"
        onClick={(e) => e.stopPropagation()}  // impede fechar ao clicar dentro do card
      >
        {/* Barra de Alerta Superior */}
        <div className="h-1 w-full bg-gradient-to-r from-red-600 to-orange-500" />

        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={20} className="text-red-400" />
            </div>
            <div>
              <h2 className="text-white font-bold text-base leading-tight">
                {t('delete_modal.title' as any) || 'Confirmar Exclusão'}
              </h2>
              <p className="text-gray-500 text-xs mt-0.5">
                {t('delete_modal.irreversible_warning' as any) || 'Esta ação não pode ser desfeita.'}
              </p>
            </div>
          </div>

          {!isDeleting && (
            <button
              onClick={onCancel}
              className="text-gray-600 hover:text-gray-400 transition-colors p-1 rounded-lg hover:bg-white/5"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Corpo */}
        <div className="px-6 pb-6">
          <div className="bg-[#0a0a0f] border border-white/5 rounded-xl p-4 mb-6">
            <p className="text-sm text-gray-300 leading-relaxed">
              {t('delete_modal.confirm_message' as any) || 'Tem certeza que deseja excluir'}
              {' '}
              <span className="font-mono font-semibold text-red-400 break-all">
                {entityLabel}
              </span>
              {'?'}
            </p>
            <p className="text-xs text-gray-600 mt-2 leading-relaxed">
              {t('delete_modal.file_warning' as any) ||
                'O arquivo será modificado permanentemente no disco. Backups não são criados automaticamente.'}
            </p>
          </div>

          {/* Ações */}
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onCancel}
              disabled={isDeleting}
              className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('common.cancel' as any) || 'Cancelar'}
            </button>

            <button
              ref={confirmRef}
              onClick={onConfirm}
              disabled={isDeleting}
              data-testid="btn-confirm-delete"
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-500 rounded-xl transition-all shadow-lg shadow-red-900/30 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isDeleting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {t('delete_modal.deleting' as any) || 'Excluindo…'}
                </>
              ) : (
                <>
                  <Trash2 size={15} />
                  {t('delete_modal.confirm_btn' as any) || 'Sim, Excluir'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
