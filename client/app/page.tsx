"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRef } from "react";
import {
  BookOpenCheck,
  BriefcaseBusiness,
  DoorOpen,
  FileStack,
  Gavel,
  Scale,
} from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/auth-context";
import { useLifecycleLogger } from "@/hooks/use-performance-logger";
import {
  authenticatedPrimaryNavItems,
  authenticatedSecondaryNavItems,
  publicPrimaryNavItems,
  publicSecondaryNavItems,
} from "@/lib/navigation";
import { PwaInstallModal } from "@/components/pwa/install-modal";
import { PwaSidebarInstallButton } from "@/components/pwa/sidebar-install-button";
import {
  LandingChapter,
  type LandingChapterData,
} from "@/components/landing/landing-chapter";
import { useLandingScrollProgress } from "@/components/landing/use-landing-scroll-progress";

const StaggeredMenu = dynamic(() => import("@/components/staggered-menu"), {
  ssr: false,
});
const FlowingMenu = dynamic(() => import("@/components/flowing-menu"), {
  ssr: false,
});
const LandingScene3D = dynamic(
  () =>
    import("@/components/landing/landing-scene-3d").then((module) => ({
      default: module.LandingScene3D,
    })),
  {
    ssr: false,
  },
);

const landingChapters: LandingChapterData[] = [
  {
    title: "Enter the simulation.",
    message:
      "A realistic legal simulation starts at the law firm door, then pulls you into a case room built for preparation, argument, and verdict-style analysis.",
    features: ["Legal simulation", "Indian case context", "AI courtroom flow"],
    icon: DoorOpen,
  },
  {
    title: "Generate realistic Indian legal cases.",
    message:
      "Create case files from IPC section inputs with location-aware High Court context and CNR-style identifiers that make each simulation feel grounded.",
    features: ["Generate Case Files", "IPC section inputs", "CNR-style records"],
    icon: FileStack,
  },
  {
    title: "Build the case from facts, parties, and evidence.",
    message:
      "Prepare your side by reviewing case material, parties involved, witness context, and structured evidence workflows as document support expands.",
    features: [
      "Choose Plaintiff or Defendant",
      "Review Parties",
      "Evidence support coming soon",
    ],
    icon: BriefcaseBusiness,
  },
  {
    title: "See the case unfold.",
    message:
      "Facts, party statements, witness moments, arguments, evidence notes, and courtroom events become an ordered timeline for sharper preparation.",
    features: ["Case chronology", "Witness moments", "Argument milestones"],
    icon: BookOpenCheck,
  },
  {
    title: "Ready to argue the case?",
    message:
      "Enter a simulated courtroom, challenge AI counter-arguments, examine witnesses, use prepared evidence, and review verdict-style analysis.",
    features: [
      "Examine Witnesses",
      "Argue Against AI",
      "Review Verdict & Analysis",
    ],
    icon: Gavel,
  },
];

