import { BellRing, ShieldAlert } from 'lucide-react-native';
import { useState } from 'react';
import { Image, View } from 'react-native';

import {
  Button,
  EmptyState,
  Notice,
  Screen,
  Segmented,
  Skeleton,
  Stack,
  Text,
  TextField,
  color,
  confirm,
  radius,
  shadow,
  space,
  toast,
} from '@/design';
import { errorText, useOptionalQuery, useStaffCaps } from '@/features/staff-home/hooks';
import {
  sendBroadcast,
  STAFF_API,
  type BroadcastAudience,
  type BroadcastTargetsResponse,
} from '@/lib/api/staff-home';

const AUDIENCES: { value: BroadcastAudience; label: string; noun: string }[] = [
  { value: 'ALL', label: '전체', noun: '전체 계정' },
  { value: 'STUDENTS', label: '학생', noun: '학생' },
  { value: 'PARENTS', label: '학부모', noun: '학부모' },
  { value: 'STAFF', label: '직원', noun: '직원' },
];

const TITLE_MAX = 100;
const BODY_MAX = 1000;

/** 단체 알림 — 원장 전용. 앱 알림을 켠 계정에 푸시를 보낸다 (웹 메시지 > 단체 푸시와 같은 기능) */
export default function StaffBroadcastScreen() {
  const caps = useStaffCaps();
  const allowed = !!caps?.fullAccess;
  const targets = useOptionalQuery<BroadcastTargetsResponse>(allowed ? STAFF_API.broadcast : null);
  const [audience, setAudience] = useState<BroadcastAudience>('ALL');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const count = targets?.targets[audience];
  const noun = AUDIENCES.find((a) => a.value === audience)?.noun ?? '';
  const ready = title.trim().length > 0 && body.trim().length > 0;

  async function send() {
    if (sending || !ready) return;
    const ok = await confirm({
      title: count != null ? `${noun} ${count}명에게 보낼까요?` : `${noun}에게 보낼까요?`,
      message: '보낸 알림은 취소할 수 없어요.',
      confirmText: '보내기',
    });
    if (!ok) return;
    setSending(true);
    try {
      const res = await sendBroadcast(audience, title.trim(), body.trim());
      if (res.targets === 0) {
        toast('알림을 받을 수 있는 계정이 없어요', 'error');
      } else {
        toast(`${res.targets}명에게 알림을 보냈어요`, 'success');
        setTitle('');
        setBody('');
      }
    } catch (e) {
      toast(errorText(e, '알림을 보내지 못했어요'), 'error');
    } finally {
      setSending(false);
    }
  }

  if (!allowed) {
    return (
      <Screen kind="push" title="단체 알림" backFallback="/(staff)/(tabs)/menu">
        <EmptyState icon={ShieldAlert} title="원장만 보낼 수 있어요" description="단체 알림이 필요하면 원장님께 요청해 주세요" />
      </Screen>
    );
  }

  return (
    <Screen
      kind="push"
      title="단체 알림"
      surface="panel"
      backFallback="/(staff)/(tabs)/menu"
      footer={
        <Button block icon={BellRing} loading={sending} disabled={!ready} onPress={() => void send()}>
          보내기
        </Button>
      }>
      <Stack gap={space.x6} style={{ paddingTop: space.x3 }}>
        <Text variant="t4-regular" color="neutralSubtle">
          앱 알림을 켠 계정에 푸시 알림을 보내요. 보낸 알림은 취소할 수 없어요.
        </Text>

        <View style={{ gap: space.x2 }}>
          <Text variant="t5-medium">받는 사람</Text>
          <Segmented value={audience} onChange={setAudience} options={AUDIENCES} />
          {targets ? (
            <Text variant="t3-regular" color="neutralSubtle" tabular>
              {count
                ? `알림을 켠 ${noun} ${count}명에게 보내요`
                : `아직 알림을 켠 ${audience === 'ALL' ? '' : `${noun} `}계정이 없어요`}
            </Text>
          ) : (
            <Skeleton style={{ width: 180, height: 14 }} />
          )}
        </View>

        <TextField
          label="제목"
          value={title}
          onChangeText={setTitle}
          maxLength={TITLE_MAX}
          showCount
          placeholder="예: 내일 자습실 운영 시간 안내"
        />
        <TextField
          label="내용"
          value={body}
          onChangeText={setBody}
          multiline
          minHeight={140}
          maxLength={BODY_MAX}
          showCount
          placeholder="알림에 보일 내용을 적어 주세요"
        />

        {ready && (
          <View style={{ gap: space.x2 }}>
            <Text variant="t5-medium">미리보기</Text>
            <View
              style={{
                flexDirection: 'row',
                gap: space.x3,
                padding: space.x3_5,
                borderRadius: radius.r5,
                backgroundColor: color.bg.layerFloating,
                borderWidth: 1,
                borderColor: color.stroke.neutralSubtle,
                ...shadow('s1'),
              }}
              accessibilityLabel={`알림 미리보기. ${title}. ${body}`}>
              <Image
                source={require('@/assets/images/icon.png')}
                style={{ width: 36, height: 36, borderRadius: 9 }}
              />
              <View style={{ flex: 1, minWidth: 0, gap: space.x0_5 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.x2 }}>
                  <Text variant="t3-medium" color="neutralSubtle">
                    강한선배
                  </Text>
                  <Text variant="t3-regular" color="neutralSubtle">
                    지금
                  </Text>
                </View>
                <Text variant="t4-bold" numberOfLines={1}>
                  {title.trim()}
                </Text>
                <Text variant="t4-regular" color="neutralMuted" numberOfLines={4}>
                  {body.trim()}
                </Text>
              </View>
            </View>
          </View>
        )}

        {audience === 'ALL' && (
          <Notice tone="warn">전체를 고르면 학생·학부모·직원 모두에게 가요.</Notice>
        )}
      </Stack>
    </Screen>
  );
}
