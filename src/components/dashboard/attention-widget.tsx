import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TagPill } from "@/components/ui/tag-pill";
import { cn } from "@/lib/utils";
import type { AttentionStudent } from "@/lib/attention";

/**
 * 대시보드 — 유의 관찰 학생 위젯.
 * 수동 플래그 + 자동 판별 결과를 사유와 함께 노출. 목록이 비면 렌더하지 않음.
 */
export function AttentionWidget({ students }: { students: AttentionStudent[] }) {
  if (students.length === 0) return null;

  return (
    <Card className="rounded-[12px] border-line shadow-[var(--shadow-xs)] overflow-hidden">
      <CardHeader className="flex flex-row items-center gap-2 py-[14px] px-[18px] border-b border-line-2">
        <AlertTriangle className="h-4 w-4 text-warn" />
        <CardTitle className="text-[13.5px] font-[650] tracking-[-0.015em] text-ink m-0">
          유의 관찰 학생
        </CardTitle>
        <span className="ml-auto text-[11.5px] text-ink-4 font-mono tabular-nums">
          {students.length}명
        </span>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-72 overflow-y-auto">
          {students.map((s) => (
            <Link key={s.studentId} href={`/students/${s.studentId}`}>
              <div className="flex items-center gap-2.5 px-[18px] py-[10px] border-b border-line-2 last:border-b-0 hover:bg-panel-2 text-[12.5px]">
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full shrink-0",
                    s.severity === "high" ? "bg-bad" : "bg-warn",
                  )}
                />
                <span className="font-semibold text-ink tracking-[-0.01em] shrink-0">{s.name}</span>
                <span className="text-[11px] text-ink-4 shrink-0">{s.grade}</span>
                {s.isManual && <TagPill variant="brand">수동</TagPill>}
                <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
                  {s.reasons.slice(0, 2).map((r, i) => (
                    <TagPill
                      key={i}
                      variant={
                        r.kind === "manual" ? "neutral" : s.severity === "high" ? "bad" : "warn"
                      }
                    >
                      {r.label}
                    </TagPill>
                  ))}
                  {s.reasons.length > 2 && (
                    <span className="text-[10.5px] text-ink-4">+{s.reasons.length - 2}</span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
