/** Mirrors `UI_DEFINITIONS` order in `public/script.js`. */
export const SECTION_IDS = [
  "analyticsselections",
  "analyticsfield",
  "classicapp",
  "analyticssheet",
  "classicchart",
  "analyticschart",
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

/** Sections that can have more than one list item (sheet/object lists). */
export const MULTI_ITEM_SECTION_IDS: readonly SectionId[] = [
  "classicapp",
  "analyticssheet",
  "classicchart",
  "analyticschart",
];
