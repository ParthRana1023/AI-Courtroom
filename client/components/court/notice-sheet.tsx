import type { ReactNode } from "react";

interface NoticeSheetProps {
  /** Left and right labels of the paper's header strip. */
  form: [string, string];
  /** The big word ("404", "ERROR", "RECESS"). */
  word: string;
  /** The rubber stamp across the corner ("DISMISSED"). */
  stamp: string;
  title: string;
  children: ReactNode;
  actions: ReactNode;
}

// The single paper sheet used by the 404, error and offline pages.
export default function NoticeSheet({
  form,
  word,
  stamp,
  title,
  children,
  actions,
}: NoticeSheetProps) {
  const wordSize =
    word.length <= 3
      ? "text-[6rem] min-[560px]:text-[9.25rem]"
      : "text-[3.625rem] min-[560px]:text-[6.5rem]";

  return (
    <main className="mx-auto flex w-full max-w-300 flex-1 items-center justify-center px-3 py-4 min-[560px]:px-[4vw] min-[560px]:py-6">
      <section
        aria-labelledby="notice-title"
        className="flex w-full max-w-155 flex-col bg-paper text-ink shadow-sheet"
      >
        <div className="flex justify-between gap-3 border-b-[3px] border-double border-ink px-4 pb-2.5 pt-3.5 font-type text-label font-bold uppercase tracking-[0.2em] text-ink-label min-[560px]:px-7">
          <span className="whitespace-nowrap">{form[0]}</span>
          <span className="whitespace-nowrap">{form[1]}</span>
        </div>
        <div className="relative flex flex-col items-center gap-4 px-4.5 pb-7.5 pt-7 text-center min-[560px]:px-10 min-[560px]:pb-10.5 min-[560px]:pt-11">
          <span
            aria-hidden="true"
            className={`font-display leading-[0.9] tracking-[0.04em] text-ink ${wordSize}`}
          >
            {word}
          </span>
          <span
            aria-hidden="true"
            className="absolute right-3 top-11 border-4 border-double border-seal bg-[rgba(239,230,211,.75)] px-3.5 pb-1 pt-1.5 font-display text-xl leading-none tracking-[0.08em] text-seal [--stamp-rot:-8deg] animate-[ac-stamp_.35s_.2s_cubic-bezier(.2,.9,.3,1.2)_both] min-[560px]:right-16 min-[560px]:top-17.5 min-[560px]:text-[1.75rem]"
          >
            {stamp}
          </span>
          <h1
            id="notice-title"
            className="m-0 font-display text-[1.625rem] leading-[1.15] min-[560px]:text-[2rem]"
          >
            {title}
          </h1>
          <p className="m-0 max-w-105 text-balance font-type text-base leading-[1.6] text-ink-label">
            {children}
          </p>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            {actions}
          </div>
        </div>
      </section>
    </main>
  );
}
