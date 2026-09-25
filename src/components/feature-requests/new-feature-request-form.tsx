"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { FormActions, FormField, Section, Segmented } from "@/components/backoffice/ui";
import { createFeatureRequest } from "@/actions/feature-requests";
import {
  CATEGORY_OPTIONS, PRIORITY_OPTIONS, RELATED_PAGE_OPTIONS, DESCRIPTION_TEMPLATES,
} from "@/lib/feature-request-constants";
import { toast } from "sonner";

const CATEGORY_SEGMENTS = CATEGORY_OPTIONS.map((o) => ({ value: o.value as string, label: o.label }));
const PRIORITY_SEGMENTS = PRIORITY_OPTIONS.map((o) => ({ value: o.value as string, label: o.label }));

export function NewFeatureRequestForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState(DESCRIPTION_TEMPLATES["FEATURE"] ?? "");
  const [category, setCategory] = useState("FEATURE");
  const [priority, setPriority] = useState("NORMAL");
  const [editorKey, setEditorKey] = useState(0);

  function handleCategoryChange(newCategory: string) {
    const allTemplates = Object.values(DESCRIPTION_TEMPLATES);
    const isUntouched = !description || allTemplates.includes(description);
    setCategory(newCategory);
    if (isUntouched) {
      setDescription(DESCRIPTION_TEMPLATES[newCategory] ?? "");
      setEditorKey((k) => k + 1);
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
    <form onSubmit={handleSubmit}>
      <Section>
        <div className="flex flex-col gap-x6">
          {/* 제목 */}
          <FormField label="제목" htmlFor="feature-request-title" required>
            <Input
              id="feature-request-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="요청 제목을 간단히 입력하세요"
            />
          </FormField>

          {/* 카테고리 + 우선순위 */}
          <div className="grid grid-cols-1 gap-x6 md:grid-cols-2">
            <FormField label="카테고리">
              <Segmented<string>
                aria-label="카테고리"
                options={CATEGORY_SEGMENTS}
                value={category}
                onChange={handleCategoryChange}
              />
            </FormField>
            <FormField
              label="우선순위"
              hint={priority === "URGENT" ? "긴급 요청은 목록에서 빨간 배지로 표시돼요." : undefined}
            >
              <Segmented<string>
                aria-label="우선순위"
                options={PRIORITY_SEGMENTS}
                value={priority}
                onChange={setPriority}
              />
            </FormField>
          </div>

          {/* 관련 페이지 + 요청자 */}
          <div className="grid grid-cols-1 gap-x6 md:grid-cols-2">
            <FormField label="관련 페이지">
              <Select value={relatedPage} onValueChange={setRelatedPage}>
                <SelectTrigger aria-label="관련 페이지">
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
            </FormField>
            <FormField label="요청자" htmlFor="feature-request-requester">
              <Input
                id="feature-request-requester"
                value={requester}
                onChange={(e) => setRequester(e.target.value)}
                placeholder="카톡으로 보낸 사람 이름 (선택)"
              />
            </FormField>
          </div>

          {/* 상세 설명 */}
          <FormField
            label="상세 설명"
            hint="마크다운을 지원해요. 이미지를 끌어다 놓거나 붙여넣으면 스크린샷을 첨부할 수 있어요."
          >
            <MarkdownEditor
              key={editorKey}
              value={description}
              onChange={setDescription}
              placeholder="어떤 기능이 필요한지, 현재 어떤 문제가 있는지 구체적으로 작성해 주세요..."
            />
          </FormField>
        </div>
      </Section>

      {/* 버튼 */}
      <FormActions className="mt-x4 flex-col-reverse items-stretch sm:flex-row sm:items-center">
        <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => router.back()}>
          취소
        </Button>
        <Button type="submit" className="w-full sm:w-auto" disabled={isPending || !title.trim()}>
          {isPending ? "등록 중…" : "요청 등록"}
        </Button>
      </FormActions>
    </form>
  );
}
