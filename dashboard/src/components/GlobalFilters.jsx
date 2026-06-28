import { getUniqueBrands, getUniqueLocations, getBrand } from '../utils/dataUtils.js'

function MultiSelect({ label, options, selected, onChange }) {
  const all = selected.length === 0
  function toggle(v) {
    if (selected.includes(v)) onChange(selected.filter(x => x !== v))
    else onChange([...selected, v])
  }
  return (
    <div>
      <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => onChange([])}
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${all ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}
        >
          All
        </button>
        {options.map(o => (
          <button
            key={o}
            onClick={() => toggle(o)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${selected.includes(o) ? 'bg-amber-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  )
}

function StarFilter({ selected, onChange }) {
  function toggle(s) {
    if (selected.includes(s)) onChange(selected.filter(x => x !== s))
    else onChange([...selected, s].sort())
  }
  const all = selected.length === 0
  return (
    <div>
      <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1.5">Stars</p>
      <div className="flex gap-1.5">
        <button
          onClick={() => onChange([])}
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${all ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}
        >All</button>
        {[5,4,3,2,1].map(s => (
          <button
            key={s}
            onClick={() => toggle(s)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${selected.includes(s) ? 'bg-amber-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}
          >
            {'★'.repeat(s)}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function GlobalFilters({ allReviews, filters, onChange }) {
  const allBrands    = getUniqueBrands(allReviews)
  const allLocations = getUniqueLocations(allReviews).filter(loc =>
    filters.brands.length === 0 || filters.brands.includes(getBrand(loc))
  )

  function set(key, val) { onChange({ ...filters, [key]: val }) }

  function reset() {
    onChange({ brands: [], locations: [], start: filters._defaultStart, end: filters._defaultEnd, stars: [] })
  }

  const hasActive = filters.brands.length || filters.locations.length || filters.stars.length

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-stone-700">Filters</h2>
        {hasActive ? (
          <button onClick={reset} className="text-xs text-amber-600 hover:text-amber-800 font-medium">
            Clear filters
          </button>
        ) : null}
      </div>

      {/* Date range */}
      <div>
        <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1.5">Date Range</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={filters.start}
            onChange={e => set('start', e.target.value)}
            className="text-sm border border-stone-200 rounded-lg px-2.5 py-1.5 text-stone-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <span className="text-stone-400 text-sm">to</span>
          <input
            type="date"
            value={filters.end}
            onChange={e => set('end', e.target.value)}
            className="text-sm border border-stone-200 rounded-lg px-2.5 py-1.5 text-stone-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>
      </div>

      <MultiSelect label="Brand"    options={allBrands}    selected={filters.brands}    onChange={v => set('brands', v)} />
      <MultiSelect label="Location" options={allLocations} selected={filters.locations} onChange={v => set('locations', v)} />
      <StarFilter selected={filters.stars} onChange={v => set('stars', v)} />
    </div>
  )
}
