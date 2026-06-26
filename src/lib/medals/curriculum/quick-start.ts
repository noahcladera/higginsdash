import type { CeremonyCheckItem, QuickStartStep } from "./types";

export const QUICK_START_STEPS: QuickStartStep[] = [
  {
    step: 1,
    title: "New group? Same medal for everyone",
    body: "On a first session, start every child on the same medal (usually RWB or Yellow). Too easy is better than too hard.",
    href: "/coach/medals/rwb",
  },
  {
    step: 2,
    title: "Set medal levels after lesson 1 or 2",
    body: "Go to My Classes, open your roster, and set each child's medal. Parents see this in the portal.",
    href: "/coach/classes",
  },
  {
    step: 3,
    title: "Use the lesson plans every week",
    body: "Pick the track for your age group. Follow the timed blocks — warm-up, games, water break, technique.",
    href: "/coach/medals/lesson-plans",
  },
  {
    step: 4,
    title: "Medals day: check then ceremony",
    body: "Last class: run checkpoint drills (15 min), confirm each medal, hold the ceremony. Email the office your counts early.",
    href: "/coach/medals#ceremony",
  },
];

export const CEREMONY_CHECKLIST: CeremonyCheckItem[] = [
  {
    id: "checkpoints",
    label: "Run checkpoint drills during the last 15 minutes of class",
  },
  {
    id: "decide",
    label: "Decide each child's medal (same for everyone if new group's first season)",
  },
  {
    id: "counts",
    label: "Write down total medals and ribbon colors needed",
  },
  {
    id: "email",
    label: "Email the office so medals/ribbons ship before the last class",
  },
  {
    id: "ceremony",
    label: "Hold the medals ceremony on the last day of class",
  },
  {
    id: "roster",
    label: "Confirm all medal levels are set in Higgins rosters",
  },
];

export const FIVE_SKILLS = [
  {
    title: "Hand eye",
    body: "Learning to track the ball with your eyes.",
  },
  {
    title: "Bounce ups & downs",
    body: "Strength and coordination in the hands.",
  },
  {
    title: "Rally",
    body: "Rallying from the first levels onward.",
  },
  {
    title: "Drop-feed",
    body: "Core forehand and backhand technique.",
  },
  {
    title: "Game play",
    body: "Learn through play — excite kids about the sport.",
  },
] as const;
