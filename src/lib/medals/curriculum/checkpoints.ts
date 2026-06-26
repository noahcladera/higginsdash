import type { MedalLevel } from "@prisma/client";
import type { MedalCurriculumLevel } from "./types";

export const MEDAL_CURRICULUM: MedalCurriculumLevel[] = [
  {
    medalLevel: "rwb",
    title: "Red White Blue",
    shortCode: "RWB",
    typicalAge: "Entry (new players)",
    ribbonColors: "Red, white & blue",
    lessonTrackId: "ages-4-7",
    checkpoints: [
      { part: 1, label: "Hand / eye", requirement: "Introduction to tracking the ball" },
      { part: 2, label: "Ups & downs", requirement: "Basic bounce ups and downs" },
      { part: 3, label: "Drop feed", requirement: "Intro to drop-feed forehand" },
      { part: 4, label: "Rally", requirement: "Intro to partner bounce catch" },
      { part: 5, label: "Game play", requirement: "Catch the Mice, class routines" },
    ],
    graduateTo: "10 bounce catch total (Yellow checkpoint)",
    drills: ["Follow the Leader", "Walk the Dog", "Catch the Mice", "Sweep the Mice"],
    technicalFocus: [
      "New groups: start everyone on the same medal",
      "Learn names, rules, and talk about earning medals",
    ],
  },
  {
    medalLevel: "yellow",
    title: "Yellow",
    shortCode: "Y",
    typicalAge: "4–6",
    ribbonColors: "Yellow (sort of orange-ish)",
    lessonTrackId: "ages-4-7",
    checkpoints: [
      { part: 1, label: "Hand / eye", requirement: "10 bounce catch total" },
      { part: 2, label: "Ups & downs", requirement: "10 bounce ups total" },
      { part: 3, label: "Drop feed", requirement: "5 drop feed FH & BH forward" },
      { part: 4, label: "Rally", requirement: "Know how to do a hockey rally" },
      { part: 5, label: "Game play", requirement: "Catch & sweep the mice" },
    ],
    graduateTo: "10 partner bounce catch total (Purple)",
    drills: ["Bounce catch", "Bounce ups", "Hockey rally", "Catch & Sweep the Mice"],
    technicalFocus: [
      "Ready position: dominant hand on bottom, sideways for FH/BH, follow through",
    ],
  },
  {
    medalLevel: "purple",
    title: "Purple",
    shortCode: "P",
    typicalAge: "4–6",
    ribbonColors: "Purple",
    lessonTrackId: "ages-4-7",
    checkpoints: [
      { part: 1, label: "Hand / eye", requirement: "10 partner bounce catch total" },
      { part: 2, label: "Ups & downs", requirement: "20 bounce ups & downs total" },
      { part: 3, label: "Drop feed", requirement: "6 drop feed FH & BH forward" },
      { part: 4, label: "Rally", requirement: "10 ball hockey rally total" },
      { part: 5, label: "Game play", requirement: "Feed the Monkeys" },
    ],
    graduateTo: "20 bounce ups total (Blue 1)",
    drills: ["Partner bounce catch", "Feed the Monkeys", "Hockey rally"],
    technicalFocus: ["Tree and River: palm up for ups, palm down for downs"],
  },
  {
    medalLevel: "blue_1",
    title: "Blue 1",
    shortCode: "B1",
    typicalAge: "5–7",
    ribbonColors: "Solid blue (not half-and-half)",
    lessonTrackId: "ages-4-7",
    checkpoints: [
      { part: 1, label: "Hand / eye", requirement: "20 bounce ups total" },
      { part: 2, label: "Ups & downs", requirement: "20 downs total" },
      { part: 3, label: "Drop feed", requirement: "6 drop-feed alternating FH & BH over net" },
      { part: 4, label: "Rally", requirement: "10 ball hockey rally in a row" },
      { part: 5, label: "Game play", requirement: "Train with fast ball pick up" },
    ],
    graduateTo: "20 bounce ups and downs in a row + Crazy Tennis Levels 1–3 (Blue 2)",
    drills: ["Drop-feed alternating FH/BH", "Hockey rally (10 in a row)", "Train game"],
    technicalFocus: ["Perfect form for drop-feed: step and hit, follow-through"],
  },
  {
    medalLevel: "blue_2",
    title: "Blue 2",
    shortCode: "B2",
    typicalAge: "5–8",
    ribbonColors: "Blue & yellow (half blue / half yellow)",
    lessonTrackId: "blue-2-red-2",
    checkpoints: [
      {
        part: 1,
        label: "Hand / eye or rally",
        requirement: "20 bounce ups & downs in a row; Crazy Tennis Levels 1–3",
      },
      { part: 2, label: "Hit & catch", requirement: "10 bounce ups w/partner total" },
      { part: 3, label: "Hit & recover", requirement: "Hit & Recover: 3 of 6 forward" },
      { part: 4, label: "Serve", requirement: "5 serves over net" },
      {
        part: 5,
        label: "Game play",
        requirement: "Hit/catch & rally; Team tennis hit & recover; Skyball",
      },
    ],
    graduateTo:
      "Crazy Tennis Levels 1–7, 20 bounce ups with partner in a row, game to 4 (Red 1)",
    drills: ["Skyball", "Partner bounce ups", "Serve progressions (Five Alive, Tap Hit)"],
    technicalFocus: ["Perfect form for drop-feed, step and hit", "Introduction to Skyball"],
  },
  {
    medalLevel: "red_1",
    title: "Red 1",
    shortCode: "R1",
    typicalAge: "6–8",
    ribbonColors: "Red",
    lessonTrackId: "blue-2-red-2",
    tournamentNote: "Must have Red 1 medal to play a tournament",
    checkpoints: [
      {
        part: 1,
        label: "Hand / eye or rally",
        requirement:
          "Crazy Tennis Levels 1–7; 20 bounce ups with partner in a row; game to 4",
      },
      { part: 2, label: "Hit & catch", requirement: "10 hit-catch FH & BH, then rally" },
      {
        part: 3,
        label: "Hit & recover",
        requirement: "Hit & Recover: 3 of 6 FH in & BH 3 of 6 over net",
      },
      { part: 4, label: "Serve", requirement: "5 serves in a row in red court" },
      {
        part: 5,
        label: "Game play",
        requirement: "Skyball countdown; Big Kahuna, Lobster Bump; know how to score a game",
      },
    ],
    graduateTo: "8 ball rally (Red 2)",
    drills: ["Skyball", "Big Kahuna", "Lobster Bump"],
    technicalFocus: [
      "Rally with recovering to ready position — kids moving at all times",
      "Full swings with follow-through and beginning circular swing",
    ],
  },
  {
    medalLevel: "red_2",
    title: "Red 2",
    shortCode: "R2",
    typicalAge: "6–8",
    ribbonColors: "Red & yellow",
    lessonTrackId: "blue-2-red-2",
    checkpoints: [
      { part: 1, label: "Rally", requirement: "8 ball rally" },
      {
        part: 2,
        label: "Hit & catch",
        requirement: "10 hit-catch alternating FH and BH, then rally",
      },
      { part: 3, label: "Hit & recover", requirement: "Hit & Recover: 5 of 6 in FH and BH" },
      { part: 4, label: "Serve", requirement: "3 out of 5 serves inbounds" },
      { part: 5, label: "Game play", requirement: "Score a set in doubles" },
    ],
    graduateTo: "8 ball rally at Orange 1 (higher game-play bar)",
    drills: ["Doubles scoring", "Serve inbounds drills"],
    technicalFocus: [
      "From Red 2 onward: focus on serve, stroke timing, and perfect technique",
      "Proper grips and circular swing",
    ],
  },
  {
    medalLevel: "orange_1",
    title: "Orange 1",
    shortCode: "O1",
    typicalAge: "8–12",
    ribbonColors: "Orange",
    lessonTrackId: "ages-7-13",
    tournamentNote: "Must have Orange 1 medal to play a tournament",
    checkpoints: [
      { part: 1, label: "Rally", requirement: "8 ball rally" },
      { part: 2, label: "Hit & catch", requirement: "10 hit catch FH & BH, then rally" },
      { part: 3, label: "Hit & recover", requirement: "Hit & Recover: 3 of 6 FH and BH in" },
      { part: 4, label: "Serve", requirement: "4 out of 5 serves in a row ad/deuce" },
      {
        part: 5,
        label: "Game play",
        requirement: "Bump with 1 or 2 bounces only; sportsmanship",
      },
    ],
    graduateTo: "12 ball rally (Orange 2)",
    drills: ["Bump (1 or 2 bounces)", "Ad/deuce serve practice"],
    technicalFocus: ["Full swings, proper grips", "Recovering to ready position"],
  },
  {
    medalLevel: "orange_2",
    title: "Orange 2",
    shortCode: "O2",
    typicalAge: "8–12",
    ribbonColors: "Orange & black",
    lessonTrackId: "ages-7-13",
    checkpoints: [
      { part: 1, label: "Rally", requirement: "12 ball rally" },
      {
        part: 2,
        label: "Hit & catch",
        requirement: "10 hit-catch alternating FH and BH, then rally",
      },
      { part: 3, label: "Hit & recover", requirement: "Hit & Recover: 5 of 6 in FH and BH" },
      { part: 4, label: "Serve", requirement: "Continues from Orange 1 progression" },
      { part: 5, label: "Game play", requirement: "Skyball countdown; full game play" },
    ],
    graduateTo: "16 ball rally (Green 1)",
    drills: ["Skyball", "12-ball rally drills"],
    technicalFocus: ["Sportsmanship and full game play"],
  },
  {
    medalLevel: "green_1",
    title: "Green 1",
    shortCode: "G1",
    typicalAge: "9–12",
    ribbonColors: "Green",
    lessonTrackId: "ages-7-13",
    checkpoints: [
      { part: 1, label: "Rally", requirement: "16 ball rally" },
      { part: 2, label: "Hit & catch", requirement: "10 hit-catch FH & BH, then rally" },
      {
        part: 3,
        label: "Hit & recover",
        requirement: "Hit & Recover: 4 of 6 FH in, 4 of 6 BH over net",
      },
      { part: 4, label: "Serve", requirement: "3 out of 5 serves inbounds; continental grip" },
      {
        part: 5,
        label: "Game play",
        requirement: "Play 2 full sets on your own; full serve",
      },
    ],
    graduateTo: "30 ball rally (Green 2)",
    drills: ["Volley step with opposite leg", "Continental grip serves"],
    technicalFocus: ["Full swings with circular swing", "Volley introduction"],
  },
  {
    medalLevel: "green_2",
    title: "Green 2",
    shortCode: "G2",
    typicalAge: "11–16",
    ribbonColors: "Green",
    lessonTrackId: "ages-7-13",
    checkpoints: [
      { part: 1, label: "Rally", requirement: "30 ball rally" },
      {
        part: 2,
        label: "Hit & catch",
        requirement: "10 hit-catch alternating FH and BH",
      },
      {
        part: 3,
        label: "Hit & recover",
        requirement: "Hit & Recover: 5 of 6 FH in, 5 of 6 BH over net",
      },
      {
        part: 4,
        label: "Serve",
        requirement: "4 out of 5 serves in ad & deuce court in continental grip",
      },
      { part: 5, label: "Game play", requirement: "Play 4 full sets on your own" },
    ],
    graduateTo: "Silver: 40-ball rally with topspins (see requirements PDF)",
    drills: ["Backhand rally cross-court", "Volley/volley rally", "Split step intro"],
    technicalFocus: ["Intro to split step", "Continental grip mastery"],
  },
];

const BY_LEVEL = new Map(
  MEDAL_CURRICULUM.map((row) => [row.medalLevel, row]),
);

export function getMedalCurriculum(level: MedalLevel): MedalCurriculumLevel {
  const row = BY_LEVEL.get(level);
  if (!row) throw new Error(`Unknown medal level: ${level}`);
  return row;
}

export function getAllMedalCurriculum(): MedalCurriculumLevel[] {
  return MEDAL_CURRICULUM;
}

export function isMedalLevel(value: string): value is MedalLevel {
  return BY_LEVEL.has(value as MedalLevel);
}

/** Build parent-facing long description from curriculum. */
export function curriculumLongDescription(level: MedalCurriculumLevel): string {
  const lines = level.checkpoints.map(
    (c) => `${c.part}. ${c.label}: ${c.requirement}`,
  );
  if (level.drills.length > 0) {
    lines.push("", "Key drills: " + level.drills.join(", "));
  }
  return lines.join("\n");
}
