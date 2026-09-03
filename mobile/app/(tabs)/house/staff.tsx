import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Share,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../lib/authProvider'
import { THEME, SPACING, RADIUS } from '../../../lib/theme'
import { Screen, Card, Button, Field, Loading } from '../../../components/ui'
import { HouseSubheader } from '../../../components/house/HouseSubheader'
import type { StaffMember } from '../../../lib/types'

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

export default function HouseStaffScreen() {
  const { tenantId, role } = useAuth()
  const isOwner = role === 'owner' || role === 'super_admin'
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [staffLoading, setStaffLoading] = useState(false)
  const [newStaffMobile, setNewStaffMobile] = useState('')
  const [addingStaff, setAddingStaff] = useState(false)

  const fetchStaff = useCallback(async () => {
    if (!isOwner || !tenantId) return
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
  }, [isOwner, tenantId])

  useEffect(() => {
    void fetchStaff()
  }, [fetchStaff])

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
        temporary_password?: string | null
      }
      if (res?.raw_token) {
        const phone = res.mobile || mobile
        const tempPassword = res.temporary_password || null
        const shareText = [
          '【No Menu 门店邀请】',
          `手机号：${phone}`,
          `初始密码：${tempPassword || ''}`,
          `邀请码：${res.raw_token}`,
          '',
          '请打开 No Menu Tonight →「我有邀请码」，填写以上三项加入门店。',
        ].join('\n')

        Alert.alert(
          '邀请已创建',
          `发给 ${phone}（仅显示一次）：\n\n手机号：${phone}\n初始密码：${tempPassword || '（未返回）'}\n邀请码：${res.raw_token}`,
          [
            { text: '好的', style: 'cancel' },
            {
              text: '复制',
              onPress: () => {
                void Clipboard.setStringAsync(shareText).then(() => {
                  Alert.alert('已复制', '可直接粘贴发给员工')
                })
              },
            },
            { text: '分享', onPress: () => void Share.share({ message: shareText }) },
          ],
        )
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
        onPress: () => {
          void (async () => {
            try {
              const { error } = await supabase.rpc('remove_staff_member', {
                staff_user_id: member.user_id,
              })
              if (error) throw error
              void fetchStaff()
            } catch (e: any) {
              Alert.alert('错误', e?.message || '移除失败')
            }
          })()
        },
      },
    ])
  }

  if (!isOwner) {
    return (
      <Screen>
        <HouseSubheader title="员工" />
        <Text style={styles.hint}>仅店主可管理员工。</Text>
      </Screen>
    )
  }

  return (
    <Screen scroll keyboard>
      <HouseSubheader title="员工" />
      <Card>
        <Text style={styles.hint}>
          输入员工手机号生成邀请。新账号会给出一次性初始密码；请把手机号、密码、邀请码发给员工。
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
          onPress={() => void handleAddStaff()}
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
            {member.role === 'staff' ? (
              <TouchableOpacity onPress={() => handleRemoveStaff(member)} style={{ padding: SPACING.sm }}>
                <Ionicons name="close-circle-outline" size={22} color={THEME.danger} />
              </TouchableOpacity>
            ) : null}
          </Card>
        ))
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
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
})
