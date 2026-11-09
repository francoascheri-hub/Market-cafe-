import { formatPrice, menu } from '../menu'
import type { MenuItem, OrderLine, OrderStatus } from '../types'

export type Cart = Record<string, number> // itemId -> qty

// Items are looked up across all dayparts so the cart survives a daypart change.
const itemsById = new Map<string, MenuItem>(
  menu.dayparts.flatMap((d) => d.stations.flatMap((s) => s.items)).map((i) => [i.id, i]),
)

export function cartLines(cart: Cart): OrderLine[] {
  return Object.entries(cart).flatMap(([id, qty]) => {
    const item = itemsById.get(id)
    return item && qty > 0
      ? [{ itemId: id, name: item.name, price: item.price, priceSource: item.priceSource, qty }]
      : []
  })
}

export const totalLabel = (lines: OrderLine[]) => formatPrice(lines.reduce((s, l) => s + l.price * l.qty, 0))

export const STATUS_LABEL: Record<OrderStatus, string> = {
  received: 'Received',
  preparing: 'Preparing',
  ready: 'Ready',
  'picked-up': 'Picked up',
}
