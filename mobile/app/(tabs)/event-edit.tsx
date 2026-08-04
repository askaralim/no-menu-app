import { Redirect, useLocalSearchParams } from 'expo-router'

/** Legacy tab route → house stack. */
export default function EventEditRedirect() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const href = id ? `/(tabs)/house/event-edit?id=${id}` : '/(tabs)/house/event-edit'
  return <Redirect href={href as any} />
}
