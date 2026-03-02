import type { Hypothesis, SpeechStateExternalEvent } from "speechstate";
import type { ActorRef } from "xstate";

export type Expected = "person" | "day" | "time" | "confirm";

export interface DMContext {
  spstRef: ActorRef<any, any>;
  lastResult: Hypothesis[] | null;

  person: string | null;
  day: string | null;
  time: string | null;
  wholeDay: boolean | null;

  // Task 2 minimal additions
  expected: Expected;
  lastQuestion: string; // e.g. "AskName" | "AskDay" | ...
}

export type DMEvents =
  | SpeechStateExternalEvent
  | { type: "CLICK" }
  | { type: "DONE" };