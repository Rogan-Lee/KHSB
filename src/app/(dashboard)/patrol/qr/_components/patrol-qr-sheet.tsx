"use client";

import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { encodeStudentQr } from "@/lib/patrol";

type QrStudent = { id: string; name: string; grade: string; seat: string | null };

export function PatrolQrSheet({ students }: { students: QrStudent[] }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <p className="text-sm text-muted-foreground">
          학생 {students.length}명 · 좌석에 부착할 QR 스티커입니다. 인쇄 후 책상에 부착하세요.
        </p>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-1.5" />
          인쇄
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 print:grid-cols-4">
        {students.map((s) => (
          <div
            key={s.id}
            className="flex flex-col items-center gap-1.5 rounded-lg border border-gray-300 bg-white p-3 text-center break-inside-avoid"
          >
            <QRCodeSVG value={encodeStudentQr(s.id)} size={104} level="M" />
            <p className="mt-1 text-sm font-bold text-gray-900">{s.name}</p>
            <p className="text-xs text-gray-500">
              {s.seat ? `좌석 ${s.seat}` : "좌석 미지정"} · {s.grade}
            </p>
          </div>
        ))}
      </div>

      <style>{`
        @media print {
          @page { margin: 12mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
}
