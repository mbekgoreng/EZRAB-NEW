/** Format nominal untuk AI Credits — rupiah & kredit. */
export function formatCredits(n: number): string {
  return `${Math.round(n).toLocaleString('id-ID')} kredit`;
}

export function formatCreditsShort(n: number): string {
  if (n >= 1000) {
    const v = n / 1000;
    return `${Number(v.toFixed(v >= 10 ? 0 : 1))}rb`;
  }
  return String(Math.round(n));
}

export function formatRupiah(n: number): string {
  return `Rp${Math.round(n).toLocaleString('id-ID')}`;
}

export function formatEstimateRange(min: number, max: number): string {
  if (min === max) return formatCredits(min);
  return `${Math.round(min).toLocaleString('id-ID')}–${Math.round(max).toLocaleString('id-ID')} kredit`;
}

export function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
