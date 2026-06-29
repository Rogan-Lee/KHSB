import Image from "next/image";
import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 bg-background">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background pointer-events-none" />
      <Image
        src="/khsb-logo.png"
        alt="KHSB"
        width={640}
        height={242}
        priority
        className="relative h-12 w-auto"
      />
      <SignIn />
    </div>
  );
}
