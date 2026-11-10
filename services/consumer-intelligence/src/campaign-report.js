import { createPool, transaction } from './db.js'
import { loadConfig } from './config.js'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function reportOptions({ campaignId, from, until, environment = 'release' }) {
  if (!uuid.test(campaignId) || !['release', 'trial', 'develop'].includes(environment)) throw new Error('INVALID_REPORT_SCOPE')
  const start = Date.parse(from), end = Date.parse(until)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 93 * 86400000) throw new Error('INVALID_REPORT_WINDOW')
  return { campaignId, from: new Date(start).toISOString(), until: new Date(end).toISOString(), environment }
}

// Operator-only aggregate report; never expose raw IDs, account histories or this
// connection to a client. Explicit campaign + occurrence environment isolates QA.
export async function campaignReport(pool, input) {
  const scope = reportOptions(input)
  return transaction(pool, async client => {
    await client.query('SET TRANSACTION READ ONLY')
    const params = [scope.campaignId, scope.environment, scope.from, scope.until]
    const selected = `WITH selected AS (
      SELECT *, COALESCE(raw->>'action',raw->>'event_name') AS action,
        raw#>>'{campaign,entry_source}' AS entry_source,
        raw#>>'{campaign,visit_id}' AS visit_id, raw->>'result' AS result
      FROM ci.events WHERE raw#>>'{campaign,campaign_id}'=$1
        AND raw#>>'{campaign,environment}'=$2 AND occurred_at >= $3::timestamptz AND occurred_at < $4::timestamptz
    )`
    const summary = (await client.query(`${selected} SELECT count(*)::int AS events,
      count(DISTINCT installation_id)::int AS observed_installations,
      count(DISTINCT session_id)::int AS sessions,
      count(DISTINCT resolved_user_key) FILTER (WHERE identity_state='resolved')::int AS resolved_accounts,
      min(occurred_at) AS first_event_at, max(occurred_at) AS last_event_at,
      count(*) FILTER (WHERE identity_state<>'resolved')::int AS unresolved_events,
      count(*) FILTER (WHERE received_at-occurred_at > interval '1 hour')::int AS late_events,
      count(DISTINCT installation_id) FILTER (WHERE action IN ('activity_opened','beer_opened'))::int AS detail_viewing_installations
      FROM selected`, params)).rows[0]
    const metrics = `count(*)::int AS events, count(DISTINCT installation_id)::int AS installations,
      count(DISTINCT session_id)::int AS sessions,
      count(DISTINCT resolved_user_key) FILTER (WHERE identity_state='resolved')::int AS resolved_accounts`
    const actions = (await client.query(`${selected} SELECT action,result,${metrics}
      FROM selected GROUP BY action,result ORDER BY action,result`, params)).rows
    const channels = (await client.query(`${selected} SELECT entry_source,action,${metrics}
      FROM selected WHERE action IN ('activity_opened','beer_opened','banner_impression','banner_clicked')
      GROUP BY entry_source,action ORDER BY entry_source,action`, params)).rows
    const venues = (await client.query(`${selected} SELECT raw->>'tenant_id' AS tenant_id,
      raw#>>'{campaign,stop_id}' AS stop_id,raw->>'source_drink_id' AS drink_id, action,result,${metrics}
      FROM selected WHERE raw->>'tenant_id' IS NOT NULL
      GROUP BY raw->>'tenant_id',raw#>>'{campaign,stop_id}',raw->>'source_drink_id',action,result
      ORDER BY tenant_id,action,result`, params)).rows
    const daily = (await client.query(`${selected} SELECT to_char(occurred_at AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD') AS day,
      action,result,${metrics} FROM selected GROUP BY day,action,result ORDER BY day,action,result`, params)).rows
    const returning = (await client.query(`${selected}, per_installation AS (
      SELECT installation_id,count(DISTINCT session_id) AS sessions,
        count(DISTINCT (occurred_at AT TIME ZONE 'Asia/Shanghai')::date) AS days
      FROM selected WHERE action IN ('activity_opened','beer_opened') GROUP BY installation_id
    ) SELECT count(*) FILTER (WHERE sessions>1)::int AS repeat_detail_installations,
      count(*) FILTER (WHERE days>1)::int AS multi_day_detail_installations FROM per_installation`, params)).rows[0]
    const firstObserved = (await client.query(`${selected}, viewers AS (
      SELECT DISTINCT installation_id FROM selected WHERE action IN ('activity_opened','beer_opened')
    ) SELECT count(*)::int AS first_observed_during_window_installations
      FROM viewers v WHERE NOT EXISTS (
        SELECT 1 FROM ci.events history WHERE history.installation_id=v.installation_id
          AND history.occurred_at < $3::timestamptz
      )`, params)).rows[0]
    const journeys = (await client.query(`${selected}, per_visit AS (
      SELECT visit_id, bool_or(action IN ('activity_opened','beer_opened')) AS viewed,
        bool_or(action='map_navigation_clicked') AS navigation,
        bool_or(action='checkin_started') AS checkin_started,
        bool_or(action='checkin_result' AND result='success') AS reported_checkin,
        bool_or(action='poster_save_result' AND result='success') AS saved_poster,
        bool_or(action='purchase_clicked') AS purchase_intent
      FROM selected GROUP BY visit_id
    ) SELECT count(*) FILTER (WHERE viewed)::int AS detail_visits,
      count(*) FILTER (WHERE viewed AND navigation)::int AS visits_with_navigation,
      count(*) FILTER (WHERE viewed AND checkin_started)::int AS visits_with_checkin_started,
      count(*) FILTER (WHERE viewed AND reported_checkin)::int AS visits_with_reported_checkin,
      count(*) FILTER (WHERE viewed AND saved_poster)::int AS visits_with_poster_save,
      count(*) FILTER (WHERE viewed AND purchase_intent)::int AS visits_with_purchase_intent FROM per_visit`, params)).rows[0]
    return { report_version: 1, generated_at: new Date().toISOString(), scope, summary: { ...summary, ...returning, ...firstObserved }, actions, channels, venues, daily, journeys,
      limitations: [
        'Client-reported, consent-dependent observations; installation/session/visit IDs are not natural people.',
        'Visit overlap is not a time-ordered conversion funnel and does not relabel pre-login events as account history.',
        'Use Supabase active completion records for participants, progress and completion totals; exclude revoked records.',
        'Navigation/check-in are not verified attendance, sales, redemption or causal lift.',
        'Share callbacks measure requests, not published shares; handoff success is not payment.',
        'No lifetime-new-user claim: retention, opt-out and reinstall limit historical coverage.',
        'First observed means no earlier retained ECS events before this window; it does not prove new registration or acquisition caused by this campaign.',
        'Select the formal campaign ID explicitly. Environment/source are producer claims, not identity proof.',
        'Late arrivals can revise counts. Re-export after the seven-day upload window before final reporting.',
        'Keep this internal; publish aggregate case-study figures only after reviewing coverage and small groups.'
      ] }
  }, 'REPEATABLE READ')
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  let pool
  try {
    const [campaignId, from, until, environment = 'release'] = process.argv.slice(2)
    const options = reportOptions({ campaignId, from, until, environment })
    pool = createPool(loadConfig())
    console.log(JSON.stringify(await campaignReport(pool, options), null, 2))
  } catch {
    // Database errors can contain credentials or statements. Keep CLI errors safe.
    console.error(JSON.stringify({ code: 'CAMPAIGN_REPORT_FAILED' }))
    process.exitCode = 1
  } finally { if (pool) await pool.end() }
}
