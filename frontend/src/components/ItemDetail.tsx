import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Package, Shield, Sword, Box, Save, Plus, X, Users, Store } from 'lucide-react';
import { API_URL } from '../config/env';
import Editor from '@monaco-editor/react';
import NpcShopModal from './NpcShopModal';

interface ItemDetailProps {
  item: any;
  onUpdate: (itemId: number, field: string, value: any) => Promise<void>;
}

const ItemDetail: React.FC<ItemDetailProps> = ({ item, onUpdate }) => {
  const [drops, setDrops] = useState<any[]>([]);
  const [soldBy, setSoldBy] = useState<any[]>([]);
  const [isLoadingDrops, setIsLoadingDrops] = useState(false);
  const [isLoadingShops, setIsLoadingShops] = useState(false);
  const [localItem, setLocalItem] = useState(item);
  const [selectedShop, setSelectedShop] = useState<any | null>(null);

  useEffect(() => {
    setLocalItem(item);
    
    // Fetch drops for this item
    const fetchDrops = async () => {
      setIsLoadingDrops(true);
      try {
        const res = await axios.get(`${API_URL}/api/items/${item.Id}/dropped_by`);
        setDrops(res.data);
      } catch (err) {
        console.error("Erro ao buscar drops:", err);
      } finally {
        setIsLoadingDrops(false);
      }
    };
    
    const fetchSoldBy = async () => {
      setIsLoadingShops(true);
      try {
        const res = await axios.get(`${API_URL}/api/items/${item.Id}/sold_by`);
        setSoldBy(res.data);
      } catch (err) {
        console.error("Erro ao buscar lojas:", err);
      } finally {
        setIsLoadingShops(false);
      }
    };
    
    fetchDrops();
    fetchSoldBy();
  }, [item.Id]);

  const handleBlur = (field: string, val: any, isNumber = false) => {
    let finalVal = val;
    if (isNumber) finalVal = val === '' ? null : Number(val);
    
    if (finalVal !== item[field]) {
      onUpdate(item.Id, field, finalVal);
    }
  };

  const getScriptString = (scriptObj: any) => {
    if (!scriptObj) return '';
    if (typeof scriptObj === 'string') return scriptObj;
    return scriptObj.Script || '';
  };

  const handleScriptBlur = (field: string, newScript: string) => {
    const currentScript = getScriptString(item[field]);
    if (newScript !== currentScript) {
      onUpdate(item.Id, field, { Script: newScript });
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-dark-900 text-gray-200">
      
      {/* Header */}
      <div className="flex-shrink-0 flex items-center p-6 border-b border-white/5 bg-gradient-to-r from-violet-600/10 to-transparent">
        <div className="w-16 h-16 rounded-xl bg-dark-800 border border-white/10 flex items-center justify-center shadow-lg p-2 mr-6">
          <img 
            src={`${API_URL}/api/grf/sprite?type=item&id=${localItem.Id}`} 
            alt="icon" 
            className="max-h-full max-w-full drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)]"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        </div>
        <div className="flex flex-col">
          <h2 className="text-2xl font-bold text-white mb-1">{localItem.Name || 'Unnamed Item'}</h2>
          <div className="flex items-center gap-4 text-sm font-mono text-gray-400">
            <span className="flex items-center gap-1 bg-dark-800 px-2 py-0.5 rounded border border-white/10">ID: <span className="text-violet-400">{localItem.Id}</span></span>
            <span className="flex items-center gap-1 bg-dark-800 px-2 py-0.5 rounded border border-white/10">AegisName: <span className="text-blue-400">{localItem.AegisName}</span></span>
          </div>
        </div>
      </div>

      {/* Forms Grid */}
      <div className="p-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
        
        {/* Basic Stats Card */}
        <div className="bg-dark-800/50 rounded-2xl border border-white/5 p-5 backdrop-blur-sm shadow-xl">
          <div className="flex items-center gap-2 mb-4 text-white border-b border-white/5 pb-2">
            <Package size={18} className="text-violet-400" />
            <h3 className="font-semibold">Atributos Básicos</h3>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Type</label>
              <input 
                type="text" 
                value={localItem.Type || ''}
                onChange={e => setLocalItem({...localItem, Type: e.target.value})}
                onBlur={e => handleBlur('Type', e.target.value)}
                className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:border-violet-500 focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Subtype</label>
              <input 
                type="text" 
                value={localItem.SubType || ''}
                onChange={e => setLocalItem({...localItem, SubType: e.target.value})}
                onBlur={e => handleBlur('SubType', e.target.value)}
                className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:border-violet-500 focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Buy</label>
              <input 
                type="number" 
                value={localItem.Buy ?? ''}
                onChange={e => setLocalItem({...localItem, Buy: e.target.value})}
                onBlur={e => handleBlur('Buy', e.target.value, true)}
                className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:border-violet-500 focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Sell</label>
              <input 
                type="number" 
                value={localItem.Sell ?? ''}
                onChange={e => setLocalItem({...localItem, Sell: e.target.value})}
                onBlur={e => handleBlur('Sell', e.target.value, true)}
                className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:border-violet-500 focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Weight (x10)</label>
              <input 
                type="number" 
                value={localItem.Weight ?? ''}
                onChange={e => setLocalItem({...localItem, Weight: e.target.value})}
                onBlur={e => handleBlur('Weight', e.target.value, true)}
                className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:border-violet-500 focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">View ID</label>
              <input 
                type="number" 
                value={localItem.View || ''}
                onChange={e => setLocalItem({...localItem, View: e.target.value})}
                onBlur={e => handleBlur('View', e.target.value, true)}
                className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:border-violet-500 focus:outline-none transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Combat Stats Card */}
        <div className="bg-dark-800/50 rounded-2xl border border-white/5 p-5 backdrop-blur-sm shadow-xl">
          <div className="flex items-center gap-2 mb-4 text-white border-b border-white/5 pb-2">
            <Sword size={18} className="text-red-400" />
            <h3 className="font-semibold">Combate & Equipamento</h3>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Attack</label>
              <input 
                type="number" 
                value={localItem.Attack ?? ''}
                onChange={e => setLocalItem({...localItem, Attack: e.target.value})}
                onBlur={e => handleBlur('Attack', e.target.value, true)}
                className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:border-red-500/50 focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Magic Attack (Matk)</label>
              <input 
                type="number" 
                value={localItem.MagicAttack ?? ''}
                onChange={e => setLocalItem({...localItem, MagicAttack: e.target.value})}
                onBlur={e => handleBlur('MagicAttack', e.target.value, true)}
                className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:border-blue-500/50 focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Defense</label>
              <input 
                type="number" 
                value={localItem.Defense ?? ''}
                onChange={e => setLocalItem({...localItem, Defense: e.target.value})}
                onBlur={e => handleBlur('Defense', e.target.value, true)}
                className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:border-green-500/50 focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Slots</label>
              <input 
                type="number" 
                value={localItem.Slots ?? ''}
                onChange={e => setLocalItem({...localItem, Slots: e.target.value})}
                onBlur={e => handleBlur('Slots', e.target.value, true)}
                className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:border-violet-500 focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Weapon Level</label>
              <input 
                type="number" 
                value={localItem.WeaponLevel ?? ''}
                onChange={e => setLocalItem({...localItem, WeaponLevel: e.target.value})}
                onBlur={e => handleBlur('WeaponLevel', e.target.value, true)}
                className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:border-violet-500 focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Equip Level Min</label>
              <input 
                type="number" 
                value={localItem.EquipLevelMin ?? ''}
                onChange={e => setLocalItem({...localItem, EquipLevelMin: e.target.value})}
                onBlur={e => handleBlur('EquipLevelMin', e.target.value, true)}
                className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:border-violet-500 focus:outline-none transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Restrições (Jobs, Classes, etc) */}
        <div className="bg-dark-800/50 rounded-2xl border border-white/5 p-5 backdrop-blur-sm shadow-xl xl:col-span-2">
          <div className="flex items-center gap-2 mb-4 text-white border-b border-white/5 pb-2">
            <Users size={18} className="text-emerald-400" />
            <h3 className="font-semibold">Restrições de Equipamento</h3>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
               <label className="block text-xs text-gray-500 mb-1">Equip Level Min</label>
               <input 
                  type="number" 
                  value={localItem.EquipLevelMin ?? ''}
                  onChange={e => setLocalItem({...localItem, EquipLevelMin: e.target.value})}
                  onBlur={e => handleBlur('EquipLevelMin', e.target.value, true)}
                  className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:border-emerald-500/50 focus:outline-none transition-colors"
               />
            </div>
            <div>
               <label className="block text-xs text-gray-500 mb-1">Equip Level Max</label>
               <input 
                  type="number" 
                  value={localItem.EquipLevelMax ?? ''}
                  onChange={e => setLocalItem({...localItem, EquipLevelMax: e.target.value})}
                  onBlur={e => handleBlur('EquipLevelMax', e.target.value, true)}
                  className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:border-emerald-500/50 focus:outline-none transition-colors"
               />
            </div>
            <div>
               <label className="block text-xs text-gray-500 mb-1">Gender</label>
               <input 
                  type="text" 
                  value={localItem.Gender || 'Ambos'}
                  onChange={e => setLocalItem({...localItem, Gender: e.target.value})}
                  onBlur={e => handleBlur('Gender', e.target.value)}
                  className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:border-emerald-500/50 focus:outline-none transition-colors"
               />
            </div>
            <div>
               <label className="block text-xs text-gray-500 mb-1">Classes (Upper)</label>
               <div className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-gray-300 truncate cursor-help" title={
                 !localItem.Classes ? 'Todos' :
                 localItem.Classes.All ? 'Todos' :
                 Object.entries(localItem.Classes).filter(([_, v]) => v === true).map(([k, _]) => k).join(', ') || 'Nenhuma'
               }>
                  {!localItem.Classes ? 'Todos' :
                   localItem.Classes.All ? 'Todos' :
                   Object.entries(localItem.Classes).filter(([_, v]) => v === true).map(([k, _]) => k).join(', ') || 'Nenhuma'}
               </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
             <div>
                <label className="block text-xs text-gray-500 mb-1">Applicable Jobs</label>
                <div className="w-full min-h-[38px] bg-dark-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300 break-words">
                   {!localItem.Jobs ? 'Todos' :
                    localItem.Jobs.All ? 'Todos' :
                    Object.entries(localItem.Jobs).filter(([_, v]) => v === true).map(([k, _]) => k).join(', ') || 'Nenhuma'}
                </div>
                <p className="text-[10px] text-gray-600 mt-1">O rAthena moderno define as classes nominalmente (ex: Crusader: true) em vez de hexadecimal.</p>
             </div>
             <div>
                <label className="block text-xs text-gray-500 mb-1">Locations (Posições de Equip)</label>
                <div className="w-full min-h-[38px] bg-dark-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300 break-words">
                   {!localItem.Locations ? 'Nenhuma' :
                    Object.entries(localItem.Locations).filter(([_, v]) => v === true).map(([k, _]) => k).join(', ') || 'Nenhuma'}
                </div>
             </div>
          </div>
        </div>

        {/* Scripts Card (Spans full width) */}
        <div className="bg-dark-800/50 rounded-2xl border border-white/5 p-5 backdrop-blur-sm shadow-xl xl:col-span-2">
          <div className="flex items-center gap-2 mb-4 text-white border-b border-white/5 pb-2">
            <Box size={18} className="text-blue-400" />
            <h3 className="font-semibold">Scripts & Lógica</h3>
          </div>
          
          <div className="space-y-6">
            <div>
              <label className="block text-xs font-mono text-gray-400 mb-2">Script Principal</label>
              <div className="h-48 border border-white/10 rounded-lg overflow-hidden focus-within:border-blue-500/50 transition-colors">
                <Editor
                  height="100%"
                  defaultLanguage="c"
                  theme="vs-dark"
                  value={getScriptString(localItem.Script)}
                  onChange={(val) => setLocalItem({...localItem, Script: { Script: val }})}
                  onMount={(editor) => {
                    editor.onDidBlurEditorText(() => {
                      handleScriptBlur('Script', editor.getValue());
                    });
                  }}
                  options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false }}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-mono text-gray-400 mb-2">OnEquipScript</label>
                <div className="h-32 border border-white/10 rounded-lg overflow-hidden focus-within:border-blue-500/50 transition-colors">
                  <Editor
                    height="100%"
                    defaultLanguage="c"
                    theme="vs-dark"
                    value={getScriptString(localItem.EquipScript)}
                    onChange={(val) => setLocalItem({...localItem, EquipScript: { Script: val }})}
                    onMount={(editor) => {
                      editor.onDidBlurEditorText(() => {
                        handleScriptBlur('EquipScript', editor.getValue());
                      });
                    }}
                    options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false }}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-mono text-gray-400 mb-2">OnUnequipScript</label>
                <div className="h-32 border border-white/10 rounded-lg overflow-hidden focus-within:border-blue-500/50 transition-colors">
                  <Editor
                    height="100%"
                    defaultLanguage="c"
                    theme="vs-dark"
                    value={getScriptString(localItem.UnEquipScript)}
                    onChange={(val) => setLocalItem({...localItem, UnEquipScript: { Script: val }})}
                    onMount={(editor) => {
                      editor.onDidBlurEditorText(() => {
                        handleScriptBlur('UnEquipScript', editor.getValue());
                      });
                    }}
                    options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Dropped By Table (Spans full width) */}
        <div className="bg-dark-800/50 rounded-2xl border border-white/5 p-5 backdrop-blur-sm shadow-xl xl:col-span-2">
           <div className="flex items-center gap-2 mb-4 text-white border-b border-white/5 pb-2">
            <Shield size={18} className="text-yellow-400" />
            <h3 className="font-semibold">Dropado Por (Monstros)</h3>
          </div>

          <div className="overflow-x-auto rounded-lg border border-white/5">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-400 uppercase bg-dark-900/50">
                <tr>
                  <th className="px-4 py-3 font-medium">Mob ID</th>
                  <th className="px-4 py-3 font-medium">Nome Original (kRO)</th>
                  <th className="px-4 py-3 font-medium">AegisName</th>
                  <th className="px-4 py-3 font-medium">Taxa de Drop</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {isLoadingDrops ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                      Buscando drops no servidor...
                    </td>
                  </tr>
                ) : drops.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                      Nenhum monstro dropa este item nativamente.
                    </td>
                  </tr>
                ) : (
                  drops.map((drop, idx) => (
                    <tr key={idx} className="bg-dark-800/20 hover:bg-dark-800/50 transition-colors">
                      <td className="px-4 py-3 font-mono text-violet-400">{drop.MobId}</td>
                      <td className="px-4 py-3 text-gray-300">{drop.MobName}</td>
                      <td className="px-4 py-3 font-mono text-gray-500">{drop.MobAegisName}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">
                          {(drop.Rate / 100).toFixed(2)}%
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sold By (NPC Shops) */}
        <div className="bg-dark-800/50 rounded-2xl border border-white/5 p-5 backdrop-blur-sm shadow-xl xl:col-span-2">
           <div className="flex items-center gap-2 mb-4 text-white border-b border-white/5 pb-2">
            <Store size={18} className="text-cyan-400" />
            <h3 className="font-semibold">Vendido Por (Lojas)</h3>
          </div>

          <div className="flex flex-wrap gap-3">
             {isLoadingShops ? (
                 <span className="text-sm text-gray-500">Buscando lojas pelo mundo...</span>
             ) : soldBy.length === 0 ? (
                 <span className="text-sm text-gray-500">Este item não é vendido em nenhuma loja padrão.</span>
             ) : (
                 soldBy.map((shop, idx) => (
                     <button
                        key={idx}
                        onClick={() => setSelectedShop(shop)}
                        className="flex items-center gap-2 bg-dark-900 border border-white/10 px-3 py-2 rounded-lg hover:border-cyan-500/50 hover:bg-cyan-900/10 transition-all shadow-sm"
                     >
                         <div className="w-6 h-6 rounded-full bg-dark-950 flex items-center justify-center shrink-0 overflow-hidden">
                             <img 
                                src={`${API_URL}/api/grf/sprite?type=npc&id=${shop.sprite_id}`}
                                className="max-w-full max-h-full object-contain"
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                             />
                         </div>
                         <div className="flex flex-col text-left">
                            <span className="text-xs font-semibold text-gray-200">{shop.name}</span>
                            <span className="text-[10px] text-gray-500 font-mono">{shop.map}</span>
                         </div>
                     </button>
                 ))
             )}
          </div>
        </div>
        
      </div>
      
      {selectedShop && (
         <NpcShopModal 
            shop={selectedShop} 
            onClose={() => setSelectedShop(null)} 
         />
      )}
    </div>
  );
};

export default ItemDetail;
