"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, TriangleAlert } from "lucide-react";
import { registerAccessAgent } from "@/actions/access-control";
import { FormField, Notice, Segmented } from "@/components/backoffice/ui";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAccessAction } from "./shared";

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    toast.error("복사하지 못했어요. 글자를 직접 선택해 복사해 주세요.");
  }
}

/** 장비 등록 — 토큰은 등록 직후 이 창에서 한 번만 볼 수 있다 (서버에는 해시만 남는다) */
export function AgentRegisterDialog({ onClose }: { onClose: () => void }) {
  const { pending, run } = useAccessAction();
  const [name, setName] = useState("");
  const [issued, setIssued] = useState<{ token: string; origin: string } | null>(null);
  const [os, setOs] = useState<"windows" | "linux">("windows");

  function submit() {
    run(() => registerAccessAgent(name), {
      success: "장비를 등록했어요",
      onSuccess: (result) => setIssued({ token: result.token, origin: window.location.origin }),
    });
  }

  if (issued) {
    // 설치 스크립트와 에이전트는 이 대시보드가 직접 내려 준다 (public/access-agent) — 서버와 장비의 버전이 어긋나지 않는다
    const { origin, token } = issued;
    const command =
      os === "windows"
        ? // 받은 내용을 UTF-8 로 직접 풀어 실행한다 — 서버가 붙이는 글자 인코딩 표시에 기대지 않기 위해서
          `$env:SRM_URL='${origin}'; $env:SRM_TOKEN='${token}'; iex ([Text.Encoding]::UTF8.GetString((New-Object Net.WebClient).DownloadData("$env:SRM_URL/access-agent/install.ps1")))`
        : `curl -fsSL ${origin}/access-agent/install.sh | sudo SRM_URL=${origin} SRM_TOKEN=${token} sh`;
    const where =
      os === "windows"
        ? "장비로 쓸 윈도우 PC 에서 시작 버튼을 우클릭해 '터미널(관리자)'를 열고 붙여 넣어 주세요."
        : "장비(미니 PC·라즈베리파이)의 터미널에 붙여 넣어 주세요.";

    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        {/* 토큰을 옮겨 적기 전에 바깥을 눌러 닫히지 않게 한다 */}
        <DialogContent
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          className="[&>button:last-child]:hidden"
        >
          <DialogHeader>
            <DialogTitle>장비 토큰</DialogTitle>
            <DialogDescription>아래 설치 명령을 시설 장비에서 실행하면 연결돼요.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-x5">
            <Notice tone="warn" icon={TriangleAlert} title="지금 복사해 두세요">
              이 창을 닫으면 토큰을 다시 볼 수 없어요. 잃어버리면 장비를 삭제하고 새로 등록해야 해요.
            </Notice>

            <FormField label="토큰">
              <div className="flex items-start gap-x2">
                <code className="min-w-0 flex-1 break-all rounded-r2 bg-bg-layer-fill px-x3 py-x2_5 font-mono t3-regular text-fg-neutral">
                  {issued.token}
                </code>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => copy(issued.token, "토큰을 복사했어요")}
                >
                  <Copy /> 복사
                </Button>
              </div>
            </FormField>

            <FormField
              label="설치 명령"
              hint={`${where} AdGuard Home 과 연결 프로그램이 한 번에 설치돼요. 끝나면 공유기의 DNS 주소만 장비 주소로 바꾸면 돼요.`}
            >
              <Segmented
                aria-label="장비 운영체제"
                value={os}
                onChange={setOs}
                options={[
                  { value: "windows", label: "윈도우" },
                  { value: "linux", label: "리눅스" },
                ]}
              />
              <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-r2 bg-bg-layer-fill px-x3 py-x2_5 font-mono t3-regular text-fg-neutral">
                {command}
              </pre>
              <Button
                type="button"
                variant="secondary"
                className="self-start"
                onClick={() => copy(command, "설치 명령을 복사했어요")}
              >
                <Copy /> 명령 복사
              </Button>
            </FormField>
          </div>
          <DialogFooter>
            <Button type="button" onClick={onClose}>
              복사해 뒀어요
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>장비 등록</DialogTitle>
          <DialogDescription>시설에 둔 장비가 규칙을 받아 갈 수 있게 토큰을 만들어요.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-x5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <FormField label="장비 이름" htmlFor="access-agent-name" hint="어디에 둔 장비인지 알아볼 수 있게 적어 주세요.">
            <Input
              id="access-agent-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder="예: 본관 3층"
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              취소
            </Button>
            <Button type="submit" disabled={pending}>
              등록
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
