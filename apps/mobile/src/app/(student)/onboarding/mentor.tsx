import { useState } from 'react';
import { View } from 'react-native';

import { CheckBoxGroup, ChoiceField, SelectBoxGroup } from '@/components/survey-ui';
import { Button, ErrorState, LoadingState, Screen, space, Text, TextField } from '@/design';
import {
  useEntryOnboarding,
  useEntrySave,
  type EntryMentor,
  type MentorQuestion,
} from '@/lib/api/student-onboarding';

/** 입실 준비 — 멘토 매칭 설문 (질문은 서버 응답대로 그린다) */

const TITLE = '멘토 매칭 설문';

export default function EntryMentorScreen() {
  const { data, error, retry } = useEntryOnboarding();
  if (!data) {
    return (
      <Screen kind="push" title={TITLE} surface="panel" backFallback="/(student)/onboarding">
        {error ? (
          <ErrorState message={error} onRetry={() => void retry()} />
        ) : (
          <LoadingState />
        )}
      </Screen>
    );
  }
  return <MentorForm questions={data.mentor.questions} saved={data.mentor.answers?.answers ?? {}} />;
}

const isBlank = (v: string | string[] | undefined) => (Array.isArray(v) ? v.length === 0 : !v?.trim());

function MentorForm({ questions, saved }: { questions: MentorQuestion[]; saved: EntryMentor }) {
  const [answers, setAnswers] = useState<EntryMentor>(saved);
  const { save, saving, error, setError } = useEntrySave('mentor');
  const set = (key: string, v: string | string[]) => setAnswers((a) => ({ ...a, [key]: v }));

  const submit = () => {
    const missing = questions.find((q) => q.required && isBlank(answers[q.key]));
    if (missing) {
      setError(`"${missing.title}"에 답해 주세요`);
      return;
    }
    const body: EntryMentor = {};
    for (const q of questions) {
      const v = answers[q.key];
      if (v !== undefined) body[q.key] = typeof v === 'string' ? v.trim() : v;
    }
    void save({ answers: body });
  };

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
      <View style={{ paddingTop: space.x4, gap: space.x8 }}>
        <Text variant="t5-regular" color="neutralMuted">
          나와 잘 맞는 멘토를 정하는 데 참고해요.
        </Text>
        {questions.map((q) => {
          const indicator = q.required ? '필수' : '선택';
          const v = answers[q.key];
          if (q.kind === 'text') {
            return (
              <TextField
                key={q.key}
                label={q.title}
                indicator={indicator}
                value={typeof v === 'string' ? v : ''}
                onChangeText={(t) => set(q.key, t)}
                placeholder={q.placeholder}
                multiline
                minHeight={96}
                maxLength={500}
                autoComplete="off"
              />
            );
          }
          const options = (q.options ?? []).map((o) => ({ value: o, label: o, description: q.hints?.[o] }));
          return (
            <ChoiceField key={q.key} label={q.title} indicator={indicator}>
              {q.kind === 'multi' ? (
                <CheckBoxGroup
                  options={options}
                  values={Array.isArray(v) ? v : []}
                  onToggle={(o) =>
                    setAnswers((a) => {
                      const list = Array.isArray(a[q.key]) ? (a[q.key] as string[]) : [];
                      return { ...a, [q.key]: list.includes(o) ? list.filter((x) => x !== o) : [...list, o] };
                    })
                  }
                />
              ) : (
                <SelectBoxGroup options={options} value={typeof v === 'string' ? v : ''} onChange={(o) => set(q.key, o)} />
              )}
            </ChoiceField>
          );
        })}
      </View>
    </Screen>
  );
}
