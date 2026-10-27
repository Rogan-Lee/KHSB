import { Car } from "lucide-react";

import {
  EmptyState,
  LinkTabs,
  PageHeader,
  Section,
  StatCard,
  StatCards,
  StatusBadge,
  TableCard,
  type Tone,
} from "@/components/backoffice/ui";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getParkingBoard } from "@/lib/parking/board";
import { PARKING_FLAG_LABEL, PARKING_RULES } from "@/lib/parking/rules";
import { parkingEnabled } from "@/lib/parking/wdc";
import { isStaff } from "@/lib/roles";
import { todayKST } from "@/lib/utils";

import { requireDashboardSession } from "../_lib/page-guard";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; tone: Tone }> = {
  OK: { label: "적용됨", tone: "ok" },
  PENDING: { label: "처리 중", tone: "info" },
  FAILED: { label: "실패", tone: "bad" },
  BLOCKED: { label: "한도 초과", tone: "warn" },
};

const TABS = [
  { value: "all", label: "전체" },
  { value: "flagged", label: "의심" },
  { value: "failed", label: "실패·차단" },
] as const;

const timeFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** 학부모 주차 등록 내역 — 최근 30일, 부정 사용 의심 표시. 조회는 자습실 운영진 전체 */
export default async function ParkingPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireDashboardSession(isStaff);
  const { tab: raw } = await searchParams;
  const tab = TABS.some((t) => t.value === raw) ? raw! : "all";

  const rows = await getParkingBoard();
  const today = todayKST().toISOString().slice(0, 10);
  const ok = rows.filter((r) => r.status === "OK");
  const flagged = rows.filter((r) => r.flags.length > 0);
  const failed = rows.filter((r) => r.status === "FAILED" || r.status === "BLOCKED");
  const shown = tab === "flagged" ? flagged : tab === "failed" ? failed : rows;

  return (
    <div>
      <PageHeader
        title="주차 등록"
        description="학부모님이 앱에서 직접 등록한 방문 차량 할인 내역이에요. 최근 30일만 보여요."
        meta={parkingEnabled() ? undefined : <StatusBadge tone="warn">주차장 계정 미설정</StatusBadge>}
      />

      <StatCards cols={4} className="mb-x6">
        <StatCard label="오늘 적용" value={ok.filter((r) => r.date === today).length} unit="건" />
        <StatCard label="30일 적용" value={ok.length} unit="건" />
        <StatCard label="의심" value={flagged.length} unit="건" tone={flagged.length ? "warn" : "gray"} />
        <StatCard label="실패·차단" value={failed.length} unit="건" tone={failed.length ? "bad" : "gray"} />
      </StatCards>

      <LinkTabs
        current={tab}
        items={TABS.map((t) => ({
          value: t.value,
          label: t.label,
          href: t.value === "all" ? "/parking" : `/parking?tab=${t.value}`,
          count: t.value === "flagged" ? flagged.length : t.value === "failed" ? failed.length : undefined,
        }))}
      />

      <TableCard>
        {shown.length === 0 ? (
          <EmptyState icon={Car} title="표시할 등록 내역이 없어요" compact />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>일시</TableHead>
                <TableHead>학생</TableHead>
                <TableHead>등록한 학부모</TableHead>
                <TableHead>차량</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>의심 사유</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((r) => {
                const st = STATUS[r.status] ?? { label: r.status, tone: "gray" as Tone };
                return (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap tabular-nums">{timeFmt.format(r.createdAt)}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.studentName}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.parentName}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">{r.carNo}</TableCell>
                    <TableCell>
                      <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                      {r.message && r.status !== "OK" && (
                        <p className="mt-x1 max-w-xs t3-regular text-fg-neutral-subtle">{r.message}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-x1">
                        {r.flags.map((f) => (
                          <StatusBadge key={f} tone="warn">
                            {PARKING_FLAG_LABEL[f] ?? f}
                          </StatusBadge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </TableCard>

      <Section title="감지 기준" className="mt-x8">
        <ul className="list-disc space-y-x1 pl-x5 t4-regular text-fg-neutral-subtle">
          <li>
            <b className="text-fg-neutral">차단</b> — 학생 한 명당 하루 {PARKING_RULES.dailyLimit}번을 넘으면 등록을 막아요.
          </li>
          <li>
            <b className="text-fg-neutral">의심 표시</b> — 등록은 처리하고 여기에 표시해요. 새로 걸린 사유는 슬랙으로도 알려요.
            <ul className="mt-x1 list-[circle] pl-x5">
              {Object.values(PARKING_FLAG_LABEL).map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          </li>
          <li>운영 시간은 {PARKING_RULES.openHour}시~{PARKING_RULES.closeHour}시로 봐요. 입실 기록 확인은 지난 날짜만 해요.</li>
        </ul>
      </Section>
    </div>
  );
}
