import React from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs } from 'expo-router';

import { palette } from '@/constants/design';
import { useLanguage } from '@/lib/i18n';

function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={21} style={{ marginBottom: -2 }} {...props} />;
}

export default function TabLayout() {
  const { text } = useLanguage();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: palette.amber,
        tabBarInactiveTintColor: palette.faint,
        tabBarStyle: {
          backgroundColor: palette.background,
          borderTopColor: palette.line,
          height: 82,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
          letterSpacing: 0,
        },
        headerShown: false,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: text.tonight,
          tabBarIcon: ({ color }) => <TabBarIcon name="beer" color={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: text.search,
          tabBarIcon: ({ color }) => <TabBarIcon name="search" color={color} />,
        }}
      />
      <Tabs.Screen
        name="mine"
        options={{
          title: text.mine,
          tabBarIcon: ({ color }) => <TabBarIcon name="user-o" color={color} />,
        }}
      />
    </Tabs>
  );
}
