import React, { useState } from 'react';
import axios from 'axios';
import { X, Zap, DownloadCloud, Loader2 } from 'lucide-react';
import { API_URL } from '../config/env';
import { useLanguageStore } from '../store/useLanguageStore';
import { getDivinePrideApiKey } from '../utils/divinePride';

interface CreateSkillModalProps {
  onClose: () => void;
  onSkillCreated: (skill: any) => void;
}

const CreateSkillModal: React.FC<CreateSkillModalProps> = ({ onClose, onSkillCreated }) => {
  const t = useLanguageStore(state => state.t);
  const [formData, setFormData] = useState({
    Id: 2001,
    Name: '',
    Description: '',
    MaxLevel: 10,
    Type: 'Weapon',
    TargetType: 'Single'
  });

  const [loading, setLoading] = useState(false);
  const [dpLoading, setDpLoading] = useState(false);
  const [error, setError] = useState('');
  const [dpMessage, setDpMessage] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: ['Id', 'MaxLevel'].includes(name) ? parseInt(value) || 0 : value
    }));
  };

  const handleFetchDP = async () => {
    if (formData.Id <= 0) {
      setError(t('components.modals.new_skill.error_id'));
      return;
    }
    const apiKey = getDivinePrideApiKey();
    if (!apiKey || !apiKey.trim()) {
      setError(t('divinepride.missing_key_alert'));
      return;
    }

    setDpLoading(true);
    setError('');
    setDpMessage('');

    try {
      const response = await axios.get(
        `${API_URL}/api/divinepride/preview/skill/${formData.Id}`,
        {
          headers: {
            'x-divine-pride-key': apiKey,
          },
        }
      );

      if (response.data && response.data.mapped) {
        const mapped = response.data.mapped;
        setFormData(prev => ({
          ...prev,
          Name: mapped.Name || prev.Name,
          Description: mapped.Description || mapped.Name || prev.Description,
          MaxLevel: typeof mapped.MaxLevel === 'number' ? mapped.MaxLevel : prev.MaxLevel,
          Type: mapped.Type || prev.Type,
          TargetType: mapped.TargetType || prev.TargetType
        }));
        setDpMessage(t('components.modals.new_skill.dp_fill_success'));
      }
    } catch (err: any) {
      console.error('Erro no DP preview:', err);
      setError(err.response?.data?.detail || err.message || 'Erro ao buscar no Divine Pride');
    } finally {
      setDpLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (formData.Id <= 0) {
      setError(t('components.modals.new_skill.error_id'));
      setLoading(false);
      return;
    }

    if (!formData.Name) {
      setError(t('components.modals.new_skill.error_required'));
      setLoading(false);
      return;
    }

    try {
      const payload = {
        Id: formData.Id,
        Name: formData.Name,
        Description: formData.Description || formData.Name,
        MaxLevel: formData.MaxLevel,
        Type: formData.Type,
        TargetType: formData.TargetType,
        _source: 'custom'
      };

      const response = await axios.post(`${API_URL}/api/skills/`, {
        data: payload
      });
      onSkillCreated(response.data);
      onClose();
    } catch (err: any) {
      console.error(err);
      let errorMessage = t('components.modals.new_skill.error_create');
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

  const inputClass = "w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none transition-colors";
  const labelClass = "block text-xs text-gray-400 mb-1 font-semibold uppercase tracking-wider";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-dark-800 border border-white/10 rounded-2xl shadow-2xl w-[500px] flex flex-col">
        <div className="p-5 border-b border-white/5 flex justify-between items-center bg-gradient-to-r from-amber-600/10 to-transparent rounded-t-2xl">
          <h2 className="text-lg text-white font-bold flex items-center gap-2">
            <Zap size={18} className="text-amber-400" />
            {t('components.modals.new_skill.title')}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          {error && (
            <div className="bg-red-950/60 border border-red-800 text-red-300 px-3 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          {dpMessage && (
            <div className="bg-emerald-950/60 border border-emerald-800 text-emerald-300 px-3 py-2 rounded-lg text-sm">
              {dpMessage}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>{t('components.modals.new_skill.fields.id')}</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  name="Id"
                  value={formData.Id}
                  onChange={handleChange}
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={handleFetchDP}
                  disabled={dpLoading}
                  className="px-3 py-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-medium flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer disabled:opacity-50"
                  title={t('components.modals.new_skill.dp_fill_btn')}
                >
                  {dpLoading ? <Loader2 size={14} className="animate-spin" /> : <DownloadCloud size={14} />}
                  <span>DP</span>
                </button>
              </div>
              <span className="text-[10px] text-gray-500 mt-1 block">{t('components.modals.new_skill.fields.id_tip')}</span>
            </div>

            <div>
              <label className={labelClass}>{t('components.modals.new_skill.fields.max_level')}</label>
              <input
                type="number"
                name="MaxLevel"
                value={formData.MaxLevel}
                onChange={handleChange}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>{t('components.modals.new_skill.fields.name')}</label>
            <input
              type="text"
              name="Name"
              placeholder="e.g. NV_BASIC"
              value={formData.Name}
              onChange={handleChange}
              className={`${inputClass} font-mono`}
            />
            <span className="text-[10px] text-gray-500 mt-1 block">{t('components.modals.new_skill.fields.name_tip')}</span>
          </div>

          <div>
            <label className={labelClass}>{t('components.modals.new_skill.fields.description')}</label>
            <input
              type="text"
              name="Description"
              placeholder="e.g. Basic Skill"
              value={formData.Description}
              onChange={handleChange}
              className={inputClass}
            />
            <span className="text-[10px] text-gray-500 mt-1 block">{t('components.modals.new_skill.fields.description_tip')}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>{t('components.modals.new_skill.fields.type')}</label>
              <select
                name="Type"
                value={formData.Type}
                onChange={handleChange}
                className={inputClass}
              >
                <option value="None">None</option>
                <option value="Weapon">Weapon</option>
                <option value="Magic">Magic</option>
                <option value="Misc">Misc</option>
              </select>
            </div>

            <div>
              <label className={labelClass}>{t('components.modals.new_skill.fields.target_type')}</label>
              <select
                name="TargetType"
                value={formData.TargetType}
                onChange={handleChange}
                className={inputClass}
              >
                <option value="Passive">Passive</option>
                <option value="Attack">Attack</option>
                <option value="Ground">Ground</option>
                <option value="Self">Self</option>
                <option value="Support">Support</option>
                <option value="Single">Single</option>
              </select>
            </div>
          </div>

          <div className="pt-3 flex justify-end gap-3 border-t border-white/5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-dark-700 hover:bg-dark-600 text-white text-sm font-medium transition cursor-pointer"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-lg bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white text-sm font-semibold shadow-lg transition disabled:opacity-50 cursor-pointer"
            >
              {loading ? t('components.modals.new_skill.creating') : t('components.modals.new_skill.create_btn')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateSkillModal;
