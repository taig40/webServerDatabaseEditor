import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useLanguageStore } from '../store/useLanguageStore';

interface RepeatableGroupProps<T> {
  title: string;
  items: T[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  renderItem: (item: T, index: number) => React.ReactNode;
  emptyMessage?: string;
  maxItems?: number;
}

export function RepeatableGroup<T>({
  title,
  items = [],
  onAdd,
  onRemove,
  renderItem,
  emptyMessage,
  maxItems,
}: RepeatableGroupProps<T>) {
  const t = useLanguageStore(state => state.t);
  const canAdd = maxItems === undefined || items.length < maxItems;
  const displayEmptyMessage = emptyMessage || t('components.repeatable_group.empty');

  return (
    <div className="flex flex-col gap-2 border border-dark-700 bg-dark-900/40 rounded-lg p-3">
      <div className="flex justify-between items-center pb-2 border-b border-dark-800">
        <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wide flex items-center gap-2">
          {title}
          <span className="bg-dark-800 text-gray-400 text-[10px] px-1.5 py-0.5 rounded font-mono">
            {items.length}
          </span>
        </h4>
        {canAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="flex items-center gap-1 bg-primary-600/20 hover:bg-primary-600/30 text-primary-400 border border-primary-500/30 text-xs px-2 py-1 rounded transition-colors"
          >
            <Plus size={14} />
            <span>{t('components.repeatable_group.add')}</span>
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="text-center py-4 text-xs text-gray-500 italic bg-dark-950/50 rounded border border-dashed border-dark-800">
          {displayEmptyMessage}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 max-h-96 overflow-y-auto pr-1">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="relative group bg-dark-950 border border-dark-800 rounded-lg p-3 hover:border-dark-700 transition-colors"
            >
              <div className="absolute top-2 right-2 opacity-80 group-hover:opacity-100 transition-opacity z-10">
                <button
                  type="button"
                  onClick={() => onRemove(idx)}
                  title={t('components.repeatable_group.remove')}
                  className="p-1 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <div className="pr-8">{renderItem(item, idx)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
