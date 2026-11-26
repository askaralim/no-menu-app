'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import styles from './page.module.css'
import { channelLabel, modeLabel, surfaceLabel, identityLabel, sourceLabel, displayVenue, entryPresentation, sumField, clickRate, englishSessionRate, feedComparison, dailyPresentation, visitDays } from './report-presentation'

type Row = Record<string, any>
type Report = { generated_at: string; scope: Row; summary: Row; visits?: { scope: Row; summary: Row; daily: Row[]; channels: Row[]; behaviors?: Row[]; entries?: Row[] }; daily: Row[]; events: Row[]; sources: Row[]; cities: Row[]; beers: Row[]; identity: Row[]; feed: Row[]; feed_taps: Row[]; venues: Row[]; business: Row; health: Row }
const origin = (process.env.NEXT_PUBLIC_INTELLIGENCE_ORIGIN || 'https://nomenuapp.com').replace(/\/$/, '')
const number = (v: any) => v == null ? '—' : Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 2 })
const time = (v: any) => v ? new Date(v).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '暂无'
const labels: Record<string, string> = { consumer_open: '应用打开', consumer_action: '消费者行为', consumer_entry: '入口事件', consumer_visit: '活跃访问', search_completed: '搜索完成', tap_succeeded: 'TAP操作成功', follow_succeeded: '新增关注成功', menu_loaded: '网页酒单加载', code_resolved: '门店码解析', target_loaded: '码目标页加载', code_visible: '小程序码可见', guide_clicked: '打开引导点击', beer_opened: '酒款详情', bar_opened: '门店详情', search_result_opened: '搜索结果', activity_opened: '活动详情', map_navigation_clicked: '导航', feed_shown: 'Feed 展示', feed_item_impression: '卡片曝光', feed_item_opened: 'Feed 点击', city_changed: '切换城市' }
function Table({ rows, columns, preview }: { rows: Row[]; columns: [string, string][]; preview?: number }) {
  if (preview && rows.length > preview) return <><Table rows={rows.slice(0,preview)} columns={columns}/><details className={styles.details}><summary>展开其余 {rows.length-preview} 行（共 {rows.length} 行）</summary><Table rows={rows.slice(preview)} columns={columns}/></details></>
  return <div className={styles.tableWrap}><table><thead><tr>{columns.map(([k,l])=><th key={k}>{l}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i}>{columns.map(([k])=><td key={k}>{r[k] == null ? '—' : typeof r[k] === 'number' ? number(r[k]) : String(r[k])}</td>)}</tr>)}</tbody></table>{!rows.length && <p className={styles.empty}>此范围暂无记录。没有记录不等于没有使用。</p>}</div>
}
function Metrics({ items }: { items: [string, any, string][] }) {
  return <div className={styles.metrics}>{items.map(([label,value,hint])=><div key={label}><span>{label}</span><strong>{typeof value === 'string' ? value : number(value)}</strong><small>{hint}</small></div>)}</div>
}
export default function IntelligencePage() {
  const [days,setDays]=useState('7'), [application,setApplication]=useState('all'), [tab,setTab]=useState('visits')
  const [report,setReport]=useState<Report|null>(null), [loading,setLoading]=useState(true), [error,setError]=useState(''), [refresh,setRefresh]=useState(0)
  useEffect(()=>{
    let active=true; const abort=new AbortController(); setLoading(true); setError(''); setReport(null)
    const timer=setTimeout(()=>{ abort.abort(); if(active){setLoading(false);setError('请求超时，请重试。')} },30000)
    async function load() {
      try {
        const { data: { session } }=await supabase.auth.getSession()
        if (!session) throw new Error('请先登录超级管理员账号。')
        const response=await fetch(`${origin}/api/internal/v1/intelligence-report?days=${days}&application=${application}`, { headers: { Authorization: `Bearer ${session.access_token}` }, signal: abort.signal, cache: 'no-store' })
        if (!response.ok) throw new Error(response.status===403 ? '此看板仅对平台超级管理员开放。' : response.status===401 ? '登录已过期，请重新登录。' : `统计服务暂不可用（HTTP ${response.status}）。请确认 ECS 接口已部署。`)
        const value=await response.json()
        if (!value.scope || !value.health || !value.business) throw new Error('统计接口响应不完整。')
        if (active && !abort.signal.aborted) setReport(value)
      } catch(e) { if (active && !abort.signal.aborted) setError(e instanceof TypeError ? '无法连接统计服务，请检查网络后重试。若持续失败，请检查接口与跨域配置。' : e instanceof Error ? e.message : '加载失败') }
      finally { clearTimeout(timer); if (active && !abort.signal.aborted) setLoading(false) }
    }
    load()
    return ()=>{ active=false; clearTimeout(timer); abort.abort() }
  },[days,application,refresh])
  const r=report
  const daily = r ? dailyPresentation(r.daily, r.scope.from, r.scope.until) : []
  const visitsDaily = r?.visits ? visitDays(r.visits.daily, r.visits.scope.from, r.visits.scope.until) : []
  const eventCount = (name: string) => sumField(r?.events.filter(row=>row.name===name) ?? [], 'events')
  const comparisons = feedComparison(r?.feed ?? [])
  const feedTotals = Object.fromEntries(['impressions','opened_after_impression','opened_items'].map(key=>[key,sumField(r?.feed ?? [],key)]))
  const venueRows = (r?.venues ?? []).map(row=>({...row,name:displayVenue(row.name)}))
  const projectionProblems = r ? ['catalog','consumer'].filter(scope=>!r.health.projections.some((row:Row)=>row.scope===scope && Number.isFinite(Date.parse(row.source_as_of)) && Date.parse(r.generated_at)-Date.parse(row.source_as_of)<=600000)) : []
  return <div className={styles.page}>
    <header className={styles.header}><div><span className={styles.eyebrow}>NO MENU · INTERNAL</span><h1>行为与 Feed 看板</h1><a href="/admin/platform/users">查看账号与TAP/关注</a><p>每日访问、门店浏览、上新效果与浏览后的 TAP。</p></div><button disabled={loading} onClick={()=>setRefresh(n=>n+1)}>{loading?'读取中…':'刷新数据'}</button></header>
    <div className={styles.filters}><label>时间范围 <select value={days} onChange={e=>setDays(e.target.value)}><option value="1">{tab==='visits'?'今天':'最近 24 小时'}</option><option value="7">最近 7 天</option><option value="30">最近 30 天</option></select></label><label>行为渠道 <select value={application} onChange={e=>setApplication(e.target.value)}><option value="all">全部渠道</option><option value="taplist">Taplist</option><option value="ios">iOS（历史标识）</option><option value="miniprogram">小程序</option><option value="consumer_web">消费者网页</option><option value="unknown">未知渠道</option></select></label><span>北京时间 · 按行为发生时间统计</span></div>
    <nav className={styles.tabs} aria-label="数据视图">{[['visits','每日访问'],['discovery','门店与酒款'],['feed','上新效果'],['business','浏览后的 TAP'],['quality','采集健康']].map(([id,label])=><button key={id} aria-pressed={tab===id} onClick={()=>setTab(id)}>{label}</button>)}</nav>
    {error && <div role="alert" className={styles.error}><div><strong>数据暂时无法加载</strong><p>{error}</p></div><button onClick={()=>setRefresh(n=>n+1)}>重试</button></div>}
    {loading && <p role="status" className={styles.empty}>正在读取 ECS 聚合数据…</p>}
    {r && <>
      <p className={styles.stamp}>生成于 {time(r.generated_at)} · {time(tab==='visits' ? r.visits?.scope.from : r.scope.from)} — {time(r.scope.until)} · 服务端缓存最多 60 秒</p>
      <div className={styles.notice}>内部观察数据，尚未排除测试操作。曝光、点击、TAP 是不同阶段，不能相加当作用户数；浏览后 TAP 也不等于已核实到店。</div>
      {tab==='visits' && <>
        <div className={styles.intro}><h2>每天有多少访问者？</h2><p>北京时间自然日，所选天数包含今天；今天仅截至当前。仅统计消费者访问，小程序商户页、POS和Web Admin排除。</p></div>
        {!r.visits ? <p className={styles.empty}>每日访问接口尚未部署，不能用浏览事件代替访问人数。</p> : <>
          <Metrics items={[[ '应用打开',r.visits.summary.opens,'小程序/Taplist冷启动或返回前台；不含页面切换'],['网页酒单打开',r.visits.summary.menu_opens,'成功加载，不代表扫码次数'],['有行为访客标识',r.visits.summary.engaged_visitors,'详情/搜索/导航/TAP/关注，不含曝光'],['行为参与率',r.visits.summary.visitors > 0 && r.visits.summary.engaged_visitors != null ? `${(100*r.visits.summary.engaged_visitors/r.visits.summary.visitors).toFixed(1)}%` : null,'同日口径；不是每次打开的转化率'],[ '所选时段访客标识',r.visits.summary.visitors,'渠道内去重后合计；不是跨渠道真实人数'],['英文访客标识',r.visits.summary.english_visitors,'至少一次以英文界面访问'],['英文访问会话',r.visits.summary.english_sessions,'同一会话中英文和中文可以同时出现'],['英文会话占比',englishSessionRate(r.visits.summary),'英文会话 ÷ 全部已记录会话'],['语言未知会话',r.visits.summary.unknown_language_sessions,'旧客户端或未上报语言的渠道'],['已识别活跃账号',r.visits.summary.accounts,'仅可靠解析的账号去重；匿名不计入'],['访问会话',r.visits.summary.sessions,'同渠道、安装标识和session去重']]}/>
          <p>仅包含新版本成功上传的正式环境访问；关闭采集、旧客户端和未上传数据不在内。缺少某天或渠道表示没有收到记录，不证明零访问。匿名网页只统计浏览器标识，清理存储或跨设备会产生新标识。</p>
          <section><h2>每日访客标识趋势</h2><div className={styles.chart}>{visitsDaily.map(d=><div key={d.day}><span>{d.day.slice(5)}</span><div><i style={{width:`${d.visitors/Math.max(1,...visitsDaily.map(x=>Number(x.visitors)))*100}%`}} /></div><b>{number(d.visitors)}</b></div>)}</div>
          <Table rows={visitsDaily.map(x=>({...x,english_rate:englishSessionRate(x)}))} columns={[[ 'day_label','日期'],['visitors','访客标识合计（非人数）'],['accounts','已识别账号'],['opens','应用打开'],['menu_opens','酒单打开'],['actions','行为次数'],['engaged_visitors','有行为访客'],['sessions','会话'],['english_sessions','英文会话'],['english_rate','英文占比'],['unknown_language_sessions','语言未知']]}/></section>
          <section><h2>每日行为参与</h2><p>仅正式环境、北京时间自然日。TAP成功是操作事件，不等于新增酒款；业务记录见“浏览后的TAP”。旧客户端缺少环境证明的行为不混入。</p><Table rows={(r.visits.behaviors || []).map(x=>({...x,channel:channelLabel(x.channel),action:labels[x.action]||x.action}))} columns={[[ 'day','日期'],['channel','渠道'],['action','行为'],['events','次数'],['visitors','访客标识']]}/></section>
          <section><h2>每日渠道明细</h2><Table rows={r.visits.channels.map(x=>({...x,channel:x.channel==='consumer_web'?'消费者网页':channelLabel(x.channel),english_rate:englishSessionRate(x)}))} columns={[[ 'day','日期'],['channel','渠道'],['visitors','访客标识'],['accounts','已识别账号'],['opens','应用打开'],['menu_opens','酒单打开'],['actions','行为次数'],['engaged_visitors','有行为访客'],['sessions','会话'],['english_sessions','英文会话'],['english_rate','英文占比'],['unknown_language_sessions','语言未知']]}/></section>
          <p>同一账号跨渠道只在总计中去重一次；各渠道账号数不能相加当作全平台人数。不会用其他事件补造历史访问。</p>
        </>}
      </>}
      {tab==='discovery' && <>
        <section><h2>网页酒单与门店码来源</h2><p>本区使用访问页的北京时间自然日与正式环境口径。解析、可见、引导点击、页面成功分别统计；不证明到店或网页到小程序转化。物料仅表示码的配置，不证明实际摆放位置。网页浏览器不适用于小程序和 App。</p><Table rows={(r.visits?.entries || []).filter(x=>x.action!=='consumer_open').map(x=>({...entryPresentation(x),channel:channelLabel(x.channel),action:labels[x.action]||x.action,source:sourceLabel(x.source)}))} columns={[[ 'channel','渠道'],['action','阶段'],['venue','门店 slug'],['source','入口'],['placement_label','码物料'],['browser_label','网页浏览器'],['events','次数']]}/><p>门店 slug 来自当前目录；无法解析时保留 ID。历史门店码解析事件可能未记录门店 ID，不按会话猜测回填。入口分组最多显示 100 行。</p></section>
        <section><h2>应用打开与微信入口场景</h2><p>应用打开不一定进入门店，不属于扫码次数，也不要求门店或物料信息。微信场景值表示启动入口；未记录入口不能推断为扫码。</p><Table rows={(r.visits?.entries || []).filter(x=>x.action==='consumer_open').map(x=>({...x,channel:channelLabel(x.channel),source:sourceLabel(x.source)}))} columns={[[ 'channel','渠道'],['source','已记录入口'],['entry_scene','微信场景值'],['events','打开次数']]}/></section>
        <div className={styles.intro}><h2>哪些门店和酒款被用户浏览？</h2><p>先看主动打开次数，再看具体门店。这里的“打开”可以由同一个人重复产生。</p></div>
        <Metrics items={[[ '门店详情打开',eventCount('bar_opened'),'用户打开门店页面的次数'],['酒款详情打开',eventCount('beer_opened'),'用户打开酒款详情的次数'],['从上新卡片点入',eventCount('feed_item_opened'),'可能随后产生详情打开，不与前两项相加'],['有行为的安装标识',r.summary.installations,'包括匿名；同一个人可有多个标识']]}/>
        <section><h2>每天有多少主动浏览？</h2><p>门店打开 + 酒款打开。首尾日期只覆盖筛选时段，不宜直接与完整一天比较。</p><div className={styles.chart}>{daily.map(d=><div key={d.day} title={d.day_label}><span>{d.day.slice(5)}{d.day_label.includes('非完整')?'*':''}</span><div><i style={{width:`${d.detail_opens/Math.max(1,...daily.map(x=>x.detail_opens))*100}%`}} /></div><b>{number(d.detail_opens)}</b></div>)}</div><details className={styles.details}><summary>查看每日明细 · * 表示非完整日</summary><Table rows={daily} columns={[[ 'day_label','日期'],['beer_opens','酒款打开'],['bar_opens','门店打开'],['installations','安装标识数']]}/></details></section>
        <section><h2>门店浏览明细</h2><p>最多 50 家，默认显示前 10 家。当前顺序按门店打开、酒款打开与上新点击的事件总量排列；三列可能属于同一次浏览，不是客流排行榜。</p><Table preview={10} rows={venueRows} columns={[[ 'name','门店'],['bar_opens','门店打开'],['beer_opens','酒款打开'],['feed_opens','上新点击'],['installations','安装标识数']]}/></section>
        <section><h2>酒款浏览明细</h2><p>同一款酒在不同店分别统计；上新点击与详情打开可能来自同一次操作。最多 50 条。</p><Table preview={10} rows={r.beers.map(x=>({...x,venue_name:displayVenue(x.venue_name)}))} columns={[[ 'beer_name','酒款'],['venue_name','门店'],['detail_opens','详情打开'],['feed_opens','上新点击'],['installations','安装标识数']]}/></section>
        <details className={styles.details}><summary>补充明细：浏览城市与进入路径</summary>
          <section><h2>行为发生在哪个浏览城市？</h2><p>这是事件记录的页面所选城市，不是用户实际位置、常驻城市或门店所在地。“未记录浏览城市”表示当时未提供可用城市，不能按门店所在地回填。事件数包含卡片曝光。</p><Table rows={r.cities.map(x=>({...x,city:x.city==='unknown'?'未记录浏览城市':x.city}))} columns={[[ 'city','所选城市'],['events','事件总量（含曝光）'],['installations','安装标识数']]}/></section>
          <section><h2>从哪里进入？</h2><p>只展示已记录的入口，未知值不猜测。最多 50 条。</p><Table rows={r.sources.map(x=>({...x,name:labels[x.name]||x.name,source:sourceLabel(x.source)}))} columns={[[ 'name','行为'],['source','入口'],['events','次数']]}/></section>
        </details>
      </>}
      {tab==='feed' && <>
        <div className={styles.intro}><h2>上新卡片有没有吸引用户点开？</h2><p>“适合你的”按口味匹配，“全部上新”按上枪时间展示。先比较同一展示位置，再展开渠道和算法版本。</p></div>
        <Metrics items={[[ '卡片有效曝光',feedTotals.impressions,'卡片进入视野，满足客户端曝光条件'],['曝光后点开的卡片',feedTotals.opened_after_impression,'有曝光记录，且随后点开'],['曝光后点击率',clickRate(feedTotals),'曝光后点开 ÷ 有效曝光；不是人数转化率']]}/>
        <section><h2>适合你的 vs 全部上新</h2><p>按位置汇总当前筛选渠道与所有版本，点击率由总次数计算。两种模式的用户、酒款和使用场景不同，这不是随机实验，不能据此证明哪种算法更好。</p><Table rows={comparisons} columns={[[ 'surface_name','展示位置'],['mode_name','列表模式'],['impressions','有效曝光'],['opened_after_impression','曝光后点开'],['ctr','点击率']]}/><p>同一安装标识、同一次列表展示、同一卡片只计一次；重新进入列表可以再次计数。快速点开但未达到曝光时长的卡片，不进入这个点击率。</p></section>
        <details className={styles.details}><summary>查看渠道与排序版本明细（排查用）</summary><Table rows={r.feed.map(x=>({...x,application:channelLabel(x.application),mode:modeLabel(x.mode),surface:surfaceLabel(x.surface),ctr:clickRate(x)}))} columns={[[ 'application','渠道'],['mode','模式'],['surface','位置'],['ranking_version','排序版本'],['impressions','有效曝光'],['opened_items','所有点开卡片'],['opened_after_impression','曝光后点开'],['ctr','点击率']]}/></details>
        <section><h2>点开后，是否 TAP 了同店同款酒？</h2><p>只追踪能够关联账号的点击，并观察点击后 72 小时。尚未满 72 小时的记录仍可能出现后续 TAP，不能将当前比例当作最终转化率。</p><Table rows={r.feed_taps.map(x=>({...x,mode:modeLabel(x.mode)}))} columns={[[ 'mode','列表模式'],['identified_clicks','可关联账号的点击'],['mature_clicks','已观察满 72 小时'],['clicks_with_tap','后续出现 TAP 的点击'],['matched_taps','关联 TAP 记录']]}/><p>例如 9 次点击关联到 7 条 TAP，表示同一条 TAP 可能对应多个之前的点击；不是 9 次到店。各模式的关联 TAP 也可能重合。</p></section>
      </>}
      {tab==='business' && <>
        <div className={styles.intro}><h2>用户浏览之后，有没有留下饮酒记录？</h2><p>本页是全部渠道的业务事实，<strong>不受渠道筛选影响</strong>，仅按所选时间范围统计。它涵盖门店、酒款等浏览证据，不仅是 Feed 点击。</p></div>
        <Metrics items={[[ '新增 TAP 记录',r.business.taps.records,'新增门店饮酒记录，按创建时间统计'],['记录 TAP 的账号',r.business.taps.accounts,'跨设备按账号去重'],['浏览后 TAP 的访问组',r.business.assisted?.['72'],'72 小时内有前序浏览证据；不等于真实到店']]}/>
        <section><h2>“浏览后 TAP”怎么理解？</h2><p>同一账号先浏览门店或酒款，之后新增该店 TAP。系统把同账号、同门店、同一消费日的多条 TAP 合为一组；消费日从早上 06:00 开始。</p><p>这说明浏览与记录发生了关联。用户可能已经在店里，也可能事后补录，不能说是 No Menu 带来了这次消费。</p><Table rows={[24,48,72].map(hours=>({window:`往前看 ${hours} 小时`,visits:r.business.assisted?.[String(hours)]}))} columns={[[ 'window','TAP 前的浏览回溯范围'],['visits','关联访问组']]}/><p>三个范围层层包含，不能相加。归因最后计算于 {time(r.business.assisted_computed_at)}。</p></section>
        <section><h2>这些关联发生在哪些门店？</h2><Table preview={10} rows={r.business.venues.map((x:Row)=>({...x,name:displayVenue(x.name)}))} columns={[[ 'name','门店'],['visits','关联访问组（72 小时）'],['taps','这些组内的 TAP 记录']]}/></section>
        <div className={styles.notice}>原始事件保留 90 天，迟到上传会修订归因结果。当前结果仍可重算，暂不作为长期经营报表或已核实到店数量。</div>
      </>}
      {tab==='quality' && <>
        <div className={styles.intro}><h2>收到的数据能不能用于分析？</h2><p>这里检查已入库事件的延迟、账号关联和业务同步。它不是完整的服务器错误监控。</p></div>
        <div className={styles.notice}><strong>{projectionProblems.length ? '需要检查：部分业务数据缺失或同步超过 10 分钟。' : '业务数据同步在 10 分钟内。'}</strong> HTTP 503 / 5xx 尚未接入本页，不能据此判断所有接口正常。</div>
        <Metrics items={[[ '一半事件在此时间内收到',r.summary.delay_p50==null?'—':`${number(r.summary.delay_p50)} 秒`,'P50：从行为发生到服务器收到'],['95% 事件在此时间内收到',r.summary.delay_p95==null?'—':`${number(r.summary.delay_p95)} 秒`,'P95：包含排队和离线时间，不是 API 耗时'],['超过 1 小时才收到',r.summary.late_events,'条事件 · 包括离线补传'],['客户端时间晚于接收时间',r.summary.clock_skew_events,'条事件 · 需检查时钟，已排除延迟计算']]}/>
        <section><h2>业务数据同步</h2><p>全局状态，不受筛选影响；超过 10 分钟需排查同步任务。</p><Table rows={r.health.projections.map((x:Row)=>({...x,scope:x.scope==='catalog'?'门店与在枪酒款':x.scope==='consumer'?'TAP、关注与用户资料':x.scope,source:time(x.source_as_of),status:!Number.isFinite(Date.parse(x.source_as_of))||Date.parse(r.generated_at)-Date.parse(x.source_as_of)>600000?'需检查':'10 分钟内'}))} columns={[[ 'scope','数据源'],['source','源数据时间'],['status','同步状态']]}/><p>等待刷新榜单的任务：{number(r.health.queue.pending)} · 最早排队时间：{time(r.health.queue.oldest_at)}</p></section>
        <section><h2>有多少行为能关联到账号？</h2><p>未关联账号包含匿名访问，不等于关联接口失败；这里无法直接算接口成功率。</p><Metrics items={[[ '全部已入库事件',r.summary.events,'包含展示、曝光和点击'],['关联到的账号',r.summary.accounts,'不是安装标识数，也不是全部使用人数'],['浏览会话',r.summary.sessions,'同一安装标识 + session 去重']]}/><Table rows={r.identity.map(x=>({...x,identity_state:identityLabel(x.identity_state)}))} columns={[[ 'identity_state','账号关联状态'],['events','事件数']]}/></section>
        <section><h2>还不能从这个看板知道什么？</h2><Table rows={[{metric:'接口 503 / 5xx 与请求耗时',state:'尚未接入',reason:'需要查看服务日志与告警；有事件入库也可能同时有接口失败'}, {metric:'被拒绝 / 重复上传的批次',state:'尚未接入',reason:'事件表不是完整的接收结果日志'}, {metric:'手机尚未上传的事件',state:'服务器不可见',reason:'不能由零入库证明没有使用，也不能证明零丢失'}]} columns={[[ 'metric','问题'],['state','目前状态'],['reason','如何理解']]}/></section>
        <details className={styles.details}><summary>排查明细：每天和各渠道接收了哪些事件</summary><p>最近一次入选事件的接收时间：{time(r.summary.last_received_at)}。事件总量包含曝光。</p><Table rows={daily} columns={[[ 'day_label','日期'],['events','事件总量'],['installations','安装标识数'],['beer_opens','酒款打开'],['bar_opens','门店打开']]}/><Table rows={r.events.map(x=>({...x,application:channelLabel(x.application),name:labels[x.name]||x.name}))} columns={[[ 'application','渠道'],['name','事件类型'],['events','事件数'],['installations','安装标识数']]}/></details>
      </>}
      <footer>仅供平台内部使用 · 匿名与登录行为均计入已收到的事件 · 未隔离测试操作，勿直接对外发布数字。</footer>
    </>}
  </div>
}
