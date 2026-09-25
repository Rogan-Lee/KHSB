import {
  HISTORY_MIX_KEYS,
  HISTORY_MIX_LABELS,
  isHistoryComplete,
  type HistoryAnswer,
} from "@/lib/online/survey-template";
import { DescriptionList } from "@/components/backoffice/ui";
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

export function HistorySurveyDisplay({ value }: { value: HistoryAnswer }) {
  const complete = isHistoryComplete(value);
  const empty =
    value.hasPriorEducation === "" &&
    !value.studyPlace &&
    value.priorConsulting.had === "" &&
    HISTORY_MIX_KEYS.every((k) => value.currentMix[k] === 0) &&
    !value.legacyText;

  if (empty) {
    return <SurveyEmpty />;
  }

  const mixSum = HISTORY_MIX_KEYS.reduce((acc, k) => acc + value.currentMix[k], 0);

  return (
    <SurveyAnswers>
      {value.legacyText && <LegacyAnswer text={value.legacyText} />}

      {/* 이전 학습 경험 */}
      {value.hasPriorEducation && (
        <SurveyItem label="이전 학습 경험">
          {value.hasPriorEducation === "no" ? (
            <p>없음</p>
          ) : (
            <SurveyEntries>
              {value.priorEducation.map((p, i) => (
                <SurveyEntry key={i}>
                  <SurveyEntryHead>
                    <span className="t4-bold">{p.institution || <Missing>기관 미입력</Missing>}</span>
                    {p.format && <SurveyTag>{p.format}</SurveyTag>}
                    {(p.periodFrom || p.periodTo) && (
                      <span className="t3-regular tabular-nums text-fg-neutral-subtle">
                        {p.periodFrom || "?"} ~ {p.periodTo || "?"}
                      </span>
                    )}
                  </SurveyEntryHead>
                  {p.subjects.length > 0 && (
                    <div className="mt-x2">
                      <SurveyTags>
                        {p.subjects.map((s) => (
                          <SurveyTag key={s}>
                            {s === "기타" && p.subjectOther ? `기타: ${p.subjectOther}` : s}
                          </SurveyTag>
                        ))}
                      </SurveyTags>
                    </div>
                  )}
                  {p.quitReason && <SurveyField label="그만둔 이유">{p.quitReason}</SurveyField>}
                </SurveyEntry>
              ))}
            </SurveyEntries>
          )}
        </SurveyItem>
      )}

      {/* 학습 시간 분배 */}
      {mixSum > 0 && (
        <SurveyItem
          label="학습 시간 분배"
          trailing={
            <span className={cn("t3-bold tabular-nums", mixSum === 100 ? "text-fg-positive" : "text-fg-warning")}>
              합계 {mixSum}%
            </span>
          }
        >
          <dl className="grid max-w-md grid-cols-2 gap-x-x6 gap-y-x2">
            {HISTORY_MIX_KEYS.map((k) => (
              <div key={k} className="flex items-center justify-between gap-x2">
                <dt className="text-fg-neutral-muted">{HISTORY_MIX_LABELS[k]}</dt>
                <dd className="t4-bold tabular-nums">{value.currentMix[k]}%</dd>
              </div>
            ))}
          </dl>
        </SurveyItem>
      )}

      {/* 학습 장소 */}
      {value.studyPlace && (
        <SurveyItem label="주 학습 장소">
          <div className="flex flex-wrap items-center gap-x2">
            <SurveyTag>{value.studyPlace}</SurveyTag>
            {value.studyPlace === "기타" && value.studyPlaceOther && (
              <span className="break-words">
                <span className="text-fg-neutral-subtle" aria-hidden>→ </span>
                {value.studyPlaceOther}
              </span>
            )}
          </div>
        </SurveyItem>
      )}

      {/* 입시 컨설팅 */}
      {value.priorConsulting.had && (
        <SurveyItem label="이전 입시 컨설팅">
          {value.priorConsulting.had === "no" ? (
            <p>없음</p>
          ) : (
            <DescriptionList
              cols={3}
              items={[
                { label: "기관", value: value.priorConsulting.institution || <Missing /> },
                { label: "시기", value: value.priorConsulting.period || <Missing /> },
                {
                  label: "만족도",
                  value: value.priorConsulting.satisfaction ? (
                    <span className="tabular-nums">{value.priorConsulting.satisfaction} / 5</span>
                  ) : (
                    <Missing />
                  ),
                },
              ]}
            />
          )}
        </SurveyItem>
      )}

      {!complete && <IncompleteNote />}
    </SurveyAnswers>
  );
}
