import { useFilterStore } from '../../store/filterStore'
import { subMonths, subYears, format } from 'date-fns'

const PRESETS = [
  { label: '1M', getRange: () => ({ start: format(subMonths(new Date(), 1), 'yyyy-MM-dd'), end: format(new Date(), 'yyyy-MM-dd') }) },
  { label: '3M', getRange: () => ({ start: format(subMonths(new Date(), 3), 'yyyy-MM-dd'), end: format(new Date(), 'yyyy-MM-dd') }) },
  { label: '1Y', getRange: () => ({ start: format(subYears(new Date(), 1), 'yyyy-MM-dd'), end: format(new Date(), 'yyyy-MM-dd') }) },
  { label: '5Y', getRange: () => ({ start: format(subYears(new Date(), 5), 'yyyy-MM-dd'), end: format(new Date(), 'yyyy-MM-dd') }) },
  { label: 'ALL', getRange: () => ({ start: '2018-01-01', end: format(new Date(), 'yyyy-MM-dd') }) },
]

interface DateRangePickerProps {
  className?: string
}

export default function DateRangePicker({ className = '' }: DateRangePickerProps) {
  const { dateRange, setDateRange } = useFilterStore()

  const isPresetActive = (preset: typeof PRESETS[0]) => {
    const range = preset.getRange()
    return dateRange.start === range.start && dateRange.end === range.end
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Preset buttons */}
      <div
        className="flex rounded-lg overflow-hidden border"
        style={{ borderColor: 'var(--border-default)' }}
      >
        {PRESETS.map((preset) => {
          const active = isPresetActive(preset)
          return (
            <button
              key={preset.label}
              onClick={() => {
                const range = preset.getRange()
                setDateRange(range.start, range.end)
              }}
              className="px-3 py-1.5 text-xs font-medium transition-all duration-200"
              style={{
                backgroundColor: active ? 'var(--accent-copper)' : 'var(--bg-elevated)',
                color: active ? 'var(--bg-primary)' : 'var(--text-secondary)',
                fontFamily: 'JetBrains Mono, monospace',
              }}
            >
              {preset.label}
            </button>
          )
        })}
      </div>

      {/* Custom date inputs */}
      <div className="flex items-center gap-1">
        <input
          type="date"
          value={dateRange.start}
          onChange={(e) => setDateRange(e.target.value, dateRange.end)}
          className="px-2 py-1.5 text-xs rounded-lg border transition-colors"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            borderColor: 'var(--border-default)',
            color: 'var(--text-primary)',
            fontFamily: 'JetBrains Mono, monospace',
            colorScheme: 'dark',
          }}
        />
        <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>to</span>
        <input
          type="date"
          value={dateRange.end}
          onChange={(e) => setDateRange(dateRange.start, e.target.value)}
          className="px-2 py-1.5 text-xs rounded-lg border transition-colors"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            borderColor: 'var(--border-default)',
            color: 'var(--text-primary)',
            fontFamily: 'JetBrains Mono, monospace',
            colorScheme: 'dark',
          }}
        />
      </div>
    </div>
  )
}
