import AsyncStorage from '@react-native-async-storage/async-storage'
import { getLocales } from 'expo-localization'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Language = 'zh' | 'en'
export type LanguagePreference = 'auto' | Language

const STORAGE_KEY = 'nomenu.language'

type Copy = {
  tonight: string; search: string; mine: string; selectCity: string; close: string
  publicVenues: (count: number) => string; language: string; followSystem: string
  chinese: string; english: string; loading: string; retry: string; back: string
  origin: string; brewery: string; style: string; available: string; comingSoon: string
  recentlySoldOut: string; follow: string; following: string; tried: string; undo: string
  noResults: string; settings: string; about: string; editProfile: string
}

const copy: Record<Language, Copy> = {
  zh: {
    tonight: '今晚', search: '搜索', mine: '我的', selectCity: '选择城市', close: '关闭',
    publicVenues: (count: number) => `${count} 家公开酒吧`, language: '语言', followSystem: '跟随系统',
    chinese: '中文', english: 'English', loading: '正在加载', retry: '重试', back: '返回',
    origin: '产地', brewery: '酒厂', style: '风格', available: '在售', comingSoon: '即将上新',
    recentlySoldOut: '最近售罄', follow: '关注', following: '已关注', tried: '喝过', undo: '撤销',
    noResults: '没有找到结果', settings: '设置', about: '关于 No Menu', editProfile: '编辑昵称',
  },
  en: {
    tonight: 'Tonight', search: 'Search', mine: 'Mine', selectCity: 'Select city', close: 'Close',
    publicVenues: (count: number) => `${count} public venue${count === 1 ? '' : 's'}`, language: 'Language', followSystem: 'Follow system',
    chinese: '中文', english: 'English', loading: 'Loading', retry: 'Retry', back: 'Back',
    origin: 'Origin', brewery: 'Brewery', style: 'Style', available: 'Available', comingSoon: 'Coming soon',
    recentlySoldOut: 'Recently sold out', follow: 'Follow', following: 'Following', tried: 'Tried', undo: 'Undo',
    noResults: 'No results found', settings: 'Settings', about: 'About No Menu', editProfile: 'Edit profile',
  },
} as const

function systemLanguage(): Language {
  const code = getLocales()[0]?.languageTag ?? 'zh'
  return /^zh(?:-|$)/i.test(code) ? 'zh' : 'en'
}

type LanguageContextValue = {
  language: Language
  preference: LanguagePreference
  setPreference: (value: LanguagePreference) => Promise<void>
  text: Copy
  localized: (primary?: string | null, english?: string | null) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<LanguagePreference>('auto')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'zh' || stored === 'en') setPreferenceState(stored)
      setReady(true)
    })
  }, [])

  const language = preference === 'auto' ? systemLanguage() : preference
  const setPreference = useCallback(async (value: LanguagePreference) => {
    setPreferenceState(value)
    if (value === 'auto') await AsyncStorage.removeItem(STORAGE_KEY)
    else await AsyncStorage.setItem(STORAGE_KEY, value)
  }, [])
  const localized = useCallback((primary?: string | null, english?: string | null) => {
    if (language === 'en' && english?.trim()) return english.trim()
    return primary?.trim() ?? ''
  }, [language])
  const value = useMemo(() => ({ language, preference, setPreference, text: copy[language], localized }), [language, localized, preference, setPreference])

  if (!ready) return null
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const value = useContext(LanguageContext)
  if (!value) throw new Error('useLanguage must be used inside LanguageProvider')
  return value
}

export function localizedLocation(
  language: Language,
  value: {
    country?: string | null
    country_en?: string | null
    origin_region?: string | null
    origin_region_en?: string | null
    origin_city?: string | null
    origin_city_en?: string | null
  },
) {
  const country = language === 'en' ? value.country_en || value.country : value.country
  const region = language === 'en' ? value.origin_region_en || value.origin_region : value.origin_region
  const city = language === 'en' ? value.origin_city_en || value.origin_city : value.origin_city
  const seen = new Set<string>()
  return [country, city || region].map((item) => item?.trim()).filter((item): item is string => {
    if (!item) return false
    const key = item.toLocaleLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).join(' · ')
}

export function tr(language: Language, chinese: string, english: string) {
  return language === 'en' ? english : chinese
}
