import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, User, UserCheck } from 'lucide-react';
import { API_URL } from '../config/env';
import { useLanguageStore } from '../store/useLanguageStore';
import { VisualBrowserModal } from './VisualBrowserModal';
import robesData from '../constants/robes.json';

interface FittingRoomProps {
  resourceName: string | undefined;
  equipmentType?: 'headgear' | 'garment';
  onSelectAccessory?: (spriteName: string, viewId: number, constant: string) => void;
}

export const FittingRoom: React.FC<FittingRoomProps> = ({ resourceName, onSelectAccessory }) => {
  const t = useLanguageStore(state => state.t);
  const [isMale, setIsMale] = useState<boolean>(true);
  const [direction, setDirection] = useState<number>(0);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [robeName, setRobeName] = useState<string>('');

  const rotateLeft = () => {
    setDirection(prev => (prev + 1) % 8);
  };

  const rotateRight = () => {
    setDirection(prev => (prev - 1 + 8) % 8);
  };

  const toggleGender = () => {
    setIsMale(prev => !prev);
  };

  // Build API URL for the direct preview image
  const resolvedResource = equipmentType === 'garment' ? '' : encodeURIComponent(resourceName ?? '');
  const resolvedRobe = equipmentType === 'garment' ? encodeURIComponent(resourceName ?? '') : encodeURIComponent(robeName);
  
  const previewUrl = `${API_URL}/api/visualizer/preview?resource_name=${resolvedResource}&robe_name=${resolvedRobe}&is_male=${isMale}&direction=${direction}`;

  return (
    <div className="bg-dark-800/50 rounded-2xl border border-white/5 p-5 backdrop-blur-sm shadow-xl flex flex-col items-center">
      {/* Title */}
      <div className="w-full flex items-center justify-between border-b border-white/5 pb-2 mb-4">
        <h3 className="font-semibold text-white text-sm tracking-wide uppercase">
          {t('fitting_room.title' as any) || 'Fitting Room'}
        </h3>
        <span className="text-[10px] font-mono text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded border border-violet-500/20">
          DIR: {direction}
        </span>
      </div>

      {/* Sprite Canvas stage */}
      <div className="relative w-48 h-48 bg-dark-950/80 rounded-xl border border-white/10 flex items-center justify-center overflow-hidden shadow-inner group">
        <img
          data-testid="visualizer-canvas"
          src={previewUrl}
          alt="Character Preview"
          className="w-full h-full object-contain pixelated select-none"
          key={`${resourceName}-${robeName}-${isMale}-${direction}`} // force re-render/refetch on change
        />
      </div>

      {/* Controls Container */}
      <div className="w-full mt-4 grid grid-cols-2 gap-3">
        {/* Rotation Group */}
        <div className="flex items-center justify-center gap-1 bg-dark-900/60 p-1.5 rounded-lg border border-white/5">
          <button
            type="button"
            onClick={rotateRight}
            className="p-1 rounded hover:bg-white/5 active:scale-95 text-gray-400 hover:text-white transition-all"
            title={t('fitting_room.rotate_left' as any) || 'Rotate Left'}
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-xs text-gray-400 font-mono select-none px-1">
            3D
          </span>
          <button
            type="button"
            onClick={rotateLeft}
            className="p-1 rounded hover:bg-white/5 active:scale-95 text-gray-400 hover:text-white transition-all"
            title={t('fitting_room.rotate_right' as any) || 'Rotate Right'}
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Gender Toggle */}
        <button
          type="button"
          onClick={toggleGender}
          className="flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-600/10 hover:bg-violet-600/20 text-violet-400 hover:text-violet-300 border border-violet-500/20 hover:border-violet-500/40 active:scale-[0.98] transition-all"
        >
          {isMale ? <User size={13} /> : <UserCheck size={13} />}
          <span>
            {isMale
              ? t('fitting_room.male' as any) || 'Male'
              : t('fitting_room.female' as any) || 'Female'}
          </span>
        </button>
      </div>

      {/* Robe Input */}
      <div className="w-full mt-3">
        <input 
          type="text" 
          list="robe-options"
          value={robeName}
          onChange={(e) => setRobeName(e.target.value)}
          placeholder={t('fitting_room.robe_placeholder' as any) || 'Capa/Asa Resource Name (ex: C_White_Angel_Wing)'}
          data-testid="input-robe-resourcename"
          className="w-full bg-dark-900 border border-white/5 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/50"
        />
        <datalist id="robe-options">
          {robesData.map((robe) => (
            <option key={robe} value={robe} />
          ))}
        </datalist>
      </div>

      {/* Browse Catalog button */}
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className="w-full mt-3 py-1.5 px-3 rounded-lg text-xs font-semibold bg-dark-900 hover:bg-dark-950 text-violet-400 hover:text-violet-300 border border-white/5 hover:border-violet-500/30 transition-all flex items-center justify-center gap-1.5 active:scale-[0.98]"
      >
        <span>{t('fitting_room.catalog_btn' as any) || 'Browse Catalog'}</span>
      </button>

      <VisualBrowserModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSelect={(viewId, spriteName, constant) => {
          if (onSelectAccessory) onSelectAccessory(spriteName, viewId, constant);
        }}
      />
    </div>
  );
};
