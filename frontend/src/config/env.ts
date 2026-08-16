/**
 * Checks if the app is running inside a Tauri v2 webview.
 */
function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function normalizeApiUrl(raw?: string): string {
  // Tauri v2 desktop — sidecar always runs on localhost:8000
  if (isTauriEnvironment()) {
    return 'http://127.0.0.1:8000';
  }
  // Legacy Electron detection (file: protocol)
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

