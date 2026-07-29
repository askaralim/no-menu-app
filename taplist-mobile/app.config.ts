import type { ConfigContext, ExpoConfig } from 'expo/config';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const appJson = require('./app.json') as { expo: ExpoConfig };

function envFirst(...keys: string[]): string {
  for (const key of keys) {
    const v = process.env[key]?.trim();
    if (v) return v;
  }
  return '';
}

/**
 * Merges static `app.json` with env-driven `extra` and local-dev networking.
 * Bridges EXPO_PUBLIC_* and NEXT_PUBLIC_* (shared monorepo / EAS production secrets).
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const base = appJson.expo;

  const supabaseUrl = envFirst('EXPO_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL');
  const supabaseAnonKey = envFirst(
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY'
  );
  const privacyPolicyUrl = envFirst(
    'EXPO_PUBLIC_PRIVACY_POLICY_URL',
    'NEXT_PUBLIC_PRIVACY_POLICY_URL'
  ) || 'https://nomenuapp.com/privacy';
  const posthogApiKey = envFirst('EXPO_PUBLIC_POSTHOG_API_KEY', 'NEXT_PUBLIC_POSTHOG_API_KEY');
  const posthogHost =
    envFirst('EXPO_PUBLIC_POSTHOG_HOST', 'NEXT_PUBLIC_POSTHOG_HOST') ||
    'https://us.i.posthog.com';
  const posthogDebug =
    envFirst('EXPO_PUBLIC_POSTHOG_DEBUG', 'NEXT_PUBLIC_POSTHOG_DEBUG') === 'true';

  return {
    ...config,
    ...base,
    ios: {
      ...base.ios,
      infoPlist: {
        ...base.ios?.infoPlist,
        ITSAppUsesNonExemptEncryption: false,
        NSPhotoLibraryUsageDescription: 'No Menu 需要访问相册权限以保存酒单图片。',
        NSPhotoLibraryAddUsageDescription: 'No Menu 需要保存酒单图片到你的相册。',
        NSAppTransportSecurity: {
          NSAllowsLocalNetworking: true,
        },
      },
    },
    android: {
      ...base.android,
      // @ts-expect-error -- cleartext for local Supabase HTTP on Android dev builds
      usesCleartextTraffic: true,
    },
    extra: {
      ...((base.extra as Record<string, unknown>) ?? {}),
      supabaseUrl,
      supabaseAnonKey,
      privacyPolicyUrl,
      posthogApiKey,
      posthogHost,
      posthogDebug,
    },
  };
};
