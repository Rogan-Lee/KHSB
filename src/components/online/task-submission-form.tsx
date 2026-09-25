"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, ImageIcon } from "lucide-react";
import { Fieldset, Icon, PrefixIcon } from "@seed-design/react";
import { IconPlusLine, IconXmarkLine } from "@karrotmarket/react-monochrome-icon";
import { ActionButton } from "seed-design/ui/action-button";
import { ProgressCircle } from "seed-design/ui/progress-circle";
import { TextField, TextFieldTextarea } from "seed-design/ui/text-field";
import {
  createOrUpdateSubmission,
  type UploadedFile,
} from "@/actions/online/task-submissions";
import { Button, IconTile } from "@/components/portal/ui";

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export function TaskSubmissionForm({
  studentToken,
  taskId,
  initialFiles,
  initialNote,
  isSubmitted,
}: {
  studentToken: string;
  taskId: string;
  initialFiles: UploadedFile[];
  initialNote: string | null;
  isSubmitted: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [files, setFiles] = useState<UploadedFile[]>(initialFiles);
  const [note, setNote] = useState(initialNote ?? "");
  const [uploadingName, setUploadingName] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재업로드 가능하도록 초기화
    if (!file) return;

    if (files.length >= 5) {
      toast.error("최대 5개까지 첨부 가능합니다");
      return;
    }

    setUploadingName(file.name);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("taskId", taskId);
      formData.append("studentToken", studentToken);

      const res = await fetch("/api/online/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "업로드 실패");

      setFiles((prev) => [
        ...prev,
        {
          url: data.url,
          name: data.name,
          sizeBytes: data.sizeBytes,
          mimeType: data.mimeType,
        },
      ]);
      toast.success(`${file.name} 업로드 완료`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "업로드 실패");
    } finally {
      setUploadingName(null);
    }
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const onSubmit = () => {
    if (files.length === 0) {
      toast.error("최소 1개의 파일을 첨부하세요");
      return;
    }
    startTransition(async () => {
      try {
        await createOrUpdateSubmission({
          studentToken,
          taskId,
          files,
          note: note.trim() || null,
        });
        toast.success("제출이 완료되었습니다");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "제출 실패");
      }
    });
  };

  return (
    <div className="flex flex-col gap-x6">
      {/* 첨부 파일 — SEED Fieldset(라벨·설명) + 파일 행 + ActionButton 형태의 파일 선택 */}
      <Fieldset.Root>
        <Fieldset.Header>
          <Fieldset.Label>첨부 파일</Fieldset.Label>
        </Fieldset.Header>

        {(files.length > 0 || uploadingName) && (
          <ul className="flex flex-col gap-x1">
            {files.map((f, i) => (
              <li key={i} className="flex items-center gap-x3 py-x1">
                <IconTile
                  icon={f.mimeType?.startsWith("image/") ? ImageIcon : FileText}
                  size={40}
                />
                <a
                  href={f.url}
                  target="_blank"
                  rel="noopener"
                  className="min-w-0 flex-1 transition-opacity active:opacity-60"
                >
                  <p className="truncate t5-medium text-fg-neutral">{f.name}</p>
                  <p className="mt-x0_5 t3-regular tabular-nums text-fg-neutral-subtle">
                    {formatSize(f.sizeBytes)}
                  </p>
                </a>
                <ActionButton
                  variant="ghost"
                  layout="iconOnly"
                  size="medium"
                  color="fg.neutralSubtle"
                  bleedX="asPadding"
                  onClick={() => removeFile(i)}
                  aria-label={`${f.name} 첨부 취소`}
                >
                  <Icon svg={<IconXmarkLine />} />
                </ActionButton>
              </li>
            ))}
            {uploadingName && (
              <li className="flex items-center gap-x3 py-x1" aria-live="polite">
                <span className="inline-flex size-x10 shrink-0 items-center justify-center rounded-r3 bg-bg-neutral-weak">
                  <ProgressCircle size="24" tone="neutral" aria-label="업로드 중" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate t5-medium text-fg-neutral-muted">{uploadingName}</p>
                  <p className="mt-x0_5 t3-regular text-fg-neutral-subtle">올리는 중…</p>
                </div>
              </li>
            )}
          </ul>
        )}

        {files.length < 5 && (
          <ActionButton
            asChild
            variant="neutralWeak"
            size="large"
            disabled={!!uploadingName}
            className="w-full focus-within:shadow-[inset_0_0_0_2px_var(--seed-color-stroke-focus-ring)]"
          >
            <label>
              <PrefixIcon svg={<IconPlusLine />} />
              파일 첨부하기
              <input
                type="file"
                onChange={handleFileChange}
                className="sr-only"
                disabled={!!uploadingName}
                accept=".pdf,.png,.jpg,.jpeg,.docx,.doc,.hwp,.hwpx,.zip"
              />
            </label>
          </ActionButton>
        )}

        <Fieldset.Footer>
          <Fieldset.Description>
            최대 5개, 파일당 50MB까지 올릴 수 있어요. PDF · 이미지 · 워드 · 한글 · ZIP
          </Fieldset.Description>
        </Fieldset.Footer>
      </Fieldset.Root>

      <TextField
        label="코멘트"
        indicator="선택"
        value={note}
        onValueChange={({ value }) => setNote(value)}
      >
        {/* SEED large textarea 는 min-height 94px(≈3줄) + 자동 높이 */}
        <TextFieldTextarea placeholder="컨설턴트에게 전할 내용이 있으면 적어 주세요" />
      </TextField>

      <Button
        variant="primary"
        size="xl"
        block
        onClick={onSubmit}
        loading={isPending}
        disabled={!!uploadingName}
      >
        {isSubmitted ? "다시 제출하기" : "제출하기"}
      </Button>
    </div>
  );
}
