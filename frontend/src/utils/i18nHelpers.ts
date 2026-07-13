export function localizeLoadingStatus(statusStr: string, t: (key: string, options?: any) => string): string {
  if (!statusStr) return '';

  const clean = statusStr.trim();

  // Match: "Lendo arquivo: <filename>..."
  if (clean.startsWith("Lendo arquivo: ") && clean.endsWith("...")) {
    const filename = clean.slice("Lendo arquivo: ".length, -3);
    return t('loading.readingFile', { filename });
  }

  // Match: "Lendo arquivo de monstros: <filename>..."
  if (clean.startsWith("Lendo arquivo de monstros: ") && clean.endsWith("...")) {
    const filename = clean.slice("Lendo arquivo de monstros: ".length, -3);
    return t('loading.readingMonstersFile', { filename });
  }

  // Match: "Lendo <filename>..."
  if (clean.startsWith("Lendo ") && clean.endsWith("...")) {
    const filename = clean.slice("Lendo ".length, -3);
    return t('loading.readingFile', { filename });
  }

  // Exact matching for common status strings
  switch (clean) {
    case "Conectando ao Backend...":
      return t('loading.connecting');
    case "Carregando lista de Itens...":
      return t('loading.loadingItems');
    case "Carregando lista de monstros...":
      return t('loading.loadingMonsters');
    case "Carregando banco de habilidades...":
      return t('loading.loadingSkills');
    case "Aguardando inicialização...":
      return t('loading.waitingInit');
    default:
      return clean;
  }
}
