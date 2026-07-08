import { traitBonus } from "./traits";
import { clamp, createRng, padStat, pick, percent } from "./utils";
import type { Player, Team } from "./league";

export type BaseRunner = {
  id: string;
  name: string;
  speed: number;
} | null;

export type GameEvent = {
  id: string;
  inning: number;
  half: "top" | "bottom";
  outs: number;
  bases: [BaseRunner, BaseRunner, BaseRunner];
  awayScore: number;
  homeScore: number;
  batter: string;
  pitcher: string;
  result: string;
  text: string;
  ticker: string;
  leverage: number;
};

export type BoxLine = {
  runs: number[];
  hits: number;
  errors: number;
};

export type SimGame = {
  id: string;
  away: Team;
  home: Team;
  awayLine: BoxLine;
  homeLine: BoxLine;
  events: GameEvent[];
  final: string;
  headline: string;
  chronicle: string[];
};

type HalfState = {
  bases: [BaseRunner, BaseRunner, BaseRunner];
  outs: number;
};

const emptyBases = (): [BaseRunner, BaseRunner, BaseRunner] => [null, null, null];

function runner(player: Player): BaseRunner {
  return { id: player.id, name: player.name, speed: player.speed };
}

function scoreRunner(line: BoxLine, inning: number) {
  while (line.runs.length < inning) {
    line.runs.push(0);
  }
  line.runs[inning - 1] += 1;
}

function advanceRunners(
  state: HalfState,
  batter: Player,
  bases: number,
  offense: BoxLine,
  inning: number,
) {
  let scored = 0;
  const next = emptyBases();

  state.bases.forEach((baseRunner, baseIndex) => {
    if (!baseRunner) return;
    const destination = baseIndex + 1 + bases;
    if (destination >= 4) {
      scored += 1;
      scoreRunner(offense, inning);
    } else {
      next[destination - 1] = baseRunner;
    }
  });

  if (bases >= 4) {
    scored += 1;
    scoreRunner(offense, inning);
  } else {
    next[bases - 1] = runner(batter);
  }

  state.bases = next;
  offense.hits += bases === 4 ? 1 : bases > 0 ? 1 : 0;
  return scored;
}

function walkBatter(state: HalfState, batter: Player, offense: BoxLine, inning: number) {
  let scored = 0;
  if (state.bases[0] && state.bases[1] && state.bases[2]) {
    scored += 1;
    scoreRunner(offense, inning);
  }
  if (state.bases[1] && state.bases[0]) state.bases[2] = state.bases[1];
  if (state.bases[0]) state.bases[1] = state.bases[0];
  state.bases[0] = runner(batter);
  return scored;
}

function maybeError(
  rng: () => number,
  defense: Team,
  state: HalfState,
  batter: Player,
  defenseLine: BoxLine,
  offenseLine: BoxLine,
  inning: number,
) {
  const fielding = defense.lineup.reduce((sum, player) => sum + player.fielding, 0) / defense.lineup.length;
  const coldHands = defense.lineup.reduce((sum, player) => sum + traitBonus(player.traits, "volatility"), 0);
  const chance = clamp(0.035 + (58 - fielding) / 1200 + coldHands / 2500, 0.015, 0.105);
  if (rng() > chance) return null;
  defenseLine.errors += 1;
  const scored = walkBatter(state, batter, offenseLine, inning);
  return {
    scored,
    result: "E",
    text: `${pick(rng, defense.lineup).name} boots a chalky grounder; ${batter.name} reaches on the error.`,
  };
}

function resolveAtBat(
  rng: () => number,
  batter: Player,
  pitcher: Player,
  offense: Team,
  defense: Team,
  state: HalfState,
  offenseLine: BoxLine,
  defenseLine: BoxLine,
  inning: number,
  scoreDiff: number,
) {
  const error = maybeError(rng, defense, state, batter, defenseLine, offenseLine, inning);
  if (error) return error;

  const lateLight = inning >= 5 ? traitBonus(batter.traits, "night") + traitBonus(pitcher.traits, "night") : 0;
  const clutch = Math.abs(scoreDiff) <= 2 ? traitBonus(batter.traits, "clutch") - traitBonus(pitcher.traits, "clutch") : 0;
  const fatiguePenalty = pitcher.fatigue * 0.34 + inning * 0.9;
  const masteryBoost = (batter.mastery - 60) * 0.08 - (pitcher.mastery - 60) * 0.05;
  const batting = batter.offense * 0.34 + batter.contact * 0.28 + batter.power * 0.18 + batter.eye * 0.12 + batter.morale * 0.08 + lateLight + clutch + masteryBoost;
  const pitching = pitcher.defense * 0.32 + pitcher.stuff * 0.27 + pitcher.control * 0.24 + pitcher.stamina * 0.1 + pitcher.morale * 0.07 - fatiguePenalty;
  const edge = clamp((batting - pitching) / 120, -0.18, 0.18);
  const roll = rng();
  const techniqueWindow = inning >= 7 || state.bases.some(Boolean);
  const techniqueFires = techniqueWindow && rng() < 0.045 + Math.max(0, traitBonus(batter.traits, "clutch")) / 600;
  const walkChance = clamp(0.075 + (batter.eye - pitcher.control) / 900, 0.035, 0.15);
  const strikeoutChance = clamp(0.155 + (pitcher.stuff - batter.contact) / 700, 0.06, 0.27);
  const hitChance = clamp(0.255 + edge + (techniqueFires ? 0.08 : 0), 0.16, 0.48);
  const homerChance = clamp(0.028 + (batter.power - pitcher.stuff) / 1600 + edge / 5 + (techniqueFires ? 0.018 : 0), 0.008, 0.11);

  if (roll < walkChance) {
    const scored = walkBatter(state, batter, offenseLine, inning);
    return {
      scored,
      result: "BB",
      text: `${batter.name} refuses three tempting pitches and takes first with a bookkeeper's patience.`,
    };
  }

  if (roll < walkChance + strikeoutChance) {
    state.outs += 1;
    return {
      scored: 0,
      result: "K",
      text: `${pitcher.name} buries the count; ${batter.name} goes down staring at the low stripe.`,
    };
  }

  if (roll < walkChance + strikeoutChance + hitChance) {
    const hitRoll = rng();
    const bases = hitRoll < homerChance ? 4 : hitRoll < 0.13 ? 3 : hitRoll < 0.38 ? 2 : 1;
    const scored = advanceRunners(state, batter, bases, offenseLine, inning);
    const label = bases === 4 ? "HR" : bases === 3 ? "3B" : bases === 2 ? "2B" : "1B";
    const noun = bases === 4 ? "into the amber seats" : bases === 3 ? "past a diving glove" : bases === 2 ? "off the manual scoreboard" : "through the left-side chalk";
    return {
      scored,
      result: label,
      text: `${techniqueFires ? `${batter.signatureTechnique} flashes across the scouting notebook. ` : ""}${batter.name} drives one ${noun}; ${offense.abbreviation} scratch ${scored || "no"} run${scored === 1 ? "" : "s"} from it.`,
    };
  }

  state.outs += 1;
  const outText =
    rng() > 0.55
      ? `${batter.name} lifts a tired fly to center; the notebook gets a quiet F8.`
      : `${batter.name} rolls over a grounder, and ${defense.abbreviation} turn the page cleanly.`;
  return { scored: 0, result: "OUT", text: outText };
}

