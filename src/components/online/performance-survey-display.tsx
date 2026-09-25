import {
  CAREER_LEVELS,
  isPerformanceComplete,
  type PerformanceAnswer,
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
  SurveyTags,
} from "@/components/online/survey-answer-ui";

const CAREER_LABEL: Record<string, string> = Object.fromEntries(
  CAREER_LEVELS.map((c) => [c.value, c.label]),
);

export function PerformanceSurveyDisplay({ value }: { value: PerformanceAnswer }) {
  const complete = isPerformanceComplete(value);
  const empty = value.subjects.every((s) => !s.subject && !s.topic) &&
    value.books.every((b) => !b.title) &&
    !value.careerLevel &&
    value.outputs.length === 0 &&
    !value.legacyText;

  if (empty) {
    return <SurveyEmpty />;
  }

  return (
    <SurveyAnswers>
      {value.legacyText && <LegacyAnswer text={value.legacyText} />}

      {/* 과목별 탐구 */}
      {value.subjects.some((s) => s.subject || s.topic) && (
        <SurveyItem label="과목별 탐구 경험">
          <SurveyEntries>
            {value.subjects.map((s, i) => (
              <SurveyEntry key={i}>
                <SurveyEntryHead>
                  <span className="t4-bold">{s.subject || <Missing>과목 미입력</Missing>}</span>
                  <span className="text-fg-neutral-subtle" aria-hidden>·</span>
                  <span>{s.topic || <Missing>주제 미입력</Missing>}</span>
                </SurveyEntryHead>
                {s.methods.length > 0 && (
                  <div className="mt-x2">
                    <SurveyTags>
                      {s.methods.map((m) => (
                        <SurveyTag key={m}>
                          {m === "기타" && s.methodOther ? `기타: ${s.methodOther}` : m}
                        </SurveyTag>
                      ))}
                    </SurveyTags>
                  </div>
                )}
                {s.selfRole && <SurveyField label="주도 부분">{s.selfRole}</SurveyField>}
              </SurveyEntry>
            ))}
          </SurveyEntries>
        </SurveyItem>
      )}

      {/* 교과 연계 독서 */}
      {value.books.some((b) => b.title) && (
        <SurveyItem label="교과 연계 독서">
          <SurveyEntries>
            {value.books.map((b, i) => (
              <SurveyEntry key={i}>
                <SurveyEntryHead>
                  <span className="t4-bold">{b.title || <Missing>제목 미입력</Missing>}</span>
                  {b.linkedSubject && <SurveyTag>{b.linkedSubject}</SurveyTag>}
                </SurveyEntryHead>
                {b.reason && <SurveyField label="읽은 이유">{b.reason}</SurveyField>}
                {b.expansion && <SurveyField label="확장 탐구">{b.expansion}</SurveyField>}
              </SurveyEntry>
            ))}
          </SurveyEntries>
        </SurveyItem>
      )}

      {/* 진로 탐색 */}
      {value.careerLevel && (
        <SurveyItem label="진로 탐색 수준">
          <div className="flex flex-wrap items-center gap-x2">
            <SurveyTag>{CAREER_LABEL[value.careerLevel] ?? value.careerLevel}</SurveyTag>
            {value.careerLevel === "specified" && value.careerDetail && (
              <span className="break-words">
                <span className="text-fg-neutral-subtle" aria-hidden>→ </span>
                {value.careerDetail}
              </span>
            )}
          </div>
        </SurveyItem>
      )}

      {/* 활동 결과물 */}
      {value.outputs.length > 0 && (
        <SurveyItem label="활동 결과물">
          <SurveyTags>
            {value.outputs.map((o) => (
              <SurveyTag key={o}>
                {o === "기타" && value.outputOther ? `기타: ${value.outputOther}` : o}
              </SurveyTag>
            ))}
          </SurveyTags>
        </SurveyItem>
      )}

      {!complete && <IncompleteNote />}
    </SurveyAnswers>
  );
}
