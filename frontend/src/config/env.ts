export function deobfuscate(value: string | undefined): string {
  if (!value) return '';
  if (value.startsWith('obf:')) {
    try {
      const encoded = value.slice(4);
      const binaryString = atob(encoded);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return new TextDecoder().decode(bytes);
    } catch (e) {
      console.warn('[Warning] Failed to deobfuscate value:', e);
      return value;
    }
  }
  return value;
}

export function obfuscate(value: string): string {
  if (!value) return '';
  const bytes = new TextEncoder().encode(value);
  let binaryString = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binaryString += String.fromCharCode(bytes[i]);
  }
  return 'obf:' + btoa(binaryString);
}

// Centrally deobfuscate and export the API URL
const rawApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
export const API_URL = deobfuscate(rawApiUrl);
