import { useQuery } from '@tanstack/react-query'
import type { UTCTimestamp } from 'lightweight-charts'
import { api } from '../api/client'
import { useFilterStore } from '../store/filterStore'
import KpiCard from '../components/common/KpiCard'
import ScenarioSelector from '../components/common/ScenarioSelector'
import DateRangePicker from '../components/common/DateRangePicker'
import ChartWrapper from '../components/common/ChartWrapper'
import TradingViewChart, { type TradingViewSeries } from '../components/charts/TradingViewChart'
import EChartsWrapper from '../components/charts/EChartsWrapper'
import type { EChartsOption } from 'echarts'

const TARGET_YEARS = [2025, 2030, 2040, 2050]

const AXIS_LABEL_STYLE = {
  color: '#8896B3',
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 11,
}

function fmtEur(v: number | undefined): string {
  if (v == null || isNaN(v)) return '—'
  return v.toFixed(1)
}

function fmtKeur(v: number | undefined): string {
  if (v == null || isNaN(v)) return '—'
  return (v / 1000).toFixed(1)
}

export default function ForecastPage() {
  const { scenario, dateRange } = useFilterStore()

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['annual-stats', scenario],
    queryFn: () => api.annualStats(scenario),
    enabled: !!scenario,
  })

  const { data: forecastData, isLoading: forecastLoading, error: forecastError } = useQuery({
    queryKey: ['forecast-da', dateRange.start, dateRange.end, scenario],
    queryFn: () => api.forecastDa(dateRange.start, dateRange.end, scenario),
    enabled: !!scenario,
  })

  // KPI helpers — find index by year
  function statForYear(year: number, arr?: number[]): number | undefined {
    if (!statsData || !arr) return undefined
    const idx = statsData.years.indexOf(year)
    return idx >= 0 ? arr[idx] : undefined
  }

  const kpiCards = [
    {
      title: 'Avg DA 2025',
      value: fmtEur(statForYear(2025, statsData?.avg_da)),
      unit: 'EUR/MWh',
    },
    {
      title: 'Avg DA 2030',
      value: fmtEur(statForYear(2030, statsData?.avg_da)),
      unit: 'EUR/MWh',
    },
    {
      title: 'Avg DA 2040',
      value: fmtEur(statForYear(2040, statsData?.avg_da)),
      unit: 'EUR/MWh',
    },
    {
      title: 'Avg DA 2050',
      value: fmtEur(statForYear(2050, statsData?.avg_da)),
      unit: 'EUR/MWh',
    },
    {
      title: 'BESS 4h Rev 2030',
      value: fmtKeur(statForYear(2030, statsData?.bess_4h)),
      unit: 'k€/MW/y',
    },
  ]

  // DA Forecast chart series
  const forecastSeries: TradingViewSeries[] = []
  if (forecastData) {
    // Actual prices (may be null for future)
    const actualPoints = forecastData.datetime
      .map((dt, i) => ({
        time: (new Date(dt).getTime() / 1000) as UTCTimestamp,
        value: forecastData.price_actual[i],
      }))
      .filter((p) => p.value != null) as { time: UTCTimestamp; value: number }[]

    if (actualPoints.length > 0) {
      forecastSeries.push({
        data: actualPoints.sort((a, b) => a.time - b.time),
        color: '#D4A574',
        lineWidth: 1,
        title: 'Actual',
        type: 'line',
      })
    }

    // Predicted prices
    const predictedPoints = forecastData.datetime
      .map((dt, i) => ({
        time: (new Date(dt).getTime() / 1000) as UTCTimestamp,
        value: forecastData.price_predicted[i],
      }))
      .filter((p) => p.value != null && !isNaN(p.value))
      .sort((a, b) => a.time - b.time)

    if (predictedPoints.length > 0) {
      forecastSeries.push({
        data: predictedPoints,
        color: '#60A5FA',
        lineWidth: 1,
        title: 'Predicted',
        type: 'line',
      })
    }
  }

  // Annual statistics ECharts bar chart
  const annualStatsOption: EChartsOption = {
    color: ['#D4A574', '#60A5FA'],
    legend: { data: ['Avg DA Price', 'Daily Spread'], top: 4 },
    xAxis: {
      type: 'category',
      data: statsData?.years?.map(String) ?? [],
      axisLabel: { ...AXIS_LABEL_STYLE, rotate: 45 },
      axisLine: { lineStyle: { color: '#2A3654' } },
    },
    yAxis: {
      type: 'value',
      name: 'EUR/MWh',
      nameTextStyle: { color: '#8896B3', fontFamily: 'Outfit, sans-serif', fontSize: 11 },
      axisLabel: AXIS_LABEL_STYLE,
      splitLine: { lineStyle: { color: '#1A2540', type: 'dashed' } },
    },
    series: [
      {
        name: 'Avg DA Price',
        type: 'bar',
        barMaxWidth: 14,
        data: statsData?.avg_da?.map((v, i) => ({
          value: v,
          // error bars via markLine not natively supported in bar, show as itemStyle
          itemStyle: { color: '#D4A574' },
        })) ?? [],
      },
      {
        name: 'Daily Spread',
        type: 'bar',
        barMaxWidth: 14,
        data: statsData?.spread ?? [],
        itemStyle: { color: '#60A5FA' },
      },
    ],
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const items = params as { seriesName: string; value: number; color: string; dataIndex: number }[]
        const year = statsData?.years?.[items[0]?.dataIndex ?? 0] ?? ''
        const std = statsData?.std_da?.[items[0]?.dataIndex ?? 0]
        const lines = items.map(
          (p) => `<span style="color:${p.color}">●</span> ${p.seriesName}: <b>${Number(p.value).toFixed(1)} EUR/MWh</b>`,
        )
        if (std != null) {
          lines.push(`<span style="color:#5a6a8a">± Std Dev: ${std.toFixed(1)} EUR/MWh</span>`)
        }
        return `<div style="font-family:JetBrains Mono,monospace;font-size:12px"><b>${year}</b><br/>${lines.join('<br/>')}</div>`
      },
    },
    grid: { top: 48, right: 20, bottom: 56, left: 60, containLabel: true },
  }

  // BESS Revenue chart
  const bessRevenueOption: EChartsOption = {
    color: ['#4ADE80', '#D4A574', '#F87171', '#22D3EE', '#A78BFA'],
    legend: {
      data: ['BESS 2h DA', 'BESS 4h DA', 'BESS 8h DA', 'ID3 2h', 'aFRR Energy'],
      top: 4,
    },
    xAxis: {
      type: 'category',
      data: statsData?.years?.map(String) ?? [],
      axisLabel: { ...AXIS_LABEL_STYLE, rotate: 45 },
      axisLine: { lineStyle: { color: '#2A3654' } },
    },
    yAxis: {
      type: 'value',
      name: 'k€/MW/y',
      nameTextStyle: { color: '#8896B3', fontFamily: 'Outfit, sans-serif', fontSize: 11 },
      axisLabel: {
        ...AXIS_LABEL_STYLE,
        formatter: (v: number) => (v / 1000).toFixed(0),
      },
      splitLine: { lineStyle: { color: '#1A2540', type: 'dashed' } },
    },
    series: [
      {
        name: 'BESS 2h DA',
        type: 'bar',
        barMaxWidth: 10,
        data: statsData?.bess_2h ?? [],
        itemStyle: { color: '#4ADE80' },
      },
      {
        name: 'BESS 4h DA',
        type: 'bar',
        barMaxWidth: 10,
        data: statsData?.bess_4h ?? [],
        itemStyle: { color: '#D4A574' },
      },
      {
        name: 'BESS 8h DA',
        type: 'bar',
        barMaxWidth: 10,
        data: statsData?.bess_8h ?? [],
        itemStyle: { color: '#F87171' },
      },
      {
        name: 'ID3 2h',
        type: 'bar',
        barMaxWidth: 10,
        data: statsData?.bess_id3 ?? [],
        itemStyle: { color: '#22D3EE' },
      },
      {
        name: 'aFRR Energy',
        type: 'bar',
        barMaxWidth: 10,
        data: statsData?.bess_afrr ?? [],
        itemStyle: { color: '#A78BFA' },
      },
    ],
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const items = params as { seriesName: string; value: number; color: string; dataIndex: number }[]
        const year = statsData?.years?.[items[0]?.dataIndex ?? 0] ?? ''
        const lines = items.map(
          (p) =>
            `<span style="color:${p.color}">●</span> ${p.seriesName}: <b>${(Number(p.value) / 1000).toFixed(1)} k€/MW/y</b>`,
        )
        return `<div style="font-family:JetBrains Mono,monospace;font-size:12px"><b>${year}</b><br/>${lines.join('<br/>')}</div>`
      },
    },
    grid: { top: 56, right: 20, bottom: 56, left: 70, containLabel: true },
  }

  // Export data for forecast
  const forecastExport =
    forecastData?.datetime.map((dt, i) => ({
      datetime: dt,
      price_actual: forecastData.price_actual[i] ?? '',
      price_predicted: forecastData.price_predicted[i],
    })) ?? []

  const noScenario = !scenario

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1
            className="text-xl font-bold"
            style={{ color: 'var(--text-primary)', fontFamily: 'Outfit, sans-serif' }}
          >
            Price Forecast
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            DA, ID3 and balancing market forecasts 2018–2050
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <ScenarioSelector />
          <DateRangePicker />
        </div>
      </div>

      {noScenario ? (
        <div
          className="flex items-center justify-center rounded-xl border"
          style={{
            height: 200,
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-default)',
            color: 'var(--text-muted)',
          }}
        >
          <p className="text-sm" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Select a scenario to view data
          </p>
        </div>
      ) : (
        <>
          {/* KPI row — 5 cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {kpiCards.map(({ title, value, unit }, i) => (
              <KpiCard
                key={title}
                title={title}
                value={value}
                unit={unit}
                loading={statsLoading}
                staggerIndex={i}
              />
            ))}
          </div>

          {/* DA forecast chart — TradingView */}
          <ChartWrapper
            title="DA Price Forecast"
            subtitle="EUR/MWh — Actual (copper) vs Predicted (blue)"
            loading={forecastLoading}
            error={forecastError as Error | null}
            height={380}
            exportData={forecastExport}
            exportFilename={`da_forecast_${scenario}`}
          >
            {forecastSeries.length > 0 ? (
              <TradingViewChart series={forecastSeries} height={380} />
            ) : (
              <div
                className="flex items-center justify-center"
                style={{ height: 380, color: 'var(--text-muted)' }}
              >
                No data for selected range
              </div>
            )}
          </ChartWrapper>

          {/* Annual stats + BESS Revenue */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartWrapper
              title="Annual Statistics"
              subtitle="Avg DA price + Daily spread (EUR/MWh)"
              loading={statsLoading}
              height={320}
              exportData={
                statsData?.years?.map((y, i) => ({
                  year: y,
                  avg_da: statsData.avg_da[i],
                  std_da: statsData.std_da[i],
                  spread: statsData.spread[i],
                })) ?? []
              }
              exportFilename={`annual_stats_${scenario}`}
            >
              <EChartsWrapper option={annualStatsOption} height={320} />
            </ChartWrapper>

            <ChartWrapper
              title="BESS Revenue"
              subtitle="EUR/MW/year — by duration and market"
              loading={statsLoading}
              height={320}
              exportData={
                statsData?.years?.map((y, i) => ({
                  year: y,
                  bess_2h: statsData.bess_2h[i],
                  bess_4h: statsData.bess_4h[i],
                  bess_8h: statsData.bess_8h[i],
                  bess_id3: statsData.bess_id3[i],
                  bess_afrr: statsData.bess_afrr[i],
                })) ?? []
              }
              exportFilename={`bess_revenue_${scenario}`}
            >
              <EChartsWrapper option={bessRevenueOption} height={320} />
            </ChartWrapper>
          </div>

          {/* Summary note */}
          <p className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'Outfit, sans-serif' }}>
            Scenario: <span style={{ color: 'var(--accent-copper)' }}>{scenario}</span>.
            Target years shown: {TARGET_YEARS.join(', ')}.
            BESS revenue = daily top-N discharge hours minus bottom-N charge hours × 365.
          </p>
        </>
      )}
    </div>
  )
}
