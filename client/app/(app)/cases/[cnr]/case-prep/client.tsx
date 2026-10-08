"use client";

import { use, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import CourtModelLoader from "@/components/court/court-model-loader";
import Scroller from "@/components/court/scroller";
import { ExhibitGrid, ExhibitViewer } from "@/components/prep/exhibits";
import { firstName, initials, onSide } from "@/components/prep/people";
import { useOnline } from "@/hooks/use-online";
import { useViewport } from "@/hooks/use-viewport";
import { caseAPI, partiesAPI } from "@/lib/api";
import { plain } from "@/lib/case-file";
import { getErrorDetail } from "@/lib/error-utils";
import { cn } from "@/lib/utils";
import { CaseStatus, PersonRole, type Case, type ChatMessage, type EvidenceItem, type PersonInvolved } from "@/types";

type Session = "prep" | "in session" | "resolved";
type Focus = "list" | "chat";
type MView = "list" | "person" | "chat";

const EASE = "cubic-bezier(.2,.8,.2,1)";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const STARTERS = ["What happened, in your own words?", "What were you promised, and by whom?", "What documents can you give me?"];

const reduce = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const anim = (el: Element | null | undefined, kf: Keyframe[], o: KeyframeAnimationOptions) => el?.animate?.(kf, o);

/** "Today, 11:42" or "28 Sep, 11:42" */
function stamp(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return d.toDateString() === new Date().toDateString() ? `Today, ${hm}` : `${d.getDate()} ${MONTHS[d.getMonth()]}, ${hm}`;
}

/** A party's background (markdown) as plain paragraphs. */
const paragraphs = (md?: string | null) =>
  (md ?? "")
    .split(/\n\s*\n/)
    .map((p) => plain(p.replace(/^#+\s*/gm, "").replace(/^[-*]\s+/gm, "")))
    .filter(Boolean);

const unbold = (s: string) => s.replace(/\*\*/g, "");

export default function CasePrepPage({ params }: { params: Promise<{ cnr: string }> }) {
  const { cnr } = use(params);
  const router = useRouter();
  const online = useOnline();
  const { w, h } = useViewport();
  const two = w >= 760;
  const mob = !two;
  const small = w < 560;
  const short = h < 760;

  const [load, setLoad] = useState<"loading" | "loaded" | "error">("loading");
  const [kase, setKase] = useState<Case | null>(null);
  const [parties, setParties] = useState<PersonInvolved[]>([]);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  // null while a background is being written
  const [bios, setBios] = useState<Record<string, string | null>>({});
  const [msgs, setMsgs] = useState<Record<string, ChatMessage[]>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);
  const [typing, setTyping] = useState<{ id: string; n: number; len: number } | null>(null);
  const [extracting, setExtracting] = useState<string | null>(null);
  const [regen, setRegen] = useState<string | null>(null);
  const [chatErr, setChatErr] = useState("");
  const [tab, setTab] = useState<"parties" | "evidence">("parties");
  const [sel, setSel] = useState<string | null>(null);
  const [focus, setFocusState] = useState<Focus>("list");
  const [closing, setClosing] = useState<Focus | null>(null);
  const [mView, setMView] = useState<MView>("list");
  const [exId, setExId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLElement>(null);
  const chatColRef = useRef<HTMLElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typeTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const role = kase?.user_role === "defendant" ? "defendant" : "plaintiff";
  const RN = role === "plaintiff" ? "Plaintiff" : "Defendant";
  const session: Session = kase?.status === CaseStatus.ACTIVE ? "in session" : kase?.status === CaseStatus.RESOLVED ? "resolved" : "prep";
  const readOnly = session !== "prep";
  const mine = useCallback((p: PersonInvolved) => onSide(role, p), [role]);

  const fetchAll = useCallback(async () => {
    setLoad("loading");
    try {
      const [c, list, ev]: [Case, { parties?: PersonInvolved[] }, { evidence?: EvidenceItem[] }] = await Promise.all([
        caseAPI.getCase(cnr),
        partiesAPI.getParties(cnr),
        caseAPI.getEvidence(cnr),
      ]);
      if (c.user_role !== "plaintiff" && c.user_role !== "defendant") {
        router.replace(`/cases/${cnr}`);
        return;
      }
      const people = list.parties ?? [];
      // Transcripts are cheap; loading each client's up front gives the list its question counts.
      const ours = people.filter((p) => onSide(c.user_role!, p));
      const histories: { messages?: ChatMessage[] }[] = await Promise.all(
        ours.map((p) => partiesAPI.getPartyChatHistory(cnr, p.id).catch(() => ({ messages: [] }))),
      );
      setKase(c);
      setParties(people);
      setEvidence(ev.evidence ?? []);
      setBios(Object.fromEntries(people.filter((p) => p.bio).map((p) => [p.id, p.bio!])));
      setMsgs(Object.fromEntries(ours.map((p, i) => [p.id, (histories[i].messages ?? []).filter((m) => m?.sender)])));
      setLoad("loaded");
    } catch {
      setLoad("error");
    }
  }, [cnr, router]);

  useEffect(() => {
    void fetchAll();
    return () => {
      clearInterval(typeTimer.current);
      clearTimeout(closeTimer.current);
    };
  }, [fetchAll]);

  const selId = sel ?? parties.find(mine)?.id ?? parties[0]?.id ?? null;
  const P = parties.find((p) => p.id === selId) ?? null;
  const can = !!P && mine(P);
  const list = (selId && msgs[selId]) || [];
  const first = P ? firstName(P.name) : "";
  const qn = list.filter((m) => m.sender === "user").length;
  const chatOn = two && focus === "chat";
  const busy = !!sending || !!typing;

  // A party's background is written the first time they're opened.
  useEffect(() => {
    if (!selId || load !== "loaded" || selId in bios) return;
    setBios((b) => ({ ...b, [selId]: null }));
    partiesAPI
      .getPartyDetails(cnr, selId)
      .then((d: PersonInvolved) => setBios((b) => ({ ...b, [selId]: d.bio ?? "" })))
      .catch(() => setBios((b) => ({ ...b, [selId]: "" })));
  }, [selId, load, bios, cnr]);

  const toBottom = useCallback((smooth?: boolean) => {
    requestAnimationFrame(() => {
      const c = chatRef.current;
      if (!c) return;
      if (smooth && !reduce()) c.scrollTo({ top: c.scrollHeight, behavior: "smooth" });
      else c.scrollTop = c.scrollHeight;
    });
  }, []);

  const setFocus = (f: Focus) => {
    if (focus === f) return;
    clearTimeout(closeTimer.current);
    setFocusState(f);
    setClosing(f === "chat" ? "list" : "chat");
    closeTimer.current = setTimeout(() => setClosing(null), reduce() ? 0 : 640);
  };

  // Column swap: the opening column slides in, the closing one fades, then its strip fades in.
  const prevFocus = useRef(focus);
  useEffect(() => {
    if (prevFocus.current === focus) return;
    prevFocus.current = focus;
    const r = reduce();
    const toChat = focus === "chat";
    const open = (toChat ? chatColRef.current : listRef.current)?.querySelector("[data-full]");
    const shut = (toChat ? listRef.current : chatColRef.current)?.querySelector("[data-full]");
    anim(open, r ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: `translateX(${toChat ? 40 : -40}px)` }, { opacity: 1, transform: "none" }], {
      duration: 560,
      delay: r ? 0 : 140,
      easing: EASE,
      fill: "backwards",
    });
    anim(shut, [{ opacity: 1 }, { opacity: 0 }], { duration: r ? 0 : 520, easing: "ease-in", fill: "forwards" });
    toBottom();
  }, [focus, toBottom]);

  const prevClosing = useRef(closing);
  useEffect(() => {
    if (prevClosing.current && !closing) {
      const col = prevClosing.current === "list" ? listRef.current : chatColRef.current;
      anim(col?.querySelector("[data-strip]"), [{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: "ease-out" });
    }
    prevClosing.current = closing;
  }, [closing]);

  const prevView = useRef(mView);
  useEffect(() => {
    if (prevView.current === mView) return;
    const back = mView === "list" || (prevView.current === "chat" && mView === "person");
    prevView.current = mView;
    const el = mView === "chat" ? chatColRef.current : mView === "person" ? centerRef.current : listRef.current;
    anim(el, reduce() ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: `translateX(${back ? -36 : 36}px)` }, { opacity: 1, transform: "none" }], {
      duration: 440,
      easing: EASE,
    });
    toBottom();
  }, [mView, toBottom]);

  const prevSel = useRef(selId);
  useEffect(() => {
    if (prevSel.current === selId) return;
    prevSel.current = selId;
    const r = reduce();
    anim(centerRef.current, r ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: "translateY(16px)" }, { opacity: 1, transform: "none" }], { duration: 440, easing: EASE });
    anim(chatColRef.current?.querySelector("[data-full]"), r ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], {
      duration: 400,
      easing: EASE,
    });
    setChatErr("");
    toBottom();
  }, [selId, toBottom]);

  const prevTab = useRef(tab);
  useEffect(() => {
    if (prevTab.current === tab) return;
    prevTab.current = tab;
    if (tab === "parties") anim(panelRef.current, [{ opacity: 0 }, { opacity: 1 }], { duration: 280 });
    toBottom();
  }, [tab, toBottom]);

  // A new message rises in and the transcript follows it.
  const count = list.length;
  const prevCount = useRef(count);
  useEffect(() => {
    if (count > prevCount.current) {
      const all = chatRef.current?.querySelectorAll("[data-msg]");
      anim(all?.[all.length - 1], reduce() ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], {
        duration: 340,
        easing: EASE,
      });
      toBottom(true);
    }
    prevCount.current = count;
  }, [count, toBottom]);

  useEffect(() => {
    if (sending) toBottom(true);
  }, [sending, toBottom]);

  // The answer types itself out, three characters at a time.
  useEffect(() => {
    if (!typing) return;
    if (typing.n >= typing.len) {
      setTyping(null);
      inputRef.current?.focus();
      return;
    }
    typeTimer.current = setTimeout(() => {
      setTyping((t) => t && { ...t, n: t.n + 3 });
      const c = chatRef.current;
      if (c) c.scrollTop = c.scrollHeight;
    }, 24);
    return () => clearTimeout(typeTimer.current);
  }, [typing]);

  // Escape folds the interview back to the party list on two-column layouts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !exId && focus === "chat" && two) setFocus("list");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const openChat = () => {
    if (two) setFocus("chat");
    else setMView("chat");
    setTimeout(() => inputRef.current?.focus({ preventScroll: true }), two ? 500 : 80);
  };

  const pickParty = (id: string) => {
    setSel(id);
    setMView("person");
  };

  const send = async (pid: string) => {
    const txt = (drafts[pid] ?? "").trim();
    if (!txt || busy) return;
    if (!online) {
      toast("You’re offline. Your question is kept, so you can send it when you’re back online.", { duration: 2800 });
      return;
    }
    setChatErr("");
    const temp: ChatMessage = { id: `tmp-${Date.now()}`, sender: "user", content: txt, timestamp: new Date().toISOString() };
    setMsgs((m) => ({ ...m, [pid]: [...(m[pid] ?? []), temp] }));
    setDrafts((d) => ({ ...d, [pid]: "" }));
    if (inputRef.current) inputRef.current.style.height = "52px";
    setSending(pid);
    try {
      const r: { user_message: ChatMessage; party_response: ChatMessage } = await partiesAPI.chatWithParty(cnr, pid, txt);
      setMsgs((m) => ({ ...m, [pid]: [...(m[pid] ?? []).filter((x) => x.id !== temp.id), r.user_message, r.party_response] }));
      setTyping({ id: r.party_response.id, n: 0, len: unbold(r.party_response.content).length });
    } catch (e) {
      setMsgs((m) => ({ ...m, [pid]: (m[pid] ?? []).filter((x) => x.id !== temp.id) }));
      setDrafts((d) => ({ ...d, [pid]: txt }));
      setChatErr(getErrorDetail(e) || "Couldn’t send your question. Please try again.");
    } finally {
      setSending(null);
    }
  };

  const extract = async (pid: string, m: ChatMessage) => {
    if (extracting) return;
    if (!online) {
      toast("You’re offline. Extract this answer when you’re back online.", { duration: 2800 });
      return;
    }
    setExtracting(m.id);
    try {
      const r: { evidence: EvidenceItem } = await caseAPI.extractEvidence(cnr, { party_id: pid, message_id: m.id });
      setEvidence((ev) => [...ev, r.evidence]);
      toast(`Evidence extracted. ${r.evidence.exhibit_ref} added to the exhibits.`, { duration: 2800 });
    } catch (e) {
      toast.error(getErrorDetail(e) || "Couldn’t extract this answer. Please try again.");
    } finally {
      setExtracting(null);
    }
  };

  const regenerate = async (id: string) => {
    if (!online) {
      toast("You’re offline. Try again when you’re back online.", { duration: 2800 });
      return;
    }
    setRegen(id);
    try {
      const r = await caseAPI.regenerateEvidenceImage(cnr, id);
      if (r?.evidence) setEvidence(r.evidence);
      if (typeof r?.image_generation?.generated === "number" && r.image_generation.generated > 0) toast("Evidence image regenerated", { duration: 2800 });
      else toast.error(r?.image_generation?.message || "Evidence image could not be regenerated");
    } catch {
      toast.error("Couldn’t regenerate the image. Please try again.");
    } finally {
      setRegen(null);
    }
  };

  const proceed = async () => {
    if (starting || !kase) return;
    if (readOnly) {
      router.push(`/cases/${cnr}/courtroom`);
      return;
    }
    if (!online) {
      toast("You’re offline. The courtroom opens when you’re back online.", { duration: 2800 });
      return;
    }
    setStarting(true);
    try {
      if (role === "defendant") await caseAPI.generatePlaintiffOpening(cnr);
      await caseAPI.updateCaseStatus(cnr, CaseStatus.ACTIVE);
      router.push(`/cases/${cnr}/courtroom`);
    } catch (e) {
      setStarting(false);
      toast.error(getErrorDetail(e) || "Couldn’t open the courtroom. Please try again.");
    }
  };

  const ctaOff = starting || (!online && session === "prep");
  const ctaLabel = starting
    ? role === "defendant"
      ? "Preparing the opening statement…"
      : "Preparing courtroom…"
    : session === "resolved"
      ? "View Courtroom →"
      : session === "in session"
        ? "Return to Courtroom →"
        : "Proceed to Courtroom →";

  const banner =
    session === "in session"
      ? { k: "Courtroom in session", t: "You can’t interview parties while the courtroom is in session. Adjourn or finish the hearing to continue." }
      : session === "resolved"
        ? { k: "Case resolved", t: "This case has concluded. Interviews are read-only." }
        : null;
  const readNote =
    session === "resolved"
      ? { k: "Read-only · case resolved", t: "This case has concluded. You can read the transcript but can’t ask new questions.", c: "text-ink-label" }
      : { k: "Read-only · courtroom in session", t: "Return to the courtroom, or wait for the session to end, to ask new questions.", c: "text-[#7a3a06]" };
  const lockText = `As the ${RN} Lawyer you can only interview ${role === "plaintiff" ? "applicants" : "non-applicants"}. You’ll question ${first} in court.`;

  // Interview answers already logged as exhibits, by message id.
  const logged = Object.fromEntries(evidence.filter((e) => e.origin_id?.includes(":")).map((e) => [e.origin_id!.split(":")[1], e]));
  const sur = P ? (plain(P.name).split(" ").pop() ?? "") : "";
  const related = sur.length > 2 ? evidence.filter((e) => `${e.title} ${e.source ?? ""} ${e.description}`.includes(sur)) : [];

  const listW = w >= 1320 ? 280 : 248;
  const cols = !two ? "minmax(0,1fr)" : chatOn ? `56px minmax(0,1fr) ${w < 900 ? "58%" : "52%"}` : `${listW}px minmax(0,1fr) 56px`;
  const showList = two || mView === "list";
  const showDossier = two || mView === "person";
  const showChat = two || mView === "chat";
  const listFull = mob || !chatOn || closing === "list";
  const listStrip = chatOn && closing !== "list";
  const chatFull = mob || chatOn || closing === "chat";
  const chatStrip = two && !chatOn && closing !== "chat";
  const monoSm = mob || short || chatOn;

  const groups = [
    { mine: true, t: "Your side", d: role === "plaintiff" ? "Applicants. You can interview them." : "Non-applicants. You can interview them." },
    { mine: false, t: "Other side", d: "Read their background. You’ll meet them in court." },
  ];

  const bioParas = selId ? paragraphs(bios[selId]) : [];
  const bioLoading = !!selId && bios[selId] === null;

  return (
    <div className={cn("mx-auto flex min-h-0 w-full max-w-360 flex-1 flex-col", mob ? "gap-2.5 px-3 pb-3 pt-2.5" : "gap-3 px-[3vw] pb-4.5 pt-4")}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2.5">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Link
            href={`/cases/${cnr}`}
            className="relative flex min-h-7 items-center gap-2 self-start text-xs uppercase tracking-[0.16em] text-desk-soft before:absolute before:-inset-x-1 before:-inset-y-2 before:content-[''] hover:text-desk-hover"
          >
            <span aria-hidden="true">←</span>
            <span>Case file</span>
          </Link>
          <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1.5">
            <h1 className={cn("m-0 font-display font-normal leading-[1.05]", mob ? "text-[28px]" : "text-[34px]")}>Case Prep</h1>
            <span className="font-data text-xs font-medium tracking-[0.04em] text-desk-muted">{cnr}</span>
          </div>
          {kase && (
            <span className="text-[13.5px] leading-[1.4] text-desk-muted">
              {kase.title} · You are the <strong className="text-desk-ink">{RN} Lawyer</strong>
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={proceed}
          disabled={starting || load !== "loaded"}
          className={cn(
            "h-12 cursor-pointer whitespace-nowrap px-5.5 text-xs font-bold uppercase tracking-[0.14em] text-cream light:text-ink disabled:cursor-wait",
            small ? "flex-[1_1_100%]" : "flex-none",
            ctaOff ? "bg-ink-disabled" : "bg-seal hover:bg-seal-hover",
          )}
        >
          {ctaLabel}
        </button>
      </div>

      {banner && (
        <div
          role="status"
          className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1.5 border border-[rgba(233,163,58,.5)] bg-[rgba(233,163,58,.08)] px-3.5 py-2.25 text-[13.5px] leading-[1.45] text-amber-hi light:text-amber"
        >
          <strong className="text-[10.5px] font-bold uppercase tracking-[0.18em]">{banner.k}</strong>
          <span className="flex-[1_1_300px]">{banner.t}</span>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        <div role="tablist" aria-label="Case prep" className="flex gap-1">
          {(
            [
              ["parties", "Parties", parties.length],
              ["evidence", "Evidence", evidence.length],
            ] as const
          ).map(([k, t, n]) => {
            const on = tab === k;
            return (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTab(k)}
                className={cn(
                  "flex h-10.5 cursor-pointer items-center justify-center gap-2.5 whitespace-nowrap px-5 text-xs font-bold uppercase tracking-[0.14em]",
                  small ? "flex-[1_1_0]" : "flex-none",
                  on ? "bg-paper text-ink" : "bg-transparent text-desk-muted hover:text-desk-hover",
                )}
              >
                <span>{t}</span>
                <span className="font-data text-[11px] font-medium tracking-normal opacity-75">{load === "loaded" ? n : ""}</span>
              </button>
            );
          })}
        </div>

        {load !== "loaded" && (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3.5 bg-paper px-5 py-8 text-center text-ink">
            {load === "loading" ? (
              <CourtModelLoader status="Gathering the parties and the evidence…" tone="paper" />
            ) : (
              <>
                <span role="alert" className="font-display text-2xl">
                  Couldn’t open Case Prep
                </span>
                <span className="max-w-105 text-body leading-[1.55] text-ink-label">Failed to load case prep. Please try again later.</span>
                <button
                  type="button"
                  onClick={fetchAll}
                  className="h-11.5 cursor-pointer whitespace-nowrap bg-seal px-5 text-xs font-bold uppercase tracking-[0.14em] text-cream hover:bg-seal-hover"
                >
                  Try again
                </button>
              </>
            )}
          </div>
        )}

        {load === "loaded" && tab === "parties" && (
          <div
            ref={panelRef}
            className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] overflow-hidden bg-paper text-ink shadow-sheet motion-safe:[transition:grid-template-columns_.62s_cubic-bezier(.65,0,.35,1)]"
            style={{ gridTemplateColumns: cols }}
          >
            {showList && (
              <div ref={listRef} className={cn("flex min-h-0 min-w-0 flex-col overflow-hidden bg-paper-soft", two && "border-r border-ink/20")}>
                {listFull && (
                  <div data-full="" className="flex min-h-0 flex-1 flex-col" style={{ minWidth: mob ? 0 : listW }}>
                    <div className="flex flex-none justify-between border-b-[3px] border-double border-ink px-4 pb-2.5 pt-3.5 text-label font-bold uppercase tracking-[0.2em] text-ink-label">
                      <span>Parties</span>
                      <span>{parties.length}</span>
                    </div>
                    <Scroller className="flex-1 pb-3 pt-0.5">
                      {parties.length === 0 && <p className="m-0 px-4 py-6 text-sm italic text-ink-hint">No parties found in this case.</p>}
                      {groups.map((g) => {
                        const items = parties.filter((p) => mine(p) === g.mine);
                        if (!items.length) return null;
                        return (
                          <div key={g.t}>
                            <div className="flex flex-col gap-0.5 px-4 pb-1.5 pt-3.5">
                              <span className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-ink-label">{g.t}</span>
                              <span className="text-xs leading-[1.4] text-ink-meta">{g.d}</span>
                            </div>
                            {items.map((p) => {
                              const cur = p.id === selId && (two || mView === "person");
                              const q = (msgs[p.id] ?? []).filter((m) => m.sender === "user").length;
                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => pickParty(p.id)}
                                  aria-current={cur ? "true" : undefined}
                                  className={cn(
                                    "grid w-full cursor-pointer grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.25 text-left transition-colors duration-200",
                                    cur ? "bg-ink text-paper" : g.mine ? "text-ink hover:bg-[#f3ecdd]" : "text-ink-muted hover:bg-[#f3ecdd]",
                                  )}
                                >
                                  <span
                                    aria-hidden="true"
                                    className={cn(
                                      "flex h-9 w-9 items-center justify-center font-display text-sm tracking-[0.04em]",
                                      cur ? "bg-paper text-ink" : g.mine ? "bg-ink text-paper" : "border-[1.5px] border-ink-muted text-ink-muted",
                                    )}
                                  >
                                    {initials(p.name)}
                                  </span>
                                  <span className="flex min-w-0 flex-col gap-0.5">
                                    <span className="truncate text-[14.5px] font-bold leading-[1.3]">{plain(p.name)}</span>
                                    <span className={cn("truncate text-[12.5px] leading-[1.35]", cur ? "text-[#b9ad97]" : "text-ink-meta")}>{p.occupation}</span>
                                  </span>
                                  <span className={cn("whitespace-nowrap font-data text-[11px] font-medium", cur ? "text-[#b9ad97]" : "text-ink-meta")}>{q ? `${q} Q` : ""}</span>
                                </button>
                              );
                            })}
                          </div>
                        );
                      })}
                    </Scroller>
                  </div>
                )}
                {listStrip && (
                  <div data-strip="" className="flex min-h-0 flex-1 flex-col items-center gap-2.5 pb-3 pt-2.5">
                    <button
                      type="button"
                      onClick={() => setFocus("list")}
                      aria-label="Show all parties"
                      aria-expanded="false"
                      className="flex w-11 flex-none cursor-pointer flex-col items-center gap-3 pb-2.5 pt-2 text-ink hover:text-seal"
                    >
                      <span aria-hidden="true" className="text-base leading-none">
                        »
                      </span>
                      <span className="rotate-180 whitespace-nowrap text-[10.5px] font-bold uppercase tracking-[0.18em] [writing-mode:vertical-rl]">Parties · {parties.length}</span>
                    </button>
                    <div className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto py-1 scrollbar-none [&::-webkit-scrollbar]:hidden">
                      {parties.map((p) => {
                        const cur = p.id === selId;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setSel(p.id)}
                            title={plain(p.name)}
                            aria-label={plain(p.name)}
                            aria-current={cur ? "true" : undefined}
                            className={cn(
                              "flex h-9 w-9 flex-none cursor-pointer items-center justify-center font-display text-[13px] transition-transform duration-150 hover:scale-[1.08]",
                              cur ? "bg-seal text-cream" : mine(p) ? "bg-ink text-cream" : "border-[1.5px] border-ink-muted text-ink-muted",
                            )}
                          >
                            {initials(p.name)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {showDossier && P && (
              <section ref={centerRef} aria-label={plain(P.name)} tabIndex={0} data-scroller="" className="flex min-h-0 min-w-0 flex-col overflow-y-auto overscroll-contain">
                {mob && (
                  <button
                    type="button"
                    onClick={() => setMView("list")}
                    className="flex min-h-11 flex-none cursor-pointer items-center gap-2 border-b border-ink/20 bg-paper-soft px-4 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-ink"
                  >
                    <span aria-hidden="true">←</span>
                    <span>All parties</span>
                  </button>
                )}
                <div className={cn("flex-none border-b-[3px] border-double border-ink", mob ? "px-4 py-3" : short || chatOn ? "px-5.5 py-3" : "px-7 pb-4 pt-4.5")}>
                  <div className="flex items-center gap-4">
                    <span
                      aria-hidden="true"
                      className={cn("flex flex-none items-center justify-center bg-ink font-display tracking-[0.04em] text-paper", monoSm ? "h-10 w-10 text-base" : "h-14 w-14 text-[21px]")}
                    >
                      {initials(P.name)}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1.25">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <h2 className={cn("m-0 font-display font-normal leading-[1.1]", mob ? "text-2xl" : chatOn ? "text-[22px]" : "text-[30px]")}>{plain(P.name)}</h2>
                        <span
                          className={cn(
                            "whitespace-nowrap border-[1.5px] px-2 pb-0.5 pt-0.75 text-[10.5px] font-bold uppercase tracking-[0.18em]",
                            can ? "border-seal text-seal" : "border-ink-muted text-ink-muted",
                          )}
                        >
                          {P.role === PersonRole.APPLICANT ? "Applicant" : "Non-applicant"}
                        </span>
                        {!chatOn && <span className="text-[12.5px] text-ink-muted">{can ? "Your side" : "Other side"}</span>}
                      </div>
                      <Meta p={P} nowrap={chatOn} />
                    </div>
                  </div>
                </div>
                <div
                  className={cn(
                    "grid items-start gap-x-9 gap-y-6",
                    two && !chatOn && w >= 1100 ? "grid-cols-[minmax(0,1fr)_300px]" : "grid-cols-[minmax(0,1fr)]",
                    mob ? "px-4 pb-6 pt-4" : chatOn ? "px-5.5 pb-6 pt-4" : "px-7 pb-7.5 pt-5",
                  )}
                >
                  <div className="flex min-w-0 flex-col gap-3">
                    <h3 className="m-0 text-[11px] font-bold uppercase tracking-[0.18em] text-ink-label">Background &amp; story</h3>
                    {bioLoading ? (
                      <p role="status" className="m-0 text-[15px] italic text-ink-meta">
                        Reading {first}’s file…
                      </p>
                    ) : bioParas.length ? (
                      bioParas.map((para, i) => (
                        <p key={i} className="m-0 max-w-[72ch] text-pretty text-[15.5px] leading-[1.7] text-[#2a2018]">
                          {para}
                        </p>
                      ))
                    ) : (
                      <p className="m-0 text-[15px] italic text-ink-hint">No background is on file yet.</p>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-col gap-4.5">
                    {can && !chatOn && (
                      <div className="flex flex-col gap-2 border border-ink/20 bg-[#f8f3e7] p-4">
                        <span className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-seal">Interview</span>
                        <span className="font-display text-xl leading-[1.2]">{qn ? `${qn} ${qn === 1 ? "question asked" : "questions asked"}` : "Not interviewed yet"}</span>
                        <span className="text-[13.5px] leading-normal text-ink-label">
                          {qn ? `Last answer ${stamp(list[list.length - 1]?.timestamp)}.` : `Ask ${first} what they saw, heard and kept.`}
                        </span>
                        <button
                          type="button"
                          onClick={openChat}
                          className="mt-1.5 h-11.5 cursor-pointer whitespace-nowrap bg-ink px-4.5 text-xs font-bold uppercase tracking-[0.14em] text-paper transition-colors duration-150 hover:bg-seal"
                        >
                          {readOnly ? "Read transcript →" : qn ? "Continue interview →" : `Interview ${first} →`}
                        </button>
                      </div>
                    )}
                    {!can && (
                      <div className="flex flex-col items-start gap-2.5 border border-dashed border-ink/45 p-4">
                        <NotYourClient />
                        <span className="text-pretty text-sm leading-[1.55] text-ink-label">{lockText}</span>
                      </div>
                    )}
                    {related.length > 0 && (
                      <div className="flex flex-col">
                        <span className="border-b border-ink/25 pb-2 text-[10.5px] font-bold uppercase tracking-[0.18em] text-ink-label">Appears in exhibits</span>
                        {related.map((x) => (
                          <button
                            key={x.id}
                            type="button"
                            onClick={() => setExId(x.id)}
                            className="grid cursor-pointer grid-cols-[42px_minmax(0,1fr)] items-baseline gap-3 border-b border-ink/12 py-2.5 text-left text-ink hover:text-seal"
                          >
                            <span className="flex-none whitespace-nowrap border-[1.5px] border-seal pb-0.5 pt-0.75 text-center font-data text-[11.5px] font-bold text-seal">{x.exhibit_ref}</span>
                            <span className="text-[13.5px] font-bold leading-[1.4]">{x.title}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}

            {showChat && P && (
              <aside
                ref={chatColRef}
                aria-label={`Interview with ${plain(P.name)}`}
                className={cn("flex min-h-0 min-w-0 flex-col overflow-hidden bg-[#e6dcc6]", two && "border-l border-ink/20")}
              >
                {chatStrip && (
                  <button
                    type="button"
                    data-strip=""
                    onClick={openChat}
                    aria-expanded="false"
                    aria-label={`Open interview with ${plain(P.name)}`}
                    className="flex min-h-0 w-full flex-1 cursor-pointer flex-col items-center gap-3.5 py-4.5 text-ink transition-colors duration-200 hover:bg-[#dcd0b6]"
                  >
                    <span aria-hidden="true" className="text-base leading-none">
                      «
                    </span>
                    <span className="rotate-180 whitespace-nowrap text-[10.5px] font-bold uppercase tracking-[0.18em] [writing-mode:vertical-rl]">
                      {can ? `Interview · ${plain(P.name)}` : "No interview · other side"}
                    </span>
                    {can && qn > 0 && <span className="bg-seal px-1.5 pb-0.5 pt-0.75 font-data text-[11px] font-medium text-cream">{qn}</span>}
                  </button>
                )}
                {chatFull && (
                  <div data-full="" className="flex min-h-0 flex-1 flex-col" style={{ minWidth: mob ? 0 : 380 }}>
                    <div className="flex flex-none items-center gap-3 border-b-[3px] border-double border-ink bg-paper px-4 pb-2.5 pt-3">
                      <button
                        type="button"
                        onClick={() => (two ? setFocus("list") : setMView("person"))}
                        aria-label={two ? "Collapse interview" : "Back to background"}
                        title={two ? "Collapse interview" : "Back to background"}
                        className="flex h-10 w-10 flex-none cursor-pointer items-center justify-center border-[1.5px] border-ink bg-transparent text-[17px] leading-none text-ink transition-colors duration-150 hover:bg-ink hover:text-paper"
                      >
                        {two ? "»" : "←"}
                      </button>
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-seal">Interview · Transcript</span>
                        <span className="truncate font-display text-[19px] leading-[1.2]">{plain(P.name)}</span>
                      </div>
                      <span className="flex-none font-data text-[11px] font-medium text-ink-muted">{qn ? `${qn} Q` : ""}</span>
                    </div>

                    {!can ? (
                      <div className="flex min-h-0 flex-1 flex-col items-start justify-center gap-3 p-7">
                        <NotYourClient />
                        <span className="font-display text-[22px] leading-tight">No interview with the other side</span>
                        <span className="max-w-[46ch] text-pretty text-[15px] leading-[1.6] text-ink-label">{lockText}</span>
                      </div>
                    ) : (
                      <>
                        <div
                          ref={chatRef}
                          data-scroller=""
                          role="log"
                          aria-live="polite"
                          aria-label="Interview transcript"
                          tabIndex={0}
                          className="flex min-h-0 flex-1 flex-col gap-4.5 overflow-y-auto overscroll-contain pb-6 pl-3 pr-6 pt-4.5 [background:linear-gradient(90deg,transparent_46px,rgba(142,31,25,.28)_46px,rgba(142,31,25,.28)_47px,transparent_47px)]"
                        >
                          <Line>
                            <span className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-seal">Transcript of interview</span>
                          </Line>
                          {!list.length && sending !== selId && (
                            <Line className="my-auto">
                              <div className="flex flex-col gap-3">
                                <span className="font-display text-[22px] leading-[1.2]">No questions yet.</span>
                                <span className="max-w-[48ch] text-[14.5px] leading-[1.55] text-ink-label">Start with {first}. Anything useful they say can be extracted as an exhibit.</span>
                                {!readOnly && (
                                  <div className="flex flex-col gap-1.5">
                                    {STARTERS.map((t) => (
                                      <button
                                        key={t}
                                        type="button"
                                        onClick={() => {
                                          setDrafts((d) => ({ ...d, [P.id]: t }));
                                          setTimeout(() => inputRef.current?.focus(), 30);
                                        }}
                                        className="max-w-full cursor-pointer self-start border border-ink/30 bg-[#f8f3e7] px-3.5 py-2.25 text-left text-sm leading-[1.35] text-ink transition-[border-color,transform] duration-150 hover:translate-x-0.75 hover:border-ink"
                                      >
                                        {t}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </Line>
                          )}
                          {list.map((m) => {
                            const u = m.sender === "user";
                            const isTyping = typing?.id === m.id;
                            const body = unbold(m.content);
                            const ex = logged[m.id];
                            return (
                              <div key={m.id} data-msg="" className="grid grid-cols-[26px_minmax(0,1fr)] gap-x-5">
                                <span aria-hidden="true" className={cn("font-display text-lg leading-[1.3]", u ? "text-seal" : "text-ink-label")}>
                                  {u ? "Q." : "A."}
                                </span>
                                <div className="flex min-w-0 flex-col gap-1.5">
                                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-meta">
                                    {u ? "You" : plain(P.name)} · {stamp(m.timestamp)}
                                  </span>
                                  <p className={cn("m-0 max-w-[72ch] whitespace-pre-wrap text-pretty text-[15.5px] leading-[1.6] text-ink", u ? "font-bold" : "font-normal")}>
                                    <span>{isTyping ? body.slice(0, typing.n) : body}</span>
                                    {isTyping && (
                                      <span aria-hidden="true" className="ml-0.5 inline-block h-0.5 w-2 bg-seal align-baseline animate-[ac-cursor_1s_steps(1)_infinite]" />
                                    )}
                                  </p>
                                  {!u && !isTyping && !ex && !m.id.startsWith("tmp-") && (
                                    <button
                                      type="button"
                                      onClick={() => extract(P.id, m)}
                                      disabled={extracting === m.id}
                                      className="flex h-7.5 cursor-pointer items-center gap-1.5 self-start border border-ink/40 bg-transparent px-2.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink hover:border-ink hover:bg-[#f8f3e7] disabled:cursor-wait"
                                    >
                                      <span aria-hidden="true">+</span>
                                      <span>{extracting === m.id ? "Extracting…" : "Extract as exhibit"}</span>
                                    </button>
                                  )}
                                  {ex && (
                                    <button
                                      type="button"
                                      onClick={() => setExId(ex.id)}
                                      className="rotate-[-1.5deg] cursor-pointer self-start border-[1.5px] border-seal bg-transparent px-2.25 pb-0.75 pt-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-seal hover:bg-seal/8"
                                    >
                                      Logged as {ex.exhibit_ref} · view
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                          {sending === selId && (
                            <div role="status" className="grid grid-cols-[26px_minmax(0,1fr)] gap-x-5">
                              <span aria-hidden="true" className="font-display text-lg leading-[1.3] text-ink-label">
                                A.
                              </span>
                              <span className="flex items-center gap-2 text-sm italic leading-[1.6] text-ink-meta">
                                <span>{first} is thinking</span>
                                <span aria-hidden="true" className="inline-block h-0.5 w-2 bg-seal animate-[ac-cursor_1s_steps(1)_infinite]" />
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-none flex-col gap-1.5 border-t-[3px] border-double border-ink bg-paper-soft px-3.5 pb-3 pt-2.5">
                          {!readOnly ? (
                            <>
                              {chatErr && (
                                <span role="alert" className="text-[13px] leading-[1.45] text-seal">
                                  {chatErr}
                                </span>
                              )}
                              <div className="flex items-end gap-2">
                                <textarea
                                  ref={inputRef}
                                  value={drafts[P.id] ?? ""}
                                  onChange={(e) => {
                                    const el = e.target;
                                    el.style.height = "auto";
                                    el.style.height = `${Math.min(140, Math.max(52, el.scrollHeight + 3))}px`;
                                    setDrafts((d) => ({ ...d, [P.id]: el.value }));
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey && !mob) {
                                      e.preventDefault();
                                      void send(P.id);
                                    }
                                  }}
                                  rows={2}
                                  aria-label={`Question for ${plain(P.name)}`}
                                  placeholder={`Ask ${first} about the case…`}
                                  className="h-13 max-h-35 min-w-0 flex-1 resize-none rounded-none border-[1.5px] border-ink bg-[#f8f3e7] px-3 py-2.25 text-[15px] leading-[1.45] text-ink outline-none placeholder:text-[#8f8574] focus:border-seal focus:shadow-[0_0_0_3px_rgba(142,31,25,.18)]"
                                />
                                <button
                                  type="button"
                                  onClick={() => void send(P.id)}
                                  disabled={busy}
                                  className={cn(
                                    "h-13 flex-none cursor-pointer whitespace-nowrap px-5 text-xs font-bold uppercase tracking-[0.14em] text-cream transition-colors duration-150 disabled:cursor-wait",
                                    !online || busy ? "bg-ink-disabled" : "bg-seal hover:bg-seal-hover",
                                  )}
                                >
                                  {!online ? "Offline" : sending ? "Sending…" : "Send"}
                                </button>
                              </div>
                              {!mob && <span className="text-[11.5px] text-ink-meta">Enter to send · Shift + Enter for a new line</span>}
                            </>
                          ) : (
                            <div className="flex flex-col gap-0.75 py-1 text-center">
                              <strong className={cn("text-[10.5px] font-bold uppercase tracking-[0.18em]", readNote.c)}>{readNote.k}</strong>
                              <span className="text-[13px] leading-[1.45] text-ink-label">{readNote.t}</span>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </aside>
            )}
          </div>
        )}

        {load === "loaded" && tab === "evidence" && <ExhibitGrid evidence={evidence} small={small} mob={mob} regen={regen} onRegen={regenerate} onOpen={setExId} />}
      </div>

      <ExhibitViewer
        evidence={evidence}
        openId={exId}
        onOpen={setExId}
        onClose={() => setExId(null)}
        parties={parties}
        mine={mine}
        onParty={(id) => {
          setExId(null);
          setTab("parties");
          pickParty(id);
        }}
        regen={regen}
        onRegen={regenerate}
        w={w}
      />
    </div>
  );
}

function Meta({ p, nowrap }: { p: PersonInvolved; nowrap: boolean }) {
  const line = [p.occupation, p.age ? `${p.age} years` : "", p.address].filter(Boolean).join(" · ");
  if (!line) return null;
  return (
    <span title={line} className={cn("overflow-hidden text-ellipsis text-[13.5px] leading-[1.45] text-ink-label", nowrap ? "whitespace-nowrap" : "whitespace-normal")}>
      {line}
    </span>
  );
}

function NotYourClient() {
  return (
    <span className="-rotate-2 border-[3px] border-double border-ink-muted px-3 pb-1 pt-1.5 font-display text-sm leading-none tracking-[0.08em] text-ink-muted">NOT YOUR CLIENT</span>
  );
}

/** A transcript line with an empty gutter where the Q./A. marks sit. */
function Line({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-[26px_minmax(0,1fr)] gap-x-5", className)}>
      <span />
      {children}
    </div>
  );
}
