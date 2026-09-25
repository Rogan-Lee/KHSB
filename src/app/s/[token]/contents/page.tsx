import Link from "next/link";
import { redirect } from "next/navigation";
import { validateMagicLink } from "@/lib/student-auth";
import { prisma } from "@/lib/prisma";
import {
  CONTENT_TYPE_META,
  isInternalType,
  toContentPostType,
  type ContentPostType,
} from "@/lib/content-posts-meta";
import {
  Podcast,
  Newspaper,
  MessageSquareQuote,
  PenLine,
  ScrollText,
  ArrowUpRight,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { ImageFrame } from "@seed-design/react";
import { ContentPlaceholder } from "seed-design/ui/content-placeholder";
import { cn } from "@/lib/utils";
import { EmptyState, PRESS, Section, TONE_SOFT, type Tone } from "@/components/portal/ui";

export const dynamic = "force-dynamic";

const TYPE_ICON: Record<ContentPostType, LucideIcon> = {
  review: MessageSquareQuote,
  mentor: PenLine,
  director: ScrollText,
  podcast: Podcast,
  article: Newspaper,
};

// CONTENT_TYPE_META.tone(관리자 화면과 공유, KHSB 클래스)과 같은 색 계열을 포털에선 SEED 토큰으로
const TYPE_TONE: Record<ContentPostType, Tone> = {
  review: "warn",
  mentor: "violet",
  director: "brand",
  podcast: "info",
  article: "ok",
};

export default async function StudentContentsPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await validateMagicLink(token);
  if (!session) redirect("/s/expired");

  const posts = await prisma.contentPost.findMany({
    where: { visible: true },
    orderBy: { publishedAt: "desc" },
    take: 50,
    select: {
      id: true,
      type: true,
      title: true,
      summary: true,
      url: true,
      coverImageUrl: true,
      publishedAt: true,
      authorName: true,
    },
  });

  return (
    <div className="flex flex-col gap-x3">
      <p className="px-x1 pb-x1 pt-x2 t4-regular text-fg-neutral-subtle">
        강한선배가 준비한 후기·칼럼·팟캐스트를 만나보세요.
      </p>

      {posts.length === 0 ? (
        <Section>
          <EmptyState
            icon={Newspaper}
            title="아직 등록된 콘텐츠가 없어요"
            description="곧 찾아올게요!"
          />
        </Section>
      ) : (
        posts.map((p) => {
          const type = toContentPostType(p.type);
          const meta = CONTENT_TYPE_META[type];
          const Icon = TYPE_ICON[type];
          // 자체 작성 글(또는 URL 없는 글)은 포털 상세 페이지, 외부 링크형은 새 탭
          const externalUrl = !isInternalType(type) && p.url ? p.url : null;
          const inner = (
            <>
              {p.coverImageUrl && (
                // ponytail: 외부 이미지 URL이라 next/image 대신 SEED ImageFrame(<img>) 사용 (도메인 화이트리스트 불필요).
                // 로딩 중·깨진 이미지는 ContentPlaceholder 로 대체된다.
                <ImageFrame
                  src={p.coverImageUrl}
                  alt=""
                  ratio={16 / 9}
                  borderRadius={0}
                  loading="lazy"
                  fallback={<ContentPlaceholder type="image" />}
                />
              )}
              <div className={cn("px-x5 pb-x5", p.coverImageUrl ? "pt-x4" : "pt-x5")}>
                <span
                  className={cn(
                    "inline-flex h-x6 items-center gap-x1 rounded-r1_5 px-x2 t2-bold",
                    TONE_SOFT[TYPE_TONE[type]]
                  )}
                >
                  <Icon className="size-x3" strokeWidth={2.5} />
                  {meta.label}
                </span>
                <p className="mt-x2_5 flex items-start gap-x1_5 t6-bold text-fg-neutral">
                  <span className="min-w-0 flex-1">{p.title}</span>
                  {externalUrl ? (
                    <ArrowUpRight className="mt-x0_5 size-x5 shrink-0 text-fg-placeholder" strokeWidth={2.2} />
                  ) : (
                    <ChevronRight className="mt-x0_5 size-x5 shrink-0 text-fg-placeholder" strokeWidth={2.2} />
                  )}
                </p>
                {p.summary && (
                  <p className="mt-x1_5 line-clamp-2 t4-regular text-fg-neutral-subtle">{p.summary}</p>
                )}
                <p className="mt-x3 t3-regular text-fg-neutral-subtle">
                  {p.publishedAt.toLocaleDateString("ko-KR", {
                    timeZone: "Asia/Seoul",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                  {p.authorName && ` · ${p.authorName}`}
                </p>
              </div>
            </>
          );
          const cardClass = cn(
            "block overflow-hidden rounded-r5 bg-bg-layer-default active:bg-bg-layer-default-pressed",
            PRESS
          );
          return externalUrl ? (
            <a key={p.id} href={externalUrl} target="_blank" rel="noopener" className={cardClass}>
              {inner}
            </a>
          ) : (
            <Link key={p.id} href={`/s/${token}/contents/${p.id}`} className={cardClass}>
              {inner}
            </Link>
          );
        })
      )}
    </div>
  );
}
