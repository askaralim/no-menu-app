import catalogJson from '@/assets/data/style-localization-v1.2.json'

type Language = 'zh' | 'en'
type StyleKeyEntry = {
  zh: string
  en: string
  granularity: 'broad' | 'specific'
  fallback_approved: boolean
}

type Catalog = {
  style_keys: Record<string, StyleKeyEntry>
}

export type RecommendationReasonEvidence = {
  candidate_style_key: string
  candidate_style_label: string
  candidate_granularity: 'broad' | 'specific'
  matched_unique_taps: number
  total_unique_taps: number
  matched_percentage: number
  witnesses: Array<{
    style_key: string
    style_label: string
    granularity: 'broad' | 'specific'
    unique_taps: number
  }>
}

export type RecommendationReason = {
  code: string
  text: string
  version?: string
  evidence?: RecommendationReasonEvidence
}

const catalog = catalogJson as Catalog

export function localizeBeerStyle(
  rawStyle: string | null | undefined,
  language: Language,
  serverStyleEn?: string | null,
): string {
  const raw = rawStyle?.trim() ?? ''
  if (language === 'zh' || !raw) return raw
  return serverStyleEn?.trim() || raw
}

export function localizeRecommendationReason(
  reason: RecommendationReason | null | undefined,
  language: Language,
): string {
  if (!reason) return ''
  if (language === 'zh') return reason.text
  if (reason.version !== 'e1-reason-v2' || !isValidEvidence(reason.evidence)) return reason.text

  const evidence = reason.evidence
  const count = evidence.matched_unique_taps
  const beer = count === 1 ? 'beer' : 'beers'
  if (reason.code === 'style_exact') {
    const style = catalog.style_keys[evidence.candidate_style_key]
    if (!style || style.granularity !== evidence.candidate_granularity
      || evidence.witnesses.length !== 1
      || evidence.witnesses[0].style_key !== evidence.candidate_style_key) return reason.text
    return `Matches your ${count} logged ${style.en} ${beer}.`
  }
  if (reason.code === 'style_bridge') {
    if (evidence.witnesses.some((witness) => witness.style_key === evidence.candidate_style_key)) return reason.text
    const labels = evidence.witnesses
      .map((witness) => catalog.style_keys[witness.style_key]?.en)
      .filter((label): label is string => Boolean(label))
    if (labels.length !== evidence.witnesses.length) return reason.text
    return `Related to ${count} ${beer} you logged: ${formatStyleList(labels)}.`
  }
  return reason.text
}

function isValidEvidence(evidence?: RecommendationReasonEvidence): evidence is RecommendationReasonEvidence {
  if (!evidence
    || !Number.isSafeInteger(evidence.matched_unique_taps)
    || evidence.matched_unique_taps < 1
    || !Number.isSafeInteger(evidence.total_unique_taps)
    || evidence.total_unique_taps < evidence.matched_unique_taps
    || !Array.isArray(evidence.witnesses)
    || evidence.witnesses.length < 1
    || evidence.witnesses.some((witness) => !Number.isSafeInteger(witness.unique_taps) || witness.unique_taps < 1)) return false
  return evidence.witnesses.reduce((total, witness) => total + witness.unique_taps, 0) === evidence.matched_unique_taps
}

function formatStyleList(labels: string[]): string {
  const unique = [...new Set(labels)]
  if (unique.length === 1) return unique[0]
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`
  return `${unique[0]}, ${unique[1]}, and ${unique.length - 2} other related styles`
}
