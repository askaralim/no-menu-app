import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { THEME } from '../../lib/theme'
import { useAuth } from '../../lib/authProvider'
import {
  getUnseenMerchantUpdate,
  latestMerchantUpdate,
  subscribeMerchantUpdateSeen,
} from '../../lib/merchantUpdates'

/** Nested stack tabs: tapping the tab always returns to that stack's root. */
function popStackToRoot(
  navigation: {
    navigate: (name: string, params?: { screen: string }) => void
  },
  tabName: string,
) {
  return {
    tabPress: (e: { preventDefault: () => void }) => {
      e.preventDefault()
      navigation.navigate(tabName, { screen: 'index' })
    },
  }
}

export default function TabLayout() {
  const { user, role, orderingEnabled } = useAuth()
  const [hasUnseenMerchantUpdate, setHasUnseenMerchantUpdate] = useState(false)

  useEffect(() => {
    let active = true
    let requestId = 0
    const currentUserId = user?.id
    const currentUpdateId = latestMerchantUpdate(role)?.id
    setHasUnseenMerchantUpdate(false)
    const checkForUpdate = async () => {
      const currentRequestId = ++requestId
      const update = await getUnseenMerchantUpdate(currentUserId, role)
      if (active && currentRequestId === requestId) {
        setHasUnseenMerchantUpdate(update != null)
      }
    }

    void checkForUpdate()
    const unsubscribe = subscribeMerchantUpdateSeen((seenUserId, seenUpdateId) => {
      if (seenUserId !== currentUserId || seenUpdateId !== currentUpdateId) return
      requestId += 1
      setHasUnseenMerchantUpdate(false)
    })

    return () => {
      active = false
      requestId += 1
      unsubscribe()
    }
  }, [role, user?.id])

  return (
    <Tabs
      initialRouteName="taplist"
      screenOptions={{
        // Pages own their hero titles; native header duplicated "商品库/门店" etc.
        headerShown: false,
        tabBarStyle: {
          backgroundColor: THEME.background,
          borderTopColor: THEME.borderFaint,
        },
        tabBarActiveTintColor: THEME.gold,
        tabBarInactiveTintColor: THEME.muted,
      }}>
      <Tabs.Screen
        name="taplist"
        options={{
          title: '酒单',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="sparkles-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: '商品库',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="wine-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: '开台',
          href: orderingEnabled ? '/(tabs)/' : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cart-outline" size={size} color={color} />
          ),
        }}
        listeners={({ navigation }) => popStackToRoot(navigation, 'index')}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: '订单',
          href: orderingEnabled ? '/(tabs)/orders' : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="receipt-outline" size={size} color={color} />
          ),
        }}
        listeners={({ navigation }) => popStackToRoot(navigation, 'orders')}
      />
      <Tabs.Screen
        name="house"
        options={{
          title: '门店',
          tabBarAccessibilityLabel: hasUnseenMerchantUpdate ? '门店，有新功能' : '门店',
          tabBarIcon: ({ color, size }) => (
            <View style={styles.houseTabIcon}>
              <Ionicons name="storefront-outline" size={size} color={color} />
              {hasUnseenMerchantUpdate ? <View style={styles.merchantUpdateDot} /> : null}
            </View>
          ),
        }}
        listeners={({ navigation }) => popStackToRoot(navigation, 'house')}
      />
      <Tabs.Screen
        name="more"
        options={{
          // Hidden from tab bar — open from 门店 → 经营数据. Account actions live on 门店.
          href: null,
          title: '经营数据',
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          href: null,
          title: '活动',
        }}
      />
      <Tabs.Screen
        name="event-edit"
        options={{
          href: null,
          title: '编辑活动',
        }}
      />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  houseTabIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  merchantUpdateDot: {
    position: 'absolute',
    top: 1,
    right: 1,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: THEME.background,
    backgroundColor: THEME.gold,
  },
})
