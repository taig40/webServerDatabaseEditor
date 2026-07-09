export const DIVINEPRIDE_KEY_STORAGE = 'DIVINEPRIDE_API_KEY';

export function getDivinePrideApiKey(): string {
  return localStorage.getItem(DIVINEPRIDE_KEY_STORAGE) || '';
}

export function setDivinePrideApiKey(key: string): void {
  localStorage.setItem(DIVINEPRIDE_KEY_STORAGE, key.trim());
}
