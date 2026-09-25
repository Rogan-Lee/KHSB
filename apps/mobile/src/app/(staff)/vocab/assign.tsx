import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Check, ClipboardList, Search, Users } from 'lucide-react-native';
import { useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  Chip,
  ChipGroup,
  color,
  EmptyState,
  ErrorState,
  ListRow,
  Press,
  radius,
  Screen,
  Section,
  SectionAction,
  space,
  Stack,
  Text,
  TextField,
  toast,
} from '@/design';
import { ListSkeleton } from '@/features/staff-learning/skeletons';
import { ExamRow } from '@/features/staff-learning/vocab-ui';
import {
  assignVocabExam,
  STAFF_VOCAB_PATH,
  staffVocabRosterPath,
  type StaffVocabOverviewResponse,
  type StaffVocabRosterResponse,
} from '@/lib/api/staff-learning';
import { useMobileQuery } from '@/lib/mobile-api';
import { useResponsive } from '@/lib/responsive';

type RosterStudent = StaffVocabRosterResponse['students'][number];

/** 영단어 시험 배정 — 시험 고르기 → 학생 여러 명 고르기(검색·학년) → 배정 */
export default function StaffVocabAssignScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ examId?: string }>();
  const initialExamId = typeof params.examId === 'string' && params.examId ? params.examId : null;
  const [examId, setExamId] = useState<string | null>(initialExamId);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState('');
  const [grade, setGrade] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const { isTablet } = useResponsive();

  const overview = useMobileQuery<StaffVocabOverviewResponse>(STAFF_VOCAB_PATH);
  const roster = useMobileQuery<StaffVocabRosterResponse>(staffVocabRosterPath(examId));
  const exams = overview.data?.exams ?? [];
  const exam = exams.find((e) => e.id === examId) ?? null;

  const students = roster.data?.students ?? [];
  // 이미 배정된 학생은 고를 수 없다 (시험을 바꾸면 선택에서 자동 제외)
  const selectable = (s: RosterStudent) => !s.assigned;
  const pickedIds = [...picked].filter((id) => students.some((s) => s.id === id && selectable(s)));
  const grades = [...new Set(students.map((s) => s.grade))];
  const keyword = query.trim().toLowerCase();
  const visible = students.filter(
    (s) =>
      (!grade || s.grade === grade) &&
      (!keyword ||
        s.name.toLowerCase().includes(keyword) ||
        (s.school ?? '').toLowerCase().includes(keyword) ||
        (s.seat ?? '') === keyword),
  );
  const visibleSelectable = visible.filter(selectable);
  const allVisiblePicked = visibleSelectable.length > 0 && visibleSelectable.every((s) => picked.has(s.id));

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleVisible = () =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (allVisiblePicked) visibleSelectable.forEach((s) => next.delete(s.id));
      else visibleSelectable.forEach((s) => next.add(s.id));
      return next;
    });

  async function submit() {
    if (lock.current || !examId || pickedIds.length === 0) return;
    lock.current = true;
    setSaving(true);
    try {
      const r = await assignVocabExam(examId, pickedIds);
      toast(
        r.added > 0
          ? `${r.added}명에게 배정했어요${r.skipped ? ` (이미 배정된 ${r.skipped}명 제외)` : ''}`
          : '모두 이미 배정된 학생이에요',
        r.added > 0 ? 'success' : 'default',
      );
      if (initialExamId && router.canGoBack()) router.back();
      else router.replace(`/(staff)/vocab/${examId}` as Href);
    } catch (e) {
      toast(e instanceof Error ? e.message : '배정하지 못했어요', 'error');
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  // ─── 시험 고르기 ───
  let examSection: ReactNode;
  if (exam) {
    examSection = (
      <Section
        flush
        title="시험"
        action={
          <SectionAction
            onPress={() => {
              setExamId(null);
              setPicked(new Set());
            }}>
            바꾸기
          </SectionAction>
        }>
        <ExamRow exam={exam} onPress={() => setExamId(null)} />
      </Section>
    );
  } else if (!overview.data) {
    examSection =
      overview.error && !overview.isLoading ? (
        <ErrorState message={overview.error} onRetry={() => void overview.retry()} />
      ) : (
        <ListSkeleton rows={3} />
      );
  } else {
    examSection = (
      <Section flush title="어떤 시험을 배정할까요?" description="최근 출제한 시험 40개예요">
        {exams.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="출제한 시험이 없어요"
            description="새 시험 출제는 웹 영단어 화면에서 할 수 있어요."
            style={{ paddingVertical: space.x8 }}
          />
        ) : (
          exams.map((e) => <ExamRow key={e.id} exam={e} onPress={() => setExamId(e.id)} />)
        )}
      </Section>
    );
  }

  // ─── 학생 고르기 ───
  const studentSection = exam ? (
    <Section
      flush
      title="학생"
      description={pickedIds.length > 0 ? `${pickedIds.length}명 골랐어요` : '시험을 볼 학생을 골라 주세요'}
      action={
        visibleSelectable.length > 0 ? (
          <SectionAction onPress={toggleVisible}>{allVisiblePicked ? '모두 해제' : '모두 선택'}</SectionAction>
        ) : undefined
      }>
      <View style={{ paddingHorizontal: space.x5, paddingTop: space.x2, gap: space.x3 }}>
        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder="이름·학교·좌석 번호로 찾기"
          autoCorrect={false}
          returnKeyType="search"
          prefix={
            <View style={{ justifyContent: 'center' }}>
              <Search color={color.fg.neutralSubtle} size={18} strokeWidth={2.2} />
            </View>
          }
          accessibilityLabel="학생 검색"
        />
        {grades.length > 1 ? (
          <ChipGroup>
            <Chip size="sm" selected={grade === null} onPress={() => setGrade(null)}>
              전체
            </Chip>
            {grades.map((g) => (
              <Chip key={g} size="sm" selected={grade === g} onPress={() => setGrade(grade === g ? null : g)}>
                {g}
              </Chip>
            ))}
          </ChipGroup>
        ) : null}
      </View>
      <View style={{ paddingTop: space.x2 }}>
        {!roster.data ? (
          roster.error && !roster.isLoading ? (
            <ErrorState message={roster.error} onRetry={() => void roster.retry()} />
          ) : (
            <ListSkeleton rows={6} title={false} />
          )
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Users}
            title={keyword || grade ? '찾는 학생이 없어요' : '재원생이 없어요'}
            style={{ paddingVertical: space.x8 }}
          />
        ) : (
          visible.map((s) => (
            <StudentPickRow key={s.id} student={s} checked={picked.has(s.id)} onToggle={() => toggle(s.id)} />
          ))
        )}
      </View>
    </Section>
  ) : null;

  return (
    <Screen
      kind="push"
      title="시험 배정"
      maxWidth={isTablet ? 720 : undefined}
      backFallback="/(staff)/vocab"
      refreshing={overview.isRefreshing || roster.isRefreshing}
      onRefresh={() => {
        void overview.refresh();
        void roster.refresh();
      }}
      footer={
        exam ? (
          <Button
            variant="primary"
            size="lg"
            block
            loading={saving}
            disabled={pickedIds.length === 0}
            onPress={() => void submit()}>
            {pickedIds.length > 0 ? `${pickedIds.length}명에게 배정하기` : '학생을 골라 주세요'}
          </Button>
        ) : undefined
      }>
      <Stack>
        {examSection}
        {studentSection}
      </Stack>
    </Screen>
  );
}

