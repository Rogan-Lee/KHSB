import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isStaff } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { ContentPostsAdmin } from "./_components/content-posts-admin";

export const dynamic = "force-dynamic";

export default async function ContentsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!isStaff(session.user.role)) redirect("/");

  const posts = await prisma.contentPost.findMany({
    orderBy: { publishedAt: "desc" },
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">콘텐츠 관리</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          팟캐스트·아티클 외부 링크를 등록하면 랜딩 페이지와 학생 포털에 노출됩니다.
        </p>
      </div>
      <ContentPostsAdmin
        posts={posts.map((p) => ({
          id: p.id,
          type: p.type === "podcast" ? "podcast" : "article",
          title: p.title,
          summary: p.summary,
          url: p.url,
          coverImageUrl: p.coverImageUrl,
          publishedAt: p.publishedAt.toISOString(),
          visible: p.visible,
        }))}
      />
    </div>
  );
}
