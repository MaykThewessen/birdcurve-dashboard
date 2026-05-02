import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './api/client'
import Layout from './components/layout/Layout'
import CommoditiesPage from './pages/CommoditiesPage'
import ElectricityPage from './pages/ElectricityPage'
import MLPage from './pages/MLPage'
import ScenariosPage from './pages/ScenariosPage'
import ForecastPage from './pages/ForecastPage'
import AncillaryPage from './pages/AncillaryPage'

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
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
      </BrowserRouter>
    </QueryClientProvider>
  )
}
