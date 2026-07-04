import React from 'react';

interface PercentBadgeProps {
  label?: string;
  value: number;
  onChange: (val: number) => void;
  max?: number;
  scale?: number; // default 100 (if 10000 = 100%, scale is 100; if rate is 0-100, scale is 1)
  description?: string;
}

export const PercentBadge: React.FC<PercentBadgeProps> = ({
  label,
  value,
  onChange,
  max = 10000,
  scale = 100,
  description,
}) => {
  // Convert raw value to display percentage
  const displayVal = (value / scale).toFixed(scale > 100 ? 2 : scale > 1 ? 1 : 0);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const num = parseFloat(e.target.value);
    if (isNaN(num)) {
      onChange(0);
      return;
    }
    const raw = Math.round(num * scale);
    onChange(Math.min(Math.max(0, raw), max));
  };

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-xs font-medium text-gray-400 flex justify-between items-center">
          <span>{label}</span>
          <span className="text-[10px] text-primary-400 font-mono">Raw: {value}</span>
        </label>
      )}
      <div className="relative flex items-center">
        <input
          type="number"
          step="any"
          value={displayVal}
          onChange={handleInputChange}
          className="w-full bg-dark-950 border border-dark-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-primary-500 pr-10"
        />
        <div className="absolute right-0 inset-y-0 flex items-center pr-3 pointer-events-none text-gray-400 text-xs font-bold">
          %
        </div>
      </div>
      {description && <span className="text-[11px] text-gray-500">{description}</span>}
    </div>
  );
};
