import React, { useState } from 'react';

interface LevelItem {
  Level: number;
  [key: string]: any;
}

interface LevelArrayEditorProps {
  label: string;
  value?: LevelItem[] | number | string;
  maxLevel: number;
  valueKey: string; // e.g. 'Size', 'Count', 'Time', 'Amount'
  onChange: (newVal: any) => void;
  isNumeric?: boolean;
}

export const LevelArrayEditor: React.FC<LevelArrayEditorProps> = ({
  label,
  value,
  maxLevel = 10,
  valueKey,
  onChange,
  isNumeric = true,
}) => {
  const [mode, setMode] = useState<'single' | 'perLevel'>(
    Array.isArray(value) ? 'perLevel' : 'single'
  );

  const getLevelVal = (lv: number) => {
    if (Array.isArray(value)) {
      const found = value.find((v) => v.Level === lv);
      return found ? found[valueKey] : '';
    }
    return value !== undefined ? value : '';
  };

  const handleSingleChange = (val: string) => {
    const parsed = isNumeric ? (val === '' ? 0 : parseFloat(val)) : val;
    onChange(parsed);
  };

  const handleLevelChange = (lv: number, val: string) => {
    const parsed = isNumeric ? (val === '' ? 0 : parseFloat(val)) : val;
    let currArr: LevelItem[] = Array.isArray(value) ? [...value] : [];
    
    const idx = currArr.findIndex((v) => v.Level === lv);
    if (idx >= 0) {
      currArr[idx] = { ...currArr[idx], [valueKey]: parsed };
    } else {
      currArr.push({ Level: lv, [valueKey]: parsed });
    }
    // Sort by Level
    currArr.sort((a, b) => a.Level - b.Level);
    onChange(currArr);
  };

  const toggleMode = () => {
    if (mode === 'single') {
      // Switch to perLevel: generate array from current single value
      const arr: LevelItem[] = [];
      const baseVal = value !== undefined ? value : (isNumeric ? 0 : '');
      for (let i = 1; i <= Math.max(1, maxLevel); i++) {
        arr.push({ Level: i, [valueKey]: baseVal });
      }
      setMode('perLevel');
      onChange(arr);
    } else {
      // Switch to single: take level 1 value
      const firstVal = getLevelVal(1);
      setMode('single');
      onChange(firstVal !== undefined ? firstVal : (isNumeric ? 0 : ''));
    }
  };

  return (
    <div className="flex flex-col gap-1.5 bg-dark-950 border border-dark-800 rounded-lg p-2.5">
      <div className="flex justify-between items-center">
        <label className="text-xs font-medium text-gray-300">{label}</label>
        <button
          type="button"
          onClick={toggleMode}
          className="text-[10px] bg-dark-800 hover:bg-dark-700 text-primary-400 border border-dark-600 px-2 py-0.5 rounded transition-colors"
        >
          {mode === 'single' ? '⚙️ Configurar por Nível' : '📌 Valor Único'}
        </button>
      </div>

      {mode === 'single' ? (
        <input
          type={isNumeric ? "number" : "text"}
          value={getLevelVal(1)}
          onChange={(e) => handleSingleChange(e.target.value)}
          className="w-full bg-dark-900 border border-dark-700 rounded px-2.5 py-1 text-sm text-white focus:outline-none focus:border-primary-500"
          placeholder={`Valor único para todos os níveis`}
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 max-h-48 overflow-y-auto p-1 bg-dark-900/50 rounded border border-dark-800">
          {Array.from({ length: Math.max(1, maxLevel) }, (_, i) => i + 1).map((lv) => (
            <div key={lv} className="flex flex-col gap-0.5">
              <span className="text-[10px] text-gray-400 font-mono text-center bg-dark-800 rounded-t py-0.5 border-x border-t border-dark-700">
                Lv {lv}
              </span>
              <input
                type={isNumeric ? "number" : "text"}
                value={getLevelVal(lv)}
                onChange={(e) => handleLevelChange(lv, e.target.value)}
                className="w-full bg-dark-950 border border-dark-700 rounded-b px-1.5 py-1 text-xs text-white text-center focus:outline-none focus:border-primary-500"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
