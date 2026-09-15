import Image from "next/image";
import { LoginForm } from "@/components/LoginForm";
import { GlassCard } from "@/components/ui";

export default function LoginPage() {
  return (
    <main
      className="flex flex-1 items-center justify-center px-4 py-12"
      data-portal="exhibitor"
      style={{ backgroundImage: "var(--gradient-blend)" }}
    >
      <div className="w-full max-w-sm">
        <GlassCard className="p-8 text-white">
          <div className="mb-6 flex items-center gap-3">
            <Image src="/4dx-logo-black.png" alt="4DX" width={2000} height={805} className="h-5 w-auto brightness-0 invert" />
            <Image src="/screenx-logo-black.png" alt="ScreenX" width={2800} height={500} className="h-4 w-auto brightness-0 invert" />
          </div>
          <h1 className="mb-6 text-2xl font-bold tracking-tight">Exhibitor Portal</h1>
          <LoginForm />
          <p className="mt-6 border-t border-glass-border pt-4 text-center text-xs text-white/70">
            Don&apos;t have an account?{" "}
            <a href="mailto:4dplex@cj.net" className="font-medium text-screenx hover:underline">
              Request Here
            </a>
          </p>
        </GlassCard>
      </div>
    </main>
  );
}
