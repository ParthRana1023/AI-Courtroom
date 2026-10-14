import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Contact",
  description: "Send feedback, report a bug or ask for account support.",
};

export default function ContactLayout({ children }: { children: ReactNode }) {
  return children;
}
