import type { CSSProperties } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const LABEL = "m-0 pt-1 text-[11px] font-bold uppercase tracking-[0.16em] text-ink-label";

const components: Components = {
  h1: ({ children }) => <h3 className="m-0 font-display text-[22px] leading-[1.2] font-normal">{children}</h3>,
  h2: ({ children }) => <h3 className="m-0 font-display text-xl leading-[1.2] font-normal">{children}</h3>,
  h3: ({ children }) => <h4 className={LABEL}>{children}</h4>,
  h4: ({ children }) => <h4 className={LABEL}>{children}</h4>,
  // A paragraph that is only bold text is a section label (**FACTS**, **Arguments**).
  p: ({ node, children }) => {
    const only = node?.children.length === 1 ? node.children[0] : null;
    if (only?.type === "element" && only.tagName === "strong") return <p className={LABEL}>{children}</p>;
    return <p className="m-0 text-pretty">{children}</p>;
  },
  ol: ({ start, children }) => (
    <ol
      className="m-0 flex list-none flex-col gap-3 p-0 [&>li]:grid [&>li]:grid-cols-[28px_minmax(0,1fr)] [&>li]:gap-2.5 [&>li]:[counter-increment:para] [&>li]:before:font-data [&>li]:before:text-[13px] [&>li]:before:leading-[1.9] [&>li]:before:font-medium [&>li]:before:text-seal [&>li]:before:content-[counter(para)'.']"
      style={{ counterReset: `para ${(start ?? 1) - 1}` }}
    >
      {children}
    </ol>
  ),
  ul: ({ children }) => (
    <ul className="m-0 flex list-none flex-col gap-2 p-0 [&>li]:grid [&>li]:grid-cols-[18px_minmax(0,1fr)] [&>li]:gap-2 [&>li]:before:text-(--mark-c) [&>li]:before:content-(--mark)">
      {children}
    </ul>
  ),
  li: ({ children }) => (
    <li>
      <div className="flex min-w-0 flex-col gap-2 text-pretty">{children}</div>
    </li>
  ),
  strong: ({ children }) => <strong className="font-bold text-ink">{children}</strong>,
  a: ({ children }) => <span className="underline">{children}</span>,
  blockquote: ({ children }) => <blockquote className="m-0 border-l-[3px] border-ink pl-3.5 italic">{children}</blockquote>,
  hr: () => <hr className="m-0 border-0 border-t border-ink/25" />,
  table: ({ children }) => <table className="w-full border-collapse text-sm">{children}</table>,
  th: ({ children }) => <th className="border border-ink/25 px-2 py-1 text-left">{children}</th>,
  td: ({ children }) => <td className="border border-ink/25 px-2 py-1">{children}</td>,
};

/**
 * Markdown on paper: the judgment and the case analysis. Numbered paragraphs get a red
 * numbered gutter and bullets take `mark` (+, −, →) in `markColor`. Raw HTML is not rendered.
 */
export default function PaperMarkdown({ text, mark = "–", markColor = "#8e1f19" }: { text: string; mark?: string; markColor?: string }) {
  return (
    <div
      className="flex flex-col gap-4.5 font-type text-[15.5px] leading-[1.7] text-[#2a2018]"
      style={{ "--mark": `"${mark}"`, "--mark-c": markColor } as CSSProperties}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
