export interface Company {
  id: number
  name: string
  country: string
}

export interface Team {
  id: number
  name: string
  members: string[]
}

export interface Project {
  id: number
  project_number: string
  name: string
  team_id: number
  year: number
  external_budget: number
  internal_budget: number
  additional_budget: number
}

export type RateType = 'month' | 'hour' | 'fixed'
export type POStatus = 'open' | 'complete'

export interface ExternalResource {
  id?: number
  project_id: number
  company_id: number
  name: string
  position: string
  rate_type: RateType
  rate: number
  pr_number: string
  po_number: string
  status: POStatus
  country: string
  allocation: number
  month_start: number
  month_end: number
  total_po: number
  comments: string
  monthly_expected: number[]
  monthly_actual: number[]
}

export interface InternalResource {
  id?: number
  project_id: number
  name: string
  price_per_hour: number
  monthly_hours: number[]
  monthly_actual: number[]
}

export interface OtherResource {
  id?: number
  project_id: number
  team_id: number
  company_id: number
  pr_number: string
  po_number: string
  description: string
  monthly_expected: number[]
  monthly_actual: number[]
}

export interface AppSettings {
  active_year: string
  db_path?: string
}

declare global {
  interface Window {
    api: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    }
  }
}
