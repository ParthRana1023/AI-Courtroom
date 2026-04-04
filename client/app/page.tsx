"use client";

import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useAuth } from "@/contexts/auth-context";
import { useLifecycleLogger } from "@/hooks/use-performance-logger";
import {
  authenticatedPrimaryNavItems,
  authenticatedSecondaryNavItems,
  publicPrimaryNavItems,
  publicSecondaryNavItems,
} from "@/lib/navigation";

// Dynamic imports for heavy animation components (reduces initial bundle)
const StaggeredMenu = dynamic(() => import("@/components/staggered-menu"), {
  ssr: false,
});
const FlowingMenu = dynamic(() => import("@/components/flowing-menu"), {
  ssr: false,
});

export default function Home() {
  useLifecycleLogger("Home");

  const { isAuthenticated, logout } = useAuth();
  const primaryItems = isAuthenticated
    ? authenticatedPrimaryNavItems
    : publicPrimaryNavItems;
  const secondaryItems = isAuthenticated
    ? authenticatedSecondaryNavItems.map((item) =>
        item.link === "/logout" ? { ...item, onClick: logout } : item
      )
    : publicSecondaryNavItems;

  return (
    <main className="h-screen flex flex-col overflow-hidden relative">
      {/* Staggered Menu - Top Right */}
      <StaggeredMenu
        position="right"
        isFixed={true}
        menuButtonColor="#fff"
        openMenuButtonColor="#000"
        changeMenuColorOnOpen={true}
        colors={["#1e40af", "#3b82f6"]}
        accentColor="#2563eb"
        displaySocials={false}
        displayItemNumbering={false}
      >
        {/* FlowingMenu as children */}
        <div className="flex flex-col h-full">
          <div className="flex-2 min-h-0">
            <FlowingMenu
              items={primaryItems}
              textColor="#000"
              bgColor="transparent"
              marqueeBgColor="#2563eb"
              marqueeTextColor="#fff"
              borderColor="#e5e7eb"
              speed={10}
            />
          </div>

          {/* Divider with more gap */}
          <div className="border-t-2 border-gray-300 my-8" />

          {/* Lower Section */}
          <div className="h-32">
            <FlowingMenu
              items={secondaryItems}
              textColor="#000"
              bgColor="transparent"
              marqueeBgColor={isAuthenticated ? "#dc2626" : "#16a34a"}
              marqueeTextColor="#fff"
              borderColor="#e5e7eb"
              speed={10}
            />
          </div>
        </div>
      </StaggeredMenu>

      {/* Background Image - optimized with Next.js Image */}
      <div className="absolute inset-0 -z-20">
        <Image
          src="/background.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-top"
        />
      </div>

      {/* Dark Gradient Overlay */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(to right, rgba(0, 0, 0, 0.75) 0%, rgba(0, 0, 0, 0.5) 50%, rgba(0, 0, 0, 0.25) 100%)",
        }}
      />

      {/* Content positioned on the left (darker side) */}
      <div className="grow flex flex-col items-center sm:items-start justify-center px-6 sm:px-12 md:pl-24 pt-10 sm:pt-0 pb-20 sm:pb-0 text-center sm:text-left">
        {/* Hero Text */}
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4 max-w-xl">
          AI Courtroom: AI-Powered Legal Simulation
        </h1>
        <p className="text-lg md:text-xl text-gray-300 mb-8 max-w-lg">
          Argue your case. Challenge the AI. Step into the courtroom where
          justice is decided.
        </p>

        {/* Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto px-4 sm:px-0">
          <Link
            href="/register"
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg transition-colors text-lg shadow-lg text-center w-full sm:w-auto"
          >
            Get Started
          </Link>
          <Link
            href="/login"
            className="bg-white/90 hover:bg-white text-gray-800 font-bold py-3 px-8 rounded-lg transition-colors text-lg shadow-lg backdrop-blur-sm text-center w-full sm:w-auto"
          >
            Login
          </Link>
        </div>
      </div>
    </main>
  );
}
