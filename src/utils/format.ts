import type { ExternalResource, ExternalPerson, ExternalPO, InternalAllocation, RateType } from '../types'

export const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export function fmt(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return '0'
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export function pct(numerator: number, denominator: number): string {
  if (!denominator) return '—'
  return ((numerator / denominator) * 100).toFixed(1) + '%'
}

export function sumArr(arr: (number | null)[]): number {
  return (arr || []).reduce<number>((a, b) => a + (b ?? 0), 0)
}

export function calcExternalExpected(r: ExternalResource): number[] {
  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 1
    switch (r.rate_type) {
      case 'month':
        return (month >= r.month_start && month <= r.month_end)
          ? Math.round(r.rate * r.allocation) / 100
          : 0
      case 'hour':
        return (r.monthly_hours?.[i] ?? 0) * r.rate
      case 'fixed':
        return r.monthly_expected?.[i] ?? 0
      default:
        return 0
    }
  })
}

export function calcAllocationExpected(a: InternalAllocation, pricePerHour: number): number[] {
  return (a.monthly_hours || []).map(h => (h || 0) * pricePerHour)
}

// When complete, forecast = actuals (the job is done; actual spend IS the expected spend)
export function calcPOForecast(person: ExternalPerson, po: ExternalPO): number[] {
  if (po.status === 'complete') {
    return (po.monthly_actual || []).map(v => v ?? 0)
  }
  return calcPOExpected(person, po)
}

export function calcPOPrevision(person: ExternalPerson, po: ExternalPO): number {
  if (po.status === 'complete') {
    return sumArr(po.monthly_actual || [])
  }
  const exp = calcPOExpected(person, po)
  return exp.reduce<number>((s, e, i) => {
    const act = (po.monthly_actual || [])[i]
    return s + (act !== null && act !== undefined ? act : e)
  }, 0)
}

export function calcPOExpected(
  person: { rate_type: RateType; rate: number; allocation: number },
  po: { month_start: number; month_end: number; monthly_hours: number[]; monthly_expected: number[] }
): number[] {
  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 1
    switch (person.rate_type) {
      case 'month':
        return (month >= po.month_start && month <= po.month_end)
          ? Math.round(person.rate * person.allocation) / 100
          : 0
      case 'hour':
        return (po.monthly_hours?.[i] ?? 0) * person.rate
      case 'fixed':
        return po.monthly_expected?.[i] ?? 0
      default:
        return 0
    }
  })
}
