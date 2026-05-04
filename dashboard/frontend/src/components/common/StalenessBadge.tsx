import { useEffect, useState } from 'react'

interface StalenessBadgeProps {
  /** ISO date string ('YYYY-MM-DD') or full ISO timestamp; null/undefined → no badge. */
  asOf?: string | null
  /** Hours threshold above which the badge turns warning-coloured (default 48h). */
  warnAfterHours?: number
  /** Hours threshold above which the badge turns danger-coloured (default 7d). */
  dangerAfterHours?: number
  className?: string
}

/**
 * Compact "as-of" indicator showing how stale a value is. Several columns in
 * the upstream pipeline lag the wall clock by 1-30 days (PV, wind, DA price,
 * imbalance), and the dashboard previously rendered them as if current. This
 * badge surfaces the lag explicitly so analysts don't take a 25-day-old
 * "latest gas price" at face value.
 */
export default function StalenessBadge({
  asOf,
  warnAfterHours = 48,
  dangerAfterHours = 24 * 7,
  className = '',
}: StalenessBadgeProps) {
  // Date.now() is impure; React 19's react-hooks/purity rule disallows
  // it during render. Track 'now' in state and refresh every minute —
  // the badge only needs minute-resolution accuracy anyway.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  if (!asOf) return null

  const ts = Date.parse(asOf)
  if (Number.isNaN(ts)) return null

  const ageHours = (now - ts) / 3_600_000
  const ageLabel = formatAge(ageHours)
  const tone =
    ageHours >= dangerAfterHours
      ? { fg: '#F87171', bg: 'rgba(248, 113, 113, 0.12)', border: 'rgba(248, 113, 113, 0.3)' }
      : ageHours >= warnAfterHours
        ? { fg: '#FACC15', bg: 'rgba(250, 204, 21, 0.10)', border: 'rgba(250, 204, 21, 0.3)' }
        : { fg: '#22D3EE', bg: 'rgba(34, 211, 238, 0.10)', border: 'rgba(34, 211, 238, 0.3)' }

  // Show full date for >24h-old data so the user sees the actual date.
  // For sub-day lags, just '3h ago' is enough.
  const dateLabel = ageHours >= 24 ? asOf.slice(0, 10) : null

  return (
    <span
      title={`Latest data: ${asOf}`}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] border ${className}`}
      style={{
        color: tone.fg,
        backgroundColor: tone.bg,
        borderColor: tone.border,
        fontFamily: 'JetBrains Mono, monospace',
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: tone.fg }} />
      {dateLabel && <span style={{ color: '#8896B3' }}>{dateLabel}</span>}
      <span>{ageLabel}</span>
    </span>
  )
}

function formatAge(hours: number): string {
  if (hours < 1) return 'just now'
  if (hours < 24) return `${Math.round(hours)}h ago`
  const days = hours / 24
  if (days < 30) return `${Math.round(days)}d ago`
  const months = days / 30
  if (months < 12) return `${Math.round(months)}mo ago`
  return `${Math.round(months / 12)}y ago`
}
