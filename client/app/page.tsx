import type { Metadata } from "next";
import Landing from "@/components/landing/landing";

export const metadata: Metadata = {
  title: { absolute: "AI Courtroom — Your first case is waiting" },
  description: "Practise advocacy in a simulated Indian courtroom. Take a side, argue before an AI judge and receive a reasoned verdict.",
};

export default function Home() {
  return <Landing />;
}
