import { Tabs } from 'expo-router'
import React from 'react'
import { UiIconSymbol } from '@/components/ui/ui-icon-symbol'

export default function TabLayout() {
  return (
    <Tabs
      detachInactiveScreens={false}
      screenOptions={{
        freezeOnBlur: false,
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#091726',
          borderTopColor: '#173550',
        },
        tabBarActiveTintColor: '#66f5c5',
        tabBarInactiveTintColor: '#8fa8c5',
      }}
    >
      {/* The index redirects to the camera screen */}
      <Tabs.Screen name="index" options={{ tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen
        name="camera"
        options={{
          title: 'Camera',
          tabBarIcon: ({ color }) => <UiIconSymbol size={28} name="camera.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="gallery"
        options={{
          title: 'Gallery',
          tabBarIcon: ({ color }) => <UiIconSymbol size={28} name="photo.on.rectangle.angled" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'About',
          tabBarIcon: ({ color }) => <UiIconSymbol size={28} name="info.circle.fill" color={color} />,
        }}
      />
    </Tabs>
  )
}
