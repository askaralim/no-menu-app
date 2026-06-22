import { StyleSheet } from 'react-native'

import {
  BEER_CARD_ARTWORK_WIDTH,
  BEER_CARD_BORDER,
  BEER_CARD_MIN_HEIGHT,
  BEER_CARD_RADIUS,
} from '@/components/taplist/railCardStyle'
import { palette, spacing, typography } from '@/constants/design'

const artworkCornerRadius = {
  borderTopLeftRadius: BEER_CARD_RADIUS,
  borderBottomLeftRadius: BEER_CARD_RADIUS,
}

export const listCapsuleCardStyles = StyleSheet.create({
  card: {
    borderRadius: BEER_CARD_RADIUS,
    overflow: 'hidden',
    backgroundColor: palette.panelElevated,
    shadowColor: palette.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 2,
  },
  borderOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BEER_CARD_RADIUS,
    borderWidth: 1,
    borderColor: BEER_CARD_BORDER,
  },
  cardPressed: {
    opacity: 0.82,
  },
  cardSoldOut: {
    opacity: 0.55,
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: BEER_CARD_MIN_HEIGHT,
  },
  artworkFrame: {
    width: BEER_CARD_ARTWORK_WIDTH,
    alignSelf: 'stretch',
    overflow: 'hidden',
    backgroundColor: palette.panelElevated,
    ...artworkCornerRadius,
  },
  artwork: {
    ...StyleSheet.absoluteFillObject,
  },
  artworkSpacer: {
    width: BEER_CARD_ARTWORK_WIDTH,
    alignSelf: 'stretch',
    flexShrink: 0,
  },
  panel: {
    flex: 1,
    minWidth: 0,
    minHeight: BEER_CARD_MIN_HEIGHT,
    overflow: 'hidden',
    borderTopRightRadius: BEER_CARD_RADIUS,
    borderBottomRightRadius: BEER_CARD_RADIUS,
  },
  panelContent: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xxs,
  },
})

export const listCapsuleTitleStyle = {
  ...typography.title,
  color: palette.text,
  fontSize: 21,
  lineHeight: 27,
  fontWeight: '600' as const,
  flexShrink: 1,
}

export const listCapsuleMetaStyle = {
  ...typography.micro,
  color: 'rgba(245,241,232,0.76)',
  flex: 1,
  minWidth: 0,
}

export const listCapsuleSecondaryStyle = {
  ...typography.micro,
  color: palette.faint,
  marginTop: 2,
}

export const listCapsuleVenueStyle = {
  ...typography.micro,
  color: palette.muted,
}
