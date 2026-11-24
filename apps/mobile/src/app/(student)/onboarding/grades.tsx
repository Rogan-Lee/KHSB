import { useState } from 'react';
import { View } from 'react-native';

import { CheckToggle, FormSection, GridChoice } from '@/components/survey-ui';
import { Button, ErrorState, LoadingState, Screen, space, Text, TextField } from '@/design';
import {
  GRADE_SUBJECTS,
  useEntryOnboarding,
  useEntrySave,
  type EntryOnboardingResponse,
  type SubjectGrades,
} from '@/lib/api/student-onboarding';

/** 입실 준비 — 성적 (최근 모의고사·최근 내신, 과목별 등급 1~9) */

const TITLE = '성적';
const GRADE_OPTIONS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

type Group = { none: boolean; label: string; scores: SubjectGrades };

export default function EntryGradesScreen() {
  const { data, error, retry } = useEntryOnboarding();
  if (!data) {
    return (
      <Screen kind="push" title={TITLE} surface="panel" backFallback="/(student)/onboarding">
        {error ? <ErrorState message={error} onRetry={() => void retry()} /> : <LoadingState />}
      </Screen>
    );
  }
  return <GradesForm saved={data.grades} />;
}

function GradesForm({ saved }: { saved: EntryOnboardingResponse['grades'] }) {
  // 저장한 적이 있는데 null 이면 "아직 없어요"를 골랐던 것
  const [mock, setMock] = useState<Group>(() =>
    saved?.mock
      ? { none: false, label: saved.mock.examName, scores: saved.mock.scores }
      : { none: !!saved, label: '', scores: {} },
  );
  const [school, setSchool] = useState<Group>(() =>
    saved?.school
      ? { none: false, label: saved.school.term, scores: saved.school.scores }
      : { none: !!saved, label: '', scores: {} },
  );
  const { save, saving, error } = useEntrySave('grades');

  const scoresOf = (g: Group) => Object.fromEntries(GRADE_SUBJECTS.map((sub) => [sub, g.scores[sub] ?? null]));
  const submit = () =>
    void save({
      mock: mock.none ? null : { examName: mock.label.trim(), scores: scoresOf(mock) },
      school: school.none ? null : { term: school.label.trim(), scores: scoresOf(school) },
    });

  return (
    <Screen
      kind="push"
      title={TITLE}
      surface="panel"
      backFallback="/(student)/onboarding"
      footer={
        <View style={{ gap: space.x2 }}>
          {error && (
            <Text variant="t4-regular" color="critical" align="center" accessibilityLiveRegion="polite">
              {error}
            </Text>
          )}
          <Button variant="primary" size="xl" block loading={saving} onPress={submit}>
            저장하기
          </Button>
        </View>
      }>
      <View style={{ paddingTop: space.x4, gap: space.x10 }}>
        <Text variant="t5-regular" color="neutralMuted">
          가장 최근에 본 시험의 등급을 골라 주세요. 모르는 과목은 비워 두면 돼요.
        </Text>
        <GroupEditor
          title="최근 모의고사"
          fieldLabel="시험 이름"
          placeholder="2026년 9월 모의평가"
          value={mock}
          onChange={setMock}
        />
        <GroupEditor
          title="최근 내신"
          fieldLabel="학기"
          placeholder="2학년 1학기"
          value={school}
          onChange={setSchool}
        />
      </View>
    </Screen>
  );
}

function GroupEditor({
  title,
  fieldLabel,
  placeholder,
  value,
  onChange,
}: {
  title: string;
  fieldLabel: string;
  placeholder: string;
  value: Group;
  onChange: (fn: (prev: Group) => Group) => void;
}) {
  return (
    <FormSection
      title={title}
      aside={
        <CheckToggle
          label="아직 없어요"
          checked={value.none}
          onChange={(none) => onChange((g) => ({ ...g, none }))}
        />
      }>
      {!value.none && (
        <View style={{ gap: space.x5 }}>
          <TextField
            label={fieldLabel}
            value={value.label}
            onChangeText={(label) => onChange((g) => ({ ...g, label }))}
            placeholder={placeholder}
            maxLength={40}
            autoComplete="off"
            autoCorrect={false}
            returnKeyType="done"
          />
          {GRADE_SUBJECTS.map((sub) => {
            const current = value.scores[sub];
            return (
              <View key={sub} style={{ gap: space.x2 }}>
                <Text variant="t5-medium">{sub}</Text>
                {/* 같은 등급을 다시 누르면 해제(null) */}
                <GridChoice
                  options={GRADE_OPTIONS}
                  value={current == null ? '' : String(current)}
                  onChange={(v) =>
                    onChange((g) => ({
                      ...g,
                      scores: { ...g.scores, [sub]: g.scores[sub] === Number(v) ? null : Number(v) },
                    }))
                  }
                  itemLabel={(o) => `${title} ${sub} ${o.label}등급`}
                />
              </View>
            );
          })}
        </View>
      )}
    </FormSection>
  );
}
