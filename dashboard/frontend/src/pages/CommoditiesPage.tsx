import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { useFilterStore } from '../store/filterStore'
import KpiCard from '../components/common/KpiCard'
import DateRangePicker from '../components/common/DateRangePicker'
import ChartWrapper from '../components/common/ChartWrapper'
import TradingViewChart, { type TradingViewSeries } from '../components/charts/TradingViewChart'
import type { UTCTimestamp } from 'lightweight-charts'

const SERIES_COLORS: Record<string, string> = {
  gas_ttf: '#D4A574',
  co2_eua: '#60A5FA',
  coal_api2: '#A78BFA',
  eur_usd: '#22D3EE',
  gas_marginal: '#4ADE80',
  coal_marginal: '#F87171',
}

const SERIES_LABELS: Record<string, string> = {
  gas_ttf: 'Gas TTF',
  co2_eua: 'CO2 EUA',
  coal_api2: 'Coal API2',
  eur_usd: 'EUR/USD',
  gas_marginal: 'Gas Marginal',
  coal_marginal: 'Coal Marginal',
}

const SERIES_UNITS: Record<string, string> = {
  gas_ttf: 'EUR/MWh',
  co2_eua: 'EUR/ton',
  coal_api2: 'USD/ton',
  eur_usd: 'USD/EUR',
  gas_marginal: 'EUR/MWh',
  coal_marginal: 'EUR/MWh',
}

function formatValue(value: number | string | null | undefined, key: string): string {
  if (value == null) return '—'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '—'
  if (key.includes('eur_usd')) return num.toFixed(4)
  return num.toFixed(2)
}

export default function CommoditiesPage() {
  const { dateRange } = useFilterStore()
  const [showMarginal, setShowMarginal] = useState(false)
  const [activeSeriesKeys, setActiveSeriesKeys] = useState<Set<string>>(
    new Set(['gas_ttf', 'co2_eua', 'coal_api2']),
  )

  const { data: kpiData, isLoading: kpiLoading } = useQuery({
    queryKey: ['commodity-kpi'],
    queryFn: () => api.commodityKpi(),
  })

  const { data: commodityData, isLoading: chartLoading, error: chartError } = useQuery({
    queryKey: ['commodities', dateRange.start, dateRange.end, showMarginal],
    queryFn: () => api.commodities(dateRange.start, dateRange.end, showMarginal),
  })

  // Build chart series
  const chartSeries: TradingViewSeries[] = []
  if (commodityData) {
    const seriesKeys = ['gas_ttf', 'co2_eua', 'coal_api2', 'eur_usd']
    if (showMarginal) seriesKeys.push('gas_marginal', 'coal_marginal')

    seriesKeys.forEach((key) => {
      if (!activeSeriesKeys.has(key)) return
      const raw = commodityData[key as keyof typeof commodityData] as
        | { date: string; value: number }[]
        | undefined
      if (!raw || raw.length === 0) return

      const data = raw
        .map((p) => ({
          time: (new Date(p.date).getTime() / 1000) as UTCTimestamp,
          value: p.value,
        }))
        .sort((a, b) => a.time - b.time)

      chartSeries.push({
        data,
        color: SERIES_COLORS[key],
        lineWidth: 2,
        title: SERIES_LABELS[key],
        type: 'line',
      })
    })
  }

  // KPI cards
  const kpiCards = [
    { key: 'gas_ttf', title: 'Gas TTF', unit: 'EUR/MWh' },
    { key: 'co2_eua', title: 'CO2 EUA', unit: 'EUR/ton' },
    { key: 'coal_api2', title: 'Coal API2', unit: 'USD/ton' },
    { key: 'gas_marginal', title: 'Gas Marginal', unit: 'EUR/MWh' },
    { key: 'coal_marginal', title: 'Coal Marginal', unit: 'EUR/MWh' },
  ]

  function toggleSeries(key: string) {
    setActiveSeriesKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        if (next.size > 1) next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  // Export data
  const exportData =
    commodityData?.gas_ttf?.map((p, i) => ({
      date: p.date,
      gas_ttf: p.value,
      co2_eua: commodityData.co2_eua?.[i]?.value ?? '',
      coal_api2: commodityData.coal_api2?.[i]?.value ?? '',
      eur_usd: commodityData.eur_usd?.[i]?.value ?? '',
    })) ?? []

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-xl font-bold"
            style={{ color: 'var(--text-primary)', fontFamily: 'Outfit, sans-serif' }}
          >
            Commodity Markets
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Live fuel & carbon prices driving NL electricity marginal costs
          </p>
        </div>
        <DateRangePicker />
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpiCards.map(({ key, title, unit }, i) => (
          <KpiCard
            key={key}
            title={title}
            value={formatValue(kpiData?.[`${key}_latest`], key)}
            change={
              kpiData?.[`${key}_change`] != null
                ? parseFloat(String(kpiData[`${key}_change`]))
                : undefined
            }
            unit={unit}
            loading={kpiLoading}
            staggerIndex={i}
          />
        ))}
      </div>

      {/* Series toggles */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Series:
        </span>
        {Object.entries(SERIES_LABELS).map(([key, label]) => {
          const isMarginal = key.includes('marginal')
          if (isMarginal && !showMarginal) return null
          const active = activeSeriesKeys.has(key)
          return (
            <button
              key={key}
              onClick={() => toggleSeries(key)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all duration-200"
              style={{
                borderColor: active ? SERIES_COLORS[key] : 'var(--border-default)',
                backgroundColor: active ? `${SERIES_COLORS[key]}22` : 'transparent',
                color: active ? SERIES_COLORS[key] : 'var(--text-muted)',
              }}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: active ? SERIES_COLORS[key] : 'var(--text-muted)' }}
              />
              {label}
            </button>
          )
        })}

        {/* Marginal cost toggle */}
        <button
          onClick={() => {
            setShowMarginal(!showMarginal)
            if (!showMarginal) {
              setActiveSeriesKeys((prev) => new Set([...prev, 'gas_marginal', 'coal_marginal']))
            } else {
              setActiveSeriesKeys((prev) => {
                const next = new Set(prev)
                next.delete('gas_marginal')
                next.delete('coal_marginal')
                return next
              })
            }
          }}
          className="ml-2 px-2.5 py-1 rounded-full text-xs border transition-all duration-200"
          style={{
            borderColor: showMarginal ? 'var(--accent-copper)' : 'var(--border-default)',
            backgroundColor: showMarginal ? 'rgba(212,165,116,0.15)' : 'transparent',
            color: showMarginal ? 'var(--accent-copper)' : 'var(--text-muted)',
          }}
        >
          {showMarginal ? 'Hide' : 'Show'} Marginal Costs
        </button>
      </div>

      {/* Main chart */}
      <ChartWrapper
        title="Commodity Price History"
        subtitle={`${SERIES_UNITS.gas_ttf} / ${SERIES_UNITS.co2_eua} / ${SERIES_UNITS.coal_api2}`}
        loading={chartLoading}
        error={chartError as Error | null}
        height={380}
        exportData={exportData}
        exportFilename="commodities"
      >
        <TradingViewChart series={chartSeries} height={380} />
      </ChartWrapper>

      {/* Summary note */}
      <p className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'Outfit, sans-serif' }}>
        Gas marginal cost = Gas TTF / 0.40 + CO2 * 0.400 (CCGT, 40% efficiency, 400 kg CO2/MWh_e).
        Coal marginal cost = (Coal / 6.978 + CO2 * 0.335) / 0.46 (46% efficiency, 335 kg CO2/MWh_th).
      </p>
    </div>
  )
}
