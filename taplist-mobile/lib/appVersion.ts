import Constants from 'expo-constants'

/** User-facing app version from Expo config or native runtime. */
export function formatAppVersionLabel(): string {
  const version =
    Constants.expoConfig?.version?.trim() || Constants.nativeAppVersion?.trim() || ''
  const build =
    Constants.nativeBuildVersion?.trim() ||
    Constants.expoConfig?.ios?.buildNumber?.trim() ||
    ''

  if (!version) return '—'
  return build ? `${version} (${build})` : version
}
