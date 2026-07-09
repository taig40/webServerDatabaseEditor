import React, { SyntheticEvent } from 'react';
import { API_URL } from '../config/env';

interface ItemIconProps {
  itemId: number;
  className?: string;
  alt?: string;
}

const FALLBACK_ICON_SVG = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z'></path><path d='M3.3 7l8.7 5 8.7-5'></path><path d='M12 22V12'></path></svg>`;

export const ItemIcon: React.FC<ItemIconProps> = ({ itemId, className = 'max-w-full max-h-full drop-shadow-md', alt = '' }) => {
  const handleError = (e: SyntheticEvent<HTMLImageElement, Event>) => {
    e.currentTarget.onerror = null;
    e.currentTarget.src = FALLBACK_ICON_SVG;
  };

  return (
    <img
      src={`${API_URL}/api/images/item/${itemId}`}
      alt={alt}
      className={className}
      loading="lazy"
      onError={handleError}
    />
  );
};
