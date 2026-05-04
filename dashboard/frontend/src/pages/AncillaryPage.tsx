import { useState } from 'react'
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

const AXIS_LABEL_STYLE = {
  color: '#8896B3',
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 11,
}

// State labels and colors for regulation donut
const STATE_CONFIG: Record<number, { label: string; color: string }> = {
  [-1]: { label: 'Down Reg', color: '#60A5FA' },
  [0]: { label: 'No Reg', color: '#5A6A8A' },
  [1]: { label: 'Up Reg', color: '#D4A574' },
  [2]: { label: 'Mixed', color: '#A78BFA' },
}

function fmtKeur(v: number | undefined): string {
  if (v == null || isNaN(v)) return '—'
  return (v / 1000).toFixed(1)
}

function fmtEur(v: number | undefined): string {
  if (v == null || isNaN(v)) return '—'
  return v.toFixed(2)
}

export default function AncillaryPage() {
  const { scenario, dateRange } = useFilterStore()
  const [selectedYear, setSelectedYear] = useState<number>(2025)

  const { data: capacityData, isLoading: capacityLoading, error: capacityError } = useQuery({
    queryKey: ['ancillary-capacity', dateRange.start, dateRange.end, scenario],
    queryFn: () => api.ancillaryCapacity(dateRange.start, dateRange.end, scenario),
    enabled: !!scenario,
  })

  const { data: revenueData, isLoading: revenueLoading } = useQuery({
    queryKey: ['ancillary-revenue', scenario],
    queryFn: () => api.ancillaryRevenue(scenario),
    enabled: !!scenario,
  })

  const { data: regStates, isLoading: regLoading } = useQuery({
    queryKey: ['regulation-states', selectedYear, scenario],
    queryFn: () => api.regulationStates(selectedYear, scenario),
    enabled: !!scenario,
  })

  // KPI helpers
  function latestCapacity(arr?: number[]): number | undefined {
    if (!arr || arr.length === 0) return undefined
    return arr[arr.length - 1]
  }

  function revenueForYear(year: number, arr?: number[]): number | undefined {
    if (!revenueData || !arr) return undefined
    const idx = revenueData.years.indexOf(year)
    return idx >= 0 ? arr[idx] : undefined
  }

  const kpiCards = [
    {
      title: 'aFRR Cap Price (latest)',
      value: fmtEur(latestCapacity(capacityData?.afrr_cap_up)),
      unit: 'EUR/MW/h',
    },
    {
      title: 'FCR Cap Price (latest)',
      value: fmtEur(latestCapacity(capacityData?.fcr_cap_price)),
      unit: 'EUR/MW/h',
    },
    {
      title: 'aFRR Cap Rev 2030',
      value: fmtKeur(revenueForYear(2030, revenueData?.afrr_cap_revenue)),
      unit: 'k€/MW/y',
    },
    {
      title: 'FCR Cap Rev 2030',
      value: fmtKeur(revenueForYear(2030, revenueData?.fcr_cap_revenue)),
      unit: 'k€/MW/y',
    },
  ]

  // Capacity prices TradingView series
  const capacitySeries: TradingViewSeries[] = []
  if (capacityData && capacityData.datetime.length > 0) {
    const toPoints = (arr: number[]) =>
      capacityData.datetime
        .map((dt, i) => ({
          time: (new Date(dt).getTime() / 1000) as UTCTimestamp,
          value: arr[i],
        }))
        .filter((p) => p.value != null && !isNaN(p.value))
        .sort((a, b) => a.time - b.time)

    capacitySeries.push(
      {
        data: toPoints(capacityData.afrr_cap_up),
        color: '#D4A574',
        lineWidth: 1,
        title: 'aFRR Cap Up',
        type: 'line',
      },
      {
        data: toPoints(capacityData.afrr_cap_down),
        color: '#60A5FA',
        lineWidth: 1,
        title: 'aFRR Cap Down',
        type: 'line',
      },
      {
        data: toPoints(capacityData.fcr_cap_price),
        color: '#A78BFA',
        lineWidth: 1,
        title: 'FCR Cap',
        type: 'line',
      },
    )
  }

  // Annual revenue stacked bar
  const revenueOption: EChartsOption = {
    color: ['#22D3EE', '#A78BFA', '#4ADE80'],
    legend: {
      data: ['aFRR Capacity', 'FCR Capacity', 'aFRR Energy'],
      top: 4,
    },
    xAxis: {
      type: 'category',
      data: revenueData?.years?.map(String) ?? [],
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
        name: 'aFRR Capacity',
        type: 'bar',
        stack: 'revenue',
        barMaxWidth: 20,
        data: revenueData?.afrr_cap_revenue ?? [],
        itemStyle: { color: '#22D3EE' },
      },
      {
        name: 'FCR Capacity',
        type: 'bar',
        stack: 'revenue',
        barMaxWidth: 20,
        data: revenueData?.fcr_cap_revenue ?? [],
        itemStyle: { color: '#A78BFA' },
      },
      {
        name: 'aFRR Energy',
        type: 'bar',
        stack: 'revenue',
        barMaxWidth: 20,
        data: revenueData?.afrr_energy_revenue ?? [],
        itemStyle: { color: '#4ADE80' },
      },
    ],
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const items = params as { seriesName: string; value: number; color: string; dataIndex: number }[]
        const year = revenueData?.years?.[items[0]?.dataIndex ?? 0] ?? ''
        const total = items.reduce((s, p) => s + Number(p.value || 0), 0)
        const lines = items.map(
          (p) =>
            `<span style="color:${p.color}">●</span> ${p.seriesName}: <b>${(Number(p.value) / 1000).toFixed(1)} k€/MW/y</b>`,
        )
        lines.push(`<b>Total: ${(total / 1000).toFixed(1)} k€/MW/y</b>`)
        return `<div style="font-family:JetBrains Mono,monospace;font-size:12px"><b>${year}</b><br/>${lines.join('<br/>')}</div>`
      },
    },
    grid: { top: 48, right: 20, bottom: 56, left: 70, containLabel: true },
  }

  // Regulation states donut chart
  const donutData =
    regStates?.states?.map((s) => ({
      name: STATE_CONFIG[s.state]?.label ?? `State ${s.state}`,
      value: s.count,
      itemStyle: { color: STATE_CONFIG[s.state]?.color ?? '#5A6A8A' },
    })) ?? []

  const regulationOption: EChartsOption = {
    legend: {
      orient: 'vertical',
      right: 10,
      top: 'center',
      textStyle: { color: '#8896B3', fontFamily: 'Outfit, sans-serif', fontSize: 12 },
    },
    series: [
      {
        name: 'Regulation State',
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['40%', '50%'],
        avoidLabelOverlap: true,
        label: {
          show: true,
          formatter: ((p: { name?: string; percent?: number }) => `${p.name ?? ''}\n${(p.percent ?? 0).toFixed(1)}%`) as never,
          color: '#8896B3',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 11,
        },
        data: donutData,
        emphasis: {
          itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0, 0, 0, 0.5)' },
        },
      },
    ],
    tooltip: {
      trigger: 'item',
      formatter: (p: unknown) => {
        const param = p as { name: string; value: number; percent: number; color: string }
        return `<div style="font-family:JetBrains Mono,monospace;font-size:12px">
          <span style="color:${param.color}">●</span> <b>${param.name}</b><br/>
          Count: ${param.value.toLocaleString()}<br/>
          Share: <b>${param.percent?.toFixed(1)}%</b>
        </div>`
      },
    },
  }

  // Year options for regulation state selector
  const yearOptions = Array.from({ length: 28 }, (_, i) => 2023 + i)

  // Export data for capacity
  const capacityExport =
    capacityData?.datetime.map((dt, i) => ({
      datetime: dt,
      afrr_cap_up: capacityData.afrr_cap_up[i],
      afrr_cap_down: capacityData.afrr_cap_down[i],
      fcr_cap_price: capacityData.fcr_cap_price[i],
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
            Ancillary Markets
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            aFRR and FCR capacity revenues, regulation states and imbalance prices
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
          {/* KPI row — 4 cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {kpiCards.map(({ title, value, unit }, i) => (
              <KpiCard
                key={title}
                title={title}
                value={value}
                unit={unit}
                loading={capacityLoading || revenueLoading}
                staggerIndex={i}
              />
            ))}
          </div>

          {/* Capacity prices — TradingView */}
          <ChartWrapper
            title="Capacity Prices"
            subtitle="EUR/MW/h — aFRR Up/Down · FCR"
            loading={capacityLoading}
            error={capacityError as Error | null}
            height={320}
            exportData={capacityExport}
            exportFilename={`ancillary_capacity_${scenario}`}
          >
            {capacitySeries.length > 0 ? (
              <TradingViewChart series={capacitySeries} height={320} />
            ) : (
              <div
                className="flex items-center justify-center"
                style={{ height: 320, color: 'var(--text-muted)' }}
              >
                No capacity price data for selected range
              </div>
            )}
          </ChartWrapper>

          {/* Annual revenue + Regulation states */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartWrapper
              title="Annual Ancillary Revenue"
              subtitle="k€/MW/year — stacked by source"
              loading={revenueLoading}
              height={320}
              exportData={
                revenueData?.years?.map((y, i) => ({
                  year: y,
                  afrr_cap: revenueData.afrr_cap_revenue[i],
                  fcr_cap: revenueData.fcr_cap_revenue[i],
                  afrr_energy: revenueData.afrr_energy_revenue[i],
                })) ?? []
              }
              exportFilename={`ancillary_revenue_${scenario}`}
            >
              <EChartsWrapper option={revenueOption} height={320} />
            </ChartWrapper>

            <ChartWrapper
              title="Regulation States"
              subtitle={`Distribution for ${selectedYear}`}
              loading={regLoading}
              height={320}
            >
              {/* Year selector */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Year:
                </span>
                <select
                  id="ancillary-year"
                  name="year"
                  aria-label="Year"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="appearance-none px-2 py-1 text-xs rounded-lg border transition-colors"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    borderColor: 'var(--border-default)',
                    color: 'var(--text-primary)',
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                {regStates?.total_intervals != null && (
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {regStates.total_intervals.toLocaleString()} intervals
                  </span>
                )}
              </div>
              {donutData.length > 0 ? (
                <EChartsWrapper option={regulationOption} height={270} />
              ) : (
                <div
                  className="flex items-center justify-center"
                  style={{ height: 270, color: 'var(--text-muted)' }}
                >
                  No regulation state data for {selectedYear}
                </div>
              )}
            </ChartWrapper>
          </div>

          {/* Legend for state colors */}
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Regulation states:
            </span>
            {Object.entries(STATE_CONFIG).map(([state, { label, color }]) => (
              <div key={state} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
