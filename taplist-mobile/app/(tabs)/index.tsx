import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, FlatList, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { DEFAULT_TAPLIST_CITY } from '@/constants/taplist';
import { fetchPublicBars } from '@/lib/api/taplist';
import type { PublicBarRow } from '@/lib/types';

export default function DiscoverScreen() {
  const configured =
    !!process.env.EXPO_PUBLIC_SUPABASE_URL && !!process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

  const barsQuery = useQuery({
    queryKey: ['taplist', 'bars', DEFAULT_TAPLIST_CITY],
    queryFn: () => fetchPublicBars(DEFAULT_TAPLIST_CITY),
    enabled: configured,
  })

  if (!configured) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Tap List</Text>
        <Text style={styles.muted}>
          Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (see .env.example), then
          restart Expo.
        </Text>
      </View>
    )
  }

  if (barsQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>Loading bars…</Text>
      </View>
    )
  }

  if (barsQuery.isError) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Could not load bars</Text>
        <Text style={styles.muted}>
          {(barsQuery.error as Error)?.message ?? 'Unknown error'}. Apply Tap List SQL from
          docs/taplist_mvp_schema_sql.md if RPCs are missing.
        </Text>
      </View>
    )
  }

  const bars = barsQuery.data ?? []

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{DEFAULT_TAPLIST_CITY}</Text>
      <FlatList<PublicBarRow>
        data={bars}
        keyExtractor={(item) => item.id}
        contentContainerStyle={bars.length === 0 ? styles.center : undefined}
        ListEmptyComponent={
          <Text style={styles.muted}>No public bars yet. Publish a tenant and drinks in Supabase.</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.barName}>{item.display_name}</Text>
            {item.district ? <Text style={styles.muted}>{item.district}</Text> : null}
            <Text style={styles.slug}>slug: {item.slug}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  heading: { fontSize: 22, fontWeight: '700', marginBottom: 12 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  muted: { opacity: 0.7, textAlign: 'center' },
  card: {
    padding: 14,
    borderRadius: 10,
    marginBottom: 10,
    backgroundColor: 'rgba(128,128,128,0.12)',
  },
  barName: { fontSize: 17, fontWeight: '600' },
  slug: { fontSize: 12, opacity: 0.5, marginTop: 4 },
})
