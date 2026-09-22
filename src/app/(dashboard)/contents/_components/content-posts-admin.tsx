"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Eye, EyeOff, ExternalLink } from "lucide-react";
import {
  createContentPost,
  updateContentPost,
  deleteContentPost,
  toggleContentPostVisible,
  type ContentPostInput,
  type ContentPostType,
} from "@/actions/content-posts";

export type ContentPostRow = {
  id: string;
  type: ContentPostType;
  title: string;
  summary: string | null;
  url: string;
  coverImageUrl: string | null;
  publishedAt: string; // ISO
  visible: boolean;
};

const TYPE_META: Record<ContentPostType, { label: string; tone: string }> = {
  podcast: { label: "팟캐스트", tone: "bg-info-soft text-info-ink" },
  article: { label: "아티클", tone: "bg-ok-soft text-ok-ink" },
};

function toKSTDateInput(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

const EMPTY: ContentPostInput = {
  type: "podcast",
  title: "",
  summary: "",
  url: "",
  coverImageUrl: "",
  publishedAt: "",
};

export function ContentPostsAdmin({ posts }: { posts: ContentPostRow[] }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ContentPostInput>(EMPTY);

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY, publishedAt: toKSTDateInput(new Date().toISOString()) });
    setOpen(true);
  }

  function openEdit(p: ContentPostRow) {
    setEditingId(p.id);
    setForm({
      type: p.type,
      title: p.title,
      summary: p.summary ?? "",
      url: p.url,
      coverImageUrl: p.coverImageUrl ?? "",
      publishedAt: toKSTDateInput(p.publishedAt),
    });
    setOpen(true);
  }

  function run(fn: () => Promise<unknown>, ok: string, closeDialog = false) {
    startTransition(async () => {
      try {
        await fn();
        toast.success(ok);
        if (closeDialog) setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "처리 실패");
      }
    });
  }

  function submit() {
    if (editingId) {
      run(() => updateContentPost(editingId, form), "콘텐츠를 수정했습니다", true);
    } else {
      run(() => createContentPost(form), "콘텐츠를 추가했습니다", true);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          총 {posts.length}건 · 공개 {posts.filter((p) => p.visible).length}건
        </p>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          콘텐츠 추가
        </Button>
      </div>

      {posts.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          등록된 콘텐츠가 없습니다. 첫 콘텐츠를 추가해보세요.
        </p>
      ) : (
        <div className="rounded-lg border border-line overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">유형</TableHead>
                <TableHead>제목</TableHead>
                <TableHead className="w-28">발행일</TableHead>
                <TableHead className="w-20">공개</TableHead>
                <TableHead className="w-32 text-right">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {posts.map((p) => (
                <TableRow key={p.id} className={p.visible ? "" : "opacity-55"}>
                  <TableCell>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${TYPE_META[p.type].tone}`}
                    >
                      {TYPE_META[p.type].label}
                    </span>
                  </TableCell>
                  <TableCell>
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
                    >
                      <span className="truncate max-w-[320px]">{p.title}</span>
                      <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                    </a>
                    {p.summary && (
                      <p className="mt-0.5 text-xs text-muted-foreground truncate max-w-[380px]">
                        {p.summary}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {toKSTDateInput(p.publishedAt)}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      title={p.visible ? "비공개로 전환" : "공개로 전환"}
                      onClick={() =>
                        run(
                          () => toggleContentPostVisible(p.id, !p.visible),
                          p.visible ? "비공개로 전환했습니다" : "공개로 전환했습니다"
                        )
                      }
                    >
                      {p.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </Button>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => openEdit(p)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        if (confirm(`"${p.title}" 콘텐츠를 삭제할까요?`)) {
                          run(() => deleteContentPost(p.id), "삭제했습니다");
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "콘텐츠 수정" : "콘텐츠 추가"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>유형</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm((f) => ({ ...f, type: v as ContentPostType }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="podcast">팟캐스트</SelectItem>
                  <SelectItem value="article">아티클</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>제목</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="콘텐츠 제목"
              />
            </div>
            <div className="space-y-1.5">
              <Label>요약 (선택)</Label>
              <Textarea
                value={form.summary ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
                placeholder="한두 문장 소개"
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label>URL</Label>
              <Input
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="https:// 유튜브·블로그 링크"
              />
            </div>
            <div className="space-y-1.5">
              <Label>커버 이미지 URL (선택)</Label>
              <Input
                value={form.coverImageUrl ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, coverImageUrl: e.target.value }))}
                placeholder="https:// 이미지 주소"
              />
            </div>
            <div className="space-y-1.5">
              <Label>발행일</Label>
              <Input
                type="date"
                value={form.publishedAt}
                onChange={(e) => setForm((f) => ({ ...f, publishedAt: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              취소
            </Button>
            <Button onClick={submit} disabled={busy}>
              {editingId ? "저장" : "추가"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
