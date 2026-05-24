import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import KpiCard from '../components/common/KpiCard'
import ChartWrapper from '../components/common/ChartWrapper'
import EChartsWrapper from '../components/charts/EChartsWrapper'
import type { EChartsOption } from 'echarts'
import { AXIS_LABEL_STYLE } from '../lib/echarts-theme'

// Price band color by name
const BAND_COLORS: Record<string, string> = {
  A: '#60A5FA',
  B: '#4ADE80',
  C: '#FB923C',
  D: '#F87171',
}

function formatNum(v: number | null | undefined, decimals = 2): string {
  if (v == null || isNaN(v)) return '—'
  return v.toFixed(decimals)
}

function bandColorForMae(mae: number, maxMae: number): string {
  // Lower MAE → greener; higher → redder
  const ratio = maxMae > 0 ? Math.min(mae / maxMae, 1) : 0
  const r = Math.round(ratio * 248 + (1 - ratio) * 74)
  const g = Math.round((1 - ratio) * 222 + ratio * 113)
  const b = Math.round((1 - ratio) * 128 + ratio * 113)
  return `rgb(${r},${g},${b})`
}

export default function MLPage() {
  const { data: metrics, isLoading: metricsLoading, error: metricsError } = useQuery({
    queryKey: ['ml-metrics'],
    queryFn: () => api.mlMetrics(),
  })

  const { data: predictions, isLoading: predLoading, error: predError } = useQuery({
    queryKey: ['ml-predictions', 'validation'],
    queryFn: () => api.mlPredictions('validation', 8000),
  })

  // Scatter plot option (Actual vs Predicted)
  const scatterOption: EChartsOption = useMemo(() => {
    if (!predictions) return {}

    const { actual, predicted } = predictions
    const bandColors = actual.map((a) => {
      if (a < 20) return BAND_COLORS['A']
      if (a < 90) return BAND_COLORS['B']
      if (a < 180) return BAND_COLORS['C']
      return BAND_COLORS['D']
    })

    const allVals = [...actual, ...predicted]
    if (!allVals.length) return {}
    const minV = Math.min(...allVals)
    const maxV = Math.max(...allVals)

    const scatterData = actual.map((a, i) => ({
      value: [a, predicted[i]],
      itemStyle: { color: bandColors[i], opacity: 0.55 },
    }))

    const perfectLine = [
      [minV, minV],
      [maxV, maxV],
    ]

    return {
      grid: { top: 30, right: 20, bottom: 50, left: 65, containLabel: false },
      xAxis: {
        type: 'value',
        name: 'Actual Price (EUR/MWh)',
        nameLocation: 'middle',
        nameGap: 30,
        axisLabel: AXIS_LABEL_STYLE,
        axisLine: { lineStyle: { color: '#2A3654' } },
        splitLine: { lineStyle: { color: '#1A2540' } },
      },
      yAxis: {
        type: 'value',
        name: 'Predicted Price (EUR/MWh)',
        nameLocation: 'middle',
        nameGap: 55,
        axisLabel: AXIS_LABEL_STYLE,
        axisLine: { lineStyle: { color: '#2A3654' } },
        splitLine: { lineStyle: { color: '#1A2540' } },
      },
      tooltip: {
        trigger: 'item',
        formatter: (params: unknown) => {
          const p = params as { value: [number, number] }
          return `Actual: <b>${p.value[0].toFixed(2)}</b><br/>Predicted: <b>${p.value[1].toFixed(2)}</b>`
        },
      },
      legend: {
        data: ['Band A (<20)', 'Band B (20-90)', 'Band C (90-180)', 'Band D (>180)', 'Perfect Fit'],
        top: 0,
        textStyle: { color: '#8896B3', fontFamily: 'Outfit, sans-serif', fontSize: 11 },
      },
      series: [
        {
          name: 'Predictions',
          type: 'scatter',
          data: scatterData,
          symbolSize: 3,
          large: true,
          largeThreshold: 2000,
        },
        // Legend proxy series for bands
        ...(['A', 'B', 'C', 'D'] as const).map((band, i) => ({
          name: [`Band A (<20)`, `Band B (20-90)`, `Band C (90-180)`, `Band D (>180)`][i],
          type: 'scatter' as const,
          data: [],
          itemStyle: { color: BAND_COLORS[band] },
          symbol: 'circle',
          symbolSize: 8,
        })),
        {
          name: 'Perfect Fit',
          type: 'line' as const,
          data: perfectLine,
          symbol: 'none',
          lineStyle: { color: '#8896B3', type: 'dashed', width: 1.5 },
          itemStyle: { color: '#8896B3' },
        },
      ] as never,
    }
  }, [predictions])

  // Feature importance chart
  const featureImportanceOption: EChartsOption = useMemo(() => {
    if (!metrics?.feature_importance?.length) return {}

    const top20 = [...metrics.feature_importance]
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 20)

    const names = top20.map((f) => f.name).reverse()
    const values = top20.map((f) => f.importance).reverse()
    const maxImp = Math.max(...values)

    return {
      grid: { top: 10, right: 20, bottom: 10, left: 20, containLabel: true },
      xAxis: {
        type: 'value',
        axisLabel: { color: '#8896B3', fontFamily: 'JetBrains Mono, monospace', fontSize: 10 },
        axisLine: { lineStyle: { color: '#2A3654' } },
        splitLine: { lineStyle: { color: '#1A2540' } },
      },
      yAxis: {
        type: 'category',
        data: names,
        axisLabel: { color: '#8896B3', fontFamily: 'JetBrains Mono, monospace', fontSize: 10 },
        axisLine: { lineStyle: { color: '#2A3654' } },
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: unknown) => {
          const p = params as { name: string; value: number }[]
          if (!p?.length) return ''
          return `${p[0].name}<br/><b>${p[0].value.toFixed(4)}</b>`
        },
      },
      series: [
        {
          type: 'bar',
          data: values.map((v) => ({
            value: v,
            itemStyle: {
              color: {
                type: 'linear',
                x: 0, y: 0, x2: 1, y2: 0,
                colorStops: [
                  { offset: 0, color: '#A67C52' },
                  { offset: v / maxImp, color: '#D4A574' },
                  { offset: 1, color: '#E8C49A' },
                ],
              },
            },
          })),
          barMaxWidth: 16,
        },
      ],
    }
  }, [metrics])

  // Residual histogram
  const residualOption: EChartsOption = useMemo(() => {
    if (!predictions?.residuals?.length) return {}

    const residuals = predictions.residuals
    const minR = Math.min(...residuals)
    const maxR = Math.max(...residuals)
    const nBins = 50
    const binWidth = (maxR - minR) / nBins

    // Build bins
    const bins = Array.from({ length: nBins }, (_, i) => ({
      x: minR + i * binWidth + binWidth / 2,
      count: 0,
    }))
    for (const r of residuals) {
      const idx = Math.min(Math.floor((r - minR) / binWidth), nBins - 1)
      if (idx >= 0) bins[idx].count++
    }

    // Normal distribution overlay
    const mean = residuals.reduce((a, b) => a + b, 0) / residuals.length
    const std = Math.sqrt(
      residuals.reduce((a, b) => a + (b - mean) ** 2, 0) / residuals.length,
    )
    const normLine = bins.map(({ x }) => {
      const y = (residuals.length * binWidth * Math.exp(-0.5 * ((x - mean) / std) ** 2)) /
        (std * Math.sqrt(2 * Math.PI))
      return [x, y]
    })

    return {
      grid: { top: 30, right: 20, bottom: 50, left: 60, containLabel: false },
      xAxis: {
        type: 'value',
        name: 'Prediction Error (EUR/MWh)',
        nameLocation: 'middle',
        nameGap: 30,
        axisLabel: AXIS_LABEL_STYLE,
        axisLine: { lineStyle: { color: '#2A3654' } },
        splitLine: { lineStyle: { color: '#1A2540' } },
      },
      yAxis: {
        type: 'value',
        name: 'Frequency',
        nameLocation: 'middle',
        nameGap: 50,
        axisLabel: AXIS_LABEL_STYLE,
        axisLine: { lineStyle: { color: '#2A3654' } },
        splitLine: { lineStyle: { color: '#1A2540' } },
      },
      tooltip: {
        trigger: 'axis',
        formatter: (params: unknown) => {
          const p = params as { seriesName: string; value: number | number[] }[]
          if (!p?.length) return ''
          const barEntry = p.find((x) => x.seriesName === 'Frequency')
          if (barEntry) return `Count: <b>${barEntry.value}</b>`
          return ''
        },
      },
      legend: {
        data: ['Frequency', 'Normal Fit'],
        top: 0,
        textStyle: { color: '#8896B3', fontFamily: 'Outfit, sans-serif', fontSize: 11 },
      },
      series: [
        {
          name: 'Frequency',
          type: 'bar',
          data: bins.map(({ x, count }) => [x, count]),
          barWidth: `${Math.floor(100 / nBins)}%`,
          itemStyle: { color: 'rgba(212,165,116,0.5)', borderColor: '#D4A574', borderWidth: 0.5 },
        },
        {
          name: 'Normal Fit',
          type: 'line',
          data: normLine,
          symbol: 'none',
          smooth: true,
          lineStyle: { color: '#60A5FA', width: 2 },
          itemStyle: { color: '#60A5FA' },
        },
      ],
    }
  }, [predictions])

  // Price band table max MAE for relative coloring
  const maxBandMae = useMemo(() => {
    if (!metrics?.price_bands?.length) return 1
    return Math.max(...metrics.price_bands.map((b) => b.mae))
  }, [metrics])

  // Ensemble weights progress bar
  const lgbWeight = metrics?.weights?.lightgbm ?? 0
  const cbWeight = metrics?.weights?.catboost ?? 0

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Page header */}
      <div>
        <h1
          className="text-xl font-bold"
          style={{ color: 'var(--text-primary)', fontFamily: 'Outfit, sans-serif' }}
        >
          ML Performance
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          LightGBM + CatBoost ensemble metrics, feature importance and prediction quality
        </p>
      </div>

      {/* Metric cards row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard
          title="Train MAE"
          value={formatNum(metrics?.training.mae)}
          unit="EUR/MWh"
          loading={metricsLoading}
          staggerIndex={0}
        />
        <KpiCard
          title="Val MAE"
          value={formatNum(metrics?.validation.mae)}
          unit="EUR/MWh"
          loading={metricsLoading}
          staggerIndex={1}
        />
        <KpiCard
          title="Val R²"
          value={formatNum(metrics?.validation.r2, 3)}
          loading={metricsLoading}
          staggerIndex={2}
        />
        <KpiCard
          title="BESS Capture"
          value={formatNum(metrics?.bess.capture_rate ? metrics.bess.capture_rate * 100 : undefined, 1)}
          unit="%"
          loading={metricsLoading}
          staggerIndex={3}
        />
        <KpiCard
          title="Spearman ρ"
          value={formatNum(metrics?.bess.spearman, 3)}
          loading={metricsLoading}
          staggerIndex={4}
        />
      </div>

      {/* Ensemble weights card */}
      {!metricsLoading && metrics && (
        <div
          className="rounded-xl p-4 border animate-fade-in-up"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-default)',
            animationDelay: '300ms',
            animationFillMode: 'forwards',
            opacity: 0,
          }}
        >
          <div
            className="text-xs font-medium uppercase tracking-wider mb-3"
            style={{ color: 'var(--text-muted)', fontFamily: 'Outfit, sans-serif' }}
          >
            Ensemble Weights
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="flex justify-between text-xs mb-1" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                <span style={{ color: '#4ADE80' }}>LightGBM</span>
                <span style={{ color: 'var(--text-primary)' }}>{(lgbWeight * 100).toFixed(1)}%</span>
              </div>
              <div
                className="h-2 rounded-full overflow-hidden"
                style={{ backgroundColor: 'var(--bg-elevated)' }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${lgbWeight * 100}%`, backgroundColor: '#4ADE80' }}
                />
              </div>
            </div>
            <div className="flex-1">
              <div className="flex justify-between text-xs mb-1" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                <span style={{ color: '#A78BFA' }}>CatBoost</span>
                <span style={{ color: 'var(--text-primary)' }}>{(cbWeight * 100).toFixed(1)}%</span>
              </div>
              <div
                className="h-2 rounded-full overflow-hidden"
                style={{ backgroundColor: 'var(--bg-elevated)' }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${cbWeight * 100}%`, backgroundColor: '#A78BFA' }}
                />
              </div>
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'nowrap' }}>
              Val RMSE: {formatNum(metrics.validation.rmse)} EUR/MWh
            </div>
          </div>
        </div>
      )}

      {/* Scatter + Residual histogram row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartWrapper
          title="Actual vs Predicted"
          subtitle="EUR/MWh · validation set, colored by price band"
          loading={predLoading}
          error={predError as Error | null}
          height={380}
          exportFilename="actual_vs_predicted"
        >
          <EChartsWrapper option={scatterOption} height={360} />
        </ChartWrapper>

        <ChartWrapper
          title="Residual Distribution"
          subtitle="Prediction errors with normal fit overlay"
          loading={predLoading}
          error={predError as Error | null}
          height={380}
          exportFilename="residual_histogram"
        >
          <EChartsWrapper option={residualOption} height={360} />
        </ChartWrapper>
      </div>

      {/* Price band table + Feature importance row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Price band table */}
        <div
          className="rounded-xl border overflow-hidden"
          style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}
        >
          <div
            className="flex items-center justify-between px-4 py-3 border-b"
            style={{ borderColor: 'var(--border-default)' }}
          >
            <div>
              <h3
                className="text-sm font-semibold"
                style={{ color: 'var(--text-primary)', fontFamily: 'Outfit, sans-serif' }}
              >
                Price Band Performance
              </h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                MAE and correlation by price range
              </p>
            </div>
          </div>
          {metricsLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="skeleton h-8 rounded" />
              ))}
            </div>
          ) : metricsError ? (
            <div className="p-4 text-sm" style={{ color: 'var(--accent-red)' }}>
              Failed to load metrics
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                    {['Band', 'Samples', '%', 'MAE', 'Correlation'].map((col) => (
                      <th
                        key={col}
                        className="px-4 py-2 text-left font-medium uppercase tracking-wider"
                        style={{ color: 'var(--text-muted)', fontFamily: 'Outfit, sans-serif' }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(metrics?.price_bands ?? []).map((band, i) => {
                    const bandLetter = band.name.split(' ')[1] ?? String(i)
                    const color = BAND_COLORS[bandLetter] ?? 'var(--text-primary)'
                    const maeColor = bandColorForMae(band.mae, maxBandMae)
                    return (
                      <tr
                        key={band.name}
                        style={{
                          borderBottom: '1px solid var(--border-default)',
                          backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(26,37,64,0.3)',
                        }}
                      >
                        <td className="px-4 py-2.5">
                          <span
                            className="flex items-center gap-1.5 font-medium"
                            style={{ color, fontFamily: 'JetBrains Mono, monospace' }}
                          >
                            <span
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: color }}
                            />
                            {band.name}
                          </span>
                        </td>
                        <td
                          className="px-4 py-2.5 font-data"
                          style={{ color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace' }}
                        >
                          {band.count.toLocaleString()}
                        </td>
                        <td
                          className="px-4 py-2.5 font-data"
                          style={{ color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace' }}
                        >
                          {band.pct.toFixed(1)}%
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className="font-data px-1.5 py-0.5 rounded text-xs"
                            style={{
                              backgroundColor: `${maeColor}22`,
                              color: maeColor,
                              fontFamily: 'JetBrains Mono, monospace',
                            }}
                          >
                            {band.mae.toFixed(2)}
                          </span>
                        </td>
                        <td
                          className="px-4 py-2.5 font-data"
                          style={{ color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace' }}
                        >
                          {band.correlation.toFixed(3)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Feature importance */}
        <ChartWrapper
          title="Feature Importance"
          subtitle="Top 20 features by model importance"
          loading={metricsLoading}
          error={metricsError as Error | null}
          height={420}
          exportData={
            metrics?.feature_importance
              .slice(0, 20)
              .map((f) => ({ feature: f.name, importance: f.importance })) ?? []
          }
          exportFilename="feature_importance"
        >
          <EChartsWrapper option={featureImportanceOption} height={390} />
        </ChartWrapper>
      </div>

      {/* Additional metrics row */}
      {!metricsLoading && metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard
            title="Train R²"
            value={formatNum(metrics.training.r2, 3)}
            staggerIndex={0}
          />
          <KpiCard
            title="Train RMSE"
            value={formatNum(metrics.training.rmse)}
            unit="EUR/MWh"
            staggerIndex={1}
          />
          <KpiCard
            title="Val Correlation"
            value={formatNum(metrics.validation.correlation, 3)}
            staggerIndex={2}
          />
          <KpiCard
            title="Spread MAE"
            value={formatNum(metrics.bess.spread_mae)}
            unit="EUR/MWh"
            staggerIndex={3}
          />
        </div>
      )}
    </div>
  )
}
