"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { createFeatureRequest } from "@/actions/feature-requests";
import {
  CATEGORY_OPTIONS, PRIORITY_OPTIONS, RELATED_PAGE_OPTIONS, DESCRIPTION_TEMPLATES,
} from "@/lib/feature-request-constants";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export function NewFeatureRequestForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState(DESCRIPTION_TEMPLATES["FEATURE"] ?? "");
  const [category, setCategory] = useState("FEATURE");
  const [priority, setPriority] = useState("NORMAL");

  function handleCategoryChange(newCategory: string) {
    const allTemplates = Object.values(DESCRIPTION_TEMPLATES);
    const isUntouched = !description || allTemplates.includes(description);
    setCategory(newCategory);
    if (isUntouched) {
      setDescription(DESCRIPTION_TEMPLATES[newCategory] ?? "");
    }
  }
  const [relatedPage, setRelatedPage] = useState("");
  const [requester, setRequester] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { toast.error("제목을 입력하세요"); return; }

    startTransition(async () => {
      try {
        await createFeatureRequest({
          title, description, category, priority,
          relatedPage: relatedPage || undefined,
          requester: requester || undefined,
        });
        toast.success("요청이 등록되었습니다");
        router.push("/requests");
      } catch {
        toast.error("등록에 실패했습니다");
      }
    });
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <Link
          href="/requests"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          요청 목록으로
        </Link>
        <h1 className="text-2xl font-bold">요청사항 등록</h1>
        <p className="text-sm text-muted-foreground mt-1">
          기능에 대한 설명과 스크린샷을 첨부하여 구체적으로 요청해 주세요.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* 제목 */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">제목 *</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="요청 제목을 간단히 입력하세요"
          />
        </div>

        {/* 카테고리 + 우선순위 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="text-sm font-medium">카테고리</Label>
            <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 border">
              {CATEGORY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleCategoryChange(opt.value)}
                  className={cn(
                    "flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                    category === opt.value
                      ? "bg-white shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">우선순위</Label>
            <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 border">
              {PRIORITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPriority(opt.value)}
                  className={cn(
                    "flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                    priority === opt.value
                      ? opt.value === "URGENT" ? "bg-red-50 shadow-sm text-red-700 border border-red-200" : "bg-white shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 관련 페이지 + 요청자 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="text-sm font-medium">관련 페이지</Label>
            <Select value={relatedPage} onValueChange={setRelatedPage}>
              <SelectTrigger>
                <SelectValue placeholder="관련 페이지를 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {RELATED_PAGE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">요청자</Label>
            <Input
              value={requester}
              onChange={(e) => setRequester(e.target.value)}
              placeholder="카톡으로 보낸 사람 이름 (선택)"
            />
          </div>
        </div>

        {/* 상세 설명 */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">상세 설명</Label>
          <p className="text-xs text-muted-foreground">
            마크다운 문법을 지원합니다. 이미지를 드래그하거나 붙여넣기하여 스크린샷을 첨부할 수 있습니다.
          </p>
          <div className="min-h-[300px] border rounded-lg overflow-hidden">
            <MarkdownEditor
              value={description}
              onChange={setDescription}
              placeholder="어떤 기능이 필요한지, 현재 어떤 문제가 있는지 구체적으로 작성해 주세요..."
            />
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex items-center gap-3 pt-4 border-t">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            취소
          </Button>
          <Button type="submit" disabled={isPending || !title.trim()}>
            {isPending ? "등록 중..." : "요청 등록"}
          </Button>
        </div>
      </form>
    </div>
  );
}
