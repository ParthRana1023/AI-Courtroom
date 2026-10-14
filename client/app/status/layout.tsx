import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "System status",
  description: "Live status of AI Courtroom services.",
};

export default function StatusLayout({ children }: { children: ReactNode }) {
  return children;
}
