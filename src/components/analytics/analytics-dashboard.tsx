"use client";

import { useState, useMemo } from "react";
import { BarChart3, ChevronDown, GraduationCap, TrendingUp } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  EmptyState,
  PageHeader,
  SearchField,
  Section,
  Segmented,
  StatCard,
  StatCards,
  StatusBadge,
  type Tone,
} from "@/components/backoffice/ui";
import {
  ImprovementBarChart,
  CorrelationScatter,
  StudyHoursChart,
  SubjectTrendChart,
  SubjectTable,
  DailyStayLineChart,
  WeekdayStayBarChart,
} from "./analytics-charts";
import { cn } from "@/lib/utils";
import type { OverallAnalytics, StudentAnalytics } from "@/actions/analytics";
import type { AttendanceTimeStats } from "@/lib/attendance-stats";

/** 등급 → 상태 톤 (1~2 좋음 · 3~4 정보 · 5~6 주의 · 7~9 위험) */
function gradeTone(g: number): Tone {
  if (g <= 2) return "ok";
  if (g <= 4) return "info";
  if (g <= 6) return "warn";
  return "bad";
}

function GradeBadges({ student, withUnit = false }: { student: StudentAnalytics; withUnit?: boolean }) {
  const latest = student.subjects.filter((s) => s.latestGrade !== null);
  if (latest.length === 0) return <span className="text-fg-placeholder">-</span>;
  return (
    <div className="flex flex-wrap gap-x1">
      {latest.map((sub) => (
        <StatusBadge key={sub.subject} tone={gradeTone(sub.latestGrade!)}>
          {sub.subject} {sub.latestGrade}
          {withUnit && "등급"}
          {withUnit && sub.improvement !== null && sub.improvement !== 0 && (
            <span className={sub.improvement > 0 ? "text-fg-positive" : "text-fg-critical"}>
              {sub.improvement > 0 ? `+${sub.improvement}` : sub.improvement}
            </span>
          )}
        </StatusBadge>
      ))}
    </div>
  );
}

type TabKey = "overview" | "individual";

