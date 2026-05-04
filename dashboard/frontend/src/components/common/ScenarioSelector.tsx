import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import { api } from '../../api/client'
import { useFilterStore } from '../../store/filterStore'

interface ScenarioSelectorProps {
  className?: string
}

export default function ScenarioSelector({ className = '' }: ScenarioSelectorProps) {
  const { scenario, setScenario } = useFilterStore()

  const { data } = useQuery({
    queryKey: ['scenarios-list'],
    queryFn: () => api.scenariosList(),
  })

  // Auto-select the first scenario when the list loads, using the
  // during-render reset pattern instead of useEffect+setState — React 19
  // (react-hooks/set-state-in-effect) treats the latter as the same
  // anti-pattern that hung the dashboard previously. Tracking the previous
  // scenarios-list reference lets us trigger the auto-select exactly once
  // per fetched list, not on every render.
  const [seenList, setSeenList] = useState<string[] | null>(null)
  if (data?.scenarios && data.scenarios !== seenList) {
    setSeenList(data.scenarios)
    if (!scenario && data.scenarios.length > 0) {
      setScenario(data.scenarios[0])
    }
  }

  const scenarios = data?.scenarios ?? []

  return (
    <div className={`relative ${className}`}>
      <select
        id="scenario-selector"
        name="scenario"
        aria-label="Forecast scenario"
        value={scenario}
        onChange={(e) => setScenario(e.target.value)}
        className="appearance-none pl-3 pr-8 py-1.5 text-xs rounded-lg border transition-colors cursor-pointer"
        style={{
          backgroundColor: 'var(--bg-elevated)',
          borderColor: 'var(--border-default)',
          color: 'var(--text-primary)',
          fontFamily: 'Outfit, sans-serif',
        }}
        disabled={scenarios.length === 0}
      >
        {scenarios.length === 0 && (
          <option value="">Loading scenarios...</option>
        )}
        {scenarios.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <ChevronDown
        size={12}
        className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
        style={{ color: 'var(--text-muted)' }}
      />
    </div>
  )
}
