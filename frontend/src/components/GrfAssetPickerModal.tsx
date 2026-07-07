import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_URL } from '../config/env';
import { Search, X, Check, Database, Image as ImageIcon } from 'lucide-react';

interface AssetEntry {
  resource_name: string;
  display_name: string;
  item_id: number | null;
}

interface Props {
  isOpen: boolean;
  assetType: 'item_icon' | 'item_collection' | 'item_sprite';
  title: string;
  currentResourceName: string;
  onClose: () => void;
  onSelect: (resourceName: string) => void;
}

export const GrfAssetPickerModal: React.FC<Props> = ({
  isOpen,
  assetType,
  title,
  currentResourceName,
  onClose,
  onSelect,
}) => {
  const [query, setQuery] = useState('');
  const [assets, setAssets] = useState<AssetEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedRes, setSelectedRes] = useState(currentResourceName);

  const fetchAssets = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/grf/assets`, {
        params: { type: assetType, query: q, limit: 120, skip: 0 },
      });
      setAssets(res.data.items || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      console.error('[webSDE] Erro ao carregar assets da GRF', err);
    } finally {
      setLoading(false);
    }
  }, [assetType]);

  useEffect(() => {
    if (isOpen) {
      setSelectedRes(currentResourceName);
      fetchAssets(query);
    }
  }, [isOpen, assetType, currentResourceName]);

  const handleSearchChange = (val: string) => {
    setQuery(val);
    fetchAssets(val);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-[#12121a] border border-white/10 rounded-2xl w-full max-w-4xl h-[80vh] flex flex-col shadow-2xl overflow-hidden">

        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[#181824]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Database size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">{title}</h2>
              <p className="text-xs text-gray-400 font-mono">
                {total.toLocaleString()} GRF resources available
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Search Bar ────────────────────────────────────────────────── */}
        <div className="p-4 border-b border-white/5 bg-[#14141f]">
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Search by resource name, item name or ID..."
              value={query}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full bg-[#0b0b10] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500/60 transition-colors"
              autoFocus
            />
          </div>
        </div>

        {/* ── Asset Grid ────────────────────────────────────────────────── */}
        <div className="flex-1 p-5 overflow-y-auto bg-[#0b0b10]">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-3">
              <div className="w-8 h-8 border-3 border-cyan-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-mono">Searching GRF resources...</span>
            </div>
          ) : assets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-2">
              <ImageIcon size={40} className="opacity-20" />
              <p className="text-sm">No resources found matching search.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {assets.map((item) => {
                const isSelected = selectedRes === item.resource_name;
                const imgSrc = `${API_URL}/api/grf/resource_image?type=${assetType}&name=${encodeURIComponent(item.resource_name)}`;

                return (
                  <div
                    key={item.resource_name}
                    onClick={() => setSelectedRes(item.resource_name)}
                    className={`group relative flex flex-col items-center p-3 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-cyan-500/10 border-cyan-500 ring-2 ring-cyan-500/30'
                        : 'bg-[#14141f] border-white/5 hover:border-white/20 hover:bg-[#1a1a28]'
                    }`}
                  >
                    {/* Selected Badge */}
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-cyan-500 text-black flex items-center justify-center">
                        <Check size={12} strokeWidth={3} />
                      </div>
                    )}

                    {/* Image Preview Container */}
                    <div className="w-14 h-14 bg-[#0b0b10] border border-white/10 rounded-lg flex items-center justify-center p-1 mb-2 shadow-inner">
                      <img
                        src={imgSrc}
                        alt={item.resource_name}
                        className="max-w-full max-h-full drop-shadow"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                        loading="lazy"
                      />
                    </div>

                    {/* Titles */}
                    <span className="text-[11px] font-semibold text-gray-200 truncate w-full text-center">
                      {item.display_name || item.resource_name}
                    </span>
                    <span className="text-[9px] text-gray-500 font-mono truncate w-full text-center mt-0.5">
                      {item.item_id ? `ID: ${item.item_id} · ` : ''}{item.resource_name}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/5 bg-[#181824]">
          <div className="text-xs text-gray-400 font-mono truncate max-w-[60%]">
            Selected:{' '}
            <span className="text-cyan-400 font-bold">
              {selectedRes || 'None'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              disabled={!selectedRes}
              onClick={() => {
                if (selectedRes) {
                  onSelect(selectedRes);
                  onClose();
                }
              }}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-black bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-cyan-500/20"
            >
              <Check size={14} />
              Apply Resource
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
