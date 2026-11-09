import { localBackend } from './local'
import type { OrdersBackend } from './types'

// Supabase is wired in once the project credentials and schema are known.
export const backend: OrdersBackend = localBackend()
