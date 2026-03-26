import React, { useState } from 'react'
import { Alert, StyleSheet, View, TextInput, TouchableOpacity, Text, KeyboardAvoidingView, Platform } from 'react-native'
import { supabase } from '../../lib/supabase'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function signInWithEmail() {
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    })

    if (error) Alert.alert('Sign in failed', error.message)
    setLoading(false)
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.headerTitle}>Bar Console</Text>
        <Text style={styles.headerSubtitle}>Staff & Management Login</Text>
      </View>

      <View style={styles.formContainer}>
        <TextInput
          style={styles.input}
          onChangeText={(text) => setEmail(text)}
          value={email}
          placeholder="Email"
          placeholderTextColor="#888"
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={styles.input}
          onChangeText={(text) => setPassword(text)}
          value={password}
          secureTextEntry
          placeholder="Password"
          placeholderTextColor="#888"
          autoCapitalize="none"
        />
        <TouchableOpacity style={styles.button} disabled={loading} onPress={signInWithEmail}>
          <Text style={styles.buttonText}>{loading ? 'Logging in...' : 'Sign In'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#060913',
    justifyContent: 'center',
    padding: 24,
  },
  headerContainer: {
    marginBottom: 48,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#D4AF37',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#888',
  },
  formContainer: {
    width: '100%',
  },
  input: {
    backgroundColor: '#1E2336',
    color: '#FFF',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#D4AF37',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
})
