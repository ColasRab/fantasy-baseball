"use client";

import {
  Activity,
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardList,
  DollarSign,
  Dumbbell,
  Hammer,
  Handshake,
  ListChecks,
  Megaphone,
  Pause,
  Play,
  Radio,
  RotateCcw,
  SkipForward,
  TrendingUp,
  Trophy,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { letterGrade, playerGradeFactors, playerOverall, teamOverall } from "./lib/grades";
import {
  clearAuthUser,
  getSupabaseAuthUser,
  loadAuthUser,
  loadRemoteSave,
  saveAuthUser,
  saveRemoteSave,
  signOutSupabase,
  type AuthUser,
  type SavedGamePayload,
} from "./lib/auth";
import {
  buildSchedule,
  createExpansionTeam,
  createLeague,
  sponsorPool,
  type Player,
  type ScheduleGame,
  type Sponsor,
  type StaffMember,
  type StaffRole,
  type Team,
} from "./lib/league";
import { simulateGame, type BaseRunner, type BoxLine, type GameEvent, type SimGame } from "./lib/simulation";

const appTabs = [
  { id: "office", label: "Office", icon: Building2, href: "/office" },
  { id: "staff", label: "Staff", icon: Handshake, href: "/staff", secondary: true },
  { id: "squad", label: "Squad", icon: ClipboardList, href: "/squad" },
  { id: "training", label: "Training", icon: Dumbbell, href: "/training", secondary: true },
  { id: "market", label: "Scouting", icon: DollarSign, href: "/market" },
  { id: "facilities", label: "Clubhouse", icon: Hammer, href: "/facilities" },
  { id: "sponsors", label: "Sponsors", icon: Megaphone, href: "/sponsors", secondary: true },
  { id: "season", label: "Season", icon: CalendarDays, href: "/season" },
  { id: "match", label: "Match", icon: Radio, href: "/match" },
  { id: "league", label: "League", icon: BarChart3, href: "/league" },
  { id: "news", label: "News", icon: BookOpen, href: "/news" },
] as const;

const staffMarket: StaffMember[] = [
  { role: "assistant", name: "Marta Keene", salary: 330, rating: 61, specialty: "Lineup recommendations" },
  { role: "scout", name: "Rafi Bell", salary: 260, rating: 58, specialty: "Finds cheap prospects" },
  { role: "head", name: "Silas Vale", salary: 480, rating: 64, specialty: "Gameplan recommendations" },
  { role: "batting", name: "June Marrow", salary: 380, rating: 66, specialty: "Weekly hitter drills" },
  { role: "pitching", name: "Otto Fisk", salary: 390, rating: 65, specialty: "Weekly pitcher drills" },
];

const facilityNodes = [
  {
    id: "scout-slot-2",
    facility: "filmRoom",
    level: 1,
    name: "Second Scout Desk",
    cost: 260,
    effect: "Hold two discovered prospects before signing decisions.",
  },
  {
    id: "veteran-scouting",
    facility: "filmRoom",
    level: 2,
    name: "Veteran Files",
    cost: 480,
    effect: "Unlock veteran scouting focus with higher wages and steadier grades.",
  },
  {
    id: "rising-star-scouting",
    facility: "filmRoom",
    level: 3,
    name: "Rising Star Network",
    cost: 760,
    effect: "Unlock rare high-upside prospect searches.",
  },
  {
    id: "sponsor-slot-2",
    facility: "recoveryWing",
    level: 2,
    name: "Sponsor Liaison",
    cost: 520,
    effect: "Unlock expanded sponsor handling and stronger media-day income.",
  },
  {
    id: "crafting-bench",
    facility: "weightRoom",
    level: 2,
    name: "Equipment Bench",
    cost: 460,
    effect: "Unlock gear crafting instead of treating equipment as always available.",
  },
  {
    id: "strategy-board",
    facility: "bullpenMounds",
    level: 3,
    name: "Strategy Board",
    cost: 720,
    effect: "Unlock advanced gameplan preparation from the coaching staff.",
  },
] as const;

type TabId = (typeof appTabs)[number]["id"];
type TeamSelection = {
  lineupIds: string[];
  starterId: string;
};

type SelectionMap = Record<string, TeamSelection>;
type StartingBudget = 100 | 500 | 1000;
type ScoutingFocus = "local" | "college" | "veteran" | "rising";
type ScoutingReport = {
  id: string;
  focus: ScoutingFocus;
  week: number;
  summary: string;
  foundIds: string[];
};
type ScoutingState = {
  isSearching: boolean;
  activeFocus: ScoutingFocus | null;
  reports: ScoutingReport[];
  foundIds: string[];
};
type MatchImpact = {
  won: boolean;
  score: string;
  opponent: string;
  mvp: string;
  turningPoint: string;
  gateIncome: number;
  sponsorBonus: number;
  payrollBill: number;
  netCash: number;
  fanDelta: number;
  chemistryDelta: number;
  moraleDelta: number;
  fatigueDelta: number;
};
type StoredGameRecord = {
  id: string;
  day: number;
  awayId: string;
  homeId: string;
  label: string;
  status: "scheduled" | "in-progress" | "completed";
  eventIndex?: number;
  sim?: SimGame;
  awayRuns?: number;
  homeRuns?: number;
  completedAt?: string;
  impact?: MatchImpact;
};
type SeasonState = {
  season: number;
  day: number;
  week: number;
  seasonLength: number;
  reputation: number;
  phase: "season" | "offseason";
  lastWeekSummary: string[];
};

type SavedGameState = {
  teams: Team[];
  freeAgents: Player[];
  selections: SelectionMap;
  ownedTeamId: string | null;
  seasonState: SeasonState;
  scoutingState?: ScoutingState;
  purchasedUpgrades?: string[];
  gameRecords?: Record<string, StoredGameRecord>;
  schedule?: ScheduleGame[];
};

const saveKey = "diamond-manager-gm-state-v6";
const startingBudgetOptions: Array<{ value: StartingBudget; label: string; description: string }> = [
  { value: 100, label: "$100k", description: "Hard mode: bargain players, tiny gate, every wage matters." },
  { value: 500, label: "$500k", description: "Balanced climb: enough room for one plan, not enough for mistakes." },
  { value: 1000, label: "$1M", description: "Backed project: stronger start, higher expectations." },
];
const blockedTeamTerms = ["fuck", "shit", "bitch", "asshole", "nigger", "nigga", "cunt", "slut", "whore"];
const initialSeasonState: SeasonState = {
  season: 1,
  day: 1,
  week: 1,
  seasonLength: 12,
  reputation: 18,
  phase: "season",
  lastWeekSummary: ["Create a club, sign staff, pick a sponsor, and survive the Challenger table."],
};

function normalizeTeamInput(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function validateTeamNamePart(value: string, label: string) {
  const cleaned = normalizeTeamInput(value);
  const lower = cleaned.toLowerCase();
  if (cleaned.length < 2) return `${label} needs at least 2 characters.`;
  if (cleaned.length > 24) return `${label} must be 24 characters or less.`;
  if (!/^[a-z0-9 .'-]+$/i.test(cleaned)) return `${label} can use letters, numbers, spaces, apostrophes, periods, and hyphens.`;
  if (blockedTeamTerms.some((term) => lower.includes(term))) return `${label} has a word the league office will not approve.`;
  return "";
}
const initialScoutingState: ScoutingState = {
  isSearching: false,
  activeFocus: null,
  reports: [],
  foundIds: [],
};

function profileSaveKey(user?: AuthUser | null) {
  return user?.email ? `${saveKey}:${user.email}` : `${saveKey}:guest`;
}

function defaultSelections(teams: Team[]): SelectionMap {
  return Object.fromEntries(
    teams.map((team) => [
      team.id,
      {
        lineupIds: team.lineup.map((player) => player.id),
        starterId: team.rotation[0].id,
      },
    ]),
  );
}

function applySelection(team: Team, selection?: TeamSelection): Team {
  if (!selection) return team;
  const hitters = team.roster.filter((player) => player.role === "batter");
  const selectedHitters = selection.lineupIds
    .map((id) => hitters.find((player) => player.id === id))
    .filter((player): player is Player => Boolean(player));
  const fillerHitters = hitters
    .filter((player) => !selection.lineupIds.includes(player.id))
    .sort((left, right) => playerOverall(right) - playerOverall(left));
  const lineup = [...selectedHitters, ...fillerHitters].slice(0, 9);
  const pitchers = team.roster
    .filter((player) => player.role === "pitcher")
    .sort((left, right) => playerOverall(right) - playerOverall(left));
  const starter = pitchers.find((player) => player.id === selection.starterId) ?? pitchers[0];
  const rotation = [starter, ...pitchers.filter((player) => player.id !== starter.id)];

  return {
    ...team,
    lineup,
    rotation,
  };
}

function withPayroll(team: Team): Team {
  return {
    ...team,
    payroll: team.roster.reduce((sum, player) => sum + player.salary, 0) + Object.values(team.staff ?? {}).reduce((sum, staff) => sum + (staff?.salary ?? 0), 0),
  };
}

function money(value: number) {
  if (Math.abs(value) >= 1000) {
    const millions = value / 1000;
    return `$${millions.toLocaleString(undefined, { maximumFractionDigits: millions >= 10 ? 1 : 2 })}M`;
  }
  return `$${value.toLocaleString()}k`;
}

function signedMoney(value: number) {
  return `${value >= 0 ? "+" : "-"}${money(Math.abs(value))}`;
}

function clampScore(value: number, min = 0, max = 99) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function lineRuns(line: BoxLine) {
  return line.runs.reduce((sum, inning) => sum + inning, 0);
}

function emptyLine(): BoxLine {
  return { runs: Array.from({ length: 9 }, () => 0), hits: 0, errors: 0 };
}

function avg(players: Player[], key: keyof Player) {
  return Math.round(players.reduce((sum, player) => sum + Number(player[key]), 0) / players.length);
}

function recommendedLineup(team: Team) {
  return team.roster
    .filter((player) => player.role === "batter")
    .sort((left, right) => playerOverall(right) - playerOverall(left) || right.eye - left.eye)
    .slice(0, 9);
}

function recommendedStarter(team: Team) {
  return team.roster
    .filter((player) => player.role === "pitcher")
    .sort((left, right) => playerOverall(right) - playerOverall(left) || left.fatigue - right.fatigue)[0];
}

function gamePlanForTeam(team: Team) {
  const lineup = team.lineup.length ? team.lineup : recommendedLineup(team);
  const starter = team.rotation[0] ?? recommendedStarter(team);
  const power = avg(lineup, "power");
  const speed = avg(lineup, "speed");
  const eye = avg(lineup, "eye");

  if (starter?.fatigue >= 18) return "Short leash on the starter; protect the middle innings and keep defense on the field.";
  if (power >= speed + 5) return "Let the order swing for crooked innings, then pinch-run once the bench has leverage.";
  if (speed >= power + 5) return "Pressure the defense with steals, hit-and-run calls, and contact-first counts.";
  if (eye >= 70) return "Work deep counts and force tired pitching before opening the power bats.";
  return "Balanced approach: steady starter, clean defense, and aggressive bench moves after the sixth.";
}

function hasUpgrade(purchasedUpgrades: string[], upgradeId: string) {
  return purchasedUpgrades.includes(upgradeId);
}

function makeGameRecord(id: string, day: number, away: Team, home: Team): StoredGameRecord {
  return {
    id,
    day,
    awayId: away.id,
    homeId: home.id,
    label: `${away.abbreviation} at ${home.abbreviation}`,
    status: "scheduled",
  };
}

function gameResultSummary(record: StoredGameRecord) {
  if (!record.sim || typeof record.awayRuns !== "number" || typeof record.homeRuns !== "number") {
    return record.label;
  }
  return `${record.label} - ${record.awayRuns}-${record.homeRuns}`;
}

function scoredRuns(sim: SimGame) {
  return {
    awayRuns: lineRuns(sim.awayLine),
    homeRuns: lineRuns(sim.homeLine),
  };
}

function playerForm(player: Player) {
  if (player.fatigue >= 72) {
    return { label: "Spent", tone: "bad", description: "Fatigue is high enough that this player needs rest soon." };
  }
  if (player.morale <= 38) {
    return { label: "Slump", tone: "bad", description: "Low morale is dragging the player below their normal level." };
  }
  if (player.morale >= 78 && player.fatigue <= 42) {
    return { label: "On a roll", tone: "good", description: "Morale is high and fatigue is under control." };
  }
  if (player.fatigue >= 52) {
    return { label: "Tired", tone: "warn", description: "Usable, but repeated starts will wear this player down." };
  }
  return { label: "Steady", tone: "neutral", description: "No urgent form issue this week." };
}

function eventBelongsToTeam(event: GameEvent, team: Team, sim: SimGame) {
  return (team.id === sim.away.id && event.half === "top") || (team.id === sim.home.id && event.half === "bottom");
}

function matchMvpForTeam(sim: SimGame, team: Team) {
  const scores = new Map<string, number>();
  const playerNames = new Set(team.roster.map((player) => player.name));
  const resultWeights: Record<string, number> = { HR: 7, "3B": 5, "2B": 4, "1B": 3, BB: 2, E: 1, K: -1 };

  sim.events.forEach((event) => {
    if (!eventBelongsToTeam(event, team, sim) || !playerNames.has(event.batter)) return;
    scores.set(event.batter, (scores.get(event.batter) ?? 0) + (resultWeights[event.result] ?? 0) + event.leverage);
  });

  const leader = [...scores.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
  return leader ?? team.lineup[0]?.name ?? team.rotation[0]?.name ?? "No standout";
}

function matchTurningPoint(sim: SimGame) {
  const weightedEvents = sim.events
    .filter((event) => ["HR", "3B", "2B", "1B", "E", "BB"].includes(event.result))
    .sort((left, right) => right.leverage - left.leverage);
  return weightedEvents[0]?.text ?? sim.chronicle[0] ?? sim.headline;
}

function buildMatchImpact(record: StoredGameRecord, sim: SimGame, team: Team): MatchImpact {
  const userIsAway = sim.away.id === team.id;
  const userRuns = userIsAway ? record.awayRuns ?? lineRuns(sim.awayLine) : record.homeRuns ?? lineRuns(sim.homeLine);
  const opponentRuns = userIsAway ? record.homeRuns ?? lineRuns(sim.homeLine) : record.awayRuns ?? lineRuns(sim.awayLine);
  const opponent = userIsAway ? sim.home : sim.away;
  const won = userRuns > opponentRuns;
  const gateIncome = Math.round(90 + team.fanSupport * 5 + team.stadium * 4 + (won ? 90 : 20));
  const sponsorBonus = team.sponsor && won ? team.sponsor.bonus : 0;
  const payrollBill = Math.max(25, Math.round(team.payroll / 40));
  const fanDelta = won ? 3 : -2;
  const chemistryDelta = won ? 2 : -1;
  const moraleDelta = won ? 4 : -3;
  const fatigueDelta = 5 + Math.max(0, Math.min(4, Math.abs(userRuns - opponentRuns)));

  return {
    won,
    score: `${team.abbreviation} ${userRuns}, ${opponent.abbreviation} ${opponentRuns}`,
    opponent: opponent.name,
    mvp: matchMvpForTeam(sim, team),
    turningPoint: matchTurningPoint(sim),
    gateIncome,
    sponsorBonus,
    payrollBill,
    netCash: gateIncome + sponsorBonus - payrollBill,
    fanDelta,
    chemistryDelta,
    moraleDelta,
    fatigueDelta,
  };
}

function applyMatchImpact(team: Team, impact: MatchImpact) {
  const activeIds = new Set([...team.lineup.map((player) => player.id), team.rotation[0]?.id].filter(Boolean));

  return withPayroll({
    ...team,
    cash: Math.max(0, team.cash + impact.netCash),
    fanSupport: clampScore(team.fanSupport + impact.fanDelta, 1, 99),
    chemistry: clampScore(team.chemistry + impact.chemistryDelta, 1, 99),
    roster: team.roster.map((player) =>
      activeIds.has(player.id)
        ? {
          ...player,
          morale: clampScore(player.morale + impact.moraleDelta, 20, 99),
          fatigue: clampScore(player.fatigue + impact.fatigueDelta, 0, 99),
        }
        : {
          ...player,
          morale: clampScore(player.morale + (impact.won ? 1 : -1), 20, 99),
          fatigue: Math.max(0, player.fatigue - 1),
        },
    ),
    lineup: team.lineup.map((player) =>
      activeIds.has(player.id)
        ? {
          ...player,
          morale: clampScore(player.morale + impact.moraleDelta, 20, 99),
          fatigue: clampScore(player.fatigue + impact.fatigueDelta, 0, 99),
        }
        : player,
    ),
    rotation: team.rotation.map((player, index) =>
      index === 0
        ? {
          ...player,
          morale: clampScore(player.morale + impact.moraleDelta, 20, 99),
          fatigue: clampScore(player.fatigue + impact.fatigueDelta + 3, 0, 99),
        }
        : {
          ...player,
          fatigue: Math.max(0, player.fatigue - 2),
        },
    ),
  });
}

function completeGameRecord(day: number, away: Team, home: Team, seed: string, existing?: StoredGameRecord): StoredGameRecord {
  const sim = existing?.sim ?? simulateGame(away, home, seed);
  const { awayRuns, homeRuns } = scoredRuns(sim);
  return {
    ...(existing ?? makeGameRecord(seed, day, away, home)),
    id: existing?.id ?? seed,
    day,
    awayId: away.id,
    homeId: home.id,
    label: `${away.abbreviation} at ${home.abbreviation}`,
    status: "completed",
    eventIndex: sim.events.length - 1,
    sim,
    awayRuns,
    homeRuns,
    completedAt: new Date().toISOString(),
  };
}

function applyRecordedResult(teams: Team[], record: StoredGameRecord) {
  if (!record.sim || typeof record.awayRuns !== "number" || typeof record.homeRuns !== "number") return teams;
  return teams.map((team) => {
    if (team.id === record.awayId) {
      const won = record.awayRuns! > record.homeRuns!;
      return {
        ...team,
        wins: team.wins + (won ? 1 : 0),
        losses: team.losses + (won ? 0 : 1),
        runsFor: team.runsFor + record.awayRuns!,
        runsAgainst: team.runsAgainst + record.homeRuns!,
      };
    }
    if (team.id === record.homeId) {
      const won = record.homeRuns! > record.awayRuns!;
      return {
        ...team,
        wins: team.wins + (won ? 1 : 0),
        losses: team.losses + (won ? 0 : 1),
        runsFor: team.runsFor + record.homeRuns!,
        runsAgainst: team.runsAgainst + record.awayRuns!,
      };
    }
    return team;
  });
}

function resetTeamRecord(team: Team) {
  return {
    ...team,
    wins: 0,
    losses: 0,
    runsFor: 0,
    runsAgainst: 0,
  };
}

function normalizeOwnedLeagueTeams(teams: Team[], ownedTeamId: string | null) {
  if (!ownedTeamId || teams.length % 2 === 0) return teams;
  const removable =
    [...teams].reverse().find((team) => team.id !== ownedTeamId && team.division === "Challenger") ??
    [...teams].reverse().find((team) => team.id !== ownedTeamId);
  return removable ? teams.filter((team) => team.id !== removable.id) : teams;
}

function scheduleIncludesTeam(schedule: ScheduleGame[], teamId: string | null) {
  return Boolean(teamId && schedule.some((game) => game.awayId === teamId || game.homeId === teamId));
}

function StatPill({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="stat-pill">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function GradeBadge({ player }: { player: Player }) {
  const overall = playerOverall(player);
  return (
    <div className="grade-badge" aria-label={`${player.name} overall grade`}>
      <span>{letterGrade(overall)}</span>
      <strong>{overall}</strong>
    </div>
  );
}

function TeamMark({ team }: { team: Team }) {
  return (
    <div className="team-mark" style={{ "--team": team.color, "--team-accent": team.accent } as CSSProperties}>
      <span>{team.abbreviation}</span>
    </div>
  );
}

function Sidebar({
  activeTab,
  onTab,
  team,
  day,
  nextGame,
  navBadges,
}: {
  activeTab: TabId;
  onTab: (tab: TabId) => void;
  team: Team;
  day: number;
  nextGame: string;
  navBadges: Partial<Record<TabId, string>>;
}) {
  return (
    <aside className="sidebar">
      <div className="league-plaque">
        <Trophy size={18} />
        <div>
          <p>Vesper Association</p>
          <strong>Night Ledger</strong>
        </div>
      </div>

      <nav className="side-nav" aria-label="front office sections">
        {appTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <Link
              className={tab.id === activeTab ? "is-active" : ""}
              href={tab.href}
              key={tab.id}
              onClick={() => onTab(tab.id)}
            >
              <Icon size={17} />
              <span>{tab.label}</span>
              {navBadges[tab.id] ? <small>{navBadges[tab.id]}</small> : null}
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-club">
        <TeamMark team={team} />
        <div>
          <p className="eyebrow">Managed club</p>
          <strong>{team.name}</strong>
          <span>{team.division} / {team.wins}-{team.losses}</span>
        </div>
      </div>

      <div className="sidebar-club sidebar-ledger">
        <div>
          <p className="eyebrow">Today</p>
          <strong>Day {day}</strong>
          <span>{nextGame}</span>
        </div>
      </div>
    </aside>
  );
}

function Header({
  day,
  team,
  user,
  onSignOut,
  nextGame,
  nextGameStatus,
}: {
  day: number;
  team: Team;
  user: AuthUser | null;
  onSignOut: () => void;
  nextGame: string;
  nextGameStatus: string;
}) {
  return (
    <header className="header">
      <div className="masthead">
        <div>
          <p className="eyebrow">Day {day} under stadium lights</p>
          <h1>Front Office Ledger</h1>
          <p className="team-story header-note">{nextGameStatus}: {nextGame}</p>
        </div>
        <div className="score-bug" aria-label="club finance summary">
          <span>{team.abbreviation} cash</span>
          <strong>{money(team.cash)}</strong>
          <span>payroll</span>
          <strong>{money(team.payroll)}</strong>
        </div>
        <div className="account-bug">
          <span>{user ? user.email : "Guest manager"}</span>
          {user ? (
            <button onClick={onSignOut} type="button">Sign out</button>
          ) : (
            <Link href="/login">Sign in</Link>
          )}
        </div>
      </div>
    </header>
  );
}

function CreateClubView({ onCreateTeam }: { onCreateTeam: (city: string, mascot: string, budget: StartingBudget) => void }) {
  const [city, setCity] = useState("");
  const [mascot, setMascot] = useState("");
  const [budget, setBudget] = useState<StartingBudget>(100);
  const cityError = city ? validateTeamNamePart(city, "Club city") : "";
  const mascotError = mascot ? validateTeamNamePart(mascot, "Club nickname") : "";
  const canSubmit = Boolean(city && mascot && !cityError && !mascotError);

  return (
    <main className="login-shell">
      <section className="login-panel create-club-panel">
        <p className="eyebrow">New save</p>
        <h1>Create Club</h1>
        <p className="team-story">
          Start from the bottom of the Challenger division. Choose the board budget first, then build around cheap contracts, no staff, and a very patient bus driver.
        </p>
        <div className="dev-login">
          <label htmlFor="club-city">Club City</label>
          <input
            id="club-city"
            onChange={(event) => setCity(event.target.value)}
            placeholder="Mossgate"
            type="text"
            value={city}
          />
          {cityError ? <p className="input-hint is-error">{cityError}</p> : <p className="input-hint">2-24 characters. Keep it clean for the league ledger.</p>}
          <label htmlFor="club-name">Club Nickname</label>
          <input
            id="club-name"
            onChange={(event) => setMascot(event.target.value)}
            placeholder="Rookies"
            type="text"
            value={mascot}
          />
          {mascotError ? <p className="input-hint is-error">{mascotError}</p> : <p className="input-hint">Letters, numbers, spaces, apostrophes, periods, and hyphens are allowed.</p>}
          <div className="budget-choice" role="radiogroup" aria-label="starting budget">
            {startingBudgetOptions.map((option) => (
              <button
                className={budget === option.value ? "is-active" : ""}
                key={option.value}
                onClick={() => setBudget(option.value)}
                type="button"
              >
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </button>
            ))}
          </div>
          <button disabled={!canSubmit} onClick={() => onCreateTeam(city, mascot, budget)} type="button">Join Challenger Division</button>
        </div>
      </section>
    </main>
  );
}

function staffRoleLabel(role: StaffRole) {
  const labels: Record<StaffRole, string> = {
    scout: "Scout",
    assistant: "Assistant Coach",
    batting: "Batting Coach",
    pitching: "Pitching Coach",
    head: "Head Coach",
  };
  return labels[role];
}

function StaffView({
  team,
  onHireStaff,
}: {
  team: Team;
  onHireStaff: (team: Team, staff: StaffMember) => void;
}) {
  const staff = team.staff ?? {};
  const hasAssistant = Boolean(staff.assistant);

  return (
    <section className="view staff-view">
      <div className="section-title">
        <div>
          <p className="eyebrow">Front office hires</p>
          <h2>Staff Office</h2>
        </div>
        <StatPill label="Cash" value={money(team.cash)} />
      </div>

      <div className="stats-columns">
        <section className="pool-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Current staff</p>
              <h3>Clubhouse</h3>
            </div>
          </div>
          <div className="compact-list">
            {(["assistant", "head", "scout", "batting", "pitching"] as StaffRole[]).map((role) => {
              const member = staff[role];
              return (
                <div className={`staff-slot ${member ? "is-filled" : ""}`} key={role}>
                  <span>{staffRoleLabel(role)}</span>
                  <strong>{member?.name ?? "Vacant"}</strong>
                  <small>
                    {member
                      ? `${member.specialty} / ${member.rating} rating / ${money(member.salary)} wage`
                      : role === "batting" || role === "pitching"
                        ? "Requires Assistant Coach"
                        : "Available to hire"}
                  </small>
                </div>
              );
            })}
          </div>
        </section>

        <section className="pool-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Available hires</p>
              <h3>Staff Market</h3>
            </div>
          </div>
          <div className="compact-list">
            {staffMarket.map((candidate) => {
              const locked = (candidate.role === "batting" || candidate.role === "pitching") && !hasAssistant;
              const alreadyHired = Boolean(staff[candidate.role]);
              return (
                <button
                  className="compact-player"
                  disabled={locked || alreadyHired || team.cash < candidate.salary}
                  key={`${candidate.role}-${candidate.name}`}
                  onClick={() => onHireStaff(team, candidate)}
                  type="button"
                >
                  <span className="compact-grade">
                    <strong>{candidate.rating}</strong>
                    {candidate.role.slice(0, 3).toUpperCase()}
                  </span>
                  <span className="compact-name">
                    <strong>{candidate.name}</strong>
                    <small>
                      {staffRoleLabel(candidate.role)} / {candidate.specialty} / cost {money(candidate.salary)}
                    </small>
                  </span>
                  <span className="compact-action">{locked ? "Locked" : alreadyHired ? "Filled" : "Hire"}</span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </section>
  );
}

function PostMatchReport({ impact }: { impact: MatchImpact }) {
  const resultLabel = impact.won ? "Win" : "Loss";

  return (
    <div className={`post-match-report ${impact.won ? "is-win" : "is-loss"}`} aria-label="post match report">
      <div className="post-match-top">
        <div>
          <p className="eyebrow">Post-match report</p>
          <h4>{resultLabel}: {impact.score}</h4>
        </div>
        <strong>{signedMoney(impact.netCash)}</strong>
      </div>
      <p>{impact.turningPoint}</p>
      <div className="impact-grid">
        <span><em>MVP</em><strong>{impact.mvp}</strong></span>
        <span><em>Gate</em><strong>{money(impact.gateIncome)}</strong></span>
        <span><em>Sponsor</em><strong>{money(impact.sponsorBonus)}</strong></span>
        <span><em>Payroll</em><strong>-{money(impact.payrollBill)}</strong></span>
      </div>
      <div className="impact-line">
        <span>Fans {impact.fanDelta >= 0 ? "+" : ""}{impact.fanDelta}</span>
        <span>Chemistry {impact.chemistryDelta >= 0 ? "+" : ""}{impact.chemistryDelta}</span>
        <span>Active morale {impact.moraleDelta >= 0 ? "+" : ""}{impact.moraleDelta}</span>
        <span>Fatigue +{impact.fatigueDelta}</span>
      </div>
    </div>
  );
}

function OfficeView({
  team,
  nextGame,
  nextGameStatus,
  matchImpact,
  canAdvanceDay,
  onAutoPick,
  onNextDay,
}: {
  team: Team;
  nextGame: string;
  nextGameStatus: string;
  matchImpact?: MatchImpact;
  canAdvanceDay: boolean;
  onAutoPick: (team: Team) => void;
  onNextDay: () => void;
}) {
  const wageRoom = team.wageBudget - team.payroll;
  const tableHint =
    team.division === "Premier"
      ? "Bottom club drops into Challenger."
      : "Top club earns promotion into Premier.";
  const isFirstRun = team.wins + team.losses === 0;

  return (
    <section className="view office-view">
      <div className="section-title">
        <div>
          <p className="eyebrow">Club home</p>
          <h2>Press Box</h2>
        </div>
        <TeamMark team={team} />
      </div>

      <div className="office-home">
        <section className="ballpark-anchor">
          <div className="pressbox-board">
            <span>{team.abbreviation}</span>
            <strong>{team.name}</strong>
            <small>{team.division} / {team.wins}-{team.losses}</small>
          </div>
          <div className="clubhouse-rail">
            {team.lineup.slice(0, 5).map((player) => (
              <div className="clubhouse-token" key={player.id}>
                <span>{player.position}</span>
                <strong>{player.name.split(" ").slice(-1)[0]}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="office-panel decision-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Next decision</p>
              <h3>{nextGame}</h3>
            </div>
            <TrendingUp size={20} />
          </div>
          <p className="team-story">{nextGameStatus}. {tableHint} Board target: {team.boardTarget}.</p>
          {matchImpact ? <PostMatchReport impact={matchImpact} /> : null}
          {isFirstRun ? (
            <div className="onboarding-card" aria-label="first manager checklist">
              <p className="eyebrow">First week loop</p>
              <ol>
                <li><strong>Set lineup</strong><span>Use Squad or press best lineup.</span></li>
                <li><strong>Scout market</strong><span>Start one search before spending.</span></li>
                <li><strong>Play match</strong><span>Watch the field resolve each at-bat.</span></li>
                <li><strong>Advance day</strong><span>CPU clubs update after the day closes.</span></li>
              </ol>
            </div>
          ) : null}
          <div className="office-actions">
            <button className="primary-action" onClick={onNextDay} title={canAdvanceDay ? "Advance the league after today's result." : "Go watch today's game before advancing."} type="button">
              {canAdvanceDay ? "Advance Day" : "Watch Match"}
            </button>
            <button onClick={() => onAutoPick(team)} title="Pick the highest overall hitters and best starter." type="button">Set Best Lineup</button>
          </div>
        </section>

        <aside className="office-panel compact-office-status">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Status</p>
              <h3>Ledger</h3>
            </div>
            <DollarSign size={20} />
          </div>
          <div className="team-summary compact-summary office-summary">
            <StatPill label="Overall" value={`${letterGrade(teamOverall(team))} ${teamOverall(team)}`} />
            <StatPill label="Cash" value={money(team.cash)} />
            <StatPill label="Wage Room" value={money(wageRoom)} />
            <StatPill label="Fans" value={team.fanSupport} />
          </div>
        </aside>
      </div>
    </section>
  );
}

function TrainingView({
  team,
  onTrainPlayer,
  onRunCoachWeek,
}: {
  team: Team;
  onTrainPlayer: (team: Team, player: Player, drill: "batting" | "fielding" | "conditioning" | "mastery") => void;
  onRunCoachWeek: (team: Team) => void;
}) {
  const staff = team.staff ?? {};
  const prospects = [...team.roster]
    .sort((left, right) => left.age - right.age || playerOverall(left) - playerOverall(right))
    .slice(0, 10);
  const hitterInsights = team.roster
    .filter((player) => player.role === "batter")
    .sort((left, right) => left.offense - right.offense)
    .slice(0, 4);
  const pitcherInsights = team.roster
    .filter((player) => player.role === "pitcher")
    .sort((left, right) => right.fatigue - left.fatigue || left.defense - right.defense)
    .slice(0, 4);

  return (
    <section className="view training-view">
      <div className="section-title">
        <div>
          <p className="eyebrow">Weekly development slots</p>
          <h2>Training Camp</h2>
        </div>
        <StatPill label="Chemistry" value={team.chemistry} />
      </div>
      <div className="manager-strip">
        <div>
          <span>Assistant Coach</span>
          <strong>{staff.assistant ? "Lineup reports unlocked" : "Required for specialist coaches"}</strong>
        </div>
        <div>
          <span>Batting Coach</span>
          <strong>{staff.batting ? `${staff.batting.name} auto-trains hitters` : "Vacant"}</strong>
        </div>
        <div>
          <span>Pitching Coach</span>
          <strong>{staff.pitching ? `${staff.pitching.name} auto-trains pitchers` : "Vacant"}</strong>
        </div>
        <button disabled={!staff.batting && !staff.pitching} onClick={() => onRunCoachWeek(team)} type="button">
          Run Coach Week
        </button>
      </div>
      <div className="stats-columns">
        <section className="pool-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Prospect focus</p>
              <h3>Drills</h3>
            </div>
          </div>
          <div className="compact-list">
            {prospects.map((player) => (
              <div className="training-row" key={player.id}>
                <CompactPlayerRow action="Focus" player={player} onClick={() => onTrainPlayer(team, player, "mastery")} />
                <div className="training-actions">
                  <button onClick={() => onTrainPlayer(team, player, "batting")} type="button">Bat</button>
                  <button onClick={() => onTrainPlayer(team, player, "fielding")} type="button">Field</button>
                  <button onClick={() => onTrainPlayer(team, player, "conditioning")} type="button">Condition</button>
                  <button onClick={() => onTrainPlayer(team, player, "mastery")} type="button">Mastery</button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="office-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Staff notes</p>
              <h3>Growth Rules</h3>
            </div>
          </div>
          <p className="team-story">
            Young players grow faster. Veterans still benefit from conditioning and mastery reps. Fatigue reduces overall grade until recovery work clears it.
          </p>
          <div className="finance-lines">
            <span>Batting cages <strong>Lv {team.facilities.battingCages}</strong></span>
            <span>Film room <strong>Lv {team.facilities.filmRoom}</strong></span>
            <span>Recovery wing <strong>Lv {team.facilities.recoveryWing}</strong></span>
          </div>
        </section>

        <section className="pool-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Coach insights</p>
              <h3>Form Report</h3>
            </div>
          </div>
          <div className="compact-list">
            {hitterInsights.map((player) => (
              <div className="staff-slot" key={`hit-${player.id}`}>
                <span>{staff.batting ? "Batting Coach" : "No Batting Coach"}</span>
                <strong>{player.name}</strong>
                <small>
                  {staff.batting
                    ? player.offense >= 72
                      ? "On a roll at the plate"
                      : player.offense <= 58
                        ? "Slumping; needs cage reps"
                        : "Stable contact profile"
                    : "Hire batting coach for hitter form reads"}
                </small>
              </div>
            ))}
            {pitcherInsights.map((player) => (
              <div className="staff-slot" key={`pit-${player.id}`}>
                <span>{staff.pitching ? "Pitching Coach" : "No Pitching Coach"}</span>
                <strong>{player.name}</strong>
                <small>
                  {staff.pitching
                    ? player.fatigue >= 18
                      ? "Tired arm; consider rest"
                      : player.defense >= 72
                        ? "Command is sharp"
                        : "Needs bullpen work"
                    : "Hire pitching coach for pitcher form reads"}
                </small>
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function FacilitiesView({
  team,
  purchasedUpgrades,
  onUpgradeNamedFacility,
  onPurchaseNode,
  onCraftGear,
}: {
  team: Team;
  purchasedUpgrades: string[];
  onUpgradeNamedFacility: (team: Team, facility: keyof Team["facilities"]) => void;
  onPurchaseNode: (team: Team, nodeId: string) => void;
  onCraftGear: (team: Team, gear: "bats" | "gloves" | "cleats" | "uniforms") => void;
}) {
  const facilities = [
    ["battingCages", "Batting Cages", "Offense training"],
    ["bullpenMounds", "Bullpen Mounds", "Pitcher defense"],
    ["weightRoom", "Weight Room", "Stamina and power"],
    ["filmRoom", "Film Room", "Mastery and scouting"],
    ["recoveryWing", "Recovery Wing", "Fatigue recovery"],
  ] as const;

  return (
    <section className="view facilities-view">
      <div className="section-title">
        <div>
          <p className="eyebrow">Crafting and upgrades</p>
          <h2>Facilities</h2>
        </div>
        <StatPill label="Materials" value={`${team.materials.lumber}/${team.materials.leather}/${team.materials.thread}`} />
      </div>
      <div className="facility-tree-layout">
        <section className="pool-panel facility-levels">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Facility levels</p>
              <h3>Clubhouse Spine</h3>
            </div>
          </div>
          <div className="compact-list">
            {facilities.map(([key, label, note]) => (
              <button className="compact-player" key={key} onClick={() => onUpgradeNamedFacility(team, key)} type="button">
                <span className="compact-grade">
                  <strong>Lv</strong>
                  {team.facilities[key]}
                </span>
                <span className="compact-name">
                  <strong>{label}</strong>
                  <small>{note} / cost {money(500 + team.facilities[key] * 240)}</small>
                </span>
                <span className="compact-action">Upgrade</span>
              </button>
            ))}
          </div>
        </section>

        <section className="pool-panel facility-node-board">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Locked and unlocked perks</p>
              <h3>Upgrade Grid</h3>
            </div>
          </div>
          <div className="facility-node-grid">
            {facilityNodes.map((node) => {
              const unlocked = team.facilities[node.facility] >= node.level;
              const purchased = hasUpgrade(purchasedUpgrades, node.id);
              return (
                <button
                  className={`facility-node ${unlocked ? "is-unlocked" : "is-locked"} ${purchased ? "is-owned" : ""}`}
                  disabled={!unlocked || purchased || team.cash < node.cost}
                  key={node.id}
                  onClick={() => onPurchaseNode(team, node.id)}
                  type="button"
                >
                  <span>Lv {node.level}</span>
                  <strong>{node.name}</strong>
                  <small>{purchased ? "Purchased" : unlocked ? `${money(node.cost)} / ${node.effect}` : `Upgrade ${node.facility} to Lv ${node.level}`}</small>
                </button>
              );
            })}
          </div>
        </section>

        <section className="pool-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Team gear</p>
              <h3>Crafting Bench</h3>
            </div>
          </div>
          {!hasUpgrade(purchasedUpgrades, "crafting-bench") ? (
            <div className="empty-scouting">Locked. Purchase Equipment Bench in the facility grid.</div>
          ) : null}
          <div className="compact-list">
            {(["bats", "gloves", "cleats", "uniforms"] as const).map((gear) => (
              <button
                className="compact-player"
                disabled={!hasUpgrade(purchasedUpgrades, "crafting-bench")}
                key={gear}
                onClick={() => onCraftGear(team, gear)}
                type="button"
              >
                <span className="compact-grade">
                  <strong>+1</strong>
                  {gear === "bats" ? "OFF" : gear === "gloves" ? "DEF" : gear === "cleats" ? "SPD" : "MOR"}
                </span>
                <span className="compact-name">
                  <strong>{gear}</strong>
                  <small>Consumes lumber, leather, and thread from match rewards.</small>
                </span>
                <span className="compact-action">Craft</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function SponsorsView({
  team,
  onAcceptSponsor,
  onMediaDay,
}: {
  team: Team;
  onAcceptSponsor: (team: Team, sponsor: Sponsor) => void;
  onMediaDay: (team: Team) => void;
}) {
  return (
    <section className="view sponsors-view">
      <div className="section-title">
        <div>
          <p className="eyebrow">Off-day income</p>
          <h2>Sponsors</h2>
        </div>
        <StatPill label="Fan Support" value={team.fanSupport} />
      </div>
      <div className="stats-columns">
        <section className="office-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Current sponsor</p>
              <h3>{team.sponsor?.name ?? "Unsigned"}</h3>
            </div>
            <Megaphone size={20} />
          </div>
          <p className="team-story">
            {team.sponsor ? `${team.sponsor.condition}. Bonus: ${money(team.sponsor.bonus)}.` : "Sign a parody brand for season income and performance bonuses."}
          </p>
          <div className="office-actions">
            <button onClick={() => onMediaDay(team)} type="button">Run Media Day</button>
          </div>
        </section>

        <section className="pool-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Offers</p>
              <h3>Sponsor Board</h3>
            </div>
          </div>
          <div className="compact-list">
            {sponsorPool.map((sponsor) => (
              <button className="compact-player" key={sponsor.name} onClick={() => onAcceptSponsor(team, sponsor)} type="button">
                <span className="compact-grade">
                  <strong>$</strong>
                  {sponsor.offer}
                </span>
                <span className="compact-name">
                  <strong>{sponsor.name}</strong>
                  <small>{sponsor.condition} / bonus {money(sponsor.bonus)}</small>
                </span>
                <span className="compact-action">Sign</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function AbbrevStat({ abbreviation, label, value }: { abbreviation: string; label: string; value: number | string }) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className={`abbrev-stat ${open ? "is-open" : ""}`}
      onBlur={() => setOpen(false)}
      onClick={() => setOpen((current) => !current)}
      onFocus={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onMouseEnter={() => setOpen(true)}
      role="button"
      tabIndex={0}
      aria-label={`${label}: ${value}`}
    >
      <strong>
        {abbreviation} <span>{value}</span>
      </strong>
      {open ? <small>{label}</small> : null}
    </span>
  );
}

function PlayerCard({
  player,
  selected,
  disabled,
  onToggle,
}: {
  player: Player;
  selected?: boolean;
  disabled?: boolean;
  onToggle?: () => void;
}) {
  const statTooltips: Record<string, string> = {
    CON: "Contact: how often the batter puts the ball in play",
    POW: "Power: extra-base and home run threat",
    EYE: "Plate eye: walks, discipline, and avoiding chase pitches",
    DEF: "Defense: overall fielding and run prevention",
    FAT: "Fatigue: how much the player has left in the tank",
    STF: "Stuff: pitch quality and strikeout pressure",
    CTL: "Control: command and walk prevention",
    STA: "Stamina: how deep the pitcher can work",
  };
  const mainStats: Array<[string, number]> =
    player.role === "pitcher"
      ? [
        ["DEF", player.defense],
        ["STF", player.stuff],
        ["CTL", player.control],
        ["STA", player.stamina],
        ["FAT", player.fatigue],
      ]
      : [
        ["CON", player.contact],
        ["POW", player.power],
        ["EYE", player.eye],
      ];
  const factors = playerGradeFactors(player);
  const form = playerForm(player);

  return (
    <article className={`player-card ${selected ? "is-selected" : ""}`}>
      <div className="card-topline">
        <span>{player.position}</span>
        <span>{player.age}</span>
      </div>
      <GradeBadge player={player} />
      <h3>{player.name}</h3>
      <p className="nickname">"{player.nickname}"</p>
      <div className="player-card-flags">
        <p className="technique-line">{player.signatureTechnique}</p>
        <span className={`form-badge is-${form.tone}`} title={form.description}>{form.label}</span>
      </div>
      <div className="mini-stats">
        {mainStats.map(([label, value]) => (
          <AbbrevStat abbreviation={label} key={label} label={statTooltips[label] ?? label} value={value} />
        ))}
      </div>
      <div className="trait-row">
        {player.traits.map((trait) => (
          <span key={trait.id} title={trait.description}>
            {trait.name}
          </span>
        ))}
      </div>
      <div className="factor-list">
        {factors.slice(0, 4).map((factor) => (
          <span key={factor.label} title={`${factor.label}: ${factor.value}`}>
            <em>{factor.label}</em>
            <strong>{factor.value}</strong>
            <b style={{ inlineSize: `${factor.value}%` }} />
          </span>
        ))}
      </div>
      <p className="scout-note">{player.note}</p>
      {onToggle ? (
        <button className="pick-button" disabled={disabled} onClick={onToggle} type="button">
          <UserCheck size={15} />
          <span>{selected ? (player.role === "pitcher" ? "Starter" : "Picked") : player.role === "pitcher" ? "Start" : "Pick"}</span>
        </button>
      ) : null}
    </article>
  );
}

function CompactPlayerRow({
  player,
  action,
  active,
  onClick,
}: {
  player: Player;
  action: string;
  active?: boolean;
  onClick: () => void;
}) {
  const overall = playerOverall(player);
  const stats =
    player.role === "pitcher"
      ? `DEF ${player.defense} / STF ${player.stuff} / CTL ${player.control} / STA ${player.stamina} / FAT ${player.fatigue}`
      : `CON ${player.contact} / POW ${player.power} / EYE ${player.eye}`;

  return (
    <button className={`compact-player ${active ? "is-active" : ""}`} onClick={onClick} type="button">
      <span className="compact-grade">
        <strong>{letterGrade(overall)}</strong>
        {overall}
      </span>
      <span className="compact-name">
        <strong>{player.name}</strong>
        <small>{player.position} / {stats}</small>
      </span>
      <span className="compact-action">{action}</span>
    </button>
  );
}

function SquadView({
  team,
  selection,
  freeAgents,
  onTogglePlayer,
  onAutoPick,
  onSign,
  onRelease,
}: {
  team: Team;
  selection: TeamSelection;
  freeAgents: Player[];
  onTogglePlayer: (team: Team, player: Player) => void;
  onAutoPick: (team: Team) => void;
  onSign: (player: Player) => void;
  onRelease: (team: Team, player: Player) => void;
}) {
  const hitters = team.roster
    .filter((player) => player.role === "batter")
    .sort((left, right) => playerOverall(right) - playerOverall(left));
  const pitchers = team.roster
    .filter((player) => player.role === "pitcher")
    .sort((left, right) => playerOverall(right) - playerOverall(left));
  const lineupSet = new Set(selection.lineupIds);
  const selectedHitters = selection.lineupIds
    .map((id) => hitters.find((player) => player.id === id))
    .filter((player): player is Player => Boolean(player));
  const benchHitters = hitters.filter((player) => !lineupSet.has(player.id));
  const starter = pitchers.find((player) => player.id === selection.starterId) ?? pitchers[0];
  const market = freeAgents.slice(0, 9);
  const staff = team.staff ?? {};
  const assistantLineup = recommendedLineup(team);
  const assistantStarter = recommendedStarter(team);

  return (
    <section className="view roster-view">
      <div className="section-title">
        <div>
          <p className="eyebrow">{team.city} notebook</p>
          <h2>{team.mascot}</h2>
        </div>
        <div className="token-strip">
          <span style={{ background: team.color }} />
          <span style={{ background: team.accent }} />
          <span />
        </div>
      </div>
      <div className="team-summary">
        <StatPill label="Overall" value={`${letterGrade(teamOverall(team))} ${teamOverall(team)}`} />
        <StatPill label="Contact" value={avg(team.lineup, "contact")} />
        <StatPill label="Power" value={avg(team.lineup, "power")} />
        <StatPill label="Starter" value={`${letterGrade(playerOverall(starter))} ${playerOverall(starter)}`} />
      </div>
      <div className="manager-strip">
        <div>
          <span>Lineup card</span>
          <strong>{selection.lineupIds.length}/9 hitters picked</strong>
        </div>
        <div>
          <span>Probable starter</span>
          <strong>{starter.name}</strong>
        </div>
        <div>
          <span>Wage room</span>
          <strong>{money(team.wageBudget - team.payroll)}</strong>
        </div>
        <button onClick={() => onAutoPick(team)} type="button">
          Auto Best
        </button>
      </div>
      <div className={`coach-note ${staff.assistant ? "is-active" : ""}`}>
        <span>Assistant Coach</span>
        <strong>
          {staff.assistant
            ? `${staff.assistant.name}: ${assistantLineup
              .slice(0, 4)
              .map((player) => player.name.split(" ").slice(-1)[0])
              .join(", ")} should anchor the order.`
            : "Hire an Assistant Coach to unlock batting and pitching lineup recommendations."}
        </strong>
        <small>
          {staff.assistant
            ? `Pitching recommendation: start ${assistantStarter?.name ?? starter.name}. Specialist coaches unlock after this role is filled.`
            : "Batting Coach and Pitching Coach cannot be signed until the assistant chair is filled."}
        </small>
      </div>
      <p className="team-story">{team.name}: {team.story}.</p>

      <div className="roster-workbench">
        <section className="lineup-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Step 1</p>
              <h3>Starting Lineup</h3>
            </div>
            <ListChecks size={20} />
          </div>
          <div className="lineup-card">
            {Array.from({ length: 9 }, (_, index) => {
              const player = selectedHitters[index];
              return (
                <button
                  className={`lineup-slot ${player ? "is-filled" : ""}`}
                  disabled={!player}
                  key={`${team.id}-slot-${index}`}
                  onClick={() => player && onTogglePlayer(team, player)}
                  type="button"
                >
                  <span>{index + 1}</span>
                  <strong>{player?.name ?? "Empty slot"}</strong>
                  <small>{player ? `${player.position} / ${letterGrade(playerOverall(player))} ${playerOverall(player)}` : "Pick a bench hitter"}</small>
                </button>
              );
            })}
          </div>

          <div className="starter-card">
            <span>Starting Pitcher</span>
            <strong>{starter.name}</strong>
            <small>
              {letterGrade(playerOverall(starter))} {playerOverall(starter)} / {" "}
              <AbbrevStat abbreviation="DEF" label="Defense" value={starter.defense} /> / {" "}
              <AbbrevStat abbreviation="STF" label="Stuff" value={starter.stuff} /> / {" "}
              <AbbrevStat abbreviation="CTL" label="Control" value={starter.control} /> / {" "}
              <AbbrevStat abbreviation="STA" label="Stamina" value={starter.stamina} /> / {" "}
              <AbbrevStat abbreviation="FAT" label="Fatigue" value={starter.fatigue} />
            </small>
          </div>
        </section>

        <section className="pool-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Step 2</p>
              <h3>Pick Players</h3>
            </div>
          </div>

          <div className="pool-section">
            <h4>Bench Hitters</h4>
            <div className="compact-list">
              {benchHitters.map((player) => (
                <CompactPlayerRow
                  action={selection.lineupIds.length >= 9 ? "Swap In" : "Pick"}
                  key={player.id}
                  onClick={() => onTogglePlayer(team, player)}
                  player={player}
                />
              ))}
            </div>
          </div>

          <div className="pool-section">
            <h4>Pitching Staff</h4>
            <div className="compact-list">
              {pitchers.map((player) => (
                <CompactPlayerRow
                  action={selection.starterId === player.id ? "Starting" : "Start"}
                  active={selection.starterId === player.id}
                  key={player.id}
                  onClick={() => onTogglePlayer(team, player)}
                  player={player}
                />
              ))}
            </div>
          </div>

          <div className="pool-section">
            <h4>Transfer Market</h4>
            <div className="compact-list">
              {market.map((player) => (
                <button
                  className="compact-player"
                  disabled={team.cash < player.value || team.payroll + player.salary > team.wageBudget}
                  key={player.id}
                  onClick={() => onSign(player)}
                  type="button"
                >
                  <span className="compact-grade">
                    <strong>{letterGrade(playerOverall(player))}</strong>
                    {playerOverall(player)}
                  </span>
                  <span className="compact-name">
                    <strong>{player.name}</strong>
                    <small>{player.position} / fee {money(player.value)} / wage {money(player.salary)}</small>
                  </span>
                  <span className="compact-action">Sign</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="scout-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Step 3</p>
              <h3>Scout Cards</h3>
            </div>
          </div>
          <div className="featured-cards">
            {[starter, ...selectedHitters.slice(0, 2)].map((player) => (
              <div className="release-wrap" key={player.id}>
                <PlayerCard player={player} selected />
                <button onClick={() => onRelease(team, player)} type="button">Release</button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function MarketView({
  team,
  prospects,
  scoutingState,
  purchasedUpgrades,
  seasonWeek,
  onStartScouting,
  onSign,
  onRelease,
}: {
  team: Team;
  prospects: Player[];
  scoutingState: ScoutingState;
  purchasedUpgrades: string[];
  seasonWeek: number;
  onStartScouting: (team: Team, focus: ScoutingFocus) => void;
  onSign: (player: Player) => void;
  onRelease: (team: Team, player: Player) => void;
}) {
  const rosterByValue = [...team.roster].sort((left, right) => right.value - left.value).slice(0, 8);
  const scoutSlots = hasUpgrade(purchasedUpgrades, "scout-slot-2") ? 2 : 1;
  const focusOptions: Array<{ id: ScoutingFocus; label: string; cost: number; note: string; locked?: boolean }> = [
    { id: "local", label: "Local Sandlots", cost: 80, note: "Cheap search; common depth pieces." },
    { id: "college", label: "College Ledger", cost: 140, note: "Balanced odds for young prospects." },
    { id: "veteran", label: "Veteran Files", cost: 260, note: "Steady players, higher wages.", locked: !hasUpgrade(purchasedUpgrades, "veteran-scouting") },
    { id: "rising", label: "Rising Stars", cost: 420, note: "Rare high-upside finds.", locked: !hasUpgrade(purchasedUpgrades, "rising-star-scouting") },
  ];

  return (
    <section className="view market-view">
      <div className="section-title">
        <div>
          <p className="eyebrow">Recruitment desk</p>
          <h2>Scouting Office</h2>
        </div>
        <StatPill label="Cash" value={money(team.cash)} />
      </div>
      <div className="stats-columns">
        <section className="pool-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Search actions</p>
              <h3>Scout Network</h3>
            </div>
          </div>
          <div className="scout-status">
            <span>Report slots</span>
            <strong>{scoutingState.foundIds.length}/{scoutSlots}</strong>
            <small>{scoutingState.isSearching ? `Searching ${scoutingState.activeFocus} reports...` : "Commit cash to roll for 0-3 prospects."}</small>
          </div>
          <div className="scout-grid">
            {focusOptions.map((focus) => (
              <button
                className={`scout-card ${focus.locked ? "is-locked" : ""}`}
                disabled={Boolean(focus.locked) || scoutingState.isSearching || team.cash < focus.cost}
                key={focus.id}
                onClick={() => onStartScouting(team, focus.id)}
                type="button"
              >
                <strong>{focus.label}</strong>
                <span>{focus.note}</span>
                <small>{focus.locked ? "Locked by Facilities" : `${money(focus.cost)} / resolves shortly`}</small>
              </button>
            ))}
          </div>
          <div className="chronicle-feed mini-feed">
            {scoutingState.reports.slice(0, 3).map((report) => (
              <article className="chronicle-entry" key={report.id}>
                <span>W{report.week}</span>
                <p>{report.summary}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="pool-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Discovered prospects</p>
              <h3>Scouting Reports</h3>
            </div>
          </div>
          <div className="compact-list">
            {prospects.length ? (
              prospects.map((player) => (
                <button
                  className="compact-player"
                  disabled={team.cash < player.value || team.payroll + player.salary > team.wageBudget}
                  key={player.id}
                  onClick={() => onSign(player)}
                  type="button"
                >
                  <span className="compact-grade">
                    <strong>{letterGrade(playerOverall(player))}</strong>
                    {playerOverall(player)}
                  </span>
                  <span className="compact-name">
                    <strong>{player.name}</strong>
                    <small>{player.position} / fee {money(player.value)} / wage {money(player.salary)} / Week {seasonWeek}</small>
                  </span>
                  <span className="compact-action">Sign</span>
                </button>
              ))
            ) : (
              <div className="empty-scouting">No active prospect reports. Send scouts before signing.</div>
            )}
          </div>
        </section>

        <section className="pool-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Your assets</p>
              <h3>Sell or Release</h3>
            </div>
          </div>
          <div className="compact-list">
            {rosterByValue.map((player) => (
              <button className="compact-player" key={player.id} onClick={() => onRelease(team, player)} type="button">
                <span className="compact-grade">
                  <strong>{letterGrade(playerOverall(player))}</strong>
                  {playerOverall(player)}
                </span>
                <span className="compact-name">
                  <strong>{player.name}</strong>
                  <small>{player.position} / sale estimate {money(Math.round(player.value * 0.35))}</small>
                </span>
                <span className="compact-action">Release</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function playerLastName(name: string) {
  return name.split(" ").at(-1) ?? name;
}

function BaseballField({ game, event }: { game: ReturnType<typeof simulateGame>; event: GameEvent }) {
  const defense = event.half === "top" ? game.home : game.away;
  const offense = event.half === "top" ? game.away : game.home;
  const pitcher = defense.rotation.find((player) => player.name === event.pitcher) ?? defense.rotation[0];
  const batter = offense.lineup.find((player) => player.name === event.batter) ?? offense.lineup[0];
  const fielder = (position: string, fallbackIndex: number) =>
    defense.lineup.find((player) => player.position === position) ?? defense.lineup[fallbackIndex % defense.lineup.length];
  const defenders = [
    { key: "p", label: "P", player: pitcher, x: 50, y: 58, active: true },
    { key: "c", label: "C", player: fielder("C", 0), x: 50, y: 86 },
    { key: "1b", label: "1B", player: fielder("1B", 1), x: 70, y: 61 },
    { key: "2b", label: "2B", player: fielder("2B", 2), x: 60, y: 43 },
    { key: "ss", label: "SS", player: fielder("SS", 4), x: 39, y: 43 },
    { key: "3b", label: "3B", player: fielder("3B", 3), x: 30, y: 61 },
    { key: "lf", label: "LF", player: fielder("LF", 5), x: 22, y: 25 },
    { key: "cf", label: "CF", player: fielder("CF", 6), x: 50, y: 16 },
    { key: "rf", label: "RF", player: fielder("RF", 7), x: 78, y: 25 },
  ];
  const bases = [
    { label: "1B", runner: event.bases[0], x: 69, y: 67 },
    { label: "2B", runner: event.bases[1], x: 50, y: 45 },
    { label: "3B", runner: event.bases[2], x: 31, y: 67 },
  ] satisfies Array<{ label: string; runner: BaseRunner; x: number; y: number }>;

  return (
    <section className="field-view" aria-label="live baseball field">
      <div className="field-score-strip">
        <span>{defense.abbreviation} in field</span>
        <strong>{game.away.abbreviation} {event.awayScore} - {event.homeScore} {game.home.abbreviation}</strong>
        <span>{offense.abbreviation} batting</span>
      </div>
      <div className="field-canvas">
        <div className="outfield-arc" />
        <div className="infield-dirt" />
        <div className="foul-line left" />
        <div className="foul-line right" />
        <div className="home-plate" />
        <div className="mound-spot" />
        {bases.map((base) => (
          <div
            className={`field-base ${base.runner ? "is-occupied" : ""}`}
            key={base.label}
            style={{ left: `${base.x}%`, top: `${base.y}%` }}
          >
            <span>{base.label}</span>
            {base.runner ? <strong>{playerLastName(base.runner.name)}</strong> : null}
          </div>
        ))}
        {defenders.map((spot) => (
          <div
            className={`field-player ${spot.active ? "is-focus" : ""}`}
            key={spot.key}
            style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
          >
            <span>{spot.label}</span>
            <strong>{playerLastName(spot.player.name)}</strong>
          </div>
        ))}
        <div className="field-player is-batter" style={{ left: "57%", top: "88%" }}>
          <span>BAT</span>
          <strong>{playerLastName(batter.name)}</strong>
        </div>
      </div>
      <div className="field-matchup">
        <div>
          <span>Pitcher</span>
          <strong>{pitcher.name}</strong>
          <small>{pitcher.signatureTechnique}</small>
        </div>
        <div>
          <span>Batter</span>
          <strong>{batter.name}</strong>
          <small>{batter.signatureTechnique}</small>
        </div>
      </div>
    </section>
  );
}

function liveLineScore(game: ReturnType<typeof simulateGame>, eventIndex: number) {
  const awayLine: BoxLine = { runs: Array.from({ length: 9 }, () => 0), hits: 0, errors: 0 };
  const homeLine: BoxLine = { runs: Array.from({ length: 9 }, () => 0), hits: 0, errors: 0 };
  let awayScore = 0;
  let homeScore = 0;

  game.events.slice(0, eventIndex + 1).forEach((event) => {
    const inningIndex = Math.max(0, event.inning - 1);
    while (awayLine.runs.length <= inningIndex) awayLine.runs.push(0);
    while (homeLine.runs.length <= inningIndex) homeLine.runs.push(0);
    const awayDelta = Math.max(0, event.awayScore - awayScore);
    const homeDelta = Math.max(0, event.homeScore - homeScore);
    awayLine.runs[inningIndex] += awayDelta;
    homeLine.runs[inningIndex] += homeDelta;
    const isHit = event.result === "1B" || event.result === "2B" || event.result === "3B" || event.result === "HR";
    if (isHit && event.half === "top") awayLine.hits += 1;
    if (isHit && event.half === "bottom") homeLine.hits += 1;
    if (event.result === "E" && event.half === "top") homeLine.errors += 1;
    if (event.result === "E" && event.half === "bottom") awayLine.errors += 1;
    awayScore = event.awayScore;
    homeScore = event.homeScore;
  });

  return { awayLine, homeLine };
}

function LineScore({ away, home, awayLine, homeLine }: { away: Team; home: Team; awayLine: BoxLine; homeLine: BoxLine }) {
  const innings = awayLine.runs.map((_, index) => index + 1);
  const total = (line: BoxLine) => line.runs.reduce((sum, run) => sum + run, 0);

  return (
    <table className="line-score">
      <thead>
        <tr>
          <th>Club</th>
          {innings.map((inning) => (
            <th key={inning}>{inning}</th>
          ))}
          <th>R</th>
          <th>H</th>
          <th>E</th>
        </tr>
      </thead>
      <tbody>
        {[
          [away, awayLine],
          [home, homeLine],
        ].map(([team, line]) => (
          <tr key={(team as Team).id}>
            <th>{(team as Team).abbreviation}</th>
            {(line as BoxLine).runs.map((run, index) => (
              <td key={index}>{run}</td>
            ))}
            <td>{total(line as BoxLine)}</td>
            <td>{(line as BoxLine).hits}</td>
            <td className={(line as BoxLine).errors > 0 ? "danger" : ""}>{(line as BoxLine).errors}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MatchView({
  game,
  team,
  eventIndex,
  gameStatus,
  onNext,
  onSkip,
  onReset,
  onRecordWeek,
}: {
  game: ReturnType<typeof simulateGame>;
  team: Team;
  eventIndex: number;
  gameStatus: "scheduled" | "in-progress" | "completed";
  onNext: () => void;
  onSkip: () => void;
  onReset: () => void;
  onRecordWeek: () => void;
}) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [simSpeed, setSimSpeed] = useState<"normal" | "fast">("normal");
  const event = game.events[Math.min(eventIndex, game.events.length - 1)];
  const awayStarter = game.away.rotation[0];
  const homeStarter = game.home.rotation[0];
  const recentEvents = game.events.slice(Math.max(0, eventIndex - 4), eventIndex + 1).reverse();
  const headCoach = team.staff?.head;
  const headCoachPlan = headCoach ? gamePlanForTeam(team) : null;
  const isComplete = gameStatus === "completed" || eventIndex >= game.events.length - 1;
  const liveLines = isComplete ? { awayLine: game.awayLine, homeLine: game.homeLine } : liveLineScore(game, eventIndex);
  const stepDelay = (() => {
    const base = simSpeed === "fast" ? 260 : 620;
    const scoringPlay = event.result === "HR" || event.result === "3B" || event.result === "2B" || event.result === "1B" || event.result === "BB" || event.result === "E";
    const controlMoment = event.outs >= 3 || event.result === "OUT";
    if (scoringPlay) return base + (simSpeed === "fast" ? 220 : 520);
    if (controlMoment) return base + (simSpeed === "fast" ? 80 : 180);
    return base;
  })();

  useEffect(() => {
    if (!isPlaying || isComplete) return;
    const timer = window.setTimeout(onNext, stepDelay);
    return () => window.clearTimeout(timer);
  }, [eventIndex, isComplete, isPlaying, onNext, stepDelay]);

  useEffect(() => {
    if (isComplete) setIsPlaying(false);
  }, [isComplete]);

  useEffect(() => {
    if (isComplete && gameStatus !== "completed") {
      onRecordWeek();
    }
  }, [gameStatus, isComplete, onRecordWeek]);

  return (
    <section className="view game-view">
      <div className="scoreboard-panel">
        <div className="scoreboard-top">
          <div>
            <p className="eyebrow">Game Center</p>
            <h2>{game.away.abbreviation} at {game.home.abbreviation}</h2>
          </div>
          <div className="inning-light">
            <span>{event.half === "top" ? "TOP" : "BOT"} {event.inning}</span>
            <strong>{event.outs} OUT</strong>
          </div>
        </div>

        <div className="game-brief">
          <div>
            <span>{game.away.abbreviation}</span>
            <strong>{letterGrade(teamOverall(game.away))} {teamOverall(game.away)}</strong>
            <small>{awayStarter.name} starts</small>
          </div>
          <div>
            <span>{game.home.abbreviation}</span>
            <strong>{letterGrade(teamOverall(game.home))} {teamOverall(game.home)}</strong>
            <small>{homeStarter.name} starts</small>
          </div>
          <div>
            <span>Play</span>
            <strong>{eventIndex + 1}/{game.events.length}</strong>
            <small>{event.batter} batting</small>
          </div>
        </div>

        <div className="ticker" aria-label="scoreboard ticker">
          <span>{event.ticker} / {isComplete ? `${game.headline} / ${game.final}` : "Match in progress"} / {event.ticker}</span>
        </div>

        {headCoach && headCoachPlan ? (
          <div className="coach-note is-active gameplan-note">
            <span>Head Coach Gameplan</span>
            <strong>{headCoach.name}</strong>
            <small>{headCoachPlan}</small>
          </div>
        ) : null}

        <div className="game-grid">
          <BaseballField game={game} event={event} />
          <aside className="play-feed">
            <LineScore away={game.away} home={game.home} awayLine={liveLines.awayLine} homeLine={liveLines.homeLine} />
            <article className="play-card">
              <div className="result-light">{event.result}</div>
              <h3>{event.batter} vs. {event.pitcher}</h3>
              <p>{event.text}</p>
              <meter min="0" max="1" value={event.leverage} />
            </article>
            <div className="event-timeline">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Live feed</p>
                  <h3>Recent Plays</h3>
                </div>
              </div>
              {recentEvents.map((play) => (
                <article className={play.id === event.id ? "is-current" : ""} key={play.id}>
                  <span>{play.half === "top" ? "TOP" : "BOT"} {play.inning} / {play.outs} OUT</span>
                  <strong>{play.result}</strong>
                  <p>{play.text}</p>
                </article>
              ))}
            </div>
            <div className="controls">
              <button onClick={() => setIsPlaying((current) => !current)} type="button">
                {isPlaying ? <Pause size={17} /> : <Play size={17} />}
                <span>{isPlaying ? "Pause" : "Play"}</span>
              </button>
              <button disabled={isComplete} onClick={onNext} type="button">
                <SkipForward size={17} />
                <span>Step</span>
              </button>
              <button onClick={onSkip} type="button">
                <SkipForward size={17} />
                <span>Final</span>
              </button>
              <button onClick={onReset} type="button">
                <RotateCcw size={17} />
                <span>Reset</span>
              </button>
              <button onClick={() => setSimSpeed((current) => (current === "normal" ? "fast" : "normal"))} type="button">
                <Radio size={17} />
                <span>{simSpeed === "normal" ? "Normal" : "Fast"}</span>
              </button>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

function ChronicleView({ entries, game }: { entries: string[]; game: ReturnType<typeof simulateGame> }) {
  return (
    <section className="view chronicle-view">
      <div className="section-title">
        <div>
          <p className="eyebrow">Scouting notebook</p>
          <h2>Chronicle</h2>
        </div>
        <Activity size={22} />
      </div>
      <div className="chronicle-feed">
        {[...game.chronicle, ...entries].map((entry, index) => (
          <article key={`${entry}-${index}`} className="chronicle-entry">
            <span>#{String(index + 1).padStart(2, "0")}</span>
            <p>{entry}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function LeagueView({ teams, seasonState, team }: { teams: Team[]; seasonState: SeasonState; team: Team }) {
  const standings = [...teams].sort((left, right) => right.wins - left.wins || left.losses - right.losses || right.runsFor - left.runsFor);
  const divisions: Record<Team["division"], Team[]> = {
    Premier: standings.filter((candidate) => candidate.division === "Premier"),
    Challenger: standings.filter((candidate) => candidate.division === "Challenger"),
  };
  const statLeaders = [...teams.flatMap((candidate) => candidate.lineup.map((player) => ({ ...player, team: candidate.abbreviation })))]
    .sort((left, right) => playerOverall(right) - playerOverall(left))
    .slice(0, 8);
  const isOffseason = seasonState.phase === "offseason";
  const [activeDivision, setActiveDivision] = useState<Team["division"]>(team.division);
  const [activeTile, setActiveTile] = useState("premier-top");

  useEffect(() => {
    setActiveDivision(team.division);
  }, [team.division]);

  const overviewTiles = [
    { id: "premier-top", label: "Premier Top Half", teams: divisions.Premier.slice(0, 2) },
    { id: "premier-bottom", label: "Premier Bottom Half", teams: divisions.Premier.slice(2) },
    { id: "challenger-top", label: "Challenger Top Half", teams: divisions.Challenger.slice(0, 2) },
    { id: "challenger-bottom", label: "Challenger Bottom Half", teams: divisions.Challenger.slice(2) },
  ];
  const activeTileTeams = overviewTiles.find((tile) => tile.id === activeTile)?.teams ?? overviewTiles[0].teams;
  const activeDivisionTeams = divisions[activeDivision];
  const divisionOrder: Array<Team["division"]> = team.division === "Premier" ? ["Premier", "Challenger"] : ["Challenger", "Premier"];
  const moveStatus = (candidate: Team, index: number, list: Team[]) => {
    if (candidate.division === "Premier" && index === list.length - 1) return "Relegation";
    if (candidate.division === "Challenger" && index === 0) return "Promotion";
    return "";
  };

  function renderStandingsTable(list: Team[], caption: string) {
    return (
      <table className="ledger-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th>Team</th>
            <th>OVR</th>
            <th>W</th>
            <th>L</th>
            <th>RF</th>
            <th>RA</th>
            <th>Move</th>
          </tr>
        </thead>
        <tbody>
          {list.map((candidate, index) => (
            <tr className={`${candidate.id === team.id ? "is-user-team" : ""} ${moveStatus(candidate, index, list) === "Promotion" ? "is-promotion" : ""} ${moveStatus(candidate, index, list) === "Relegation" ? "is-relegation" : ""}`} key={candidate.id}>
              <th>{candidate.name}</th>
              <td>{teamOverall(candidate)}</td>
              <td>{candidate.wins}</td>
              <td>{candidate.losses}</td>
              <td>{candidate.runsFor}</td>
              <td>{candidate.runsAgainst}</td>
              <td>{moveStatus(candidate, index, list)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <section className="view stats-view league-view">
      <div className="section-title">
        <div>
          <p className="eyebrow">League office</p>
          <h2>Standings and Leaders</h2>
        </div>
      </div>

      {isOffseason ? (
        <div className="league-overview">
          <div className="league-tile-grid">
            {overviewTiles.map((tile) => {
              const topTeam = tile.teams[0];
              const bottomTeam = tile.teams[tile.teams.length - 1];
              return (
                <button
                  className={`league-tile ${activeTile === tile.id ? "is-active" : ""}`}
                  key={tile.id}
                  onClick={() => setActiveTile(tile.id)}
                  type="button"
                >
                  <strong>{tile.label}</strong>
                  <span>{tile.teams.length} clubs</span>
                  <small>
                    {topTeam ? `${topTeam.name}${moveStatus(topTeam, 0, tile.teams) ? ` (${moveStatus(topTeam, 0, tile.teams)})` : ""}` : "No clubs"}
                    {bottomTeam && bottomTeam !== topTeam ? ` / ${bottomTeam.name}${moveStatus(bottomTeam, tile.teams.length - 1, tile.teams) ? ` (${moveStatus(bottomTeam, tile.teams.length - 1, tile.teams)})` : ""}` : ""}
                  </small>
                </button>
              );
            })}
          </div>
          <div className="stats-columns">
            {renderStandingsTable(activeTileTeams, overviewTiles.find((tile) => tile.id === activeTile)?.label ?? "Overview")}
            <table className="ledger-table leaders">
              <caption>Active Player Leaders</caption>
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Club</th>
                  <th>OVR</th>
                  <th>Grade</th>
                </tr>
              </thead>
              <tbody>
                {statLeaders.map((player) => (
                  <tr key={player.id}>
                    <th>{player.name}</th>
                    <td>{player.team}</td>
                    <td>{playerOverall(player)}</td>
                    <td>{letterGrade(playerOverall(player))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="stats-columns">
          <div>
            <div className="division-switcher">
              {divisionOrder.map((division) => (
                <button
                  className={activeDivision === division ? "is-active" : ""}
                  key={division}
                  onClick={() => setActiveDivision(division)}
                  type="button"
                >
                  {division}{division === team.division ? " / Your division" : ""}
                </button>
              ))}
            </div>
            {renderStandingsTable(activeDivisionTeams, `${activeDivision} Division`)}
          </div>
          <table className="ledger-table leaders">
            <caption>Active Player Leaders</caption>
            <thead>
              <tr>
                <th>Player</th>
                <th>Club</th>
                <th>OVR</th>
                <th>Grade</th>
              </tr>
            </thead>
            <tbody>
              {statLeaders.map((player) => (
                <tr key={player.id}>
                  <th>{player.name}</th>
                  <td>{player.team}</td>
                  <td>{playerOverall(player)}</td>
                  <td>{letterGrade(playerOverall(player))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SeasonView({
  team,
  teams,
  seasonState,
  nextGame,
  canRecordWeek,
  onAdvanceWeek,
  onFinishSeason,
}: {
  team: Team;
  teams: Team[];
  seasonState: SeasonState;
  nextGame: string;
  canRecordWeek: boolean;
  onAdvanceWeek: () => void;
  onFinishSeason: () => void;
}) {
  const divisionTable = [...teams]
    .filter((candidate) => candidate.division === team.division)
    .sort((left, right) => right.wins - left.wins || left.losses - right.losses || right.runsFor - left.runsFor);
  const rank = divisionTable.findIndex((candidate) => candidate.id === team.id) + 1;
  const seasonReady = seasonState.week > seasonState.seasonLength;

  return (
    <section className="view season-view">
      <div className="section-title">
        <div>
          <p className="eyebrow">Club calendar</p>
          <h2>Season {seasonState.season}, Week {Math.min(seasonState.week, seasonState.seasonLength)}</h2>
        </div>
        <StatPill label="Reputation" value={seasonState.reputation} />
      </div>

      <div className="season-board">
        <section className="office-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Next decision</p>
              <h3>{nextGame}</h3>
            </div>
            <CalendarDays size={20} />
          </div>
          <p className="team-story">
            Each week resolves the league match, pays wages, adds gate income, checks sponsor bonuses, and moves the table.
          </p>
          <div className="office-actions">
            <button disabled={seasonReady} onClick={onAdvanceWeek} type="button">Advance Day</button>
            <button disabled={!seasonReady} onClick={onFinishSeason} type="button">Resolve Promotion</button>
          </div>
        </section>

        <section className="office-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Table pressure</p>
              <h3>{team.division}</h3>
            </div>
            <Trophy size={20} />
          </div>
          <div className="finance-lines">
            <span>Position <strong>#{rank || "-"}</strong></span>
            <span>Record <strong>{team.wins}-{team.losses}</strong></span>
            <span>Goal <strong>{team.division === "Challenger" ? "Top club promotes" : "Bottom club relegates"}</strong></span>
            <span>Cash <strong>{money(team.cash)}</strong></span>
          </div>
        </section>

        <section className="office-panel season-log">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Front office log</p>
              <h3>Weekly Report</h3>
            </div>
            <BookOpen size={20} />
          </div>
          <div className="compact-list">
            {seasonState.lastWeekSummary.map((line, index) => (
              <div className="staff-slot" key={`${line}-${index}`}>
                <span>Report {index + 1}</span>
                <strong>{line}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function loadSavedState(user?: AuthUser | null): SavedGameState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(profileSaveKey(user));
    return raw ? (JSON.parse(raw) as SavedGameState) : null;
  } catch {
    return null;
  }
}

function isSavedGamePayload(value: SavedGamePayload | null): value is SavedGameState {
  return Boolean(value && Array.isArray(value.teams) && Array.isArray(value.freeAgents) && value.selections);
}

export default function GameApp({ initialTab = "office" }: { initialTab?: TabId }) {
  const league = useMemo(() => createLeague(), []);
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => loadAuthUser());
  const initialSaved = typeof window === "undefined" ? null : loadSavedState(loadAuthUser());
  const initialTeams = useMemo(
    () => normalizeOwnedLeagueTeams(initialSaved?.teams ?? league.teams, initialSaved?.ownedTeamId ?? null),
    [initialSaved, league.teams],
  );
  const [teams, setTeams] = useState<Team[]>(() => initialTeams);
  const [freeAgents, setFreeAgents] = useState<Player[]>(() => initialSaved?.freeAgents ?? league.freeAgents);
  const [selections, setSelections] = useState<SelectionMap>(() => initialSaved?.selections ?? defaultSelections(league.teams));
  const [ownedTeamId, setOwnedTeamId] = useState<string | null>(() => initialSaved?.ownedTeamId ?? null);
  const [seasonState, setSeasonState] = useState<SeasonState>(() => initialSaved?.seasonState ?? initialSeasonState);
  const [scoutingState, setScoutingState] = useState<ScoutingState>(() => initialSaved?.scoutingState ?? initialScoutingState);
  const [purchasedUpgrades, setPurchasedUpgrades] = useState<string[]>(() => initialSaved?.purchasedUpgrades ?? []);
  const [gameRecords, setGameRecords] = useState<Record<string, StoredGameRecord>>(() => initialSaved?.gameRecords ?? {});
  const [schedule, setSchedule] = useState<ScheduleGame[]>(() =>
    initialSaved?.schedule && scheduleIncludesTeam(initialSaved.schedule, initialSaved.ownedTeamId ?? null)
      ? initialSaved.schedule
      : buildSchedule(initialTeams),
  );
  const managedTeams = useMemo(
    () => teams.map((team) => applySelection(team, selections[team.id])),
    [teams, selections],
  );
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [eventIndex, setEventIndex] = useState(0);
  const [hasHydratedRemote, setHasHydratedRemote] = useState(false);
  const ownedTeam = ownedTeamId ? managedTeams.find((team) => team.id === ownedTeamId) : null;
  const selectedTeam = ownedTeam ?? managedTeams[0];
  const selectedChoice = selections[selectedTeam.id] ?? defaultSelections([selectedTeam])[selectedTeam.id];
  const dayGames = schedule.filter((game) => game.day === seasonState.day);
  const currentScheduleGame =
    dayGames.find((game) => game.awayId === selectedTeam.id || game.homeId === selectedTeam.id) ??
    dayGames[0] ??
    schedule[0];
  const currentAway = managedTeams.find((team) => team.id === currentScheduleGame.awayId) ?? managedTeams[0];
  const currentHome = managedTeams.find((team) => team.id === currentScheduleGame.homeId) ?? managedTeams[1] ?? managedTeams[0];
  const scheduled = makeGameRecord(currentScheduleGame.id, currentScheduleGame.day, currentAway, currentHome);
  const currentRecord = gameRecords[scheduled.id] ?? scheduled;
  const scoutingSlots = hasUpgrade(purchasedUpgrades, "scout-slot-2") ? 2 : 1;
  const navBadges: Partial<Record<TabId, string>> = {
    ...(selectedChoice.lineupIds.length < 9 ? { squad: `${selectedChoice.lineupIds.length}/9` } : {}),
    ...(!scoutingState.isSearching && scoutingState.foundIds.length < scoutingSlots ? { market: "Scout" } : {}),
    ...(currentRecord.status === "completed" ? { office: "Next day", season: "Ready" } : { match: currentRecord.status === "in-progress" ? "Live" : "Game" }),
  };
  const game = useMemo(() => {
    if (currentRecord.sim) return currentRecord.sim;
    const away = managedTeams.find((team) => team.id === currentRecord.awayId) ?? managedTeams[0];
    const home = managedTeams.find((team) => team.id === currentRecord.homeId) ?? managedTeams[1];
    return simulateGame(away, home, currentRecord.id);
  }, [currentRecord.awayId, currentRecord.homeId, currentRecord.id, currentRecord.sim, managedTeams]);
  const currentMatchImpact =
    currentRecord.impact ??
    (currentRecord.status === "completed" && (currentRecord.awayId === selectedTeam.id || currentRecord.homeId === selectedTeam.id)
      ? buildMatchImpact(currentRecord, game, selectedTeam)
      : undefined);

  useEffect(() => {
    setGameRecords((current) => {
      if (current[currentScheduleGame.id]) return current;
      return {
        ...current,
        [currentScheduleGame.id]: {
          ...makeGameRecord(currentScheduleGame.id, currentScheduleGame.day, currentAway, currentHome),
          status: "scheduled",
          eventIndex: 0,
        },
      };
    });
  }, [currentAway, currentHome, currentScheduleGame.day, currentScheduleGame.id]);

  useEffect(() => {
    if (currentRecord.status === "completed") {
      setEventIndex(game.events.length - 1);
      return;
    }
    setEventIndex(currentRecord.eventIndex ?? 0);
  }, [currentRecord.eventIndex, currentRecord.status, game.events.length]);

  useEffect(() => {
    if (currentRecord.status === "completed") return;
    setGameRecords((current) => {
      const existing = current[currentRecord.id];
      if (!existing || existing.status === "completed") return current;
      if (existing.eventIndex === eventIndex && existing.status === (eventIndex > 0 ? "in-progress" : existing.status)) {
        return current;
      }
      return {
        ...current,
        [currentRecord.id]: {
          ...existing,
          status: eventIndex > 0 ? "in-progress" : existing.status,
          eventIndex,
          sim: existing.sim ?? game,
        },
      };
    });
  }, [currentRecord.id, currentRecord.status, eventIndex, game]);

  useEffect(() => {
    if (currentRecord.status !== "completed") return;
    setEventIndex(game.events.length - 1);
  }, [currentRecord.status, game.events.length]);

  useEffect(() => {
    getSupabaseAuthUser().then(async (remoteUser) => {
      if (!remoteUser) {
        const storedUser = loadAuthUser();
        if (storedUser) {
          setAuthUser(storedUser);
          const localSave = loadSavedState(storedUser);
          if (localSave) {
            const normalizedTeams = normalizeOwnedLeagueTeams(localSave.teams, localSave.ownedTeamId ?? null);
            setTeams(normalizedTeams);
            setFreeAgents(localSave.freeAgents);
            setSelections(localSave.selections);
            setOwnedTeamId(localSave.ownedTeamId ?? null);
            setSeasonState(localSave.seasonState ?? initialSeasonState);
            setScoutingState(localSave.scoutingState ?? initialScoutingState);
            setPurchasedUpgrades(localSave.purchasedUpgrades ?? []);
            setGameRecords(localSave.gameRecords ?? {});
            setSchedule(localSave.schedule && scheduleIncludesTeam(localSave.schedule, localSave.ownedTeamId ?? null) ? localSave.schedule : buildSchedule(normalizedTeams));
          }
        }
        setHasHydratedRemote(true);
        return;
      }
      saveAuthUser(remoteUser);
      setAuthUser(remoteUser);
      const remoteSave = await loadRemoteSave(remoteUser.id);
      if (isSavedGamePayload(remoteSave)) {
        const normalizedTeams = normalizeOwnedLeagueTeams(remoteSave.teams as Team[], remoteSave.ownedTeamId ?? null);
        setTeams(normalizedTeams);
        setFreeAgents(remoteSave.freeAgents as Player[]);
        setSelections(remoteSave.selections as SelectionMap);
        setOwnedTeamId(remoteSave.ownedTeamId ?? null);
        setSeasonState((remoteSave.seasonState as SeasonState | undefined) ?? initialSeasonState);
        setScoutingState((remoteSave.scoutingState as ScoutingState | undefined) ?? initialScoutingState);
        setPurchasedUpgrades(remoteSave.purchasedUpgrades ?? []);
        setGameRecords((remoteSave as SavedGameState).gameRecords ?? {});
        setSchedule((remoteSave as SavedGameState).schedule && scheduleIncludesTeam((remoteSave as SavedGameState).schedule ?? [], remoteSave.ownedTeamId ?? null) ? (remoteSave as SavedGameState).schedule! : buildSchedule(normalizedTeams));
      } else {
        const localSave = loadSavedState(remoteUser);
        if (localSave) {
          const normalizedTeams = normalizeOwnedLeagueTeams(localSave.teams, localSave.ownedTeamId ?? null);
          setTeams(normalizedTeams);
          setFreeAgents(localSave.freeAgents);
          setSelections(localSave.selections);
          setOwnedTeamId(localSave.ownedTeamId ?? null);
          setSeasonState(localSave.seasonState ?? initialSeasonState);
          setScoutingState(localSave.scoutingState ?? initialScoutingState);
          setPurchasedUpgrades(localSave.purchasedUpgrades ?? []);
          setGameRecords(localSave.gameRecords ?? {});
          setSchedule(localSave.schedule && scheduleIncludesTeam(localSave.schedule, localSave.ownedTeamId ?? null) ? localSave.schedule : buildSchedule(normalizedTeams));
        }
      }
      setHasHydratedRemote(true);
    });
  }, []);

  useEffect(() => {
    if (!hasHydratedRemote) return;
    const saveData: SavedGameState = { teams, freeAgents, selections, ownedTeamId, seasonState, scoutingState, purchasedUpgrades, gameRecords, schedule };
    window.localStorage.setItem(profileSaveKey(authUser), JSON.stringify(saveData));
    if (authUser?.provider === "supabase" && authUser.id && hasHydratedRemote) {
      void saveRemoteSave(authUser, saveData);
    }
  }, [authUser, freeAgents, gameRecords, hasHydratedRemote, ownedTeamId, purchasedUpgrades, schedule, scoutingState, seasonState, selections, teams]);

  async function signOut() {
    window.localStorage.setItem(profileSaveKey(authUser), JSON.stringify({ teams, freeAgents, selections, ownedTeamId, seasonState, scoutingState, purchasedUpgrades, gameRecords, schedule }));
    await signOutSupabase();
    clearAuthUser();
    const guestSave = loadSavedState(null);
    const guestTeams = normalizeOwnedLeagueTeams(guestSave?.teams ?? league.teams, guestSave?.ownedTeamId ?? null);
    setAuthUser(null);
    setTeams(guestTeams);
    setFreeAgents(guestSave?.freeAgents ?? league.freeAgents);
    setSelections(guestSave?.selections ?? defaultSelections(league.teams));
    setOwnedTeamId(guestSave?.ownedTeamId ?? null);
    setSeasonState(guestSave?.seasonState ?? initialSeasonState);
    setScoutingState(guestSave?.scoutingState ?? initialScoutingState);
    setPurchasedUpgrades(guestSave?.purchasedUpgrades ?? []);
    setGameRecords(guestSave?.gameRecords ?? {});
    setSchedule(guestSave?.schedule && scheduleIncludesTeam(guestSave.schedule, guestSave.ownedTeamId ?? null) ? guestSave.schedule : buildSchedule(guestTeams));
  }

  function createOwnedTeam(city: string, mascot: string, budget: StartingBudget) {
    const cleanCity = normalizeTeamInput(city);
    const cleanMascot = normalizeTeamInput(mascot);
    if (validateTeamNamePart(cleanCity, "Club city") || validateTeamNamePart(cleanMascot, "Club nickname")) return;
    const team = createExpansionTeam(authUser?.email ?? "guest", cleanCity, cleanMascot, budget);
    const cpuTeams = league.teams.map(resetTeamRecord).filter((candidate) => candidate.id !== team.id);
    const removableCpu = [...cpuTeams].reverse().find((candidate) => candidate.division === "Challenger") ?? cpuTeams[cpuTeams.length - 1];
    const freshTeams = cpuTeams.filter((candidate) => candidate.id !== removableCpu?.id);
    const seasonTeams = [team, ...freshTeams];
    setTeams(seasonTeams);
    setFreeAgents(league.freeAgents);
    setSelections({
      ...defaultSelections(freshTeams),
      [team.id]: {
        lineupIds: team.lineup.map((player) => player.id),
        starterId: team.rotation[0].id,
      },
    });
    setOwnedTeamId(team.id);
    setSeasonState(initialSeasonState);
    setScoutingState(initialScoutingState);
    setPurchasedUpgrades([]);
    setGameRecords({});
    setSchedule(buildSchedule(seasonTeams));
    setActiveTab("office");
  }

  function hireStaff(team: Team, staff: StaffMember) {
    const requiresAssistant = staff.role === "batting" || staff.role === "pitching";
    setTeams((current) =>
      current.map((candidate) => {
        if (candidate.id !== team.id) return candidate;
        const currentStaff = candidate.staff ?? {};
        if (currentStaff[staff.role] || candidate.cash < staff.salary) return candidate;
        if (requiresAssistant && !currentStaff.assistant) return candidate;
        return {
          ...candidate,
          cash: candidate.cash - staff.salary,
          payroll: candidate.payroll + staff.salary,
          staff: {
            ...currentStaff,
            [staff.role]: staff,
          },
        };
      }),
    );
  }

  function togglePlayer(team: Team, player: Player) {
    setSelections((current) => {
      const existing = current[team.id] ?? defaultSelections([team])[team.id];
      if (player.role === "pitcher") {
        return {
          ...current,
          [team.id]: {
            ...existing,
            starterId: player.id,
          },
        };
      }

      const isPicked = existing.lineupIds.includes(player.id);
      if (isPicked) {
        return {
          ...current,
          [team.id]: {
            ...existing,
            lineupIds: existing.lineupIds.filter((id) => id !== player.id),
          },
        };
      }

      const lineupIds =
        existing.lineupIds.length < 9
          ? [...existing.lineupIds, player.id]
          : [
            ...existing.lineupIds.filter((id) => {
              const currentPlayer = team.roster.find((candidate) => candidate.id === id);
              const lowest = existing.lineupIds
                .map((pickedId) => team.roster.find((candidate) => candidate.id === pickedId))
                .filter((candidate): candidate is Player => Boolean(candidate))
                .sort((left, right) => playerOverall(left) - playerOverall(right))[0];
              return currentPlayer?.id !== lowest?.id;
            }),
            player.id,
          ];

      return {
        ...current,
        [team.id]: {
          ...existing,
          lineupIds,
        },
      };
    });
    setEventIndex(0);
  }

  function autoPick(team: Team) {
    setSelections((current) => ({
      ...current,
      [team.id]: {
        lineupIds: team.roster
          .filter((player) => player.role === "batter")
          .sort((left, right) => playerOverall(right) - playerOverall(left))
          .slice(0, 9)
          .map((player) => player.id),
        starterId:
          team.roster
            .filter((player) => player.role === "pitcher")
            .sort((left, right) => playerOverall(right) - playerOverall(left))[0]?.id ?? current[team.id].starterId,
      },
    }));
    setEventIndex(0);
  }

  function signPlayer(player: Player) {
    setTeams((current) =>
      current.map((team) => {
        if (team.id !== selectedTeam.id) return team;
        if (team.cash < player.value || team.payroll + player.salary > team.wageBudget) return team;
        return withPayroll({
          ...team,
          cash: team.cash - player.value,
          roster: [...team.roster, player],
        });
      }),
    );
    setFreeAgents((current) => current.filter((candidate) => candidate.id !== player.id));
    setScoutingState((current) => ({
      ...current,
      foundIds: current.foundIds.filter((id) => id !== player.id),
    }));
  }

  function releasePlayer(team: Team, player: Player) {
    if (team.roster.length <= 12) return;
    setTeams((current) =>
      current.map((candidate) =>
        candidate.id === team.id
          ? withPayroll({
            ...candidate,
            cash: candidate.cash + Math.round(player.value * 0.35),
            roster: candidate.roster.filter((rosterPlayer) => rosterPlayer.id !== player.id),
          })
          : candidate,
      ),
    );
    setSelections((current) => {
      const existing = current[team.id] ?? defaultSelections([team])[team.id];
      return {
        ...current,
        [team.id]: {
          lineupIds: existing.lineupIds.filter((id) => id !== player.id),
          starterId: existing.starterId === player.id ? team.rotation[1]?.id ?? existing.starterId : existing.starterId,
        },
      };
    });
    setFreeAgents((current) => [player, ...current].sort((left, right) => playerOverall(right) - playerOverall(left)));
  }

  function trainTeam(team: Team) {
    setTeams((current) =>
      current.map((candidate) => {
        if (candidate.id !== team.id || candidate.cash < 350) return candidate;
        const target = [...candidate.roster].sort((left, right) => playerOverall(left) - playerOverall(right))[0];
        return {
          ...candidate,
          cash: candidate.cash - 350,
          chemistry: Math.min(99, candidate.chemistry + 2),
          roster: candidate.roster.map((player) =>
            player.id === target.id
              ? {
                ...player,
                morale: Math.min(99, player.morale + 4),
                contact: player.role === "batter" ? Math.min(99, player.contact + 2) : player.contact,
                stuff: player.role === "pitcher" ? Math.min(99, player.stuff + 2) : player.stuff,
              }
              : player,
          ),
        };
      }),
    );
  }

  function trainPlayer(team: Team, target: Player, drill: "batting" | "fielding" | "conditioning" | "mastery") {
    const cost = 120;
    setTeams((current) =>
      current.map((candidate) => {
        if (candidate.id !== team.id || candidate.cash < cost) return candidate;
        const growth = target.age <= 24 ? 3 : target.age >= 32 ? 1 : 2;
        return {
          ...candidate,
          cash: candidate.cash - cost,
          chemistry: Math.min(99, candidate.chemistry + 1),
          roster: candidate.roster.map((player) => {
            if (player.id !== target.id) return player;
            return {
              ...player,
              contact: drill === "batting" && player.role === "batter" ? Math.min(99, player.contact + growth) : player.contact,
              power: drill === "batting" && player.role === "batter" ? Math.min(99, player.power + 1) : player.power,
              fielding: drill === "fielding" ? Math.min(99, player.fielding + growth) : player.fielding,
              stuff: drill === "fielding" && player.role === "pitcher" ? Math.min(99, player.stuff + growth) : player.stuff,
              mastery: drill === "mastery" ? Math.min(99, player.mastery + growth + candidate.facilities.filmRoom) : player.mastery,
              fatigue: drill === "conditioning" ? Math.max(0, player.fatigue - 10 - candidate.facilities.recoveryWing) : player.fatigue,
              stamina: drill === "conditioning" ? Math.min(99, player.stamina + 1) : player.stamina,
              offense:
                player.role === "batter"
                  ? Math.round(
                    (drill === "batting" ? Math.min(99, player.contact + growth) : player.contact) * 0.38 +
                    (drill === "batting" ? Math.min(99, player.power + 1) : player.power) * 0.34 +
                    player.eye * 0.28,
                  )
                  : player.offense,
              defense:
                player.role === "pitcher"
                  ? Math.round(
                    (drill === "fielding" ? Math.min(99, player.stuff + growth) : player.stuff) * 0.38 +
                    player.control * 0.34 +
                    player.stamina * 0.18 +
                    player.fielding * 0.1,
                  )
                  : Math.round((drill === "fielding" ? Math.min(99, player.fielding + growth) : player.fielding) * 0.72 + player.speed * 0.28),
            };
          }),
        };
      }),
    );
  }

  function runCoachWeek(team: Team) {
    setTeams((current) =>
      current.map((candidate) => {
        if (candidate.id !== team.id) return candidate;
        const staff = candidate.staff ?? {};
        if (!staff.batting && !staff.pitching) return candidate;

        const batterTarget = staff.batting
          ? [...candidate.roster]
            .filter((player) => player.role === "batter")
            .sort((left, right) => left.offense - right.offense || left.morale - right.morale)[0]
          : null;
        const pitcherTarget = staff.pitching
          ? [...candidate.roster]
            .filter((player) => player.role === "pitcher")
            .sort((left, right) => right.fatigue - left.fatigue || left.defense - right.defense)[0]
          : null;
        const battingBoost = staff.batting ? Math.max(1, Math.round(staff.batting.rating / 34)) : 0;
        const pitchingBoost = staff.pitching ? Math.max(1, Math.round(staff.pitching.rating / 34)) : 0;

        return {
          ...candidate,
          chemistry: Math.min(99, candidate.chemistry + 1),
          roster: candidate.roster.map((player) => {
            if (player.id === batterTarget?.id) {
              const contact = Math.min(99, player.contact + battingBoost);
              const power = Math.min(99, player.power + 1);
              const eye = Math.min(99, player.eye + 1);
              return {
                ...player,
                contact,
                power,
                eye,
                morale: Math.min(99, player.morale + 3),
                fatigue: Math.max(0, player.fatigue - 2),
                offense: Math.round(contact * 0.38 + power * 0.34 + eye * 0.28),
              };
            }
            if (player.id === pitcherTarget?.id) {
              const stuff = Math.min(99, player.stuff + pitchingBoost);
              const control = Math.min(99, player.control + 1);
              const fatigue = Math.max(0, player.fatigue - 6);
              return {
                ...player,
                stuff,
                control,
                fatigue,
                morale: Math.min(99, player.morale + 2),
                defense: Math.round(stuff * 0.38 + control * 0.34 + player.stamina * 0.18 + player.fielding * 0.1),
              };
            }
            return player;
          }),
        };
      }),
    );
  }

  function upgradeFacility(team: Team) {
    setTeams((current) =>
      current.map((candidate) =>
        candidate.id === team.id && candidate.cash >= 700
          ? {
            ...candidate,
            cash: candidate.cash - 700,
            stadium: Math.min(99, candidate.stadium + 4),
            wageBudget: candidate.wageBudget + 220,
          }
          : candidate,
      ),
    );
  }

  function upgradeNamedFacility(team: Team, facility: keyof Team["facilities"]) {
    setTeams((current) =>
      current.map((candidate) => {
        if (candidate.id !== team.id) return candidate;
        const cost = 500 + candidate.facilities[facility] * 240;
        if (candidate.cash < cost || candidate.facilities[facility] >= 5) return candidate;
        return {
          ...candidate,
          cash: candidate.cash - cost,
          facilities: {
            ...candidate.facilities,
            [facility]: candidate.facilities[facility] + 1,
          },
        };
      }),
    );
  }

  function purchaseFacilityNode(team: Team, nodeId: string) {
    const node = facilityNodes.find((candidate) => candidate.id === nodeId);
    if (!node || purchasedUpgrades.includes(nodeId)) return;
    setTeams((current) =>
      current.map((candidate) => {
        if (candidate.id !== team.id) return candidate;
        if (candidate.cash < node.cost || candidate.facilities[node.facility] < node.level) return candidate;
        return {
          ...candidate,
          cash: candidate.cash - node.cost,
          wageBudget: node.id === "sponsor-slot-2" ? candidate.wageBudget + 200 : candidate.wageBudget,
        };
      }),
    );
    setPurchasedUpgrades((current) => (current.includes(nodeId) ? current : [...current, nodeId]));
  }

  function craftGear(team: Team, gear: "bats" | "gloves" | "cleats" | "uniforms") {
    if (!hasUpgrade(purchasedUpgrades, "crafting-bench")) return;
    setTeams((current) =>
      current.map((candidate) => {
        if (candidate.id !== team.id) return candidate;
        if (candidate.materials.lumber < 1 || candidate.materials.leather < 1 || candidate.materials.thread < 1) return candidate;
        return {
          ...candidate,
          materials: {
            lumber: candidate.materials.lumber - 1,
            leather: candidate.materials.leather - 1,
            thread: candidate.materials.thread - 1,
          },
          roster: candidate.roster.map((player) => ({
            ...player,
            offense: gear === "bats" ? Math.min(99, player.offense + 1) : player.offense,
            defense: gear === "gloves" ? Math.min(99, player.defense + 1) : player.defense,
            speed: gear === "cleats" ? Math.min(99, player.speed + 1) : player.speed,
            morale: gear === "uniforms" ? Math.min(99, player.morale + 1) : player.morale,
          })),
        };
      }),
    );
  }

  function acceptSponsor(team: Team, sponsor: Sponsor) {
    setTeams((current) =>
      current.map((candidate) =>
        candidate.id === team.id
          ? {
            ...candidate,
            sponsor,
            cash: candidate.cash + sponsor.offer,
          }
          : candidate,
      ),
    );
  }

  function mediaDay(team: Team) {
    setTeams((current) =>
      current.map((candidate) =>
        candidate.id === team.id
          ? {
            ...candidate,
            cash: candidate.cash + 180 + Math.round(candidate.fanSupport * 5),
            fanSupport: Math.min(99, candidate.fanSupport + 2),
            chemistry: Math.max(0, candidate.chemistry - 1),
          }
          : candidate,
      ),
    );
  }

  function startScouting(team: Team, focus: ScoutingFocus) {
    const costs: Record<ScoutingFocus, number> = { local: 80, college: 140, veteran: 260, rising: 420 };
    const scoutSlots = hasUpgrade(purchasedUpgrades, "scout-slot-2") ? 2 : 1;
    if (team.cash < costs[focus] || scoutingState.isSearching || scoutingState.foundIds.length >= scoutSlots) return;
    setTeams((current) =>
      current.map((candidate) => (candidate.id === team.id ? { ...candidate, cash: candidate.cash - costs[focus] } : candidate)),
    );
    setScoutingState((current) => ({ ...current, isSearching: true, activeFocus: focus }));

    window.setTimeout(() => {
      const available = freeAgents.filter((player) => !scoutingState.foundIds.includes(player.id));
      const sorted =
        focus === "rising"
          ? [...available].sort((left, right) => playerOverall(right) - playerOverall(left))
          : focus === "local"
            ? [...available].sort((left, right) => playerOverall(left) - playerOverall(right))
            : [...available].sort(() => Math.random() - 0.5);
      const odds = focus === "rising" ? [0, 1, 1, 2] : focus === "local" ? [0, 1, 1, 2, 3] : [0, 1, 2, 2, 3];
      const count = odds[Math.floor(Math.random() * odds.length)];
      const found = sorted.slice(0, Math.max(0, Math.min(count, scoutSlots - scoutingState.foundIds.length)));
      const names = found.map((player) => player.name.split(" ").slice(-1)[0]).join(", ");
      const summary = found.length
        ? `The ${focus} scout returns under wet stadium lights with ${names} circled in red pencil.`
        : `The ${focus} scout files an empty report; the notebook has coffee stains and no signatures.`;

      setScoutingState((current) => ({
        isSearching: false,
        activeFocus: null,
        foundIds: [...new Set([...current.foundIds, ...found.map((player) => player.id)])].slice(0, scoutSlots),
        reports: [
          {
            id: `report-${Date.now()}`,
            focus,
            week: seasonState.week,
            foundIds: found.map((player) => player.id),
            summary,
          },
          ...current.reports,
        ],
      }));
    }, hasUpgrade(purchasedUpgrades, "strategy-board") ? 650 : 1100);
  }

  function finalizeCurrentGame() {
    if (currentRecord.status === "completed") return;
    const sim = currentRecord.sim ?? game;
    const completedRecord = completeGameRecord(currentScheduleGame.day, currentAway, currentHome, currentRecord.id, {
      ...currentRecord,
      status: "completed",
      eventIndex: sim.events.length - 1,
      sim,
      ...scoredRuns(sim),
    });
    const impact =
      completedRecord.awayId === selectedTeam.id || completedRecord.homeId === selectedTeam.id
        ? buildMatchImpact(completedRecord, sim, selectedTeam)
        : undefined;
    const completedWithImpact = impact ? { ...completedRecord, impact } : completedRecord;

    setGameRecords((current) => ({
      ...current,
      [completedWithImpact.id]: completedWithImpact,
    }));

    setTeams((current) =>
      applyRecordedResult(current, completedWithImpact).map((team) =>
        impact && team.id === selectedTeam.id ? applyMatchImpact(team, impact) : team,
      ),
    );
    if (impact) {
      setSeasonState((current) => ({
        ...current,
        lastWeekSummary: [
          `${impact.won ? "Win" : "Loss"} vs ${impact.opponent}: ${impact.score}`,
          `Cash ${signedMoney(impact.netCash)} after gate, sponsor, and payroll.`,
          `Fans ${impact.fanDelta >= 0 ? "+" : ""}${impact.fanDelta}, chemistry ${impact.chemistryDelta >= 0 ? "+" : ""}${impact.chemistryDelta}.`,
        ],
      }));
    }
    setEventIndex(sim.events.length - 1);
  }

  function advanceDay() {
    const userGameIsToday = currentScheduleGame.awayId === selectedTeam.id || currentScheduleGame.homeId === selectedTeam.id;
    if (userGameIsToday && currentRecord.status !== "completed") {
      setActiveTab("match");
      window.history.pushState(null, "", "/match");
      return;
    }

    const gamesToday = schedule.filter((scheduledGame) => scheduledGame.day === seasonState.day);
    const resolvedRecords: Record<string, StoredGameRecord> = {};
    let nextTeams = teams;
    let summaries: string[] = [];

    gamesToday.forEach((scheduledGame) => {
      const existing = gameRecords[scheduledGame.id];
      if (existing?.status === "completed" && existing.sim) {
        if (existing.impact) {
          summaries = [
            ...summaries,
            `${existing.impact.won ? "Win" : "Loss"} vs ${existing.impact.opponent}: ${existing.impact.score} (${signedMoney(existing.impact.netCash)})`,
          ];
        } else {
          summaries = [...summaries, `${existing.label}: ${existing.awayRuns}-${existing.homeRuns}`];
        }
        return;
      }
      const away = nextTeams.find((team) => team.id === scheduledGame.awayId) ?? nextTeams[0];
      const home = nextTeams.find((team) => team.id === scheduledGame.homeId) ?? nextTeams[1] ?? nextTeams[0];
      const completedRecord = completeGameRecord(scheduledGame.day, away, home, scheduledGame.id, existing);
      resolvedRecords[scheduledGame.id] = completedRecord;
      nextTeams = applyRecordedResult(nextTeams, completedRecord);
      summaries = [...summaries, `${scheduledGame.label}: ${completedRecord.awayRuns}-${completedRecord.homeRuns}`];
    });

    if (Object.keys(resolvedRecords).length) {
      setGameRecords((current) => ({ ...current, ...resolvedRecords }));
      setTeams(nextTeams);
    }

    setSeasonState((current) => ({
      ...current,
      day: current.day + 1,
      week: current.week + 1,
      phase: current.day >= schedule.length ? "offseason" : current.phase,
      lastWeekSummary: summaries.length
        ? summaries.slice(0, 3)
        : [`Day ${current.day} advanced with no scheduled games.`],
    }));
    setActiveTab("office");
    window.history.pushState(null, "", "/office");
  }

  function finishSeason() {
    if (seasonState.week <= seasonState.seasonLength) return;
    const divisionTeams = [...managedTeams]
      .filter((team) => team.division === selectedTeam.division)
      .sort((left, right) => right.wins - left.wins || left.losses - right.losses || right.runsFor - left.runsFor);
    const rank = divisionTeams.findIndex((team) => team.id === selectedTeam.id) + 1;
    const promotes = selectedTeam.division === "Challenger" && rank === 1;
    const relegates = selectedTeam.division === "Premier" && rank === divisionTeams.length;
    const nextDivision = promotes ? "Premier" : relegates ? "Challenger" : selectedTeam.division;

    setTeams((current) =>
      current.map((candidate) =>
        candidate.id === selectedTeam.id
          ? {
            ...candidate,
            division: nextDivision,
            cash: candidate.cash + (promotes ? 1200 : relegates ? -500 : 350),
            fanSupport: Math.max(1, Math.min(99, candidate.fanSupport + (promotes ? 8 : relegates ? -8 : 2))),
            roster: candidate.roster.map((player) => ({ ...player, fatigue: Math.max(0, player.fatigue - 18) })),
          }
          : candidate,
      ),
    );
    setSeasonState((current) => ({
      day: current.day,
      season: current.season,
      week: current.week,
      seasonLength: current.seasonLength,
      reputation: Math.max(1, current.reputation + (promotes ? 10 : relegates ? -10 : 3)),
      phase: "offseason",
      lastWeekSummary: [
        promotes ? "Promotion secured. The club moves into Premier." : relegates ? "Relegation confirmed. The club drops into Challenger." : "Season complete. The board keeps the project alive.",
        `Final table position: #${rank || "-"}. New target: ${nextDivision === "Premier" ? "survive the top division" : "fight for promotion"}.`,
      ],
    }));
    setActiveTab("office");
    window.history.pushState(null, "", "/office");
  }

  function nextEvent() {
    setEventIndex((current) => Math.min(game.events.length - 1, current + 1));
  }

  function skipGame() {
    finalizeCurrentGame();
  }

  function resetGame() {
    setEventIndex(0);
  }

  const discoveredProspects = freeAgents.filter((player) => scoutingState.foundIds.includes(player.id));

  if (!hasHydratedRemote) {
    return (
      <main className="app-shell is-loading">
        <aside className="sidebar">
          <div className="league-plaque">
            <Trophy size={18} />
            <div>
              <p>Vesper Association</p>
              <strong>Night Ledger</strong>
            </div>
          </div>
          <div className="sidebar-club">
            <div className="skeleton-line short" />
            <div className="skeleton-line" />
            <div className="skeleton-line short" />
          </div>
        </aside>
        <div className="workspace">
          <div className="inline-loading-card">
            <p className="eyebrow">Loading save</p>
            <div className="skeleton-line" />
            <div className="skeleton-line short" />
          </div>
        </div>
      </main>
    );
  }

  if (!authUser) {
    return (
      <main className="login-shell">
        <section className="login-panel">
          <p className="eyebrow">Manager account</p>
          <h1>Sign In Required</h1>
          <p className="team-story">Opening the front office now starts from the login page so progress can bind to a manager profile.</p>
        </section>
      </main>
    );
  }

  if (!ownedTeam) {
    return <CreateClubView onCreateTeam={createOwnedTeam} />;
  }

  return (
    <main className="app-shell">
      <Sidebar team={selectedTeam} activeTab={activeTab} onTab={setActiveTab} day={seasonState.day} nextGame={gameResultSummary(currentRecord)} navBadges={navBadges} />

      <div className="workspace">
        <Header
          day={seasonState.day}
          team={selectedTeam}
          user={authUser}
          onSignOut={signOut}
          nextGame={gameResultSummary(currentRecord)}
          nextGameStatus={currentRecord.status === "completed" ? "Completed" : currentRecord.status === "in-progress" ? "In progress" : "Scheduled"}
        />

        {activeTab === "office" ? (
          <OfficeView
            team={selectedTeam}
            nextGame={gameResultSummary(currentRecord)}
            nextGameStatus={currentRecord.status === "completed" ? "Completed" : currentRecord.status === "in-progress" ? "In progress" : "Scheduled"}
            matchImpact={currentMatchImpact}
            canAdvanceDay={currentRecord.status === "completed"}
            onAutoPick={autoPick}
            onNextDay={advanceDay}
          />
        ) : null}
        {activeTab === "staff" ? <StaffView team={selectedTeam} onHireStaff={hireStaff} /> : null}
        {activeTab === "squad" ? (
          <SquadView
            team={selectedTeam}
            selection={selectedChoice}
            freeAgents={freeAgents}
            onTogglePlayer={togglePlayer}
            onAutoPick={autoPick}
            onSign={signPlayer}
            onRelease={releasePlayer}
          />
        ) : null}
        {activeTab === "training" ? <TrainingView team={selectedTeam} onTrainPlayer={trainPlayer} onRunCoachWeek={runCoachWeek} /> : null}
        {activeTab === "market" ? (
          <MarketView
            team={selectedTeam}
            prospects={discoveredProspects}
            scoutingState={scoutingState}
            purchasedUpgrades={purchasedUpgrades}
            seasonWeek={seasonState.week}
            onStartScouting={startScouting}
            onSign={signPlayer}
            onRelease={releasePlayer}
          />
        ) : null}
        {activeTab === "facilities" ? (
          <FacilitiesView
            team={selectedTeam}
            purchasedUpgrades={purchasedUpgrades}
            onCraftGear={craftGear}
            onPurchaseNode={purchaseFacilityNode}
            onUpgradeNamedFacility={upgradeNamedFacility}
          />
        ) : null}
        {activeTab === "sponsors" ? (
          <SponsorsView team={selectedTeam} onAcceptSponsor={acceptSponsor} onMediaDay={mediaDay} />
        ) : null}
        {activeTab === "match" ? (
          <MatchView
            game={game}
            team={selectedTeam}
            eventIndex={eventIndex}
            gameStatus={currentRecord.status}
            onNext={nextEvent}
            onRecordWeek={finalizeCurrentGame}
            onReset={resetGame}
            onSkip={skipGame}
          />
        ) : null}
        {activeTab === "season" ? (
          <SeasonView
            team={selectedTeam}
            teams={managedTeams}
            seasonState={seasonState}
            nextGame={gameResultSummary(currentRecord)}
            canRecordWeek={eventIndex >= game.events.length - 1}
            onAdvanceWeek={advanceDay}
            onFinishSeason={finishSeason}
          />
        ) : null}
        {activeTab === "news" ? <ChronicleView entries={league.chronicle} game={game} /> : null}
        {activeTab === "league" ? <LeagueView teams={managedTeams} seasonState={seasonState} team={selectedTeam} /> : null}
      </div>
    </main>
  );
}
