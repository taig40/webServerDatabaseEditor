import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, Search, Loader2 } from 'lucide-react';
import { API_URL } from '../config/env';
import { useLanguageStore } from '../store/useLanguageStore';

interface AccessoryItem {
  view_id: number;
  sprite_name: string;
  constant: string;
}

interface VisualBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (viewId: number, spriteName: string, constant: string) => void;
}

export const VisualBrowserModal: React.FC<VisualBrowserModalProps> = ({
  isOpen,
  onClose,
  onSelect,
}) => {
  const t = useLanguageStore(state => state.t);
  const [accessories, setAccessories] = useState<AccessoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      axios
        .get(`${API_URL}/api/visualizer/accessories`)
        .then(res => {
          setAccessories(res.data || []);
        })
        .catch(err => {
          console.error('Failed to fetch accessories list:', err);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [isOpen]);

  // Close modal on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!isOpen) return null;

  // Filter items based on search query
  const filtered = accessories.filter(item => {
    const query = searchQuery.toLowerCase();
    return (
      String(item.view_id).includes(query) ||
      (item.sprite_name && item.sprite_name.toLowerCase().includes(query)) ||
      (item.constant && item.constant.toLowerCase().includes(query))
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      {/* Modal Card */}
      <div className="bg-dark-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/5 bg-gradient-to-r from-violet-600/10 to-transparent flex-shrink-0">
          <div className="flex flex-col">
            <h3 className="text-lg font-bold text-white">
              {t('fitting_room.modal_title' as any) || 'Accessory Catalog'}
            </h3>
            <span className="text-xs text-gray-400 mt-0.5">
              {filtered.length} / {accessories.length} items
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b border-white/5 bg-dark-950/40 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
            <input
              type="text"
              autoFocus
              placeholder={
                t('fitting_room.search_placeholder' as any) ||
                'Search by ID, name or constant...'
              }
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-dark-950/60 border border-white/10 rounded-xl pl-11 pr-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 focus:border-violet-500 focus:outline-none transition-colors shadow-inner"
            />
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-dark-950/20">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <Loader2 className="animate-spin text-violet-500" size={32} />
              <span className="text-sm text-gray-500 italic">
                {t('common.loading') || 'Loading...'}
              </span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-full text-center p-8">
              <span className="text-sm text-gray-500 italic">
                {t('fitting_room.no_accessories' as any) ||
                  'No accessories found. Make sure client files are configured.'}
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {filtered.map(item => {
                const previewSrc = `${API_URL}/api/visualizer/preview?resource_name=${item.sprite_name}&is_male=true&direction=0`;
                return (
                  <div
                    key={item.view_id}
                    onClick={() => {
                      onSelect(item.view_id, item.sprite_name || '', item.constant || '');
                      onClose();
                    }}
                    className="flex flex-col items-center p-3 rounded-xl bg-dark-800/40 border border-white/5 hover:border-violet-500/50 hover:bg-violet-500/5 cursor-pointer hover:scale-[1.03] active:scale-95 transition-all shadow-md group relative overflow-hidden"
                  >
                    {/* Sprite preview wrapper */}
                    <div className="w-20 h-20 bg-dark-950/60 rounded-lg border border-white/5 flex items-center justify-center p-1 mb-2 shadow-inner overflow-hidden">
                      {item.sprite_name ? (
                        <img
                          src={previewSrc}
                          alt={item.sprite_name}
                          loading="lazy"
                          className="w-full h-full object-contain pixelated select-none"
                        />
                      ) : (
                        <span className="text-[10px] text-gray-600 font-mono">NO SPR</span>
                      )}
                    </div>
                    {/* Accessory meta details */}
                    <span className="text-xs font-bold text-violet-400 font-mono mb-0.5">
                      ID: {item.view_id}
                    </span>
                    <span
                      className="text-[10px] text-gray-400 truncate w-full text-center"
                      title={item.constant}
                    >
                      {item.sprite_name || item.constant}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
