import {
  INTERNAL_SUBJECT_KEYS,
  MOCK_SUBJECT_KEYS,
  isAdmissionTypeComplete,
  type AdmissionTypeAnswer,
} from "@/lib/online/survey-template";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  IncompleteNote,
  LegacyAnswer,
  Missing,
  SurveyAnswers,
  SurveyEmpty,
  SurveyEntries,
  SurveyEntry,
  SurveyEntryHead,
  SurveyItem,
  SurveyTag,
} from "@/components/online/survey-answer-ui";

// 설문 등급 표 — 좁은 칸, 가운데 정렬, 읽기 전용이라 행 호버 없음
const TABLE_WRAP = "overflow-hidden rounded-r2 border border-stroke-neutral-muted";
const HEAD_CELL = "h-auto px-x2 py-x2 text-center";
const BODY_CELL = "h-auto px-x2 py-x2 text-center tabular-nums";
const ROW = "hover:bg-transparent";

export function AdmissionTypeSurveyDisplay({
  value,
  gradeNumber,
}: {
  value: AdmissionTypeAnswer;
  gradeNumber: 1 | 2 | 3 | null;
}) {
  const complete = isAdmissionTypeComplete(value, gradeNumber);
  const hasInternal = value.internalGrades.some(
    (g) => !g.unregistered && INTERNAL_SUBJECT_KEYS.some((k) => g.grades[k]?.trim()),
  );
  const registeredMocks = value.mockGrades.filter((m) => !m.unregistered && (m.label || MOCK_SUBJECT_KEYS.some((k) => m.grades[k]?.trim() || m.percentiles[k]?.trim())));
  const filledCards = value.cardStrategy.filter(
    (c) => c.university.trim() || c.department.trim() || c.track || c.fit,
  );
  const empty =
    !value.primaryTrack &&
    !hasInternal &&
    registeredMocks.length === 0 &&
    !value.csatMinimum &&
    filledCards.length === 0 &&
    !value.rationale.trim() &&
    !value.legacyText;

  if (empty) return <SurveyEmpty />;

  const isJeongsiOnly = value.primaryTrack === "정시 단일";

  return (
    <SurveyAnswers>
      {value.legacyText && <LegacyAnswer text={value.legacyText} />}

      {/* 주력 전형 */}
      {value.primaryTrack && (
        <SurveyItem label="주력 전형">
          <SurveyTag>{value.primaryTrack}</SurveyTag>
        </SurveyItem>
      )}

      {/* 내신 */}
      {hasInternal && (
        <SurveyItem label="내신 등급">
          <div className={TABLE_WRAP}>
            <Table>
              <TableHeader>
                <TableRow className={ROW}>
                  <TableHead className={`${HEAD_CELL} text-left`}>학기</TableHead>
                  {INTERNAL_SUBJECT_KEYS.map((k) => (
                    <TableHead key={k} className={HEAD_CELL}>{k}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {value.internalGrades
                  .filter((g) => !g.unregistered && INTERNAL_SUBJECT_KEYS.some((k) => g.grades[k]?.trim()))
                  .map((g) => (
                    <TableRow key={g.semester} className={ROW}>
                      <TableCell className={`${BODY_CELL} whitespace-nowrap text-left t4-medium`}>{g.semester}</TableCell>
                      {INTERNAL_SUBJECT_KEYS.map((k) => (
                        <TableCell key={k} className={BODY_CELL}>
                          {g.grades[k]?.trim() || <Missing>-</Missing>}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </SurveyItem>
      )}

      {/* 모의 */}
      {registeredMocks.length > 0 && (
        <SurveyItem label="모의고사 등급">
          <div className="flex flex-col gap-x4">
            {registeredMocks.map((m, i) => (
              <div key={i}>
                <p className="mb-x2 t4-bold">{m.label || <Missing>회차 미입력</Missing>}</p>
                <div className={TABLE_WRAP}>
                  <Table>
                    <TableHeader>
                      <TableRow className={ROW}>
                        <TableHead className={`${HEAD_CELL} w-16 text-left`}>항목</TableHead>
                        {MOCK_SUBJECT_KEYS.map((k) => (
                          <TableHead key={k} className={HEAD_CELL}>{k}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow className={ROW}>
                        <TableCell className={`${BODY_CELL} whitespace-nowrap text-left text-fg-neutral-muted`}>등급</TableCell>
                        {MOCK_SUBJECT_KEYS.map((k) => (
                          <TableCell key={k} className={BODY_CELL}>
                            {m.grades[k]?.trim() || <Missing>-</Missing>}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow className={ROW}>
                        <TableCell className={`${BODY_CELL} whitespace-nowrap text-left text-fg-neutral-muted`}>백분위</TableCell>
                        {MOCK_SUBJECT_KEYS.map((k) => (
                          <TableCell key={k} className={BODY_CELL}>
                            {m.percentiles[k]?.trim() || <Missing>-</Missing>}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))}
          </div>
        </SurveyItem>
      )}

      {/* 수능 최저 */}
      {value.csatMinimum && (
        <SurveyItem label="수능 최저 충족 자신감">
          <SurveyTag>{value.csatMinimum}</SurveyTag>
        </SurveyItem>
      )}

      {/* 수시 카드 */}
      {!isJeongsiOnly && filledCards.length > 0 && (
        <SurveyItem
          label="수시 카드 전략"
          trailing={<span className="tabular-nums">· {filledCards.length}장 입력</span>}
        >
          <SurveyEntries>
            {value.cardStrategy.map((c, i) => {
              const filled = c.university || c.department || c.track || c.fit;
              if (!filled) return null;
              return (
                <SurveyEntry key={i}>
                  <SurveyEntryHead>
                    <span className="t3-bold tabular-nums text-fg-brand">카드 {i + 1}</span>
                    <span className="t4-bold">{c.university || <Missing>대학 미입력</Missing>}</span>
                    <span className="text-fg-neutral-subtle" aria-hidden>·</span>
                    <span>{c.department || <Missing>학과 미입력</Missing>}</span>
                    {c.track && <SurveyTag>{c.track}</SurveyTag>}
                    {c.fit && <SurveyTag>{c.fit}</SurveyTag>}
                  </SurveyEntryHead>
                </SurveyEntry>
              );
            })}
          </SurveyEntries>
        </SurveyItem>
      )}

      {/* 판단 근거 */}
      {value.rationale.trim() && (
        <SurveyItem label="판단 근거">
          <p className="whitespace-pre-wrap break-words">{value.rationale}</p>
        </SurveyItem>
      )}

      {!complete && <IncompleteNote />}
    </SurveyAnswers>
  );
}
