import Image from "next/image";

export function AuthShell({
  children,
  description,
  title,
}: {
  children: React.ReactNode;
  description: string;
  title: string;
}) {
  return (
    <main className="min-h-screen bg-canvas px-4 py-10 sm:grid sm:place-items-center">
      <section className="mx-auto w-full max-w-[420px]">
        <div className="mb-7 flex flex-col items-center text-center">
          <Image
            src="/khsb-logo.png"
            alt="KHSB"
            width={640}
            height={242}
            priority
            className="mb-4 h-11 w-auto"
          />
          <p className="text-[13px] font-semibold text-brand-2">
            스터디룸 매니저
          </p>
          <h1 className="mt-1 text-2xl font-bold text-ink">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-ink-3">{description}</p>
        </div>
        <div className="rounded-[8px] border border-line bg-panel p-5 shadow-[var(--shadow-sm)]">
          {children}
        </div>
      </section>
    </main>
  );
}
