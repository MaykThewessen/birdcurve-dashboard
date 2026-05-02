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
}

interface TradingViewChartProps {
  series: TradingViewSeries[]
  height?: number
  className?: string
  fitContent?: boolean
}

export default function TradingViewChart({
  series,
  height = 300,
  className = '',
  fitContent = true,
}: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesRefs = useRef<ISeriesApi<any>[]>([])
  const { setCrosshairTimestamp } = useFilterStore()

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

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth })
      }
    })
    resizeObserver.observe(containerRef.current)

    return () => {
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

    series.forEach((s) => {
      if (!chartRef.current) return

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let newSeries: ISeriesApi<any>

      if (s.type === 'area') {
        newSeries = chartRef.current.addSeries(AreaSeries, {
          lineColor: s.color ?? '#D4A574',
          topColor: s.topColor ?? (s.color ? `${s.color}33` : '#D4A57433'),
          bottomColor: s.bottomColor ?? 'transparent',
          lineWidth: (s.lineWidth ?? 2) as 1 | 2 | 3 | 4,
          title: s.title,
        })
      } else {
        newSeries = chartRef.current.addSeries(LineSeries, {
          color: s.color ?? '#D4A574',
          lineWidth: (s.lineWidth ?? 2) as 1 | 2 | 3 | 4,
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
