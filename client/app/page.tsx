"use client";

import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useAuth } from "@/contexts/auth-context";
import { useLifecycleLogger } from "@/hooks/use-performance-logger";

// Dynamic imports for heavy animation components (reduces initial bundle)
const StaggeredMenu = dynamic(() => import("@/components/staggered-menu"), {
  ssr: false,
});
const FlowingMenu = dynamic(() => import("@/components/flowing-menu"), {
  ssr: false,
});

// Menu items for authenticated users (upper section)
const authUpperItems = [
  { link: "/", text: "Home" },
  { link: "/dashboard/cases", text: "Cases" },
  { link: "/contact", text: "Feedback" },
  { link: "/settings", text: "Settings" },
  { link: "/about", text: "About" },
];

// Menu items for authenticated users (lower section)
const authLowerItems = [
  { link: "/dashboard/profile", text: "Profile" },
  { link: "/logout", text: "Logout" },
];

// Menu items for unauthenticated users (upper section)
const publicUpperItems = [
  { link: "/", text: "Home" },
  { link: "/contact", text: "Feedback" },
  { link: "/about", text: "About" },
  { link: "/settings", text: "Settings" },
];

// Menu items for unauthenticated users (lower section)
const publicLowerItems = [
  { link: "/login", text: "Login" },
  { link: "/register", text: "Register" },
];

export default function Home() {
  useLifecycleLogger("Home");

  const { isAuthenticated } = useAuth();

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
              items={isAuthenticated ? authUpperItems : publicUpperItems}
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
              items={isAuthenticated ? authLowerItems : publicLowerItems}
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
      <div className="grow flex flex-col items-start justify-center pl-12 md:pl-24 pt-10">
        {/* Hero Text */}
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4 max-w-xl">
          AI Courtroom: AI-Powered Legal Simulation
        </h1>
        <p className="text-lg md:text-xl text-gray-300 mb-8 max-w-lg">
          Argue your case. Challenge the AI. Step into the courtroom where
          justice is decided.
        </p>

        {/* Buttons */}
        <div className="flex flex-col sm:flex-row gap-4">
          <Link
            href="/register"
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg transition-colors text-lg shadow-lg text-center"
          >
            Get Started
          </Link>
          <Link
            href="/login"
            className="bg-white/90 hover:bg-white text-gray-800 font-bold py-3 px-8 rounded-lg transition-colors text-lg shadow-lg backdrop-blur-sm text-center"
          >
            Login
          </Link>
        </div>
      </div>
    </main>
  );
}
