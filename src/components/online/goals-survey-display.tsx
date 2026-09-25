import {
  ASPIRATION_LABELS,
  GOALS_PRIORITY_AXIS_OPTIONS,
  GOALS_CAREER_ALIGNMENT_OPTIONS,
  isGoalsComplete,
  type GoalsAnswer,
} from "@/lib/online/survey-template";
import {
  IncompleteNote,
  LegacyAnswer,
  Missing,
  SurveyAnswers,
  SurveyEmpty,
  SurveyEntries,
  SurveyEntry,
  SurveyEntryHead,
  SurveyField,
  SurveyItem,
  SurveyTag,
} from "@/components/online/survey-answer-ui";

const PRIORITY_AXIS_LABEL: Record<string, string> = Object.fromEntries(
  GOALS_PRIORITY_AXIS_OPTIONS.map((o) => [o.value, o.label]),
);
const CAREER_LABEL: Record<string, string> = Object.fromEntries(
  GOALS_CAREER_ALIGNMENT_OPTIONS.map((o) => [o.value, o.label]),
);

export function GoalsSurveyDisplay({ value }: { value: GoalsAnswer }) {
  const complete = isGoalsComplete(value);
  const empty =
    value.aspirations.every((a) => !a.university && !a.department) &&
    !value.priorityAxis &&
    !value.careerAlignment &&
    !value.legacyText;

  if (empty) {
    return <SurveyEmpty />;
  }

  return (
    <SurveyAnswers>
      {value.legacyText && <LegacyAnswer text={value.legacyText} />}

      {/* 1·2·3지망 */}
      {value.aspirations.some((a) => a.university || a.department) && (
        <SurveyItem label="희망 대학·학과">
          <SurveyEntries>
            {value.aspirations.map((a, i) => {
              const filled = a.university || a.department || a.track || a.fit || a.reason;
              if (!filled) {
                return (
                  <SurveyEntry key={i} muted>
                    <SurveyEntryHead>
                      <span className="t3-bold text-fg-neutral-subtle">{ASPIRATION_LABELS[i]}</span>
                      <Missing />
                    </SurveyEntryHead>
                  </SurveyEntry>
                );
              }
              return (
                <SurveyEntry key={i}>
                  <SurveyEntryHead>
                    <span className="t3-bold text-fg-brand">{ASPIRATION_LABELS[i]}</span>
                    <span className="t4-bold">{a.university || <Missing>대학 미입력</Missing>}</span>
                    <span className="text-fg-neutral-subtle" aria-hidden>·</span>
                    <span>{a.department || <Missing>학과 미입력</Missing>}</span>
                    {a.track && <SurveyTag>{a.track}</SurveyTag>}
                    {a.fit && <SurveyTag>{a.fit}</SurveyTag>}
                  </SurveyEntryHead>
                  {a.reason && <SurveyField label="선택 이유">{a.reason}</SurveyField>}
                </SurveyEntry>
              );
            })}
          </SurveyEntries>
        </SurveyItem>
      )}

      {/* 우선순위 축 */}
      {value.priorityAxis && (
        <SurveyItem label="우선순위 축">
          <SurveyTag>{PRIORITY_AXIS_LABEL[value.priorityAxis] ?? value.priorityAxis}</SurveyTag>
        </SurveyItem>
      )}

      {/* 진로 일치 */}
      {value.careerAlignment && (
        <SurveyItem label="진로 일치 여부">
          <SurveyTag>{CAREER_LABEL[value.careerAlignment] ?? value.careerAlignment}</SurveyTag>
        </SurveyItem>
      )}

      {!complete && <IncompleteNote />}
    </SurveyAnswers>
  );
}
