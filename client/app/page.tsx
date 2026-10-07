"use client";

import Link from "next/link";
import DeskPage from "@/components/chrome/desk-page";
import { buttonClass } from "@/components/court/button";
import { useAuth } from "@/contexts/auth-context";

// Interim landing on the new chrome. Slice 7 replaces it with the 3D and classic landings.
export default function Home() {
  const { isAuthenticated } = useAuth();

  return (
    <DeskPage>
      <main className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col justify-center gap-[26px] px-[max(18px,4vw)] py-[clamp(36px,7vw,88px)]">
        <h1 className="m-0 max-w-[760px] text-balance font-display text-[clamp(40px,7vw,96px)] uppercase leading-[1.02]">
          AI Courtroom
        </h1>
        <p className="m-0 max-w-[56ch] text-pretty font-type text-[clamp(16px,1.6vw,19px)] leading-[1.6] text-desk-soft">
          Argue your case. Challenge the AI. Step into the courtroom where justice is decided.
        </p>
        <div className="flex flex-wrap gap-3">
          {isAuthenticated ? (
            <Link href="/cases" className={buttonClass("seal", "lg", "min-h-[52px]")}>
              My cases
            </Link>
          ) : (
            <>
              <Link
                href="/register"
                className="flex min-h-[52px] items-center bg-desk-ink px-[26px] font-type text-[0.84375rem] font-bold uppercase tracking-[0.12em] text-desk"
              >
                Take a Side
              </Link>
              <Link href="/login" className={buttonClass("seal", "lg", "min-h-[52px]")}>
                Login
              </Link>
            </>
          )}
        </div>
      </main>
    </DeskPage>
  );
}
