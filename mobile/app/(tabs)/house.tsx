import { useCallback, useEffect, useState } from 'react'
import { View, Text, StyleSheet, Alert, TouchableOpacity, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/authProvider'
import { THEME, SPACING, RADIUS } from '../../lib/theme'
import {
  Screen,
  Title,
  SectionLabel,
  Card,
  Button,
  Field,
  Loading,
} from '../../components/ui'
import type { StaffMember } from '../../lib/types'
import {
  getTenantPublicPriceMode,
  getTenantPublishReadiness,
  setTenantPublicPriceMode,
  setTenantPublicVisibility,
  type PublicPriceMode,
} from '../../lib/taplistOwnerApi'

function roleLabel(r: string): string {
  switch (r) {
    case 'owner':
      return '店主'
    case 'staff':
      return '员工'
    case 'super_admin':
      return '超级管理员'
    default:
      return r
  }
}

export default function HouseScreen() {
  const router = useRouter()
  const { tenantId, role, memberships, refreshMembership } = useAuth()
  const isOwner = role === 'owner' || role === 'super_admin'
  const tenant = memberships.find((m) => m.tenant_id === tenantId) ?? null

  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [staffLoading, setStaffLoading] = useState(false)
  const [newStaffMobile, setNewStaffMobile] = useState('')
  const [addingStaff, setAddingStaff] = useState(false)
  const [priceMode, setPriceMode] = useState<PublicPriceMode>('hide')
  const [priceModeLoading, setPriceModeLoading] = useState(false)
  const [priceModeBusy, setPriceModeBusy] = useState(false)
  const [publicVisible, setPublicVisible] = useState(false)
  const [publicBusy, setPublicBusy] = useState(false)

  useEffect(() => {
    setPublicVisible(!!tenant?.is_public_visible)
  }, [tenant?.is_public_visible])

  const fetchStaff = useCallback(async () => {
    if (!isOwner) return
    setStaffLoading(true)
    try {
      const { data, error } = await supabase.rpc('list_staff')
      if (error) throw error
      setStaffList((data || []) as StaffMember[])
    } catch {
      Alert.alert('错误', '加载员工列表失败')
    } finally {
      setStaffLoading(false)
    }
  }, [isOwner])

  const fetchPriceMode = useCallback(async () => {
    if (!tenantId) return
    setPriceModeLoading(true)
    try {
      setPriceMode(await getTenantPublicPriceMode(tenantId))
    } catch {
      /* keep default hide */
    } finally {
      setPriceModeLoading(false)
    }
  }, [tenantId])

  useEffect(() => {
    void fetchStaff()
  }, [fetchStaff])

  useEffect(() => {
    void fetchPriceMode()
  }, [fetchPriceMode])

  const applyGoLive = async (v: boolean) => {
    if (!tenantId || publicBusy) return
    setPublicBusy(true)
    const prev = publicVisible
    setPublicVisible(v)
    try {
      await setTenantPublicVisibility(tenantId, v)
      await refreshMembership()
    } catch (e: any) {
      setPublicVisible(prev)
      Alert.alert(v ? '无法发布' : '操作失败', e?.message || '请重试')
    } finally {
      setPublicBusy(false)
    }
  }

  const toggleGoLive = async (v: boolean) => {
    if (!tenantId) return
    if (!isOwner) {
      Alert.alert('无权限', '仅店主可发布或下线门店公开展示。')
      return
    }

    if (v) {
      try {
        const ready = await getTenantPublishReadiness(tenantId)
        if (!ready.ok) {
          Alert.alert(
            '尚未满足公开展示条件',
            ready.errors.slice(0, 6).join('\n') || '请完善门店资料与酒单',
          )
          return
        }
      } catch (e: any) {
        Alert.alert('检查失败', e?.message || '请重试')
        return
      }

      Alert.alert(
        '确认发布？',
        '发布后，顾客将在 No Menu Tap List 中看到你的门店和公开酒单。请确认当前酒单、价格和售罄状态准确。',
        [
          { text: '取消', style: 'cancel' },
          { text: '确认发布', onPress: () => void applyGoLive(true) },
        ],
      )
      return
    }

    Alert.alert(
      '确认下线？',
      '下线后，顾客将无法在 No Menu Tap List 中看到该门店。POS 内部功能不受影响。',
      [
        { text: '取消', style: 'cancel' },
        { text: '确认下线', style: 'destructive', onPress: () => void applyGoLive(false) },
      ],
    )
  }

  const applyPriceMode = async (mode: PublicPriceMode) => {
    if (!tenantId || mode === priceMode || priceModeBusy) return
    setPriceModeBusy(true)
    const prev = priceMode
    setPriceMode(mode)
    try {
      const next = await setTenantPublicPriceMode(tenantId, mode)
      setPriceMode(next)
    } catch (e: any) {
      setPriceMode(prev)
      Alert.alert('无法更新', e?.message || '请重试')
    } finally {
      setPriceModeBusy(false)
    }
  }

  const handlePriceModeChange = (mode: PublicPriceMode) => {
    if (!isOwner) {
      Alert.alert('无权限', '仅店主可更改顾客端价格展示。')
      return
    }
    if (mode === priceMode) return
    if (mode === 'show') {
      Alert.alert(
        '展示价格？',
        '开启后，顾客将在 No Menu Tap List 中看到杯型与价格。未设价格的规格仍不会展示。',
        [
          { text: '取消', style: 'cancel' },
          { text: '确认展示', onPress: () => void applyPriceMode('show') },
        ],
      )
      return
    }
    Alert.alert(
      '隐藏价格？',
      '隐藏后，顾客端酒单将不展示杯型与价格（POS 点单不受影响）。',
      [
        { text: '取消', style: 'cancel' },
        { text: '确认隐藏', onPress: () => void applyPriceMode('hide') },
      ],
    )
  }

  const handleAddStaff = async () => {
    const mobile = newStaffMobile.trim()
    if (!mobile) return Alert.alert('提示', '请输入员工手机号')
    if (!tenantId) return Alert.alert('错误', '未找到门店')
    setAddingStaff(true)
    try {
      const { data, error } = await supabase.rpc('create_tenant_invite', {
        p_tenant_id: tenantId,
        p_contact_type: 'mobile',
        p_email: null,
        p_mobile: mobile,
        p_role: 'staff',
      })
      if (error) throw error
      const res = data as {
        raw_token?: string
        mobile?: string
        account_created?: boolean
        temporary_password?: string | null
      }
      if (res?.raw_token) {
        const phone = res.mobile || mobile
        const lines = [
          `发给 ${phone}（以下信息仅显示一次）：`,
          '',
          `邀请码：${res.raw_token}`,
        ]
        if (res.account_created && res.temporary_password) {
          lines.push(`初始密码：${res.temporary_password}`)
          lines.push('')
          lines.push('对方用该手机号 + 初始密码登录，首次登录需改密；然后在「我有邀请码」中输入邀请码加入。')
        } else {
          lines.push('')
          lines.push('对方用同一手机号登录后，在「我有邀请码」中输入邀请码即可加入。')
        }
        Alert.alert('邀请已创建', lines.join('\n'))
      } else {
        Alert.alert('成功', `已创建对 ${mobile} 的邀请`)
      }
      setNewStaffMobile('')
      void fetchStaff()
    } catch (e: any) {
      Alert.alert('错误', e?.message || '邀请员工失败')
    } finally {
      setAddingStaff(false)
    }
  }

  const handleRemoveStaff = (member: StaffMember) => {
    if (member.role === 'owner') return Alert.alert('提示', '无法移除店主')
    Alert.alert('确认', `确定要移除 ${member.email} 吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '移除',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase.rpc('remove_staff_member', {
              staff_user_id: member.user_id,
            })
            if (error) throw error
            void fetchStaff()
          } catch (e: any) {
            Alert.alert('错误', e?.message || '移除失败')
          }
        },
      },
    ])
  }

  const handleLogout = () => {
    Alert.alert('确认', '确定要退出登录吗？', [
      { text: '取消', style: 'cancel' },
      { text: '退出', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ])
  }

  return (
    <Screen scroll keyboard>
      <Title>{tenant?.display_name || tenant?.name || '我的门店'}</Title>

      <Card>
        <InfoRow label="门店名称" value={tenant?.name || '—'} />
      </Card>

      <SectionLabel>顾客端酒单</SectionLabel>
      <Card>
        <View style={styles.settingBlock}>
          <View style={styles.settingHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.linkTitle}>公开展示</Text>
              <Text style={styles.linkSub}>
                {isOwner
                  ? publicVisible
                    ? '顾客可在 No Menu Tap List 看到本店'
                    : '发布后门店与公开酒单对顾客可见'
                  : publicVisible
                    ? '顾客可见（仅店主可下线）'
                    : '未公开（仅店主可发布）'}
              </Text>
            </View>
            {publicBusy ? <ActivityIndicator size="small" color={THEME.gold} /> : null}
          </View>
          <View style={styles.choiceRow}>
            {(
              [
                { on: false, label: '未公开' },
                { on: true, label: '已公开' },
              ] as const
            ).map((opt) => {
              const active = publicVisible === opt.on
              return (
                <TouchableOpacity
                  key={opt.label}
                  disabled={!isOwner || publicBusy}
                  onPress={() => {
                    if (publicVisible === opt.on) return
                    void toggleGoLive(opt.on)
                  }}
                  style={[styles.choiceChip, active && styles.choiceChipActive]}
                >
                  <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        <View style={styles.settingDivider} />

        <View style={styles.settingBlock}>
          <View style={styles.settingHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.linkTitle}>价格展示</Text>
              <Text style={styles.linkSub}>
                {priceMode === 'show'
                  ? '顾客可见杯型与价格'
                  : '顾客看不到价格与杯型（默认）'}
              </Text>
            </View>
            {priceModeLoading || priceModeBusy ? (
              <ActivityIndicator size="small" color={THEME.gold} />
            ) : null}
          </View>
          <View style={styles.choiceRow}>
            {(
              [
                { key: 'hide' as const, label: '隐藏价格' },
                { key: 'show' as const, label: '展示价格' },
              ] as const
            ).map((opt) => {
              const active = priceMode === opt.key
              return (
                <TouchableOpacity
                  key={opt.key}
                  disabled={!isOwner || priceModeBusy || priceModeLoading}
                  onPress={() => handlePriceModeChange(opt.key)}
                  style={[styles.choiceChip, active && styles.choiceChipActive]}
                >
                  <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {!isOwner ? (
          <Text style={[styles.hint, { marginTop: SPACING.md }]}>仅店主可更改顾客端展示设置</Text>
        ) : null}
      </Card>

      {isOwner && (
        <>
          <SectionLabel>经营</SectionLabel>
          <Card onPress={() => router.push('/(tabs)/more')} style={styles.linkCard}>
            <View style={styles.linkInner}>
              <Ionicons name="bar-chart-outline" size={20} color={THEME.gold} />
              <View style={{ flex: 1 }}>
                <Text style={styles.linkTitle}>经营数据</Text>
                <Text style={styles.linkSub}>营收、热销与客户消费</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={THEME.faint} />
            </View>
          </Card>
        </>
      )}

      {isOwner && (
        <>
          <SectionLabel>员工</SectionLabel>
          <Card>
            <Text style={styles.hint}>
              输入员工手机号生成邀请码。若对方还没有账号，会一并开通初始密码（仅显示一次）。对方登录后在「我有邀请码」中输入即可加入。
            </Text>
            <Field
              placeholder="员工手机号"
              value={newStaffMobile}
              onChangeText={setNewStaffMobile}
              keyboardType="phone-pad"
              autoCapitalize="none"
              style={{ marginTop: SPACING.md, marginBottom: SPACING.md }}
            />
            <Button
              label="生成邀请码"
              icon="person-add-outline"
              onPress={handleAddStaff}
              loading={addingStaff}
            />
          </Card>

          {staffLoading ? (
            <Loading />
          ) : (
            staffList.map((member) => (
              <Card key={member.user_id} style={styles.staffRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.staffEmail}>{member.email}</Text>
                  <View style={styles.roleBadge}>
                    <Text style={styles.roleBadgeText}>{roleLabel(member.role)}</Text>
                  </View>
                </View>
                {member.role === 'staff' && (
                  <TouchableOpacity onPress={() => handleRemoveStaff(member)} style={{ padding: SPACING.sm }}>
                    <Ionicons name="close-circle-outline" size={22} color={THEME.danger} />
                  </TouchableOpacity>
                )}
              </Card>
            ))
          )}
        </>
      )}

      <SectionLabel>账号</SectionLabel>
      <View style={{ gap: SPACING.md }}>
        <Button
          label="修改密码"
          variant="secondary"
          icon="key-outline"
          onPress={() => router.push('/(auth)/change-password')}
        />
        <Button label="退出登录" variant="danger" icon="log-out-outline" onPress={handleLogout} />
      </View>

      <View style={styles.roleFooter}>
        <Ionicons name="shield-checkmark-outline" size={15} color={THEME.faint} />
        <Text style={styles.roleFooterText}>当前角色：{roleLabel(role || 'staff')}</Text>
      </View>
    </Screen>
  )
}

function InfoRow({
  label,
  value,
  valueColor,
}: {
  label: string
  value: string
  valueColor?: string
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SPACING.sm },
  infoLabel: { color: THEME.muted, fontSize: 14 },
  infoValue: { color: THEME.text, fontSize: 15, fontWeight: '600' },
  settingBlock: { gap: SPACING.md },
  settingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  settingDivider: {
    height: 1,
    backgroundColor: THEME.borderFaint,
    marginVertical: SPACING.lg,
  },
  linkCard: { paddingVertical: SPACING.lg },
  linkInner: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  linkTitle: { color: THEME.text, fontSize: 16, fontWeight: '600' },
  linkSub: { color: THEME.muted, fontSize: 13, marginTop: 2 },
  choiceRow: { flexDirection: 'row', gap: SPACING.sm },
  choiceChip: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: THEME.border,
    alignItems: 'center',
  },
  choiceChipActive: {
    backgroundColor: THEME.goldFill,
    borderColor: THEME.goldBorder,
  },
  choiceChipText: { color: THEME.muted, fontSize: 14, fontWeight: '600' },
  choiceChipTextActive: { color: THEME.gold },
  hint: { color: THEME.muted, fontSize: 13, lineHeight: 19 },
  staffRow: { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.md },
  staffEmail: { color: THEME.text, fontSize: 15, fontWeight: '500' },
  roleBadge: {
    alignSelf: 'flex-start',
    marginTop: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
    backgroundColor: THEME.goldFill,
    borderWidth: 1,
    borderColor: THEME.goldBorder,
  },
  roleBadgeText: { color: THEME.gold, fontSize: 11, fontWeight: '600' },
  roleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.xl,
  },
  roleFooterText: { color: THEME.faint, fontSize: 13 },
})
