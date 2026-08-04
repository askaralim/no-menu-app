import { Redirect } from 'expo-router'

/** Legacy tab route → house stack (enables swipe-back). */
export default function EventsRedirect() {
  return <Redirect href="/(tabs)/house/events" />
}
