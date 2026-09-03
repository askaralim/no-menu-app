import { getTaplistSupabase } from '@/lib/supabase'
import type {
  LightDrinkResult,
  MyDrinkHistoryRow,
  MyDrinkInsights,
  MyDrinkState,
  MyDrinkSummary,
} from '@/lib/types'

type HistoryResponse = { ok: true; results: MyDrinkHistoryRow[] }

export async function getMyDrinkState(drinkId: string) {
  const client = getTaplistSupabase()
  const { data: sessionData } = await client.auth.getSession()
  if (!sessionData.session) {
    return {
      ok: true,
      light_id: null,
      is_lit: false,
      is_current_venue_lit: false,
      first_lit_at: null,
      venue_count: 0,
    } satisfies MyDrinkState
  }
  const { data, error } = await client.rpc('get_my_drink_state', {
    p_drink_id: drinkId,
  })
  if (error) throw error
  return data as MyDrinkState
}

export async function lightMyDrink(drinkId: string) {
  const { data, error } = await getTaplistSupabase().rpc('light_my_drink', {
    p_drink_id: drinkId,
  })
  if (error) throw error
  return data as LightDrinkResult
}

export async function getMyDrinkHistory(cursor?: string | null, limit = 60) {
  const { data, error } = await getTaplistSupabase().rpc('get_my_drink_history', {
    p_cursor: cursor ?? null,
    p_limit: limit,
  })
  if (error) throw error
  const payload = data as HistoryResponse
  return payload.results ?? []
}

export async function getMyDrinkSummary() {
  const { data, error } = await getTaplistSupabase().rpc('get_my_drink_summary')
  if (error) throw error
  return data as MyDrinkSummary
}

export async function getMyDrinkInsights() {
  const client = getTaplistSupabase()
  const [{ data, error }, history] = await Promise.all([
    client.rpc('get_my_drink_insights'),
    getMyDrinkHistory(null, 200),
  ])
  if (error) throw error
  const insights = data as Omit<MyDrinkInsights, 'tonight' | 'month'> & {
    tonight: Omit<MyDrinkInsights['tonight'], 'drinks'> & {
      drinks: Array<Omit<MyDrinkInsights['tonight']['drinks'][number], 'bar_names'>>
    }
    month: Omit<MyDrinkInsights['month'], 'drink_count' | 'drinks'> & {
      drink_count?: number
      activity_bar_count?: number
      activity_drinks?: Array<Omit<MyDrinkInsights['month']['drinks'][number], 'bar_names'>>
      drinks: Array<Omit<MyDrinkInsights['month']['drinks'][number], 'bar_names'>>
    }
  }
  const monthDrinks = insights.month.activity_drinks ?? insights.month.drinks
  const historyByLightId = new Map(history.map((item) => [item.light_id, item]))
  const businessDayStart = new Date(insights.tonight.business_day_start).getTime()
  const monthStart = new Date(insights.month.month_start).getTime()
  const monthEnd = new Date(insights.month.month_end).getTime()
  const normalizedStyleCounts = [...monthDrinks.reduce((counts, drink) => {
    const style = normalizeBeerStyle(drink.beer_style)
    counts.set(style, (counts.get(style) ?? 0) + 1)
    return counts
  }, new Map<string, number>())]
    .map(([style, count]) => ({ style, count }))
    .sort((a, b) => b.count - a.count || a.style.localeCompare(b.style, 'zh-CN'))

  return {
    ...insights,
    tonight: {
      ...insights.tonight,
      drinks: insights.tonight.drinks.map((drink) => ({
        ...drink,
        bar_names: [...new Set(
          (historyByLightId.get(drink.light_id)?.venues ?? [])
            .filter((venue) => new Date(venue.first_drank_at).getTime() >= businessDayStart)
            .map((venue) => venue.tenant_name),
        )],
      })),
    },
    month: {
      ...insights.month,
      drink_count: insights.month.drink_count ?? monthDrinks.length,
      bar_count: insights.month.activity_bar_count ?? insights.month.bar_count,
      style_counts: normalizedStyleCounts,
      drinks: monthDrinks.map((drink) => ({
        ...drink,
        bar_names: [...new Set(
          (historyByLightId.get(drink.light_id)?.venues ?? [])
            .filter((venue) => {
              const drankAt = new Date(venue.first_drank_at).getTime()
              return drankAt >= monthStart && drankAt < monthEnd
            })
            .map((venue) => venue.tenant_name),
        )],
      })),
    },
  } satisfies MyDrinkInsights
}

export function normalizeBeerStyle(value: string | null) {
  const style = value?.trim() ?? ''
  const normalized = style.toLocaleLowerCase()

  if (!normalized || normalized === '其他') return '其他'
  if (/(ipa|印度淡色|西海岸|新英格兰|浑浊|ddh)/i.test(normalized)) return 'IPA'
  if (/(酸|sour|gose|古斯|柏林酸)/i.test(normalized)) return '酸啤'
  if (/(拉格|lager|pils|皮尔森|博克|helles)/i.test(normalized)) return '拉格'
  if (/(小麦|白啤|wheat|weizen|witbier)/i.test(normalized)) return '小麦'
  if (/(世涛|波特|stout|porter)/i.test(normalized)) return '世涛 / 波特'
  if (/(赛松|农舍|saison|farmhouse)/i.test(normalized)) return '赛松 / 农舍'
  if (/(比利时|修道院|三料|四料|belgian|tripel|dubbel|quadrupel)/i.test(normalized)) return '比利时艾尔'
  if (/(西打|苹果酒|cider)/i.test(normalized)) return '西打'
  if (/(蜂蜜酒|mead)/i.test(normalized)) return '蜂蜜酒'
  if (/(淡色艾尔|金色艾尔|琥珀艾尔|pale ale|amber ale|golden ale)/i.test(normalized)) return '艾尔'
  return '其他'
}

export async function removeMyDrinkVenue(lightId: string, tenantId: string) {
  const { data, error } = await getTaplistSupabase().rpc('remove_my_drink_venue', {
    p_light_id: lightId,
    p_tenant_id: tenantId,
  })
  if (error) throw error
  return data as { ok: true; remaining_venues: number; is_lit: boolean }
}

export async function unlightMyDrink(lightId: string) {
  const { data, error } = await getTaplistSupabase().rpc('unlight_my_drink', {
    p_light_id: lightId,
  })
  if (error) throw error
  return data as { ok: true }
}
