interface LoadingSkeletonProps {
  variant?: 'card' | 'chart' | 'table'
  className?: string
  rows?: number
}

export default function LoadingSkeleton({
  variant = 'card',
  className = '',
  rows = 4,
}: LoadingSkeletonProps) {
  if (variant === 'chart') {
    return (
      <div className={`w-full h-full min-h-48 rounded-lg overflow-hidden ${className}`}>
        {/* Chart header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="skeleton h-4 w-32 rounded" />
          <div className="skeleton h-4 w-20 rounded" />
        </div>
        {/* Chart area */}
        <div className="skeleton w-full rounded-lg" style={{ height: 'calc(100% - 48px)', minHeight: '180px' }} />
      </div>
    )
  }

  if (variant === 'table') {
    return (
      <div className={`w-full ${className}`}>
        {/* Table header */}
        <div className="flex gap-4 mb-3">
          <div className="skeleton h-3 w-24 rounded" />
          <div className="skeleton h-3 w-20 rounded" />
          <div className="skeleton h-3 w-16 rounded" />
          <div className="skeleton h-3 w-20 rounded" />
        </div>
        {/* Table rows */}
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-4 py-2 border-b" style={{ borderColor: 'var(--border-default)' }}>
            <div className="skeleton h-3 rounded" style={{ width: `${60 + Math.random() * 40}px` }} />
            <div className="skeleton h-3 rounded" style={{ width: `${40 + Math.random() * 30}px` }} />
            <div className="skeleton h-3 rounded" style={{ width: `${50 + Math.random() * 20}px` }} />
            <div className="skeleton h-3 rounded" style={{ width: `${45 + Math.random() * 35}px` }} />
          </div>
        ))}
      </div>
    )
  }

  // Default: card
  return (
    <div
      className={`rounded-xl p-4 border ${className}`}
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-default)',
      }}
    >
      <div className="skeleton h-3 w-20 mb-3 rounded" />
      <div className="skeleton h-7 w-28 mb-2 rounded" />
      <div className="skeleton h-3 w-16 rounded" />
    </div>
  )
}
