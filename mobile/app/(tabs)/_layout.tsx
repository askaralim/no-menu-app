import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { THEME } from '../../lib/theme'
import { useAuth } from '../../lib/authProvider'

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
  const { orderingEnabled } = useAuth()

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
          title: '点单',
          href: orderingEnabled ? '/(tabs)/' : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cart-outline" size={size} color={color} />
          ),
        }}
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
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="storefront-outline" size={size} color={color} />
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
