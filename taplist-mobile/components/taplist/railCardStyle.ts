export const EVENT_RAIL_CARD_WIDTH = 168
export const EVENT_RAIL_CARD_HEIGHT = 110
export const RAIL_CARD_WIDTH = 168
export const RAIL_CARD_HEIGHT = 126
export const RAIL_CARD_GAP = 16
export const RAIL_CARD_RADIUS = 16

export const RAIL_CARD_BORDER = 'transparent'
export const RAIL_CARD_IMAGE_BORDER = RAIL_CARD_BORDER

export const RAIL_IMAGE_SCRIM_COLORS: [string, string, string] = [
  'rgba(13,13,13,0.12)',
  'rgba(13,13,13,0.72)',
  'rgba(13,13,13,0.98)',
]

export const RAIL_IMAGE_SCRIM_LOCATIONS: [number, number, number] = [0, 0.5, 1]

export const RAIL_TEXT_ONLY_SCRIM_COLORS: [string, string, string] = [
  'rgba(75,54,31,0.32)',
  'rgba(13,13,13,0.58)',
  'rgba(13,13,13,0.90)',
]

export const RAIL_TEXT_ONLY_SCRIM_LOCATIONS: [number, number, number] = [0, 0.58, 1]

export const RAIL_VENUE_PILL_BACKGROUND = 'rgba(8,8,8,0.76)'
export const RAIL_VENUE_PILL_BORDER = 'rgba(245,241,230,0.16)'
export const RAIL_VENUE_PILL_TEXT = 'rgba(214,202,184,0.86)'
export const RAIL_TEXT_SHADOW = {
  textShadowColor: 'rgba(0,0,0,0.8)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 3,
}

export const RAIL_CARD_CONTENT_PADDING_HORIZONTAL = 12
export const RAIL_CARD_CONTENT_PADDING_TOP = 10
export const RAIL_CARD_CONTENT_PADDING_BOTTOM = 10

export const railCardScrimStyle = {
  flex: 1,
  justifyContent: 'flex-end' as const,
  alignItems: 'flex-start' as const,
  paddingHorizontal: RAIL_CARD_CONTENT_PADDING_HORIZONTAL,
  paddingTop: RAIL_CARD_CONTENT_PADDING_TOP,
  paddingBottom: RAIL_CARD_CONTENT_PADDING_BOTTOM,
}

export const railCardBodyStyle = {
  alignSelf: 'stretch' as const,
  minWidth: 0,
  alignItems: 'flex-start' as const,
}

export const railVenueBadgeStyle = {
  alignSelf: 'flex-start' as const,
  backgroundColor: RAIL_VENUE_PILL_BACKGROUND,
  paddingHorizontal: 8,
  paddingVertical: 4,
  borderRadius: 4,
  overflow: 'hidden' as const,
  borderWidth: 1,
  borderColor: RAIL_VENUE_PILL_BORDER,
  maxWidth: '100%' as const,
  marginTop: 4,
}

export const railVenueLabelStyle = {
  fontSize: 10,
  lineHeight: 13,
  letterSpacing: 1.5,
  color: RAIL_VENUE_PILL_TEXT,
}
