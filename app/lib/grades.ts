import { traitBonus } from "./traits";
import { clamp } from "./utils";
import type { Player, Team } from "./league";

export type GradeFactor = {
  label: string;
  value: number;
  weight: number;
};

export function playerGradeFactors(player: Player): GradeFactor[] {
  if (player.role === "pitcher") {
    return [
      { label: "Defense", value: player.defense, weight: 0.24 },
      { label: "Stuff", value: player.stuff, weight: 0.24 },
      { label: "Control", value: player.control, weight: 0.22 },
      { label: "Stamina", value: player.stamina, weight: 0.16 },
      { label: "Mastery", value: player.mastery, weight: 0.08 },
      { label: "Morale", value: player.morale, weight: 0.06 },
    ];
  }

  return [
    { label: "Offense", value: player.offense, weight: 0.3 },
    { label: "Defense", value: player.defense, weight: 0.18 },
    { label: "Contact", value: player.contact, weight: 0.18 },
    { label: "Power", value: player.power, weight: 0.14 },
    { label: "Speed", value: player.speed, weight: 0.12 },
    { label: "Mastery", value: player.mastery, weight: 0.08 },
  ];
}

export function playerOverall(player: Player) {
  const base = playerGradeFactors(player).reduce((sum, factor) => sum + factor.value * factor.weight, 0);
  const traitLift =
    traitBonus(player.traits, "clutch") * 0.18 +
    traitBonus(player.traits, "night") * 0.12 -
    Math.max(0, traitBonus(player.traits, "volatility")) * 0.08;
  return Math.round(clamp(base + traitLift - player.fatigue * 0.16, 20, 99));
}

export function letterGrade(score: number) {
  if (score >= 92) return "A+";
  if (score >= 86) return "A";
  if (score >= 80) return "B+";
  if (score >= 74) return "B";
  if (score >= 68) return "C+";
  if (score >= 60) return "C";
  if (score >= 52) return "D";
  return "F";
}

export function teamOverall(team: Team) {
  const active = [...team.lineup, team.rotation[0]].filter(Boolean);
  return Math.round(active.reduce((sum, player) => sum + playerOverall(player), 0) / active.length);
}
