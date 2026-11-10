import { useIsFocused } from '@react-navigation/native'
import { useEffect, useRef } from 'react'
import { recordDetailOpened, useIntelligenceContext } from '@/lib/intelligenceAnalytics'

// One loaded detail per mounted route, not another open whenever an RPC
// revalidates or the user returns from a child page. No consent backfill.
export function useIntelligenceDetail(name: 'beer_opened' | 'bar_opened' | 'activity_opened',
  ids: { tenant_id?: string | null; source_drink_id?: string | null; product_id?: string | null; activity_id?: string | null }, source = 'direct') {
  const focused = useIsFocused()
  const identity = useIntelligenceContext()
  const recorded = useRef('')
  const key = JSON.stringify(ids)
  const ready = name === 'beer_opened' ? !!(ids.source_drink_id || ids.product_id) : name === 'bar_opened' ? !!ids.tenant_id : !!ids.activity_id
  useEffect(() => {
    if (!ready || !focused || !identity.ready || recorded.current === key) return
    recorded.current = key
    recordDetailOpened(name, ids, source)
  }, [name, key, ready, focused, source, identity.ready])
}
