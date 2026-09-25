"use client";

import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Printer, QrCode } from "lucide-react";
import { encodeStudentQr } from "@/lib/patrol";
import { EmptyState, Toolbar } from "@/components/backoffice/ui";

type QrStudent = { id: string; name: string; grade: string; seat: string | null };

export function PatrolQrSheet({ students }: { students: QrStudent[] }) {
  return (
    <div>
      <Toolbar className="justify-between print:hidden">
        <p className="t4-regular text-fg-neutral-muted">
          학생 <span className="t4-bold tabular-nums text-fg-neutral">{students.length}</span>명 · 인쇄한 뒤 각 좌석에 붙여 주세요.
        </p>
        <Button onClick={() => window.print()} disabled={students.length === 0}>
          <Printer />
          인쇄
        </Button>
      </Toolbar>

      {students.length === 0 ? (
        <div className="rounded-r4 border border-stroke-neutral-muted print:hidden">
          <EmptyState icon={QrCode} title="재원 중인 학생이 없어요" description="학생이 등록되면 좌석 QR을 만들 수 있어요." />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x3 sm:grid-cols-3 md:grid-cols-4 print:grid-cols-4">
          {students.map((s) => (
            <div
              key={s.id}
              className="flex break-inside-avoid flex-col items-center gap-x1_5 rounded-r3 border border-stroke-neutral-weak bg-bg-layer-default p-x3 text-center"
            >
              <QRCodeSVG value={encodeStudentQr(s.id)} size={104} level="M" />
              <p className="mt-x1 t5-bold text-fg-neutral">{s.name}</p>
              <p className="t3-regular tabular-nums text-fg-neutral-subtle">
                {s.seat ? `좌석 ${s.seat}` : "좌석 미지정"} · {s.grade}
              </p>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @media print {
          @page { margin: 12mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
}
