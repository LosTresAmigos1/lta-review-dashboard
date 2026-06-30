import { useQuery } from '@tanstack/react-query'

export function useWeeklyReport() {
  return useQuery({
    queryKey: ['weekly-report'],
    queryFn: async () => {
      const res = await fetch('/data/reports/weekly-summary.json')
      if (!res.ok) throw new Error(`Failed to fetch weekly-summary.json: ${res.status}`)
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })
}
