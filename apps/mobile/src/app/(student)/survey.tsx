import { CheckCircle2, ChevronRight, Circle } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import {
  Badge,
  Banner,
  Card,
  ErrorState,
  LoadingState,
  PrimaryButton,
} from '@/components/mobile-ui';
import {
  AddRowButton,
  ChipSelect,
  opts,
  Rating,
  RowCard,
  SurveyField,
  TextField,
} from '@/components/survey-ui';
import { colors, palette, radius, spacing, type } from '@/constants/theme';
import { mutateMobileApi, useMobileQuery } from '@/lib/mobile-api';
import type {
  SurveyResponse,
  SurveySaveResponse,
  SurveySectionPayload,
} from '@/lib/mobile-api';
import * as S from '@/lib/survey-schema';

const BASE = '/api/mobile/v1/student/survey';

export default function StudentSurveyScreen() {
  const { data, error, isLoading, isRefreshing, refresh, retry } =
    useMobileQuery<SurveyResponse>(BASE);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState('');

  const editing = data?.sections.find((s) => s.key === editingKey) ?? null;

  if (editing) {
    return (
      <SectionEditor
        gradeNumber={data?.gradeNumber ?? null}
        section={editing}
        onClose={() => setEditingKey(null)}
        onSaved={async () => {
          setEditingKey(null);
          await refresh();
        }}
      />
    );
  }

  const sections = data?.sections ?? [];
  const done = sections.filter((s) => s.complete).length;
  const submitted = !!data?.submittedAt;

  async function submit() {
    setSubmitting(true);
    setSubmitMsg('');
    try {
      await mutateMobileApi(`${BASE}/submit`, 'POST', {});
      await refresh();
    } catch (caught) {
      setSubmitMsg(caught instanceof Error ? caught.message : '제출하지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppScreen
      eyebrow="ONBOARDING"
      onRefresh={() => void refresh()}
      refreshing={isRefreshing}
      subtitle="컨설턴트가 학습계획 수립에 활용합니다"
      title="초기 설문">
      {isLoading && !data ? <LoadingState /> : null}
      {error && !data ? <ErrorState message={error} onRetry={() => void retry()} /> : null}

      {data ? (
        <>
          {submitted ? (
            <Banner
              text="설문 제출 완료 — 내용은 계속 확인할 수 있어요"
              right="완료"
              tone="positive"
            />
          ) : (
            <Card>
              <Text style={styles.progressTitle}>
                작성 진행 {done}/{sections.length}
              </Text>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${(done / sections.length) * 100}%` },
                  ]}
                />
              </View>
              <Text style={styles.progressHint}>
                모든 섹션을 완료하면 제출할 수 있어요.
              </Text>
            </Card>
          )}

          <View style={styles.list}>
            {sections.map((s, i) => (
              <Pressable
                key={s.key}
                onPress={() => setEditingKey(s.key)}
                style={({ pressed }) => pressed && { opacity: 0.7 }}>
                <Card>
                  <View style={styles.row}>
                    {s.complete ? (
                      <CheckCircle2 color={palette.green50} size={22} />
                    ) : (
                      <Circle color={colors.lineStrong} size={22} />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>
                        {i + 1}. {s.title}
                      </Text>
                      <Text style={styles.rowDesc} numberOfLines={2}>
                        {s.description}
                      </Text>
                    </View>
                    <ChevronRight color={colors.textAssistive} size={18} />
                  </View>
                </Card>
              </Pressable>
            ))}
          </View>

          {!submitted ? (
            <>
              {submitMsg ? <Text style={styles.submitErr}>{submitMsg}</Text> : null}
              <PrimaryButton
                disabled={!data.complete || submitting}
                onPress={() => void submit()}>
                {submitting
                  ? '제출 중…'
                  : data.complete
                    ? '설문 제출하기'
                    : `제출하려면 ${sections.length - done}개 섹션 더 완료`}
              </PrimaryButton>
            </>
          ) : null}
        </>
      ) : null}
    </AppScreen>
  );
}

// ─────────────────────────── 섹션 에디터 래퍼 ───────────────────────────

function SectionEditor({
  gradeNumber,
  onClose,
  onSaved,
  section,
}: {
  gradeNumber: 1 | 2 | 3 | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  section: SurveySectionPayload;
}) {
  const [value, setValue] = useState<unknown>(section.value);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    setSaving(true);
    setErr('');
    try {
      await mutateMobileApi<SurveySaveResponse>(`${BASE}/section`, 'POST', {
        sectionKey: section.key,
        value,
      });
      await onSaved();
    } catch (caught) {
      setErr(caught instanceof Error ? caught.message : '저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppScreen
      eyebrow="초기 설문"
      right={
        <Pressable hitSlop={8} onPress={onClose}>
          <Text style={styles.cancel}>닫기</Text>
        </Pressable>
      }
      title={section.title}>
      <Text style={styles.sectionDesc}>{section.description}</Text>

      <KindEditor
        gradeNumber={gradeNumber}
        kind={section.kind}
        placeholder={section.placeholder}
        value={value}
        onChange={setValue}
      />

      {err ? <Text style={styles.submitErr}>{err}</Text> : null}
      <PrimaryButton disabled={saving} onPress={() => void save()}>
        {saving ? '저장 중…' : '저장'}
      </PrimaryButton>
    </AppScreen>
  );
}

function KindEditor({
  gradeNumber,
  kind,
  placeholder,
  value,
  onChange,
}: {
  gradeNumber: 1 | 2 | 3 | null;
  kind: SurveySectionPayload['kind'];
  placeholder?: string;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  switch (kind) {
    case 'text':
      return (
        <TextEditor placeholder={placeholder} value={value} onChange={onChange} />
      );
    case 'performance':
      return <PerformanceEditor value={value} onChange={onChange} />;
    case 'history':
      return <HistoryEditor value={value} onChange={onChange} />;
    case 'goals':
      return <GoalsEditor value={value} onChange={onChange} />;
    case 'strengthsWeaknesses':
      return <StrengthsEditor value={value} onChange={onChange} />;
    case 'admissionType':
      return (
        <AdmissionEditor gradeNumber={gradeNumber} value={value} onChange={onChange} />
      );
    default:
      return null;
  }
}

// ─────────────────────────── text ───────────────────────────

function TextEditor({
  onChange,
  placeholder,
  value,
}: {
  onChange: (v: unknown) => void;
  placeholder?: string;
  value: unknown;
}) {
  const v = value as S.TextAnswer;
  return (
    <Card>
      <TextField
        multiline
        onChangeText={(t) => onChange({ answer: t })}
        placeholder={placeholder}
        value={v?.answer ?? ''}
      />
    </Card>
  );
}

// ─────────────────────────── performance ───────────────────────────

function PerformanceEditor({
  onChange,
  value,
}: {
  onChange: (v: unknown) => void;
  value: unknown;
}) {
  const v = value as S.PerformanceAnswer;
  const set = (patch: Partial<S.PerformanceAnswer>) => onChange({ ...v, ...patch });
  const setSubject = (i: number, patch: Partial<S.PerformanceSubject>) =>
    set({ subjects: v.subjects.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const setBook = (i: number, patch: Partial<S.PerformanceBook>) =>
    set({ books: v.books.map((b, j) => (j === i ? { ...b, ...patch } : b)) });

  return (
    <View style={styles.editor}>
      <Text style={styles.groupTitle}>과목별 탐구 경험</Text>
      {v.subjects.map((s, i) => (
        <RowCard
          key={i}
          title={`탐구 ${i + 1}`}
          onRemove={
            v.subjects.length > 1
              ? () => set({ subjects: v.subjects.filter((_, j) => j !== i) })
              : undefined
          }>
          <SurveyField label="과목">
            <TextField onChangeText={(t) => setSubject(i, { subject: t })} placeholder="예) 생명과학" value={s.subject} />
          </SurveyField>
          <SurveyField label="탐구 주제">
            <TextField onChangeText={(t) => setSubject(i, { topic: t })} placeholder="탐구한 주제" value={s.topic} />
          </SurveyField>
          <SurveyField label="탐구 방법">
            <ChipSelect
              multi
              onChange={(next) => setSubject(i, { methods: next as string[] })}
              options={opts(S.PERFORMANCE_METHOD_OPTIONS)}
              value={s.methods}
            />
            {s.methods.includes('기타') ? (
              <TextField onChangeText={(t) => setSubject(i, { methodOther: t })} placeholder="기타 방법" value={s.methodOther ?? ''} />
            ) : null}
          </SurveyField>
          <SurveyField label="나의 역할">
            <TextField onChangeText={(t) => setSubject(i, { selfRole: t })} placeholder="활동에서 맡은 역할" value={s.selfRole} />
          </SurveyField>
        </RowCard>
      ))}
      <AddRowButton
        label="탐구 추가"
        onPress={() => set({ subjects: [...v.subjects, S.emptyPerformanceSubject()] })}
      />

      <Text style={styles.groupTitle}>교과 연계 독서</Text>
      {v.books.map((b, i) => (
        <RowCard
          key={i}
          title={`독서 ${i + 1}`}
          onRemove={
            v.books.length > 1
              ? () => set({ books: v.books.filter((_, j) => j !== i) })
              : undefined
          }>
          <SurveyField label="도서명">
            <TextField onChangeText={(t) => setBook(i, { title: t })} placeholder="책 제목" value={b.title} />
          </SurveyField>
          <SurveyField label="읽은 이유">
            <TextField onChangeText={(t) => setBook(i, { reason: t })} placeholder="선택 이유" value={b.reason} />
          </SurveyField>
          <SurveyField label="연계 과목">
            <TextField onChangeText={(t) => setBook(i, { linkedSubject: t })} placeholder="연결된 과목" value={b.linkedSubject} />
          </SurveyField>
          <SurveyField label="확장·후속 활동">
            <TextField onChangeText={(t) => setBook(i, { expansion: t })} placeholder="이후 확장한 내용" value={b.expansion} />
          </SurveyField>
        </RowCard>
      ))}
      <AddRowButton
        label="독서 추가"
        onPress={() => set({ books: [...v.books, S.emptyPerformanceBook()] })}
      />

      <SurveyField label="진로 탐색 수준">
        <ChipSelect
          onChange={(next) => set({ careerLevel: next as S.PerformanceAnswer['careerLevel'] })}
          options={S.CAREER_LEVELS}
          value={v.careerLevel}
        />
        {v.careerLevel === 'specified' ? (
          <TextField onChangeText={(t) => set({ careerDetail: t })} placeholder="구체화된 진로" value={v.careerDetail} />
        ) : null}
      </SurveyField>

      <SurveyField label="활동 결과물">
        <ChipSelect
          multi
          onChange={(next) => set({ outputs: next as string[] })}
          options={opts(S.PERFORMANCE_OUTPUT_OPTIONS)}
          value={v.outputs}
        />
        {v.outputs.includes('기타') ? (
          <TextField onChangeText={(t) => set({ outputOther: t })} placeholder="기타 결과물" value={v.outputOther ?? ''} />
        ) : null}
      </SurveyField>
    </View>
  );
}

// ─────────────────────────── history ───────────────────────────

function HistoryEditor({
  onChange,
  value,
}: {
  onChange: (v: unknown) => void;
  value: unknown;
}) {
  const v = value as S.HistoryAnswer;
  const set = (patch: Partial<S.HistoryAnswer>) => onChange({ ...v, ...patch });
  const setEdu = (i: number, patch: Partial<S.PriorEducation>) =>
    set({ priorEducation: v.priorEducation.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  const mixSum =
    v.currentMix.school + v.currentMix.academy + v.currentMix.online + v.currentMix.selfStudy;
  const pc = v.priorConsulting;

  return (
    <View style={styles.editor}>
      <SurveyField label="이전 사교육 경험이 있나요?">
        <ChipSelect
          onChange={(next) =>
            set({ hasPriorEducation: next as S.HistoryAnswer['hasPriorEducation'] })
          }
          options={[
            { value: 'yes', label: '있음' },
            { value: 'no', label: '없음' },
          ]}
          value={v.hasPriorEducation}
        />
      </SurveyField>

      {v.hasPriorEducation === 'yes' ? (
        <>
          {v.priorEducation.map((e, i) => (
            <RowCard
              key={i}
              title={`이전 학습 ${i + 1}`}
              onRemove={
                v.priorEducation.length > 1
                  ? () => set({ priorEducation: v.priorEducation.filter((_, j) => j !== i) })
                  : undefined
              }>
              <SurveyField label="기관명">
                <TextField onChangeText={(t) => setEdu(i, { institution: t })} placeholder="학원·과외 등" value={e.institution} />
              </SurveyField>
              <View style={styles.rowTwo}>
                <View style={{ flex: 1 }}>
                  <SurveyField label="시작 (YYYY-MM)">
                    <TextField onChangeText={(t) => setEdu(i, { periodFrom: t })} placeholder="2023-03" value={e.periodFrom} />
                  </SurveyField>
                </View>
                <View style={{ flex: 1 }}>
                  <SurveyField label="종료 (YYYY-MM)">
                    <TextField onChangeText={(t) => setEdu(i, { periodTo: t })} placeholder="2024-02" value={e.periodTo} />
                  </SurveyField>
                </View>
              </View>
              <SurveyField label="과목">
                <ChipSelect
                  multi
                  onChange={(next) => setEdu(i, { subjects: next as string[] })}
                  options={opts(S.HISTORY_SUBJECT_OPTIONS)}
                  value={e.subjects}
                />
                {e.subjects.includes('기타') ? (
                  <TextField onChangeText={(t) => setEdu(i, { subjectOther: t })} placeholder="기타 과목" value={e.subjectOther ?? ''} />
                ) : null}
              </SurveyField>
              <SurveyField label="형태">
                <ChipSelect
                  onChange={(next) => setEdu(i, { format: next as S.HistoryFormat })}
                  options={opts(S.HISTORY_FORMAT_OPTIONS)}
                  value={e.format}
                />
              </SurveyField>
              <SurveyField label="그만둔 이유">
                <TextField onChangeText={(t) => setEdu(i, { quitReason: t })} placeholder="중단 사유" value={e.quitReason} />
              </SurveyField>
            </RowCard>
          ))}
          <AddRowButton
            label="이전 학습 추가"
            onPress={() => set({ priorEducation: [...v.priorEducation, S.emptyPriorEducation()] })}
          />
        </>
      ) : null}

      <SurveyField label="현재 학습 시간 분배 (합 100%)" hint={`현재 합계: ${mixSum}%`}>
        {S.HISTORY_MIX_KEYS.map((k) => (
          <View key={k} style={styles.mixRow}>
            <Text style={styles.mixLabel}>{S.HISTORY_MIX_LABELS[k]}</Text>
            <TextField
              keyboardType="number-pad"
              onChangeText={(t) =>
                set({ currentMix: { ...v.currentMix, [k]: Number(t.replace(/[^0-9]/g, '')) || 0 } })
              }
              placeholder="0"
              style={styles.mixInput}
              value={v.currentMix[k] ? String(v.currentMix[k]) : ''}
            />
            <Text style={styles.mixPct}>%</Text>
          </View>
        ))}
      </SurveyField>

      <SurveyField label="주 학습 장소">
        <ChipSelect
          onChange={(next) => set({ studyPlace: next as string })}
          options={opts(S.HISTORY_PLACE_OPTIONS)}
          value={v.studyPlace}
        />
        {v.studyPlace === '기타' ? (
          <TextField onChangeText={(t) => set({ studyPlaceOther: t })} placeholder="기타 장소" value={v.studyPlaceOther ?? ''} />
        ) : null}
      </SurveyField>

      <SurveyField label="이전 입시 컨설팅 경험">
        <ChipSelect
          onChange={(next) => {
            const had = next as string;
            if (had === 'yes')
              set({ priorConsulting: { had: 'yes', institution: '', period: '', satisfaction: 0 } });
            else if (had === 'no') set({ priorConsulting: { had: 'no' } });
            else set({ priorConsulting: { had: '' } });
          }}
          options={[
            { value: 'yes', label: '있음' },
            { value: 'no', label: '없음' },
          ]}
          value={pc.had}
        />
      </SurveyField>
      {pc.had === 'yes' ? (
        <RowCard title="컨설팅 정보">
          <SurveyField label="기관명">
            <TextField
              onChangeText={(t) => set({ priorConsulting: { ...pc, institution: t } })}
              placeholder="컨설팅 기관"
              value={pc.institution}
            />
          </SurveyField>
          <SurveyField label="기간">
            <TextField
              onChangeText={(t) => set({ priorConsulting: { ...pc, period: t } })}
              placeholder="예) 2023 고1 여름"
              value={pc.period}
            />
          </SurveyField>
          <SurveyField label="만족도">
            <Rating
              highLabel="매우 만족"
              lowLabel="매우 불만족"
              onChange={(n) => set({ priorConsulting: { ...pc, satisfaction: n } })}
              value={pc.satisfaction}
            />
          </SurveyField>
        </RowCard>
      ) : null}
    </View>
  );
}

// ─────────────────────────── goals ───────────────────────────

function GoalsEditor({
  onChange,
  value,
}: {
  onChange: (v: unknown) => void;
  value: unknown;
}) {
  const v = value as S.GoalsAnswer;
  const set = (patch: Partial<S.GoalsAnswer>) => onChange({ ...v, ...patch });
  const setAsp = (i: number, patch: Partial<S.Aspiration>) =>
    set({ aspirations: v.aspirations.map((a, j) => (j === i ? { ...a, ...patch } : a)) });

  return (
    <View style={styles.editor}>
      {v.aspirations.map((a, i) => (
        <RowCard key={i} title={S.ASPIRATION_LABELS[i] ?? `${i + 1}지망`}>
          <SurveyField label="대학">
            <TextField onChangeText={(t) => setAsp(i, { university: t })} placeholder="목표 대학" value={a.university} />
          </SurveyField>
          <SurveyField label="학과">
            <TextField onChangeText={(t) => setAsp(i, { department: t })} placeholder="목표 학과" value={a.department} />
          </SurveyField>
          <SurveyField label="전형">
            <ChipSelect
              onChange={(next) => setAsp(i, { track: next as S.GoalsTrack })}
              options={opts(S.GOALS_TRACK_OPTIONS)}
              value={a.track}
            />
          </SurveyField>
          <SurveyField label="지원 성향">
            <ChipSelect
              onChange={(next) => setAsp(i, { fit: next as S.GoalsFit })}
              options={opts(S.GOALS_FIT_OPTIONS)}
              value={a.fit}
            />
          </SurveyField>
          <SurveyField label="선택 이유">
            <TextField onChangeText={(t) => setAsp(i, { reason: t })} placeholder="지원 이유" value={a.reason} />
          </SurveyField>
        </RowCard>
      ))}

      <SurveyField label="우선순위 축">
        <ChipSelect
          onChange={(next) => set({ priorityAxis: next as S.GoalsAnswer['priorityAxis'] })}
          options={S.GOALS_PRIORITY_AXIS_OPTIONS}
          value={v.priorityAxis}
        />
      </SurveyField>
      <SurveyField label="진로 일치 여부">
        <ChipSelect
          onChange={(next) => set({ careerAlignment: next as S.GoalsAnswer['careerAlignment'] })}
          options={S.GOALS_CAREER_ALIGNMENT_OPTIONS}
          value={v.careerAlignment}
        />
      </SurveyField>
    </View>
  );
}

// ─────────────────────────── strengthsWeaknesses ───────────────────────────

function StrengthsEditor({
  onChange,
  value,
}: {
  onChange: (v: unknown) => void;
  value: unknown;
}) {
  const v = value as S.StrengthsWeaknessesAnswer;
  const set = (patch: Partial<S.StrengthsWeaknessesAnswer>) => onChange({ ...v, ...patch });
  const setSub = (i: number, patch: Partial<S.SubjectStrength>) =>
    set({ bySubject: v.bySubject.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  return (
    <View style={styles.editor}>
      <Text style={styles.groupTitle}>과목별 강·약점</Text>
      {v.bySubject.map((s, i) => (
        <RowCard
          key={i}
          title={`과목 ${i + 1}`}
          onRemove={
            v.bySubject.length > 1
              ? () => set({ bySubject: v.bySubject.filter((_, j) => j !== i) })
              : undefined
          }>
          <SurveyField label="과목">
            <TextField onChangeText={(t) => setSub(i, { subject: t })} placeholder="예) 수학" value={s.subject} />
          </SurveyField>
          <SurveyField label="수준">
            <ChipSelect
              onChange={(next) => setSub(i, { level: next as S.SwLevel })}
              options={opts(S.SW_LEVEL_OPTIONS)}
              value={s.level}
            />
          </SurveyField>
          <View style={styles.rowTwo}>
            <View style={{ flex: 1 }}>
              <SurveyField label="내신 등급">
                <TextField keyboardType="decimal-pad" onChangeText={(t) => setSub(i, { internalGrade: t })} placeholder="1.5" value={s.internalGrade} />
              </SurveyField>
            </View>
            <View style={{ flex: 1 }}>
              <SurveyField label="모의 등급">
                <TextField keyboardType="decimal-pad" onChangeText={(t) => setSub(i, { mockGrade: t })} placeholder="2" value={s.mockGrade} />
              </SurveyField>
            </View>
          </View>
          <SurveyField label="약한 영역">
            <ChipSelect
              multi
              onChange={(next) => setSub(i, { weakAreas: next as string[] })}
              options={opts(S.SW_WEAK_AREA_OPTIONS)}
              value={s.weakAreas}
            />
            {s.weakAreas.includes('기타') ? (
              <TextField onChangeText={(t) => setSub(i, { weakAreaOther: t })} placeholder="기타 영역" value={s.weakAreaOther ?? ''} />
            ) : null}
          </SurveyField>
          <SurveyField label="이유·메모">
            <TextField onChangeText={(t) => setSub(i, { reason: t })} placeholder="강·약 판단 이유" value={s.reason} />
          </SurveyField>
        </RowCard>
      ))}
      <AddRowButton
        label="과목 추가"
        onPress={() => set({ bySubject: [...v.bySubject, S.emptySubjectStrength()] })}
      />

      <SurveyField label="학습 습관">
        <ChipSelect
          multi
          onChange={(next) => set({ studyHabits: next as string[] })}
          options={opts(S.SW_HABIT_OPTIONS)}
          value={v.studyHabits}
        />
      </SurveyField>
      <SurveyField label="집중 가능 시간 (분)">
        <TextField
          keyboardType="number-pad"
          onChangeText={(t) => set({ focusMinutes: t.replace(/[^0-9]/g, '') })}
          placeholder="예) 50"
          value={v.focusMinutes}
        />
      </SurveyField>
      <SurveyField label="시험 불안도">
        <Rating highLabel="매우 높음" lowLabel="매우 낮음" onChange={(n) => set({ testAnxiety: n })} value={v.testAnxiety} />
      </SurveyField>
      <SurveyField label="자기주도 수준">
        <Rating highLabel="매우 높음" lowLabel="매우 낮음" onChange={(n) => set({ selfDirection: n })} value={v.selfDirection} />
      </SurveyField>
    </View>
  );
}

// ─────────────────────────── admissionType ───────────────────────────

function AdmissionEditor({
  gradeNumber,
  onChange,
  value,
}: {
  gradeNumber: 1 | 2 | 3 | null;
  onChange: (v: unknown) => void;
  value: unknown;
}) {
  const v = value as S.AdmissionTypeAnswer;
  const set = (patch: Partial<S.AdmissionTypeAnswer>) => onChange({ ...v, ...patch });
  // 노출 학기(미진행 future 제외) — 학년·현재 월 기반
  const month = useMemo(() => new Date().getMonth() + 1, []);
  const classified = useMemo(
    () => S.classifyInternalSemesters(gradeNumber, month),
    [gradeNumber, month],
  );
  const visibleSemesters = new Set(
    classified.filter((c) => c.status !== 'future').map((c) => c.semester),
  );

  const setInternal = (sem: string, patch: Partial<S.InternalSemester>) =>
    set({
      internalGrades: v.internalGrades.map((g) =>
        g.semester === sem ? { ...g, ...patch } : g,
      ),
    });
  const setInternalGrade = (sem: string, subj: string, val: string) => {
    const row = v.internalGrades.find((g) => g.semester === sem);
    if (!row) return;
    setInternal(sem, { grades: { ...row.grades, [subj]: val } });
  };
  const setMock = (i: number, patch: Partial<S.MockExam>) =>
    set({ mockGrades: v.mockGrades.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
  const setCard = (i: number, patch: Partial<S.AdmissionCard>) =>
    set({ cardStrategy: v.cardStrategy.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  return (
    <View style={styles.editor}>
      <SurveyField label="주력 전형">
        <ChipSelect
          onChange={(next) => set({ primaryTrack: next as string })}
          options={opts(S.ADMISSION_PRIMARY_TRACK_OPTIONS)}
          value={v.primaryTrack}
        />
      </SurveyField>

      <Text style={styles.groupTitle}>내신 등급 (학기별)</Text>
      {v.internalGrades
        .filter((g) => visibleSemesters.has(g.semester))
        .map((g) => (
          <RowCard key={g.semester} title={`${g.semester} 학기`}>
            <Pressable
              onPress={() => setInternal(g.semester, { unregistered: !g.unregistered })}
              style={styles.toggleRow}>
              <View style={[styles.checkbox, g.unregistered && styles.checkboxOn]}>
                {g.unregistered ? <Text style={styles.checkboxMark}>✓</Text> : null}
              </View>
              <Text style={styles.toggleLabel}>미진행 / 미응답</Text>
            </Pressable>
            {!g.unregistered ? (
              <View style={styles.gradeGrid}>
                {S.INTERNAL_SUBJECT_KEYS.map((subj) => (
                  <View key={subj} style={styles.gradeCell}>
                    <Text style={styles.gradeCellLabel}>{subj}</Text>
                    <TextField
                      keyboardType="decimal-pad"
                      onChangeText={(t) => setInternalGrade(g.semester, subj, t)}
                      placeholder="-"
                      style={styles.gradeInput}
                      value={g.grades[subj] ?? ''}
                    />
                  </View>
                ))}
              </View>
            ) : null}
          </RowCard>
        ))}

      <Text style={styles.groupTitle}>모의고사 (최근 3회)</Text>
      {v.mockGrades.map((m, i) => (
        <RowCard key={i} title={`모의 ${i + 1}`}>
          <Pressable
            onPress={() => setMock(i, { unregistered: !m.unregistered })}
            style={styles.toggleRow}>
            <View style={[styles.checkbox, m.unregistered && styles.checkboxOn]}>
              {m.unregistered ? <Text style={styles.checkboxMark}>✓</Text> : null}
            </View>
            <Text style={styles.toggleLabel}>미응시</Text>
          </Pressable>
          {!m.unregistered ? (
            <>
              <SurveyField label="시험명">
                <TextField onChangeText={(t) => setMock(i, { label: t })} placeholder="예) 9월 모평" value={m.label} />
              </SurveyField>
              <Text style={styles.gridLabel}>등급</Text>
              <View style={styles.gradeGrid}>
                {S.MOCK_SUBJECT_KEYS.map((subj) => (
                  <View key={subj} style={styles.gradeCell}>
                    <Text style={styles.gradeCellLabel}>{subj}</Text>
                    <TextField
                      keyboardType="decimal-pad"
                      onChangeText={(t) => setMock(i, { grades: { ...m.grades, [subj]: t } })}
                      placeholder="-"
                      style={styles.gradeInput}
                      value={m.grades[subj] ?? ''}
                    />
                  </View>
                ))}
              </View>
              <Text style={styles.gridLabel}>백분위</Text>
              <View style={styles.gradeGrid}>
                {S.MOCK_SUBJECT_KEYS.map((subj) => (
                  <View key={subj} style={styles.gradeCell}>
                    <Text style={styles.gradeCellLabel}>{subj}</Text>
                    <TextField
                      keyboardType="number-pad"
                      onChangeText={(t) => setMock(i, { percentiles: { ...m.percentiles, [subj]: t } })}
                      placeholder="-"
                      style={styles.gradeInput}
                      value={m.percentiles[subj] ?? ''}
                    />
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </RowCard>
      ))}

      <SurveyField label="수능 최저 충족 자신감">
        <ChipSelect
          onChange={(next) => set({ csatMinimum: next as string })}
          options={opts(S.ADMISSION_CSAT_OPTIONS)}
          value={v.csatMinimum}
        />
      </SurveyField>

      {v.primaryTrack !== '정시 단일' ? (
        <>
          <Text style={styles.groupTitle}>수시 카드 전략 (최대 6장)</Text>
          {v.cardStrategy.map((c, i) => (
            <RowCard key={i} title={`${i + 1}번 카드`}>
              <View style={styles.rowTwo}>
                <View style={{ flex: 1 }}>
                  <SurveyField label="대학">
                    <TextField onChangeText={(t) => setCard(i, { university: t })} placeholder="대학" value={c.university} />
                  </SurveyField>
                </View>
                <View style={{ flex: 1 }}>
                  <SurveyField label="학과">
                    <TextField onChangeText={(t) => setCard(i, { department: t })} placeholder="학과" value={c.department} />
                  </SurveyField>
                </View>
              </View>
              <SurveyField label="전형">
                <ChipSelect
                  onChange={(next) => setCard(i, { track: next as S.AdmissionCardTrack })}
                  options={opts(S.ADMISSION_CARD_TRACK_OPTIONS)}
                  value={c.track}
                />
              </SurveyField>
              <SurveyField label="성향">
                <ChipSelect
                  onChange={(next) => setCard(i, { fit: next as S.AdmissionCardFit })}
                  options={opts(S.ADMISSION_CARD_FIT_OPTIONS)}
                  value={c.fit}
                />
              </SurveyField>
            </RowCard>
          ))}
        </>
      ) : null}

      <SurveyField label="판단 근거">
        <TextField multiline onChangeText={(t) => set({ rationale: t })} placeholder="전형 선택 근거를 적어주세요" value={v.rationale} />
      </SurveyField>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  progressTitle: { ...type.label1, color: colors.textNormal },
  progressTrack: {
    backgroundColor: colors.fillAlt,
    borderRadius: radius.full,
    height: 8,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  progressFill: { backgroundColor: palette.blue50, height: 8 },
  progressHint: { ...type.caption1, color: colors.textAssistive, marginTop: spacing.sm },

  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  rowTitle: { ...type.label1, color: colors.textNormal },
  rowDesc: { ...type.caption1, color: colors.textAssistive, marginTop: 2 },

  submitErr: { ...type.caption1, color: palette.red50 },
  cancel: { ...type.label2, color: palette.blue50 },
  sectionDesc: { ...type.body3, color: colors.textAlternative, lineHeight: 21 },

  editor: { gap: spacing.lg },
  groupTitle: { ...type.label1, color: colors.textNormal, marginTop: spacing.sm },
  rowTwo: { flexDirection: 'row', gap: spacing.md },

  mixRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  mixLabel: { ...type.body3, color: colors.textNormal, width: 64 },
  mixInput: { flex: 1 },
  mixPct: { ...type.body3, color: colors.textAssistive },

  toggleRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  checkbox: {
    alignItems: 'center',
    borderColor: colors.lineStrong,
    borderRadius: 6,
    borderWidth: 1.5,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  checkboxOn: { backgroundColor: palette.blue50, borderColor: palette.blue50 },
  checkboxMark: { color: colors.textOncolor, fontSize: 13, fontWeight: '800' },
  toggleLabel: { ...type.caption1, color: colors.textAlternative },

  gridLabel: { ...type.caption2, color: colors.textAssistive, marginTop: 4 },
  gradeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  gradeCell: { alignItems: 'center', gap: 3, width: '15%' },
  gradeCellLabel: { ...type.caption2, color: colors.textAssistive },
  gradeInput: { paddingHorizontal: 4, paddingVertical: 8, textAlign: 'center', width: '100%' },
});
