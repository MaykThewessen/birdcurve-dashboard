import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { subDays, format } from 'date-fns'
import { api } from '../api/client'
import { useFilterStore } from '../store/filterStore'
import KpiCard from '../components/common/KpiCard'
import DateRangePicker from '../components/common/DateRangePicker'
import ChartWrapper from '../components/common/ChartWrapper'
import TradingViewChart, { type TradingViewSeries } from '../components/charts/TradingViewChart'
import EChartsWrapper from '../components/charts/EChartsWrapper'
import type { UTCTimestamp } from 'lightweight-charts'
import type { EChartsOption } from 'echarts'

const CURRENT_YEAR = new Date().getFullYear()
const YEAR_OPTIONS = Array.from({ length: CURRENT_YEAR - 2018 + 1 }, (_, i) => 2018 + i)

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

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

export default function ElectricityPage() {
  const { dateRange } = useFilterStore()
  const [durationYear, setDurationYear] = useState(CURRENT_YEAR)
  const [heatmapYear, setHeatmapYear] = useState(CURRENT_YEAR)
  const [activeOverlays, setActiveOverlays] = useState<Set<OverlayKey>>(new Set())

  // KPI data: last 30 days of electricity data
  const kpiStart = format(subDays(new Date(), 30), 'yyyy-MM-dd')
  const kpiEnd = format(new Date(), 'yyyy-MM-dd')

  const { data: kpiHistData, isLoading: kpiLoading } = useQuery({
    queryKey: ['electricity-kpi-hist', kpiStart, kpiEnd],
    queryFn: () => api.electricityHistorical(kpiStart, kpiEnd, 5000),
  })

  const { data: durationKpiData } = useQuery({
    queryKey: ['duration-curve-kpi', CURRENT_YEAR],
    queryFn: () => api.durationCurve(CURRENT_YEAR),
  })

  // Main chart data
  const { data: chartData, isLoading: chartLoading, error: chartError } = useQuery({
    queryKey: ['electricity-historical', dateRange.start, dateRange.end],
    queryFn: () => api.electricityHistorical(dateRange.start, dateRange.end, 8000),
  })

  // Duration curve
  const { data: durationData, isLoading: durationLoading, error: durationError } = useQuery({
    queryKey: ['duration-curve', durationYear],
    queryFn: () => api.durationCurve(durationYear),
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
    const negHours = durationKpiData?.negative_hours ?? null

    return { latest, avgMonth, maxToday, minToday, negHours }
  }, [kpiHistData, durationKpiData])

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
    const supplyMap: Record<OverlayKey, (s: typeof chartData.supply[0]) => number | undefined> = {
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

  // Duration curve ECharts option
  const durationOption: EChartsOption = useMemo(() => {
    if (!durationData) return {}
    const prices = durationData.sorted_prices
    const xData = prices.map((_, i) => i)
    const negHours = durationData.negative_hours
    const peakHours = durationData.peak_hours
    const total = durationData.total_hours

    return {
      grid: { top: 50, right: 20, bottom: 60, left: 70, containLabel: false },
      xAxis: {
        type: 'value',
        name: 'Hours',
        nameLocation: 'middle',
        nameGap: 30,
        min: 0,
        max: total,
        axisLine: { lineStyle: { color: '#2A3654' } },
        axisLabel: { color: '#8896B3', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 },
        splitLine: { lineStyle: { color: '#1A2540' } },
      },
      yAxis: {
        type: 'value',
        name: 'EUR/MWh',
        nameLocation: 'middle',
        nameGap: 50,
        axisLine: { lineStyle: { color: '#2A3654' } },
        axisLabel: { color: '#8896B3', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 },
        splitLine: { lineStyle: { color: '#1A2540' } },
      },
      tooltip: {
        trigger: 'axis',
        formatter: (params: unknown) => {
          const p = params as { dataIndex: number; value: number[] }[]
          if (!p?.length) return ''
          const idx = p[0].dataIndex
          return `Hour rank: ${idx + 1}<br/>Price: <b>${prices[idx]?.toFixed(2)} EUR/MWh</b>`
        },
      },
      visualMap: {
        show: false,
        type: 'piecewise',
        dimension: 1,
        pieces: [
          { lt: 0, color: '#F87171' },
          { gte: 0, lt: 200, color: '#D4A574' },
          { gte: 200, color: '#FB923C' },
        ],
      },
      series: [
        {
          type: 'line',
          data: xData.map((x) => [x, prices[x]]),
          symbol: 'none',
          lineStyle: { width: 2 },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(212,165,116,0.3)' },
                { offset: 1, color: 'rgba(212,165,116,0.02)' },
              ],
            },
          },
          markLine: {
            silent: true,
            lineStyle: { color: '#F87171', type: 'dashed', width: 1 },
            data: [{ yAxis: 0, name: 'Zero' }],
          },
        },
      ],
      graphic: [
        {
          type: 'text',
          left: 10,
          top: 10,
          style: {
            text: `Neg: ${negHours}h  Peak>200: ${peakHours}h`,
            fill: '#8896B3',
            fontSize: 11,
            fontFamily: 'JetBrains Mono, monospace',
          },
        },
      ],
    }
  }, [durationData])

  // Heatmap ECharts option
  const heatmapOption: EChartsOption = useMemo(() => {
    if (!heatmapData) return {}

    const { hours, months, values } = heatmapData
    // values[hour_idx][month_idx]
    const data: [number, number, number][] = []
    hours.forEach((h, hi) => {
      months.forEach((m, mi) => {
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

  const YearSelector = ({ value, onChange }: { value: number; onChange: (y: number) => void }) => (
    <select
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

  return (
    <div className="p-6 space-y-6 animate-fade-in">
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
        <TradingViewChart series={chartSeries} height={380} />
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
            durationData?.sorted_prices.map((v, i) => ({ rank: i + 1, price_eur_mwh: v })) ?? []
          }
          exportFilename={`duration_curve_${durationYear}`}
        >
          <div className="flex items-center justify-between mb-2">
            <div />
            <YearSelector value={durationYear} onChange={setDurationYear} />
          </div>
          <EChartsWrapper option={durationOption} height={280} />
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
    </div>
  )
}
