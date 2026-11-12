'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import styles from './page.module.css'

type Row = Record<string, any>
type Report = { generated_at: string; scope: Row; summary: Row; daily: Row[]; events: Row[]; sources: Row[]; cities: Row[]; beers: Row[]; identity: Row[]; feed: Row[]; feed_taps: Row[]; venues: Row[]; business: Row; health: Row }
const origin = (process.env.NEXT_PUBLIC_INTELLIGENCE_ORIGIN || 'https://nomenuapp.com').replace(/\/$/, '')
const number = (v: any) => v == null ? '—' : Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 2 })
const time = (v: any) => v ? new Date(v).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '暂无'
const labels: Record<string, string> = { beer_opened: '酒款详情', bar_opened: '门店详情', search_result_opened: '搜索结果', activity_opened: '活动详情', map_navigation_clicked: '导航', feed_shown: 'Feed 展示', feed_item_impression: '卡片曝光', feed_item_opened: 'Feed 点击', city_changed: '切换城市' }
function Table({ rows, columns }: { rows: Row[]; columns: [string, string][] }) {
  return <div className={styles.tableWrap}><table><thead><tr>{columns.map(([k,l])=><th key={k}>{l}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i}>{columns.map(([k])=><td key={k}>{r[k] == null ? '—' : typeof r[k] === 'number' ? number(r[k]) : String(r[k])}</td>)}</tr>)}</tbody></table>{!rows.length && <p className={styles.empty}>此范围暂无记录。没有记录不等于没有使用。</p>}</div>
}
function Metrics({ items }: { items: [string, any, string][] }) {
  return <div className={styles.metrics}>{items.map(([label,value,hint])=><div key={label}><span>{label}</span><strong>{number(value)}</strong><small>{hint}</small></div>)}</div>
}
export default function IntelligencePage() {
  const [days,setDays]=useState('7'), [application,setApplication]=useState('all'), [tab,setTab]=useState('discovery')
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
  const daily = (r?.daily ?? []).map(d => {
    const start = Date.parse(`${d.day}T00:00:00+08:00`)
    const partial = start < Date.parse(r!.scope.from) || start + 86400000 > Date.parse(r!.scope.until)
    return { ...d, day: d.day, day_label: `${d.day}${partial ? '（非完整日）' : ''}`, detail_opens: d.beer_opens + d.bar_opens }
  })
  return <div className={styles.page}>
    <header className={styles.header}><div><span className={styles.eyebrow}>NO MENU · INTERNAL</span><h1>行为与 Feed 看板</h1><p>查看发现、点击与后续 TAP，核对数据采集质量。</p></div><button disabled={loading} onClick={()=>setRefresh(n=>n+1)}>{loading?'读取中…':'刷新数据'}</button></header>
    <div className={styles.filters}><label>时间范围 <select value={days} onChange={e=>setDays(e.target.value)}><option value="1">最近 24 小时</option><option value="7">最近 7 天</option><option value="30">最近 30 天</option></select></label><label>行为渠道 <select value={application} onChange={e=>setApplication(e.target.value)}><option value="all">全部渠道</option><option value="taplist">Taplist</option><option value="ios">iOS（历史标识）</option><option value="miniprogram">小程序</option><option value="unknown">未知渠道</option></select></label><span>北京时间 · 按行为发生时间统计</span></div>
    <nav className={styles.tabs} aria-label="数据视图">{[['discovery','发现与门店'],['feed','Feed 与 TAP'],['quality','数据质量']].map(([id,label])=><button key={id} aria-pressed={tab===id} onClick={()=>setTab(id)}>{label}</button>)}</nav>
    {error && <div role="alert" className={styles.error}><div><strong>数据暂时无法加载</strong><p>{error}</p></div><button onClick={()=>setRefresh(n=>n+1)}>重试</button></div>}
    {loading && <p role="status" className={styles.empty}>正在读取 ECS 聚合数据…</p>}
    {r && <>
      <p className={styles.stamp}>生成于 {time(r.generated_at)} · {time(r.scope.from)} — {time(r.scope.until)} · 服务端缓存最多 60 秒</p>
      {tab==='discovery' && <>
        <Metrics items={[[ '已入库事件',r.summary.events,'包含曝光与展示，不等于主动点击'],['观测设备',r.summary.installations,'安装标识去重，不等于人数'],['浏览会话',r.summary.sessions,'设备 + session 去重'],['已关联账号',r.summary.accounts,'仅统计身份已解析的账号']]}/>
        <section><h2>详情浏览趋势</h2><p>图表仅统计酒款打开 + 门店打开次数，不含 Feed 曝光或展示，不代表独立访客或到店。表格中的事件总量包含所有事件；首尾日期按筛选窗口截取，可能不是完整一天。</p><div className={styles.chart}>{daily.map(d=><div key={d.day} title={d.day_label}><span>{d.day.slice(5)}</span><div><i style={{width:`${d.detail_opens/Math.max(1,...daily.map(x=>x.detail_opens))*100}%`}} /></div><b>{number(d.detail_opens)}</b></div>)}</div><Table rows={daily} columns={[[ 'day_label','日期'],['events','事件总量（含曝光）'],['installations','安装标识数'],['beer_opens','酒款打开'],['bar_opens','门店打开']]}/></section>
        <section><h2>哪些门店获得了主动兴趣？</h2><p>Top 50 · 按门店、酒款与 Feed 点击总次数排列。同一次访问可能同时产生酒款打开和 Feed 点击，不应相加作为人数。</p><Table rows={r.venues} columns={[[ 'name','门店'],['bar_opens','门店打开'],['beer_opens','酒款打开'],['feed_opens','Feed 点击'],['installations','观测设备']]}/></section>
        <section><h2>哪些酒款被点开？</h2><p>Top 50 · 酒款 × 门店。名称来自当前目录，历史下架酒款可能只保留 ID；明细打开与 Feed 点击是不同事件，不应相加作为独立访问。</p><Table rows={r.beers} columns={[[ 'beer_name','酒款'],['venue_name','门店'],['detail_opens','详情打开'],['feed_opens','Feed 点击'],['installations','设备']]}/></section>
        <section><h2>用户正在浏览哪些城市？</h2><p>使用行为当时选择的城市，不等同于常驻城市或实际所在地；未知值不回填。</p><Table rows={r.cities} columns={[[ 'city','浏览城市'],['events','行为'],['installations','设备']]}/></section>
        <section><h2>兴趣来自哪里？</h2><Table rows={r.sources.map(x=>({...x,name:labels[x.name]||x.name}))} columns={[[ 'name','行为'],['source','入口 / surface'],['events','次数']]}/></section>
        <section><h2>各渠道收到什么行为？</h2><Table rows={r.events.map(x=>({...x,name:labels[x.name]||x.name}))} columns={[[ 'application','渠道'],['name','行为'],['events','次数'],['installations','设备']]}/></section>
      </>}
      {tab==='feed' && <>
        <section><h2>看见之后，有没有点开？</h2><p>按渠道、模式、位置和排序版本拆分。同一设备 × Feed instance × 酒款去重；点击率只计算已有曝光且后续点击的卡片。不是 A/B 因果结论。</p><Table rows={r.feed.map(x=>({...x,ctr:x.impressions?`${(100*x.opened_after_impression/x.impressions).toFixed(1)}%`:'—'}))} columns={[[ 'application','渠道'],['mode','模式'],['surface','位置'],['ranking_version','排序版本'],['impressions','曝光卡片'],['opened_items','点击卡片'],['opened_after_impression','曝光后点击'],['ctr','点击率']]}/></section>
        <section><h2>点开之后，有没有记录这款酒？</h2><p>仅已关联账号，同酒同店、点击后 72 小时内新增 TAP（created_at）。近期点击还未走完观察窗口；一条 TAP 可关联多个点击，不将其称为转化率或到店。</p><Table rows={r.feed_taps} columns={[[ 'mode','模式'],['identified_clicks','可关联点击'],['mature_clicks','已满 72h 点击'],['clicks_with_tap','后续有 TAP 的点击'],['matched_taps','关联 TAP（去重）']]}/></section>
        <div className={styles.notice}>以下业务事实始终为全部渠道，独立于上方渠道筛选。TAP 来自业务库投影，不能猜测其提交渠道。</div>
        <Metrics items={[[ '新增 TAP 记录',r.business.taps.records,'按 created_at 选取'],['TAP 账号',r.business.taps.accounts,'业务投影去重账号'],['24h 关联访问',r.business.assisted?.['24'],'Observed Assisted Visit'],['48h 关联访问',r.business.assisted?.['48'],'包含 24h，不能相加'],['72h 关联访问',r.business.assisted?.['72'],'包含 48h，不能相加']]}/>
        <section><h2>哪些门店出现了浏览 → TAP 关联？</h2><p>归因计算于 {time(r.business.assisted_computed_at)}。同账号、门店、06:00 划分的消费日聚合；回溯锚点为首次 TAP created_at。不是 GPS 到店或推荐带来的增量。</p><Table rows={r.business.venues} columns={[[ 'name','门店'],['visits','72h 关联访问'],['taps','这些访问内的 TAP']]}/></section>
        <div className={styles.notice}>原始事件仅保留 90 天；当前归因结果仍可重算，迟到事件会修订结果。此页用于内部观察，不作为已核实到店或商户业绩报表。</div>
      </>}
      {tab==='quality' && <>
        <Metrics items={[[ '上传延迟 P50',r.summary.delay_p50,'秒 · 接收时间 − 发生时间'],['上传延迟 P95',r.summary.delay_p95,'包含离线补传，不等于 API 耗时'],['超过 1h 补传',r.summary.late_events,'当前发生时间范围内的事件'],['时间倒置',r.summary.clock_skew_events,'单独列出，未计入延迟分位数']]}/>
        <section><h2>业务事实是否足够新鲜？</h2><p>全局状态，独立于筛选。超过 10 分钟需排查；数据新鲜不代表所有 API 正常。最后入选事件接收时间：{time(r.summary.last_received_at)}</p><Table rows={r.health.projections.map((x:Row)=>({...x,source:time(x.source_as_of),status:Date.parse(r.generated_at)-Date.parse(x.source_as_of)>600000?'已过期':'10 分钟内'}))} columns={[[ 'scope','数据源'],['source','源数据时间'],['status','新鲜度']]}/>{r.health.projections.length<2 && <p className={styles.notice}>缺少业务投影，请检查同步任务。</p>}<p>待刷新任务 {number(r.health.queue.pending)} · 最早等待 {time(r.health.queue.oldest_at)}</p></section>
        <section><h2>身份解析分布</h2><p>匿名是正常使用状态。此分布不能直接称为身份关联成功率；跨设备账号去重与设备去重也不能相加。</p><Table rows={r.identity} columns={[[ 'identity_state','解析状态'],['events','事件数']]}/></section>
        <section><h2>尚不可观测的部分</h2><Table rows={[{metric:'HTTP 503 / 5xx 与请求耗时',state:'未接入看板',reason:'目前在服务日志中，不能以事件入库数代替'}, {metric:'批次拒绝 / 重复上传',state:'未接入看板',reason:'当前事件表仅代表保留的事件，不保存完整接收结果计数'}, {metric:'手机尚未上传的队列',state:'服务器不可见',reason:'零入库不等于零使用，也无法由服务器证明零丢失'}]} columns={[[ 'metric','指标'],['state','状态'],['reason','说明']]}/></section>
      </>}
      <footer>仅供平台内部使用 · 不展示用户、设备或会话明细 · 匿名与登录行为均纳入已收到的事件 · 未单独隔离测试账号，勿直接对外发布数字。</footer>
    </>}
  </div>
}
