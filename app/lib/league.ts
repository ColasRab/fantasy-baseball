import { playerName, playerNickname, positions, teamNames } from "./names";
import { playerOverall } from "./grades";
import { pickTraits, randomTraitHook, traitBonus, type Trait } from "./traits";
import { createRng, pick, rating, type Rng } from "./utils";

export type PlayerRole = "batter" | "pitcher";

export const leagueTiers = ["Invitational", "Single A", "Double A", "Triple A", "Majors"] as const;
export type LeagueTier = (typeof leagueTiers)[number];

export const tierProfiles: Record<LeagueTier, {
  minOverall: number;
  maxOverall: number;
  cashBase: number;
  fanMin: number;
  fanMax: number;
  promotionReward: number;
}> = {
  Invitational: { minOverall: 34, maxOverall: 50, cashBase: 700, fanMin: 14, fanMax: 34, promotionReward: 900 },
  "Single A": { minOverall: 46, maxOverall: 59, cashBase: 2200, fanMin: 28, fanMax: 50, promotionReward: 1800 },
  "Double A": { minOverall: 55, maxOverall: 69, cashBase: 5200, fanMin: 42, fanMax: 66, promotionReward: 3600 },
  "Triple A": { minOverall: 65, maxOverall: 80, cashBase: 11000, fanMin: 58, fanMax: 82, promotionReward: 7500 },
  Majors: { minOverall: 76, maxOverall: 94, cashBase: 26000, fanMin: 72, fanMax: 96, promotionReward: 14000 },
};

export function tierIndex(tier: LeagueTier) {
  return leagueTiers.indexOf(tier);
}

export function nextTier(tier: LeagueTier) {
  return leagueTiers[Math.min(leagueTiers.length - 1, tierIndex(tier) + 1)];
}

export function previousTier(tier: LeagueTier) {
  return leagueTiers[Math.max(0, tierIndex(tier) - 1)];
}

export type Player = {
  id: string;
  name: string;
  nickname: string;
  role: PlayerRole;
  position: string;
  age: number;
  contact: number;
  power: number;
  eye: number;
  speed: number;
  fielding: number;
  stuff: number;
  control: number;
  stamina: number;
  morale: number;
  offense: number;
  defense: number;
  mastery: number;
  fatigue: number;
  salary: number;
  value: number;
  contractYears: number;
  signatureTechnique: string;
  traits: Trait[];
  note: string;
};

export type Facilities = {
  battingCages: number;
  bullpenMounds: number;
  weightRoom: number;
  filmRoom: number;
  recoveryWing: number;
};

export type Materials = {
  lumber: number;
  leather: number;
  thread: number;
};

export type Sponsor = {
  name: string;
  offer: number;
  bonus: number;
  condition: string;
};

export type StaffRole = "scout" | "assistant" | "batting" | "pitching" | "head";

export type StaffMember = {
  role: StaffRole;
  name: string;
  salary: number;
  rating: number;
  specialty: string;
};

export type Team = {
  id: string;
  city: string;
  mascot: string;
  name: string;
  abbreviation: string;
  color: string;
  accent: string;
  wins: number;
  losses: number;
  runsFor: number;
  runsAgainst: number;
  division: LeagueTier;
  cash: number;
  wageBudget: number;
  payroll: number;
  fanSupport: number;
  stadium: number;
  chemistry: number;
  facilities: Facilities;
  materials: Materials;
  sponsor?: Sponsor;
  staff: Partial<Record<StaffRole, StaffMember>>;
  boardTarget: string;
  roster: Player[];
  lineup: Player[];
  rotation: Player[];
  story: string;
};

export type ScheduleGame = {
  id: string;
  day: number;
  awayId: string;
  homeId: string;
  label: string;
};

export type League = {
  seed: string;
  day: number;
  teams: Team[];
  freeAgents: Player[];
  schedule: ScheduleGame[];
  chronicle: string[];
};

