import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isStaff } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { toContentPostType } from "@/lib/content-posts-meta";
import { ContentPostsAdmin } from "./_components/content-posts-admin";

export const dynamic = "force-dynamic";

export default async function ContentsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!isStaff(session.user.role)) redirect("/");

  const posts = await prisma.contentPost.findMany({
    orderBy: { publishedAt: "desc" },
  });

  // 페이지 머리(PageHeader)는 "콘텐츠 추가" 버튼이 필터 상태를 쓰므로 ContentPostsAdmin 안에서 그린다.
  return (
    <ContentPostsAdmin
      posts={posts.map((p) => ({
        id: p.id,
        type: toContentPostType(p.type),
        title: p.title,
        summary: p.summary,
        url: p.url,
        body: p.body,
        authorName: p.authorName,
        authorRole: p.authorRole,
        authorKey: p.authorKey,
        coverImageUrl: p.coverImageUrl,
        publishedAt: p.publishedAt.toISOString(),
        visible: p.visible,
      }))}
    />
  );
}
