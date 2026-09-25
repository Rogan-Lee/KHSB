import { redirect } from "next/navigation";
import {
  CalendarDays,
  CircleHelp,
  ClipboardCheck,
  Coins,
  FileText,
  GraduationCap,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Moon,
  Podcast,
  ShieldCheck,
  SpellCheck,
  Utensils,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import { validateMagicLink } from "@/lib/student-auth";
import { prisma } from "@/lib/prisma";
import { todayKST, cn } from "@/lib/utils";
import { calcPointBalance } from "@/lib/points";
import { getPortalBadgeCounts } from "@/lib/portal-badges";
import { SURVEY_SECTIONS, isSectionComplete, parseGradeNumber } from "@/lib/online/survey-template";
import {
  Avatar,
  Badge,
  CountBadge,
  IconTile,
  ListRow,
  Section,
  type Tone,
} from "@/components/portal/ui";
import { PwaInstallPrompt } from "../_components/pwa-install-prompt";

export const dynamic = "force-dynamic";

type Item = {
  href: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  tone: Tone;
  badge?: number;
  value?: string;
};

function daysUntil(d: Date): number {
  return Math.max(0, Math.ceil((d.getTime() - Date.now()) / 86_400_000));
}

export default async function StudentPortalMenuPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await validateMagicLink(token);
  if (!session) redirect("/s/expired");

  const { student, link } = session;
  const isOnline = student.isOnlineManaged;
  const root = `/s/${token}`;

  const [badges, lunchMenuCount, examApplyOpenCount, contentCount, survey, merits, redemptions] =
    await Promise.all([
      getPortalBadgeCounts(student.id),
      prisma.lunchMenu.count({ where: { date: { gte: todayKST() }, closed: false } }),
      prisma.examSession.count({
        where: { applicationOpen: true, examDate: { gte: todayKST() } },
      }),
      prisma.contentPost.count({ where: { visible: true } }),
      isOnline
        ? prisma.onboardingSurvey.findUnique({
            where: { studentId: student.id },
            select: { sections: true, submittedAt: true },
          })
        : Promise.resolve(null),
      prisma.meritDemerit.findMany({
        where: { studentId: student.id },
        select: { type: true, points: true },
      }),
      prisma.rewardRedemption.findMany({
        where: { studentId: student.id },
        select: { status: true, points: true },
      }),
    ]);

  const { balance } = calcPointBalance({ merits, redemptions });

  const surveySections = (survey?.sections as Record<string, unknown> | null) ?? null;
  const gradeCtx = { gradeNumber: parseGradeNumber(student.grade) };
  const surveyFilled = SURVEY_SECTIONS.filter((s) =>
    isSectionComplete(s, surveySections?.[s.key], gradeCtx)
  ).length;

  const daysLeft = daysUntil(link.expiresAt);
  const expiresLabel = link.expiresAt.toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
  });

  const study: Item[] = [
    { href: `${root}/tasks`, label: "수행평가", icon: ClipboardCheck, tone: "info", badge: badges.tasks },
    { href: `${root}/feedback`, label: "받은 피드백", icon: MessageCircle, tone: "brand", badge: badges.feedback },
  ];
  if (badges.hasVocab)
    study.push({ href: `${root}/vocab`, label: "영단어 시험", icon: SpellCheck, tone: "info", badge: badges.vocab });
  if (isOnline)
    study.push({
      href: `${root}/survey`,
      label: "초기 설문",
      icon: FileText,
      tone: "violet",
      value: survey?.submittedAt ? "제출 완료" : `${surveyFilled}/${SURVEY_SECTIONS.length}`,
    });

  const talk: Item[] = [
    { href: `${root}/qna`, label: "질문하기", description: "모르는 문제를 사진으로 물어봐요", icon: CircleHelp, tone: "brand", badge: badges.qna },
    { href: `${root}/chat`, label: "메시지", description: "담당 선생님과 1:1 대화", icon: MessageSquare, tone: "info", badge: badges.chat },
    { href: `${root}/suggestions`, label: "건의사항", description: "불편한 점, 바라는 점을 알려 주세요", icon: Megaphone, tone: "warn", badge: badges.suggestions },
  ];

  const life: Item[] = [
    { href: `${root}/schedule`, label: "내 일정 · 등원 스케줄", icon: CalendarDays, tone: "ok" },
    { href: `${root}/nap`, label: "쪽잠 신청", description: "하루 2회 · 20~30분", icon: Moon, tone: "violet" },
    { href: `${root}/network`, label: "네트워크 사용 신청", description: "와이파이·사이트·앱", icon: Wifi, tone: "info" },
  ];
  if (lunchMenuCount > 0)
    life.push({ href: `${root}/lunch`, label: "점심 도시락", icon: Utensils, tone: "warn", value: "신청 가능" });
  if (examApplyOpenCount > 0)
    life.push({ href: `${root}/exam`, label: "모의고사 신청", icon: GraduationCap, tone: "violet", value: `접수 중 ${examApplyOpenCount}건` });

  const perks: Item[] = [
    { href: `${root}/points`, label: "포인트", icon: Coins, tone: "brand", value: `${balance.toLocaleString("ko-KR")}점` },
  ];
  if (contentCount > 0)
    perks.push({ href: `${root}/contents`, label: "콘텐츠", description: "후기·칼럼·팟캐스트", icon: Podcast, tone: "violet" });

  const profileSub = [student.school, student.grade].filter(Boolean).join(" · ");

  return (
    <div className="space-y-3">
      {/* 프로필 */}
      <Section>
        <div className="flex items-center gap-4">
          <Avatar name={student.name} size={56} />
          <div className="min-w-0 flex-1">
            <p className="t7-bold truncate text-fg-neutral">{student.name}</p>
            <p className="t4-regular mt-0.5 truncate text-fg-neutral-subtle">{profileSub || "강한선배 학생"}</p>
          </div>
          {isOnline && <Badge tone="brand">온라인 관리</Badge>}
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 rounded-r3_5 bg-bg-neutral-weak px-4 py-3">
          <span className="t4-regular flex items-center gap-1.5 text-fg-neutral-muted">
            <ShieldCheck className="h-4 w-4" />
            접속 링크
          </span>
          <span
            className={cn(
              "t4-medium tabular-nums",
              daysLeft <= 3 ? "text-fg-critical" : daysLeft <= 7 ? "text-fg-warning" : "text-fg-neutral-muted"
            )}
          >
            {expiresLabel}까지 · D-{daysLeft}
          </span>
        </div>
      </Section>

      <MenuSection title="학습" items={study} />
      <MenuSection title="소통" items={talk} />
      <MenuSection title="생활" items={life} />
      <MenuSection title="혜택" items={perks} />

      <PwaInstallPrompt />

      <p className="t2-regular text-balance px-6 pt-5 text-center text-fg-placeholder">
        본인 전용 링크예요. 외부에 공유하면 개인 정보가 노출될 수 있어요.
        <br />
        링크가 만료되면 원장님께 재발급을 요청해 주세요.
      </p>
    </div>
  );
}

function MenuSection({ title, items }: { title: string; items: Item[] }) {
  return (
    <Section title={title} flush>
      {items.map((it) => (
        <ListRow
          key={it.href}
          href={it.href}
          leading={<IconTile icon={it.icon} tone={it.tone} />}
          title={it.label}
          description={it.description}
          trailing={
            (it.badge ?? 0) > 0 ? (
              <CountBadge count={it.badge!} />
            ) : it.value ? (
              <span className="t4-medium text-fg-neutral-subtle tabular-nums">{it.value}</span>
            ) : undefined
          }
        />
      ))}
    </Section>
  );
}