function StudentPickRow({
  student,
  checked,
  onToggle,
}: {
  student: RosterStudent;
  checked: boolean;
  onToggle: () => void;
}) {
  const detail = [student.grade, student.school, student.seat ? `${student.seat}번` : null]
    .filter(Boolean)
    .join(' · ');
  if (student.assigned) {
    return (
      <ListRow
        muted
        leading={<View style={[s.check, s.checkDisabled]} />}
        title={student.name}
        description={detail}
        trailing={<Badge>배정됨</Badge>}
      />
    );
  }
  return (
    <Press
      onPress={onToggle}
      scale={0}
      pressedBg
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={`${student.name} ${student.grade}`}
      style={s.row}>
      <View style={[s.check, checked && s.checkOn]}>
        {checked ? <Check color={color.palette.staticWhite} size={16} strokeWidth={3} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: space.x0_5 }}>
        <Text variant="t5-medium" numberOfLines={1}>
          {student.name}
        </Text>
        {detail ? (
          <Text variant="t4-regular" color="neutralSubtle" numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
      {student.isOnlineManaged ? <Badge tone="info">온라인</Badge> : null}
    </Press>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
    marginHorizontal: space.x2,
    paddingHorizontal: space.x3,
    paddingVertical: space.x3,
    borderRadius: radius.r4,
    minHeight: 56,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: color.stroke.neutralMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: color.bg.brandSolid, borderColor: color.bg.brandSolid },
  checkDisabled: { backgroundColor: color.bg.disabled, borderColor: color.stroke.neutralSubtle },
});
