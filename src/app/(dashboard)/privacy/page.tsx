import Link from "next/link";
import { Bot, FileSignature, ScrollText } from "lucide-react";
import {
  EmptyState,
  Notice,
  PageHeader,
  SearchField,
  Section,
  StatCard,
  StatCards,
  StatusBadge,
  Toolbar,
} from "@/components/backoffice/ui";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { getRetentionPreview, RETENTION } from "@/lib/privacy/retention";
import { isFullAccess } from "@/lib/roles";
import { formatDateTime } from "@/lib/utils";
import { requireDashboardSession } from "../_lib/page-guard";

export const dynamic = "force-dynamic";

const TAKE = 100;
const monthAgo = () => new Date(Date.now() - 30 * 86_400_000);
const ACTION_LABEL: Record<string, string> = { LOGIN: "로그인", VIEW: "조회", ACTION: "처리", DOWNLOAD: "내려받기" };

// 개인정보 보호 기록 — 동의 현황 · 직원 접속 기록 · 외부 AI 전송 이력 · 보유 기간이 지난 정보 (원장급)
export default async function PrivacyRecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireDashboardSession(isFullAccess);
  const since = monthAgo();
  const q = (await searchParams).q?.trim().slice(0, 50) ?? "";

  // 기록엔 학생 FK 가 없고(studentId 스냅샷), AI 기록은 직원 이름도 없어서 이름 → id 를 먼저 찾는다
  const nameMatch = { contains: q, mode: "insensitive" as const };
  const [qStudents, qStaff] = q
    ? await Promise.all([
        prisma.student.findMany({ where: { name: nameMatch }, select: { id: true }, take: 200 }),
        prisma.user.findMany({ where: { name: nameMatch }, select: { id: true }, take: 200 }),
      ])
    : [[], []];
  const studentIds = { in: qStudents.map((s) => s.id) };
  const accessWhere = q ? { OR: [{ actorName: nameMatch }, { studentId: studentIds }] } : undefined;
  const aiWhere = q
    ? { OR: [{ actorId: { in: qStaff.map((u) => u.id) } }, { studentId: studentIds }] }
    : undefined;

  const [missing, activeCount, accessCount, access, aiCount, aiDropped, ai, retention] = await Promise.all([
    prisma.student.findMany({
      where: { status: "ACTIVE", consents: { none: { kind: "PRIVACY_REQUIRED", agreed: true } } },
      select: { id: true, name: true, grade: true },
      orderBy: { name: "asc" },
    }),
    prisma.student.count({ where: { status: "ACTIVE" } }),
    prisma.personalDataAccessLog.count({ where: { createdAt: { gte: since } } }),
    prisma.personalDataAccessLog.findMany({ where: accessWhere, orderBy: { createdAt: "desc" }, take: TAKE }),
    prisma.aiTransferLog.count({ where: { createdAt: { gte: since } } }),
    prisma.aiTransferLog.aggregate({ where: { createdAt: { gte: since } }, _sum: { maskedNames: true, droppedSensitive: true } }),
    prisma.aiTransferLog.findMany({ where: aiWhere, orderBy: { createdAt: "desc" }, take: TAKE }),
    getRetentionPreview(),
  ]);

  return (
    <>
      <PageHeader
        title="개인정보 기록"
        description="동의를 받았는지, 누가 무엇을 열어 봤는지, 외부 AI로 무엇을 보냈는지 확인하는 곳이에요."
      />

      <div className="flex flex-col gap-x6">
        <StatCards cols={4}>
          <StatCard
            label="동의서 미등록"
            value={missing.length}
            unit="명"
            tone={missing.length > 0 ? "warn" : "ok"}
            sub={`재원생 ${activeCount}명 중`}
          />
          <StatCard label="직원 접속" value={accessCount} unit="건" sub="최근 30일" />
          <StatCard label="외부 AI 전송" value={aiCount} unit="건" sub="최근 30일" />
          <StatCard
            label="가린 이름"
            value={aiDropped._sum.maskedNames ?? 0}
            unit="곳"
            sub={`민감 문장 ${aiDropped._sum.droppedSensitive ?? 0}개 제외`}
          />
        </StatCards>

        <Section title="동의서 미등록 재원생" count={missing.length} description="원생 상세 › 기본 정보에서 등록하면 목록에서 빠져요.">
          {missing.length === 0 ? (
            <EmptyState icon={FileSignature} title="모두 등록했어요" />
          ) : (
            <ul className="flex flex-wrap gap-x2">
              {missing.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/students/${s.id}`}
                    className="inline-flex min-h-11 items-center rounded-r2 bg-bg-neutral-weak px-x3 t4-regular text-fg-neutral hover:bg-bg-neutral-weak-pressed focus-visible:outline-2 focus-visible:outline-stroke-focus-ring"
                  >
                    {s.name}
                    <span className="ml-x1 t3-regular text-fg-neutral-subtle">{s.grade}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title="보유 기간이 지난 정보"
          description={`매일 새벽 보유 기간이 지난 신청·본인 확인·기록과 오래 안 보인 와이파이 기기를 지우고 건수를 보여 줘요. ${
            retention?.studentPurgeEnabled
              ? "퇴원·졸업생은 파일까지 지우고, 수납 기록이 있으면 수납 기록만 이름 없이 남겨요."
              : "퇴원·졸업생은 아직 자동으로 지우지 않아요."
          }`}
        >
          {retention ? (
            <div className="flex flex-col gap-x3">
              <StatCards cols={4}>
                <StatCard label="대기 신청·문의" value={retention.waitlist} unit="건" sub="취소·응대 끝난 뒤 1년" />
                <StatCard label="휴대폰 본인 확인" value={retention.phoneVerification} unit="건" sub={`${RETENTION.phoneVerificationDays}일 지남`} />
                <StatCard
                  label="퇴원·졸업생"
                  value={retention.students}
                  unit="명"
                  sub={`${RETENTION.studentYears}년 지남 · 자동 파기 ${retention.studentPurgeEnabled ? "켜짐" : "꺼짐"}`}
                />
                <StatCard label="접속·전송 기록" value={retention.logs} unit="건" sub={`${RETENTION.logYears}년 지남`} />
              </StatCards>
              {(retention.studentsHeldByPayment > 0 || retention.studentsAnonymized > 0) && (
                <p className="t3-regular text-fg-neutral-subtle">
                  수납 기록은 세법상 5년 보관해요. 대상 중 수납 기록이 있는 학생 {retention.studentsHeldByPayment}명 · 이름 없이 남긴 학생{" "}
                  {retention.studentsAnonymized}명
                </p>
              )}
              {retention.studentsWithoutEndDate > 0 && (
                <Notice tone="warn">
                  퇴원·졸업했는데 종료일이 비어 있는 학생이 {retention.studentsWithoutEndDate}명이에요. 종료일을 적어야 보유 기간을 셀 수 있어요.
                </Notice>
              )}
              <p className="t3-regular text-fg-neutral-subtle">마지막 확인 {formatDateTime(new Date(retention.checkedAt))}</p>
            </div>
          ) : (
            <EmptyState icon={ScrollText} title="아직 확인한 기록이 없어요" description="내일 새벽부터 건수가 표시돼요." />
          )}
        </Section>

        <Toolbar className="mb-0">
          <form method="get" role="search" className="contents">
            <SearchField
              name="q"
              defaultValue={q}
              placeholder="직원·학생 이름 검색"
              aria-label="접속·전송 기록 검색"
              enterKeyHint="search"
            />
          </form>
          {q && (
            <Button asChild variant="ghost" size="sm">
              <Link href="/privacy">초기화</Link>
            </Button>
          )}
        </Toolbar>

        <Section title="직원 접속 기록" description={`최근 ${TAKE}건 · 같은 화면은 10분에 한 번만 남아요 · ${RETENTION.logYears}년 보관`} flush className="overflow-hidden">
          {access.length === 0 ? (
            <EmptyState icon={ScrollText} title={q ? "검색 결과가 없어요" : "아직 남은 기록이 없어요"} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>일시</TableHead>
                  <TableHead>직원</TableHead>
                  <TableHead>한 일</TableHead>
                  <TableHead>화면</TableHead>
                  <TableHead>접속지</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {access.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap">{formatDateTime(a.createdAt)}</TableCell>
                    <TableCell>{a.actorName}</TableCell>
                    <TableCell>
                      <StatusBadge tone={a.action === "DOWNLOAD" ? "warn" : a.action === "LOGIN" ? "info" : "gray"}>{ACTION_LABEL[a.action] ?? a.action}</StatusBadge>
                    </TableCell>
                    <TableCell className="max-w-72 truncate text-fg-neutral-muted">{a.path}</TableCell>
                    <TableCell className="text-fg-neutral-subtle">{a.ip ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Section>

        <Section title="외부 AI 전송 이력" description={`최근 ${TAKE}건 · 보낸 글은 남기지 않고 얼마나 가려 보냈는지만 남겨요`} flush className="overflow-hidden">
          {ai.length === 0 ? (
            <EmptyState icon={Bot} title={q ? "검색 결과가 없어요" : "아직 보낸 기록이 없어요"} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>일시</TableHead>
                  <TableHead>기능</TableHead>
                  <TableHead>받는 곳</TableHead>
                  <TableHead className="text-right">가린 이름</TableHead>
                  <TableHead className="text-right">가린 연락처</TableHead>
                  <TableHead className="text-right">뺀 민감 문장</TableHead>
                  <TableHead className="text-right">보낸 글자</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ai.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-nowrap">{formatDateTime(t.createdAt)}</TableCell>
                    <TableCell>
                      {t.feature}
                      {!t.ok && (
                        <StatusBadge tone="bad" className="ml-x1_5">
                          실패
                        </StatusBadge>
                      )}
                    </TableCell>
                    <TableCell className="text-fg-neutral-muted">{t.provider}</TableCell>
                    <TableCell className="text-right">{t.maskedNames}</TableCell>
                    <TableCell className="text-right">{t.maskedContacts}</TableCell>
                    <TableCell className="text-right">{t.droppedSensitive}</TableCell>
                    <TableCell className="text-right">{t.inputChars.toLocaleString("ko-KR")}</TableCell>
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
