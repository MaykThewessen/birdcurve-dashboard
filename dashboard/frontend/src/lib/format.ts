/** Number formatting shared across pages. Placeholder glyph for missing data. */
const MISSING = '—'

export function fmtEur(v: number | null | undefined, decimals = 1): string {
  if (v == null || isNaN(v)) return MISSING
  return v.toFixed(decimals)
}

export function fmtKeur(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return MISSING
  return (v / 1000).toFixed(1)
}
