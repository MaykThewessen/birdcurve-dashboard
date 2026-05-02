import { create } from 'zustand'

interface FilterState {
  dateRange: { start: string; end: string }
  scenario: string
  theme: 'system' | 'dark' | 'light'
  crosshairTimestamp: number | null
  setDateRange: (start: string, end: string) => void
  setScenario: (s: string) => void
  setTheme: (t: 'system' | 'dark' | 'light') => void
  setCrosshairTimestamp: (ts: number | null) => void
}

// Default to the last 60 days so first-paint queries are small. Charts
// that need full history (e.g. Price Duration Curve across all years)
// must opt out and use their own range.
const DEFAULT_RANGE_DAYS = 60
const today = new Date()
const start = new Date(today.getTime() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000)

export const useFilterStore = create<FilterState>((set) => ({
  dateRange: {
    start: start.toISOString().slice(0, 10),
    end: today.toISOString().slice(0, 10),
  },
  scenario: '',
  theme: 'dark',
  crosshairTimestamp: null,
  setDateRange: (start, end) => set({ dateRange: { start, end } }),
  setScenario: (scenario) => set({ scenario }),
  setTheme: (theme) => set({ theme }),
  setCrosshairTimestamp: (crosshairTimestamp) => set({ crosshairTimestamp }),
}))
