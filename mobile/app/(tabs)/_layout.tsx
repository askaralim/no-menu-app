import { Tabs } from 'react-native-safe-area-context' // Wait, expo-router has its own Tabs
// Will correct this
import { Tabs } from 'expo-router'
import { StyleSheet, View } from 'react-native'

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: '#060913' },
        headerTintColor: '#D4AF37',
        tabBarStyle: {
          backgroundColor: '#060913',
          borderTopColor: '#1E2336',
        },
        tabBarActiveTintColor: '#D4AF37',
        tabBarInactiveTintColor: '#888',
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: 'Manage Menu',
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
        }}
      />
    </Tabs>
  )
}
