import { useQuery } from '@tanstack/react-query'

async function fetchJSON(path) {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`)
  return res.json()
}

// Fetches the small per-location chunks (written by export_chunks.py) in
// parallel and concatenates them into the same flat review-array shape the
// app used to get from the single static reviews.json import -- this keeps
// every downstream filter/page untouched while moving the 7MB+ payload out
// of the JS bundle and into cacheable, parallelizable HTTP requests.
export function useReviewsData() {
  return useQuery({
    queryKey: ['all-reviews'],
    queryFn: async () => {
      const meta = await fetchJSON('/data/meta.json')
      const chunks = await Promise.all(
        meta.locations.map(loc => fetchJSON(`/data/reviews/by-location/${loc.slug}.json`))
      )
      return chunks.flat().sort((a, b) => a.review_date.localeCompare(b.review_date))
    },
    staleTime: Infinity,
  })
}
