import { useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { palette, spacing, typography } from '@/constants/design'
import { tr, useLanguage } from '@/lib/i18n'

export function FeedExplanation({ onVisibilityChange }: { onVisibilityChange?: (visible: boolean) => void }) {
  const [visible, setVisible] = useState(false)
  const changeVisible = (next: boolean) => { setVisible(next); onVisibilityChange?.(next) }
  const { language } = useLanguage()
  return <>
    <Pressable onPress={() => changeVisible(true)} accessibilityRole="button" accessibilityLabel={tr(language, '了解口味匹配', 'About taste matching')} hitSlop={10} style={styles.info}>
      <Text style={styles.infoText}>i</Text>
    </Pressable>
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => changeVisible(false)}>
      <Pressable style={styles.backdrop} onPress={() => changeVisible(false)}>
        <Pressable style={styles.panel} onPress={() => {}} accessibilityViewIsModal>
          <Text style={styles.title}>{tr(language, '这里的酒如何出现？', 'How are these beers matched?')}</Text>
          <Text style={styles.body}>{tr(language,
            '根据你 TAP 过的酒款风格，匹配当前城市近期上枪、仍在售的酒款。每个人看到的内容可能不同。',
            'We match recent beers on tap in this city to the styles of beers you’ve logged. Results can differ from person to person.')}</Text>
          <Text style={styles.body}>{tr(language, '想按上枪时间浏览，可以切换「全部上新」。', 'Switch to Latest to browse by tap date.')}</Text>
          <Pressable accessibilityRole="button" onPress={() => changeVisible(false)} style={styles.close}><Text style={styles.closeText}>{tr(language, '关闭', 'Close')}</Text></Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  </>
}
const styles = StyleSheet.create({
  info: { borderRadius: 9, borderWidth: 1, borderColor: palette.muted, width: 17, height: 17, alignItems: 'center', justifyContent: 'center' },
  infoText: { color: palette.muted, fontSize: 12, lineHeight: 14 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', padding: spacing.lg },
  panel: { backgroundColor: palette.panelElevated, borderRadius: 20, padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: palette.line },
  title: { ...typography.title, color: palette.text }, body: { ...typography.body, color: palette.muted },
  close: { padding: spacing.sm, alignItems: 'center' }, closeText: { ...typography.body, color: palette.amber },
})
