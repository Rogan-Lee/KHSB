import { useRouter } from 'expo-router';
import { Armchair, CircleCheck, Clock } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  color,
  confirm,
  IconTile,
  Notice,
  radius,
  Section,
  space,
  Text,
  TextField,
  toast,
} from '@/design';
import { applyExam, cancelExam, type ParentExamSession } from '@/lib/api/parent-services';

import { daysUntil, ymdLabel } from './notice-format';

const INQUIRIES_ROUTE = '/(parent)/inquiries' as const;

/** 모의고사 한 회차 — 상태 배지 · 과목 · 안내 · 좌석 · 신청/취소 (웹 SessionCard 와 같은 규칙) */
export function ExamSessionCard({
  session,
  studentId,
  onChanged,
}: {
  session: ParentExamSession;
  studentId: string;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [memo, setMemo] = useState(session.myMemo);
  const [busy, setBusy] = useState(false);
  const status = session.myStatus;
  const applied = status === 'PENDING' || status === 'CONFIRMED';
  const confirmed = status === 'CONFIRMED';
  const dday = daysUntil(session.examDate);

  const apply = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await applyExam(studentId, session.sessionId, memo.trim());
      toast('신청을 접수했어요', 'success');
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : '신청하지 못했어요', 'error');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (busy) return;
    const ok = await confirm({
      title: '신청을 취소할까요?',
      message: `‘${session.title}’ 신청이 취소돼요.${session.applicationOpen ? '' : ' 접수가 마감돼서 다시 신청할 수 없어요.'}`,
      confirmText: '신청 취소',
      cancelText: '닫기',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await cancelExam(studentId, session.sessionId);
      toast('신청을 취소했어요', 'success');
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : '취소하지 못했어요', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section>
      <View style={s.head}>
        <View style={{ flex: 1, minWidth: 0, gap: space.x1 }}>
          <Text variant="t6-bold" accessibilityRole="header">
            {session.title}
          </Text>
          <Text variant="t4-regular" color="neutralSubtle">
            {ymdLabel(session.examDate)}
            {dday === 0 ? ' · 오늘' : dday > 0 ? ` · D-${dday}` : ''} · {session.examTypeLabel}
          </Text>
        </View>
        {confirmed ? (
          <Badge tone="ok" size="md">
            확정
          </Badge>
        ) : status === 'PENDING' ? (
          <Badge tone="warn" size="md">
            신청 접수됨
          </Badge>
        ) : status === 'CANCELLED' ? (
          <Badge tone="gray" size="md">
            반려됨
          </Badge>
        ) : !session.applicationOpen ? (
          <Badge tone="gray" size="md">
            마감
          </Badge>
        ) : null}
      </View>

      {session.subjects.length > 0 && (
        <View style={s.subjects}>
          {session.subjects.map((subject, i) => (
            <Badge key={`${i}-${subject}`} tone="gray" size="md">
              {subject}
            </Badge>
          ))}
        </View>
      )}

      {session.notes ? (
        <Text variant="t4-regular" color="neutralMuted" style={{ marginTop: space.x3 }} selectable>
          {session.notes}
        </Text>
      ) : null}

      {confirmed && (
        <View style={s.seat}>
          <IconTile icon={Armchair} tone={session.seatNumber ? 'brand' : 'gray'} size={40} round />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="t3-regular" color="neutralSubtle">
              시험 좌석
            </Text>
            {session.seatNumber ? (
              <Text variant="t6-bold" tabular>
                {session.seatNumber}번 좌석
              </Text>
            ) : (
              <Text variant="t5-medium" color="neutralMuted">
                시험 전에 배정돼요
              </Text>
            )}
          </View>
        </View>
      )}

      {confirmed ? (
        <Notice
          tone="ok"
          icon={CircleCheck}
          style={{ marginTop: space.x3 }}
          onPress={() => router.push(INQUIRIES_ROUTE)}>
          응시가 확정됐어요. 변경이 필요하면 원장님께 문의해 주세요.
        </Notice>
      ) : status === 'PENDING' ? (
        <>
          <Notice tone="warn" icon={Clock} style={{ marginTop: space.x4 }}>
            {session.applicationOpen
              ? '운영진이 확인한 뒤 최종 확정돼요.'
              : '접수가 마감됐어요. 운영진이 확정하면 알려드려요.'}
          </Notice>
          <Button variant="gray" size="lg" block loading={busy} onPress={cancel} style={{ marginTop: space.x3 }}>
            신청 취소
          </Button>
        </>
      ) : session.applicationOpen ? (
        <>
          <View style={{ marginTop: space.x4 }}>
            <TextField
              label="요청사항"
              indicator="선택"
              value={memo}
              onChangeText={setMemo}
              placeholder="예: 탐구 과목은 생명과학Ⅰ로 봐요"
              multiline
              minHeight={88}
              maxLength={300}
              showCount
            />
          </View>
          <Button variant="primary" size="lg" block loading={busy} onPress={apply} style={{ marginTop: space.x3 }}>
            {status === 'CANCELLED' ? '다시 신청하기' : '신청하기'}
          </Button>
        </>
      ) : null}
      {applied && !confirmed && session.myMemo ? (
        <Text variant="t4-regular" color="neutralSubtle" style={{ marginTop: space.x3 }}>
          요청사항: {session.myMemo}
        </Text>
      ) : null}
    </Section>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.x3 },
  subjects: { flexDirection: 'row', flexWrap: 'wrap', gap: space.x1, marginTop: space.x3 },
  seat: {
    marginTop: space.x4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
    borderRadius: radius.r4,
    backgroundColor: color.bg.layerFill,
    padding: space.x3_5,
  },
});
