"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { isAxiosError } from "axios";
import Composer, { type ComposerNote } from "@/components/courtroom/composer";
import {
  AnalysisDialog,
  CallAlert,
  CaseFilePanel,
  ObjectionDialog,
  ReportDialog,
  Stamp,
  VerdictDialog,
  type StampKind,
} from "@/components/courtroom/dialogs";
import { MOVES_ON, Proceedings, SIDE, THE, aiMade, buildRows, type Ev, type RecordCtx, type Side } from "@/components/courtroom/record";
import WitnessStand, { type Candidate, type Foot, type QA } from "@/components/courtroom/witness-stand";
import HearingRail, { type Check } from "@/components/settlement/hearing-rail";
import NegotiationSummary from "@/components/settlement/negotiation-summary";
import { formatDate } from "@/components/cases/kit";
import CourtModelLoader from "@/components/court/court-model-loader";
import { ExhibitViewer } from "@/components/prep/exhibits";
import { firstName, initials, onSide } from "@/components/prep/people";
import { useSettings } from "@/contexts/settings-context";
import { useFollowScroll } from "@/hooks/use-follow-scroll";
import { useOnline } from "@/hooks/use-online";
import { useViewport } from "@/hooks/use-viewport";
import { argumentAPI, caseAPI, courtroomAPI, partiesAPI, settlementAPI, witnessAPI } from "@/lib/api";
import { readCaseFile } from "@/lib/case-file";
import { HEARING_COPY, draftSubmission, nextAfter } from "@/lib/settlement";
import { AI_EXAMINATION_POLL_MS, COURTROOM_POLL_MS, MIN_ARGUMENTS_BETWEEN_AI_WITNESS_CHECKS } from "@/lib/config";
import { getErrorDetail } from "@/lib/error-utils";
import { argumentRateLimitAPI, type RateLimitInfo } from "@/lib/rateLimitAPI";
import { cn } from "@/lib/utils";
import {
  CaseStatus,
  CourtroomProceedingsEventType as T,
  type AIObjection,
  type Case,
  type CurrentWitnessResponse,
  type PersonInvolved,
} from "@/types";
import type { NegotiationAnalysis, SettlementView } from "@/types";

type Load = "loading" | "loaded" | "error" | "notfound";

const LEAVE_FIRST = "Respond to the request to call a witness first.";
const reduce = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const wait = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
const JUDGMENT_DELIVERED = "Judgment delivered";
/** How often the page checks for AI counsel's objection while the user's turn is heard. */
const OBJECTION_POLL_MS = 700;
/** The shortest time an objection stamp stays up, so it can be read. */
const MIN_STAMP_MS = 1500;
/** How long each line of a settlement hearing stays before the next is read out. */
const LINE_MS = 1700;

interface SpeechRec {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SpeechCtor = new () => SpeechRec;
function speechCtor(): SpeechCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/** User statements since the last witness came or went (the AI considers calling one after two). */
function argsSinceWitness(events: Ev[], me: Side) {
  let n = 0;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === T.WITNESS_CALLED || e.type === T.WITNESS_DISMISSED) break;
    if (e.type === T.ARGUMENT || (e.type === T.OPENING_STATEMENT && e.speaker_role === me)) n++;
  }
  return n;
}

/** Height for the exhibit list that opens above `row`, kept below the top of `panel`. */
function roomAbove(panel: HTMLElement | null, row: HTMLElement | null) {
  const top = panel?.getBoundingClientRect().top ?? 0;
  const bottom = row?.getBoundingClientRect().top ?? window.innerHeight;
  return Math.max(100, Math.min(340, Math.round(bottom - top - 16)));
}

