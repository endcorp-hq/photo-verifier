import React, { Fragment } from 'react'
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

  return (
    <Dropdown.Root>
      <Dropdown.Trigger style={[styles.trigger, { backgroundColor, borderColor }]}>
        <AppText>{selectedItem}</AppText>
        <UiIconSymbol color={textColor} name="chevron.down" />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Overlay style={StyleSheet.absoluteFill}>
          <Dropdown.Content style={[styles.list, { backgroundColor, borderColor }]}> 
            {items.map((item, index) => (
              <Fragment key={item}>
                <Dropdown.Item onPress={() => selectItem(item)} style={[styles.item, { borderColor }]}> 
                  <AppText>{item}</AppText>
                </Dropdown.Item>
                {index < items.length - 1 && (
                  <Dropdown.Separator style={{ backgroundColor: borderColor, height: 1 }} />
                )}
              </Fragment>
            ))}
          </Dropdown.Content>
        </Dropdown.Overlay>
      </Dropdown.Portal>
    </Dropdown.Root>
  )
}

const styles = StyleSheet.create({
  trigger: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  list: {
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
  },
  item: {
    padding: 12,
  },
})
