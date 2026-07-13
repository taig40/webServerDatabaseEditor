import React, { useState } from 'react';
import axios from 'axios';
import { API_URL } from '../config/env';
import { useLanguageStore } from '../store/useLanguageStore';

interface NewItemModalProps {
  onClose: () => void;
  onItemCreated: (item: any) => void;
}

const NewItemModal: React.FC<NewItemModalProps> = ({ onClose, onItemCreated }) => {
  const t = useLanguageStore(state => state.t);
  const [formData, setFormData] = useState({
    Id: 20000,
    AegisName: '',
    Name: '',
    Type: 'Etc',
    SubType: '',
    Attack: 0,
    Defense: 0,
    EquipLevelMin: 1
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: ['Id', 'Attack', 'Defense', 'EquipLevelMin'].includes(name) ? parseInt(value) || 0 : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (formData.Id <= 0) {
      setError(t('components.modals.new_item.error_id'));
      setLoading(false);
      return;
    }
    
    if (!formData.AegisName || !formData.Name) {
      setError(t('components.modals.new_item.error_required'));
      setLoading(false);
      return;
    }

    try {
      // Remove campos vazios opcionais
      const payload: any = { ...formData };
      if (!payload.SubType) delete payload.SubType;

      // Limpa propriedades irrelevantes baseado no tipo
      if (payload.Type !== 'Weapon') delete payload.Attack;
      if (payload.Type !== 'Armor') delete payload.Defense;
      if (payload.Type !== 'Weapon' && payload.Type !== 'Armor') delete payload.EquipLevelMin;

      const response = await axios.post(`${API_URL}/api/items/`, payload);
      onItemCreated(response.data);
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.detail || t('components.modals.new_item.error_create'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
      <div className="bg-dark-900 border border-dark-600 rounded-lg shadow-2xl w-[500px] flex flex-col">
        <div className="p-4 border-b border-dark-600 flex justify-between items-center">
          <h2 className="text-xl text-white font-bold">{t('components.modals.new_item.title')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 flex flex-col space-y-4">
          {error && <div className="bg-red-900/50 border border-red-500 text-red-200 px-3 py-2 rounded text-sm">{error}</div>}
          
          <div className="flex flex-col space-y-1">
            <label className="text-gray-300 text-sm font-semibold">{t('components.modals.new_item.fields.id')}</label>
            <input 
              type="number" 
              name="Id"
              value={formData.Id}
              onChange={handleChange}
              className="bg-dark-800 border border-dark-600 rounded p-2 text-white focus:border-primary focus:outline-none"
            />
            <span className="text-xs text-gray-500">{t('components.modals.new_item.fields.id_tip')}</span>
          </div>

          <div className="flex flex-col space-y-1">
            <label className="text-gray-300 text-sm font-semibold">{t('components.modals.new_item.fields.aegis_name')}</label>
            <input 
              type="text" 
              name="AegisName"
              placeholder="e.g. Custom_Sword"
              value={formData.AegisName}
              onChange={handleChange}
              className="bg-dark-800 border border-dark-600 rounded p-2 text-white focus:border-primary focus:outline-none"
            />
            <span className="text-xs text-gray-500">{t('components.modals.new_item.fields.aegis_name_tip')}</span>
          </div>

          <div className="flex flex-col space-y-1">
            <label className="text-gray-300 text-sm font-semibold">{t('components.modals.new_item.fields.name')}</label>
            <input 
              type="text" 
              name="Name"
              placeholder="e.g. Custom Sword"
              value={formData.Name}
              onChange={handleChange}
              className="bg-dark-800 border border-dark-600 rounded p-2 text-white focus:border-primary focus:outline-none"
            />
            <span className="text-xs text-gray-500">{t('components.modals.new_item.fields.name_tip')}</span>
          </div>

          <div className="flex space-x-4">
            <div className="flex flex-col space-y-1 flex-1">
              <label className="text-gray-300 text-sm font-semibold">{t('components.modals.new_item.fields.type')}</label>
              <select 
                name="Type"
                value={formData.Type}
                onChange={handleChange}
                className="bg-dark-800 border border-dark-600 rounded p-2 text-white focus:border-primary focus:outline-none"
              >
                <option value="Etc">Etc</option>
                <option value="Weapon">Weapon</option>
                <option value="Armor">Armor</option>
                <option value="Usable">Usable</option>
                <option value="Card">Card</option>
                <option value="PetEgg">PetEgg</option>
                <option value="PetArmor">PetArmor</option>
              </select>
            </div>
            <div className="flex flex-col space-y-1 flex-1">
              <label className="text-gray-300 text-sm font-semibold">{t('components.modals.new_item.fields.subtype')}</label>
              <input 
                type="text" 
                name="SubType"
                value={formData.SubType}
                onChange={handleChange}
                className="bg-dark-800 border border-dark-600 rounded p-2 text-white focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          {formData.Type === 'Weapon' && (
            <div className="flex space-x-4">
              <div className="flex flex-col space-y-1 flex-1">
                <label className="text-gray-300 text-sm font-semibold">{t('components.modals.new_item.fields.atk')}</label>
                <input 
                  type="number" 
                  name="Attack"
                  value={formData.Attack}
                  onChange={handleChange}
                  className="bg-dark-800 border border-dark-600 rounded p-2 text-white focus:border-primary focus:outline-none"
                />
              </div>
              <div className="flex flex-col space-y-1 flex-1">
                <label className="text-gray-300 text-sm font-semibold">{t('components.modals.new_item.fields.equip_level')}</label>
                <input 
                  type="number" 
                  name="EquipLevelMin"
                  value={formData.EquipLevelMin}
                  onChange={handleChange}
                  className="bg-dark-800 border border-dark-600 rounded p-2 text-white focus:border-primary focus:outline-none"
                />
              </div>
            </div>
          )}

          {formData.Type === 'Armor' && (
            <div className="flex space-x-4">
              <div className="flex flex-col space-y-1 flex-1">
                <label className="text-gray-300 text-sm font-semibold">{t('components.modals.new_item.fields.def')}</label>
                <input 
                  type="number" 
                  name="Defense"
                  value={formData.Defense}
                  onChange={handleChange}
                  className="bg-dark-800 border border-dark-600 rounded p-2 text-white focus:border-primary focus:outline-none"
                />
              </div>
              <div className="flex flex-col space-y-1 flex-1">
                <label className="text-gray-300 text-sm font-semibold">{t('components.modals.new_item.fields.equip_level')}</label>
                <input 
                  type="number" 
                  name="EquipLevelMin"
                  value={formData.EquipLevelMin}
                  onChange={handleChange}
                  className="bg-dark-800 border border-dark-600 rounded p-2 text-white focus:border-primary focus:outline-none"
                />
              </div>
            </div>
          )}

          <div className="pt-4 flex justify-end space-x-3">
            <button 
              type="button" 
              onClick={onClose}
              className="px-4 py-2 rounded bg-dark-700 hover:bg-dark-600 text-white transition"
            >
              {t('common.cancel')}
            </button>
            <button 
              type="submit" 
              disabled={loading}
              className="px-4 py-2 rounded bg-primary hover:bg-blue-600 text-white font-semibold transition disabled:opacity-50"
            >
              {loading ? t('components.modals.new_item.creating') : t('components.modals.new_item.create_btn')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewItemModal;
