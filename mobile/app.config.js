/**
 * Bridges EAS / CI env into the native bundle. EAS "production" may only define
 * NEXT_PUBLIC_* (from a shared monorepo); the app reads EXPO_PUBLIC_* in code.
 * Values are copied into `extra` at config-eval time so they are always embedded.
 */
const { expo } = require('./app.json')

module.exports = ({ config } = {}) => {
  const ios = { ...(expo.ios || {}), ...(config?.ios || {}) }
  const android = { ...(expo.android || {}), ...(config?.android || {}) }

  return {
    ...config,
    ...expo,
    ios: {
      ...ios,
      // EAS reads this path; must never be undefined (avoids ITSAppUsesNonExemptEncryption crash)
      infoPlist: {
        ...(config?.ios?.infoPlist || {}),
        ...(expo.ios?.infoPlist || {}),
        ITSAppUsesNonExemptEncryption: false,
        CFBundleDevelopmentRegion: 'zh-Hans',
        NSPhotoLibraryUsageDescription:
          ios.infoPlist?.NSPhotoLibraryUsageDescription ||
          'No Menu Tonight 需要访问相册，以便你为酒款选择并上传图片到今晚酒单。',
        NSPhotoLibraryAddUsageDescription:
          ios.infoPlist?.NSPhotoLibraryAddUsageDescription ||
          'No Menu Tonight 需要访问相册，以便保存酒款图片和门店二维码。',
        // Allow HTTP to local Supabase API (127.0.0.1 / LAN) during dev
        NSAppTransportSecurity: {
          NSAllowsLocalNetworking: true,
        },
      },
    },
    android: {
      ...android,
      // HTTP to local Supabase on Android dev builds
      usesCleartextTraffic: true,
    },
    extra: {
      ...(config?.extra || {}),
      ...expo.extra,
      supabaseUrl:
        process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      supabaseAnonKey:
        process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    },
  }
}
