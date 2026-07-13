import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, MapPin } from 'lucide-react';
import { API_URL } from '../config/env';
import { useLanguageStore } from '../store/useLanguageStore';

interface NpcShopModalProps {
  shop: any;
  onClose: () => void;
}

const NpcShopModal: React.FC<NpcShopModalProps> = ({ shop, onClose }) => {
  const t = useLanguageStore(state => state.t);
  const [items, setItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // In a real scenario, we might want to fetch item details for all item IDs the shop sells
    // For now, we will just map over the item IDs we already have.
    // If shop.all_items is an object { id: price }, we can convert to an array.
    
    // We could make an API call to get names for the item IDs, but if the shop has string keys (AegisNames),
    // it's easier. Let's just render what we have.
    
    const fetchItemDetails = async () => {
        setIsLoading(true);
        try {
            // Se tivermos os itens no estado global, seria melhor. 
            // Mas vamos buscar do backend os itens que esta loja vende, enviando os IDs.
            const itemKeys = Object.keys(shop.all_items);
            // This is a simplified approach. In a real heavy app we might just display the IDs or AegisNames.
            
            // Convert to array
            const arr = itemKeys.map(k => ({
                id: k,
                price: shop.all_items[k]
            }));
            
            setItems(arr);
        } catch(e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };
    
    fetchItemDetails();
  }, [shop]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-dark-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-dark-800">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-full bg-dark-950 border border-white/10 flex items-center justify-center p-1">
                <img 
                   src={`${API_URL}/api/grf/sprite?type=npc&id=${shop.sprite_id}`}
                   alt={shop.name}
                   className="max-w-full max-h-full object-contain"
                   onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
             </div>
             <div>
                 <h2 className="text-lg font-bold text-white">{shop.name}</h2>
                 <p className="text-xs text-gray-400 font-mono">{shop.full_name}</p>
             </div>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white hover:bg-white/10 p-2 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Info Ribbon */}
        <div className="bg-violet-900/30 px-6 py-3 border-b border-violet-500/20 flex items-center gap-6 text-sm">
           <button 
              onClick={() => {
                  navigator.clipboard.writeText(`/navi ${shop.map} ${shop.x}/${shop.y}`);
                  const el = document.getElementById(`tooltip-${shop.map}`);
                  if(el) {
                      el.innerText = t('components.modals.npc_shop.copy_success');
                      el.classList.add("text-green-400");
                      setTimeout(() => {
                          el.innerText = t('components.modals.npc_shop.copy_tooltip');
                          el.classList.remove("text-green-400");
                      }, 2000);
                  }
              }}
              className="flex items-center gap-2 text-violet-300 hover:text-white hover:bg-violet-500/20 px-2 py-1 rounded cursor-pointer transition-colors group relative"
              title={t('components.modals.npc_shop.copy_btn_title')}
           >
              <MapPin size={16} className="group-hover:animate-bounce" />
              <span className="font-semibold">{shop.map}</span>
              <span className="text-violet-400/70 group-hover:text-violet-200 font-mono text-xs">{shop.x}, {shop.y}</span>
              
              {/* Tooltip on Hover */}
              <div id={`tooltip-${shop.map}`} className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-black text-xs text-white rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                 {t('components.modals.npc_shop.copy_tooltip')}
              </div>
           </button>
           <div className="text-gray-400">
              Sprite ID: <span className="text-gray-200 font-mono">{shop.sprite_id}</span>
           </div>
        </div>

        {/* Content (Items) */}
        <div className="p-6 overflow-y-auto flex-1">
           <h3 className="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wider">{t('components.modals.npc_shop.inventory')}</h3>
           
           <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {items.map((it, idx) => (
                  <div key={idx} className="flex items-center gap-3 bg-dark-800/50 border border-white/5 p-3 rounded-xl hover:border-violet-500/30 transition-colors">
                      <div className="w-10 h-10 rounded bg-dark-900 border border-white/10 flex items-center justify-center shrink-0">
                         {/* Se 'it.id' for string ou id numérico, grf/sprite tentará buscar */}
                         <img 
                            src={`${API_URL}/api/grf/sprite?type=item&id=${it.id}`}
                            className="max-w-full max-h-full drop-shadow-md"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                         />
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                         <span className="text-sm text-gray-200 font-medium truncate">{it.id}</span>
                         <span className="text-xs text-yellow-400 font-mono">
                            {it.price === -1 ? t('components.modals.npc_shop.default_price') : `${it.price.toLocaleString()} z`}
                         </span>
                      </div>
                  </div>
              ))}
           </div>
        </div>
        
      </div>
    </div>
  );
};

export default NpcShopModal;
