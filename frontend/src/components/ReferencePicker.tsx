import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Check, Loader2 } from 'lucide-react';
import { API_URL } from '../config/env';

interface ReferencePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (id: number | string, name: string) => void;
  type: 'item' | 'mob' | 'skill';
  title?: string;
}

export const ReferencePicker: React.FC<ReferencePickerProps> = ({
  isOpen,
  onClose,
  onSelect,
  type,
  title,
}) => {
  const [query, setQuery] = useState('');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    const endpoint =
      type === 'item'
        ? `${API_URL}/api/items/?limit=50000`
        : type === 'mob'
        ? `${API_URL}/api/mobs/?limit=50000`
        : `${API_URL}/api/skills/?limit=50000`;

    fetch(endpoint)
      .then((res) => res.json())
      .then((res) => {
        const list = res.items || res.mobs || res.skills || [];
        setData(list);
      })
      .catch((err) => console.error(`Erro ao carregar lista de ${type}:`, err))
      .finally(() => setLoading(false));
  }, [isOpen, type]);

  if (!isOpen) return null;

  const filtered = data.filter((item) => {
    const q = query.toLowerCase().trim();
    if (!q) return true;
    const idStr = String(item.Id || item.Mob || item.mob_id || '').toLowerCase();
    const nameStr = String(item.Name || item.Name_English || item.AegisName || item.Title || '').toLowerCase();
    return idStr.includes(q) || nameStr.includes(q);
  }).slice(0, 300);

  const getTypeLabel = () => {
    if (type === 'item') return 'Item';
    if (type === 'mob') return 'Monstro';
    return 'Habilidade';
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-dark-900 border border-dark-600 rounded-xl shadow-2xl flex flex-col w-full max-w-2xl max-h-[80vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-dark-700 bg-dark-800/80">
          <h3 className="text-white font-semibold text-lg flex items-center gap-2">
            Selecionar {title || getTypeLabel()}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-dark-700 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search Input */}
        <div className="p-3 border-b border-dark-800 bg-dark-950">
          <div className="relative flex items-center">
            <Search className="absolute left-3 text-gray-500" size={16} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por ID ou Nome..."
              autoFocus
              className="w-full bg-dark-900 border border-dark-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2 divide-y divide-dark-800/50">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
              <Loader2 className="animate-spin text-primary-500" size={28} />
              <span className="text-sm">Carregando catálogo...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-sm italic">
              Nenhum resultado encontrado para "{query}".
            </div>
          ) : (
            filtered.map((item, idx) => {
              const itemId = item.Id || item.Mob || item.mob_id || idx;
              const itemName = item.Name || item.Name_English || item.AegisName || item.Title || `Item #${itemId}`;
              return (
                <div
                  key={idx}
                  onClick={() => {
                    const selectedName = type === 'item' ? (item.AegisName || itemName) : itemName;
                    onSelect(itemId, selectedName);
                    onClose();
                  }}
                  className="flex items-center justify-between p-3 hover:bg-primary-500/10 hover:border-primary-500/30 border border-transparent rounded-lg cursor-pointer transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-bold text-primary-400 bg-dark-950 border border-dark-700 px-2 py-1 rounded">
                      #{itemId}
                    </span>
                    <span className="text-sm font-medium text-gray-200 group-hover:text-white">
                      {itemName}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="text-xs bg-dark-800 group-hover:bg-primary-600 text-gray-300 group-hover:text-white px-3 py-1 rounded transition-colors flex items-center gap-1"
                  >
                    <Check size={14} /> Selecionar
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
