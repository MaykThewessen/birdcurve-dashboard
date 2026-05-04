import { useEffect, useRef } from 'react'
import {
  createChart,
  LineSeries,
  AreaSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  ColorType,
  CrosshairMode,
  LineStyle,
} from 'lightweight-charts'
import { useFilterStore } from '../../store/filterStore'

export interface TradingViewSeries {
  data: { time: UTCTimestamp; value: number }[]
  color?: string
  lineWidth?: number
  title?: string
  type?: 'line' | 'area'
  topColor?: string
  bottomColor?: string
  /** Solid (default), Dashed for forecast / projected portions. */
  lineStyle?: 'solid' | 'dashed' | 'dotted'
}

interface TradingViewChartProps {
  series: TradingViewSeries[]
  height?: number
  className?: string
  fitContent?: boolean
  /**
   * Called (debounced) whenever the user pans/zooms the chart and
   * the visible time range changes. Receives the new range as ISO
   * date strings so callers can refetch at the appropriate resolution.
   */
  onVisibleRangeChange?: (start: string, end: string) => void
}

export default function TradingViewChart({
  series,
  height = 300,
  className = '',
  fitContent = true,
  onVisibleRangeChange,
}: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesRefs = useRef<ISeriesApi<any>[]>([])
  const { setCrosshairTimestamp } = useFilterStore()
  const onRangeRef = useRef(onVisibleRangeChange)
  useEffect(() => {
    onRangeRef.current = onVisibleRangeChange
  }, [onVisibleRangeChange])

  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#8896B3',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#1A2540', style: LineStyle.Dotted },
        horzLines: { color: '#1A2540', style: LineStyle.Dotted },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#D4A574', labelBackgroundColor: '#1A2540' },
        horzLine: { color: '#D4A574', labelBackgroundColor: '#1A2540' },
      },
      rightPriceScale: {
        borderColor: '#2A3654',
      },
      timeScale: {
        borderColor: '#2A3654',
        timeVisible: true,
        secondsVisible: false,
      },
    })

    chartRef.current = chart

    // Subscribe to crosshair
    chart.subscribeCrosshairMove((param) => {
      if (param.time) {
        setCrosshairTimestamp(param.time as number)
      } else {
        setCrosshairTimestamp(null)
      }
    })

    // Visible-range subscription (debounced) for dynamic-resolution refetch.
    // The handler reads from onRangeRef so the latest callback identity is
    // used without restarting the subscription on every re-render.
    //
    // CRITICAL: lightweight-charts fires this event on every setData call,
    // not just user interaction. Without filtering, a refetch → setData →
    // range event → refetch loop will run until React 19's perf buffer
    // overflows and the page hangs ("DataCloneError: out of memory").
    // We filter by suppressing events whose range is essentially identical
    // to the last one we fired — a 1% deadband relative to the span.
    let rangeTimer: ReturnType<typeof setTimeout> | null = null
    let lastFired: { from: number; to: number } | null = null
    const handleRange = (range: { from: unknown; to: unknown } | null) => {
      const cb = onRangeRef.current
      if (!cb || !range || typeof range.from !== 'number' || typeof range.to !== 'number') return
      const from = range.from as number
      const to = range.to as number
      if (lastFired) {
        const span = to - from
        if (
          Math.abs(from - lastFired.from) < span * 0.01 &&
          Math.abs(to - lastFired.to) < span * 0.01
        ) {
          return
        }
      }
      if (rangeTimer) clearTimeout(rangeTimer)
      rangeTimer = setTimeout(() => {
        lastFired = { from, to }
        const startIso = new Date(from * 1000).toISOString().slice(0, 10)
        const endIso = new Date(to * 1000).toISOString().slice(0, 10)
        cb(startIso, endIso)
      }, 400)
    }
    chart.timeScale().subscribeVisibleTimeRangeChange(handleRange)

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth })
      }
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      if (rangeTimer) clearTimeout(rangeTimer)
      chart.timeScale().unsubscribeVisibleTimeRangeChange(handleRange)
      resizeObserver.disconnect()
      chart.remove()
      chartRef.current = null
    }
  }, [height, setCrosshairTimestamp])

  // Update series data
  useEffect(() => {
    if (!chartRef.current) return

    // Remove old series
    seriesRefs.current.forEach((s) => {
      try {
        chartRef.current?.removeSeries(s)
      } catch {
        // ignore
      }
    })
    seriesRefs.current = []

    const lineStyleEnum = {
      solid: LineStyle.Solid,
      dashed: LineStyle.Dashed,
      dotted: LineStyle.Dotted,
    } as const

    series.forEach((s) => {
      if (!chartRef.current) return

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let newSeries: ISeriesApi<any>
      const ls = lineStyleEnum[s.lineStyle ?? 'solid']

      if (s.type === 'area') {
        newSeries = chartRef.current.addSeries(AreaSeries, {
          lineColor: s.color ?? '#D4A574',
          topColor: s.topColor ?? (s.color ? `${s.color}33` : '#D4A57433'),
          bottomColor: s.bottomColor ?? 'transparent',
          lineWidth: (s.lineWidth ?? 2) as 1 | 2 | 3 | 4,
          lineStyle: ls,
          title: s.title,
        })
      } else {
        newSeries = chartRef.current.addSeries(LineSeries, {
          color: s.color ?? '#D4A574',
          lineWidth: (s.lineWidth ?? 2) as 1 | 2 | 3 | 4,
          lineStyle: ls,
          title: s.title,
        })
      }

      newSeries.setData(s.data)
      seriesRefs.current.push(newSeries)
    })

    if (fitContent && seriesRefs.current.length > 0) {
      chartRef.current.timeScale().fitContent()
    }
  }, [series, fitContent])

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: '100%', height }}
    />
  )
}
