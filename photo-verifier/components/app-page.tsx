import type { ComponentProps } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AppView } from '@/components/app-view'
import type { ViewProps } from 'react-native'

type AppPageProps = ViewProps & {
  children?: ComponentProps<typeof SafeAreaView>['children']
}

export function AppPage({ children, ...props }: AppPageProps) {
  return (
    <AppView style={{ flex: 1 }} {...props}>
      <SafeAreaView style={{ flex: 1, gap: 16, paddingHorizontal: 16 }}>{children}</SafeAreaView>
    </AppView>
  )
}
