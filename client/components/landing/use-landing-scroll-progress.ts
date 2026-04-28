"use client";

import { useMotionValueEvent, useScroll, useTransform } from "framer-motion";
import { RefObject, useMemo, useState } from "react";

export function useLandingScrollProgress(
  target: RefObject<HTMLElement | null>,
  chapterCount: number,
) {
  const { scrollYProgress } = useScroll({
    target,
    offset: ["start start", "end end"],
  });

  const sceneProgress = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const [activeChapter, setActiveChapter] = useState(0);

  useMotionValueEvent(sceneProgress, "change", (latest) => {
    const nextChapter = Math.min(
      chapterCount - 1,
      Math.max(0, Math.floor(latest * chapterCount)),
    );
    setActiveChapter(nextChapter);
  });

  return useMemo(
    () => ({
      activeChapter,
      sceneProgress,
      scrollYProgress,
    }),
    [activeChapter, sceneProgress, scrollYProgress],
  );
}
