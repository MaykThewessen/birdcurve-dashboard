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

export const useFilterStore = create<FilterState>((set) => ({
  dateRange: { start: '2020-01-01', end: new Date().toISOString().slice(0, 10) },
  scenario: '',
  theme: 'dark',
  crosshairTimestamp: null,
  setDateRange: (start, end) => set({ dateRange: { start, end } }),
  setScenario: (scenario) => set({ scenario }),
  setTheme: (theme) => set({ theme }),
  setCrosshairTimestamp: (crosshairTimestamp) => set({ crosshairTimestamp }),
}))
