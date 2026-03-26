import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { supabase } from '../../lib/supabase'

export default function SettingsScreen() {
  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>

      <TouchableOpacity style={styles.button} onPress={handleLogout}>
        <Text style={styles.buttonText}>Log Out</Text>
      </TouchableOpacity>
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
    marginBottom: 32,
  },
  button: {
    backgroundColor: '#1E2336',
    borderWidth: 1,
    borderColor: '#ff3b30',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ff3b30',
    fontSize: 16,
    fontWeight: 'bold',
  }
})