const palettes = [
  ["#f2b04c", "#5eb7a8"],
  ["#d84a3a", "#9db9ff"],
  ["#f7d774", "#7bda8d"],
  ["#e6815d", "#81b9d8"],
  ["#ffbf69", "#b9a7ff"],
  ["#c7f0bd", "#e05555"],
  ["#fabd58", "#6ec6ff"],
  ["#ffdc7c", "#c992ff"],
];

const teamStories = [
  "a dugout full of quiet grudges and impossible scouting reports",
  "a budget roster stitched together from waiver-wire miracles",
  "a clubhouse where every slump becomes a folk song",
  "a front office that trusts notebooks more than witnesses",
  "a pitching staff with storm-light confidence and short tempers",
  "a batting order built from patience, nicknames, and suspicious luck",
  "a defense that treats every grounder like a signed confession",
  "a town that still keeps score by hand in the upper deck",
];

const boardTargets = {
  Invitational: ["Learn to survive", "Build a legal lineup", "Keep every contract cheap", "Reach the promotion game"],
  "Single A": ["Win more than you lose", "Turn prospects into starters", "Add professional staff", "Push for promotion"],
  "Double A": ["Contend for promotion", "Build real pitching depth", "Grow the gate", "Hold a top-half place"],
  "Triple A": ["Reach the Majors", "Develop two major-league players", "Win the pennant", "Survive the pressure"],
  Majors: ["Fight for the pennant", "Stay clear of relegation", "Build a championship roster", "Finish in the top half"],
};

const staffNames = [
  "Perry Chalk",
  "Mo Keene",
  "Vince Lark",
  "Eli Box",
  "Tomas Vale",
  "Nora Bell",
  "Kit Sato",
  "Jules Fisk",
] as const;

const staffSpecialties: Record<StaffRole, string[]> = {
  scout: ["Finds cheap prospects", "Sharper stat reveals", "Better free-agent reports"],
  assistant: ["Lineup recommendations", "Bullpen order planning", "Coach coordination"],
  batting: ["Weekly hitter drills", "Slump detection", "Plate approach reports"],
  pitching: ["Weekly pitcher drills", "Fatigue reads", "Rotation form reports"],
  head: ["Gameplan recommendations", "Opponent prep", "Clubhouse direction"],
};

const signatureTechniques = [
  "The Villain's Cut",
  "Dead Silence",
  "Ghost Steps",
  "Reading the Room",
  "Foul King",
  "Moonshot Clause",
  "Chalkline Extortion",
  "No-Receipt Pickoff",
  "Nine-Pitch Grin",
] as const;

export const sponsorPool: Sponsor[] = [
  { name: "Fizzbolt Tonic", offer: 900, bonus: 260, condition: "Win 3 of the next 5" },
  { name: "Marlow's Used Vans", offer: 680, bonus: 420, condition: "Avoid relegation" },
  { name: "Crunch Baron Bars", offer: 760, bonus: 180, condition: "Hit 8 home runs" },
  { name: "Lantern Radio 44", offer: 520, bonus: 320, condition: "Finish top half" },
];

function withTrait(value: number, traits: Trait[], key: Parameters<typeof traitBonus>[1]) {
  return Math.max(20, Math.min(99, value + traitBonus(traits, key)));
}

function contractFor(rng: Rng, role: PlayerRole, overall: number, age: number) {
  const rolePremium = role === "pitcher" ? 1.08 : 1;
  const veteranPremium = age >= 31 ? 1.18 : age <= 23 ? 0.74 : 1;
  const abilityCurve = Math.pow(Math.max(0, overall - 20) / 79, 3.15);
  const variance = rng() * (2 + Math.max(0, overall - 35) * 1.2);
  const salary = Math.round((10 + abilityCurve * 30000 * rolePremium * veteranPremium + variance) / 5) * 5;
  const value = Math.round((salary * (1.7 + rng() * 2.4) + overall * 24) / 25) * 25;
  return {
    salary: Math.max(10, salary),
    value,
    contractYears: 1 + Math.floor(rng() * 4),
  };
}

