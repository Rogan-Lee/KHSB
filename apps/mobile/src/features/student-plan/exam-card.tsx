import { Armchair, CircleCheck, Clock, RotateCcw } from 'lucide-react-native';
import { useRef, useState } from 'react';
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
import { applyStudentExam, cancelStudentExam, type StudentExamSession } from '@/lib/api/student-plan';

import { daysFromToday, fmtDateShort } from './format';

const MAX_MEMO = 300;

/**
 * 모의고사 한 회차 — 웹 포털 SessionCard 와 같은 규칙:
 * 상태 배지(신청 접수됨·확정) · 과목 · 안내 · 요청사항 + 신청하기 / 신청 취소. 확정되면 취소 대신 안내.
 * 앱은 여기에 반려 상태 · D-day · 시험 좌석 · 마감된 회차 표시를 더했다.
 */
export function ExamCard({ session, onChanged }: { session: StudentExamSession; onChanged: () => void }) {
  const [memo, setMemo] = useState(session.myMemo);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const status = session.myStatus;
  const confirmed = status === 'CONFIRMED';
  const pending = status === 'PENDING';
  const rejected = status === 'CANCELLED';
  const dday = daysFromToday(session.examDate);

  const run = async (fn: () => Promise<unknown>, done: string, fail: string) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await fn();
      toast(done, 'success');
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : fail, 'error');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const apply = () => void run(() => applyStudentExam(session.sessionId, memo.trim()), '신청이 접수되었어요', '신청에 실패했어요');

  const cancel = async () => {
    const ok = await confirm({
      title: '신청을 취소할까요?',
      message: `‘${session.title}’ 신청이 취소돼요.${session.applicationOpen ? '' : ' 접수가 마감돼서 다시 신청할 수 없어요.'}`,
      confirmText: '신청 취소',
      cancelText: '닫기',
      destructive: true,
    });
    if (ok) await run(() => cancelStudentExam(session.sessionId), '신청을 취소했어요', '취소에 실패했어요');
  };

  return (
    <Section>
      <View style={s.head}>
        <View style={{ flex: 1, minWidth: 0, gap: space.x1 }}>
          <Text variant="t6-bold" accessibilityRole="header">
            {session.title}
          </Text>
          <Text variant="t4-regular" color="neutralSubtle" tabular>
            {fmtDateShort(session.examDate)}
            {dday === 0 ? ' · 오늘' : dday > 0 ? ` · D-${dday}` : ''} · {session.examTypeLabel}
          </Text>
        </View>
        {confirmed ? (
          <Badge tone="ok" size="md">
            확정
          </Badge>
        ) : pending ? (
          <Badge tone="warn" size="md">
            신청 접수됨
          </Badge>
        ) : rejected ? (
          <Badge tone="bad" size="md">
            반려됨
          </Badge>
        ) : !session.applicationOpen ? (
          <Badge tone="gray" size="md">
            접수 마감
          </Badge>
        ) : null}
      </View>

      {session.subjects.length > 0 && (
        <View style={s.subjects}>
          {session.subjects.map((subject, i) => (
            <Badge key={`${i}-${subject}`} tone="gray">
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
        <Notice tone="ok" icon={CircleCheck} style={{ marginTop: space.x3 }}>
          응시가 확정됐어요. 변경이 필요하면 운영진에게 문의해 주세요.
        </Notice>
      ) : pending ? (
        <>
          {session.myMemo ? (
            <Text variant="t4-regular" color="neutralSubtle" style={{ marginTop: space.x4 }}>
              요청사항: {session.myMemo}
            </Text>
          ) : null}
          {!session.applicationOpen && (
            <Notice tone="warn" icon={Clock} style={{ marginTop: space.x4 }}>
              접수가 마감됐어요. 운영진이 확인한 뒤 최종 확정돼요.
            </Notice>
          )}
          <Button variant="gray" size="lg" block loading={busy} onPress={() => void cancel()} style={{ marginTop: space.x3 }}>
            신청 취소
          </Button>
        </>
      ) : session.applicationOpen ? (
        <>
          {rejected && (
            <Notice tone="bad" icon={RotateCcw} style={{ marginTop: space.x4 }}>
              운영진이 신청을 반려했어요. 필요하면 다시 신청해 주세요.
            </Notice>
          )}
          <View style={{ marginTop: space.x4 }}>
            <TextField
              label="요청사항"
              indicator="선택"
              value={memo}
              onChangeText={setMemo}
              multiline
              minHeight={88}
              maxLength={MAX_MEMO}
              showCount
              editable={!busy}
            />
          </View>
          <Button variant="primary" size="lg" block loading={busy} onPress={apply} style={{ marginTop: space.x3 }}>
            {rejected ? '다시 신청하기' : '신청하기'}
          </Button>
        </>
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
