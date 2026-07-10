export const humanizeNumber = (number: number) => {
  return number.toLocaleString();
}

export const pluralize = (number: number, word: string, pluralWord: string) => {
  return number === 1 ? word : pluralWord
}

export const humanizeBytes = (bytes: number) => {
  if (!bytes || isNaN(bytes)) {
    return `0 bytes`
  }
  if (bytes < 1024) {
    return `${bytes} bytes`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export const humanizeDuration = (duration: string | number | null | undefined) => {
  if (duration === null || duration === undefined || duration === '') {
    return null;
  }
  const ms = Number(duration);
  if (isNaN(ms)) {
    return null;
  }
  const totalSeconds = Math.round(ms / 1000);

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (totalSeconds < 3600) {
    return `${minutes}m`;
  }
  return `${hours}h ${minutes}m`;
}
