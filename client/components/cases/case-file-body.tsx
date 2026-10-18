import type { ReactNode } from "react";
import { NUMERALS, SECTIONS, type CaseFile, type Item, type Row, type SectionId } from "@/lib/case-file";
import { cn } from "@/lib/utils";

/** The seven sections of the indexed case file (Case Details and the courtroom's case file panel). */
export default function CaseFileBody({ file, mob }: { file: CaseFile; mob: boolean }) {
  return (
    <>
      <Section id="summary">
        {file.summary.map((p, i) => (
          <p key={i} className="m-0 text-pretty text-base leading-[1.7] text-[#2a2018]">
            {p}
          </p>
        ))}
        {!file.summary.length && <Empty />}
      </Section>
      <Section id="parties">{file.parties.length ? <Rows rows={file.parties} mob={mob} /> : <Empty />}</Section>
      <Section id="facts">
        {file.facts.length > 0 && <Numbered items={file.facts} />}
        {file.chronology.length > 0 && (
          <>
            <Sub>Chronology</Sub>
            <Rows rows={file.chronology} mob={mob} />
          </>
        )}
        {!file.facts.length && !file.chronology.length && <Empty />}
      </Section>
      <Section id="charges">{file.counts.length ? <Rows rows={file.counts} mob={mob} /> : <Empty />}</Section>
      <Section id="evidence">
        {file.exhibits.length ? (
          <div className="flex flex-col gap-2">
            {file.exhibits.map((x) => (
              <div key={x.ref + x.title} className="grid grid-cols-[62px_1fr] gap-3.5 border border-ink/15 bg-[#f8f3e7] px-3.5 py-3">
                <span className="self-start border-[1.5px] border-seal pb-0.75 pt-1 text-center font-data text-xs font-bold text-seal">{x.ref}</span>
                <span className="flex flex-col gap-0.75">
                  <span className="text-[15px] font-bold leading-[1.4]">{x.title}</span>
                  <span className="text-pretty text-[14.5px] leading-[1.55] text-ink-label">{x.text}</span>
                  {x.fromPetition && <span className="text-label font-bold uppercase tracking-[0.14em] text-ink-muted">From the petition</span>}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <Empty />
        )}
      </Section>
      <Section id="issues">{file.issues.length ? <Numbered items={file.issues} /> : <Empty />}</Section>
      <Section id="prayer">
        {file.relief.length > 0 && <Numbered items={file.relief} />}
        {file.verification && (
          <>
            <Sub>Verification</Sub>
            <p className="m-0 text-pretty text-[14.5px] italic leading-[1.6] text-ink-label">{file.verification}</p>
          </>
        )}
        {!file.relief.length && !file.verification && <Empty />}
      </Section>
    </>
  );
}

function Section({ id, children }: { id: SectionId; children: ReactNode }) {
  const i = SECTIONS.findIndex(([k]) => k === id);
  return (
    <section id={`s-${id}`} data-sec="" aria-labelledby={`h-${id}`} className="flex flex-col gap-3.5">
      <h2 id={`h-${id}`} className="m-0 flex items-baseline gap-3 border-b border-ink/25 pb-2 font-display text-[22px] font-normal">
        <span className="min-w-9.5 text-seal">{NUMERALS[i]}.</span>
        <span className="flex-1 leading-[1.2]">{SECTIONS[i][1]}</span>
      </h2>
      {children}
    </section>
  );
}

function Sub({ children }: { children: ReactNode }) {
  return <span className="pt-1 text-label font-bold uppercase tracking-[0.16em] text-ink-muted">{children}</span>;
}

function Empty() {
  return <p className="m-0 text-body italic text-ink-hint">Not stated in the case file.</p>;
}

function Rows({ rows, mob }: { rows: Row[]; mob: boolean }) {
  return (
    <ul className="m-0 flex list-none flex-col border-t border-ink/15 p-0">
      {rows.map((r, i) => (
        <li key={i} className={cn("grid gap-x-5 gap-y-1 border-b border-ink/15 py-3", mob ? "grid-cols-[minmax(0,1fr)]" : "grid-cols-[170px_minmax(0,1fr)]")}>
          <span className="text-[15px] font-bold leading-[1.45] text-ink">{r.label}</span>
          <span className="text-pretty text-[15px] leading-[1.55] text-ink-label">{r.text}</span>
        </li>
      ))}
    </ul>
  );
}

function Numbered({ items }: { items: Item[] }) {
  return (
    <ol className="m-0 flex list-none flex-col gap-3 p-0">
      {items.map((x, i) => (
        <li key={i} className="grid grid-cols-[30px_1fr] gap-2.5 text-base leading-[1.65] text-[#2a2018]">
          <span className="font-data text-sm font-medium leading-[1.9] text-seal">{x.mark}</span>
          <span className="text-pretty">
            {x.title && <strong className="text-ink">{x.title}. </strong>}
            {x.text}
          </span>
        </li>
      ))}
    </ol>
  );
}
