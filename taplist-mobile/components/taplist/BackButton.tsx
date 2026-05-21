import FontAwesome from '@expo/vector-icons/FontAwesome'
import { router } from 'expo-router'
import { Pressable, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { palette } from '@/constants/design'

export function BackButton() {
  const insets = useSafeAreaInsets()

  return (
    <Pressable
      accessibilityLabel="返回"
      hitSlop={10}
      onPress={() => {
        if (router.canGoBack()) {
          router.back()
        } else {
          router.replace('/')
        }
      }}
      style={({ pressed }) => [
        styles.button,
        { top: insets.top + 14 },
        pressed && styles.buttonPressed,
      ]}>
      <FontAwesome name="chevron-left" size={16} color={palette.text} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    left: 16,
    zIndex: 10,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17,17,17,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(245,241,230,0.14)',
  },
  buttonPressed: {
    transform: [{ scale: 0.96 }],
  },
})