function defaultFacilities(rng: Rng, division: Team["division"]): Facilities {
  const base = 1 + Math.floor(tierIndex(division) / 2);
  return {
    battingCages: base + Math.floor(rng() * 2),
    bullpenMounds: base + Math.floor(rng() * 2),
    weightRoom: base,
    filmRoom: base,
    recoveryWing: 1,
  };
}

function defaultMaterials(rng: Rng): Materials {
  return {
    lumber: 4 + Math.floor(rng() * 6),
    leather: 3 + Math.floor(rng() * 5),
    thread: 2 + Math.floor(rng() * 5),
  };
}

function makeStaff(rng: Rng, role: StaffRole, salaryBase: number): StaffMember {
  return {
    role,
    name: pick(rng, staffNames),
    salary: Math.round((salaryBase + rng() * 180) / 10) * 10,
    rating: rating(rng, 45, 84),
    specialty: pick(rng, staffSpecialties[role]),
  };
}

function makeBatter(rng: Rng, teamId: string, index: number, position: string, usedNames: Set<string>): Player {
  const traits = pickTraits(rng, rng() > 0.78 ? 3 : 2);
  const name = playerName(rng, usedNames);
  const player: Player = {
    id: `${teamId}-b-${index}`,
    name,
    nickname: playerNickname(rng),
    role: "batter",
    position,
    age: 20 + Math.floor(rng() * 17),
    contact: withTrait(rating(rng), traits, "contact"),
    power: withTrait(rating(rng, 32, 91), traits, "power"),
    eye: withTrait(rating(rng, 35, 88), traits, "eye"),
    speed: withTrait(rating(rng, 31, 93), traits, "speed"),
    fielding: withTrait(rating(rng, 34, 90), traits, "fielding"),
    stuff: 20,
    control: 20,
    stamina: 20,
    morale: rating(rng, 42, 94),
    offense: 0,
    defense: 0,
    mastery: rating(rng, 48, 92),
    fatigue: rating(rng, 0, 18),
    salary: 0,
    value: 0,
    contractYears: 1,
    signatureTechnique: pick(rng, signatureTechniques),
    traits,
    note: `${name.split(" ")[0]} ${randomTraitHook(rng, traits)}.`,
  };
  player.offense = Math.round(player.contact * 0.38 + player.power * 0.34 + player.eye * 0.28);
  player.defense = Math.round(player.fielding * 0.72 + player.speed * 0.28);
  return {
    ...player,
    ...contractFor(rng, "batter", powerRankPlayer(player), player.age),
  };
}

function makePitcher(rng: Rng, teamId: string, index: number, usedNames: Set<string>): Player {
  const traits = pickTraits(rng, rng() > 0.72 ? 3 : 2);
  const name = playerName(rng, usedNames);
  const player: Player = {
    id: `${teamId}-p-${index}`,
    name,
    nickname: playerNickname(rng),
    role: "pitcher",
    position: index === 0 ? "SP" : "RP",
    age: 21 + Math.floor(rng() * 15),
    contact: 20,
    power: 20,
    eye: 20,
    speed: rating(rng, 25, 62),
    fielding: rating(rng, 38, 82),
    stuff: withTrait(rating(rng, 39, 94), traits, "stuff"),
    control: withTrait(rating(rng, 37, 91), traits, "control"),
    stamina: withTrait(rating(rng, 36, 95), traits, "stamina"),
    morale: rating(rng, 39, 93),
    offense: 0,
    defense: 0,
    mastery: rating(rng, 50, 94),
    fatigue: rating(rng, 0, 24),
    salary: 0,
    value: 0,
    contractYears: 1,
    signatureTechnique: pick(rng, signatureTechniques),
    traits,
    note: `${name.split(" ")[0]} ${randomTraitHook(rng, traits)}.`,
  };
  player.offense = Math.round(player.stuff * 0.22 + player.control * 0.18 + player.fielding * 0.12);
  player.defense = Math.round(player.stuff * 0.38 + player.control * 0.34 + player.stamina * 0.18 + player.fielding * 0.1);
  return {
    ...player,
    ...contractFor(rng, "pitcher", powerRankPlayer(player), player.age),
  };
}

