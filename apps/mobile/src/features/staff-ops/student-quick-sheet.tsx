import { useRouter } from 'expo-router';
import {
  AlertTriangle,
  Award,
  CalendarClock,
  Clock,
  DoorOpen,
  Info,
  MessageSquareText,
  Phone,
  UserRound,
} from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Badge, BottomSheet, Button, IconTile, ListRow, Notice, space, StatGrid, Text } from '@/design';
import type { MobileOuting } from '@/lib/mobile-api';
import type { OpsAttendanceItem } from '@/lib/api/staff-ops';

import { AttendanceActionButtons, FooterSlot, OutingSheet, TimesSheet } from './attendance-controls';
import { openContact } from './contact';
import { MeritSheet } from './merit-sheet';
import { QuickActionBar } from './quick-actions';
import { rememberStudent } from './recent-students';
import { staffOpsRoutes } from './routes';
import { STATUS_LABEL, STATUS_TONE } from './status';
import { SeatTile } from './student-row';

type Sub = { kind: 'times' } | { kind: 'outing'; outing: MobileOuting | null } | { kind: 'merit' };

const OUTING_TONE = { 외출중: 'warn', 복귀: 'ok', 예정: 'gray' } as const;

/**
 * 학생 빠른 처리 시트 — 입퇴실 탭(폰)·좌석 현황에서 학생을 눌렀을 때.
 * 상태 전환(하단 버튼) · 출결/외출 수정 · 상벌점 · 학부모 연락 · 프로필 이동.
 * 하위 시트로 넘어갈 땐 이 시트를 먼저 닫고 연다(모달 겹침 방지).
 */
