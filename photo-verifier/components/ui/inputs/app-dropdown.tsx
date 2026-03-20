import React, { Fragment } from 'react'
import type { ViewStyle } from 'react-native'
import { StyleSheet } from 'react-native'
import * as Dropdown from '@rn-primitives/dropdown-menu'
import { AppText } from '@/components/app-text'
import { UiIconSymbol } from '@/components/ui/ui-icon-symbol'
import { useThemeColor } from '@/hooks/use-theme-color'

export function AppDropdown({
  items,
  selectedItem,
  selectItem,
}: {
  items: readonly string[]
  selectedItem: string
  selectItem: (item: string) => void
}) {
  const backgroundColor = useThemeColor({ light: '#ffffff', dark: '#1c1c1e' }, 'background')
  const borderColor = useThemeColor({ light: '#cccccc', dark: '#555555' }, 'border')
  const textColor = useThemeColor({ light: '#000000', dark: '#ffffff' }, 'text')
  const triggerStyle: ViewStyle = { ...triggerBaseStyle, backgroundColor, borderColor }
  const listStyle: ViewStyle = { ...listBaseStyle, backgroundColor, borderColor }
  const itemStyle: ViewStyle = { ...itemBaseStyle, borderColor }

  return (
    <Dropdown.Root>
      <Dropdown.Trigger style={triggerStyle}>
        <AppText>{selectedItem}</AppText>
        <UiIconSymbol color={textColor} name="chevron.down" />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Overlay style={StyleSheet.absoluteFill}>
          <Dropdown.Content style={listStyle}>
            {items.map((item, index) => (
              <Fragment key={item}>
                <Dropdown.Item onPress={() => selectItem(item)} style={itemStyle}>
                  <AppText>{item}</AppText>
                </Dropdown.Item>
                {index < items.length - 1 && <Dropdown.Separator style={{ backgroundColor: borderColor, height: 1 }} />}
              </Fragment>
            ))}
          </Dropdown.Content>
        </Dropdown.Overlay>
      </Dropdown.Portal>
    </Dropdown.Root>
  )
}

const triggerBaseStyle: ViewStyle = {
  alignItems: 'center',
  borderRadius: 10,
  borderWidth: 1,
  flexDirection: 'row',
  gap: 8,
  justifyContent: 'space-between',
  paddingHorizontal: 12,
  paddingVertical: 10,
}

const listBaseStyle: ViewStyle = {
  borderRadius: 12,
  borderWidth: 1,
  marginTop: 8,
}

const itemBaseStyle: ViewStyle = {
  padding: 12,
}
