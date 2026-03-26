import { View, Text, StyleSheet } from 'react-native'

export default function MenuScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Manage Menu</Text>
      <Text style={styles.subtitle}>Menu item management will appear here.</Text>
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
  }
})
