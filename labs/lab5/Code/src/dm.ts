// NOTE: While I attempted to complete all of the steps described in the task, 
// I struggled to employ the use of the CLU service due to an apparent security issue.
// Direct browser calls to the Azure Language API seem to be blocked
// by CORS in the current Azure configuration - as far as I can tell -
// so the dialogue system falls back to the Lab 3 grammar 
// while logging the attempted NLU result.

import { assign, createActor, setup } from "xstate";
import type { Settings } from "speechstate";
import { speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY, NLU_KEY } from "./azure";
import type { DMContext, DMEvents } from "./types";

const inspector = createBrowserInspector();

const azureCredentials = {
  endpoint:
    "https://norwayeast.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};

// NOTE: While I attempted to complete all of the steps described in the task, 
// I struggled to employ the use of the CLU service due to an apparent security issue.
// Direct browser calls to the Azure Language API seem to be blocked
// by CORS in the current Azure configuration - as far as I can tell -
// so the dialogue system falls back to the Lab 3 grammar 
// while logging the attempted NLU result.

const azureLanguageCredentials = {
  endpoint: "https://language-resource-sougr.cognitiveservices.azure.com/",
  key: NLU_KEY,
  deploymentName: "appointment",
  projectName: "appointment",
};

const settings: Settings = {
  azureLanguageCredentials: azureLanguageCredentials,
  azureCredentials: azureCredentials,
  azureRegion: "norwayeast",
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 5000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
};

interface GrammarEntry {
  person?: string;
  day?: string;
  time?: string;
  confirm?: boolean;
}

const grammar: { [index: string]: GrammarEntry } = {
  vlad: { person: "Vladislav Maraev" },
  bora: { person: "Bora Kara" },
  tal: { person: "Talha Bedir" },
  tom: { person: "Tom Södahl Bladsjö" },
  greg: { person: "Greg Soulliere" },
  nobody: { person: "nobody" },
  "no one": { person: "no one" },
  anyone: { person: "anyone" },
  monday: { day: "Monday" },
  tuesday: { day: "Tuesday" },
  wednesday: { day: "Wednesday" },
  thursday: { day: "Thursday" },
  friday: { day: "Friday" },
  saturday: { day: "Saturday" },
  sunday: { day: "Sunday" },
  "9": { time: "9:00" },
  "10": { time: "10:00" },
  "11": { time: "11:00" },
  "12": { time: "12:00" },
  "13": { time: "13:00" },
  "1": { time: "1:00 pm" },
  "14": { time: "14:00" },
  "2": { time: "2:00 pm" },
  "15": { time: "15:00" },
  "3": {time: "3:00 pm" },
  "16": { time: "16:00" },
  "4": { time: "4:00 pm" },
  yes: { confirm: true },
  totally: { confirm: true },
  "of course": { confirm: true },
  sure: { confirm: true },
  yeah: { confirm: true },
  yep: { confirm: true },
  yup: { confirm: true },
  no: { confirm: false },
  "no way": { confirm: false },
  nope: { confirm: false },
  nah: { confirm: false },
  "uh uh": { confirm: false },
  "no wait": { confirm: false },
};

function getPerson(utterance: string) {
  return (grammar[utterance.toLowerCase()] || {}).person;
}
function getDay(utterance: string) {
  return (grammar[utterance.toLowerCase()] || {}).day;
}
function getTime(utterance: string) {
  return (grammar[utterance.toLowerCase()] || {}).time;
}
function getConfirm(utterance: string): boolean | undefined {
  return (grammar[utterance.toLowerCase()] || {}).confirm;
}

const dmMachine = setup({
  types: {
    context: {} as DMContext,
    events: {} as DMEvents,
  },
  actions: {
    "spst.speak": ({ context }, params: { utterance: string }) =>
      context.spstRef.send({
        type: "SPEAK",
        value: { utterance: params.utterance },
      }),

    "spst.listen": ({ context }) =>
      context.spstRef.send({
        type: "LISTEN",
        value: { nlu: true },
      }),
  },
}).createMachine({
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }),
    lastResult: null,
    interpretation: null,
    person: null,
    day: null,
    time: null,
    wholeDay: null,
    expected: "person",
    lastQuestion: "AskName",
  }),
  id: "DM",
  initial: "Prepare",
  states: {
    Prepare: {
      entry: ({ context }) => context.spstRef.send({ type: "PREPARE" }),
      on: { ASRTTS_READY: "WaitToStart" },
    },
    WaitToStart: {
      on: { CLICK: "Appointment" },
    },
    Appointment: {
      initial: "Intro",
      on: {
        LISTEN_COMPLETE: [
          {
            target: ".NoInput",
            guard: ({ context }) => !context.lastResult,
          },
          {
            target: ".Invalid",
          },
        ],
      },
      states: {
        Intro: {
          entry: {
            type: "spst.speak",
            params: { utterance: `Let's create an appointment!` },
          },
          on: { SPEAK_COMPLETE: "AskName" },
        },
        NoInput: {
          entry: { type: "spst.speak", params: { utterance: `I couldn't hear you.` } },
          on: { SPEAK_COMPLETE: "Return" },
        },
        Invalid: {
          entry: {
            type: "spst.speak",
            params: ({ context }) => ({
              utterance:
                context.expected === "person"
                  ? "That is not a valid name."
                  : context.expected === "day"
                  ? "That is not a valid day."
                  : context.expected === "time"
                  ? "That is not a valid time."
                  : "Please say yes or no.",
            }),
          },
          on: { SPEAK_COMPLETE: "Return" },
        },
        Return: {
          always: [
            { guard: ({ context }) => context.lastQuestion === "AskName", target: "AskName.Prompt" },
            { guard: ({ context }) => context.lastQuestion === "AskDay", target: "AskDay.Prompt" },
            { guard: ({ context }) => context.lastQuestion === "AskWholeDay", target: "AskWholeDay.Prompt" },
            { guard: ({ context }) => context.lastQuestion === "AskTime", target: "AskTime.Prompt" },
            { guard: ({ context }) => context.lastQuestion === "ConfirmWholeDay", target: "ConfirmWholeDay.Prompt" },
            { guard: ({ context }) => context.lastQuestion === "ConfirmWithTime", target: "ConfirmWithTime.Prompt" },
            { target: "AskName.Prompt" },
          ],
        },
        AskName: {
          entry: assign({ expected: "person", lastQuestion: "AskName" }),
          initial: "Prompt",
          on: {
            LISTEN_COMPLETE: [
              {
                target: "#DM.Appointment.AskDay",
                guard: ({ context }) => {
                  const utterance = context.lastResult?.[0]?.utterance;
                  return !!(utterance && getPerson(utterance));
                },
                actions: assign(({ context }) => {
                  const utterance = context.lastResult?.[0]?.utterance;
                  return { person: getPerson(utterance!) ?? null };
                }),
              },
            ],
          },
          states: {
            Prompt: {
              entry: {
                type: "spst.speak",
                params: { utterance: `Who are you meeting with?` },
              },
              on: { SPEAK_COMPLETE: "Listen" },
            },
            Listen: {
              entry: { type: "spst.listen" },
              on: {
                RECOGNISED: {
                  actions: assign(({ event }) => {
  console.log("NLU RESULT:", event.nluValue);
  return {
    lastResult: event.value,
    interpretation: event.nluValue
  };
}),
                },
                ASR_NOINPUT: {
                  actions: assign({ lastResult: null }),
                },
              },
            },
          },
        },
        AskDay: {
          entry: assign({ expected: "day", lastQuestion: "AskDay" }),
          initial: "Prompt",
          on: {
            LISTEN_COMPLETE: [
              {
                target: "#DM.Appointment.AskWholeDay",
                guard: ({ context }) => {
                  const utterance = context.lastResult?.[0]?.utterance;
                  return !!(utterance && getDay(utterance));
                },
                actions: assign(({ context }) => {
                  const utterance = context.lastResult?.[0]?.utterance;
                  return { day: getDay(utterance!) ?? null };
                }),
              },
            ],
          },
          states: {
            Prompt: {
              entry: {
                type: "spst.speak",
                params: { utterance: `On which day is your meeting?` },
              },
              on: { SPEAK_COMPLETE: "Listen" },
            },
            Listen: {
              entry: { type: "spst.listen" },
              on: {
                RECOGNISED: {
                  actions: assign(({ event }) => {
  console.log("NLU RESULT:", event.nluValue);
  return {
    lastResult: event.value,
    interpretation: event.nluValue
  };
}),
                },
                ASR_NOINPUT: {
                  actions: assign({ lastResult: null }),
                },
              },
            },
          },
        },
        AskWholeDay: {
          entry: assign({ expected: "confirm", lastQuestion: "AskWholeDay" }),
          initial: "Prompt",

          on: {
            LISTEN_COMPLETE: [
              {
                target: "#DM.Appointment.ConfirmWholeDay",
                guard: ({ context }) => {
                  const utterance = context.lastResult?.[0]?.utterance;
                  if (!utterance) return false;
                  return getConfirm(utterance) === true;
                },
                actions: assign({ wholeDay: true }),
              },
              {
                target: "#DM.Appointment.AskTime",
                guard: ({ context }) => {
                  const utterance = context.lastResult?.[0]?.utterance;
                  if (!utterance) return false;
                  return getConfirm(utterance) === false;
                },
                actions: assign({ wholeDay: false }),
              },
            ],
          },
          states: {
            Prompt: {
              entry: {
                type: "spst.speak",
                params: { utterance: `Will it take the whole day?` },
              },
              on: { SPEAK_COMPLETE: "Listen" },
            },
            Listen: {
              entry: { type: "spst.listen" },
              on: {
                RECOGNISED: {
                  actions: assign(({ event }) => {
  console.log("NLU RESULT:", event.nluValue);
  return {
    lastResult: event.value,
    interpretation: event.nluValue
  };
}),
                },
                ASR_NOINPUT: {
                  actions: assign({ lastResult: null }),
                },
              },
            },
          },
        },
        AskTime: {
          entry: assign({ expected: "time", lastQuestion: "AskTime" }),
          initial: "Prompt",

          on: {
            LISTEN_COMPLETE: [
              {
                target: "#DM.Appointment.ConfirmWithTime",
                guard: ({ context }) => {
                  const utterance = context.lastResult?.[0]?.utterance;
                  return !!(utterance && getTime(utterance));
                },
                actions: assign(({ context }) => {
                  const utterance = context.lastResult?.[0]?.utterance;
                  return { time: getTime(utterance!) ?? null };
                }),
              },
            ],
          },
          states: {
            Prompt: {
              entry: {
                type: "spst.speak",
                params: { utterance: `What time is your meeting?` },
              },
              on: { SPEAK_COMPLETE: "Listen" },
            },
            Listen: {
              entry: { type: "spst.listen" },
              on: {
                RECOGNISED: {
                  actions: assign(({ event }) => {
  console.log("NLU RESULT:", event.nluValue);
  return {
    lastResult: event.value,
    interpretation: event.nluValue
  };
}),
                },
                ASR_NOINPUT: {
                  actions: assign({ lastResult: null }),
                },
              },
            },
          },
        },
        ConfirmWholeDay: {
          entry: assign({ expected: "confirm", lastQuestion: "ConfirmWholeDay" }),
          initial: "Prompt",

          on: {
            LISTEN_COMPLETE: [
              {
                target: "#DM.Created",
                guard: ({ context }) => {
                  const utterance = context.lastResult?.[0]?.utterance;
                  return !!(utterance && getConfirm(utterance) === true);
                },
              },
              {
                target: "#DM.Appointment",
                guard: ({ context }) => {
                  const utterance = context.lastResult?.[0]?.utterance;
                  return !!(utterance && getConfirm(utterance) === false);
                },
              },
            ],
          },
          states: {
            Prompt: {
              entry: {
                type: "spst.speak",
                params: ({ context }) => ({
                  utterance: `Do you want me to create an appointment with ${context.person} on ${context.day} for the whole day?`,
                }),
              },
              on: { SPEAK_COMPLETE: "Listen" },
            },
            Listen: {
              entry: { type: "spst.listen" },
              on: {
                RECOGNISED: {
                  actions: assign(({ event }) => {
  console.log("NLU RESULT:", event.nluValue);
  return {
    lastResult: event.value,
    interpretation: event.nluValue
  };
}),
                },
                ASR_NOINPUT: {
                  actions: assign({ lastResult: null }),
                },
              },
            },
          },
        },
        ConfirmWithTime: {
          entry: assign({ expected: "confirm", lastQuestion: "ConfirmWithTime" }),
          initial: "Prompt",

          on: {
            LISTEN_COMPLETE: [
              {
                target: "#DM.Created",
                guard: ({ context }) => {
                  const utterance = context.lastResult?.[0]?.utterance;
                  if (!utterance) return false;
                  return getConfirm(utterance) === true;
                },
              },
              {
                target: "#DM.Appointment",
                guard: ({ context }) => {
                  const utterance = context.lastResult?.[0]?.utterance;
                  if (!utterance) return false;
                  return getConfirm(utterance) === false;
                },
              },
            ],
          },
          states: {
            Prompt: {
              entry: {
                type: "spst.speak",
                params: ({ context }) => ({
                  utterance: `Do you want me to create an appointment with ${context.person} on ${context.day} at ${context.time}?`,
                }),
              },
              on: { SPEAK_COMPLETE: "Listen" },
            },
            Listen: {
              entry: { type: "spst.listen" },
              on: {
                RECOGNISED: {
                  actions: assign(({ event }) => {
  console.log("NLU RESULT:", event.nluValue);
  return {
    lastResult: event.value,
    interpretation: event.nluValue
  };
}),
                },
                ASR_NOINPUT: {
                  actions: assign({ lastResult: null }),
                },
              },
            },
          },
        },
      },
    },
    Created: {
      entry: {
        type: "spst.speak",
        params: { utterance: `Your appointment has been created!` },
      },
      on: { SPEAK_COMPLETE: "Done" },
    },
    Done: {
      on: { CLICK: "Appointment" },
    },
  },
});

const dmActor = createActor(dmMachine, {
  inspect: inspector.inspect,
}).start();

dmActor.subscribe((state) => {
  console.group("State update");
  console.log("State value:", state.value);
  console.log("State context:", state.context);
  console.groupEnd();
});

export function setupButton(element: HTMLButtonElement) {
  element.addEventListener("click", () => {
    dmActor.send({ type: "CLICK" });
  });
  dmActor.subscribe((snapshot) => {
    const meta: { view?: string } =
      Object.values(snapshot.context.spstRef.getSnapshot().getMeta())[0] || {
        view: undefined,
      };
    element.innerHTML = `${meta.view}`;
  });
}