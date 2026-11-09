// listed = on the Bon Appétit site · example = placeholder (not on the site) · team = given by the team (e.g. guacamole +$1.35)
export type PriceSource = 'listed' | 'example' | 'team'

export interface MenuItem {
  id: string
  name: string
  description: string
  price: number
  priceSource: PriceSource // 'example' = not on the Bon Appétit site, placeholder price
  dietary: string[]
  calories: string
  builder?: boolean // true = opens the burrito/bowl builder instead of adding directly
  seenOn?: string[] // dates (YYYY-MM-DD) the item was on the site, for items gathered across days (pizzas)
}

export interface Station {
  name: string
  items: MenuItem[]
}

export interface Daypart {
  label: string // Breakfast | Lunch | Dinner
  start: string // "11:00"
  end: string // "16:00"
  stations: Station[]
}

export interface BuilderOption {
  id: string
  name: string
  price: number // added to the base price
  priceSource: PriceSource
  kind: 'everyday' | 'special' | 'vegetarian' // special = a rotating daily special seen on one of the scanned days
}

export interface BurritoBuilder {
  basePrice: number
  basePriceSource: PriceSource
  baseSourceItem: string // site item the base price comes from ("burrito bowl")
  types: string[] // ["Burrito", "Bowl"]
  proteins: BuilderOption[]
  guacamole: { price: number; priceSource: PriceSource }
  toppings: string[] // free
}

export interface Menu {
  cafe: string
  source: { url: string; vendor: string; menuDate: string; scrapedAt: string; scannedDates: string[]; notes: string }
  dayparts: Daypart[]
  burritoBuilder: BurritoBuilder
}

export interface OrderLine {
  itemId: string
  name: string
  price: number
  priceSource: PriceSource
  qty: number
  details?: string // chosen build, e.g. "Bowl · Carne asada · Beans · Rice · Guacamole · Lettuce, Cheese"
}

export type OrderStatus = 'received' | 'preparing' | 'ready' | 'picked-up'

export type PaymentMethod = 'dons-dollars' | 'flexi'

export interface Student {
  name: string
  usfId: string // mock 8-digit USF ID
}

export interface Order {
  id: string
  number: number // e.g. 214, shown everywhere
  student: Student
  lines: OrderLine[]
  total: number
  pickupAt: string // ISO time of the pickup slot
  payment: PaymentMethod
  status: OrderStatus
  cubby: number // numbered pickup shelf, assigned at order time, staff can change
  createdAt: string
}