export function StudentQuickSheet({
  item,
  open,
  onClose,
  onChanged,
}: {
  item: OpsAttendanceItem | null;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [sub, setSub] = useState<Sub | null>(null);
  const [switching, setSwitching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const go = (next: Sub) => {
    setSwitching(true);
    timer.current = setTimeout(() => {
      setSub(next);
      setSwitching(false);
    }, 240);
  };
  const endSub = () => {
    setSub(null);
    onClose();
  };
  const openProfile = () => {
    if (!item) return;
    void rememberStudent({ id: item.id, name: item.name, grade: item.grade, seat: item.seat });
    onClose();
    router.push(staffOpsRoutes.student(item.id));
  };
  const openRequests = () => {
    if (!item) return;
    onClose();
    router.push(staffOpsRoutes.student(item.id, 'requests'));
  };

  const hasActions = !!item && ['미입실', '결석', '입실', '외출'].includes(item.status);
  const realOutings = item?.outings ?? [];

  return (
    <>
      <BottomSheet
        open={open && !!item && !sub && !switching}
        onClose={onClose}
        title={
          item ? (
            <View style={s.head}>
              <SeatTile seat={item.seat} status={item.status} late={item.isLate} size={48} />
              <View style={{ flex: 1, minWidth: 0, gap: space.x0_5 }}>
                <Text variant="t7-bold" numberOfLines={1}>
                  {item.name}
                </Text>
                <Text variant="t4-regular" color="neutralSubtle" numberOfLines={1}>
                  {[item.grade, item.school].filter(Boolean).join(' · ') || '학생'}
                </Text>
              </View>
              <Badge tone={STATUS_TONE[item.status]} size="md">
                {STATUS_LABEL[item.status]}
              </Badge>
            </View>
          ) : undefined
        }
        footer={
          item ? (
            hasActions ? (
              <FooterSlot>
                <AttendanceActionButtons item={item} onChanged={onChanged} onDone={onClose} />
              </FooterSlot>
            ) : (
              <FooterSlot>
                <Button variant="gray" block onPress={onClose}>
                  닫기
                </Button>
              </FooterSlot>
            )
          ) : undefined
        }>
        {item && (
          <>
            <StatGrid
              items={[
                {
                  label: '오늘 예정',
                  value: item.scheduleStart ? `${item.scheduleStart}` : '—',
                  sub: item.scheduleEnd
                    ? `~ ${item.scheduleEnd}`
                    : item.scheduleStart
                      ? undefined
                      : '예정 없음',
                },
                {
                  label: '입실',
                  value: item.checkIn ?? '—',
                  tone: item.attendanceType === 'TARDY' ? 'warning' : 'neutral',
                  sub: item.attendanceType === 'TARDY' ? '지각' : undefined,
                },
                { label: '퇴실', value: item.checkOut ?? '—' },
              ]}
            />

            {item.isLate && (
              <Notice tone="bad" icon={Clock} title="지각">
                {`예정 입실 ${item.scheduleStart ?? ''}에서 30분 넘게 지났어요`}
              </Notice>
            )}
            {item.attention && (
              <Notice tone="warn" icon={AlertTriangle} title="유의 관찰">
                {item.attention.reasons.join(' · ')}
              </Notice>
            )}
            {item.dailyNote && (
              <Notice tone="info" icon={Info} title="오늘 변동">
                {item.dailyNote}
              </Notice>
            )}
            {item.note && (
              <Notice tone="gray" title="비고">
                {item.note}
              </Notice>
            )}
            {item.unreadRequests > 0 && (
              <Notice tone="gray" icon={MessageSquareText} onPress={openRequests}>
                {`확인 안 한 학부모 요청이 ${item.unreadRequests}건 있어요`}
              </Notice>
            )}

            {realOutings.length > 0 && (
              <View style={s.bleed}>
                {realOutings.map((o, i) => (
                  <ListRow
                    key={o.id ?? `plan-${i}`}
                    onPress={() => go({ kind: 'outing', outing: o })}
                    leading={
                      <Badge tone={OUTING_TONE[o.status]} size="md">
                        {o.planned && !o.id ? '정기' : o.status}
                      </Badge>
                    }
                    title={
                      <Text variant="t5-medium" tabular>
                        {`${o.start ?? '—'}${o.end ? ` ~ ${o.end}` : ' ~'}`}
                      </Text>
                    }
                    description={o.reason ?? (o.planned ? '정기 외출 예정' : undefined)}
                  />
                ))}
              </View>
            )}

            <QuickActionBar
              actions={[
                {
                  key: 'parent-call',
                  icon: Phone,
                  label: '학부모 전화',
                  tone: 'ok',
                  disabled: !item.parentPhone,
                  onPress: () => void openContact('tel', item.parentPhone),
                },
                {
                  key: 'parent-sms',
                  icon: MessageSquareText,
                  label: '문자',
                  tone: 'info',
                  disabled: !item.parentPhone,
                  accessibilityLabel: '학부모에게 문자',
                  onPress: () => void openContact('sms', item.parentPhone),
                },
                {
                  key: 'merit',
                  icon: Award,
                  label: '상벌점',
                  tone: 'brand',
                  onPress: () => go({ kind: 'merit' }),
                },
                {
                  key: 'times',
                  icon: CalendarClock,
                  label: '출결 수정',
                  onPress: () => go({ kind: 'times' }),
                },
                {
                  key: 'outing',
                  icon: DoorOpen,
                  label: '외출 추가',
                  disabled: item.status === '미입실' || item.status === '결석',
                  onPress: () => go({ kind: 'outing', outing: null }),
                },
              ]}
            />

            <View style={s.bleed}>
              <ListRow
                onPress={openProfile}
                leading={<IconTile icon={UserRound} size={40} />}
                title="프로필 전체 보기"
                description="출결 14일 · 상벌점 · 과제 · 성적 · 요청"
              />
            </View>
          </>
        )}
      </BottomSheet>

      <TimesSheet item={item} open={sub?.kind === 'times'} onClose={endSub} onSaved={onChanged} />
      <OutingSheet
        item={item}
        outing={sub?.kind === 'outing' ? sub.outing : null}
        open={sub?.kind === 'outing'}
        onClose={endSub}
        onSaved={onChanged}
      />
      <MeritSheet student={item} open={sub?.kind === 'merit'} onClose={endSub} />
    </>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.x3 },
  bleed: { marginHorizontal: -space.x5 },
});
