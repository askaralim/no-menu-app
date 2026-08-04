import { useCallback, useEffect, useState } from 'react'
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native'
import { useAuth } from '../../../lib/authProvider'
import {
  getMyAccountDeletionRequest,
  requestMyAccountDeletion,
  type AccountDeletionRequest,
} from '../../../lib/supportApi'
import { THEME, SPACING, RADIUS } from '../../../lib/theme'
import { Button, Card, Screen, SectionLabel } from '../../../components/ui'
import { HouseSubheader } from '../../../components/house/HouseSubheader'

const STATUS_LABEL: Record<AccountDeletionRequest['status'], string> = {
  pending: '待处理',
  in_progress: '处理中',
  resolved: '已完成',
  closed: '已关闭',
}

export default function AccountDeletionScreen() {
  const { tenantId, role } = useAuth()
  const [request, setRequest] = useState<AccountDeletionRequest | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRequest(await getMyAccountDeletionRequest())
    } catch {
      setRequest(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const submit = () => {
    Alert.alert(
      '确认申请删除账号？',
      role === 'owner'
        ? '账号不会立即删除。我们会先与你确认门店归属和必要经营记录的处理方式。'
        : '账号不会立即删除。申请处理完成后，你将失去当前门店权限。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '提交申请',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setSubmitting(true)
              try {
                const result = await requestMyAccountDeletion(tenantId, message)
                setRequest(result)
                Alert.alert('申请已提交', `请求编号：${result.request_number}`)
              } catch (error) {
                Alert.alert('提交失败', error instanceof Error ? error.message : '请稍后重试')
              } finally {
                setSubmitting(false)
              }
            })()
          },
        },
      ],
    )
  }

  const hasOpenRequest = request?.status === 'pending' || request?.status === 'in_progress'

  return (
    <Screen scroll keyboard>
      <HouseSubheader title="申请删除账号" />

      <SectionLabel>处理说明</SectionLabel>
      <Card>
        <Text style={styles.body}>
          提交后账号仍可正常使用。我们会核实门店成员关系，并通过账号绑定的手机号与你联系。
          删除个人账号不会自动删除依法或经营所需保留的门店记录。
        </Text>
        {role === 'owner' ? (
          <Text style={styles.ownerHint}>店主需要先确认门店所有权转让或门店关闭安排。</Text>
        ) : null}
      </Card>

      {request ? (
        <>
          <SectionLabel>最近申请</SectionLabel>
          <Card>
            <View style={styles.row}>
              <Text style={styles.label}>请求编号</Text>
              <Text style={styles.value}>{request.request_number}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.row}>
              <Text style={styles.label}>状态</Text>
              <Text style={styles.status}>{STATUS_LABEL[request.status]}</Text>
            </View>
          </Card>
        </>
      ) : null}

      {!hasOpenRequest ? (
        <>
          <SectionLabel>补充说明（可选）</SectionLabel>
          <TextInput
            value={message}
            onChangeText={setMessage}
            maxLength={1000}
            multiline
            placeholder="例如：希望保留门店，先转让给其他负责人"
            placeholderTextColor={THEME.faint}
            style={styles.input}
          />
          <Button
            label={loading ? '加载中' : '提交删除申请'}
            variant="danger"
            icon="trash-outline"
            disabled={loading}
            loading={submitting}
            onPress={submit}
          />
        </>
      ) : (
        <Text style={styles.pendingHint}>当前申请正在处理，无需重复提交。</Text>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  body: { color: THEME.textSoft, fontSize: 14, lineHeight: 22 },
  ownerHint: { color: THEME.gold, fontSize: 13, lineHeight: 20, marginTop: SPACING.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACING.md },
  label: { color: THEME.muted, fontSize: 14 },
  value: { color: THEME.text, fontSize: 14, fontWeight: '700' },
  status: { color: THEME.gold, fontSize: 14, fontWeight: '700' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: THEME.borderFaint, marginVertical: SPACING.md },
  input: {
    minHeight: 120,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: THEME.border,
    backgroundColor: THEME.surface,
    color: THEME.text,
    padding: SPACING.md,
    textAlignVertical: 'top',
    marginBottom: SPACING.lg,
  },
  pendingHint: { color: THEME.muted, fontSize: 14, textAlign: 'center', marginTop: SPACING.lg },
})

