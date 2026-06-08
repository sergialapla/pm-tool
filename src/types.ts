export interface Company {
  id: number
  name: string
  country: string
}

export interface Team {
  id: number
  name: string
  members: string[]
  year: number
}

export interface Project {
  id: number
  project_number: string
  name: string
  team_id: number | null
  year: number
  external_budget: number
  internal_budget: number
  additional_budget: number
}

export type RateType = 'month' | 'hour' | 'fixed'
export type POStatus = 'draft' | 'open' | 'complete'

export interface ExternalResource {
  id?: number
  project_id: number | null
  team_id: number | null
  company_id: number | null
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
  monthly_hours: number[]
  monthly_expected: number[]
  monthly_actual: number[]
}

export interface ExternalPerson {
  id?: number
  name: string
  company_id: number | null
  position: string
  country: string
  rate_type: RateType
  rate: number
  allocation: number
  year: number
}

export interface ExternalPO {
  id?: number
  person_id: number
  project_id: number | null
  team_id: number | null
  pr_number: string
  po_number: string
  status: POStatus
  month_start: number
  month_end: number
  total_po: number
  comments: string
  monthly_hours: number[]
  monthly_expected: number[]
  monthly_actual: (number | null)[]
}

export interface InternalPerson {
  id?: number
  name: string
  price_per_hour: number
  total_hours: number
  year: number
}

export interface InternalAllocation {
  id?: number
  person_id: number
  project_id: number | null
  team_id: number | null
  dedication_pct: number
  monthly_hours: number[]
  monthly_actual: (number | null)[]
}

export interface OtherResource {
  id?: number
  project_id: number
  team_id: number | null
  company_id: number | null
  pr_number: string
  po_number: string
  description: string
  status?: POStatus
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
