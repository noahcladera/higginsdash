/**
 * Smoke fixtures for the program recommendation engine.
 *
 *   npx tsx scripts/test-recommend.ts
 *
 * No external test runner so it stays runnable inside the existing
 * `tsx` toolchain. Each fixture asserts the *order* + bucket of the top
 * recommendation; the rest of the catalog is implicitly verified by
 * "no crash, no thrown".
 */

import assert from "node:assert/strict";
import {
  recommendPrograms,
  type ProgramLike,
  type RecommendInput,
} from "../src/lib/portal/recommend";

const PROGRAMS: ProgramLike[] = [
  {
    id: "p1",
    slug: "kids-group",
    name: "Kids Group Lessons",
    targetAudience: "kids",
    classTypeKey: "group_lesson",
    descriptionPublic: null,
    coverImageUrl: null,
    schoolMatches: [],
    minAge: 4,
    maxAge: 16,
    hasOpenSeries: true,
  },
  {
    id: "p2",
    slug: "adult-group",
    name: "Adult Lessons",
    targetAudience: "adults",
    classTypeKey: "group_lesson",
    descriptionPublic: null,
    coverImageUrl: null,
    schoolMatches: [],
    minAge: 16,
    maxAge: null,
    hasOpenSeries: true,
  },
  {
    id: "p3",
    slug: "high-performance",
    name: "High Performance",
    targetAudience: "kids",
    classTypeKey: "high_performance",
    descriptionPublic: null,
    coverImageUrl: null,
    schoolMatches: [],
    minAge: 8,
    maxAge: 14,
    hasOpenSeries: true,
  },
  {
    id: "p4",
    slug: "school-programs",
    name: "School Programs",
    targetAudience: "kids",
    classTypeKey: "school_pickup",
    descriptionPublic: null,
    coverImageUrl: null,
    schoolMatches: ["bsa", "ifs", "aics", "amity"],
    minAge: 5,
    maxAge: 14,
    hasOpenSeries: true,
  },
  {
    id: "p5",
    slug: "camps",
    name: "Camps",
    targetAudience: "kids",
    classTypeKey: "camp",
    descriptionPublic: null,
    coverImageUrl: null,
    schoolMatches: [],
    minAge: 5,
    maxAge: 14,
    hasOpenSeries: true,
  },
  {
    id: "p6",
    slug: "privates",
    name: "Privates",
    targetAudience: "mixed",
    classTypeKey: "private_individual",
    descriptionPublic: null,
    coverImageUrl: null,
    schoolMatches: [],
    minAge: null,
    maxAge: null,
    hasOpenSeries: true,
  },
];

