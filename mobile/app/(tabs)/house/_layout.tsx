import { Stack } from 'expo-router'
import { THEME } from '../../../lib/theme'

export default function HouseStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: THEME.background },
        animation: 'slide_from_right',
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="cup-sizes" />
      <Stack.Screen name="qr" />
      <Stack.Screen name="events" />
      <Stack.Screen name="event-edit" />
      <Stack.Screen name="more" />
      <Stack.Screen name="staff" />
      <Stack.Screen name="account" />
      <Stack.Screen name="change-password" />
      <Stack.Screen name="account-deletion" />
    </Stack>
  )
}