export default function Courtroom({ params }: { params: Promise<{ cnr: string }> }) {
  const { cnr } = use(params);
  const router = useRouter();
  const online = useOnline();
  const { w } = useViewport();
  const { enterKeySubmits, autoExpandTextAreas } = useSettings();
  const two = w >= 760;
  const mob = !two;
  const small = w < 560;

  const [data, setData] = useState<Case | null>(null);
  const [load, setLoad] = useState<Load>("loading");
  const [cw, setCw] = useState<CurrentWitnessResponse | null>(null);
  const [parties, setParties] = useState<PersonInvolved[]>([]);
  const [limit, setLimit] = useState<RateLimitInfo | null>(null);

  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<"arg" | "close">("arg");
  const [att, setAtt] = useState<string[]>([]);
  const [sending, setSending] = useState<Ev | null>(null);
  const [typing, setTyping] = useState<{ id: string; n: number } | null>(null);
  const [popup, setPopup] = useState<StampKind | null>(null);
  const [alert, setAlert] = useState<{ by: string; name: string } | null>(null);
  const [witOpen, setWitOpen] = useState(false);
  const [witClosing, setWitClosing] = useState(false);
  const [qDraft, setQDraft] = useState("");
  const [asking, setAsking] = useState<string | null>(null);
  const [chose, setChose] = useState<string | null>(null);
  const [witBusy, setWitBusy] = useState(false);
  const [obj, setObj] = useState<Ev | null>(null);
  const [objBusy, setObjBusy] = useState(false);
  const [rep, setRep] = useState<{ id: string; no: string; who: string; text: string } | null>(null);
  const [reportedLocal, setReportedLocal] = useState<string[]>([]);
  const [xv, setXv] = useState<string | null>(null);
  const [regen, setRegen] = useState<string | null>(null);
  const [caseOpen, setCaseOpen] = useState(false);
  const [verdictOpen, setVerdictOpen] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [analysis, setAnalysis] = useState<{ text: string } | "loading" | "error">("loading");
  const [anTab, setAnTab] = useState<"court" | "negotiation">("court");
  const [negotiation, setNegotiation] = useState<NegotiationAnalysis | "loading" | "error">("loading");
  // A compromise before the court: the desk's view of it, the hearing lines still to be read out,
  // and the instalment being paid or answered.
  const [talks, setTalks] = useState<SettlementView | null>(null);
  const [held, setHeld] = useState<string[]>([]);
  const [paying, setPaying] = useState<number | null>(null);
  const drafted = useRef(false);
  const [seeking, setSeeking] = useState(false);
  const [extracting, setExtracting] = useState<string | null>(null);
  const [og, setOg] = useState<Record<string, boolean>>({});
  const [qAtt, setQAtt] = useState<string[]>([]);
  const [listening, setListening] = useState(false);
  const [micOk, setMicOk] = useState(false);

  const rec = useFollowScroll();
  const stand = useFollowScroll();
  const argRef = useRef<HTMLTextAreaElement>(null);
  const qRef = useRef<HTMLTextAreaElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const seen = useRef<Set<string> | null>(null);
  const firstIds = useRef<Set<string>>(new Set());
  const typingRef = useRef(typing);
  const recog = useRef<SpeechRec | null>(null);
  const timers = useRef<number[]>([]);
  const idle = useRef(false);
  const hadWitness = useRef<string | null>(null);
  const aiWasExamining = useRef(false);
  useEffect(() => {
    typingRef.current = typing;
  }, [typing]);

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);
  useEffect(() => {
    const list = timers.current;
    return () => list.forEach(clearTimeout);
  }, []);

  const showPopup = useCallback(
    (kind: StampKind, ms?: number, after?: () => void) => {
      setPopup(kind);
      if (ms)
        later(() => {
          setPopup(null);
          after?.();
        }, ms);
    },
    [later],
  );

  const refresh = useCallback(async () => {
    const [c, wit] = await Promise.all([caseAPI.getCase(cnr) as Promise<Case>, witnessAPI.getCurrentWitness(cnr).catch(() => null)]);
    setData(c);
    setCw(wit);
    return c;
  }, [cnr]);

  const fetchLimit = useCallback(() => {
    argumentRateLimitAPI
      .getArgumentRateLimit()
      .then(setLimit)
      .catch(() => undefined);
  }, []);

  const boot = useCallback(async () => {
    setLoad("loading");
    try {
      const c = await refresh();
      if (c.user_role !== "plaintiff" && c.user_role !== "defendant") {
        router.replace(`/cases/${cnr}`);
        return;
      }
      if (c.status === CaseStatus.NOT_STARTED) {
        router.replace(`/cases/${cnr}/case-prep`);
        return;
      }
      setLoad("loaded");
      partiesAPI
        .getParties(cnr)
        .then((r: { parties?: PersonInvolved[] }) => setParties(r.parties ?? []))
        .catch(() => undefined);
      fetchLimit();
      if (c.status === CaseStatus.ACTIVE) showPopup("session", 2600);
    } catch (e) {
      const code = isAxiosError(e) ? e.response?.status : undefined;
      setLoad(code === 404 || code === 403 ? "notfound" : "error");
    }
  }, [refresh, fetchLimit, showPopup, cnr, router]);

  useEffect(() => {
    void boot();
  }, [boot]);

  useEffect(() => setMicOk(!!speechCtor()), []);

  // While the court deliberates, the judgment (already on the server's record) isn't delivered yet.
  const [deliberating, setDeliberating] = useState(false);
  const events = useMemo<Ev[]>(() => {
    const list = (data?.courtroom_proceedings ?? [])
      .map((e, i) => ({ ...e, id: e.id ?? `ev-${i}` }))
      .filter((e) => !(deliberating && e.type === T.SYSTEM_MESSAGE && e.content === JUDGMENT_DELIVERED))
      .filter((e) => !held.includes(e.id));
    return sending ? [...list, sending] : list;
  }, [data, sending, deliberating, held]);

  const me: Side = data?.user_role === "defendant" ? "defendant" : "plaintiff";
  const ai: Side = me === "plaintiff" ? "defendant" : "plaintiff";
  const status = data?.status;
  const active = status === CaseStatus.ACTIVE;
  const view = active && data?.hearing_controlled_here === false;
  const live = active && !view && online;
  const route = data?.settlement_profile && data.settlement_profile.route !== "none" ? data.settlement_profile.route : null;
  const lastTalks = data?.settlements?.[data.settlements.length - 1];
  // A filed compromise is heard first when the court sits: counsel's submission is due.
  const listed = !!route && !!lastTalks && (lastTalks.status === "filed" || lastTalks.status === "adjourned");
  const heard = active && !view && listed;
  const talksKey = data?.settlement_profile ? (data.settlements ?? []).map((a) => a.status).join() : "";

  // The compromise's details (deed, payments as of today) come from the settlement desk's view.
  useEffect(() => {
    if (!talksKey) return;
    let live = true;
    settlementAPI
      .get(cnr)
      .then((v) => {
        if (!live) return;
        setTalks(v);
        const a = v.attempt;
        if (heard && a?.agreed && v.profile && v.profile.route !== "none" && !drafted.current) {
          drafted.current = true;
          setDraft(draftSubmission(v.profile.route, v.profile.accused_side === me, v.profile.complainants, a.agreed));
          // The court's checks start open beside the record (on a phone they'd cover it).
          if (two) setWitOpen(true);
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [talksKey, cnr, heard]);
  const evidence = useMemo(() => data?.evidence ?? [], [data]);
  const names = useMemo(() => Object.fromEntries(parties.map((p) => [p.id, p.name])), [parties]);

  // A new AI entry types itself out; what was in the record when the page opened just sits there.
  useEffect(() => {
    if (!data) return;
    const list = data.courtroom_proceedings ?? [];
    if (!seen.current) {
      seen.current = new Set(list.map((e) => e.id ?? ""));
      firstIds.current = new Set(seen.current);
      return;
    }
    const known = seen.current;
    const fresh = list.filter((e): e is Ev => !!e.id && !known.has(e.id));
    fresh.forEach((e) => known.add(e.id));
    const type = [...fresh].reverse().find((e) => aiMade(e, ai));
    if (type && !reduce()) setTyping({ id: type.id, n: 0 });
  }, [data, ai]);

  useEffect(() => {
    if (!typing) return;
    const typed = events.find((e) => e.id === typing.id);
    const text = typed?.content ?? "";
    // The AI's questions to a witness type out slower, to be read (and objected to) as they come.
    const [step, ms] = typed?.type === T.WITNESS_EXAMINED_Q ? [2, 32] : [3, 22];
    const t = window.setTimeout(() => setTyping(typing.n + step >= text.length ? null : { id: typing.id, n: typing.n + step }), ms);
    return () => clearTimeout(t);
  }, [typing, events]);

  /** Resolves once nothing is typing out. */
  const settle = useCallback(
    () =>
      new Promise<void>((resolve) => {
        const tick = () => (typingRef.current ? window.setTimeout(tick, 120) : resolve());
        window.setTimeout(tick, 160);
      }),
    [],
  );

  // Keep the newest entry in view (the record and the witness stand), unless the reader has scrolled
  // up to read; what the user just sent always comes into view.
  const count = events.length;
  const mineLast = events[events.length - 1]?.id === "pending";
  useEffect(() => {
    requestAnimationFrame(() => {
      rec.follow({ smooth: !reduce(), force: mineLast });
      stand.follow({ smooth: !reduce(), force: !!asking });
    });
  }, [count, load, mineLast, asking, rec, stand]);
  // Follow the text as it types.
  useEffect(() => {
    if (!typing) return;
    rec.follow();
    stand.follow();
  }, [typing, rec, stand]);

  // Every open device follows the hearing; faster while the AI examines a witness.
  const aiTurn = !!data?.is_ai_examining;
  useEffect(() => {
    if (!active || sending) return;
    const id = window.setInterval(
      () => {
        if (document.visibilityState === "visible") void refresh().catch(() => undefined);
      },
      aiTurn ? AI_EXAMINATION_POLL_MS : COURTROOM_POLL_MS,
    );
    return () => clearInterval(id);
  }, [active, aiTurn, sending, refresh]);

  // ---- witness stand state ----
  const onStand = cw?.has_witness ? cw : null;
  const standKey = onStand ? `${onStand.witness_id}:${onStand.phase}` : null;
  const myTurn = !!onStand && !aiTurn && onStand.next_examiner === me;
  const myQs = (phase: string) => onStand?.examination_history.filter((x) => x.examiner === me && x.phase === phase).length ?? 0;
  const stage: "none" | "ai" | "ask" | "re" | "cross" | "choice" = !onStand
    ? "none"
    : !myTurn
      ? "ai"
      : onStand.phase === "chief"
        ? "ask"
        : onStand.phase === "cross"
          ? myQs("cross") || chose === standKey
            ? "ask"
            : "cross"
          : myQs("re_exam") || chose === standKey
            ? "re"
            : "choice";

  const setWit = useCallback(
    (open: boolean) => {
      setWitOpen((was) => {
        if (was === open) return was;
        if (!open) {
          setWitClosing(true);
          later(() => setWitClosing(false), reduce() ? 0 : 640);
        }
        return open;
      });
    },
    [later],
  );

  // The stand opens when the AI starts examining, and closes once the witness steps down.
  useEffect(() => {
    if (aiTurn && !aiWasExamining.current) setWit(true);
    aiWasExamining.current = aiTurn;
  }, [aiTurn, setWit]);
  const standId = onStand?.witness_id ?? null;
  useEffect(() => {
    if (hadWitness.current && !standId) {
      later(() => {
        setWit(false);
        argRef.current?.focus({ preventScroll: true });
      }, 500);
    }
    hadWitness.current = standId;
  }, [standId, later, setWit]);

  // ---- derived record state ----
  const objected = useMemo(() => new Set(events.flatMap((e) => (e.objection ? [e.objection.target_id] : []))), [events]);
  const lastMove = useMemo(() => [...events].reverse().find((e) => MOVES_ON.has(e.type)), [events]);
  const busy = !!sending || !!typing || aiTurn || witBusy || !!asking || objBusy || held.length > 0;
  const objectable =
    lastMove && lastMove.speaker_role === ai && !objected.has(lastMove.id) && active && !view && !sending && !popup && !objBusy
      ? lastMove.id
      : null;
  const leave = data?.pending_leave ?? null;
  const reported = useMemo(() => new Set([...(data?.reported ?? []), ...reportedLocal]), [data, reportedLocal]);
  const userArgs = events.filter((e) => e.type === T.ARGUMENT).length;
  const spoken = events.filter((e) => e.type === T.ARGUMENT || (e.type === T.OPENING_STATEMENT && e.speaker_role === me)).length;
  const sess = Math.max(0, spoken - (data?.session_args_at_start ?? 0));
  const closingAvail = userArgs >= 3 && active;
  const closingMode = closingAvail && mode === "close";
  // Evidence goes in arguments only: never in the opening or the closing.
  const opened = events.some((e) => e.type === T.OPENING_STATEMENT && e.speaker_role === me);
  const cite = !closingMode && opened;

  const note = useCallback((msg: string) => void toast(msg, { duration: 2800 }), []);
  /**
   * While the user's turn is heard, show AI counsel's objection the moment it is raised and the
   * ruling the moment the court gives it (the same stamps as the user's own objection), then let
   * the record show them.
   */
  const hearObjections = async <R extends { ai_objection?: AIObjection | null }>(turn: Promise<R>): Promise<R> => {
    // An object, not lets: the poll and the response both move the stage along.
    const st = { stage: "none" as "none" | "objected" | "ruled", since: 0, over: false };
    const stamp = (stage: typeof st.stage, kind: StampKind) => {
      st.stage = stage;
      st.since = Date.now();
      setPopup(kind);
    };
    // ponytail: polls the whole case; a small endpoint if this ever weighs on the server.
    void (async () => {
      while (!st.over) {
        await wait(OBJECTION_POLL_MS);
        const c: Case | null = st.over ? null : await caseAPI.getCase(cnr).catch(() => null);
        const live = c?.ai_objection_live;
        if (st.over || !live) continue;
        if (st.stage === "none") stamp("objected", "objected");
        if (st.stage === "objected" && live.sustained !== undefined) {
          await wait(MIN_STAMP_MS - (Date.now() - st.since));
          if (!st.over) stamp("ruled", live.sustained ? "sustained" : "overruled");
        }
      }
    })();
    try {
      const r = await turn;
      st.over = true;
      const o = r.ai_objection;
      if (o) {
        if (st.stage === "none") stamp("objected", "objected");
        if (st.stage === "objected") {
          await wait(MIN_STAMP_MS - (Date.now() - st.since));
          stamp("ruled", o.sustained ? "sustained" : "overruled");
        }
        await wait(MIN_STAMP_MS - (Date.now() - st.since));
      }
      if (st.stage !== "none") setPopup(null);
      return r;
    } catch (err) {
      st.over = true;
      if (st.stage !== "none") setPopup(null);
      throw err;
    }
  };

  // ---- arguing ----
  const whenIdle = useCallback(
    (fn: () => void, ms: number) => {
      if (idle.current) return;
      idle.current = true;
      const go = () => {
        const open = document.querySelector("[role=dialog][data-state=open], [role=alertdialog]");
        if (argRef.current?.value.trim() || typingRef.current || open) return later(go, 700);
        idle.current = false;
        fn();
      };
      later(go, ms);
    },
    [later],
  );

  const aiConsidersWitness = useCallback(async () => {
    try {
      const res = await witnessAPI.aiCallWitness(cnr);
      if (res?.should_call) await refresh();
    } catch {
      /* the hearing simply carries on */
    }
  }, [cnr, refresh]);

  const stopMic = () => {
    try {
      recog.current?.stop();
    } catch {
      /* already stopped */
    }
    recog.current = null;
    setListening(false);
  };

  /** Counsel makes the submission; the court hears the compromise, every line goes on the record and
   * is read out in turn, then the order: the verdict when granted, else the court adjourns. */
  const submitCompromise = async (text: string) => {
    if (text.length < 10) return note("Say a sentence or two to the court first.");
    if (!online) return note("You’re offline. Your submission is kept, so you can make it when you’re back online.");
    const before = new Set((data?.courtroom_proceedings ?? []).map((e, i) => e.id ?? `ev-${i}`));
    stopMic();
    setSending({ id: "pending", type: T.SETTLEMENT, content: text, speaker_role: me, timestamp: new Date().toISOString() } as Ev);
    try {
      const v = await settlementAPI.hearing(cnr, text);
      const c = (await caseAPI.getCase(cnr)) as Case;
      const fresh = (c.courtroom_proceedings ?? []).map((e, i) => e.id ?? `ev-${i}`).filter((id) => !before.has(id));
      const queue = reduce() ? [] : fresh.slice(1); // counsel's own words show at once
      setHeld(queue);
      setSending(null);
      setDraft("");
      setTalks(v);
      setData(c);
      queue.forEach((id, k) => later(() => setHeld((h) => h.filter((x) => x !== id)), LINE_MS * (k + 1)));
      later(
        () => {
          if (v.attempt?.hearing?.outcome === "granted") setVerdictOpen(true);
          else showPopup("adjourned", 2600);
          // Refused: the checks give way to the witness stand, folded away as it usually starts.
          if (v.attempt?.hearing?.outcome === "refused") setWit(false);
        },
        LINE_MS * (queue.length + 1),
      );
    } catch (err) {
      setSending(null);
      toast.error(getErrorDetail(err) || "The court couldn’t hear the matter just now. Please try again.");
    }
  };

  const submit = async () => {
    const text = draft.trim();
    if (!text || busy || !data) return;
    if (heard) return void submitCompromise(text);
    if (leave) return note(LEAVE_FIRST);
    if (!online) return note("You’re offline. Your argument is kept, so you can submit it when you’re back online.");
    if (onStand) {
      setWit(true);
      return note("Finish with the witness before you address the court.");
    }
    const closing = closingMode;
    const pinned = cite ? att : [];
    const refs = pinned.map((id) => evidence.find((x) => x.id === id)?.exhibit_ref).filter((r): r is string => !!r);
    stopMic();
    setSending({
      id: "pending",
      type: closing ? T.CLOSING_STATEMENT : opened ? T.ARGUMENT : T.OPENING_STATEMENT,
      content: text,
      speaker_role: me,
      timestamp: new Date().toISOString(),
      exhibit_refs: refs,
    });
    setDraft("");
    setAtt([]);
    if (argRef.current) argRef.current.style.height = "46px";
    try {
      if (closing) {
        setDeliberating(true);
        await argumentAPI.submitClosingStatement(cnr, me, text);
        await refresh();
        setSending(null);
        setMode("arg");
        await settle();
        await wait(700);
        showPopup("deliberating", 3000, () => {
          // Judgment is delivered once the court has deliberated, then the verdict opens.
          setDeliberating(false);
          void refresh()
            .then(() => wait(1200))
            .then(() => setVerdictOpen(true));
        });
        return;
      }
      const res = await hearObjections(argumentAPI.submitArgument(cnr, me, text, refs));
      const c = await refresh();
      setSending(null);
      fetchLimit();
      // AI counsel's objection was sustained: the argument is struck and the floor is the user's again.
      const struck = !!res.ai_objection?.sustained;
      if (struck) note("Objection sustained: your argument is struck. Make another argument.");
      if (res.court_adjourns) {
        await settle();
        await wait(900);
        showPopup("limit", 3200, () => {
          void caseAPI
            .updateCaseStatus(cnr, CaseStatus.ADJOURNED, "limit")
            .catch(() => undefined)
            .then(refresh);
        });
        return;
      }
      const list = (c.courtroom_proceedings ?? []) as Ev[];
      if (!struck && !c.current_witness_id && argsSinceWitness(list, me) >= MIN_ARGUMENTS_BETWEEN_AI_WITNESS_CHECKS) {
        await settle();
        whenIdle(() => void aiConsidersWitness(), 1400);
      } else {
        later(() => argRef.current?.focus({ preventScroll: true }), 40);
      }
    } catch (err) {
      setSending(null);
      setDeliberating(false);
      setDraft(text);
      setAtt(pinned);
      toast.error(getErrorDetail(err) || "Couldn’t submit your argument. Please try again.");
    }
  };

  // ---- objections ----
  const openObj = (e: Ev) => {
    if (!online) return note("You’re offline. Raise the objection when you’re back online.");
    setObj(e);
    // The AI's examination pauses while you choose grounds (a leave request already holds the hearing).
    if (e.type !== T.LEAVE_REQUEST) void courtroomAPI.holdObjection(cnr, true).catch(() => undefined);
  };
  const withdrawObj = () => {
    if (obj && obj.type !== T.LEAVE_REQUEST) void courtroomAPI.holdObjection(cnr, false).catch(() => undefined);
    setObj(null);
  };
  const objKind = (e: Ev) => (e.type === T.LEAVE_REQUEST ? "leave" : e.type === T.WITNESS_EXAMINED_Q ? "question" : "argument");

  const seat = useCallback(
    (name: string) => {
      setAlert({ by: THE[ai], name });
      later(() => {
        setAlert(null);
        setWit(true);
      }, 1900);
    },
    [ai, later, setWit],
  );

  const raise = async (grounds: string, details: string) => {
    const target = obj;
    if (!target) return;
    if (!grounds) return note("Choose the grounds for your objection.");
    if (!online) return note("You’re offline. Raise the objection when you’re back online.");
    const isLeave = target.type === T.LEAVE_REQUEST;
    setObj(null);
    setObjBusy(true);
    setPopup("considering");
    const t0 = Date.now();
    try {
      const r: { sustained?: boolean; granted?: boolean; witness_name?: string } = isLeave
        ? await witnessAPI.respondToLeave(cnr, { grounds, details })
        : await courtroomAPI.raiseObjection(cnr, target.id, grounds, details);
      await wait(1800 - (Date.now() - t0));
      setPopup(r.sustained ? "sustained" : "overruled");
      await wait(1500);
      setPopup(null);
      await refresh();
      if (isLeave && r.granted) {
        await settle();
        seat(r.witness_name ?? leave?.witness_name ?? "The witness");
      }
    } catch (err) {
      setPopup(null);
      toast.error(getErrorDetail(err) || "The court couldn’t rule on the objection. Please try again.");
    } finally {
      setObjBusy(false);
    }
  };

  const noObjection = async () => {
    if (!leave) return;
    if (!online) return note("You’re offline. Answer the request when you’re back online.");
    setObjBusy(true);
    try {
      const r = await witnessAPI.respondToLeave(cnr, null);
      await refresh();
      seat(r.witness_name ?? leave.witness_name);
    } catch (err) {
      toast.error(getErrorDetail(err) || "Couldn’t answer the request. Please try again.");
    } finally {
      setObjBusy(false);
    }
  };

  // ---- witnesses ----
  const callWitness = async (p: PersonInvolved) => {
    if (leave) return note(LEAVE_FIRST);
    if (!online) return note("You’re offline. Call a witness when you’re back online.");
    setWitBusy(true);
    try {
      await witnessAPI.callWitness(cnr, p.id);
      await refresh();
      later(() => qRef.current?.focus({ preventScroll: true }), 120);
    } catch (err) {
      toast.error(getErrorDetail(err) || "Couldn’t call the witness. Please try again.");
    } finally {
      setWitBusy(false);
    }
  };

  const ask = async () => {
    const q = qDraft.trim();
    if (!q || asking || typing) return;
    if (!online) return note("You’re offline. Your question is kept.");
    const pinned = qAtt;
    const refs = pinned.map((id) => evidence.find((x) => x.id === id)?.exhibit_ref).filter((r): r is string => !!r);
    setAsking(q);
    setQDraft("");
    setQAtt([]);
    if (qRef.current) qRef.current.style.height = "46px";
    try {
      const res = await hearObjections(witnessAPI.examineWitness(cnr, q, refs));
      await refresh();
      if (res.ai_objection?.sustained) note("Objection sustained: question withdrawn. Ask another.");
      later(() => qRef.current?.focus({ preventScroll: true }), 30);
    } catch (err) {
      setQDraft(q);
      setQAtt(pinned);
      toast.error(getErrorDetail(err) || "The witness couldn’t answer. Please try again.");
    } finally {
      setAsking(null);
    }
  };

  /** Done with my turn: the other side examines next, or the witness is discharged. */
  const finishTurn = async () => {
    if (asking || typing || !onStand) return;
    if (!online) return note("You’re offline.");
    setWitBusy(true);
    try {
      await witnessAPI.aiCrossExamine(cnr);
      await refresh();
    } catch (err) {
      toast.error(getErrorDetail(err) || "Couldn’t hand the witness over. Please try again.");
    } finally {
      setWitBusy(false);
    }
  };

  const dismiss = async () => {
    if (!online) return note("You’re offline.");
    setWitBusy(true);
    try {
      await witnessAPI.concludeWitness(cnr);
      await refresh();
    } catch (err) {
      toast.error(getErrorDetail(err) || "Couldn’t dismiss the witness. Please try again.");
    } finally {
      setWitBusy(false);
    }
  };

  const extract = async (e: Ev) => {
    if (extracting) return;
    if (!online) return note("You’re offline. Extract this testimony when you’re back online.");
    setExtracting(e.id);
    try {
      await caseAPI.extractEvidence(cnr, { event_id: e.id });
      const c = await refresh();
      const ref = c.evidence?.find((x) => x.origin_id === e.id)?.exhibit_ref;
      note(ref ? `Evidence extracted. ${ref} added to the exhibits.` : "Evidence extracted.");
    } catch (err) {
      toast.error(getErrorDetail(err) || "Couldn’t extract the evidence. Please try again.");
    } finally {
      setExtracting(null);
    }
  };

  const regenerate = async (id: string) => {
    setRegen(id);
    try {
      await caseAPI.regenerateEvidenceImage(cnr, id);
      await refresh();
    } catch (err) {
      toast.error(getErrorDetail(err) || "Couldn’t regenerate the image. Please try again.");
    } finally {
      setRegen(null);
    }
  };

  // ---- the session ----
  const adjourn = async () => {
    if (sess < 2) return note(`Submit at least ${2 - sess} more argument${2 - sess === 1 ? "" : "s"} this session before adjourning.`);
    if (busy) return;
    if (!online) return note("You’re offline. Adjourn when you’re back online.");
    try {
      await caseAPI.updateCaseStatus(cnr, CaseStatus.ADJOURNED);
      setWit(false);
      showPopup("adjourned", 2600, () => void refresh());
    } catch (err) {
      toast.error(getErrorDetail(err) || "Couldn’t adjourn the court. Please try again.");
    }
  };

  const resume = async () => {
    if (!online) return note("You’re offline. The hearing resumes when you’re back online.");
    try {
      await caseAPI.updateCaseStatus(cnr, CaseStatus.ACTIVE);
      await refresh();
      fetchLimit();
      showPopup("session", 2600);
    } catch (err) {
      toast.error(getErrorDetail(err) || "Couldn’t resume the hearing. Please try again.");
    }
  };

  const takeOver = async () => {
    try {
      await caseAPI.takeOverHearing(cnr);
      await refresh();
      note("You’re now running the hearing from this device.");
      later(() => argRef.current?.focus({ preventScroll: true }), 80);
    } catch (err) {
      toast.error(getErrorDetail(err) || "Couldn’t take over the hearing. Please try again.");
    }
  };

  const fetchAnalysis = useCallback(async () => {
    setAnalysis("loading");
    try {
      const r = await caseAPI.analyzeCase(cnr);
      setAnalysis({ text: r?.analysis ?? "" });
      if (r?.outcome) setData((d) => (d && !d.outcome ? { ...d, outcome: r.outcome } : d));
    } catch {
      setAnalysis("error");
    }
  }, [cnr]);

  const fetchNegotiation = useCallback(async () => {
    setNegotiation("loading");
    try {
      setNegotiation(await settlementAPI.analysis(cnr));
    } catch {
      setNegotiation("error");
    }
  }, [cnr]);

  // What there is to analyse: the user's work in court, and their negotiation.
  const argued = events.some((e) => e.speaker_role === me && (MOVES_ON.has(e.type) || e.type === T.CLOSING_STATEMENT));
  const negotiated = (data?.settlements ?? []).some((a) => a.entries.some((e) => e.by === "user"));
  const showTab = (tab: "court" | "negotiation") => {
    setAnTab(tab);
    if (tab === "court" && typeof analysis !== "object") void fetchAnalysis();
    if (tab === "negotiation" && typeof negotiation !== "object") void fetchNegotiation();
  };
  const openAnalysis = () => {
    setVerdictOpen(false);
    setAnalysisOpen(true);
    showTab(argued || !negotiated ? "court" : "negotiation");
  };

  const pay = async (index: number) => {
    const a = talks?.attempt;
    if (!route || !a || paying !== null) return;
    if (!online) return note("You’re offline. Try again when you’re back online.");
    const action = a.user_pays ? "pay" : ({ quash: "recall", compound: "notice", plea: "recover" } as const)[route];
    setPaying(index);
    try {
      setTalks(await settlementAPI.payment(cnr, index, action));
      note(a.user_pays ? "Payment recorded." : HEARING_COPY[route].remedy.done);
    } catch (err) {
      toast.error(getErrorDetail(err) || "Couldn’t record that. Please try again.");
    } finally {
      setPaying(null);
    }
  };

  /** Counsel asks the court for time to settle; the court considers it, rules, and adjourns if it grants it. */
  const seekSettle = async () => {
    if (busy || seeking) return;
    if (!online) return note("You’re offline. You can ask for an adjournment when you’re back online.");
    setSeeking(true);
    setPopup("seeking");
    try {
      const [r] = await Promise.all([settlementAPI.adjourn(cnr), new Promise<void>((done) => later(done, 1800))]);
      setPopup(null);
      if (r.granted) setWit(false);
      await refresh(); // the ruling types itself out
      await settle();
      if (r.granted) showPopup("adjourned", 2400);
    } catch (err) {
      setPopup(null);
      toast.error(getErrorDetail(err) || "Couldn’t put the request to the court. Please try again.");
    } finally {
      setSeeking(false);
    }
  };

  const sendReport = async (reason: string, details: string) => {
    if (!rep) return false;
    if (!reason) {
      note("Choose a reason for your report.");
      return false;
    }
    if (reason === "other" && !details) {
      note("Add a few words about what went wrong.");
      return false;
    }
    if (!online) {
      note("You’re offline. Send the report when you’re back online.");
      return false;
    }
    try {
      await courtroomAPI.report(cnr, rep.id, reason, details);
      setReportedLocal((r) => [...r, rep.id]);
      note("Report sent. Thanks — it helps us improve the AI.");
      return true;
    } catch (err) {
      toast.error(getErrorDetail(err) || "Couldn’t send the report. Please try again.");
      return false;
    }
  };

  const toggleMic = () => {
    if (listening) return stopMic();
    if (!online) return note("You’re offline. Voice input needs a connection.");
    const Rec = speechCtor();
    if (!Rec) return;
    const base = draft ? draft.replace(/\s*$/, " ") : "";
    try {
      const rec = new Rec();
      rec.lang = "en-IN";
      rec.interimResults = true;
      rec.continuous = true;
      rec.onresult = (ev) => {
        let t = "";
        for (let i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript;
        setDraft(base + t.trim());
      };
      rec.onerror = (ev) => {
        stopMic();
        if (ev.error === "not-allowed") note("Microphone access was blocked. Allow it in your browser to dictate.");
      };
      rec.onend = () => setListening(false);
      rec.start();
      recog.current = rec;
      setListening(true);
    } catch {
      setListening(false);
    }
  };
  useEffect(() => () => recog.current?.stop(), []);

  // Escape: the picker and the dialogs handle their own; after them, the witness stand.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || popup || alert) return;
      if (document.querySelector("[role=dialog][data-state=open]")) return;
      if (witOpen) setWit(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [popup, alert, witOpen, setWit]);

  const file = useMemo(() => readCaseFile(data?.case_text ?? "", data?.evidence ?? []), [data]);

  // ---- render ----
  if (load !== "loaded" || !data) {
    return (
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 py-6">
        {load === "loading" ? (
          <CourtModelLoader status="Loading the courtroom…" />
        ) : (
          <div role="alert" className="flex max-w-115 flex-col items-center gap-4 text-center">
            <span className="font-display text-[30px] leading-[1.15] text-desk-ink">
              {load === "notfound" ? "Case Not Found" : "Couldn’t open the courtroom"}
            </span>
            <span className="text-[15px] leading-[1.55] text-balance text-desk-muted">
              {load === "notfound"
                ? "The case you’re looking for doesn’t exist or you don’t have permission to view it."
                : "Failed to load case details. Please try again later."}
            </span>
            <div className="flex flex-wrap justify-center gap-2">
              <Link
                href={load === "notfound" ? "/cases" : `/cases/${cnr}/case-prep`}
                className="flex h-11.5 items-center border border-desk-rule-mid px-4.5 text-xs font-bold tracking-[0.14em] text-desk-ink uppercase hover:border-desk-ink"
              >
                {load === "notfound" ? "Back to my cases" : "Go back"}
              </Link>
              {load === "error" && (
                <button
                  type="button"
                  onClick={boot}
                  className="h-11.5 cursor-pointer bg-seal px-4.5 text-xs font-bold tracking-[0.14em] text-cream uppercase hover:bg-seal-hover"
                >
                  Try again
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  const resolved = status === CaseStatus.RESOLVED;
  const adjourned = status === CaseStatus.ADJOURNED;
  const court = file.court;
  const judgment = [...events].reverse().find((e) => e.type === T.SYSTEM_MESSAGE && e.content === JUDGMENT_DELIVERED);
  const stLabel = view ? "In session · watching" : active ? "in session" : adjourned ? "adjourned" : "resolved";
  const stC = active
    ? "border-desk-green text-desk-green"
    : adjourned
      ? "border-amber-hi text-amber-hi light:border-amber light:text-amber"
      : "border-desk-soft text-desk-soft";

  const witnessName = onStand?.witness_name ?? "";
  const standCall = onStand
    ? [...events].reverse().find((e) => e.type === T.WITNESS_CALLED && e.witness_id === onStand.witness_id)
    : undefined;
  const hist: QA[] = [];
  // The stand types out in step with the record.
  const shown = (x: Ev) => (typing?.id === x.id ? x.content.slice(0, typing.n) : x.content);
  if (standCall) {
    const after = events.slice(events.indexOf(standCall));
    after.forEach((e, k) => {
      if (e.type !== T.WITNESS_EXAMINED_Q) return;
      const next = after.slice(k + 1).find((x) => x.type === T.WITNESS_EXAMINED_A || x.type === T.WITNESS_EXAMINED_Q);
      const mine = e.speaker_role === me;
      hist.push({
        id: e.id,
        by: mine ? "You asked" : `${SIDE[ai]} · AI`,
        mine,
        q: shown(e),
        refs: e.exhibit_refs ?? [],
        a: next?.type === T.WITNESS_EXAMINED_A ? shown(next) : null,
        objectable: e.id === objectable,
        withdrawn: e.struck === "withdrawn",
      });
    });
  }
  if (asking) hist.push({ id: "asking", by: "You asked", mine: true, q: asking, refs: [], a: null, objectable: false, withdrawn: false });

  const cands: Candidate[] = parties.map((p) => {
    const ours = onSide(me, p);
    const testified = events.some((e) => e.type === T.WITNESS_CALLED && e.witness_id === p.id);
    const off = !live || busy || closingMode;
    return {
      id: p.id,
      name: p.name,
      ini: initials(p.name),
      sub: `${p.role === "applicant" ? "Applicant" : "Non-applicant"}${ours ? " · your side" : " · other side"}${testified ? " · testified" : ""}`,
      ours,
      off,
      onCall: () => {
        if (!off) return void callWitness(p);
        note(
          closingMode
            ? "Evidence is closed. In closing you argue from the record and can’t call a witness."
            : !online
              ? "You’re offline."
              : !active
                ? "The court is not in session."
                : view
                  ? "The hearing is being run from another device."
                  : "Wait for the current exchange to finish.",
        );
      },
    };
  });

  const choice = (text: string, a: string, b: string): Foot => ({
    kind: "choice",
    text,
    a,
    b,
    onA: () => {
      setChose(standKey);
      later(() => qRef.current?.focus({ preventScroll: true }), 60);
    },
    onB: () => void dismiss(),
  });
  const foot: Foot = !onStand
    ? null
    : view
      ? { kind: "view" }
      : stage === "ask"
        ? { kind: "ask", re: false }
        : stage === "re"
          ? { kind: "ask", re: true }
          : stage === "cross"
            ? choice(
                `${SIDE[ai]} has finished examining the witness. Would you like to cross-examine?`,
                "Cross-examine",
                "No questions · dismiss",
              )
            : stage === "choice"
              ? choice(
                  `${SIDE[ai]} has finished their cross-examination. You may re-examine the witness once, on matters raised in cross.`,
                  "Re-examine",
                  "No re-examination · dismiss",
                )
              : null;
  const busyNote =
    onStand && aiTurn
      ? `${SIDE[ai]} ${onStand.phase === "chief" ? "is examining the witness" : onStand.phase === "re_exam" ? "is re-examining the witness" : "is cross-examining the witness"}`
      : null;

  const ctx: RecordCtx = {
    me,
    ai,
    mob,
    typing,
    fresh: (id) => !firstIds.current.has(id),
    names,
    evidence,
    objectable,
    onObject: openObj,
    reported,
    onReport: (e, no) =>
      setRep({
        id: e.id,
        no,
        who:
          e.type === T.RULING
            ? "The Court"
            : e.type === T.WITNESS_EXAMINED_A
              ? `${names[e.witness_id ?? ""] ?? "Witness"} · AI`
              : `${SIDE[ai]} · AI`,
        text: e.content,
      }),
    leaveOpen: leave && active && !view && !objBusy ? leave.event_id : null,
    onNoObjection: () => void noObjection(),
    canExtract: !view && !closingMode && !resolved,
    extracting,
    onExtract: (e) => void extract(e),
    onExhibit: setXv,
  };

  const composerNote: ComposerNote | null = adjourned
    ? {
        k: "Court adjourned",
        t: "The hearing is paused. Resume when you’re ready to continue.",
        c: "#7a4a0c",
        btn: "Resume hearing →",
        go: () => void resume(),
      }
    : resolved
      ? {
          k: "Case resolved",
          t: "The court has delivered its verdict. The record is now closed.",
          c: "#3e3326",
          btn: "View verdict",
          go: () => setVerdictOpen(true),
        }
      : view
        ? { k: "Watching from this device", t: "Arguments are being submitted from another device.", c: "#3e3326" }
        : null;

  // Settling: open unless the case's route is known to be closed; the court sees a signed deed.
  const routeOpen = data.settlement_profile?.route !== "none";
  const deedSigned = !!lastTalks && ["signed", "filed", "adjourned"].includes(lastTalks.status);
  const canSeek = active && !view && routeOpen && !listed;
  const grid = mob && canSeek;

  // While a compromise is before the court, or once it has disposed of the case, the court's checks
  // take the witness stand's place.
  const deal = talks?.attempt?.agreed && talks.profile && talks.profile.route !== "none" ? talks : null;
  const settledHere = deal?.attempt?.status === "recorded";
  const checksUp = !!deal && (listed || settledHere || held.length > 0);
  const hearingNow = deal?.attempt?.hearing && !held.length ? deal.attempt.hearing : null;
  const copy = deal?.profile && deal.profile.route !== "none" ? HEARING_COPY[deal.profile.route] : null;
  const checks: Check[] =
    hearingNow?.checks.length && copy
      ? hearingNow.checks
      : (copy?.checks ?? []).map((label) => ({ label, state: "wait" as const, text: "The court hears this." }));
  const people = deal?.profile?.complainants ?? [];
  const many = people.length > 3;
  const complainants = (many ? people.slice(0, 2) : people).map((name, i) => {
    const a = hearingNow?.lines.find((l) => l.kind === "answer" && l.who.includes(name));
    return {
      name,
      role: i === 0 ? "Lead complainant" : "Complainant",
      state: (a ? (a.unsure ? "Unsure" : "Confirmed") : "Waiting") as "Confirmed" | "Unsure" | "Waiting",
    };
  });
  if (many)
    complainants.push({
      name: `${people.length - 2} others`,
      role: "Identified by the investigating officer",
      state: settledHere ? "Confirmed" : "Waiting",
    });
  const next = settledHere && deal?.profile && deal.profile.route !== "none" ? nextAfter(deal.profile.route, "granted", "") : null;
  const tabs = [
    ...(argued || !negotiated ? [{ id: "court", label: "In court" }] : []),
    ...(negotiated ? [{ id: "negotiation", label: "Negotiation" }] : []),
  ];
  const onNegotiation = anTab === "negotiation" && negotiated;

  const btn = cn(
    "h-10.5 min-w-0 cursor-pointer font-bold whitespace-nowrap uppercase",
    mob ? "flex-[1_1_auto] px-1.5 text-[11px] tracking-[0.06em]" : "flex-none px-4 text-xs tracking-[0.14em]",
  );
  const outline = cn(btn, "border border-desk-rule-mid bg-transparent text-desk-ink hover:border-desk-ink hover:bg-desk-ink/6");
  const solid = cn(btn, "border-0 bg-seal text-cream hover:bg-seal-hover");
  const adjTip =
    sess >= 2
      ? "End this court session. You can resume later."
      : `Submit at least ${2 - sess} more argument${2 - sess === 1 ? "" : "s"} this session before adjourning`;

  return (
    <div
      className={cn(
        "relative mx-auto flex min-h-0 w-full max-w-360 flex-1 flex-col",
        mob ? "gap-2.5 px-3 pt-2.5 pb-3" : "gap-3 px-[3vw] pt-4 pb-4.5",
      )}
    >
      {/* Beside the title on wider screens (a long title wraps instead), so the record keeps the room. */}
      <div className={cn("flex items-end justify-between gap-x-6 gap-y-2.5", mob ? "flex-wrap" : "flex-nowrap")}>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Link
            href={`/cases/${cnr}/case-prep`}
            className="relative flex min-h-7 items-center gap-2 self-start text-xs tracking-[0.16em] text-desk-soft uppercase before:absolute before:-inset-x-1 before:-inset-y-2 before:content-[''] hover:text-desk-hover"
          >
            <span aria-hidden="true">←</span>
            <span>Case Prep</span>
          </Link>
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
            <h1 className={cn("m-0 font-display leading-[1.05] font-normal text-desk-ink", mob ? "text-[26px]" : "text-[32px]")}>
              {data.title}
            </h1>
            <span
              className={cn(
                "border-[1.5px] px-2.25 pt-1 pb-0.75 text-[10.5px] font-bold tracking-[0.18em] whitespace-nowrap uppercase",
                stC,
              )}
            >
              {stLabel}
            </span>
          </div>
          <span className="text-[13.5px] leading-[1.4] text-desk-muted">
            You are <strong className="text-desk-ink">{SIDE[me]}</strong> · <span className="font-data text-xs font-medium">{cnr}</span>
          </span>
        </div>
        <div
          className={cn(
            "min-w-0",
            grid ? "grid grid-cols-2 gap-1.5" : mob ? "flex flex-nowrap gap-1.5" : "flex flex-wrap gap-2",
            // On a line of their own (a long title), the buttons still sit at the right.
            small ? "flex-[1_1_100%]" : "ml-auto flex-none",
          )}
        >
          <button type="button" onClick={() => setCaseOpen(true)} className={outline}>
            Case file
          </button>
          {mob && (
            <button type="button" onClick={() => setWit(!witOpen)} className={outline}>
              {checksUp ? "Court’s checks" : onStand ? "On the stand" : "Witness stand"}
            </button>
          )}
          {canSeek && (
            <button
              type="button"
              onClick={() => void seekSettle()}
              aria-disabled={seeking}
              title="Ask the judge to adjourn so the parties can try to settle"
              className={outline}
            >
              {/* Short, so the toolbar fits on the title's row; the tooltip says it in full. */}
              {!mob && deedSigned ? "Deed signed · ask for time" : "Time to settle"}
            </button>
          )}
          {active && !view && (
            <button
              type="button"
              onClick={() => void adjourn()}
              aria-disabled={sess < 2}
              title={adjTip}
              className={cn(
                btn,
                "border bg-transparent hover:bg-[rgba(224,120,108,.08)]",
                sess >= 2 ? "border-amber-hi text-amber-hi light:border-amber light:text-amber" : "border-ink-disabled text-ink-disabled",
              )}
            >
              Adjourn
            </button>
          )}
          {adjourned && (
            <>
              <Link
                href={`/cases/${cnr}/settlement`}
                aria-disabled={!routeOpen}
                title={routeOpen ? "Negotiate a settlement while the court is adjourned" : "No settlement route is open for this case"}
                onClick={(e) => {
                  if (routeOpen) return;
                  e.preventDefault();
                  note("No settlement route is open for this case. At least one charge can’t be compounded or quashed on compromise.");
                }}
                className={cn(
                  outline,
                  "flex items-center justify-center",
                  !routeOpen && "cursor-not-allowed border-ink-disabled text-ink-disabled hover:border-ink-disabled hover:bg-transparent",
                )}
              >
                Settlement
              </Link>
              <button type="button" onClick={() => void resume()} className={solid}>
                Resume hearing →
              </button>
            </>
          )}
          {resolved && (
            <>
              {!mob && (
                <button type="button" onClick={() => setVerdictOpen(true)} className={solid}>
                  View verdict
                </button>
              )}
              <button type="button" onClick={openAnalysis} className={outline}>
                Case analysis
              </button>
            </>
          )}
        </div>
      </div>

      {view && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-x-4 gap-y-2 border border-[rgba(233,163,58,.5)] bg-[rgba(233,163,58,.08)] py-2.25 pr-2.25 pl-3.5 text-[13.5px] leading-[1.45] text-amber-hi light:text-amber"
        >
          <strong className="text-[10.5px] font-bold tracking-[0.18em] uppercase">Watching</strong>
          <span className="flex-[1_1_280px]">This hearing is being run from another device. You can follow the proceedings here.</span>
          <button
            type="button"
            onClick={() => void takeOver()}
            className="h-9 cursor-pointer border-0 bg-amber-hi px-3.5 text-[11px] font-bold tracking-[0.14em] whitespace-nowrap text-ink uppercase hover:bg-[#f2d89a]"
          >
            Take over the hearing
          </button>
        </div>
      )}

      <div
        ref={paperRef}
        className="relative grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] overflow-hidden bg-paper text-ink shadow-sheet motion-safe:transition-[grid-template-columns] motion-safe:duration-620 motion-safe:ease-[cubic-bezier(.65,0,.35,1)]"
        style={{
          gridTemplateColumns: !two ? "minmax(0,1fr)" : witOpen ? `minmax(0,1fr) ${w >= 1320 ? 460 : 400}px` : "minmax(0,1fr) 56px",
        }}
      >
        <section aria-label="Proceedings" className="flex min-h-0 min-w-0 flex-col">
          <Proceedings
            rows={buildRows(events)}
            ctx={ctx}
            open={og}
            onToggle={(id, open) => setOg((o) => ({ ...o, [id]: open }))}
            thinking={sending ? (heard ? "The court" : SIDE[ai]) : null}
            scRef={rec.ref}
            count={events.length}
          />
          <Composer
            mob={mob}
            canArgue={active && !view}
            closingAvail={closingAvail && !heard}
            mode={closingAvail && !heard ? mode : "arg"}
            label={heard ? "Your submission" : undefined}
            onMode={setMode}
            meta={`${sess} argument${sess === 1 ? "" : "s"} this session · ${limit ? limit.remaining_attempts : "—"} left today`}
            evidence={evidence}
            cite={cite}
            att={att}
            onAtt={setAtt}
            onExhibit={setXv}
            draft={draft}
            onDraft={setDraft}
            onSubmit={() => void submit()}
            placeholder={
              heard
                ? "Make your submission on the compromise…"
                : onStand
                  ? mob
                    ? "Witness on the stand"
                    : "A witness is on the stand"
                  : leave
                    ? mob
                      ? "Answer the witness request"
                      : "Respond to the request to call a witness above"
                    : closingMode
                      ? mob
                        ? "Sum up your case…"
                        : "Sum up your case for the court…"
                      : "Address the court…"
            }
            sendLabel={
              !online ? "Offline" : sending ? "Submitting…" : heard ? "Make submission" : closingMode ? "Deliver closing" : "Submit"
            }
            sendOff={busy || !!onStand}
            sendGrey={!online || busy || !!onStand}
            sendTip={onStand ? "A witness is on the stand. Finish with the witness before you address the court." : undefined}
            enterSubmits={enterKeySubmits}
            autoExpand={autoExpandTextAreas}
            mic={{ supported: micOk, listening, onToggle: toggleMic, onSoon: () => note("Voice input is coming in a future update.") }}
            note={composerNote}
            argRef={argRef}
            pickMax={() => roomAbove(paperRef.current, argRef.current)}
          />
        </section>

        {(two || witOpen || witClosing) && checksUp && deal?.profile && deal.attempt?.agreed && (
          <HearingRail
            profile={deal.profile}
            checks={checks}
            complainants={complainants}
            terms={deal.attempt.agreed}
            next={next}
            payments={settledHere ? deal.attempt.payments : []}
            userPays={!!deal.attempt.user_pays}
            busy={paying}
            onPay={(i) => void pay(i)}
            cnr={cnr}
            two={two}
            open={witOpen}
            closing={witClosing}
            wide={w >= 1320}
            onToggle={() => setWit(!witOpen)}
          />
        )}
        {(two || witOpen || witClosing) && !checksUp && (
          <WitnessStand
            two={two}
            open={witOpen}
            closing={witClosing}
            wide={w >= 1320}
            onToggle={() => setWit(!witOpen)}
            witness={
              onStand
                ? {
                    name: witnessName,
                    ini: initials(witnessName),
                    first: /^(Insp\.?|Inspector)\s/.test(witnessName) ? "The inspector" : firstName(witnessName),
                    sub: `${onStand.witness_role === "applicant" ? "Applicant" : "Non-applicant"} · Called by ${onStand.called_by === me ? "you" : SIDE[ai].replace("Counsel for the ", "the ")}`,
                  }
                : null
            }
            hist={hist}
            onObject={(id) => {
              const e = events.find((x) => x.id === id);
              if (e) openObj(e);
            }}
            held={!!obj}
            cands={cands}
            busyNote={busyNote}
            foot={foot}
            qDraft={qDraft}
            onQ={setQDraft}
            onAsk={() => void ask()}
            onNoMore={() => void finishTurn()}
            asking={!!asking}
            askOff={!!asking || !!typing || witBusy || !online}
            enterSubmits={enterKeySubmits}
            qRef={qRef}
            scRef={stand.ref}
            pickMax={() => roomAbove(qRef.current?.closest("aside") ?? null, qRef.current)}
            evidence={evidence}
            qAtt={qAtt}
            onQAtt={setQAtt}
            onExhibit={setXv}
          />
        )}
      </div>

      <CaseFilePanel
        open={caseOpen}
        onClose={() => setCaseOpen(false)}
        cnr={cnr}
        title={data.title}
        file={file}
        meta={[court, `Filed ${formatDate(data.created_at)}`, ...file.charges].filter(Boolean).join(" · ")}
        small={small}
      />
      <ObjectionDialog
        target={
          obj
            ? {
                kind: objKind(obj),
                who:
                  obj.type === T.LEAVE_REQUEST
                    ? `${SIDE[ai]} · request to call a witness`
                    : obj.type === T.WITNESS_EXAMINED_Q
                      ? `${SIDE[ai]} · question to the witness`
                      : `${SIDE[ai]} · AI`,
                text: obj.content,
              }
            : null
        }
        onClose={withdrawObj}
        onRaise={(g, d) => void raise(g, d)}
        small={small}
      />
      <ReportDialog target={rep} onClose={() => setRep(null)} onSend={sendReport} small={small} />
      <VerdictDialog
        open={verdictOpen && !!data.verdict}
        onClose={() => setVerdictOpen(false)}
        cnr={cnr}
        verdict={data.verdict ?? ""}
        outcome={data.outcome}
        meta={[court, judgment ? formatDate(judgment.timestamp) : ""].filter(Boolean).join(" · ")}
        reported={reported.has("verdict")}
        onReport={() => setRep({ id: "verdict", no: "Judgment", who: "The Court · Judgment", text: "The judgment of the court." })}
        onAnalyse={openAnalysis}
        small={small}
      />
      <AnalysisDialog
        open={analysisOpen}
        onClose={() => setAnalysisOpen(false)}
        state={onNegotiation ? (typeof negotiation === "object" ? { text: negotiation.review } : negotiation) : analysis}
        onRetry={() => void (onNegotiation ? fetchNegotiation() : fetchAnalysis())}
        outcome={data.outcome}
        tabs={tabs}
        tab={onNegotiation ? "negotiation" : "court"}
        onTab={(t) => showTab(t as "court" | "negotiation")}
        top={onNegotiation && typeof negotiation === "object" ? <NegotiationSummary n={negotiation} /> : null}
        {...(onNegotiation
          ? { title: "How you negotiated", loading: "Reviewing how you negotiated…" }
          : { title: "How you argued", loading: "Reviewing how you argued…" })}
        sub={`${SIDE[me]} · ${data.title}`}
        foot={[`Analysis generated on ${formatDate(judgment?.timestamp ?? data.created_at)}`, court]}
        small={small}
      />
      <ExhibitViewer
        evidence={evidence}
        openId={xv}
        onOpen={setXv}
        onClose={() => setXv(null)}
        parties={parties}
        mine={(p) => onSide(me, p)}
        onParty={() => setXv(null)}
        regen={regen}
        onRegen={(id) => void regenerate(id)}
        w={w}
      />
      <CallAlert alert={alert} small={small} />
      <Stamp kind={popup} small={small} />
    </div>
  );
}