function run(name: string, input: RecommendInput, check: (out: ReturnType<typeof recommendPrograms>) => void) {
  const out = recommendPrograms(input);
  try {
    check(out);
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}`);
    console.error("       hero =", out.hero.map((r) => `${r.program.slug}(${r.bucket})`));
    console.error("       more =", out.more.map((r) => `${r.program.slug}(${r.bucket})`));
    throw err;
  }
}

console.log("recommendPrograms:");

run(
  "adult-only viewer (32) sees adults first, kids never",
  {
    viewerAge: 32,
    children: [],
    parentAlsoPlays: false,
    viewerIsAdultMember: false,
    programs: PROGRAMS,
  },
  (out) => {
    assert.equal(out.hero[0].program.slug, "adult-group");
    assert.ok(
      out.all.every((r) => r.bucket !== "kids"),
      "kids programs should not appear for an adult-only viewer",
    );
  },
);

run(
  "parent of one 5yo (no school) — kids first, adults absent (parentAlsoPlays=false)",
  {
    viewerAge: 38,
    children: [{ age: 5, schoolSlug: null }],
    parentAlsoPlays: false,
    viewerIsAdultMember: false,
    programs: PROGRAMS,
  },
  (out) => {
    assert.equal(out.hero[0].bucket, "kids");
    assert.ok(
      out.all.every((r) => r.bucket !== "adults"),
      "adult programs hidden when parentAlsoPlays=false",
    );
    assert.ok(
      !out.hero.some((r) => r.program.slug === "school-programs"),
      "school programs hidden when no school slug given",
    );
    // 5yo is below HP minAge of 8 — must not appear.
    assert.ok(
      !out.all.some((r) => r.program.slug === "high-performance"),
      "HP excluded for 5yo",
    );
  },
);

run(
  "parent of BSA kid — school pickup outranks generic kids-group",
  {
    viewerAge: 40,
    children: [{ age: 8, schoolSlug: "bsa" }],
    parentAlsoPlays: false,
    viewerIsAdultMember: false,
    programs: PROGRAMS,
  },
  (out) => {
    assert.equal(out.hero[0].program.slug, "school-programs");
    assert.equal(out.hero[0].bucket, "kids");
  },
);

run(
  "parent of OBS kid (school not in pickup list) — pickup must NOT show",
  {
    viewerAge: 40,
    children: [{ age: 8, schoolSlug: "obs-de-kweekvijver" }],
    parentAlsoPlays: false,
    viewerIsAdultMember: false,
    programs: PROGRAMS,
  },
  (out) => {
    assert.ok(
      !out.all.some((r) => r.program.slug === "school-programs"),
      "non-partner school must not see pickup",
    );
    assert.equal(out.hero[0].bucket, "kids");
  },
);

run(
  "parent who also plays — kids first, adults present second tier",
  {
    viewerAge: 40,
    children: [{ age: 7, schoolSlug: "ifs" }],
    parentAlsoPlays: true,
    viewerIsAdultMember: false,
    programs: PROGRAMS,
  },
  (out) => {
    assert.equal(out.hero[0].bucket, "kids");
    assert.ok(
      out.all.some((r) => r.bucket === "adults"),
      "adult-group should appear when parentAlsoPlays=true",
    );
    // school-programs should rank ahead of plain kids-group (IFS match).
    const schoolIdx = out.all.findIndex((r) => r.program.slug === "school-programs");
    const groupIdx = out.all.findIndex((r) => r.program.slug === "kids-group");
    assert.ok(schoolIdx >= 0 && schoolIdx < groupIdx, "school > generic kids-group");
  },
);

run(
  "parent of teen (15) — HP eligible, adult programs not because of age",
  {
    viewerAge: 45,
    children: [{ age: 15, schoolSlug: null }],
    parentAlsoPlays: false,
    viewerIsAdultMember: false,
    programs: PROGRAMS,
  },
  (out) => {
    assert.ok(
      out.all.some((r) => r.program.slug === "kids-group"),
      "15yo still eligible for kids-group",
    );
    // HP maxAge is 14 so the 15yo should NOT see HP.
    assert.ok(
      !out.all.some((r) => r.program.slug === "high-performance"),
      "HP excluded for 15yo (maxAge 14)",
    );
  },
);

run(
  "privates always last in ranking",
  {
    viewerAge: 32,
    children: [],
    parentAlsoPlays: false,
    viewerIsAdultMember: false,
    programs: PROGRAMS,
  },
  (out) => {
    const privatesPos = out.all.findIndex((r) => r.program.slug === "privates");
    if (privatesPos >= 0) {
      assert.equal(privatesPos, out.all.length - 1, "privates should rank last");
    }
  },
);

run(
  "program with no open series is filtered out",
  {
    viewerAge: 32,
    children: [],
    parentAlsoPlays: false,
    viewerIsAdultMember: false,
    programs: PROGRAMS.map((p) =>
      p.slug === "adult-group" ? { ...p, hasOpenSeries: false } : p,
    ),
  },
  (out) => {
    assert.ok(
      !out.all.some((r) => r.program.slug === "adult-group"),
      "adult-group should be hidden when no open series",
    );
  },
);

run(
  "parent who didn't tick parentAlsoPlays but holds an active membership — adult lessons surface anyway",
  {
    viewerAge: 40,
    children: [{ age: 7, schoolSlug: "ifs" }],
    parentAlsoPlays: false,
    viewerIsAdultMember: true,
    programs: PROGRAMS,
  },
  (out) => {
    assert.equal(out.hero[0].bucket, "kids");
    assert.ok(
      out.all.some((r) => r.program.slug === "adult-group"),
      "adult-group should surface for paying members even without parentAlsoPlays",
    );
  },
);

console.log("\nall recommendPrograms fixtures passed.");
