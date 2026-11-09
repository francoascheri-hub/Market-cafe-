// Scrapes the real USF Market Café menu from Bon Appétit's public menu pages
// and writes src/data/menu.json.  Usage: npm run scrape [-- YYYY-MM-DD]
//
// - The chosen date gives the daily menu (dayparts/stations/items).
// - A window of days around it (SCAN_BACK/SCAN_AHEAD) is also read to collect
//   every real pizza type and the picante (burrito/bowl) protein options + prices.
import { writeFileSync, mkdirSync } from 'node:fs'

const date =
  process.argv[2] ??
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date())
const SCAN_BACK = 7
const SCAN_AHEAD = 4
const pageUrl = (d) => `https://usf.cafebonappetit.com/cafe/the-market-cafe/${d}/`

// Bon Appétit lists many items without a price (pastries, fruit, ...).
// We keep a few of those so the menu is usable, with a clearly-labelled EXAMPLE price.
const EXAMPLE_PRICE_BY_STATION = { pastries: 3.5, 'hand fruit': 1.5, beverage: 3.0 }
const EXAMPLE_PRICE_BY_NAME = [
  [/pancakes/i, 4.5],
  [/sandbox salad/i, 10.0],
]

// Burrito/bowl builder. Proteins, base price and protein prices come from the site;
// the items below were given by the team (not on the site) and are labelled as such.
const TEAM = {
  vegetarian: { id: 'vegetarian', name: 'Vegetarian (no meat)', price: 0, priceSource: 'example', kind: 'vegetarian' },
  guacamole: { price: 1.35, priceSource: 'team' },
  toppings: ['Lettuce', 'Cheese', 'Sour cream', 'Hot salsa (salsa picante)', 'Pico de gallo', 'Salsa verde'],
}
const PROTEIN_RE = /chicken|pork|beef|carne|carnitas|tofu|birria|asado|chorizo|steak|barbacoa|pastor|colorado|diabla|tinga|fish|shrimp/i
const NOT_PROTEIN_RE = /taco|burrito|bowl|beans|rice|topping|quinoa|salsa/i
const SPECIAL_PROTEIN_EXAMPLE_PRICE = 3.0 // daily specials have no listed price; everyday proteins list +$3.00

const clean = (s = '') =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/[�"“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
const capital = (s) => s.replace(/^./, (c) => c.toUpperCase())
const priceOf = (it) => parseFloat(it.price || it.sizes?.[0]?.price || '')
const isPicante = (station) => /picante/i.test(station)
const isPizzaStation = (station) => /pizza/i.test(station)

async function fetchDay(d, attempt = 1) {
  const res = await fetch(pageUrl(d), { headers: { 'User-Agent': 'Mozilla/5.0 (USF class project)' } }).catch(() => null)
  if (!res?.ok) {
    if (attempt < 3) return fetchDay(d, attempt + 1)
    throw new Error(`Could not fetch ${pageUrl(d)} (${res?.status ?? 'network error'})`)
  }
  const html = await res.text()
  const m = html.match(/Bamco\.menu_items = (\{.*?\});\s*\n/s)
  if (!m) return null // closed day / no menu
  return {
    date: d,
    items: JSON.parse(m[1]),
    dayparts: [...html.matchAll(/Bamco\.dayparts\['\d+'\] = (\{.*?\});\s*\n/gs)].map((x) => JSON.parse(x[1])),
  }
}

const shiftDate = (d, n) => {
  const t = new Date(`${d}T12:00:00Z`)
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}
const scanDates = Array.from({ length: SCAN_BACK + SCAN_AHEAD + 1 }, (_, i) => shiftDate(date, i - SCAN_BACK))
const days = (await Promise.all(scanDates.map(fetchDay))).filter(Boolean)
const today = days.find((d) => d.date === date)
if (!today) throw new Error(`No menu found for ${date}`)

// Every (station, item) seen across the scanned days.
const seen = days.flatMap((day) =>
  day.dayparts.flatMap((dp) =>
    dp.stations.flatMap((st) =>
      st.items
        .map((id) => day.items[String(id)])
        .filter(Boolean)
        .map((it) => ({ date: day.date, station: clean(st.label), it, name: capital(clean(it.label)) })),
    ),
  ),
)

// --- Pizza catalogue: every pizza the site listed in the window, with its listed price ---
const pizzas = new Map()
for (const s of seen.filter((s) => isPizzaStation(s.station) && /pizza/i.test(s.name) && priceOf(s.it) > 0)) {
  const p = pizzas.get(s.name) ?? {
    id: `pizza-${s.it.id}`,
    name: s.name,
    description: clean(s.it.description),
    price: priceOf(s.it),
    priceSource: 'listed',
    dietary: Object.values(s.it.cor_icon || {}).map(clean),
    calories: s.it.nutrition_details?.calories?.value || '',
    seenOn: [],
  }
  if (!p.seenOn.includes(s.date)) p.seenOn.push(s.date)
  pizzas.set(s.name, p)
}
const pizzaItems = [...pizzas.values()].map((p) => ({ ...p, seenOn: p.seenOn.sort() }))

// --- Burrito / bowl builder ---
const picante = seen.filter((s) => isPicante(s.station))
const base = picante.find((s) => /^burrito bowl$/i.test(s.name) && priceOf(s.it) > 0)
if (!base) throw new Error('No "burrito bowl" base price found at picante')
const proteins = new Map()
for (const s of picante.filter((s) => PROTEIN_RE.test(s.name) && !NOT_PROTEIN_RE.test(s.name))) {
  const listed = priceOf(s.it) > 0
  const prev = proteins.get(s.name)
  if (listed && (!prev || prev.priceSource !== 'listed')) {
    proteins.set(s.name, { id: `protein-${s.it.id}`, name: s.name, price: priceOf(s.it), priceSource: 'listed', kind: 'everyday' })
  } else if (!listed && !prev) {
    // unpriced daily special (rotates by day) — offered with an example price
    proteins.set(s.name, {
      id: `protein-${s.it.id}`,
      name: s.name,
      price: SPECIAL_PROTEIN_EXAMPLE_PRICE,
      priceSource: 'example',
      kind: 'special',
    })
  }
}
const burritoBuilder = {
  basePrice: priceOf(base.it),
  basePriceSource: 'listed',
  baseSourceItem: base.name,
  types: ['Burrito', 'Bowl'],
  proteins: [
    ...[...proteins.values()].sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'everyday' ? -1 : 1)),
    TEAM.vegetarian,
  ],
  guacamole: TEAM.guacamole,
  toppings: TEAM.toppings,
}
const builderItem = {
  id: 'build-your-own',
  name: 'Build your own burrito or bowl',
  description: 'Burrito or bowl · protein · beans · rice · toppings',
  price: burritoBuilder.basePrice,
  priceSource: 'listed',
  dietary: [],
  calories: '',
  builder: true,
}

