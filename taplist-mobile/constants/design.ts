import { Platform } from 'react-native'

const chineseFont = Platform.select({
  ios: 'PingFang SC',
  android: 'sans-serif',
  default: 'PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif',
})

export const palette = {
  background: '#0D0D0D',
  panel: '#111111',
  panelElevated: '#151515',
  bgSoft: '#1B1A17',
  line: '#2A251D',
  hairline: 'rgba(245,241,230,0.08)',
  text: '#F5F1E8',
  muted: '#BBB2A1',
  faint: '#7C7467',
  amber: '#D39A45',
  gold: '#B88A3D',
  goldMuted: '#9F7A3D',
  bronze: '#7C5638',
  copper: '#A8663F',
  tungsten: '#C6A875',
  olive: '#9CA85A',
  darkOlive: '#343A28',
  black: '#000000',
}

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
}

export const typography = {
  display: {
    fontFamily: 'BebasNeue_400Regular',
    letterSpacing: 1.5,
  },
  displayXL: {
    fontFamily: 'BebasNeue_400Regular',
    fontSize: 78,
    lineHeight: 78,
    letterSpacing: 1.5,
  },
  displayL: {
    fontFamily: 'BebasNeue_400Regular',
    fontSize: 44,
    lineHeight: 50,
    letterSpacing: 1.2,
  },
  headline: {
    fontFamily: chineseFont,
    fontSize: 26,
    lineHeight: 34,
    fontWeight: '500' as const,
  },
  title: {
    fontFamily: chineseFont,
    fontSize: 18,
    lineHeight: 25,
    fontWeight: '500' as const,
  },
  body: {
    fontFamily: chineseFont,
    fontSize: 15,
    lineHeight: 23,
  },
  caption: {
    fontFamily: chineseFont,
    fontSize: 13,
    lineHeight: 19,
  },
  micro: {
    fontFamily: chineseFont,
    fontSize: 11,
    lineHeight: 15,
  },
  mono: {
    fontFamily: chineseFont,
    fontWeight: '500' as const,
  },
  label: {
    fontFamily: chineseFont,
    fontWeight: '500' as const,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
  },
}
