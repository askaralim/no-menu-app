import { View, Text, StyleSheet } from 'react-native'
import { useAuth } from '../../lib/authProvider'

export default function DashboardScreen() {
  const { session, tenantId } = useAuth()

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bar Dashboard</Text>
      <Text style={styles.subtitle}>Welcome back, {session?.user?.email}</Text>
      
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Active Tenant ID</Text>
        <Text style={styles.cardValue}>{tenantId || 'Loading or Not Assigned...'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Today's Overview</Text>
        <Text style={styles.cardSubtitle}>Analytics and orders will appear here once connected to the multi-tenant database.</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#060913',
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    marginBottom: 32,
  },
  card: {
    backgroundColor: '#1E2336',
    padding: 24,
    borderRadius: 12,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 14,
    color: '#D4AF37',
    textTransform: 'uppercase',
    fontWeight: '600',
    marginBottom: 8,
  },
  cardValue: {
    fontSize: 16,
    color: '#FFF',
    fontFamily: 'Courier',
  },
  cardSubtitle: {
    fontSize: 16,
    color: '#FFF',
    lineHeight: 24,
  }
})
