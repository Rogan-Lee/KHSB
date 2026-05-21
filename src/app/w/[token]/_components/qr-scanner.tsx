"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, CameraOff, Loader2 } from "lucide-react";

/**
 * 카메라 기반 QR 스캐너. getUserMedia + jsQR 로 매 프레임 디코딩.
 * 같은 코드 연속 스캔을 막기 위해 cooldown 적용. HTTPS/localhost 필요.
 */
export function QrScanner({
  active,
  onScan,
  onError,
}: {
  active: boolean;
  onScan: (data: string) => void;
  onError?: (message: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastScanRef = useRef<{ data: string; at: number }>({ data: "", at: 0 });
  const [status, setStatus] = useState<"idle" | "starting" | "running" | "error">("idle");

  useEffect(() => {
    let cancelled = false;

    async function start() {
      setStatus("starting");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        await video.play();
        setStatus("running");
        tick();
      } catch {
        if (cancelled) return;
        setStatus("error");
        onError?.("카메라를 열 수 없어요. 권한을 허용했는지 확인해 주세요.");
      }
    }

    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        const w = video.videoWidth;
        const h = video.videoHeight;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx && w && h) {
          ctx.drawImage(video, 0, 0, w, h);
          const img = ctx.getImageData(0, 0, w, h);
          const code = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
          if (code?.data) {
            const now = Date.now();
            const last = lastScanRef.current;
            // 같은 코드 2초 cooldown
            if (code.data !== last.data || now - last.at > 2000) {
              lastScanRef.current = { data: code.data, at: now };
              onScan(code.data);
            }
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    function stop() {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      const video = videoRef.current;
      if (video) video.srcObject = null;
    }

    if (active) start();
    else {
      stop();
      setStatus("idle");
    }

    return () => {
      cancelled = true;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-black">
      <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
      <canvas ref={canvasRef} className="hidden" />

      {/* 조준 프레임 */}
      {status === "running" && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="h-2/3 w-2/3 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        </div>
      )}

      {status !== "running" && (
        <div className="absolute inset-0 grid place-items-center text-white/80">
          {status === "starting" ? (
            <span className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> 카메라 준비 중…</span>
          ) : status === "error" ? (
            <span className="flex flex-col items-center gap-1 text-sm"><CameraOff className="h-6 w-6" /> 카메라 사용 불가</span>
          ) : (
            <span className="flex flex-col items-center gap-1 text-sm"><Camera className="h-6 w-6" /> 스캔 대기</span>
          )}
        </div>
      )}
    </div>
  );
}
