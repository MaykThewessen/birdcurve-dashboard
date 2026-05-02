import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface KpiCardProps {
  title: string
  value: string | number | null
  change?: number | null
  unit?: string
  loading?: boolean
  className?: string
  staggerIndex?: number
}

export default function KpiCard({
  title,
  value,
  change,
  unit,
  loading = false,
  className = '',
  staggerIndex = 0,
}: KpiCardProps) {
  const changePositive = change != null && change > 0
  const changeNegative = change != null && change < 0
  const changeNeutral = change != null && change === 0

  if (loading) {
    return (
      <div
        className={`rounded-xl p-4 border animate-fade-in-up stagger-${Math.min(staggerIndex + 1, 6)} ${className}`}
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-default)',
          opacity: 0,
        }}
      >
        <div className="skeleton h-3 w-20 mb-3 rounded" />
        <div className="skeleton h-7 w-28 mb-2 rounded" />
        <div className="skeleton h-3 w-16 rounded" />
      </div>
    )
  }

  return (
    <div
      className={`rounded-xl p-4 border transition-all duration-200 cursor-default animate-fade-in-up ${className}`}
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-default)',
        opacity: 0,
        animationDelay: `${staggerIndex * 60}ms`,
        animationFillMode: 'forwards',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.backgroundColor = 'var(--bg-elevated)'
        el.style.borderColor = 'var(--border-bright)'
        el.style.transform = 'translateY(-1px)'
        el.style.boxShadow = '0 4px 20px rgba(0,0,0,0.15)'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.backgroundColor = 'var(--bg-surface)'
        el.style.borderColor = 'var(--border-default)'
        el.style.transform = 'translateY(0)'
        el.style.boxShadow = 'none'
      }}
    >
      <div
        className="text-xs font-medium uppercase tracking-wider mb-2"
        style={{ color: 'var(--text-muted)', fontFamily: 'Outfit, sans-serif' }}
      >
        {title}
      </div>

      <div className="flex items-baseline gap-2">
        <span
          className="text-2xl font-semibold font-data"
          style={{
            color: 'var(--text-primary)',
            fontFamily: 'JetBrains Mono, monospace',
          }}
        >
          {value ?? '—'}
        </span>
        {unit && (
          <span
            className="text-xs"
            style={{ color: 'var(--text-muted)', fontFamily: 'Outfit, sans-serif' }}
          >
            {unit}
          </span>
        )}
      </div>

      {change != null && (
        <div className="flex items-center gap-1 mt-2">
          {changePositive && (
            <>
              <TrendingUp size={12} style={{ color: 'var(--accent-green)' }} />
              <span
                className="text-xs font-medium font-data"
                style={{ color: 'var(--accent-green)', fontFamily: 'JetBrains Mono, monospace' }}
              >
                +{Math.abs(change).toFixed(2)}%
              </span>
            </>
          )}
          {changeNegative && (
            <>
              <TrendingDown size={12} style={{ color: 'var(--accent-red)' }} />
              <span
                className="text-xs font-medium font-data"
                style={{ color: 'var(--accent-red)', fontFamily: 'JetBrains Mono, monospace' }}
              >
                -{Math.abs(change).toFixed(2)}%
              </span>
            </>
          )}
          {changeNeutral && (
            <>
              <Minus size={12} style={{ color: 'var(--text-muted)' }} />
              <span
                className="text-xs font-medium"
                style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}
              >
                0.00%
              </span>
            </>
          )}
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            vs prev
          </span>
        </div>
      )}
    </div>
  )
}
