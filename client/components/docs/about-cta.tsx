"use client";

import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";

const BTN = "flex h-12.5 items-center px-5.5 text-[13px] font-bold uppercase tracking-[0.12em]";

/** About's closing call to action: sign up or in, or straight to your cases. */
export default function AboutCta() {
  const { isAuthenticated } = useAuth();
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 bg-ink px-6 py-5.5 text-paper">
      <div className="flex flex-[1_1_260px] flex-col gap-1.5">
        <span className="font-display text-2xl/[1.15]">Ready to enter the courtroom?</span>
        <span className="text-body/normal text-[#d8ccb4]">
          Start building your legal argumentation skills with AI-powered simulations today.
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={isAuthenticated ? "/cases" : "/register"} className={`${BTN} bg-paper text-ink hover:bg-white hover:text-ink`}>
          Take a Side
        </Link>
        <Link href={isAuthenticated ? "/cases" : "/login"} className={`${BTN} bg-seal text-cream hover:bg-seal-hover hover:text-white`}>
          {isAuthenticated ? "My cases" : "Login"}
        </Link>
      </div>
    </div>
  );
}
