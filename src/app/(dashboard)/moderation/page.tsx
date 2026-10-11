import Link from "next/link";
import { Ban, ChevronDown, ShieldCheck } from "lucide-react";
import { EmptyState, Notice, PageHeader, Section, StatCard, StatCards, StatusBadge } from "@/components/backoffice/ui";
import { REPORT_SLA_MS, ReportList } from "@/components/moderation/report-list";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isFullAccess } from "@/lib/roles";
import {
  countOpenReports,
  listContentReports,
  listUserBlocks,
  SAFETY_ACTOR_LABEL,
  type UserBlockView,
} from "@/lib/safety";
import { formatDateTime } from "@/lib/utils";
import { requireDashboardSession } from "../_lib/page-guard";

export const dynamic = "force-dynamic";

// 한 번에 불러오는 범위 — @/lib/safety 가 받는 최대치는 300
const OPEN_TAKE = 300;
const RESOLVED_TAKE = 100;
const BLOCK_TAKE = 300;

function BlockParty({ user }: { user: UserBlockView["blocker"] }) {
  return (
    <span className="inline-flex items-center gap-x1_5">
      <StatusBadge tone="gray">{SAFETY_ACTOR_LABEL[user.type]}</StatusBadge>
      {user.type === "STUDENT" ? (
        <Link
          href={`/students/${user.id}`}
          className="t4-medium text-fg-neutral underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-stroke-focus-ring"
        >
          {user.name}
        </Link>
      ) : (
        <span className="t4-medium text-fg-neutral">{user.name}</span>
      )}
    </span>
  );
}

// 앱(학생·학부모·직원)에서 들어온 신고·차단을 원장이 확인하고 처리하는 화면.
export default async function ModerationPage() {
  // 신고 처리 액션(requireFullAccess)과 같은 기준 — 원장·시스템 관리자만
  await requireDashboardSession(isFullAccess);

  const [openCount, newestOpen, resolved, blocks] = await Promise.all([
    countOpenReports(),
    listContentReports({ status: "OPEN", take: OPEN_TAKE }),
    listContentReports({ status: "RESOLVED", take: RESOLVED_TAKE }),
    listUserBlocks(BLOCK_TAKE),
  ]);

  // 오래 기다린 신고부터 — 24시간 안에 처리해야 하므로 급한 것이 위로 온다
  const open = [...newestOpen].reverse();
  const now = new Date().getTime();
  const overdueCount = open.filter((r) => now - new Date(r.createdAt).getTime() > REPORT_SLA_MS).length;

  return (
    <>
      <PageHeader
        title="신고 관리"
        meta={
          overdueCount > 0 ? (
            <StatusBadge tone="bad" size="large">24시간 지남 {overdueCount}건</StatusBadge>
          ) : openCount > 0 ? (
            <StatusBadge tone="warn" size="large">처리 대기 {openCount}건</StatusBadge>
          ) : undefined
        }
        description="앱에서 들어온 신고와 차단이에요. 신고는 접수 후 24시간 안에 확인하고 처리해 주세요."
      />

      <div className="flex flex-col gap-x6">
        <StatCards cols={3}>
          <StatCard
            label="처리 대기"
            value={openCount}
            unit="건"
            tone={overdueCount > 0 ? "bad" : "gray"}
            sub={overdueCount > 0 ? `24시간 지남 ${overdueCount}건` : "24시간 안에 처리"}
          />
          <StatCard label="처리 완료" value={resolved.length} unit="건" sub={`최근 ${RESOLVED_TAKE}건까지`} />
          <StatCard label="차단" value={blocks.length} unit="건" />
        </StatCards>

        {openCount > open.length && (
          <Notice tone="warn">
            처리 대기가 많아 최근 {open.length}건만 보여요. 처리하면 나머지가 이어서 나타나요.
          </Notice>
        )}

        <Section
          title="처리 대기"
          count={openCount}
          description="오래 기다린 신고부터 보여요."
          flush
          className="overflow-hidden"
        >
          {open.length === 0 ? (
            <div className="border-t border-stroke-neutral-muted">
              <EmptyState
                compact
                icon={ShieldCheck}
                title="처리할 신고가 없어요"
                description="앱에서 신고가 들어오면 여기에 먼저 보여요."
              />
            </div>
          ) : (
            <ReportList reports={open} now={now} />
          )}
        </Section>

        {/* 처리 완료 — 기록 확인용이라 접어 둔다 */}
        <details className="group overflow-hidden rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-x3 px-x5 py-x4 transition-colors hover:bg-bg-layer-default-pressed [&::-webkit-details-marker]:hidden">
            <span className="block min-w-0">
              <span className="flex items-center gap-x1_5 t6-bold text-fg-neutral">
                처리 완료
                <span className="tabular-nums text-fg-brand">{resolved.length}</span>
              </span>
              <span className="mt-x0_5 block t4-regular text-fg-neutral-subtle">
                최근에 처리한 순서로 {RESOLVED_TAKE}건까지 보여요. 펼쳐서 처리 결과와 메모를 확인하세요.
              </span>
            </span>
            <ChevronDown
              aria-hidden
              className="size-5 shrink-0 text-fg-neutral-subtle transition-transform group-open:rotate-180"
            />
          </summary>
          {resolved.length === 0 ? (
            <div className="border-t border-stroke-neutral-muted">
              <EmptyState compact icon={ShieldCheck} title="처리한 신고가 아직 없어요" />
            </div>
          ) : (
            <ReportList reports={resolved} now={now} />
          )}
        </details>

        <Section
          title="차단 현황"
          count={blocks.length}
          description="차단하면 두 사람은 서로 메시지를 주고받을 수 없어요. 담당으로 배정된 사이라면 담당 배정을 확인해 주세요."
          flush
          className="overflow-hidden"
        >
          {blocks.length === 0 ? (
            <div className="border-t border-stroke-neutral-muted">
              <EmptyState
                compact
                icon={Ban}
                title="차단한 사용자가 없어요"
                description="앱에서 누군가를 차단하면 여기에 보여요."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>차단한 사람</TableHead>
                  <TableHead>차단된 사람</TableHead>
                  <TableHead className="text-right">차단 시각</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {blocks.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="whitespace-nowrap">
                      <BlockParty user={b.blocker} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <BlockParty user={b.blocked} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-fg-neutral-subtle">
                      {formatDateTime(b.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Section>
      </div>
    </>
  );
}
