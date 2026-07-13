function normalizeApiUrl(raw?: string): string {
  if (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') {
    return 'http://127.0.0.1:8000';
  }
  if (!raw) return '';
  const trimmed = raw.trim().replace(/\/$/, '');
  if (trimmed && !trimmed.startsWith('http://') && !trimmed.startsWith('https://') && !trimmed.startsWith('/')) {
    return `http://${trimmed}`;
  }
  return trimmed;
}

// Centrally export the API URL
export const API_URL = normalizeApiUrl(import.meta.env.VITE_API_URL);

export const getSSEUrl = (endpoint: string): string => {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  if (API_URL) {
    return `${API_URL}${cleanEndpoint}`;
  }
  return cleanEndpoint;
};
