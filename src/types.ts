export type PriceSource = 'listed' | 'example'

export interface MenuItem {
  id: string
  name: string
  description: string
  price: number
  priceSource: PriceSource // 'example' = not on the Bon Appétit site, placeholder price
  dietary: string[]
  calories: string
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

export interface Menu {
  cafe: string
  source: { url: string; vendor: string; menuDate: string; scrapedAt: string; notes: string }
  dayparts: Daypart[]
}

export interface OrderLine {
  itemId: string
  name: string
  price: number
  priceSource: PriceSource
  qty: number
}

export type OrderStatus = 'received' | 'preparing' | 'ready' | 'picked-up'

export type PaymentMethod = 'dons-dollars' | 'flexi' | 'meal-swipe'

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
