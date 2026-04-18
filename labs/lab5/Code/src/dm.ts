/*
NOTE: updated version (18 April 2026)
*/

import { assign, createActor, setup } from "xstate";
import type { Settings } from "speechstate";
import { speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY, NLU_KEY } from "./azure";
import type { DMContext, DMEvents } from "./types";

const inspector = createBrowserInspector();

const azureCredentials = {
  endpoint:
    "https://switzerlandnorth.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};

const azureLanguageCredentials = {
  endpoint: "https://language-resource-sougr.cognitiveservices.azure.com/language/:analyze-conversations?api-version=2024-11-15-preview",
  key: NLU_KEY,
  deploymentName: "appointment",
  projectName: "appointment",
};

const settings: Settings = {
  azureLanguageCredentials: azureLanguageCredentials,
  azureCredentials: azureCredentials,
  azureRegion: "switzerlandnorth",
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 5000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
};

function getConfirm(utterance: string): boolean | undefined {
  const u = utterance.toLowerCase();

  if (["yes", "totally", "of course", "sure", "yeah", "yep", "yup"].includes(u)) {
    return true;
  }

  if (["no", "no way", "nope", "nah", "uh uh", "no wait"].includes(u)) {
    return false;
  }

  return undefined;
}

const dmMachine = setup({
  types: {
    context: {} as DMContext,
    events: {} as DMEvents,
  },
  actions: {
    "spst.speak": ({ context }, params: { utterance: string }) =>
      context.ssRef.send({
        type: "SPEAK",
        value: { utterance: params.utterance },
      }),

    "spst.listen": ({ context }) =>
      context.ssRef.send({
        type: "LISTEN",
        value: { nlu: true },
      }),
  },
}).createMachine({
  context: ({ spawn }) => ({
    ssRef: spawn(speechstate, { input: settings }),
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
      entry: ({ context }) => context.ssRef.send({ type: "PREPARE" }),
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
                  const intent = context.interpretation?.topIntent;
                  return intent === "who is X" || intent === "create a meeting";
                },
                actions: assign(({ context }) => {
                  const entityPerson =
                    context.interpretation?.entities?.find(e =>
                      e.category.toLowerCase().includes("person")
                    );

                  return {
                    person: entityPerson?.text ?? null
                  };
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
                  const entityDay =
                    context.interpretation?.entities?.find(e =>
                      e.category.toLowerCase().includes("day")
                    );

                  return !!entityDay;
                },
                actions: assign(({ context }) => {
                  const entityDay =
                    context.interpretation?.entities?.find(e =>
                      e.category.toLowerCase().includes("day")
                    );

                  return {
                    day: entityDay?.text ?? null
                  };
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
                  actions: assign(({ event }) => ({
                    lastResult: event.value,
                    interpretation: event.nluValue
                  })),
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
                  actions: assign(({ event }) => ({
                    lastResult: event.value,
                    interpretation: event.nluValue
                  })),
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
                  const entityTime =
                    context.interpretation?.entities?.find(e =>
                      e.category.toLowerCase().includes("time")
                    );

                  return !!entityTime;
                },
                actions: assign(({ context }) => {
                  const entityTime =
                    context.interpretation?.entities?.find(e =>
                      e.category.toLowerCase().includes("time")
                    );

                  return {
                    time: entityTime?.text ?? null
                  };
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
                  actions: assign(({ event }) => ({
                    lastResult: event.value,
                    interpretation: event.nluValue
                  })),
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
                  actions: assign(({ event }) => ({
                    lastResult: event.value,
                    interpretation: event.nluValue
                  })),
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
                  actions: assign(({ event }) => ({
                    lastResult: event.value,
                    interpretation: event.nluValue
                  })),
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

export function setupButton(element: HTMLButtonElement) {
  element.addEventListener("click", () => {
    dmActor.send({ type: "CLICK" });
  });
  dmActor.subscribe((snapshot) => {
    const meta: { view?: string } =
      Object.values(snapshot.context.ssRef.getSnapshot().getMeta())[0] || {
        view: undefined,
      };
    element.innerHTML = `${meta.view}`;
  });
}