// --- Daily menu for the chosen date ---
let listed = 0
let example = 0
const dayparts = today.dayparts.map((dp) => ({
  label: dp.label,
  start: dp.starttime,
  end: dp.endtime,
  stations: dp.stations
    .map((st) => {
      const station = clean(st.label)
      if (isPicante(station)) return { name: station, items: [builderItem] }
      const stItems = st.items
        .map((id) => today.items[String(id)])
        .filter((it) => it && String(it.tier) !== '3') // tier 3 = individual toppings/ingredients
        .filter((it, i, arr) => arr.findIndex((o) => clean(o.label) === clean(it.label)) === i) // site lists some items twice
        .filter((it) => !(isPizzaStation(station) && /pizza/i.test(clean(it.label)))) // replaced by the pizza catalogue
        .flatMap((it) => {
          const name = capital(clean(it.label))
          const realPrice = priceOf(it)
          let price = realPrice
          let priceSource = 'listed'
          if (!(realPrice > 0)) {
            const byName = EXAMPLE_PRICE_BY_NAME.find(([re]) => re.test(name))?.[1]
            price = byName ?? EXAMPLE_PRICE_BY_STATION[station.toLowerCase()]
            if (!price) return [] // unpriced side/component (e.g. garnish) — skip
            priceSource = 'example'
          }
          if (priceSource === 'listed') listed++
          else example++
          return [
            {
              id: it.id,
              name,
              description: clean(it.description),
              price,
              priceSource,
              dietary: Object.values(it.cor_icon || {}).map(clean),
              calories: it.nutrition_details?.calories?.value || '',
            },
          ]
        })
      return { name: station, items: isPizzaStation(station) ? [...pizzaItems, ...stItems] : stItems }
    })
    .filter((st) => st.items.length),
}))

const menu = {
  cafe: 'The Market Café (University Center, USF)',
  source: {
    url: pageUrl(date),
    vendor: 'Bon Appétit Management Co. — usf.cafebonappetit.com',
    menuDate: date,
    scrapedAt: new Date().toISOString(),
    scannedDates: days.map((d) => d.date),
    notes:
      'Daily menu = source URL. Pizza types and burrito/bowl proteins are collected from every scanned date (same URL pattern). ' +
      'priceSource "listed" = price on the site; "example" = no price on the site, placeholder; "team" = provided by the team (guacamole). ' +
      'Burrito/bowl free toppings and the Vegetarian option were provided by the team. Individual toppings/ingredients and unpriced sides are omitted from the item list.',
  },
  dayparts,
  burritoBuilder,
}

mkdirSync('src/data', { recursive: true })
writeFileSync('src/data/menu.json', JSON.stringify(menu, null, 2) + '\n')
console.log(
  `Wrote src/data/menu.json for ${date} (scanned ${days.length} days): ${listed} listed + ${example} example items, ` +
    `${pizzaItems.length} pizzas, ${burritoBuilder.proteins.length} proteins`,
)
