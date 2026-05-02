import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { useMemo } from 'react'

interface EChartsWrapperProps {
  option: EChartsOption
  height?: number | string
  loading?: boolean
  className?: string
  style?: React.CSSProperties
}

const DARK_THEME_OVERRIDES: Partial<EChartsOption> = {
  backgroundColor: 'transparent',
  tooltip: {
    backgroundColor: '#1A2540',
    borderColor: '#2A3654',
    textStyle: { color: '#E8ECF4', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 },
  },
  legend: {
    textStyle: { color: '#8896B3', fontFamily: 'Outfit, sans-serif', fontSize: 12 },
    inactiveColor: '#2A3654',
  },
  grid: {
    top: 40,
    right: 20,
    bottom: 40,
    left: 60,
    containLabel: true,
  },
}

function mergeDeep<T extends object>(target: T, source: Partial<T>): T {
  const result = { ...target } as T
  for (const key in source) {
    const src = source[key]
    const tgt = target[key]
    if (src && typeof src === 'object' && !Array.isArray(src) && tgt && typeof tgt === 'object') {
      result[key] = mergeDeep(tgt as object, src as object) as T[typeof key]
    } else if (src !== undefined) {
      result[key] = src as T[typeof key]
    }
  }
  return result
}

export default function EChartsWrapper({
  option,
  height = 300,
  loading = false,
  className = '',
  style,
}: EChartsWrapperProps) {
  const mergedOption = useMemo(
    () => mergeDeep(DARK_THEME_OVERRIDES as EChartsOption, option),
    [option],
  )

  return (
    <ReactECharts
      option={mergedOption}
      style={{ height, width: '100%', ...style }}
      className={className}
      showLoading={loading}
      loadingOption={{
        color: '#D4A574',
        textColor: '#8896B3',
        maskColor: 'rgba(11, 18, 34, 0.8)',
        text: 'Loading...',
      }}
      opts={{ renderer: 'canvas' }}
      notMerge
    />
  )
}
