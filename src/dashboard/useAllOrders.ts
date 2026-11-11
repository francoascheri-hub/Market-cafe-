// Full order history for the dashboard: fetched every 10 s (and whenever the live list changes),
// with the live orders laid on top so status changes show up straight away.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { loadAllOrders, useOrders } from '../store'
import type { Order } from '../types'

const REFRESH_MS = 10_000

export function useAllOrders() {
  const live = useOrders()
  const [history, setHistory] = useState<Order[] | null>(null)

  const refresh = useCallback(async () => {
    if (document.visibilityState !== 'visible') return
    try {
      setHistory(await loadAllOrders())
    } catch {
      // offline for a moment: keep the last list
    }
  }, [])

  // Reload now (and whenever the live list changes), then every REFRESH_MS.
  useEffect(() => {
    const first = setTimeout(refresh, 0)
    const t = setInterval(refresh, REFRESH_MS)
    return () => {
      clearTimeout(first)
      clearInterval(t)
    }
  }, [live, refresh])

  const orders = useMemo(() => {
    const byId = new Map((history ?? []).map((o) => [o.id, o]))
    for (const o of live) byId.set(o.id, o)
    return [...byId.values()]
  }, [history, live])

  return { orders, loaded: history !== null, refresh }
}
