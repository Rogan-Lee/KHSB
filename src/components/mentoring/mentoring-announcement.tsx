"use client";

import { Fragment, useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createAnnouncement, updateAnnouncement, deleteAnnouncement, deleteAnnouncementsBulk, getAnnouncementHistory } from "@/actions/announcements";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { MarkdownViewer } from "@/components/ui/markdown-viewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState, FormActions, FormField, Skeleton } from "@/components/backoffice/ui";
import { Megaphone, Pencil, ChevronLeft, ChevronRight, ChevronDown, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "./confirm-dialog";

interface AnnouncementData {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
  author: { name: string };
}

interface Props {
  announcement: AnnouncementData | null;
  canEdit: boolean;
}

interface HistoryTabProps {
  canEdit: boolean;
  onEdit: (item: AnnouncementData) => void;
}

function HistorySkeleton() {
  return (
    <div className="flex flex-col gap-x3 px-x5 py-x4" aria-busy="true" aria-label="불러오는 중">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-x6 w-full" />
      ))}
    </div>
  );
}

function HistoryTab({ canEdit, onEdit }: HistoryTabProps) {
  const [items, setItems] = useState<AnnouncementData[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
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
      setSelected(new Set());
    });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((item) => item.id)));
    }
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    setBulkDeleting(true);
    try {
      await deleteAnnouncementsBulk([...selected]);
      toast.success(`${selected.size}개 공지가 삭제되었습니다`);
      setBulkConfirmOpen(false);
      router.refresh();
      loadPage(page);
    } catch {
      toast.error("삭제에 실패했습니다");
    } finally {
      setBulkDeleting(false);
    }
  }

  if (!loaded) return <HistorySkeleton />;

  if (total === 0) {
    return <EmptyState compact icon={Megaphone} title="등록된 공지사항이 없어요" />;
  }

  const totalPages = Math.ceil(total / pageSize);
  const allChecked = items.length > 0 && selected.size === items.length;

  return (
    <div>
      {/* 목록 머리 — 전체 선택 · 선택 삭제 */}
      {canEdit && (
        <div className="flex min-h-12 items-center gap-x3 border-y border-stroke-neutral-muted bg-bg-layer-fill px-x5 py-x2">
          <Checkbox
            checked={allChecked ? true : selected.size > 0 ? "indeterminate" : false}
            onCheckedChange={toggleAll}
            aria-label="이 페이지 공지 전체 선택"
          />
          <span className="t3-medium text-fg-neutral-subtle">
            {selected.size > 0 ? `${selected.size}개 선택됨` : "전체 선택"}
          </span>
          {selected.size > 0 && (
            <Button
              variant="ghost"
              size="xs"
              className="ml-auto text-fg-critical"
              onClick={() => setBulkConfirmOpen(true)}
              disabled={bulkDeleting}
            >
              <Trash2 />
              선택 삭제
            </Button>
          )}
        </div>
      )}

      {isPending ? (
        <HistorySkeleton />
      ) : (
        <ul className={cn(!canEdit && "border-t border-stroke-neutral-muted")}>
          {items.map((item, i) => {
            const expanded = expandedIdx === i;
            return (
              <Fragment key={`row-${page}-${i}`}>
                <li
                  className={cn(
                    "flex items-center gap-x3 border-b border-stroke-neutral-muted px-x5 py-x3 transition-colors",
                    selected.has(item.id) ? "bg-bg-neutral-weak" : "hover:bg-bg-layer-default-pressed"
                  )}
                >
                  {canEdit && (
                    <Checkbox
                      checked={selected.has(item.id)}
                      onCheckedChange={() => toggleSelect(item.id)}
                      aria-label={`${item.title || "제목 없음"} 선택`}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setExpandedIdx(expanded ? null : i)}
                    aria-expanded={expanded}
                    className="flex min-w-0 flex-1 items-center gap-x2 text-left"
                  >
                    <ChevronDown
                      className={cn("size-4 shrink-0 text-fg-neutral-subtle transition-transform", expanded && "rotate-180")}
                      aria-hidden
                    />
                    <span className="truncate t4-medium text-fg-neutral">{item.title || "제목 없음"}</span>
                  </button>
                  <span className="hidden shrink-0 t3-regular text-fg-neutral-subtle sm:inline">{item.author.name}</span>
                  <span className="shrink-0 t3-regular tabular-nums text-fg-neutral-subtle">
                    {new Date(item.createdAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric", weekday: "short" })}
                  </span>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => onEdit(item)}
                      aria-label="공지 수정"
                    >
                      <Pencil />
                    </Button>
                  )}
                </li>
                {expanded && (
                  <li className="border-b border-stroke-neutral-muted bg-bg-layer-fill px-x5 py-x4">
                    <MarkdownViewer source={item.content} />
                  </li>
                )}
              </Fragment>
            );
          })}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-x2 px-x5 py-x3">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={page === 0 || isPending}
            onClick={() => loadPage(page - 1)}
            aria-label="이전 페이지"
          >
            <ChevronLeft />
          </Button>
          <span className="t3-medium tabular-nums text-fg-neutral-muted">{page + 1} / {totalPages}</span>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={page >= totalPages - 1 || isPending}
            onClick={() => loadPage(page + 1)}
            aria-label="다음 페이지"
          >
            <ChevronRight />
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={bulkConfirmOpen}
        onOpenChange={setBulkConfirmOpen}
        title={`공지 ${selected.size}개 삭제`}
        description="선택한 공지를 삭제할까요? 삭제한 공지는 되돌릴 수 없어요."
        pending={bulkDeleting}
        onConfirm={handleBulkDelete}
      />
    </div>
  );
}

export function MentoringAnnouncement({ announcement, canEdit }: Props) {
  const [editing, setEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const router = useRouter();
  const [tab, setTab] = useState("current");
  const [collapsed, setCollapsed] = useState(false);

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

  function handleEditCurrent() {
    if (!announcement) return;
    setTab("current");
    setEditingId(announcement.id);
    setTitle(announcement.title);
    setContent(announcement.content);
    setEditing(true);
  }

  function handleEditHistory(item: AnnouncementData) {
    setTab("current");
    setEditingId(item.id);
    setTitle(item.title);
    setContent(item.content);
    setEditing(true);
  }

  async function handleDeleteCurrent() {
    if (!announcement) return;
    setSaving(true);
    try {
      await deleteAnnouncement(announcement.id);
      toast.success("공지가 삭제되었습니다");
      setDeleteConfirmOpen(false);
      router.refresh();
    } catch {
      toast.error("삭제에 실패했습니다");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Tabs
      value={tab}
      onValueChange={setTab}
      className="rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default"
    >
      {/* 머리 — 제목(누르면 접기/펼치기) · 탭 · 새 공지 */}
      <div className="flex flex-wrap items-center justify-between gap-x3 px-x5 py-x4">
        <h2 className="min-w-0">
          <button
            type="button"
            onClick={() => !editing && setCollapsed(!collapsed)}
            aria-expanded={!collapsed}
            className="flex min-w-0 max-w-full items-center gap-x2 text-left"
          >
            <ChevronDown
              className={cn("size-5 shrink-0 text-fg-neutral-subtle transition-transform", collapsed && "-rotate-90")}
              aria-hidden
            />
            <span className="shrink-0 t6-bold text-fg-neutral">공지사항</span>
            {collapsed && announcement?.title && (
              <span className="truncate t4-regular text-fg-neutral-subtle">{announcement.title}</span>
            )}
          </button>
        </h2>
        {!collapsed && (
          <div className="flex flex-wrap items-center gap-x2">
            <TabsList variant="segment">
              <TabsTrigger value="current">이번 주</TabsTrigger>
              <TabsTrigger value="history">지난 공지</TabsTrigger>
            </TabsList>
            {canEdit && !editing && (
              <Button variant="outline" size="sm" onClick={handleNewAnnouncement}>
                <Plus />
                새 공지
              </Button>
            )}
          </div>
        )}
      </div>

      {!collapsed && (
        <>
          <TabsContent value="current" className="mt-0 px-x5 pb-x5">
            {editing ? (
              <div className="flex flex-col gap-x4">
                <FormField label="제목" required>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="공지 제목을 입력하세요"
                  />
                </FormField>
                <FormField label="내용" required>
                  <MarkdownEditor
                    value={content}
                    onChange={setContent}
                    placeholder="멘토들에게 전달할 공지사항을 작성하세요..."
                  />
                </FormField>
                <FormActions>
                  <Button variant="outline" onClick={handleCancel} disabled={saving}>
                    취소
                  </Button>
                  <Button onClick={handleSave} disabled={saving || !content.trim()}>
                    {saving ? "저장 중…" : editingId ? "수정" : "등록"}
                  </Button>
                </FormActions>
              </div>
            ) : announcement ? (
              <div>
                {announcement.title && (
                  <h3 className="mb-x3 t7-bold text-fg-neutral">{announcement.title}</h3>
                )}
                <MarkdownViewer source={announcement.content} />
                <div className="mt-x4 flex flex-wrap items-center justify-between gap-x2 border-t border-stroke-neutral-muted pt-x3">
                  <p className="t3-regular text-fg-neutral-subtle">
                    {announcement.author.name} · {new Date(announcement.createdAt).toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" })}
                  </p>
                  {canEdit && (
                    <div className="flex items-center gap-x1">
                      <Button variant="ghost" size="xs" onClick={handleEditCurrent}>
                        <Pencil />
                        수정
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        className="text-fg-critical"
                        onClick={() => setDeleteConfirmOpen(true)}
                        disabled={saving}
                      >
                        <Trash2 />
                        삭제
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <EmptyState
                compact
                icon={Megaphone}
                title="이번 주 공지가 없어요"
                description={canEdit ? "멘토들에게 전할 내용을 공지로 남겨 보세요" : undefined}
                action={
                  canEdit ? (
                    <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                      <Pencil />
                      공지 작성
                    </Button>
                  ) : undefined
                }
                className="rounded-r3 bg-bg-layer-fill"
              />
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-0 pb-x2">
            <HistoryTab canEdit={canEdit} onEdit={handleEditHistory} />
          </TabsContent>
        </>
      )}

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="공지 삭제"
        description="현재 공지를 삭제할까요? 삭제한 공지는 되돌릴 수 없어요."
        pending={saving}
        onConfirm={handleDeleteCurrent}
      />
    </Tabs>
  );
}