function powerRankPlayer(player: Player) {
  if (player.role === "pitcher") {
    return Math.round(player.stuff * 0.36 + player.control * 0.32 + player.stamina * 0.18 + player.morale * 0.14);
  }
  return Math.round(
    player.contact * 0.28 +
      player.power * 0.22 +
      player.eye * 0.18 +
      player.speed * 0.12 +
      player.fielding * 0.12 +
      player.morale * 0.08,
  );
}

function clampRating(value: number) {
  return Math.max(20, Math.min(99, Math.round(value)));
}

function recalculatePlayer(player: Player): Player {
  return {
    ...player,
    offense:
      player.role === "batter"
        ? Math.round(player.contact * 0.38 + player.power * 0.34 + player.eye * 0.28)
        : Math.round(player.stuff * 0.22 + player.control * 0.18 + player.fielding * 0.12),
    defense:
      player.role === "pitcher"
        ? Math.round(player.stuff * 0.38 + player.control * 0.34 + player.stamina * 0.18 + player.fielding * 0.1)
        : Math.round(player.fielding * 0.72 + player.speed * 0.28),
  };
}

function shiftPlayerAbility(player: Player, amount: number): Player {
  const shifted = {
    ...player,
    contact: player.role === "batter" ? clampRating(player.contact + amount) : player.contact,
    power: player.role === "batter" ? clampRating(player.power + amount) : player.power,
    eye: player.role === "batter" ? clampRating(player.eye + amount) : player.eye,
    speed: clampRating(player.speed + amount * 0.45),
    fielding: clampRating(player.fielding + amount * 0.65),
    stuff: player.role === "pitcher" ? clampRating(player.stuff + amount) : player.stuff,
    control: player.role === "pitcher" ? clampRating(player.control + amount) : player.control,
    stamina: player.role === "pitcher" ? clampRating(player.stamina + amount * 0.8) : player.stamina,
    mastery: clampRating(player.mastery + amount * 0.7),
  };
  return recalculatePlayer(shifted);
}

function retargetPlayer(rng: Rng, player: Player, minOverall: number, maxOverall: number): Player {
  const target = minOverall + Math.floor(rng() * (maxOverall - minOverall + 1));
  let scaled = player;
  for (let pass = 0; pass < 5; pass += 1) {
    const delta = target - playerOverall(scaled);
    if (Math.abs(delta) <= 1) break;
    scaled = shiftPlayerAbility(scaled, delta);
  }
  return {
    ...scaled,
    ...contractFor(rng, scaled.role, playerOverall(scaled), scaled.age),
  };
}

function scaleExpansionPlayer(rng: Rng, player: Player, budget: number): Player {
  const range = budget <= 100 ? [26, 35] : budget >= 1000 ? [41, 49] : [34, 44];
  const scaled = retargetPlayer(rng, player, range[0], range[1]);
  return {
    ...scaled,
    age: budget <= 100 ? 20 + Math.floor(rng() * 8) : scaled.age,
    morale: Math.max(35, scaled.morale - (budget <= 100 ? 12 : budget >= 1000 ? 4 : 8)),
  };
}

function powerRank(team: Team) {
  const bats = team.lineup.reduce((sum, player) => sum + playerOverall(player), 0);
  const arms = team.rotation.reduce((sum, player) => sum + playerOverall(player), 0);
  return bats / team.lineup.length + arms / team.rotation.length;
}

