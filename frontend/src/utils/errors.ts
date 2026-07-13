/**
 * Translates standard API error codes (e.g., ERROR_DATABASE_LOADING)
 * into user-facing translated strings. Falls back to raw message if not found.
 */
export function translateApiError(detail: any, t: (key: any) => string): string {
  if (typeof detail !== 'string') {
    return String(detail || '');
  }
  
  if (detail.startsWith('ERROR_')) {
    const key = `api_errors.${detail}`;
    const translated = t(key);
    // useLanguageStore t returns the key itself if the key is not found
    if (translated && translated !== key) {
      return translated;
    }
  }
  
  return detail;
}
