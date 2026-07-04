import React, { useState } from 'react';
import axios from 'axios';
import { X, ShieldAlert } from 'lucide-react';
import { API_URL } from '../config/env';

interface NewMobModalProps {
  onClose: () => void;
  onMobCreated: (mob: any) => void;
}

const NewMobModal: React.FC<NewMobModalProps> = ({ onClose, onMobCreated }) => {
  const [formData, setFormData] = useState({
    Id: 4000,
    AegisName: '',
    Name: '',
    Level: 1,
    Hp: 100,
    Race: 'Formless',
    Size: 'Medium',
    Element: 'Neutral',
    ElementLevel: 1,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const numFields = ['Id', 'Level', 'Hp', 'ElementLevel'];
    setFormData(prev => ({
      ...prev,
      [name]: numFields.includes(name) ? parseInt(value) || 0 : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (formData.Id <= 0) { setError('ID deve ser maior que 0.'); setLoading(false); return; }
    if (!formData.AegisName || !formData.Name) { setError('AegisName e Name são obrigatórios.'); setLoading(false); return; }

    try {
      const response = await axios.post(`${API_URL}/api/mobs/`, formData);
      onMobCreated(response.data);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao criar monstro.');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none transition-colors";
  const labelClass = "block text-xs text-gray-500 mb-1 font-semibold uppercase tracking-wider";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-dark-800 border border-white/10 rounded-2xl shadow-2xl w-[480px] flex flex-col">
        <div className="p-5 border-b border-white/5 flex justify-between items-center bg-gradient-to-r from-violet-600/10 to-transparent rounded-t-2xl">
          <h2 className="text-lg text-white font-bold flex items-center gap-2">
            <ShieldAlert size={18} className="text-violet-400" />
            Criar Monstro Customizado
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          {error && (
            <div className="bg-red-950/60 border border-red-800 text-red-300 px-3 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>ID do Monstro</label>
              <input type="number" name="Id" value={formData.Id} onChange={handleChange} className={inputClass} />
              <span className="text-[10px] text-gray-600 mt-1 block">Recomendado &gt; 4000 para customizados.</span>
            </div>
            <div>
              <label className={labelClass}>Level</label>
              <input type="number" name="Level" value={formData.Level} onChange={handleChange} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>AegisName</label>
              <input type="text" name="AegisName" placeholder="ex: Custom_Monster" value={formData.AegisName} onChange={handleChange} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Nome (EN)</label>
              <input type="text" name="Name" placeholder="ex: Custom Monster" value={formData.Name} onChange={handleChange} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>HP</label>
              <input type="number" name="Hp" value={formData.Hp} onChange={handleChange} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Raça</label>
              <select name="Race" value={formData.Race} onChange={handleChange} className={inputClass}>
                {['Formless','Undead','Brute','Plant','Insect','Fish','Demon','Demihuman','Angel','Dragon'].map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Tamanho</label>
              <select name="Size" value={formData.Size} onChange={handleChange} className={inputClass}>
                {['Small','Medium','Large'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Elemento</label>
              <select name="Element" value={formData.Element} onChange={handleChange} className={inputClass}>
                {['Neutral','Water','Earth','Fire','Wind','Poison','Holy','Dark','Ghost','Undead'].map(el => (
                  <option key={el} value={el}>{el}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Nível do Elemento</label>
              <input type="number" name="ElementLevel" value={formData.ElementLevel} min={1} max={4} onChange={handleChange} className={inputClass} />
            </div>
          </div>

          <div className="flex gap-3 mt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-violet-600 hover:bg-violet-700 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              {loading ? 'Criando...' : 'Criar Monstro'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-gray-400 hover:text-white bg-dark-900/60 border border-white/5 rounded-lg text-sm transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewMobModal;
