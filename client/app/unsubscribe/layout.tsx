import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";

export const metadata: Metadata = {
  title: "Unsubscribe",
  description: "Stop one kind of email from AI Courtroom.",
  // Every link here is personal; keep them out of search results.
  robots: { index: false, follow: false },
};

// The page reads ?token= on the client, which static prerendering needs wrapped in Suspense.
export default function UnsubscribeLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}