export default function Home() {
  useLifecycleLogger("Home");

  const pageRef = useRef<HTMLElement | null>(null);
  const { isAuthenticated, logout } = useAuth();
  const { activeChapter, sceneProgress, scrollYProgress } =
    useLandingScrollProgress(pageRef, landingChapters.length);

  const primaryItems = isAuthenticated
    ? authenticatedPrimaryNavItems
    : publicPrimaryNavItems;
  const secondaryItems = isAuthenticated
    ? authenticatedSecondaryNavItems.map((item) =>
        item.link === "/logout" ? { ...item, onClick: logout } : item,
      )
    : publicSecondaryNavItems;

  const primaryCtaHref = isAuthenticated ? "/dashboard/cases" : "/register";
  const secondaryCtaHref = isAuthenticated
    ? "#chapter-2"
    : "/login";
  const secondaryCtaLabel = isAuthenticated
    ? "Click the door to enter"
    : "Login";

  return (
    <main
      ref={pageRef}
      className="relative min-h-screen overflow-x-hidden bg-[#07080c] text-stone-50"
    >
      <PwaInstallModal />
      <StaggeredMenu
        position="right"
        isFixed={true}
        menuButtonColor="#f8f4ea"
        openMenuButtonColor="#08090d"
        changeMenuColorOnOpen={true}
        colors={["#c5a15a", "#1f2937"]}
        accentColor="#c5a15a"
        displaySocials={false}
        displayItemNumbering={false}
      >
        <div className="flex h-full flex-col">
          <PwaSidebarInstallButton />
          <div className="border-t-2 border-gray-300" />
          <div className="min-h-0 flex-1">
            <FlowingMenu
              items={primaryItems}
              textColor="#000"
              bgColor="transparent"
              marqueeBgColor="#c5a15a"
              marqueeTextColor="#111827"
              borderColor="#e5e7eb"
              speed={10}
            />
          </div>
          <div className="my-8 border-t-2 border-gray-300" />
          <div className="h-32">
            <FlowingMenu
              items={secondaryItems}
              textColor="#000"
              bgColor="transparent"
              marqueeBgColor={isAuthenticated ? "#7f1d1d" : "#1d4ed8"}
              marqueeTextColor="#fff"
              borderColor="#e5e7eb"
              speed={10}
            />
          </div>
        </div>
      </StaggeredMenu>

      <LandingScene3D
        progress={sceneProgress}
        activeChapter={activeChapter}
        primaryCtaHref={primaryCtaHref}
        secondaryCtaHref={secondaryCtaHref}
        secondaryCtaLabel={secondaryCtaLabel}
      />

      <div className="fixed left-5 top-1/2 z-20 hidden -translate-y-1/2 flex-col gap-3 lg:flex">
        {landingChapters.map((chapter, index) => (
          <a
            key={chapter.title}
            href={`#chapter-${index + 1}`}
            className={`h-10 w-px transition-colors ${
              activeChapter === index ? "bg-[#c5a15a]" : "bg-stone-500/35"
            }`}
            aria-label={`Jump to ${chapter.title}`}
          />
        ))}
      </div>

      <motion.div
        className="fixed left-0 top-0 z-30 h-1 origin-left bg-[#c5a15a]"
        style={{ scaleX: scrollYProgress }}
      />

      <div className="relative z-10">
        <section
          id="chapter-1"
          className="relative flex min-h-screen items-center px-6 pb-28 pt-28 sm:px-10 lg:px-24"
        >
          <div className="max-w-[42rem]">
            <h1 className="text-balance text-6xl font-semibold leading-[0.95] text-stone-50 sm:text-7xl lg:text-8xl">
              AI Courtroom
            </h1>
            <p className="mt-6 max-w-xl text-2xl font-semibold leading-tight text-stone-50 sm:text-4xl">
              Enter the simulation.
            </p>
            <p className="mt-5 max-w-[36rem] text-base leading-8 text-stone-200 sm:text-lg">
              Generate legal case scenarios, prepare your side, organize
              evidence, question parties, argue against AI, and receive
              verdict-style analysis in a simulated courtroom.
            </p>
            <div className="mt-10 flex w-full flex-col gap-4 sm:w-auto sm:flex-row">
              <Link
                href={primaryCtaHref}
                className="inline-flex min-h-12 items-center justify-center rounded border border-[#d8bc78] bg-[#c5a15a] px-6 text-sm font-semibold uppercase tracking-[0.12em] text-[#111827] transition hover:bg-[#e0bd6b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f5d891]"
              >
                Step into the simulation
              </Link>
              <Link
                href={secondaryCtaHref}
                className="inline-flex min-h-12 items-center justify-center rounded border border-stone-200/30 bg-stone-950/35 px-6 text-sm font-semibold uppercase tracking-[0.12em] text-stone-50 backdrop-blur transition hover:border-stone-100/70 hover:bg-stone-900/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-stone-100"
              >
                {secondaryCtaLabel}
              </Link>
            </div>
            <div
              className="mt-12 flex items-center gap-4 text-sm text-stone-400"
              aria-hidden="true"
            >
              <Scale className="size-4 text-[#c5a15a]" />
              <span>Scroll to open the case room</span>
            </div>
          </div>
        </section>

        {landingChapters.slice(1).map((chapter, index) => (
          <div id={`chapter-${index + 2}`} key={chapter.title}>
            <LandingChapter
              chapter={chapter}
              index={index + 1}
              isActive={activeChapter === index + 1}
            />
          </div>
        ))}

        <section className="relative px-6 pb-32 pt-6 sm:px-10 lg:px-24">
          <div className="max-w-3xl border-t border-[#c5a15a]/35 pt-12">
            <h2 className="text-balance text-4xl font-semibold leading-tight text-stone-50 sm:text-6xl">
              Step into the simulation
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-8 text-stone-300 sm:text-lg">
              AI Courtroom is a legal simulation and learning platform. It does
              not replace professional legal advice.
            </p>
            <div className="mt-9 flex flex-col gap-4 sm:flex-row">
              <Link
                href={primaryCtaHref}
                className="inline-flex min-h-12 items-center justify-center rounded border border-[#d8bc78] bg-[#c5a15a] px-6 text-sm font-semibold uppercase tracking-[0.12em] text-[#111827] transition hover:bg-[#e0bd6b]"
              >
                Step into the simulation
              </Link>
              <Link
                href={secondaryCtaHref}
                className="inline-flex min-h-12 items-center justify-center rounded border border-stone-200/30 px-6 text-sm font-semibold uppercase tracking-[0.12em] text-stone-50 transition hover:border-stone-100"
              >
                {secondaryCtaLabel}
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