function payroll(roster: Player[]) {
  return roster.reduce((sum, player) => sum + player.salary, 0);
}

export function buildSchedule(teams: Team[]) {
  const schedule: ScheduleGame[] = [];
  leagueTiers.forEach((division) => {
    const divisionTeams = teams.filter((team) => team.division === division);
    if (divisionTeams.length < 2 || divisionTeams.length % 2 !== 0) return;
    let rotation = [...divisionTeams];

    for (let round = 0; round < 12; round += 1) {
      for (let index = 0; index < rotation.length / 2; index += 1) {
        const left = rotation[index];
        const right = rotation[rotation.length - 1 - index];
        const swapHome = (round + index) % 2 === 1;
        const away = swapHome ? right : left;
        const home = swapHome ? left : right;
        schedule.push({
          id: `d${round + 1}-${away.id}-${home.id}`,
          day: round + 1,
          awayId: away.id,
          homeId: home.id,
          label: `${away.abbreviation} at ${home.abbreviation}`,
        });
      }

      const fixed = rotation[0];
      const rotating = rotation.slice(1);
      const last = rotating.pop();
      rotation = last ? [fixed, last, ...rotating] : rotation;
    }
  });
  return schedule;
}

export function createLeague(seed = "night-ledger-1938"): League {
  const rng = createRng(seed);
  const usedNames = new Set<string>();
  const teams: Team[] = teamNames(rng).map(([city, mascot], index) => {
    const id = city.toLowerCase().replace(/[^a-z]/g, "-");
    const division = leagueTiers[Math.min(leagueTiers.length - 1, Math.floor(index / 4))];
    const profile = tierProfiles[division];
    const hitterPositions = [...positions, "C", "IF", "IF", "OF", "OF"];
    const roster = ([
      ...hitterPositions.map((position, playerIndex) => makeBatter(rng, id, playerIndex, position, usedNames)),
      ...Array.from({ length: 5 }, (_, pitcherIndex) => makePitcher(rng, id, pitcherIndex, usedNames)),
    ]).map((player) => retargetPlayer(rng, player, profile.minOverall, profile.maxOverall));
    const lineup = roster
      .filter((player) => player.role === "batter")
      .sort((left, right) => playerOverall(right) - playerOverall(left))
      .slice(0, 9);
    const rotation = roster
      .filter((player) => player.role === "pitcher")
      .sort((left, right) => playerOverall(right) - playerOverall(left));
    const [color, accent] = palettes[index % palettes.length];
    const teamPayroll = payroll(roster);
    const fanSupport = rating(rng, profile.fanMin, profile.fanMax);
    const stadium = rating(rng, 24 + tierIndex(division) * 12, 48 + tierIndex(division) * 12);

    return {
      id,
      city,
      mascot,
      name: `${city} ${mascot}`,
      abbreviation: `${city} ${mascot}`
        .split(" ")
        .map((part) => part[0])
        .join("")
        .slice(0, 3)
        .toUpperCase(),
      color,
      accent,
      wins: 0,
      losses: 0,
      runsFor: 0,
      runsAgainst: 0,
      division,
      cash: Math.round(profile.cashBase + fanSupport * (18 + tierIndex(division) * 5) + rng() * profile.cashBase * 0.35),
      wageBudget: Math.round(teamPayroll * (1.12 + rng() * 0.34)),
      payroll: teamPayroll,
      fanSupport,
      stadium,
      chemistry: rating(rng, 42, 88),
      facilities: defaultFacilities(rng, division),
      materials: defaultMaterials(rng),
      sponsor: rng() > 0.45 ? pick(rng, sponsorPool) : undefined,
      staff:
        tierIndex(division) >= 2
          ? {
              assistant: makeStaff(rng, "assistant", 420),
              scout: makeStaff(rng, "scout", 320),
              ...(tierIndex(division) >= 3 ? { head: makeStaff(rng, "head", 520) } : {}),
            }
          : {},
      boardTarget: pick(rng, boardTargets[division]),
      roster,
      lineup,
      rotation,
      story: pick(rng, teamStories),
    };
  });

  const sorted = [...teams].sort((left, right) => powerRank(right) - powerRank(left));

  const schedule = buildSchedule(teams);
  const freeAgents = ([
    ...Array.from({ length: 12 }, (_, index) => makeBatter(rng, "fa", index, pick(rng, positions), usedNames)),
    ...Array.from({ length: 6 }, (_, index) => makePitcher(rng, "fa", index, usedNames)),
  ]).map((player, index) => {
    const tier = leagueTiers[index % leagueTiers.length];
    const profile = tierProfiles[tier];
    return retargetPlayer(rng, player, profile.minOverall, profile.maxOverall);
  }).sort((left, right) => playerOverall(right) - playerOverall(left));
  const chronicle = sorted.slice(0, 5).map((team, index) => {
    const player = pick(rng, team.lineup);
    return `Day ${index + 11}: ${team.name} scouts underline ${player.name}, "${player.nickname}", after ${player.note.toLowerCase()}`;
  });

  return {
    seed,
    day: 1,
    teams,
    freeAgents,
    schedule,
    chronicle,
  };
}

