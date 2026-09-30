"use client";

import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

// Mirrors ADULT_CONSENT_COOKIE in lib/reader/adultGate.ts, which is server-only.
const COOKIE = "starotaku_adult_ok";
const ONE_YEAR_SECONDS = 31_536_000;

export function AdultConsentGate() {
  const router = useRouter();

  function confirm() {
    document.cookie = `${COOKIE}=1; Max-Age=${ONE_YEAR_SECONDS}; Path=/; SameSite=Lax`;
    router.refresh();
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border border-border bg-surface p-8 text-center">
      <ShieldAlert className="size-10 text-primary" />
      <h1 className="text-lg font-bold text-foreground">Adult content</h1>
      <p className="text-sm text-muted">
        This section contains sexually explicit material. Continue only if you are 18 or older and it is legal where
        you live.
      </p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => router.push("/")}>
          Leave
        </Button>
        <Button onClick={confirm}>I am 18 or older</Button>
      </div>
    </div>
  );
}
