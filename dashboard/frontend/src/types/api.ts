export interface CommodityPoint {
  date: string
  value: number
}

export interface CommoditiesResponse {
  gas_ttf: CommodityPoint[]
  co2_eua: CommodityPoint[]
  coal_api2: CommodityPoint[]
  eur_usd: CommodityPoint[]
  gas_marginal?: CommodityPoint[]
  coal_marginal?: CommodityPoint[]
}

export interface CommodityKpiResponse {
  [key: string]: number | string
  // gas_ttf_latest, gas_ttf_change, gas_ttf_date, etc.
}

export interface ElectricityHistoricalResponse {
  da_prices: { timestamp: string; value: number }[]
  supply: {
    timestamp: string
    load?: number
    pv?: number
    wind_onshore?: number
    wind_offshore?: number
    import?: number
  }[]
}

export interface DurationCurveResponse {
  sorted_prices: number[]
  negative_hours: number
  peak_hours: number
  total_hours: number
}

export interface HeatmapResponse {
  hours: number[]
  months: number[]
  values: number[][]
}

export interface MetricsResponse {
  training: {
    mae: number
    rmse: number
    r2: number
    correlation: number
    samples: number
  }
  validation: {
    mae: number
    rmse: number
    r2: number
    correlation: number
    samples: number
  }
  price_bands: {
    name: string
    count: number
    pct: number
    mae: number
    correlation: number
  }[]
  bess: {
    capture_rate: number
    spearman: number
    spread_mae: number
  }
  weights: {
    lightgbm: number
    catboost: number
  }
  feature_importance: {
    name: string
    importance: number
  }[]
  features: string[]
}

export interface PredictionsResponse {
  datetime: string[]
  actual: number[]
  predicted: number[]
  residuals: number[]
}

export interface CorrelationMatrixResponse {
  features: string[]
  matrix: number[][]
}

export interface PriceDistribution {
  year: number
  min: number
  q1: number
  median: number
  q3: number
  max: number
  mean: number
  std: number
  kde_x: number[]
  kde_y: number[]
}

export interface PriceDistributionsResponse {
  years: number[]
  distributions: PriceDistribution[]
}

export interface ScenariosListResponse {
  scenarios: string[]
}

export interface ScenarioDataResponse {
  years: number[]
  scenario: string
  solar_pv_gw: number[]
  wind_on_gw: number[]
  wind_off_gw: number[]
  bess_gw: number[]
  bess_gwh: number[]
  gas_price: number[]
  co2_price: number[]
  demand_twh: number[]
  power_base: number[]
  must_run: number[]
  nuclear: number[]
}

export interface DAForecastResponse {
  datetime: string[]
  price_actual: (number | null)[]
  price_predicted: number[]
}

export interface ID3ImbalanceResponse {
  datetime: string[]
  da_price: number[]
  id3_price: number[]
  afrr_up: number[]
  afrr_down: number[]
  imb_long: number[]
  imb_short: number[]
  reg_state: number[]
}

export interface AnnualStatsResponse {
  years: number[]
  avg_da: number[]
  std_da: number[]
  spread: number[]
  negative_hours: number[]
  peak_hours: number[]
  bess_2h: number[]
  bess_4h: number[]
  bess_8h: number[]
  bess_id3: number[]
  bess_afrr: number[]
  afrr_cap_rev: number[]
  fcr_cap_rev: number[]
  solar_capture: number[]
  solar_rev: number[]
  wind_rev: number[]
}

export interface AncillaryCapacityResponse {
  datetime: string[]
  afrr_cap_up: number[]
  afrr_cap_down: number[]
  fcr_cap_price: number[]
  afrr_vol_up: number[]
  afrr_vol_down: number[]
  fcr_vol: number[]
}

export interface AncillaryRevenueResponse {
  years: number[]
  afrr_cap_revenue: number[]
  fcr_cap_revenue: number[]
  afrr_energy_revenue: number[]
}

export interface RegulationStatesResponse {
  states: {
    state: number
    label: string
    count: number
    percentage: number
  }[]
  year: number
  total_intervals: number
}

export interface HealthResponse {
  status: string
  data_loaded: boolean
  last_model: string | null
  last_forecast: string | null
  scenarios: string[]
  db_tables: Record<string, number>
}
