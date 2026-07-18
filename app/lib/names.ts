import { pick, shuffle, type Rng } from "./utils";

const firstNames = [
  "Cal",
  "Milo",
  "Rube",
  "Iris",
  "Nico",
  "June",
  "Silas",
  "Marta",
  "Otto",
  "Len",
  "Vera",
  "Hank",
  "Sol",
  "Bea",
  "Cass",
  "Walt",
  "Etta",
  "Rafi",
  "Tess",
  "Arlo",
];

const lastNames = [
  "Vale",
  "Mercer",
  "Fisk",
  "Cardoza",
  "Bellweather",
  "Grimm",
  "Okafor",
  "Sato",
  "Marrow",
  "Linden",
  "Foxe",
  "Quill",
  "Baines",
  "Lowry",
  "Keene",
  "Ash",
  "Wynn",
  "Kestrel",
  "Rook",
  "Moon",
];

const nicknames = [
  "The Lantern",
  "Two-Strike",
  "Boxcar",
  "Ink",
  "Sunday",
  "Gutterball",
  "Red Six",
  "The Usher",
  "Blue Ticket",
  "Switchyard",
];

export const teamSeeds = [
  ["Mossgate", "Lamplighters"],
  ["Iron Parish", "Foundry Nine"],
  ["Graveline", "Tides"],
  ["Larkspur", "Railmen"],
  ["Vesper Yard", "Comets"],
  ["Blackfen", "Millers"],
  ["Cinder Falls", "Pilots"],
  ["Holloway", "Ledger Kings"],
  ["Ash Harbor", "Dockhands"],
  ["Bellwick", "Owls"],
  ["Copper Ridge", "Miners"],
  ["Dunlow", "Turnstiles"],
  ["Elm Crossing", "Conductors"],
  ["Foxglove", "Watchmen"],
  ["Gallow Field", "Haymakers"],
  ["Highwater", "Lockkeepers"],
  ["Ivory Junction", "Monarchs"],
  ["Juniper City", "Nightjars"],
  ["Kingsport", "Crown Nine"],
  ["Marrow Bay", "Breakers"],
] as const;

export const positions = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"] as const;

export function playerName(rng: Rng, used: Set<string>) {
  let name = "";
  do {
    name = `${pick(rng, firstNames)} ${pick(rng, lastNames)}`;
  } while (used.has(name));
  used.add(name);
  return name;
}

export function playerNickname(rng: Rng) {
  return pick(rng, nicknames);
}

export function teamNames(rng: Rng) {
  return shuffle(rng, teamSeeds);
}
