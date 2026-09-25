"use client";

import { useMemo } from "react";
import Link from "next/link";
import { CalendarClock, CalendarX2, MessageSquare, SearchX } from "lucide-react";
import {
  EmptyState,
  FilterChip,
  SearchField,
  Segmented,
  StatusBadge,
  TableCard,
  Toolbar,
} from "@/components/backoffice/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useStickyState } from "@/hooks/use-sticky-state";
import { DeleteProposalButton } from "./delete-proposal-button";
import { proposalStatus } from "./_lib/status";

export type ProposalRow = {
  id: string;
  status: string;
  version: number;
  studentName: string;
  studentGrade: string;
  scheduledFor: string | null;
  updatedAt: string;
  createdAt: string;
  feedbackCount: number;
};

type Sort = "recent" | "name" | "submitted";

const SORT_TABS: { value: Sort; label: string }[] = [
  { value: "recent", label: "최신순" },
  { value: "name", label: "이름순" },
  { value: "submitted", label: "제출순" },
];

const STATUS_FILTERS: { key: string; label: string }[] = [
  { key: "ALL", label: "전체" },
  { key: "SUBMITTED", label: "검토 대기" },
  { key: "PROPOSED", label: "학부모 승인 대기" },
  { key: "APPROVED", label: "승인됨" },
  { key: "REJECTED", label: "반려됨" },
];

export function SchedulesPanel({ proposals }: { proposals: ProposalRow[] }) {
  const [query, setQuery] = useStickyState("online-schedules:query", "");
  const [sort, setSort] = useStickyState<Sort>("online-schedules:sort", "recent");
  const [statusFilter, setStatusFilter] = useStickyState("online-schedules:statusFilter", "ALL");

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: proposals.length };
    for (const p of proposals) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [proposals]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = proposals.filter((p) => {
      if (statusFilter !== "ALL" && p.status !== statusFilter) return false;
      if (q && !p.studentName.toLowerCase().includes(q)) return false;
      return true;
    });
    list.sort((a, b) => {
      if (sort === "name") return a.studentName.localeCompare(b.studentName, "ko");
      if (sort === "submitted") return a.createdAt.localeCompare(b.createdAt); // 제출(생성) 순
      return b.updatedAt.localeCompare(a.updatedAt); // 최신순
    });
    return list;
  }, [proposals, query, sort, statusFilter]);

  return (
    <div>
      {/* 검색 + 정렬 */}
      <Toolbar className="justify-between">
        <SearchField
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="학생 이름으로 검색"
          aria-label="학생 이름으로 검색"
        />
        <Segmented
          aria-label="정렬"
          options={SORT_TABS}
          value={sort}
          onChange={setSort}
          className="w-full sm:w-auto"
        />
      </Toolbar>

      {/* 상태 필터 */}
      <div
        role="group"
        aria-label="상태 필터"
        className="mb-x4 flex gap-x2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {STATUS_FILTERS.map((f) => (
          <FilterChip
            key={f.key}
            selected={statusFilter === f.key}
            count={counts[f.key] ?? 0}
            onClick={() => setStatusFilter(f.key)}
          >
            {f.label}
          </FilterChip>
        ))}
      </div>

      <TableCard>
        {filtered.length === 0 ? (
          proposals.length === 0 ? (
            <EmptyState
              icon={CalendarX2}
              title="검토할 스케줄 제안이 없어요"
              description="학생이 포털에서 등원 스케줄을 제출하면 여기에 표시돼요."
            />
          ) : (
            <EmptyState
              icon={SearchX}
              title="조건에 맞는 제안이 없어요"
              description="상태 필터나 검색어를 바꿔 보세요."
            />
          )
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>학생</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>반영 예약</TableHead>
                <TableHead className="text-right">학부모 피드백</TableHead>
                <TableHead className="text-right">최근 수정</TableHead>
                <TableHead className="w-x14">
                  <span className="sr-only">삭제</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => {
                const st = proposalStatus(p.status);
                return (
                  <TableRow key={p.id} className="relative cursor-pointer">
                    <TableCell>
                      <span className="inline-flex items-center gap-x1_5 whitespace-nowrap">
                        {/* 행 전체를 누르면 상세로 — 링크 영역을 행 크기로 늘린다 */}
                        <Link
                          href={`/online/schedules/${p.id}`}
                          className="t4-medium text-fg-neutral after:absolute after:inset-0 after:content-['']"
                        >
                          {p.studentName}
                        </Link>
                        <span className="t3-regular text-fg-neutral-subtle">
                          {p.studentGrade} · v{p.version}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {p.scheduledFor ? (
                        <span className="inline-flex items-center gap-x1 text-fg-informative">
                          <CalendarClock className="size-4" aria-hidden />
                          {new Date(p.scheduledFor).toLocaleDateString("ko-KR", {
                            month: "long",
                            day: "numeric",
                          })}
                        </span>
                      ) : (
                        <span className="text-fg-placeholder">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {p.feedbackCount > 0 ? (
                        <StatusBadge tone="warn">
                          <MessageSquare aria-hidden />
                          {p.feedbackCount}
                        </StatusBadge>
                      ) : (
                        <span className="text-fg-placeholder">—</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-fg-neutral-muted">
                      {new Date(p.updatedAt).toLocaleDateString("ko-KR")}
                    </TableCell>
                    <TableCell className="relative z-10 py-0 text-right">
                      <DeleteProposalButton id={p.id} studentName={p.studentName} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </TableCard>
    </div>
  );
}
