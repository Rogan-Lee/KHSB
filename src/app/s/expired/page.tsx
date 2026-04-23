export default function StudentPortalExpiredPage() {
  return (
    <div className="min-h-screen bg-canvas grid place-items-center px-4">
      <div className="max-w-[420px] w-full rounded-[12px] border border-line bg-panel p-6 text-center">
        <h1 className="text-[16px] font-semibold text-ink">링크가 만료되었습니다</h1>
        <p className="mt-2 text-[13px] text-ink-4 leading-relaxed">
          이 접속 링크는 더 이상 유효하지 않습니다.
          <br />
          담당 원장님께 재발급을 요청해 주세요.
        </p>
        <p className="mt-4 text-[11px] text-ink-5 leading-relaxed">
          링크가 외부에 노출된 것이 의심되면 즉시 원장님께 알려 주세요.
          이전 링크가 무효화되고 새 링크가 발급됩니다.
        </p>
      </div>
    </div>
  );
}
