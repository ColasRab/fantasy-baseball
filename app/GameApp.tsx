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
  createExpansionTeam,
  createLeague,
  sponsorPool,
  type Player,
  type Sponsor,
  type StaffMember,
  type StaffRole,
  type Team,
} from "./lib/league";
import { simulateGame, type BaseRunner, type BoxLine, type GameEvent } from "./lib/simulation";

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
const tabs = appTabs.filter((tab) => !("secondary" in tab));

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
type SeasonState = {
  season: number;
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
};

const saveKey = "diamond-manager-gm-state-v6";
const startingBudgetOptions: Array<{ value: StartingBudget; label: string; description: string }> = [
  { value: 100, label: "$100k", description: "Hard mode: bargain players, tiny gate, every wage matters." },
  { value: 500, label: "$500k", description: "Balanced climb: enough room for one plan, not enough for mistakes." },
  { value: 1000, label: "$1M", description: "Backed project: stronger start, higher expectations." },
];
const initialSeasonState: SeasonState = {
  season: 1,
  week: 1,
  seasonLength: 12,
  reputation: 18,
  phase: "season",
  lastWeekSummary: ["Create a club, sign staff, pick a sponsor, and survive the Challenger table."],
};
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

function lineRuns(line: BoxLine) {
  return line.runs.reduce((sum, inning) => sum + inning, 0);
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
  teams,
  selectedTeamId,
  onSelectTeam,
}: {
  teams: Team[];
  selectedTeamId: string;
  onSelectTeam: (teamId: string) => void;
}) {
  const standings = [...teams].sort((left, right) => right.wins - left.wins || left.losses - right.losses);

  return (
    <aside className="sidebar">
      <div className="league-plaque">
        <Trophy size={18} />
        <div>
          <p>Vesper Association</p>
          <strong>Night Ledger</strong>
        </div>
      </div>

      <div className="standings-list">
        {standings.map((team, index) => (
          <button
            className={`standing-row ${team.id === selectedTeamId ? "is-active" : ""}`}
            key={team.id}
            onClick={() => onSelectTeam(team.id)}
            type="button"
          >
            <span className="rank">{index + 1}</span>
            <TeamMark team={team} />
            <span className="club">
              <strong>{team.mascot}</strong>
              <small>{team.city}</small>
            </span>
            <span className="record">
              {team.wins}-{team.losses}
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}

function Header({
  activeTab,
  onTab,
  day,
  game,
  team,
  user,
  onSignOut,
}: {
  activeTab: TabId;
  onTab: (tab: TabId) => void;
  day: number;
  game: ReturnType<typeof simulateGame>;
  team: Team;
  user: AuthUser | null;
  onSignOut: () => void;
}) {
  const current = game.events[0];
  return (
    <header className="header">
      <div className="masthead">
        <div>
          <p className="eyebrow">Day {day} under stadium lights</p>
          <h1>Front Office Ledger</h1>
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

      <nav className="tabs" aria-label="main sections">
        {tabs.map((tab) => {
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
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

function CreateClubView({ onCreateTeam }: { onCreateTeam: (city: string, mascot: string, budget: StartingBudget) => void }) {
  const [city, setCity] = useState("");
  const [mascot, setMascot] = useState("");
  const [budget, setBudget] = useState<StartingBudget>(100);

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
          <label htmlFor="club-name">Club Nickname</label>
          <input
            id="club-name"
            onChange={(event) => setMascot(event.target.value)}
            placeholder="Rookies"
            type="text"
            value={mascot}
          />
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
          <button onClick={() => onCreateTeam(city, mascot, budget)} type="button">Join Challenger Division</button>
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

function OfficeView({
  team,
  nextGame,
  onAutoPick,
  onOpenSeason,
}: {
  team: Team;
  nextGame: string;
  onAutoPick: (team: Team) => void;
  onOpenSeason: () => void;
}) {
  const wageRoom = team.wageBudget - team.payroll;
  const tableHint =
    team.division === "Premier"
      ? "Bottom club drops into Challenger."
      : "Top club earns promotion into Premier.";

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
          <p className="team-story">{tableHint} Board target: {team.boardTarget}.</p>
          <div className="office-actions">
            <button className="primary-action" onClick={onOpenSeason} type="button">Proceed to Week</button>
            <button onClick={() => onAutoPick(team)} type="button">Set Best Lineup</button>
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
  const mainStats =
    player.role === "pitcher"
      ? [
          ["DEF", player.defense],
          ["CTL", player.control],
          ["FAT", player.fatigue],
        ]
      : [
          ["OFF", player.offense],
          ["DEF", player.defense],
          ["MAS", player.mastery],
        ];
  const factors = playerGradeFactors(player);

  return (
    <article className={`player-card ${selected ? "is-selected" : ""}`}>
      <div className="card-topline">
        <span>{player.position}</span>
        <span>{player.age}</span>
      </div>
      <GradeBadge player={player} />
      <h3>{player.name}</h3>
      <p className="nickname">"{player.nickname}"</p>
      <p className="technique-line">{player.signatureTechnique}</p>
      <div className="mini-stats">
        {mainStats.map(([label, value]) => (
          <span key={label}>
            {label} <strong>{value}</strong>
          </span>
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
          <span key={factor.label}>
            {factor.label}
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
      ? `STF ${player.stuff} / CTL ${player.control} / STA ${player.stamina}`
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
            <small>{letterGrade(playerOverall(starter))} {playerOverall(starter)} / STF {starter.stuff} / CTL {starter.control}</small>
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
  onNext,
  onSkip,
  onReset,
  onRecordWeek,
}: {
  game: ReturnType<typeof simulateGame>;
  team: Team;
  eventIndex: number;
  onNext: () => void;
  onSkip: () => void;
  onReset: () => void;
  onRecordWeek: () => void;
}) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [simSpeed, setSimSpeed] = useState<1 | 2 | 4>(2);
  const event = game.events[Math.min(eventIndex, game.events.length - 1)];
  const awayStarter = game.away.rotation[0];
  const homeStarter = game.home.rotation[0];
  const recentEvents = game.events.slice(Math.max(0, eventIndex - 4), eventIndex + 1).reverse();
  const headCoach = team.staff?.head;
  const headCoachPlan = headCoach ? gamePlanForTeam(team) : null;
  const isComplete = eventIndex >= game.events.length - 1;
  const liveLines = isComplete ? { awayLine: game.awayLine, homeLine: game.homeLine } : liveLineScore(game, eventIndex);

  useEffect(() => {
    if (!isPlaying || isComplete) return;
    const timer = window.setTimeout(onNext, simSpeed === 4 ? 220 : simSpeed === 2 ? 520 : 1050);
    return () => window.clearTimeout(timer);
  }, [isComplete, isPlaying, onNext, simSpeed, eventIndex]);

  useEffect(() => {
    if (isComplete) setIsPlaying(false);
  }, [isComplete]);

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
              <button
                onClick={() => setSimSpeed((current) => (current === 1 ? 2 : current === 2 ? 4 : 1))}
                type="button"
              >
                <Radio size={17} />
                <span>{simSpeed}x</span>
              </button>
              <button onClick={onSkip} type="button">
                <SkipForward size={17} />
                <span>Final</span>
              </button>
              <button onClick={onReset} type="button">
                <RotateCcw size={17} />
                <span>Reset</span>
              </button>
              {isComplete ? (
                <button onClick={onRecordWeek} type="button">
                  <ListChecks size={17} />
                  <span>Record Week</span>
                </button>
              ) : null}
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

function LeagueView({ teams }: { teams: Team[] }) {
  const standings = [...teams].sort((left, right) => right.wins - left.wins || left.losses - right.losses);
  const premier = standings.filter((team) => team.division === "Premier");
  const challenger = standings.filter((team) => team.division === "Challenger");
  const statLeaders = [...teams.flatMap((team) => team.lineup.map((player) => ({ ...player, team: team.abbreviation })))]
    .sort((left, right) => playerOverall(right) - playerOverall(left))
    .slice(0, 8);

  return (
    <section className="view stats-view">
      <div className="section-title">
        <div>
          <p className="eyebrow">Box score office</p>
          <h2>Standings and Leaders</h2>
        </div>
      </div>
      <div className="stats-columns">
        <table className="ledger-table">
          <caption>Premier Division</caption>
          <thead>
            <tr>
              <th>Team</th>
              <th>OVR</th>
              <th>W</th>
              <th>L</th>
              <th>RF</th>
              <th>RA</th>
            </tr>
          </thead>
          <tbody>
            {premier.map((team, index) => (
              <tr key={team.id}>
                <th>{team.name}{index === premier.length - 1 ? " ▼" : ""}</th>
                <td>{teamOverall(team)}</td>
                <td>{team.wins}</td>
                <td>{team.losses}</td>
                <td>{team.runsFor}</td>
                <td>{team.runsAgainst}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <table className="ledger-table">
          <caption>Challenger Division</caption>
          <thead>
            <tr>
              <th>Team</th>
              <th>OVR</th>
              <th>W</th>
              <th>L</th>
              <th>Cash</th>
            </tr>
          </thead>
          <tbody>
            {challenger.map((team, index) => (
              <tr key={team.id}>
                <th>{team.name}{index === 0 ? " ▲" : ""}</th>
                <td>{teamOverall(team)}</td>
                <td>{team.wins}</td>
                <td>{team.losses}</td>
                <td>{money(team.cash)}</td>
              </tr>
            ))}
          </tbody>
        </table>

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
            <button disabled={seasonReady} onClick={onAdvanceWeek} type="button">{canRecordWeek ? "Record Week Result" : "Watch Match"}</button>
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
  const [teams, setTeams] = useState<Team[]>(() => initialSaved?.teams ?? league.teams);
  const [freeAgents, setFreeAgents] = useState<Player[]>(() => initialSaved?.freeAgents ?? league.freeAgents);
  const [selections, setSelections] = useState<SelectionMap>(() => initialSaved?.selections ?? defaultSelections(league.teams));
  const [ownedTeamId, setOwnedTeamId] = useState<string | null>(() => initialSaved?.ownedTeamId ?? null);
  const [seasonState, setSeasonState] = useState<SeasonState>(() => initialSaved?.seasonState ?? initialSeasonState);
  const [scoutingState, setScoutingState] = useState<ScoutingState>(() => initialSaved?.scoutingState ?? initialScoutingState);
  const [purchasedUpgrades, setPurchasedUpgrades] = useState<string[]>(() => initialSaved?.purchasedUpgrades ?? []);
  const managedTeams = useMemo(
    () => teams.map((team) => applySelection(team, selections[team.id])),
    [teams, selections],
  );
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [selectedTeamId, setSelectedTeamId] = useState(league.teams[0].id);
  const [gameIndex, setGameIndex] = useState(0);
  const [eventIndex, setEventIndex] = useState(0);
  const [hasHydratedRemote, setHasHydratedRemote] = useState(false);
  const ownedTeam = ownedTeamId ? managedTeams.find((team) => team.id === ownedTeamId) : null;
  const selectedTeam = ownedTeam ?? managedTeams.find((team) => team.id === selectedTeamId) ?? managedTeams[0];
  const selectedChoice = selections[selectedTeam.id] ?? defaultSelections([selectedTeam])[selectedTeam.id];
  const opponents = managedTeams.filter((team) => team.id !== selectedTeam.id && team.division === selectedTeam.division);
  const opponent = opponents[gameIndex % Math.max(1, opponents.length)] ?? managedTeams.find((team) => team.id !== selectedTeam.id) ?? selectedTeam;
  const scheduled = ownedTeam
    ? {
        id: `owned-${selectedTeam.id}-${opponent.id}-${gameIndex}`,
        day: league.day + gameIndex,
        awayId: selectedTeam.id,
        homeId: opponent.id,
        label: `${selectedTeam.abbreviation} at ${opponent.abbreviation}`,
      }
    : league.schedule[gameIndex % league.schedule.length];
  const schedulePreview = ownedTeam
    ? Array.from({ length: 5 }, (_, index) => {
        const previewOpponent = opponents[index % Math.max(1, opponents.length)] ?? opponent;
        return {
          id: `owned-preview-${selectedTeam.id}-${previewOpponent.id}-${index}`,
          day: league.day + index,
          label: `${selectedTeam.abbreviation} at ${previewOpponent.abbreviation}`,
        };
      })
    : league.schedule.slice(0, 5);
  const game = useMemo(() => {
    const away = managedTeams.find((team) => team.id === scheduled.awayId) ?? managedTeams[0];
    const home = managedTeams.find((team) => team.id === scheduled.homeId) ?? managedTeams[1];
    return simulateGame(away, home, scheduled.id);
  }, [managedTeams, scheduled]);

  useEffect(() => {
    getSupabaseAuthUser().then(async (remoteUser) => {
      if (!remoteUser) {
        const storedUser = loadAuthUser();
        if (storedUser) {
          setAuthUser(storedUser);
          const localSave = loadSavedState(storedUser);
          if (localSave) {
            setTeams(localSave.teams);
            setFreeAgents(localSave.freeAgents);
            setSelections(localSave.selections);
            setOwnedTeamId(localSave.ownedTeamId ?? null);
            setSeasonState(localSave.seasonState ?? initialSeasonState);
            setScoutingState(localSave.scoutingState ?? initialScoutingState);
            setPurchasedUpgrades(localSave.purchasedUpgrades ?? []);
          }
        }
        setHasHydratedRemote(true);
        return;
      }
      saveAuthUser(remoteUser);
      setAuthUser(remoteUser);
      const remoteSave = await loadRemoteSave(remoteUser.id);
      if (isSavedGamePayload(remoteSave)) {
        setTeams(remoteSave.teams as Team[]);
        setFreeAgents(remoteSave.freeAgents as Player[]);
        setSelections(remoteSave.selections as SelectionMap);
        setOwnedTeamId(remoteSave.ownedTeamId ?? null);
        setSeasonState((remoteSave.seasonState as SeasonState | undefined) ?? initialSeasonState);
        setScoutingState((remoteSave.scoutingState as ScoutingState | undefined) ?? initialScoutingState);
        setPurchasedUpgrades(remoteSave.purchasedUpgrades ?? []);
      } else {
        const localSave = loadSavedState(remoteUser);
        if (localSave) {
          setTeams(localSave.teams);
          setFreeAgents(localSave.freeAgents);
          setSelections(localSave.selections);
          setOwnedTeamId(localSave.ownedTeamId ?? null);
          setSeasonState(localSave.seasonState ?? initialSeasonState);
          setScoutingState(localSave.scoutingState ?? initialScoutingState);
          setPurchasedUpgrades(localSave.purchasedUpgrades ?? []);
        }
      }
      setHasHydratedRemote(true);
    });
  }, []);

  useEffect(() => {
    if (!hasHydratedRemote) return;
    const saveData: SavedGameState = { teams, freeAgents, selections, ownedTeamId, seasonState, scoutingState, purchasedUpgrades };
    window.localStorage.setItem(profileSaveKey(authUser), JSON.stringify(saveData));
    if (authUser?.provider === "supabase" && authUser.id && hasHydratedRemote) {
      void saveRemoteSave(authUser, saveData);
    }
  }, [authUser, freeAgents, hasHydratedRemote, ownedTeamId, purchasedUpgrades, scoutingState, seasonState, selections, teams]);

  async function signOut() {
    window.localStorage.setItem(profileSaveKey(authUser), JSON.stringify({ teams, freeAgents, selections, ownedTeamId, seasonState, scoutingState, purchasedUpgrades }));
    await signOutSupabase();
    clearAuthUser();
    const guestSave = loadSavedState(null);
    setAuthUser(null);
    setTeams(guestSave?.teams ?? league.teams);
    setFreeAgents(guestSave?.freeAgents ?? league.freeAgents);
    setSelections(guestSave?.selections ?? defaultSelections(league.teams));
    setOwnedTeamId(guestSave?.ownedTeamId ?? null);
    setSeasonState(guestSave?.seasonState ?? initialSeasonState);
    setScoutingState(guestSave?.scoutingState ?? initialScoutingState);
    setPurchasedUpgrades(guestSave?.purchasedUpgrades ?? []);
  }

  function createOwnedTeam(city: string, mascot: string, budget: StartingBudget) {
    const team = createExpansionTeam(authUser?.email ?? "guest", city, mascot, budget);
    setTeams((current) => [team, ...current.filter((candidate) => candidate.id !== team.id)]);
    setSelections((current) => ({
      ...current,
      [team.id]: {
        lineupIds: team.lineup.map((player) => player.id),
        starterId: team.rotation[0].id,
      },
    }));
    setOwnedTeamId(team.id);
    setSelectedTeamId(team.id);
    setSeasonState(initialSeasonState);
    setScoutingState(initialScoutingState);
    setPurchasedUpgrades([]);
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

  function advanceLeagueWeek() {
    if (seasonState.week > seasonState.seasonLength) return;
    if (eventIndex < game.events.length - 1) {
      setActiveTab("match");
      window.history.pushState(null, "", "/match");
      return;
    }
    const awayRuns = lineRuns(game.awayLine);
    const homeRuns = lineRuns(game.homeLine);
    const userIsAway = game.away.id === selectedTeam.id;
    const userRuns = userIsAway ? awayRuns : homeRuns;
    const opponentRuns = userIsAway ? homeRuns : awayRuns;
    const opponentTeam = userIsAway ? game.home : game.away;
    const won = userRuns > opponentRuns;
    const gateIncome = 180 + Math.round(selectedTeam.fanSupport * 4) + (won ? 90 : 25);
    const sponsorBonus = selectedTeam.sponsor && won ? selectedTeam.sponsor.bonus : 0;
    const payrollBill = Math.max(120, Math.round(selectedTeam.payroll * 0.1));
    const net = gateIncome + sponsorBonus - payrollBill;

    setTeams((current) =>
      current.map((candidate) => {
        if (candidate.id === selectedTeam.id) {
          return {
            ...candidate,
            wins: candidate.wins + (won ? 1 : 0),
            losses: candidate.losses + (won ? 0 : 1),
            runsFor: candidate.runsFor + userRuns,
            runsAgainst: candidate.runsAgainst + opponentRuns,
            cash: candidate.cash + net,
            fanSupport: Math.max(1, Math.min(99, candidate.fanSupport + (won ? 2 : -1))),
            chemistry: Math.max(1, Math.min(99, candidate.chemistry + (won ? 1 : -1))),
            roster: candidate.roster.map((player) => ({
              ...player,
              fatigue: Math.min(99, player.fatigue + (candidate.lineup.some((picked) => picked.id === player.id) ? 4 : 1)),
              morale: Math.max(1, Math.min(99, player.morale + (won ? 2 : -2))),
            })),
          };
        }
        if (candidate.id === opponentTeam.id) {
          return {
            ...candidate,
            wins: candidate.wins + (won ? 0 : 1),
            losses: candidate.losses + (won ? 1 : 0),
            runsFor: candidate.runsFor + opponentRuns,
            runsAgainst: candidate.runsAgainst + userRuns,
          };
        }
        return candidate;
      }),
    );

    setSeasonState((current) => ({
      ...current,
      week: current.week + 1,
      reputation: Math.max(1, current.reputation + (won ? 2 : -1)),
      lastWeekSummary: [
        `${selectedTeam.abbreviation} ${userRuns}, ${opponentTeam.abbreviation} ${opponentRuns}: ${won ? "win" : "loss"}.`,
        `Gate ${money(gateIncome)} + sponsor ${money(sponsorBonus)} - payroll ${money(payrollBill)} = ${money(net)}.`,
        won ? "Board confidence rises; fan support ticks upward." : "Board pressure rises; morale needs attention.",
      ],
    }));
    setGameIndex((current) => current + 1);
    setEventIndex(0);
    setActiveTab("season");
    window.history.pushState(null, "", "/season");
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
              wins: 0,
              losses: 0,
              runsFor: 0,
              runsAgainst: 0,
              cash: candidate.cash + (promotes ? 1200 : relegates ? -500 : 350),
              fanSupport: Math.max(1, Math.min(99, candidate.fanSupport + (promotes ? 8 : relegates ? -8 : 2))),
              roster: candidate.roster.map((player) => ({ ...player, fatigue: Math.max(0, player.fatigue - 18) })),
            }
          : candidate,
      ),
    );
    setSeasonState((current) => ({
      season: current.season + 1,
      week: 1,
      seasonLength: current.seasonLength,
      reputation: Math.max(1, current.reputation + (promotes ? 10 : relegates ? -10 : 3)),
      phase: "season",
      lastWeekSummary: [
        promotes ? "Promotion secured. The club moves into Premier." : relegates ? "Relegation confirmed. The club drops into Challenger." : "Season complete. The board keeps the project alive.",
        `Final table position: #${rank || "-"}. New target: ${nextDivision === "Premier" ? "survive the top division" : "fight for promotion"}.`,
      ],
    }));
    setGameIndex(0);
    setActiveTab("office");
    window.history.pushState(null, "", "/office");
  }

  function nextEvent() {
    setEventIndex((current) => Math.min(game.events.length - 1, current + 1));
  }

  function skipGame() {
    setEventIndex(game.events.length - 1);
  }

  function resetGame() {
    setEventIndex(0);
  }

  function nextScheduledGame() {
    setGameIndex((current) => (current + 1) % league.schedule.length);
    setEventIndex(0);
    setActiveTab("match");
    window.history.pushState(null, "", "/match");
  }

  const discoveredProspects = freeAgents.filter((player) => scoutingState.foundIds.includes(player.id));

  if (!hasHydratedRemote) {
    return (
      <main className="login-shell">
        <section className="login-panel">
          <p className="eyebrow">Manager account</p>
          <h1>Loading Save</h1>
          <p className="team-story">Checking the local clubhouse ledger.</p>
        </section>
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
      <Sidebar teams={managedTeams} selectedTeamId={selectedTeamId} onSelectTeam={setSelectedTeamId} />

      <div className="workspace">
        <Header
          activeTab={activeTab}
          onTab={setActiveTab}
          day={league.day}
          game={game}
          team={selectedTeam}
          user={authUser}
          onSignOut={signOut}
        />

        <div className="game-flow">
          <div className="flow-card is-current">
            <CalendarDays size={18} />
            <div>
              <span>Manage Club</span>
              <strong>{selectedTeam.name}</strong>
            </div>
          </div>
          <div className="flow-card">
            <ListChecks size={18} />
            <div>
              <span>Set Lineup</span>
              <strong>{selectedChoice.lineupIds.length}/9 hitters, 1 starter</strong>
            </div>
          </div>
          <div className="flow-card">
            <Radio size={18} />
            <div>
              <span>Next Game</span>
              <strong>{scheduled.label}</strong>
            </div>
          </div>
        </div>

        <div className="schedule-ribbon">
          {schedulePreview.map((item, index) => (
            <button
              className={index === gameIndex ? "is-active" : ""}
              key={item.id}
              onClick={() => {
                setGameIndex(index);
                setEventIndex(0);
                setActiveTab("match");
              }}
              type="button"
            >
              <span>Day {item.day}</span>
              <strong>{item.label}</strong>
            </button>
          ))}
          <button className="next-game" onClick={nextScheduledGame} type="button">
            <SkipForward size={16} />
          </button>
        </div>

        {activeTab === "office" ? (
          <OfficeView
            team={selectedTeam}
            nextGame={scheduled.label}
            onAutoPick={autoPick}
            onOpenSeason={() => {
              setActiveTab("season");
              window.history.pushState(null, "", "/season");
            }}
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
            onNext={nextEvent}
            onRecordWeek={advanceLeagueWeek}
            onReset={resetGame}
            onSkip={skipGame}
          />
        ) : null}
        {activeTab === "season" ? (
          <SeasonView
            team={selectedTeam}
            teams={managedTeams}
            seasonState={seasonState}
            nextGame={scheduled.label}
            canRecordWeek={eventIndex >= game.events.length - 1}
            onAdvanceWeek={advanceLeagueWeek}
            onFinishSeason={finishSeason}
          />
        ) : null}
        {activeTab === "news" ? <ChronicleView entries={league.chronicle} game={game} /> : null}
        {activeTab === "league" ? <LeagueView teams={managedTeams} /> : null}
      </div>
    </main>
  );
}
