import { redirect } from "next/navigation";
import { validateMagicLink } from "@/lib/student-auth";
import { prisma } from "@/lib/prisma";
import { Podcast, FileText, ArrowUpRight } from "lucide-react";

export const dynamic = "force-dynamic";

const TYPE_META = {
  podcast: { label: "팟캐스트", icon: Podcast, tone: "bg-info-soft text-info-ink" },
  article: { label: "아티클", icon: FileText, tone: "bg-ok-soft text-ok-ink" },
} as const;

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
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[18px] font-bold tracking-[-0.02em] text-ink">콘텐츠</h2>
        <p className="mt-0.5 text-[12.5px] text-ink-4">
          강한선배가 준비한 팟캐스트·아티클을 만나보세요.
        </p>
      </div>

      {posts.length === 0 ? (
        <p className="py-12 text-center text-[13px] text-ink-4">
          아직 등록된 콘텐츠가 없어요. 곧 찾아올게요!
        </p>
      ) : (
        <div className="space-y-3">
          {posts.map((p) => {
            const meta = TYPE_META[p.type === "podcast" ? "podcast" : "article"];
            const Icon = meta.icon;
            return (
              <a
                key={p.id}
                href={p.url}
                target="_blank"
                rel="noopener"
                className="block overflow-hidden rounded-[14px] border border-line bg-panel active:bg-canvas-2 transition-colors"
              >
                {p.coverImageUrl && (
                  // ponytail: 외부 이미지 URL이라 next/image 대신 img 사용 (도메인 화이트리스트 불필요)
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.coverImageUrl}
                    alt=""
                    className="h-40 w-full object-cover"
                    loading="lazy"
                  />
                )}
                <div className="p-4">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.tone}`}
                    >
                      <Icon className="h-3 w-3" strokeWidth={2.5} />
                      {meta.label}
                    </span>
                    <span className="text-[11px] text-ink-4">
                      {p.publishedAt.toLocaleDateString("ko-KR", {
                        timeZone: "Asia/Seoul",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                  <p className="mt-2 flex items-start gap-1 text-[15px] font-semibold text-ink">
                    <span className="min-w-0 flex-1">{p.title}</span>
                    <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-ink-4" strokeWidth={2.5} />
                  </p>
                  {p.summary && (
                    <p className="mt-1 text-[12.5px] leading-relaxed text-ink-4">{p.summary}</p>
                  )}
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
