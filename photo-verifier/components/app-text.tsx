import { StyleSheet, Text, type TextProps } from 'react-native'
import { useThemeColor } from '@/hooks/use-theme-color'

export type AppTextProps = TextProps & {
  lightColor?: string
  darkColor?: string
  type?: 'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'link'
}

export function AppText({ style, lightColor, darkColor, type = 'default', ...rest }: AppTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text')

  return (
    <Text
      style={[
        { color },
        type === 'default' ? styles.default : undefined,
        type === 'title' ? styles.title : undefined,
        type === 'defaultSemiBold' ? styles.defaultSemiBold : undefined,
        type === 'subtitle' ? styles.subtitle : undefined,
        type === 'link' ? styles.link : undefined,
        style,
      ]}
      {...rest}
    />
  )
}

const styles = StyleSheet.create({
  default: {
    fontFamily: 'DarkerGrotesque_500Medium',
    fontSize: 16,
    lineHeight: 24,
  },
  defaultSemiBold: {
    fontFamily: 'DarkerGrotesque_700Bold',
    fontSize: 16,
    lineHeight: 24,
  },
  title: {
    fontFamily: 'DarkerGrotesque_700Bold',
    fontSize: 32,
    lineHeight: 32,
  },
  subtitle: {
    fontFamily: 'DarkerGrotesque_700Bold',
    fontSize: 20,
  },
  link: {
    fontFamily: 'DarkerGrotesque_500Medium',
    lineHeight: 30,
    fontSize: 16,
    color: '#0a7ea4',
  },
})
