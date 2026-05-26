import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { subDays, format } from 'date-fns'
import { api } from '../api/client'
import { useFilterStore } from '../store/filterStore'
import { useChartRange } from '../hooks/useChartRange'
import KpiCard from '../components/common/KpiCard'
import DateRangePicker from '../components/common/DateRangePicker'
import ChartWrapper from '../components/common/ChartWrapper'
import TradingViewChart, { type TradingViewSeries } from '../components/charts/TradingViewChart'
import EChartsWrapper from '../components/charts/EChartsWrapper'
import type { UTCTimestamp } from 'lightweight-charts'
import type { EChartsOption } from 'echarts'
import { AXIS_LABEL_STYLE } from '../lib/echarts-theme'
import PageShell from '../components/common/PageShell'

const CURRENT_YEAR = new Date().getFullYear()
const YEAR_OPTIONS = Array.from({ length: CURRENT_YEAR - 2018 + 1 }, (_, i) => 2018 + i)

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

function YearSelector({ value, onChange }: { value: number; onChange: (y: number) => void }) {
  return (
    <select
      name="year"
      aria-label="Year"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="px-2 py-1 text-xs rounded-lg border"
      style={{
        backgroundColor: 'var(--bg-elevated)',
        borderColor: 'var(--border-default)',
        color: 'var(--text-primary)',
        fontFamily: 'JetBrains Mono, monospace',
      }}
    >
      {YEAR_OPTIONS.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  )
}

const SUPPLY_COLORS = {
  load: '#D4A574',
  pv: '#FDE68A',
  wind_onshore: '#4ADE80',
  wind_offshore: '#22D3EE',
}

const SUPPLY_LABELS: Record<string, string> = {
  load: 'Load',
  pv: 'Solar PV',
  wind_onshore: 'Wind Onshore',
  wind_offshore: 'Wind Offshore',
}

type OverlayKey = 'load' | 'pv' | 'wind_onshore' | 'wind_offshore'

function formatPrice(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return '—'
  return v.toFixed(2)
}

// Chronological color ramp: oldest year cool blue → newest year warm copper.
// Uses HSL so it scales to any year count without a hardcoded palette.
function yearColor(yearIdx: number, total: number): string {
  if (total <= 1) return 'hsl(30, 70%, 60%)'
  const t = yearIdx / (total - 1)
  const hue = 220 - (220 - 30) * t
  const sat = 50 + t * 30
  const light = 58 + t * 6
  return `hsl(${hue.toFixed(0)}, ${sat.toFixed(0)}%, ${light.toFixed(0)}%)`
}

export default function ElectricityPage() {
  const { dateRange } = useFilterStore()
  const [heatmapYear, setHeatmapYear] = useState(CURRENT_YEAR)
  const [activeOverlays, setActiveOverlays] = useState<Set<OverlayKey>>(new Set())

  // chartRange tracks the user's current zoom on the historical chart.
  // It defaults to (and resets with) the global dateRange but is overridden
  // by visible-range-change events from TradingViewChart, which trigger a
  // refetch at whichever resolution the backend auto-selects for the new
  // span. Without this, the user gets daily granularity even after zooming
  // to a one-week window.
  // Reset zoom-tracked range when the global dateRange changes. Uses the
  // during-render reset pattern (React 19 / react-hooks/set-state-in-effect
  // disallows useEffect(() => setX(prop)).
  const { chartRange, handleVisibleRangeChange } = useChartRange(dateRange)

  const kpiStart = useMemo(() => format(subDays(new Date(), 30), 'yyyy-MM-dd'), [])
  const kpiEnd = useMemo(() => format(new Date(), 'yyyy-MM-dd'), [])

  const { data: kpiHistData, isLoading: kpiLoading } = useQuery({
    queryKey: ['electricity-kpi-hist', kpiStart, kpiEnd],
    queryFn: () => api.electricityHistorical(kpiStart, kpiEnd, 5000),
  })


  // Main chart data — resolution=auto so the backend picks 15min/hourly/daily
  // based on chartRange span. Zoom in narrows the span; the backend bumps
  // resolution; the chart re-renders at finer granularity.
  const { data: chartData, isLoading: chartLoading, error: chartError } = useQuery({
    queryKey: ['electricity-historical', chartRange.start, chartRange.end],
    queryFn: () => api.electricityHistorical(chartRange.start, chartRange.end, 8000),
  })

  // Duration curves — one per historical year, plotted on a shared
  // "% of hours within year" X axis so partial and full years overlay.
  const {
    data: durationCurvesData,
    isLoading: durationLoading,
    error: durationError,
  } = useQuery({
    queryKey: ['duration-curves'],
    queryFn: () => api.durationCurves(),
  })

  // Heatmap
  const { data: heatmapData, isLoading: heatmapLoading, error: heatmapError } = useQuery({
    queryKey: ['heatmap', heatmapYear],
    queryFn: () => api.heatmap(heatmapYear),
  })

  // Compute KPIs from last 30 days
  const kpis = useMemo(() => {
    const prices = kpiHistData?.da_prices ?? []
    if (!prices.length) return null

    const today = format(new Date(), 'yyyy-MM-dd')
    const todayPrices = prices
      .filter((p) => p.timestamp.startsWith(today))
      .map((p) => p.value)

    const monthValues = prices.map((p) => p.value)
    const latest = prices[prices.length - 1]?.value ?? null
    const avgMonth = monthValues.length
      ? monthValues.reduce((a, b) => a + b, 0) / monthValues.length
      : null
    const maxToday = todayPrices.length ? Math.max(...todayPrices) : null
    const minToday = todayPrices.length ? Math.min(...todayPrices) : null
    const negHours = durationCurvesData?.stats?.[String(CURRENT_YEAR)]?.negative_hours ?? null

    return { latest, avgMonth, maxToday, minToday, negHours }
  }, [kpiHistData, durationCurvesData])

  // Build main chart series
  const chartSeries: TradingViewSeries[] = useMemo(() => {
    const series: TradingViewSeries[] = []
    if (!chartData) return series

    // DA price — primary line
    const daPrices = chartData.da_prices
      .map((p) => ({
        time: (new Date(p.timestamp).getTime() / 1000) as UTCTimestamp,
        value: p.value,
      }))
      .sort((a, b) => a.time - b.time)

    if (daPrices.length > 0) {
      series.push({
        data: daPrices,
        color: '#D4A574',
        lineWidth: 2,
        title: 'DA Price',
        type: 'line',
      })
    }

    // Overlay series (area)
    const supplyMap: Record<OverlayKey, (s: NonNullable<typeof chartData>['supply'][number]) => number | undefined> = {
      load: (s) => s.load,
      pv: (s) => s.pv,
      wind_onshore: (s) => s.wind_onshore,
      wind_offshore: (s) => s.wind_offshore,
    }

    for (const key of Array.from(activeOverlays)) {
      const getter = supplyMap[key]
      const data = chartData.supply
        .filter((s) => getter(s) != null)
        .map((s) => ({
          time: (new Date(s.timestamp).getTime() / 1000) as UTCTimestamp,
          value: getter(s) as number,
        }))
        .sort((a, b) => a.time - b.time)

      if (data.length > 0) {
        series.push({
          data,
          color: SUPPLY_COLORS[key],
          lineWidth: 1,
          title: SUPPLY_LABELS[key],
          type: 'area',
          topColor: `${SUPPLY_COLORS[key]}33`,
          bottomColor: 'transparent',
        })
      }
    }

    return series
  }, [chartData, activeOverlays])

  // Duration curves — one ECharts line series per year, with a
  // chronological color ramp so the year drift is readable directly
  // off the chart (oldest = cool blue, newest = warm copper). The
  // latest year is drawn on top with extra weight.
  const durationOption: EChartsOption = useMemo(() => {
    if (!durationCurvesData?.years.length) return {}
    const { years, curves, stats } = durationCurvesData
    const latestYear = years[years.length - 1]

    const series = years.map((year, i) => {
      const isLatest = year === latestYear
      return {
        name: String(year),
        type: 'line' as const,
        data: curves[String(year)],
        symbol: 'none' as const,
        smooth: false,
        lineStyle: {
          width: isLatest ? 2.5 : 1.5,
          color: yearColor(i, years.length),
          opacity: isLatest ? 1 : 0.85,
        },
        z: isLatest ? 10 : i,
      }
    })

    return {
      grid: { top: 30, right: 16, bottom: 60, left: 70, containLabel: false },
      legend: {
        data: years.map(String).reverse(),  // newest first in legend
        top: 0,
        right: 16,
        textStyle: AXIS_LABEL_STYLE,
        itemWidth: 16,
        itemHeight: 2,
      },
      xAxis: {
        type: 'value',
        name: '% of hours',
        nameLocation: 'middle',
        nameGap: 30,
        min: 0,
        max: 100,
        axisLine: { lineStyle: { color: '#2A3654' } },
        axisLabel: { color: '#8896B3', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, formatter: '{value}%' },
        splitLine: { lineStyle: { color: '#1A2540' } },
      },
      yAxis: {
        type: 'value',
        name: 'EUR/MWh',
        nameLocation: 'middle',
        nameGap: 50,
        axisLine: { lineStyle: { color: '#2A3654' } },
        axisLabel: AXIS_LABEL_STYLE,
        splitLine: { lineStyle: { color: '#1A2540' } },
      },
      tooltip: {
        trigger: 'axis',
        formatter: (params: unknown) => {
          const arr = params as { seriesName: string; value: [number, number]; color: string }[]
          if (!arr?.length) return ''
          const pct = arr[0].value[0]
          const lines = [...arr]
            .sort((a, b) => Number(b.seriesName) - Number(a.seriesName))
            .map((p) => {
              const yr = p.seriesName
              const s = stats[yr]
              const tail = s ? ` <span style="color:#5B6B85">(neg ${s.negative_hours}h, peak ${s.peak_hours}h)</span>` : ''
              return `<span style="color:${p.color}">●</span> <b>${yr}</b>: ${p.value[1].toFixed(2)} EUR/MWh${tail}`
            })
          return `<div style="font-family:JetBrains Mono,monospace;font-size:12px"><b>${pct.toFixed(1)}%</b> of hours<br/>${lines.join('<br/>')}</div>`
        },
      },
      series,
      // Zero line for visual reference of negative-price tail.
      markLine: undefined,
    }
  }, [durationCurvesData])

  // Heatmap ECharts option
  const heatmapOption: EChartsOption = useMemo(() => {
    if (!heatmapData) return {}

    const { hours, months, values } = heatmapData
    // values[hour_idx][month_idx]
    const data: [number, number, number][] = []
    hours.forEach((_h, hi) => {
      months.forEach((_m, mi) => {
        const v = values[hi]?.[mi]
        if (v != null) data.push([mi, hi, Math.round(v * 10) / 10])
      })
    })

    const allVals = data.map((d) => d[2])
    const minVal = Math.min(...allVals)
    const maxVal = Math.max(...allVals)

    return {
      grid: { top: 10, right: 20, bottom: 60, left: 50, containLabel: true },
      xAxis: {
        type: 'category',
        data: months.map((m) => MONTH_NAMES[m - 1] ?? String(m)),
        axisLabel: { color: '#8896B3', fontFamily: 'Outfit, sans-serif', fontSize: 11 },
        axisLine: { lineStyle: { color: '#2A3654' } },
      },
      yAxis: {
        type: 'category',
        data: hours.map((h) => `${String(h).padStart(2, '0')}:00`),
        axisLabel: { color: '#8896B3', fontFamily: 'JetBrains Mono, monospace', fontSize: 10 },
        axisLine: { lineStyle: { color: '#2A3654' } },
      },
      visualMap: {
        min: minVal,
        max: maxVal,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        textStyle: { color: '#8896B3', fontFamily: 'JetBrains Mono, monospace', fontSize: 10 },
        inRange: {
          color: ['#3B82F6', '#1A2540', '#F87171'],
        },
      },
      tooltip: {
        formatter: (params: unknown) => {
          const p = params as { data: [number, number, number] }
          const [mi, hi, val] = p.data
          const monthName = MONTH_NAMES[months[mi] - 1] ?? String(months[mi])
          const hour = hours[hi]
          return `${monthName}, ${String(hour).padStart(2, '0')}:00<br/>Avg: <b>${val} EUR/MWh</b>`
        },
      },
      series: [
        {
          type: 'heatmap',
          data,
          label: { show: false },
          emphasis: {
            itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.5)' },
          },
        },
      ],
    }
  }, [heatmapData])

  function toggleOverlay(key: OverlayKey) {
    setActiveOverlays((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Export data for main chart
  const exportData = useMemo(
    () =>
      chartData?.da_prices.map((p) => ({
        timestamp: p.timestamp,
        da_price: p.value,
      })) ?? [],
    [chartData],
  )

  return (
    <PageShell>
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-xl font-bold"
            style={{ color: 'var(--text-primary)', fontFamily: 'Outfit, sans-serif' }}
          >
            Electricity Market
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Historical DA prices, supply mix and load data for the Netherlands
          </p>
        </div>
        <DateRangePicker />
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard
          title="Latest DA Price"
          value={formatPrice(kpis?.latest)}
          unit="EUR/MWh"
          loading={kpiLoading}
          staggerIndex={0}
        />
        <KpiCard
          title="Avg Price (30d)"
          value={formatPrice(kpis?.avgMonth)}
          unit="EUR/MWh"
          loading={kpiLoading}
          staggerIndex={1}
        />
        <KpiCard
          title="Max Today"
          value={formatPrice(kpis?.maxToday)}
          unit="EUR/MWh"
          loading={kpiLoading}
          staggerIndex={2}
        />
        <KpiCard
          title="Min Today"
          value={formatPrice(kpis?.minToday)}
          unit="EUR/MWh"
          loading={kpiLoading}
          staggerIndex={3}
        />
        <KpiCard
          title={`Negative Hours (${CURRENT_YEAR})`}
          value={kpis?.negHours != null ? String(kpis.negHours) : '—'}
          unit="h"
          loading={kpiLoading}
          staggerIndex={4}
        />
      </div>

      {/* Overlay toggles */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Overlay:
        </span>
        {(Object.keys(SUPPLY_LABELS) as OverlayKey[]).map((key) => {
          const active = activeOverlays.has(key)
          const color = SUPPLY_COLORS[key]
          return (
            <button
              key={key}
              onClick={() => toggleOverlay(key)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all duration-200"
              style={{
                borderColor: active ? color : 'var(--border-default)',
                backgroundColor: active ? `${color}22` : 'transparent',
                color: active ? color : 'var(--text-muted)',
              }}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: active ? color : 'var(--text-muted)' }}
              />
              {SUPPLY_LABELS[key]}
            </button>
          )
        })}
      </div>

      {/* Main time-series chart */}
      <ChartWrapper
        title="DA Price History"
        subtitle="EUR/MWh · hourly"
        loading={chartLoading}
        error={chartError as Error | null}
        height={380}
        exportData={exportData}
        exportFilename="da_price_history"
      >
        <TradingViewChart
          series={chartSeries}
          height={380}
          onVisibleRangeChange={handleVisibleRangeChange}
        />
      </ChartWrapper>

      {/* Duration curve + Heatmap */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Duration curve */}
        <ChartWrapper
          title="Price Duration Curve"
          subtitle="Sorted hours descending"
          loading={durationLoading}
          error={durationError as Error | null}
          height={320}
          exportData={
            durationCurvesData
              ? durationCurvesData.years.flatMap((y) =>
                  (durationCurvesData.curves[String(y)] ?? []).map(([pct, price]) => ({
                    year: y,
                    pct_of_hours: pct,
                    price_eur_mwh: price,
                  })),
                )
              : []
          }
          exportFilename="duration_curves_by_year"
        >
          <EChartsWrapper option={durationOption} height={290} />
        </ChartWrapper>

        {/* Heatmap */}
        <ChartWrapper
          title="Price Heatmap"
          subtitle="Avg EUR/MWh by hour × month"
          loading={heatmapLoading}
          error={heatmapError as Error | null}
          height={320}
          exportFilename={`heatmap_${heatmapYear}`}
        >
          <div className="flex items-center justify-between mb-2">
            <div />
            <YearSelector value={heatmapYear} onChange={setHeatmapYear} />
          </div>
          <EChartsWrapper option={heatmapOption} height={280} />
        </ChartWrapper>
      </div>
    </PageShell>
  )
}
