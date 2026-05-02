import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './api/client'
import Layout from './components/layout/Layout'

const CommoditiesPage = lazy(() => import('./pages/CommoditiesPage'))
const ElectricityPage = lazy(() => import('./pages/ElectricityPage'))
const MLPage = lazy(() => import('./pages/MLPage'))
const ScenariosPage = lazy(() => import('./pages/ScenariosPage'))
const ForecastPage = lazy(() => import('./pages/ForecastPage'))
const AncillaryPage = lazy(() => import('./pages/AncillaryPage'))

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<div className="p-8 text-slate-400">Loading…</div>}>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/commodities" element={<CommoditiesPage />} />
              <Route path="/electricity" element={<ElectricityPage />} />
              <Route path="/ml" element={<MLPage />} />
              <Route path="/scenarios" element={<ScenariosPage />} />
              <Route path="/forecast" element={<ForecastPage />} />
              <Route path="/ancillary" element={<AncillaryPage />} />
              <Route path="/" element={<Navigate to="/commodities" replace />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
