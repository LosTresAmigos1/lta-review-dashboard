import { useQuery } from '@tanstack/react-query'

export function useScraperStatus() {
  return useQuery({
    queryKey: ['scraper-status'],
    queryFn: async () => {
      const res = await fetch('/data/scraper-status.json')
      if (!res.ok) throw new Error(`Failed to fetch scraper-status.json: ${res.status}`)
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })
}
