import { type ReactNode, useRef } from 'react'
import { Download, ImageIcon, AlertTriangle } from 'lucide-react'
import LoadingSkeleton from './LoadingSkeleton'

interface ChartWrapperProps {
  title: string
  subtitle?: string
  children: ReactNode
  loading?: boolean
  error?: Error | null
  height?: number
  className?: string
  exportData?: Record<string, unknown>[]
  exportFilename?: string
}

function downloadCsv(data: Record<string, unknown>[], filename: string) {
  if (!data.length) return
  const keys = Object.keys(data[0])
  const rows = [keys.join(','), ...data.map((row) => keys.map((k) => String(row[k] ?? '')).join(','))]
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function captureCanvas(container: HTMLElement, filename: string) {
  const canvas = container.querySelector('canvas')
  if (!canvas) return
  const link = document.createElement('a')
  link.download = `${filename}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}

export default function ChartWrapper({
  title,
  subtitle,
  children,
  loading = false,
  error = null,
  height = 320,
  className = '',
  exportData,
  exportFilename = 'chart',
}: ChartWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  return (
    <div
      className={`rounded-xl border ${className}`}
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-default)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: 'var(--border-default)' }}
      >
        <div>
          <h3
            className="text-sm font-semibold"
            style={{ color: 'var(--text-primary)', fontFamily: 'Outfit, sans-serif' }}
          >
            {title}
          </h3>
          {subtitle && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {subtitle}
            </p>
          )}
        </div>

        {/* Export buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => containerRef.current && captureCanvas(containerRef.current, exportFilename)}
            className="p-1.5 rounded transition-colors"
            title="Export PNG"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-copper)')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)')}
          >
            <ImageIcon size={14} />
          </button>
          {exportData && exportData.length > 0 && (
            <button
              onClick={() => downloadCsv(exportData, exportFilename)}
              className="p-1.5 rounded transition-colors"
              title="Export CSV"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-copper)')}
              onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)')}
            >
              <Download size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div ref={containerRef} className="p-4" style={{ minHeight: height }}>
        {loading ? (
          <LoadingSkeleton variant="chart" className="w-full" />
        ) : error ? (
          <div
            className="flex flex-col items-center justify-center gap-2"
            style={{ height, color: 'var(--accent-red)' }}
          >
            <AlertTriangle size={24} />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {error.message || 'Failed to load data'}
            </p>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  )
}
