import { prisma } from "@/lib/prisma";
import { BookOpen } from "lucide-react";
import { VocabTrendMiniChartView } from "./vocab-trend-mini-chart-view";

interface Props {
  studentId: string;
  fromDate?: Date;
  toDate?: Date;
  /** 섹션 헤더 제목. 기본 "영단어 학습 추이". */
  title?: string;
}

/**
 * 학부모/멘토링 리포트에 노출하는 영단어 학습 추이 미니차트.
 *
 * - 서버 컴포넌트: 토큰/게이트 통과한 리포트 페이지에서 호출되며, 직접 Prisma 로 조회.
 *   (Sprint 1 PR 1.3 — `getStudentVocabHistory` 와 동일한 read shape)
 * - 데이터가 비어 있으면 섹션 자체를 렌더하지 않음.
 */
export async function VocabTrendMiniChart({
  studentId,
  fromDate,
  toDate,
  title = "영단어 학습 추이",
}: Props) {
  const where: { studentId: string; testDate?: { gte?: Date; lte?: Date } } = { studentId };
  if (fromDate || toDate) {
    where.testDate = {};
    if (fromDate) where.testDate.gte = fromDate;
    if (toDate) where.testDate.lte = toDate;
  }

  const scores = await prisma.vocabTestScore.findMany({
    where,
    orderBy: { testDate: "asc" },
    select: {
      id: true,
      testDate: true,
      totalWords: true,
      correctWords: true,
      score: true,
    },
  });

  if (scores.length === 0) return null;

  const total = scores.length;
  const avgScore = Math.round((scores.reduce((s, r) => s + r.score, 0) / total) * 10) / 10;

  const data = scores.map((s) => ({
    date: s.testDate.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" }),
    isoDate: s.testDate.toISOString().slice(0, 10),
    score: Math.round(s.score * 10) / 10,
    correctWords: s.correctWords,
    totalWords: s.totalWords,
  }));

  return (
    <section className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
      <div className="px-5 py-4 border-b border-gray-50">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-emerald-600 shrink-0" />
          <p className="text-sm font-bold text-gray-800">{title}</p>
        </div>
      </div>
      <div className="px-5 py-4 space-y-3">
        <VocabTrendMiniChartView data={data} />
        <p className="text-[11px] text-gray-500 text-center">
          총 {total}회 응시 · 평균 {avgScore}점
        </p>
      </div>
    </section>
  );
}
