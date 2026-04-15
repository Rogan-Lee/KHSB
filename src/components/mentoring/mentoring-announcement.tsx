"use client";

import { useState, useTransition, useEffect } from "react";
import { createAnnouncement, getAnnouncementHistory } from "@/actions/announcements";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { MarkdownViewer } from "@/components/ui/markdown-viewer";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Megaphone, Pencil, X, Check, Loader2, ChevronLeft, ChevronRight, History } from "lucide-react";
import { toast } from "sonner";

interface AnnouncementData {
  content: string;
  createdAt: Date;
  author: { name: string };
}

interface Props {
  announcement: AnnouncementData | null;
  isDirector: boolean;
}

function AnnouncementCard({ item }: { item: AnnouncementData }) {
  return (
    <div>
      <div className="rounded-md border bg-muted/30 p-4">
        <MarkdownViewer source={item.content} />
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        작성: {item.author.name} · {new Date(item.createdAt).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" })}
      </p>
    </div>
  );
}

function HistoryTab() {
  const [items, setItems] = useState<AnnouncementData[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const pageSize = 5;

  useEffect(() => {
    loadPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadPage(p: number) {
    startTransition(async () => {
      const result = await getAnnouncementHistory("mentoring", p * pageSize, pageSize);
      setItems(result.items);
      setTotal(result.total);
      setPage(p);
      setLoaded(true);
    });
  }

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        불러오는 중...
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        이전 공지사항이 없습니다
      </div>
    );
  }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4">
      {isPending ? (
        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          불러오는 중...
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item, i) => (
            <AnnouncementCard key={`${page}-${i}`} item={item} />
          ))}
        </div>
      )}

      {/* 페이지네이션 */}
      <div className="flex items-center justify-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page === 0 || isPending}
          onClick={() => loadPage(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm text-muted-foreground">
          {page + 1} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages - 1 || isPending}
          onClick={() => loadPage(page + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function MentoringAnnouncement({ announcement, isDirector }: Props) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      try {
        await createAnnouncement("mentoring", content);
        setEditing(false);
        setContent("");
        toast.success("공지사항이 등록되었습니다");
      } catch {
        toast.error("저장에 실패했습니다");
      }
    });
  }

  function handleCancel() {
    setContent("");
    setEditing(false);
  }

  return (
    <Tabs defaultValue="current">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-orange-500" />
          <h3 className="font-semibold text-base">공지사항</h3>
        </div>
        <div className="flex items-center gap-2">
          <TabsList className="h-8">
            <TabsTrigger value="current" className="text-xs px-3 h-7">이번 주</TabsTrigger>
            <TabsTrigger value="history" className="text-xs px-3 h-7">
              <History className="h-3 w-3 mr-1" />
              이전
            </TabsTrigger>
          </TabsList>
          {isDirector && !editing && (
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5 mr-1" />
              새 공지
            </Button>
          )}
        </div>
      </div>

      <TabsContent value="current" className="mt-0">
        {editing ? (
          <div className="space-y-3">
            <MarkdownEditor
              value={content}
              onChange={setContent}
              placeholder="멘토들에게 전달할 공지사항을 작성하세요..."
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={handleCancel} disabled={isPending}>
                <X className="h-3.5 w-3.5 mr-1" />
                취소
              </Button>
              <Button size="sm" onClick={handleSave} disabled={isPending || !content.trim()}>
                {isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                등록
              </Button>
            </div>
          </div>
        ) : announcement ? (
          <div>
            <div className="rounded-md border bg-orange-50/50 dark:bg-orange-950/20 p-4">
              <MarkdownViewer source={announcement.content} />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              작성: {announcement.author.name} · {new Date(announcement.createdAt).toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" })}
            </p>
          </div>
        ) : (
          <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
            {isDirector ? (
              <button onClick={() => setEditing(true)} className="hover:text-foreground transition-colors">
                공지사항을 작성해주세요
              </button>
            ) : (
              "등록된 공지사항이 없습니다"
            )}
          </div>
        )}
      </TabsContent>

      <TabsContent value="history" className="mt-0">
        <HistoryTab />
      </TabsContent>
    </Tabs>
  );
}
