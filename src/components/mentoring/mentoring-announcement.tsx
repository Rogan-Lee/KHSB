"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createAnnouncement, updateAnnouncement, deleteAnnouncement, getAnnouncementHistory } from "@/actions/announcements";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { MarkdownViewer } from "@/components/ui/markdown-viewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Megaphone, Pencil, X, Check, Loader2, ChevronLeft, ChevronRight, History, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface AnnouncementData {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
  author: { name: string };
}

interface Props {
  announcement: AnnouncementData | null;
  isDirector: boolean;
}

function HistoryTab({ isDirector }: { isDirector: boolean }) {
  const [items, setItems] = useState<AnnouncementData[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const pageSize = 5;
  const router = useRouter();

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

  async function handleDelete(id: string) {
    if (!confirm("이 공지를 삭제하시겠습니까?")) return;
    setDeleting(id);
    try {
      await deleteAnnouncement(id);
      toast.success("공지가 삭제되었습니다");
      router.refresh();
      loadPage(page);
    } catch {
      toast.error("삭제에 실패했습니다");
    } finally {
      setDeleting(null);
    }
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
                {isDirector && <th className="w-10" />}
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
                    {isDirector && (
                      <td className="px-2 py-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                          disabled={deleting === item.id}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                        >
                          {deleting === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      </td>
                    )}
                  </tr>
                  {expandedIdx === i && (
                    <tr key={`detail-${page}-${i}`}>
                      <td colSpan={isDirector ? 4 : 3} className="px-4 py-3 bg-muted/20">
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
          <Button variant="outline" size="sm" disabled={page === 0 || isPending} onClick={() => loadPage(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">{page + 1} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages - 1 || isPending} onClick={() => loadPage(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

export function MentoringAnnouncement({ announcement, isDirector }: Props) {
  const [editing, setEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null); // null = 신규, string = 수정
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
      if (editingId) {
        await updateAnnouncement(editingId, title.trim(), content);
        toast.success("공지사항이 수정되었습니다");
      } else {
        await createAnnouncement("mentoring", title.trim(), content);
        toast.success("공지사항이 등록되었습니다");
      }
      setEditing(false);
      setEditingId(null);
      setTitle("");
      setContent("");
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
    setEditingId(null);
  }

  function handleNewAnnouncement() {
    setTab("current");
    setEditingId(null);
    setTitle("");
    setContent("");
    setEditing(true);
  }

  function handleEdit() {
    if (!announcement) return;
    setEditingId(announcement.id);
    setTitle(announcement.title);
    setContent(announcement.content);
    setEditing(true);
  }

  async function handleDelete() {
    if (!announcement) return;
    if (!confirm("현재 공지를 삭제하시겠습니까?")) return;
    setSaving(true);
    try {
      await deleteAnnouncement(announcement.id);
      toast.success("공지가 삭제되었습니다");
      router.refresh();
    } catch {
      toast.error("삭제에 실패했습니다");
    } finally {
      setSaving(false);
    }
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
                {editingId ? "수정" : "등록"}
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
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-muted-foreground">
                작성: {announcement.author.name} · {new Date(announcement.createdAt).toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" })}
              </p>
              {isDirector && (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleEdit}>
                    <Pencil className="h-3 w-3 mr-1" />
                    수정
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={handleDelete} disabled={saving}>
                    <Trash2 className="h-3 w-3 mr-1" />
                    삭제
                  </Button>
                </div>
              )}
            </div>
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
        <HistoryTab isDirector={isDirector} />
      </TabsContent>
    </Tabs>
  );
}
