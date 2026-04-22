"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Save } from "lucide-react";
import { saveExamSessionScores, BulkScoreRow } from "@/actions/exam-sessions";

type Participant = {
  studentId: string;
  name: string;
  grade: string;
  seatNumber: number;
};

type ExistingScore = {
  studentId: string;
  subject: string;
  rawScore: number | null;
  grade: number | null;
  percentile: number | null;
  notes: string | null;
};

type FieldKey = "rawScore" | "grade" | "percentile";

const FIELD_LABELS: Record<FieldKey, string> = {
  rawScore: "원점수",
  grade: "등급",
  percentile: "백분위",
};

type CellKey = string; // `${studentId}|${subject}|${field}`
function cellKey(sid: string, subj: string, field: FieldKey): CellKey {
  return `${sid}|${subj}|${field}`;
}

export function ExamScoreBulkEditor({
  sessionId,
  subjects,
  participants,
  existing,
}: {
  sessionId: string;
  subjects: string[];
  participants: Participant[];
  existing: ExistingScore[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fieldMode, setFieldMode] = useState<FieldKey>("grade");

  // 초기값: existing → value map (field별로 각각)
  const initialMap = useMemo(() => {
    const m: Record<CellKey, string> = {};
    for (const e of existing) {
      if (e.rawScore != null) m[cellKey(e.studentId, e.subject, "rawScore")] = String(e.rawScore);
      if (e.grade != null) m[cellKey(e.studentId, e.subject, "grade")] = String(e.grade);
      if (e.percentile != null) m[cellKey(e.studentId, e.subject, "percentile")] = String(e.percentile);
    }
    return m;
  }, [existing]);

  const [values, setValues] = useState<Record<CellKey, string>>(initialMap);

  function setCell(sid: string, subj: string, field: FieldKey, raw: string) {
    setValues((prev) => ({ ...prev, [cellKey(sid, subj, field)]: raw }));
  }

  function handleSave() {
    // 학생별 × 과목별 합치기
    const rows: BulkScoreRow[] = participants.map((p) => {
      const scores = subjects.map((subj) => {
        const raw = values[cellKey(p.studentId, subj, "rawScore")];
        const gr = values[cellKey(p.studentId, subj, "grade")];
        const pc = values[cellKey(p.studentId, subj, "percentile")];
        return {
          subject: subj,
          rawScore: parseNumOrNull(raw),
          grade: parseNumOrNull(gr),
          percentile: parseNumOrNull(pc),
          notes: null,
        };
      });
      return { studentId: p.studentId, scores };
    });

    startTransition(async () => {
      try {
        const res = await saveExamSessionScores(sessionId, rows);
        alert(`성적 ${res.saved}건 저장 완료`);
        router.refresh();
      } catch (e) {
        alert(e instanceof Error ? e.message : "저장 실패");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-muted-foreground">입력 필드:</span>
        <div className="inline-flex rounded-md border overflow-hidden text-xs">
          {(Object.keys(FIELD_LABELS) as FieldKey[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFieldMode(f)}
              className={cn(
                "px-3 py-1.5 transition-colors border-l first:border-l-0",
                fieldMode === f ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
              )}
            >
              {FIELD_LABELS[f]}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-muted-foreground">
          같은 데이터를 등급/원점수/백분위 중 무엇이든 입력 가능 — 필드 토글로 교차 입력
        </span>
        <Button onClick={handleSave} disabled={pending} className="ml-auto">
          <Save className="h-4 w-4 mr-1" />
          {pending ? "저장 중…" : "전체 저장"}
        </Button>
      </div>

      <div className="overflow-x-auto border rounded-md">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-xs">
            <tr>
              <th className="p-2 text-left sticky left-0 bg-muted/60 z-10 min-w-[140px]">응시자</th>
              <th className="p-2 text-left w-16">좌석</th>
              {subjects.map((s) => (
                <th key={s} className="p-2 text-center min-w-[100px]">
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {participants.map((p) => (
              <tr key={p.studentId} className="border-t">
                <td className="p-2 sticky left-0 bg-background font-medium">
                  {p.name} <span className="text-xs text-muted-foreground ml-1">({p.grade})</span>
                </td>
                <td className="p-2 text-xs text-muted-foreground">{p.seatNumber}</td>
                {subjects.map((subj) => (
                  <td key={subj} className="p-1">
                    <input
                      type="number"
                      step={fieldMode === "percentile" ? "0.01" : "1"}
                      min={0}
                      value={values[cellKey(p.studentId, subj, fieldMode)] ?? ""}
                      onChange={(e) => setCell(p.studentId, subj, fieldMode, e.target.value)}
                      placeholder={FIELD_LABELS[fieldMode]}
                      className="w-full border rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted-foreground">
        저장 시 이 세션에 연결된 기존 성적을 교체하고 빈 값은 저장하지 않습니다. 저장된 성적은 학생 상세 페이지의 모의고사 추이에 반영됩니다.
      </p>
    </div>
  );
}

function parseNumOrNull(raw: string | undefined): number | null {
  if (!raw || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
