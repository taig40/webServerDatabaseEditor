import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Store, MapPin, Copy, ExternalLink, Loader2 } from 'lucide-react';
import { API_URL } from '../config/env';
import { useLanguageStore } from '../store/useLanguageStore';
import { toast } from '../store/useToastStore';

interface SoldBySectionProps {
  itemId: number | string;
  onSelectShop?: (shop: any) => void;
}

export const SoldBySection: React.FC<SoldBySectionProps> = ({ itemId, onSelectShop }) => {
  const t = useLanguageStore(state => state.t);
  const [shops, setShops] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchSoldBy = async () => {
      if (itemId === undefined || itemId === null) return;
      setIsLoading(true);
      setError(null);
      try {
        const res = await axios.get(`${API_URL}/api/items/${itemId}/sold-by`);
        if (isMounted) {
          setShops(Array.isArray(res.data) ? res.data : []);
        }
      } catch (err) {
        console.error('[SoldBySection] Erro ao buscar vendedores:', err);
        if (isMounted) {
          setError(t('item_detail.sold_by_error') || 'Não foi possível carregar os vendedores.');
          setShops([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchSoldBy();
    return () => {
      isMounted = false;
    };
  }, [itemId, t]);

  const handleCopyNavi = (e: React.MouseEvent, shop: any) => {
    e.stopPropagation();
    const naviCommand = `/navi ${shop.map} ${shop.x}/${shop.y}`;
    navigator.clipboard.writeText(naviCommand);
    toast.success(t('item_detail.navi_copied') || `Comando copiado: ${naviCommand}`);
  };

  return (
    <div className="bg-dark-800/50 rounded-2xl border border-white/5 p-5 backdrop-blur-sm shadow-xl xl:col-span-2 transition-all">
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/5">
        <div className="flex items-center gap-2 text-white">
          <Store size={18} className="text-cyan-400" />
          <h3 className="font-semibold">{t('item_detail.sold_by')}</h3>
          {!isLoading && !error && shops.length > 0 && (
            <span className="px-2 py-0.5 text-xs font-mono bg-cyan-500/10 text-cyan-400 rounded-full border border-cyan-500/20">
              {shops.length}
            </span>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-6 gap-2 text-gray-400">
          <Loader2 size={18} className="animate-spin text-cyan-400" />
          <span className="text-sm">{t('item_detail.loading_shops')}</span>
        </div>
      ) : error ? (
        <div className="py-4 text-center">
          <span className="text-sm text-red-400/80 bg-red-500/10 px-3 py-1.5 rounded-lg border border-red-500/20">
            {error}
          </span>
        </div>
      ) : shops.length === 0 ? (
        <div className="py-4 text-center">
          <span className="text-sm text-gray-500">{t('item_detail.no_shops')}</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5">
          {shops.map((shop, idx) => (
            <div
              key={idx}
              onClick={() => onSelectShop?.(shop)}
              className="group flex flex-col bg-dark-900 border border-white/10 rounded-xl p-3.5 hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all shadow-sm cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-lg bg-dark-950 flex items-center justify-center shrink-0 overflow-hidden border border-white/5 shadow-inner">
                  <img
                    src={`${API_URL}/api/grf/sprite?type=npc&id=${shop.sprite_id}`}
                    alt={shop.name}
                    className="max-w-full max-h-full object-contain transform scale-125 group-hover:scale-150 transition-transform duration-200"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                </div>
                <div className="flex flex-col text-left min-w-0 flex-1">
                  <span className="text-xs font-semibold text-gray-200 truncate group-hover:text-cyan-300 transition-colors">
                    {shop.name}
                  </span>
                  <div className="flex items-center gap-1 text-[10px] text-cyan-400/80 font-mono mt-0.5 truncate">
                    <MapPin size={10} className="shrink-0" />
                    <span className="truncate">
                      {shop.map} {shop.x > 0 || shop.y > 0 ? `(${shop.x}, ${shop.y})` : ''}
                    </span>
                  </div>
                  {shop.price !== undefined && shop.price > -1 && (
                    <span className="text-[10px] font-mono text-yellow-400/90 mt-0.5">
                      {shop.price.toLocaleString()} z
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={(e) => handleCopyNavi(e, shop)}
                  className="flex items-center justify-center gap-1.5 flex-1 py-1.5 px-2.5 rounded-lg bg-dark-800 hover:bg-cyan-600 hover:text-white text-[11px] font-medium text-gray-300 border border-white/5 hover:border-cyan-500 transition-all active:scale-95 shadow-sm"
                  title={t('item_detail.copy_navi') || 'Copiar comando /navi'}
                >
                  <Copy size={12} />
                  <span>{t('item_detail.copy_navi') || 'Copiar Navi'}</span>
                </button>
                <div
                  className="p-1.5 text-gray-500 group-hover:text-cyan-400 transition-colors"
                  title="Ver inventário da loja"
                >
                  <ExternalLink size={12} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
