import { notFound, redirect } from "next/navigation";
import { IconArrowUpRightLine } from "@karrotmarket/react-monochrome-icon";
import { ImageFrame, SuffixIcon } from "@seed-design/react";
import { ContentPlaceholder } from "seed-design/ui/content-placeholder";
import { validateMagicLink } from "@/lib/student-auth";
import { prisma } from "@/lib/prisma";
import { MarkdownViewer } from "@/components/ui/markdown-viewer";
import {
  CONTENT_TYPE_META,
  toContentPostType,
  type ContentPostType,
} from "@/lib/content-posts-meta";
import { cn } from "@/lib/utils";
import { Avatar, BottomCTA, ButtonLink, TONE_SOFT, type Tone } from "@/components/portal/ui";

export const dynamic = "force-dynamic";

// CONTENT_TYPE_META.tone(관리자 화면과 공유, KHSB 클래스)과 같은 색 계열을 포털에선 SEED 토큰으로
const TYPE_TONE: Record<ContentPostType, Tone> = {
  review: "warn",
  mentor: "violet",
  director: "brand",
  podcast: "info",
  article: "ok",
};

export default async function StudentContentDetailPage({
  params,
}: {
  params: Promise<{ token: string; id: string }>;
}) {
  const { token, id } = await params;
  const session = await validateMagicLink(token);
  if (!session) redirect("/s/expired");

  const post = await prisma.contentPost.findFirst({
    where: { id, visible: true },
    select: {
      id: true,
      type: true,
      title: true,
      summary: true,
      url: true,
      body: true,
      coverImageUrl: true,
      publishedAt: true,
      authorName: true,
      authorRole: true,
    },
  });
  if (!post) notFound();

  const type = toContentPostType(post.type);
  const meta = CONTENT_TYPE_META[type];

  return (
    <article className="pb-x4">
      {post.coverImageUrl && (
        <div className="-mx-4 -mt-1 mb-x6">
          {/* ponytail: 외부 이미지 URL이라 next/image 대신 SEED ImageFrame(<img>) 사용 (도메인 화이트리스트 불필요).
              로딩 중·깨진 이미지는 ContentPlaceholder 로 대체된다. */}
          <ImageFrame
            src={post.coverImageUrl}
            alt=""
            ratio={16 / 10}
            borderRadius={0}
            maxHeight="256px"
            fallback={<ContentPlaceholder type="image" />}
          />
        </div>
      )}

      <div className={cn("flex items-center gap-x2", !post.coverImageUrl && "pt-x3")}>
        <span
          className={cn(
            "inline-flex h-x6 items-center rounded-r1_5 px-x2 t2-bold",
            TONE_SOFT[TYPE_TONE[type]]
          )}
        >
          {meta.label}
        </span>
        <span className="t3-regular text-fg-neutral-subtle">
          {post.publishedAt.toLocaleDateString("ko-KR", {
            timeZone: "Asia/Seoul",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </span>
      </div>

      <h1 className="mt-x3 t10-bold text-fg-neutral">{post.title}</h1>

      {post.authorName && (
        <div className="mt-x4 flex items-center gap-x2_5">
          <Avatar name={post.authorName} size={32} />
          <p className="min-w-0 t4-regular">
            <span className="t4-bold text-fg-neutral-muted">{post.authorName}</span>
            {post.authorRole && <span className="text-fg-neutral-subtle"> · {post.authorRole}</span>}
          </p>
        </div>
      )}

      {post.summary && (
        <p className="mt-x6 rounded-r4 bg-bg-layer-fill px-x4 py-x3_5 t5-regular text-fg-neutral-muted">
          {post.summary}
        </p>
      )}

      {post.body && (
        <MarkdownViewer
          source={post.body}
          className="mt-x6 [&_.tiptap]:text-size-t5! [&_.tiptap]:leading-t7! [&_.tiptap_p]:my-x2!"
        />
      )}

      {post.url && (
        <BottomCTA>
          <ButtonLink href={post.url} external variant={post.body ? "gray" : "primary"} size="xl" block>
            원문 보기
            <SuffixIcon svg={<IconArrowUpRightLine />} />
          </ButtonLink>
        </BottomCTA>
      )}
    </article>
  );
}
