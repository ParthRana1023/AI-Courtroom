"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

export interface LandingChapterData {
  title: string;
  message: string;
  features: string[];
  icon: LucideIcon;
}

interface LandingChapterProps {
  chapter: LandingChapterData;
  index: number;
  isActive: boolean;
}

export function LandingChapter({
  chapter,
  index,
  isActive,
}: LandingChapterProps) {
  const Icon = chapter.icon;

  return (
    <section className="relative flex min-h-screen items-center px-6 py-24 sm:px-10 lg:px-24">
      <motion.div
        className="w-full max-w-152"
        initial={{ opacity: 0, y: 42 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ amount: 0.45, once: false }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <div className="mb-8 flex items-center gap-4 text-[#c5a15a]">
          <span className="grid size-12 place-items-center rounded border border-[#c5a15a]/45 bg-[#c5a15a]/10">
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <span className="font-mono text-sm uppercase tracking-[0.18em] text-stone-300/80">
            Chapter {String(index + 1).padStart(2, "0")}
          </span>
        </div>

        <h2 className="text-balance text-4xl font-semibold leading-[1.06] text-stone-50 sm:text-5xl lg:text-[4.35rem]">
          {chapter.title}
        </h2>
        <p className="mt-6 max-w-136 text-base leading-8 text-stone-300 sm:text-lg">
          {chapter.message}
        </p>

        <div className="mt-9 grid max-w-180 gap-3 sm:grid-cols-2">
          {chapter.features.map((feature) => (
            <div
              key={feature}
              className="border-l border-[#c5a15a]/40 bg-stone-950/35 px-4 py-3 text-sm font-medium text-stone-100 backdrop-blur-sm"
            >
              {feature}
            </div>
          ))}
        </div>

        <div
          className="mt-10 h-px w-40 bg-linear-to-r from-[#c5a15a] to-transparent"
          aria-hidden="true"
        />
        <span className="sr-only">
          {isActive ? "Current landing chapter" : "Landing chapter"}
        </span>
      </motion.div>
    </section>
  );
}
