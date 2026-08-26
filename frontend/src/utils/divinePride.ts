export const DIVINEPRIDE_KEY_STORAGE = 'DIVINEPRIDE_API_KEY';
export const DIVINEPRIDE_SERVER_STORAGE = 'DIVINEPRIDE_SERVER';

export function getDivinePrideApiKey(): string {
  return localStorage.getItem(DIVINEPRIDE_KEY_STORAGE) || '';
}

export function setDivinePrideApiKey(key: string): void {
  localStorage.setItem(DIVINEPRIDE_KEY_STORAGE, key.trim());
}

export function getDivinePrideServer(): string {
  return localStorage.getItem(DIVINEPRIDE_SERVER_STORAGE) || 'bRO';
}

export function setDivinePrideServer(server: string): void {
  localStorage.setItem(DIVINEPRIDE_SERVER_STORAGE, server.trim());
}

