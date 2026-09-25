import {
  isStrengthsWeaknessesComplete,
  type StrengthsWeaknessesAnswer,
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
import { cn } from "@/lib/utils";

export function StrengthsWeaknessesSurveyDisplay({ value }: { value: StrengthsWeaknessesAnswer }) {
  const complete = isStrengthsWeaknessesComplete(value);
  const empty =
    value.bySubject.every((s) => !s.subject && !s.level) &&
    value.studyHabits.length === 0 &&
    !value.focusMinutes.trim() &&
    value.testAnxiety === 0 &&
    value.selfDirection === 0 &&
    !value.legacyText;

  if (empty) return <SurveyEmpty />;

  return (
    <SurveyAnswers>
      {value.legacyText && <LegacyAnswer text={value.legacyText} />}

      {/* 과목별 강·약 */}
      {value.bySubject.some((s) => s.subject || s.level) && (
        <SurveyItem label="과목별 강·약">
          <SurveyEntries>
            {value.bySubject.map((s, i) => {
              const filled = s.subject || s.level || s.internalGrade || s.mockGrade || s.weakAreas.length || s.reason;
              if (!filled) return null;
              return (
                <SurveyEntry key={i}>
                  <SurveyEntryHead>
                    <span className="t4-bold">{s.subject || <Missing>과목 미입력</Missing>}</span>
                    {s.level && (
                      <SurveyTag tone={s.level === "강" ? "ok" : s.level === "중" ? "warn" : "bad"}>
                        {s.level}
                      </SurveyTag>
                    )}
                    {(s.internalGrade || s.mockGrade) && (
                      <span className="t3-regular tabular-nums text-fg-neutral-subtle">
                        내신 {s.internalGrade || "-"} / 모의 {s.mockGrade || "-"}
                      </span>
                    )}
                  </SurveyEntryHead>
                  {s.weakAreas.length > 0 && (
                    <div className="mt-x2">
                      <SurveyTags>
                        {s.weakAreas.map((a) => (
                          <SurveyTag key={a}>
                            {a === "기타" && s.weakAreaOther ? `기타: ${s.weakAreaOther}` : a}
                          </SurveyTag>
                        ))}
                      </SurveyTags>
                    </div>
                  )}
                  {s.reason && <SurveyField label="사유">{s.reason}</SurveyField>}
                </SurveyEntry>
              );
            })}
          </SurveyEntries>
        </SurveyItem>
      )}

      {/* 학습 습관 */}
      {value.studyHabits.length > 0 && (
        <SurveyItem label="학습 습관">
          <SurveyTags>
            {value.studyHabits.map((h) => (
              <SurveyTag key={h}>{h}</SurveyTag>
            ))}
          </SurveyTags>
        </SurveyItem>
      )}

      {/* 집중 가능 시간 */}
      {value.focusMinutes.trim() && (
        <SurveyItem label="평균 집중 가능 시간">
          <p>
            <span className="t4-bold tabular-nums">{value.focusMinutes}</span>
            <span className="ml-x1 text-fg-neutral-subtle">분</span>
          </p>
        </SurveyItem>
      )}

      {/* 시험 불안도 */}
      {value.testAnxiety > 0 && (
        <SurveyItem label="시험 불안도">
          <ScaleDisplay value={value.testAnxiety} />
        </SurveyItem>
      )}

      {/* 자기주도 수준 */}
      {value.selfDirection > 0 && (
        <SurveyItem label="자기주도 수준">
          <ScaleDisplay value={value.selfDirection} />
        </SurveyItem>
      )}

      {!complete && <IncompleteNote />}
    </SurveyAnswers>
  );
}

/** 1–5 척도 — 고른 칸만 반전 채움 */
function ScaleDisplay({ value }: { value: number }) {
  return (
    <div className="inline-flex gap-x1" role="img" aria-label={`5점 중 ${value}점`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          aria-hidden
          className={cn(
            "inline-flex size-x7 items-center justify-center rounded-r2 t3-bold tabular-nums",
            n === value
              ? "bg-bg-neutral-inverted text-fg-neutral-inverted"
              : "bg-bg-neutral-weak text-fg-neutral-subtle",
          )}
        >
          {n}
        </span>
      ))}
    </div>
  );
}