export function createExpansionTeam(seed: string, city: string, mascot: string, startingBudget = 500): Team {
  const rng = createRng(`expansion-${seed}-${city}-${mascot}-${startingBudget}`);
  const usedNames = new Set<string>();
  const cleanCity = city.trim() || "New Yard";
  const cleanMascot = mascot.trim() || "Rookies";
  const id = `user-${cleanCity}-${cleanMascot}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const hitterPositions = [...positions, "IF", "OF"];
  const roster = [
    ...hitterPositions.map((position, playerIndex) => makeBatter(rng, id, playerIndex, position, usedNames)),
    ...Array.from({ length: 4 }, (_, pitcherIndex) => makePitcher(rng, id, pitcherIndex, usedNames)),
  ].map((player) => scaleExpansionPlayer(rng, player, startingBudget));
  const lineup = roster
    .filter((player) => player.role === "batter")
    .sort((left, right) => playerOverall(right) - playerOverall(left))
    .slice(0, 9);
  const rotation = roster
    .filter((player) => player.role === "pitcher")
    .sort((left, right) => playerOverall(right) - playerOverall(left));
  const teamPayroll = payroll(roster);

  return {
    id,
    city: cleanCity,
    mascot: cleanMascot,
    name: `${cleanCity} ${cleanMascot}`,
    abbreviation: `${cleanCity} ${cleanMascot}`
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 3)
      .toUpperCase() || "DM",
    color: "#f2b04c",
    accent: "#5eb7a8",
    wins: 0,
    losses: 0,
    runsFor: 0,
    runsAgainst: 0,
    division: "Invitational",
    cash: startingBudget,
    wageBudget: Math.max(startingBudget, Math.round(teamPayroll * 1.08)),
    payroll: teamPayroll,
    fanSupport: startingBudget <= 100 ? 18 : startingBudget >= 1000 ? 34 : 26,
    stadium: startingBudget <= 100 ? 24 : startingBudget >= 1000 ? 40 : 32,
    chemistry: startingBudget <= 100 ? 38 : startingBudget >= 1000 ? 50 : 44,
    facilities: {
      battingCages: 1,
      bullpenMounds: 1,
      weightRoom: 1,
      filmRoom: 1,
      recoveryWing: 1,
    },
    materials: {
      lumber: 3,
      leather: 2,
      thread: 2,
    },
    staff: {},
    boardTarget: "Earn a place in Single A",
    roster,
    lineup,
    rotation,
    story: "an invitational entry, a cheap bus, and four rungs of professional baseball overhead",
  };
}
