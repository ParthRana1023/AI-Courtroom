// Groups the courtroom transcript so each witness's examination is one block
// (from being called to being dismissed) instead of many chat bubbles.

import {
  type CourtroomProceedingsEvent,
  CourtroomProceedingsEventType,
} from "@/types";

export interface WitnessSession<E extends CourtroomProceedingsEvent> {
  key: string;
  witnessId?: string;
  witnessName: string;
  calledEvent?: E; // missing for old AI-called witnesses that weren't logged
  events: E[]; // questions, answers and phase messages, in order
  dismissedEvent?: E; // set once the witness has left the stand
}

export type TranscriptItem<E extends CourtroomProceedingsEvent> =
  { kind: "event"; event: E } | { kind: "witness"; session: WitnessSession<E> };

const EXAMINATION_TYPES = new Set([
  CourtroomProceedingsEventType.WITNESS_EXAMINED_Q,
  CourtroomProceedingsEventType.WITNESS_EXAMINED_A,
]);

export function groupWitnessSessions<E extends CourtroomProceedingsEvent>(
  events: E[],
): TranscriptItem<E>[] {
  const items: TranscriptItem<E>[] = [];
  let open: WitnessSession<E> | null = null;

  const start = (event: E, called?: E): WitnessSession<E> => {
    const session: WitnessSession<E> = {
      key: event.id || `witness-${items.length}`,
      witnessId: event.witness_id,
      witnessName: called?.speaker_name || "",
      calledEvent: called,
      events: [],
    };
    items.push({ kind: "witness", session });
    return session;
  };

  for (const event of events) {
    if (event.type === CourtroomProceedingsEventType.WITNESS_CALLED) {
      open = start(event, event);
    } else if (EXAMINATION_TYPES.has(event.type)) {
      if (!open || (event.witness_id && open.witnessId !== event.witness_id)) {
        open = start(event);
      }
      open.events.push(event);
      if (
        !open.witnessName &&
        event.type === CourtroomProceedingsEventType.WITNESS_EXAMINED_A
      ) {
        open.witnessName = event.speaker_name || "";
      }
    } else if (
      event.type === CourtroomProceedingsEventType.WITNESS_DISMISSED &&
      open
    ) {
      open.dismissedEvent = event;
      open = null;
    } else if (
      event.type === CourtroomProceedingsEventType.SYSTEM_MESSAGE &&
      open
    ) {
      open.events.push(event); // e.g. "Cross-examination completed."
    } else {
      items.push({ kind: "event", event });
    }
  }

  return items;
}

export function countQuestions<E extends CourtroomProceedingsEvent>(
  session: WitnessSession<E>,
): number {
  return session.events.filter(
    (event) => event.type === CourtroomProceedingsEventType.WITNESS_EXAMINED_Q,
  ).length;
}