export function AnalyticsDashboard({
  data,
  attendanceStats,
}: {
  data: OverallAnalytics;
  attendanceStats: { d7: AttendanceTimeStats; d30: AttendanceTimeStats };
}) {
  const [tab, setTab] = useState<TabKey>("overview");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comboOpen, setComboOpen] = useState(false);
  const [rangeDays, setRangeDays] = useState<7 | 30>(30);

  const stayStats = rangeDays === 7 ? attendanceStats.d7 : attendanceStats.d30;

  const studentsWithScores = useMemo(
    () => data.students.filter((s) => s.subjects.length > 0),
    [data.students]
  );

  const searchResults = useMemo(() => {
    if (!search) return studentsWithScores;
    return studentsWithScores.filter((s) =>
      s.studentName.includes(search) || s.grade.includes(search)
    );
  }, [studentsWithScores, search]);

  const selectedStudent = selectedId
    ? data.students.find((s) => s.studentId === selectedId) ?? null
    : null;

  const topImprovers = data.students
    .filter((s) => s.avgImprovement !== null && s.avgImprovement > 0)
    .sort((a, b) => (b.avgImprovement ?? 0) - (a.avgImprovement ?? 0));

  function openIndividual(id: string) {
    setSelectedId(id);
    setTab("individual");
  }

  return (
    <div>
      <PageHeader title="성과 분석" description="재원생의 성적 추이와 학습 효율을 한눈에 봐요" />

      <div className="flex flex-col gap-x6">
        {/* KPI */}
        <StatCards cols={4}>
          <StatCard
            label="평균 성적 상승"
            value={data.avgImprovement !== null ? `+${data.avgImprovement}` : "—"}
            unit={data.avgImprovement !== null ? "등급" : undefined}
            tone={data.avgImprovement !== null && data.avgImprovement > 0 ? "ok" : "gray"}
            sub={data.avgImprovement !== null ? "재원 기간 평균" : "데이터 없음"}
          />
          <StatCard
            label="평균 상승 소요 기간"
            value={data.avgDaysToImprovement ?? "—"}
            unit={data.avgDaysToImprovement !== null ? "일" : undefined}
            sub={data.avgDaysToImprovement !== null ? "첫 시험 → 최근 시험" : "데이터 없음"}
          />
          <StatCard
            label="평균 총 재원 시간"
            value={data.avgStudyHoursPerMonth ?? "—"}
            unit={data.avgStudyHoursPerMonth !== null ? "시간" : undefined}
            sub={data.avgStudyHoursPerMonth !== null ? "출퇴실 기록 기준" : "데이터 없음"}
          />
          <StatCard
            label="분석 대상 학생"
            value={data.students.length}
            unit="명"
            sub={`성적 등록 ${studentsWithScores.length}명`}
          />
        </StatCards>

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList>
            <TabsTrigger value="overview">전체 현황</TabsTrigger>
            <TabsTrigger value="individual">개인별 추이</TabsTrigger>
          </TabsList>

          {/* 전체 현황 탭 */}
          <TabsContent value="overview" className="flex flex-col gap-x8">
            <div className="grid grid-cols-1 gap-x4 lg:grid-cols-2">
              <Section
                title="학생별 평균 등급 변화"
                description="양수는 등급 상승, 음수는 하락 · 시험 2회 이상 학생만"
              >
                <ImprovementBarChart students={data.students} />
              </Section>

              <Section
                title="멘토링 횟수와 성적 상관관계"
                description="오른쪽 위일수록 멘토링이 많고 성적이 올랐어요 · 점 하나가 학생 1명"
              >
                <CorrelationScatter data={data.correlationPoints} />
              </Section>

              <Section title="학생별 총 재원 시간" description="출입 기록(입실~퇴실) 합산 · 상위 15명">
                <StudyHoursChart students={data.students} />
              </Section>

              <Section title="성적 상승 상위 학생" count={topImprovers.length > 0 ? Math.min(8, topImprovers.length) : undefined} flush>
                {topImprovers.length === 0 ? (
                  <EmptyState
                    compact
                    icon={TrendingUp}
                    title="시험 2회 이상 등록된 학생이 없어요"
                    description="같은 과목 성적이 두 번 이상 쌓이면 상승폭을 계산해요."
                  />
                ) : (
                  <ol className="divide-y divide-stroke-neutral-muted pb-x2">
                    {topImprovers.slice(0, 8).map((s, i) => (
                      <li key={s.studentId}>
                        <button
                          type="button"
                          onClick={() => openIndividual(s.studentId)}
                          className="flex w-full items-center gap-x3 px-x5 py-x3 text-left transition-colors hover:bg-bg-layer-default-pressed"
                        >
                          <span
                            className={cn(
                              "w-x5 shrink-0 text-center t5-bold tabular-nums",
                              i < 3 ? "text-fg-brand" : "text-fg-neutral-subtle"
                            )}
                          >
                            {i + 1}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate t4-medium text-fg-neutral">{s.studentName}</span>
                            <span className="block t3-regular tabular-nums text-fg-neutral-subtle">
                              {s.grade} · 멘토링 {s.mentoringCount}회 · {s.studyHours}시간
                            </span>
                          </span>
                          <span className="shrink-0 t4-bold tabular-nums text-fg-positive">+{s.avgImprovement}등급</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </Section>
            </div>

            {/* 등원 시간 통계 — 기간 토글 + 카드 2개 */}
            <Section
              variant="plain"
              title="등원 시간 통계"
              description="완료된 출퇴실 기록 기준 · 외출 시간은 빼고 계산해요"
              actions={
                <Segmented
                  aria-label="기간"
                  className="w-52"
                  options={[
                    { value: "7", label: "최근 7일" },
                    { value: "30", label: "최근 30일" },
                  ]}
                  value={String(rangeDays) as "7" | "30"}
                  onChange={(v) => setRangeDays(v === "7" ? 7 : 30)}
                />
              }
            >
              <div className="grid grid-cols-1 gap-x4 lg:grid-cols-2">
                <Section title="일별 평균 재원시간">
                  <DailyStayLineChart data={stayStats.daily} />
                </Section>
                <Section title="요일별 평균 재원시간" description="막대에 마우스를 올리면 평균 입실 시각이 보여요">
                  <WeekdayStayBarChart data={stayStats.weekday} />
                </Section>
              </div>
            </Section>

            {/* 개인별 상세 테이블 — 현재 등급 포함 */}
            <Section
              title="개인별 상세 현황"
              count={data.students.length}
              description="행을 누르면 개인별 추이로 이동해요"
              flush
            >
              {data.students.length === 0 ? (
                <EmptyState compact icon={BarChart3} title="분석할 학생이 없어요" />
              ) : (
                <div className="border-t border-stroke-neutral-muted">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>이름</TableHead>
                        <TableHead>학년</TableHead>
                        <TableHead>현재 등급</TableHead>
                        <TableHead className="text-right">평균 등급 변화</TableHead>
                        <TableHead className="text-right">기간</TableHead>
                        <TableHead className="text-right">멘토링</TableHead>
                        <TableHead className="text-right">총 재원</TableHead>
                        <TableHead>과목</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.students.map((s) => (
                        <TableRow
                          key={s.studentId}
                          className="cursor-pointer"
                          onClick={() => openIndividual(s.studentId)}
                        >
                          <TableCell className="whitespace-nowrap">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openIndividual(s.studentId);
                              }}
                              className="t4-medium text-fg-neutral hover:underline"
                            >
                              {s.studentName}
                            </button>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-fg-neutral-muted">{s.grade}</TableCell>
                          <TableCell>
                            <GradeBadges student={s} />
                          </TableCell>
                          <TableCell className="text-right">
                            {s.avgImprovement !== null ? (
                              <StatusBadge tone={s.avgImprovement > 0 ? "ok" : s.avgImprovement < 0 ? "bad" : "gray"}>
                                {s.avgImprovement > 0 ? `+${s.avgImprovement}` : s.avgImprovement}등급
                              </StatusBadge>
                            ) : (
                              <span className="text-fg-placeholder">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-fg-neutral-muted">
                            {s.daysToImprovement !== null ? `${s.daysToImprovement}일` : "-"}
                          </TableCell>
                          <TableCell className="text-right text-fg-neutral-muted">{s.mentoringCount}회</TableCell>
                          <TableCell className="text-right text-fg-neutral-muted">
                            {s.studyHours > 0 ? `${s.studyHours}h` : "-"}
                          </TableCell>
                          <TableCell className="max-w-56 truncate t3-regular text-fg-neutral-subtle">
                            {s.subjects.map((sub) => sub.subject).join(", ") || "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Section>
          </TabsContent>

          {/* 개인별 추이 탭 */}
          <TabsContent value="individual" className="flex flex-col gap-x5">
            {/* 학생 검색 */}
            <div className="relative w-full max-w-sm">
              <SearchField
                placeholder="학생 이름 검색"
                aria-label="학생 이름 검색"
                aria-expanded={comboOpen}
                value={search}
                onChange={(e) => { setSearch(e.target.value); setComboOpen(true); setSelectedId(null); }}
                onFocus={() => setComboOpen(true)}
                className="pr-x10 sm:w-full"
              />
              <button
                type="button"
                onClick={() => setComboOpen(!comboOpen)}
                aria-label={comboOpen ? "학생 목록 닫기" : "학생 목록 열기"}
                className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-r2 text-fg-neutral-subtle transition-colors hover:bg-bg-transparent-pressed"
              >
                <ChevronDown className={cn("size-4 transition-transform", comboOpen && "rotate-180")} />
              </button>

              {comboOpen && (
                <div className="absolute left-0 right-0 top-full z-20 mt-x1 max-h-60 overflow-y-auto rounded-r3 bg-bg-layer-floating py-x1 shadow-s2">
                  {searchResults.length === 0 ? (
                    <p className="px-x4 py-x4 text-center t4-regular text-fg-neutral-subtle">검색 결과가 없어요</p>
                  ) : (
                    searchResults.map((s) => (
                      <button
                        type="button"
                        key={s.studentId}
                        className={cn(
                          "flex w-full items-center justify-between gap-x2 px-x4 py-x2_5 text-left transition-colors hover:bg-bg-layer-floating-pressed",
                          selectedId === s.studentId && "bg-bg-layer-floating-pressed"
                        )}
                        onClick={() => { setSelectedId(s.studentId); setSearch(s.studentName); setComboOpen(false); }}
                      >
                        <span className="t4-medium text-fg-neutral">{s.studentName}</span>
                        <span className="t3-regular text-fg-neutral-subtle">{s.grade} · {s.subjects.length}과목</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* 선택된 학생 상세 */}
            {selectedStudent && selectedStudent.subjects.length > 0 ? (
              <Section
                title={selectedStudent.studentName}
                description={[
                  selectedStudent.grade,
                  selectedStudent.school,
                  `멘토링 ${selectedStudent.mentoringCount}회`,
                  selectedStudent.studyHours > 0 ? `재원 ${selectedStudent.studyHours}시간` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              >
                <div className="flex flex-col gap-x5">
                  <GradeBadges student={selectedStudent} withUnit />
                  <SubjectTrendChart student={selectedStudent} />
                  <SubjectTable student={selectedStudent} />
                </div>
              </Section>
            ) : selectedStudent ? (
              <Section>
                <EmptyState
                  icon={GraduationCap}
                  title="등록된 성적이 없어요"
                  description={`${selectedStudent.studentName} 학생은 아직 시험 성적이 없어요.`}
                />
              </Section>
            ) : studentsWithScores.length === 0 ? (
              <Section>
                <EmptyState
                  icon={GraduationCap}
                  title="등록된 성적이 없어요"
                  description="시험 관리에서 성적을 입력하면 학생별 추이를 볼 수 있어요."
                />
              </Section>
            ) : (
              /* 전체 목록 (검색 안 했을 때) */
              <div className="grid grid-cols-1 gap-x4 lg:grid-cols-2">
                {studentsWithScores.map((s) => (
                  <div
                    key={s.studentId}
                    role="button"
                    tabIndex={0}
                    aria-label={`${s.studentName} 추이 자세히 보기`}
                    onClick={() => { setSelectedId(s.studentId); setSearch(s.studentName); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedId(s.studentId);
                        setSearch(s.studentName);
                      }
                    }}
                    className="flex cursor-pointer flex-col gap-x4 rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default p-x5 transition-colors hover:border-stroke-neutral-weak focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus-ring"
                  >
                    <div className="flex flex-col gap-x2">
                      <div className="flex items-baseline justify-between gap-x2">
                        <h3 className="t5-bold text-fg-neutral">{s.studentName}</h3>
                        <span className="t3-regular text-fg-neutral-subtle">{s.grade}</span>
                      </div>
                      <GradeBadges student={s} />
                    </div>
                    <SubjectTrendChart student={s} />
                    <SubjectTable student={s} />
                    <div className="flex flex-wrap items-center gap-x4 border-t border-stroke-neutral-muted pt-x3 t3-regular tabular-nums text-fg-neutral-subtle">
                      <span>멘토링 {s.mentoringCount}회</span>
                      <span>재원 {s.studyHours > 0 ? `${s.studyHours}시간` : "-"}</span>
                      {s.daysToImprovement && <span>{s.daysToImprovement}일 경과</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
