import React, { useState } from 'react';
import axios from 'axios';
import { X, Heart, Search } from 'lucide-react';
import { API_URL } from '../config/env';
import { useLanguageStore } from '../store/useLanguageStore';
import { ReferencePicker } from './ReferencePicker';

interface NewPetModalProps {
  onClose: () => void;
  onPetCreated: (pet: any) => void;
}

export const NewPetModal: React.FC<NewPetModalProps> = ({ onClose, onPetCreated }) => {
  const t = useLanguageStore(state => state.t);
  
  const [selectedMob, setSelectedMob] = useState<{ id: string | number, name: string } | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMob) {
      setError(t('pet_editor.new_modal.error_required'));
      return;
    }
    
    setLoading(true);
    setError('');

    try {
      const newPet = {
        Mob: selectedMob.name,
        TameItem: 'Apple',
        EggItem: 'Poring_Egg',
        EquipItem: 'Backpack',
        FoodItem: 'Apple',
        Fullness: 80,
        HungryDelay: 60,
        HungerIncrease: 20,
        IntimacyStart: 250,
        IntimacyFed: 50,
        IntimacyOverfed: -100,
        IntimacyHungry: -50,
        IntimacyOwnerDie: -20,
        CaptureRate: 1500,
        AttackRate: 10000,
        RetaliateRate: 10000,
        ChangeTargetRate: 10000,
        Script: '',
        SupportScript: '',
      };
      
      const response = await axios.post(`${API_URL}/api/pets/`, newPet);
      onPetCreated(response.data);
      onClose();
    } catch (err: any) {
      let errorMessage = t('pet_editor.new_modal.error_create');
      if (err.response?.data?.detail) {
        const detail = err.response.data.detail;
        if (typeof detail === 'string') {
          errorMessage = detail;
        } else if (Array.isArray(detail)) {
          errorMessage = detail.map((e: any) => `${e.loc?.join('.') || 'Campo'}: ${e.msg}`).join(' | ');
        }
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-dark-800 border border-white/10 rounded-2xl shadow-2xl w-[400px] flex flex-col">
          <div className="p-5 border-b border-white/5 flex justify-between items-center bg-gradient-to-r from-pink-600/10 to-transparent rounded-t-2xl">
            <h2 className="text-lg text-white font-bold flex items-center gap-2">
              <Heart size={18} className="text-pink-400" />
              {t('pet_editor.new_modal.title')}
            </h2>
            <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-5">
            {error && (
              <div className="bg-red-950/60 border border-red-800 text-red-300 px-3 py-2 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs text-gray-500 mb-2 font-semibold uppercase tracking-wider">
                {t('pet_editor.new_modal.fields.mob_label')}
              </label>
              <div 
                onClick={() => setIsPickerOpen(true)}
                className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-3 text-sm flex justify-between items-center cursor-pointer hover:border-pink-500/50 transition-colors"
              >
                <span className={selectedMob ? 'text-white' : 'text-gray-500'}>
                  {selectedMob ? selectedMob.name : t('pet_editor.new_modal.fields.mob_placeholder')}
                </span>
                <Search size={16} className="text-gray-500" />
              </div>
            </div>

            <button 
              type="submit" 
              disabled={loading || !selectedMob}
              className="mt-2 w-full py-2.5 rounded-lg font-bold text-sm text-white bg-pink-600 hover:bg-pink-700 transition-colors shadow-lg shadow-pink-900/20 disabled:opacity-50"
            >
              {loading ? t('common.loading') : t('pet_editor.new_modal.create_btn')}
            </button>
          </form>
        </div>
      </div>

      <ReferencePicker
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        type="mob"
        title={t('pet_editor.new_modal.select_mob')}
        onSelect={(id, name) => {
          setSelectedMob({ id, name });
          setIsPickerOpen(false);
        }}
      />
    </>
  );
};
