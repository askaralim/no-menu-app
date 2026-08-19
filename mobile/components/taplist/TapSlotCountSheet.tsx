import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { TAPLIST_THEME as T } from '../../lib/taplistTheme'

type Props = {
  visible: boolean
  currentCount: number
  highestAssigned: number
  saving: boolean
  onClose: () => void
  onSave: (count: number) => void
}

export default function TapSlotCountSheet({
  visible,
  currentCount,
  highestAssigned,
  saving,
  onClose,
  onSave,
}: Props) {
  const [value, setValue] = useState(String(currentCount))

  useEffect(() => {
    if (visible) setValue(String(currentCount))
  }, [visible, currentCount])

  const parsed = Number(value)
  const valid = Number.isInteger(parsed) && parsed >= Math.max(1, highestAssigned) && parsed <= 99

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheet}
        >
          <View style={styles.handle} />
          <Text style={styles.title}>酒头设置</Text>
          <Text style={styles.label}>固定酒头数量</Text>
          <TextInput
            value={value}
            onChangeText={(text) => setValue(text.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            maxLength={2}
            autoFocus
            selectTextOnFocus
            style={styles.input}
            placeholder="12"
            placeholderTextColor={T.faint}
          />
          <Text style={styles.hint}>
            {highestAssigned > 0
              ? `当前最高使用到 #${highestAssigned}，数量不能低于 ${highestAssigned}`
              : '请输入本店墙上固定酒头的总数量'}
          </Text>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={saving}>
              <Text style={styles.cancelText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, (!valid || saving) && styles.saveBtnDisabled]}
              onPress={() => onSave(parsed)}
              disabled={!valid || saving}
            >
              {saving ? (
                <ActivityIndicator color={T.background} />
              ) : (
                <Text style={styles.saveText}>保存</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.58)' },
  sheet: {
    backgroundColor: T.surfaceSolid,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 30,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: T.border,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: T.border,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: { color: T.text, fontSize: 20, fontWeight: '800' },
  label: { color: T.goldSoft, fontSize: 13, fontWeight: '700', marginTop: 22 },
  input: {
    color: T.text,
    fontSize: 30,
    fontWeight: '800',
    minHeight: 64,
    borderBottomWidth: 1,
    borderBottomColor: T.goldBorder,
    paddingVertical: 8,
  },
  hint: { color: T.muted, fontSize: 13, lineHeight: 19, marginTop: 10 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 24 },
  cancelBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: T.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { color: T.muted, fontSize: 15, fontWeight: '600' },
  saveBtn: {
    flex: 1.4,
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: T.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.42 },
  saveText: { color: T.background, fontSize: 15, fontWeight: '800' },
})
