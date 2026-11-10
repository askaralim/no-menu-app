import { reasonLabels } from './reason-labels.js'

export const REASON_VERSION = 'e1-reason-v2'

// Called only while building a snapshot, with the exact same deduplicated profile as ranking.
export function e1Reason(match, profile, bundle) {
  const candidate = reasonLabels[match.style_key]
  const total = profile.count
  if (!candidate || !Number.isSafeInteger(total) || total < 1 || ![0,1].includes(match.tier) ||
      !Array.isArray(match.witnesses) || !match.witnesses.length ||
      new Set(match.witnesses).size !== match.witnesses.length) throw Error('Invalid reason evidence')
  const witnesses = match.witnesses.map(key => {
    const label = reasonLabels[key], count = profile.counts.get(key)
    if (!label || !Number.isSafeInteger(count) || count < 1 ||
        (match.tier === 0 ? key !== match.style_key : !bundle.historiesFor(match.style_key).includes(key))) {
      throw Error('Invalid reason witness')
    }
    return {style_key:key,style_label:label.label,granularity:label.granularity,unique_taps:count}
  })
  const matched = witnesses.reduce((n,w)=>n+w.unique_taps,0)
  if (matched !== match.evidence_count || matched > total ||
      (match.tier === 0 && witnesses.length !== 1) ||
      (match.tier === 1 && profile.counts.has(match.style_key))) throw Error('Inconsistent reason evidence')
  let text = `你记录过${matched}款${candidate.label}`
  if (match.tier === 1) {
    text = `你记录过${witnesses.map(w=>`${w.unique_taps}款${w.style_label}`).join('、')}，这款是关联风格`
    if ([...text].length > 60) text = `参考你记录过的${matched}款酒、${witnesses.length}种历史风格，提供关联风格选择`
  }
  return {
    code:match.tier === 0 ? 'style_exact' : 'style_bridge', version:REASON_VERSION, text,
    evidence:{candidate_style_key:match.style_key,candidate_style_label:candidate.label,
      candidate_granularity:candidate.granularity,matched_unique_taps:matched,total_unique_taps:total,
      matched_percentage:matched / total * 100,witnesses},
  }
}