function createLine() {
  return {
    runs: Array.from({ length: 9 }, () => 0),
    hits: 0,
    errors: 0,
  };
}

export function simulateGame(away: Team, home: Team, seed = "game-center"): SimGame {
  const rng = createRng(`${seed}-${away.id}-${home.id}`);
  const awayLine = createLine();
  const homeLine = createLine();
  const events: GameEvent[] = [];
  const battingIndex = { top: 0, bottom: 0 };
  const awayPitcher = away.rotation[0];
  const homePitcher = home.rotation[0];
  let awayScore = 0;
  let homeScore = 0;

  let inning = 1;
  while (inning <= 9 || (awayScore === homeScore && inning <= 12)) {
    for (const half of ["top", "bottom"] as const) {
      const offense = half === "top" ? away : home;
      const defense = half === "top" ? home : away;
      const pitcher = half === "top" ? homePitcher : awayPitcher;
      const offenseLine = half === "top" ? awayLine : homeLine;
      const defenseLine = half === "top" ? homeLine : awayLine;
      const state: HalfState = { bases: emptyBases(), outs: 0 };

      while (state.outs < 3) {
        const indexKey = half;
        const batter = offense.lineup[battingIndex[indexKey] % offense.lineup.length];
        battingIndex[indexKey] += 1;
        const beforeScore = half === "top" ? awayScore - homeScore : homeScore - awayScore;
        const result = resolveAtBat(
          rng,
          batter,
          pitcher,
          offense,
          defense,
          state,
          offenseLine,
          defenseLine,
          inning,
          beforeScore,
        );
        if (half === "top") {
          awayScore += result.scored;
        } else {
          homeScore += result.scored;
        }

        events.push({
          id: `${inning}-${half}-${events.length}`,
          inning,
          half,
          outs: state.outs,
          bases: [...state.bases] as [BaseRunner, BaseRunner, BaseRunner],
          awayScore,
          homeScore,
          batter: batter.name,
          pitcher: pitcher.name,
          result: result.result,
          text: result.text,
          ticker: `${half === "top" ? "TOP" : "BOT"} ${inning}  ${away.abbreviation} ${awayScore} - ${homeScore} ${home.abbreviation}  ${result.result}  OUTS ${state.outs}`,
          leverage: clamp(0.2 + (3 - Math.abs(awayScore - homeScore)) / 6 + inning / 10, 0.2, 1),
        });
      }
    }
    inning += 1;
  }

  if (awayScore === homeScore) {
    const winner = rng() > 0.5 ? awayLine : homeLine;
    scoreRunner(winner, Math.min(inning - 1, winner.runs.length));
    if (winner === awayLine) awayScore += 1;
    else homeScore += 1;
  }

  const winner = awayScore > homeScore ? away : home;
  const loser = awayScore > homeScore ? home : away;
  const star = pick(rng, winner.lineup);
  const final = `${away.abbreviation} ${awayScore}, ${home.abbreviation} ${homeScore}`;
  const headline = `${winner.name} edge ${loser.abbreviation} under the lamps`;
  const chronicle = [
    `${star.name}, "${star.nickname}", becomes the margin note everyone circles after ${final}.`,
    `${winner.rotation[0].name} reports ${percent(winner.rotation[0].control / 100)} command in the staff ledger.`,
    `Scouts flag the ${padStat(events.filter((event) => event.result === "E").length)} defensive blemishes in scoreboard red.`,
  ];

  return {
    id: `${away.id}-${home.id}`,
    away,
    home,
    awayLine,
    homeLine,
    events,
    final,
    headline,
    chronicle,
  };
}
