// Scrapes the real USF Market Café menu from Bon Appétit's public menu page
// and writes src/data/menu.json.  Usage: npm run scrape [-- YYYY-MM-DD]
import { writeFileSync, mkdirSync } from 'node:fs'

const date =
  process.argv[2] ??
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date())
const url = `https://usf.cafebonappetit.com/cafe/the-market-cafe/${date}/`

// Bon Appétit lists many items without a price (pastries, fruit, build-your-own).
// We keep a few of those so the menu is usable, with a clearly-labelled EXAMPLE price.
const EXAMPLE_PRICE_BY_STATION = { pastries: 3.5, 'hand fruit': 1.5, beverage: 3.0 }
const EXAMPLE_PRICE_BY_NAME = [
  [/build your own burrito or bowl/i, 12.0],
  [/pancakes/i, 4.5],
  [/sandbox salad/i, 10.0],
]

const html = await (await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (USF class project)' } })).text()

const grab = (re) => {
  const m = html.match(re)
  if (!m) throw new Error(`Pattern not found: ${re}`)
  return JSON.parse(m[1])
}
const items = grab(/Bamco\.menu_items = (\{.*?\});\s*\n/s)
const dayparts = [...html.matchAll(/Bamco\.dayparts\['\d+'\] = (\{.*?\});\s*\n/gs)].map((m) => JSON.parse(m[1]))

const clean = (s = '') =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/[�"“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

let listed = 0
let example = 0
const out = dayparts.map((dp) => ({
  label: dp.label,
  start: dp.starttime,
  end: dp.endtime,
  stations: dp.stations
    .map((st) => {
      const station = clean(st.label)
      const stItems = st.items
        .map((id) => items[String(id)])
        .filter((it) => it && String(it.tier) !== '3') // tier 3 = individual toppings/ingredients
        .filter((it, i, arr) => arr.findIndex((o) => clean(o.label) === clean(it.label)) === i) // site lists some items twice
        .flatMap((it) => {
          const name = clean(it.label)
          const realPrice = parseFloat(it.price || it.sizes?.[0]?.price || '')
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
      return { name: station, items: stItems }
    })
    .filter((st) => st.items.length),
}))

const menu = {
  cafe: 'The Market Café (University Center, USF)',
  source: {
    url,
    vendor: 'Bon Appétit Management Co. — usf.cafebonappetit.com',
    menuDate: date,
    scrapedAt: new Date().toISOString(),
    notes:
      'Items and listed prices are real, scraped from the source URL. Items with priceSource "example" had no price on the site and use a placeholder example price. Individual toppings/ingredients (tier 3) and unpriced sides are omitted.',
  },
  dayparts: out,
}

mkdirSync('src/data', { recursive: true })
writeFileSync('src/data/menu.json', JSON.stringify(menu, null, 2) + '\n')
console.log(`Wrote src/data/menu.json for ${date}: ${listed} listed-price items, ${example} example-price items`)
