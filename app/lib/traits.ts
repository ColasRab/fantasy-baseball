import { pick, shuffle, type Rng } from "./utils";

export type TraitEffect = {
  contact?: number;
  power?: number;
  eye?: number;
  speed?: number;
  fielding?: number;
  stuff?: number;
  control?: number;
  stamina?: number;
  clutch?: number;
  volatility?: number;
  night?: number;
};

export type Trait = {
  id: string;
  name: string;
  tag: string;
  description: string;
  effect: TraitEffect;
  chronicleHook: string;
};

export const TRAITS: Trait[] = [
  {
    id: "night-owl",
    name: "Night Owl",
    tag: "lights",
    description: "+7 poise in late innings and under stadium lights.",
    effect: { night: 7, clutch: 4 },
    chronicleHook: "seems to hear the ball better after the lights warm up",
  },
  {
    id: "chalkline-hitter",
    name: "Chalkline Hitter",
    tag: "pull",
    description: "+6 contact with runners aboard, but less home-run lift.",
    effect: { contact: 6, power: -2, clutch: 3 },
    chronicleHook: "keeps shaving singles just inside the painted line",
  },
  {
    id: "Sign Thief",
    name: "Sign Thief",
    tag: "read",
    description: "+5 eye and a better walk chance against wild pitchers.",
    effect: { eye: 5, volatility: 2 },
    chronicleHook: "keeps glancing toward second like the notebook has ears",
  },
  {
    id: "Cold Hands",
    name: "Cold Hands",
    tag: "field",
    description: "-6 fielding, with a higher chance of charged errors.",
    effect: { fielding: -6, volatility: 5 },
    chronicleHook: "has the glove confidence of a rain-soaked receipt",
  },
  {
    id: "Cinder Arm",
    name: "Cinder Arm",
    tag: "pitch",
    description: "+8 stuff, -4 stamina; brilliant until the sixth.",
    effect: { stuff: 8, stamina: -4, volatility: 4 },
    chronicleHook: "throws like the mound is giving off sparks",
  },
  {
    id: "Ledger Mind",
    name: "Ledger Mind",
    tag: "book",
    description: "+5 control or eye from patient, count-aware play.",
    effect: { eye: 4, control: 5 },
    chronicleHook: "plays every count like a column that must balance",
  },
  {
    id: "Split Prophet",
    name: "Split Prophet",
    tag: "scout",
    description: "+6 clutch in close games; scouts love the timing.",
    effect: { clutch: 6, contact: 2 },
    chronicleHook: "keeps arriving in the precise inning a box score remembers",
  },
  {
    id: "Fence Caller",
    name: "Fence Caller",
    tag: "power",
    description: "+8 power, -3 eye; built for loud mistakes.",
    effect: { power: 8, eye: -3, volatility: 3 },
    chronicleHook: "points with the bat before the pitcher agrees",
  },
  {
    id: "Mud Cleats",
    name: "Mud Cleats",
    tag: "base",
    description: "+7 speed and steals an extra base on soft hits.",
    effect: { speed: 7, clutch: 1 },
    chronicleHook: "turns station-to-station baseball into a rumor",
  },
  {
    id: "Quiet Ace",
    name: "Quiet Ace",
    tag: "mound",
    description: "+6 control, lower volatility, and very few speeches.",
    effect: { control: 6, volatility: -4 },
    chronicleHook: "keeps the bench calm by refusing to look impressed",
  },
];

export function pickTraits(rng: Rng, amount = 2) {
  return shuffle(rng, TRAITS).slice(0, amount);
}

export function randomTraitHook(rng: Rng, traits: Trait[]) {
  return pick(rng, traits).chronicleHook;
}

export function traitBonus(traits: Trait[], key: keyof TraitEffect) {
  return traits.reduce((total, trait) => total + (trait.effect[key] ?? 0), 0);
}
