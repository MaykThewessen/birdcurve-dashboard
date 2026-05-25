/** Shared ECharts style constants — single source of truth for chart theming. */

export const CHART_COLORS = {
  muted: '#8896B3',
  border: '#2A3654',
  grid: '#1A2540',
} as const

export const AXIS_LABEL_STYLE = {
  color: CHART_COLORS.muted,
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 11,
} as const

export const AXIS_LINE_STYLE = {
  lineStyle: { color: CHART_COLORS.border },
} as const

export const SPLIT_LINE_STYLE = {
  lineStyle: { color: CHART_COLORS.grid, type: 'dashed' as const },
} as const

export const NAME_TEXT_STYLE = {
  color: CHART_COLORS.muted,
  fontFamily: 'Outfit, sans-serif',
  fontSize: 11,
} as const

export const TOOLTIP_STYLE = 'font-family:JetBrains Mono,monospace;font-size:12px'
