import { useEffect } from 'react'
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

  // Auto-select first scenario on load
  useEffect(() => {
    if (data?.scenarios && data.scenarios.length > 0 && !scenario) {
      setScenario(data.scenarios[0])
    }
  }, [data, scenario, setScenario])

  const scenarios = data?.scenarios ?? []

  return (
    <div className={`relative ${className}`}>
      <select
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
