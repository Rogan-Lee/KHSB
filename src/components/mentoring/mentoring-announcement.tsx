"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createAnnouncement, getAnnouncementHistory } from "@/actions/announcements";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { MarkdownViewer } from "@/components/ui/markdown-viewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Megaphone, Pencil, X, Check, Loader2, ChevronLeft, ChevronRight, History, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

interface AnnouncementData {
  title: string;
  content: string;
  createdAt: Date;
  author: { name: string };
}

interface Props {
  announcement: AnnouncementData | null;
  isDirector: boolean;
}

function HistoryTab() {
  const [items, setItems] = useState<AnnouncementData[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
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
      setExpandedIdx(null);
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
    <div className="space-y-3">
      {isPending ? (
        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          불러오는 중...
        </div>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-3 py-2 font-medium">제목</th>
                <th className="text-left px-3 py-2 font-medium w-20">작성자</th>
                <th className="text-left px-3 py-2 font-medium w-28">작성일</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <>
                  <tr
                    key={`row-${page}-${i}`}
                    className="border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        {expandedIdx === i ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                        {item.title || "제목 없음"}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{item.author.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(item.createdAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric", weekday: "short" })}
                    </td>
                  </tr>
                  {expandedIdx === i && (
                    <tr key={`detail-${page}-${i}`}>
                      <td colSpan={3} className="px-4 py-3 bg-muted/20">
                        <MarkdownViewer source={item.content} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
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
      )}
    </div>
  );
}

export function MentoringAnnouncement({ announcement, isDirector }: Props) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const [tab, setTab] = useState("current");

  async function handleSave() {
    if (!title.trim()) {
      toast.error("제목을 입력해주세요");
      return;
    }
    setSaving(true);
    try {
      await createAnnouncement("mentoring", title.trim(), content);
      setEditing(false);
      setTitle("");
      setContent("");
      toast.success("공지사항이 등록되었습니다");
      router.refresh();
    } catch {
      toast.error("저장에 실패했습니다");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setTitle("");
    setContent("");
    setEditing(false);
  }

  function handleNewAnnouncement() {
    setTab("current");
    setEditing(true);
  }

  return (
    <Tabs value={tab} onValueChange={setTab}>
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
            <Button variant="ghost" size="sm" onClick={handleNewAnnouncement}>
              <Pencil className="h-3.5 w-3.5 mr-1" />
              새 공지
            </Button>
          )}
        </div>
      </div>

      <TabsContent value="current" className="mt-0">
        {editing ? (
          <div className="space-y-3">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="공지 제목을 입력하세요"
              className="font-medium"
            />
            <MarkdownEditor
              value={content}
              onChange={setContent}
              placeholder="멘토들에게 전달할 공지사항을 작성하세요..."
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={handleCancel} disabled={saving}>
                <X className="h-3.5 w-3.5 mr-1" />
                취소
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving || !content.trim()}>
                {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                등록
              </Button>
            </div>
          </div>
        ) : announcement ? (
          <div>
            {announcement.title && (
              <h4 className="font-semibold text-sm mb-2">{announcement.title}</h4>
            )}
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
