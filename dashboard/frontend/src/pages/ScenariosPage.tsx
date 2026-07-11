import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { useFilterStore } from '../store/filterStore'
import ScenarioSelector from '../components/common/ScenarioSelector'
import ChartWrapper from '../components/common/ChartWrapper'
import EChartsWrapper from '../components/charts/EChartsWrapper'
import type { EChartsOption } from 'echarts'
import { AXIS_LABEL_STYLE } from '../lib/echarts-theme'
import PageShell from '../components/common/PageShell'

export default function ScenariosPage() {
  const scenario = useFilterStore((s) => s.scenario)

  const { data, isLoading, error } = useQuery({
    queryKey: ['scenario', scenario],
    queryFn: () => api.scenario(scenario),
    enabled: !!scenario,
  })

  // Capacity stacked area chart
  const capacityOption: EChartsOption = useMemo(() => ({
    color: ['#FACC15', '#22D3EE', '#60A5FA', '#A78BFA'],
    legend: {
      data: ['Solar PV', 'Wind Onshore', 'Wind Offshore', 'BESS'],
      top: 4,
    },
    xAxis: {
      type: 'category',
      data: data?.years?.map(String) ?? [],
      axisLabel: AXIS_LABEL_STYLE,
      axisLine: { lineStyle: { color: '#2A3654' } },
    },
    yAxis: {
      type: 'value',
      name: 'GW',
      nameTextStyle: { color: '#8896B3', fontFamily: 'Outfit, sans-serif', fontSize: 11 },
      axisLabel: AXIS_LABEL_STYLE,
      splitLine: { lineStyle: { color: '#1A2540', type: 'dashed' } },
    },
    series: [
      {
        name: 'Solar PV',
        type: 'line',
        stack: 'capacity',
        areaStyle: { opacity: 0.7 },
        data: data?.solar_pv_gw ?? [],
      },
      {
        name: 'Wind Onshore',
        type: 'line',
        stack: 'capacity',
        areaStyle: { opacity: 0.7 },
        data: data?.wind_on_gw ?? [],
      },
      {
        name: 'Wind Offshore',
        type: 'line',
        stack: 'capacity',
        areaStyle: { opacity: 0.7 },
        data: data?.wind_off_gw ?? [],
      },
      {
        name: 'BESS',
        type: 'line',
        stack: 'capacity',
        areaStyle: { opacity: 0.7 },
        data: data?.bess_gw ?? [],
      },
    ],
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const items = params as { seriesName: string; value: number; color: string; dataIndex?: number }[]
        const year = data?.years?.[items[0]?.dataIndex ?? 0] ?? ''
        const lines = items.map(
          (p) => `<span style="color:${p.color}">●</span> ${p.seriesName}: <b>${Number(p.value).toFixed(1)} GW</b>`,
        )
        return `<div style="font-family:JetBrains Mono,monospace;font-size:12px"><b>${year}</b><br/>${lines.join('<br/>')}</div>`
      },
    },
    grid: { top: 48, right: 20, bottom: 40, left: 60, containLabel: true },
  }), [data])

  // Commodity futures chart — dual Y-axis
  const commodityOption: EChartsOption = useMemo(() => ({
    color: ['#D4A574', '#60A5FA'],
    legend: {
      data: ['Gas TTF (EUR/MWh)', 'CO2 EUA (EUR/ton)'],
      top: 4,
    },
    xAxis: {
      type: 'category',
      data: data?.years?.map(String) ?? [],
      axisLabel: AXIS_LABEL_STYLE,
      axisLine: { lineStyle: { color: '#2A3654' } },
    },
    yAxis: [
      {
        type: 'value',
        name: 'Gas EUR/MWh',
        nameTextStyle: { color: '#D4A574', fontFamily: 'Outfit, sans-serif', fontSize: 11 },
        axisLabel: { ...AXIS_LABEL_STYLE, color: '#D4A574' },
        splitLine: { lineStyle: { color: '#1A2540', type: 'dashed' } },
      },
      {
        type: 'value',
        name: 'CO2 EUR/ton',
        nameTextStyle: { color: '#60A5FA', fontFamily: 'Outfit, sans-serif', fontSize: 11 },
        axisLabel: { ...AXIS_LABEL_STYLE, color: '#60A5FA' },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: 'Gas TTF (EUR/MWh)',
        type: 'line',
        yAxisIndex: 0,
        smooth: true,
        lineStyle: { width: 2, color: '#D4A574' },
        itemStyle: { color: '#D4A574' },
        data: data?.gas_price ?? [],
      },
      {
        name: 'CO2 EUA (EUR/ton)',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        lineStyle: { width: 2, color: '#60A5FA' },
        itemStyle: { color: '#60A5FA' },
        data: data?.co2_price ?? [],
      },
    ],
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const items = params as { seriesName: string; value: number; color: string; dataIndex: number }[]
        const year = data?.years?.[items[0]?.dataIndex ?? 0] ?? ''
        const lines = items.map(
          (p) => `<span style="color:${p.color}">●</span> ${p.seriesName}: <b>${Number(p.value).toFixed(2)}</b>`,
        )
        return `<div style="font-family:JetBrains Mono,monospace;font-size:12px"><b>${year}</b><br/>${lines.join('<br/>')}</div>`
      },
    },
    grid: { top: 48, right: 80, bottom: 40, left: 60, containLabel: true },
  }), [data])

  // Export data for table
  const tableData =
    data?.years?.map((year, i) => ({
      year,
      solar_pv: data.solar_pv_gw[i] ?? null,
      wind_on: data.wind_on_gw[i] ?? null,
      wind_off: data.wind_off_gw[i] ?? null,
      bess_gw: data.bess_gw[i] ?? null,
      bess_gwh: data.bess_gwh[i] ?? null,
      gas_ttf: data.gas_price[i] ?? null,
      co2: data.co2_price[i] ?? null,
      demand_twh: data.demand_twh[i] ?? null,
    })) ?? []

  const noScenario = !scenario

  return (
    <PageShell>
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-xl font-bold"
            style={{ color: 'var(--text-primary)', fontFamily: 'Outfit, sans-serif' }}
          >
            Scenario Assumptions
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Capacity, technology and commodity price assumptions to 2050
          </p>
        </div>
        <ScenarioSelector />
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
          {/* Charts row */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartWrapper
              title="Installed Capacity (GW)"
              subtitle="Solar PV · Wind On/Offshore · BESS — stacked"
              loading={isLoading}
              error={error as Error | null}
              height={320}
              exportData={tableData}
              exportFilename={`capacity_${scenario}`}
            >
              <EChartsWrapper option={capacityOption} height={320} />
            </ChartWrapper>

            <ChartWrapper
              title="Commodity Price Assumptions"
              subtitle="Gas TTF EUR/MWh · CO2 EUA EUR/ton"
              loading={isLoading}
              error={error as Error | null}
              height={320}
            >
              <EChartsWrapper option={commodityOption} height={320} />
            </ChartWrapper>
          </div>

          {/* Data table */}
          <div
            className="rounded-xl border overflow-hidden"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-default)',
            }}
          >
            <div
              className="px-4 py-3 border-b"
              style={{ borderColor: 'var(--border-default)' }}
            >
              <h3
                className="text-sm font-semibold"
                style={{ color: 'var(--text-primary)', fontFamily: 'Outfit, sans-serif' }}
              >
                Scenario Data Table
              </h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {scenario} — sorted by year ascending
              </p>
            </div>

            <div className="overflow-x-auto" style={{ maxHeight: 400 }}>
              {isLoading ? (
                <div
                  className="flex items-center justify-center"
                  style={{ height: 120, color: 'var(--text-muted)' }}
                >
                  <div className="skeleton h-4 w-32 rounded" />
                </div>
              ) : (
                <table className="w-full text-xs" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                  <thead
                    style={{
                      position: 'sticky',
                      top: 0,
                      backgroundColor: 'var(--bg-elevated)',
                      zIndex: 10,
                    }}
                  >
                    <tr>
                      {['Year', 'Solar PV GW', 'Wind On GW', 'Wind Off GW', 'BESS GW', 'BESS GWh', 'Gas TTF', 'CO2', 'Demand TWh'].map(
                        (col) => (
                          <th
                            key={col}
                            className="px-3 py-2 text-right first:text-left font-medium"
                            style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-default)' }}
                          >
                            {col}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.map((row, i) => (
                      <tr
                        key={row.year}
                        style={{
                          backgroundColor: i % 2 === 0 ? 'transparent' : 'var(--bg-elevated)',
                        }}
                      >
                        <td className="px-3 py-1.5 font-semibold" style={{ color: 'var(--accent-copper)' }}>
                          {row.year}
                        </td>
                        <td className="px-3 py-1.5 text-right" style={{ color: 'var(--text-primary)' }}>
                          {row.solar_pv != null ? row.solar_pv.toFixed(1) : '—'}
                        </td>
                        <td className="px-3 py-1.5 text-right" style={{ color: 'var(--text-primary)' }}>
                          {row.wind_on != null ? row.wind_on.toFixed(1) : '—'}
                        </td>
                        <td className="px-3 py-1.5 text-right" style={{ color: 'var(--text-primary)' }}>
                          {row.wind_off != null ? row.wind_off.toFixed(1) : '—'}
                        </td>
                        <td className="px-3 py-1.5 text-right" style={{ color: 'var(--text-primary)' }}>
                          {row.bess_gw != null ? row.bess_gw.toFixed(1) : '—'}
                        </td>
                        <td className="px-3 py-1.5 text-right" style={{ color: 'var(--text-primary)' }}>
                          {row.bess_gwh != null ? row.bess_gwh.toFixed(1) : '—'}
                        </td>
                        <td className="px-3 py-1.5 text-right" style={{ color: 'var(--accent-copper)' }}>
                          {row.gas_ttf != null ? row.gas_ttf.toFixed(2) : '—'}
                        </td>
                        <td className="px-3 py-1.5 text-right" style={{ color: 'var(--accent-blue)' }}>
                          {row.co2 != null ? row.co2.toFixed(2) : '—'}
                        </td>
                        <td className="px-3 py-1.5 text-right" style={{ color: 'var(--text-secondary)' }}>
                          {row.demand_twh != null ? row.demand_twh.toFixed(1) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </PageShell>
  )
}
