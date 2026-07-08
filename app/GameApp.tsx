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
  ListChecks,
  Megaphone,
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
import { createLeague, sponsorPool, type Player, type Sponsor, type Team } from "./lib/league";
import { simulateGame, type BaseRunner, type BoxLine, type GameEvent } from "./lib/simulation";

const tabs = [
  { id: "office", label: "Office", icon: Building2, href: "/office" },
  { id: "squad", label: "Squad", icon: ClipboardList, href: "/squad" },
  { id: "training", label: "Training", icon: Dumbbell, href: "/training" },
  { id: "market", label: "Market", icon: DollarSign, href: "/market" },
  { id: "facilities", label: "Facilities", icon: Hammer, href: "/facilities" },
  { id: "sponsors", label: "Sponsors", icon: Megaphone, href: "/sponsors" },
  { id: "league", label: "League", icon: BarChart3, href: "/league" },
  { id: "season", label: "Season", icon: CalendarDays, href: "/season" },
  { id: "match", label: "Match", icon: Radio, href: "/match" },
  { id: "news", label: "News", icon: BookOpen, href: "/news" },
] as const;

type TabId = (typeof tabs)[number]["id"];
type TeamSelection = {
  lineupIds: string[];
  starterId: string;
};

type SelectionMap = Record<string, TeamSelection>;
type SavedGameState = {
  teams: Team[];
  freeAgents: Player[];
  selections: SelectionMap;
};

const saveKey = "diamond-manager-gm-state-v2";

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
    payroll: team.roster.reduce((sum, player) => sum + player.salary, 0),
  };
}

function money(value: number) {
  return `$${value.toLocaleString()}k`;
}

function avg(players: Player[], key: keyof Player) {
  return Math.round(players.reduce((sum, player) => sum + Number(player[key]), 0) / players.length);
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

function OfficeView({
  team,
  nextGame,
  onAutoPick,
  onTrain,
  onFacility,
}: {
  team: Team;
  nextGame: string;
  onAutoPick: (team: Team) => void;
  onTrain: (team: Team) => void;
  onFacility: (team: Team) => void;
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
          <p className="eyebrow">General manager desk</p>
          <h2>{team.name}</h2>
        </div>
        <TeamMark team={team} />
      </div>

      <div className="office-grid">
        <div className="office-panel finance-board">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Club money</p>
              <h3>Budget</h3>
            </div>
            <DollarSign size={20} />
          </div>
          <div className="finance-lines">
            <span>Cash <strong>{money(team.cash)}</strong></span>
            <span>Payroll <strong>{money(team.payroll)}</strong></span>
            <span>Wage room <strong className={wageRoom < 0 ? "danger" : ""}>{money(wageRoom)}</strong></span>
            <span>Fan support <strong>{team.fanSupport}</strong></span>
          </div>
        </div>

        <div className="office-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Board demand</p>
              <h3>{team.boardTarget}</h3>
            </div>
            <TrendingUp size={20} />
          </div>
          <p className="team-story">{tableHint} Next fixture: {nextGame}.</p>
          <div className="office-actions">
            <button onClick={() => onAutoPick(team)} type="button">Set Best Lineup</button>
            <button disabled={team.cash < 350} onClick={() => onTrain(team)} type="button">Train Squad - $350k</button>
            <button disabled={team.cash < 700} onClick={() => onFacility(team)} type="button">Upgrade Facility - $700k</button>
          </div>
        </div>

        <div className="office-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Division status</p>
              <h3>{team.division}</h3>
            </div>
            <Trophy size={20} />
          </div>
          <div className="team-summary compact-summary">
            <StatPill label="Overall" value={`${letterGrade(teamOverall(team))} ${teamOverall(team)}`} />
            <StatPill label="Record" value={`${team.wins}-${team.losses}`} />
            <StatPill label="Stadium" value={team.stadium} />
          </div>
        </div>
      </div>
    </section>
  );
}

function TrainingView({
  team,
  onTrainPlayer,
}: {
  team: Team;
  onTrainPlayer: (team: Team, player: Player, drill: "batting" | "fielding" | "conditioning" | "mastery") => void;
}) {
  const prospects = [...team.roster]
    .sort((left, right) => left.age - right.age || playerOverall(left) - playerOverall(right))
    .slice(0, 10);

  return (
    <section className="view training-view">
      <div className="section-title">
        <div>
          <p className="eyebrow">Weekly development slots</p>
          <h2>Training Camp</h2>
        </div>
        <StatPill label="Chemistry" value={team.chemistry} />
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
      </div>
    </section>
  );
}

function FacilitiesView({
  team,
  onUpgradeNamedFacility,
  onCraftGear,
}: {
  team: Team;
  onUpgradeNamedFacility: (team: Team, facility: keyof Team["facilities"]) => void;
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
      <div className="stats-columns">
        <section className="pool-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Permanent upgrades</p>
              <h3>Facility Board</h3>
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

        <section className="pool-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Team gear</p>
              <h3>Crafting Bench</h3>
            </div>
          </div>
          <div className="compact-list">
            {(["bats", "gloves", "cleats", "uniforms"] as const).map((gear) => (
              <button className="compact-player" key={gear} onClick={() => onCraftGear(team, gear)} type="button">
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
  freeAgents,
  onSign,
  onRelease,
}: {
  team: Team;
  freeAgents: Player[];
  onSign: (player: Player) => void;
  onRelease: (team: Team, player: Player) => void;
}) {
  const rosterByValue = [...team.roster].sort((left, right) => right.value - left.value).slice(0, 8);

  return (
    <section className="view market-view">
      <div className="section-title">
        <div>
          <p className="eyebrow">Transfers and contracts</p>
          <h2>Market Office</h2>
        </div>
        <StatPill label="Cash" value={money(team.cash)} />
      </div>
      <div className="stats-columns">
        <section className="pool-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Available players</p>
              <h3>Transfer Market</h3>
            </div>
          </div>
          <div className="compact-list">
            {freeAgents.map((player) => (
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

function Diamond({ event }: { event: GameEvent }) {
  const baseLabels = ["1B", "2B", "3B"];
  const basePoints = [
    [194, 138],
    [130, 74],
    [66, 138],
  ];

  return (
    <div className="diamond-wrap" aria-label="live base diamond">
      <svg viewBox="0 0 260 220" role="img">
        <path className="grass" d="M130 28 L226 124 L130 220 L34 124 Z" />
        <path className="chalk" d="M130 28 L226 124 L130 220 L34 124 Z" />
        <path className="infield" d="M130 72 L182 124 L130 176 L78 124 Z" />
        <line className="foul" x1="130" y1="220" x2="34" y2="124" />
        <line className="foul" x1="130" y1="220" x2="226" y2="124" />
        <circle className="mound" cx="130" cy="124" r="15" />
        <rect className="plate" x="121" y="202" width="18" height="12" rx="2" />
        {basePoints.map(([x, y], index) => {
          const runner = event.bases[index];
          return (
            <g key={baseLabels[index]}>
              <rect
                className={`base ${runner ? "occupied" : ""}`}
                x={x - 9}
                y={y - 9}
                width="18"
                height="18"
                transform={`rotate(45 ${x} ${y})`}
              />
              {runner ? <circle className="runner" cx={x} cy={y} r="6" /> : null}
            </g>
          );
        })}
      </svg>
      <div className="base-ledger">
        {event.bases.map((base: BaseRunner, index) => (
          <span key={baseLabels[index]}>
            {baseLabels[index]} <strong>{base?.name.split(" ").at(-1) ?? "-"}</strong>
          </span>
        ))}
      </div>
    </div>
  );
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
  eventIndex,
  onNext,
  onSkip,
  onReset,
}: {
  game: ReturnType<typeof simulateGame>;
  eventIndex: number;
  onNext: () => void;
  onSkip: () => void;
  onReset: () => void;
}) {
  const event = game.events[Math.min(eventIndex, game.events.length - 1)];
  const awayStarter = game.away.rotation[0];
  const homeStarter = game.home.rotation[0];

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
          <span>{event.ticker} / {game.headline} / {game.final} / {event.ticker}</span>
        </div>

        <div className="game-grid">
          <Diamond event={event} />
          <div className="play-feed">
            <LineScore away={game.away} home={game.home} awayLine={game.awayLine} homeLine={game.homeLine} />
            <article className="play-card">
              <div className="result-light">{event.result}</div>
              <h3>{event.batter} vs. {event.pitcher}</h3>
              <p>{event.text}</p>
              <meter min="0" max="1" value={event.leverage} />
            </article>
            <div className="controls">
              <button onClick={onNext} type="button">
                <Play size={17} />
                <span>Next</span>
              </button>
              <button onClick={onSkip} type="button">
                <SkipForward size={17} />
                <span>Final</span>
              </button>
              <button onClick={onReset} type="button">
                <RotateCcw size={17} />
                <span>Reset</span>
              </button>
            </div>
          </div>
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
  const managedTeams = useMemo(
    () => teams.map((team) => applySelection(team, selections[team.id])),
    [teams, selections],
  );
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [selectedTeamId, setSelectedTeamId] = useState(league.teams[0].id);
  const [gameIndex, setGameIndex] = useState(0);
  const [eventIndex, setEventIndex] = useState(0);
  const [hasHydratedRemote, setHasHydratedRemote] = useState(false);
  const selectedTeam = managedTeams.find((team) => team.id === selectedTeamId) ?? managedTeams[0];
  const selectedChoice = selections[selectedTeam.id] ?? defaultSelections([selectedTeam])[selectedTeam.id];
  const scheduled = league.schedule[gameIndex % league.schedule.length];
  const game = useMemo(() => {
    const away = managedTeams.find((team) => team.id === scheduled.awayId) ?? managedTeams[0];
    const home = managedTeams.find((team) => team.id === scheduled.homeId) ?? managedTeams[1];
    return simulateGame(away, home, scheduled.id);
  }, [managedTeams, scheduled]);

  useEffect(() => {
    getSupabaseAuthUser().then(async (remoteUser) => {
      if (!remoteUser) {
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
      } else {
        const localSave = loadSavedState(remoteUser);
        if (localSave) {
          setTeams(localSave.teams);
          setFreeAgents(localSave.freeAgents);
          setSelections(localSave.selections);
        }
      }
      setHasHydratedRemote(true);
    });
  }, []);

  useEffect(() => {
    const saveData: SavedGameState = { teams, freeAgents, selections };
    window.localStorage.setItem(profileSaveKey(authUser), JSON.stringify(saveData));
    if (authUser?.provider === "supabase" && authUser.id && hasHydratedRemote) {
      void saveRemoteSave(authUser, saveData);
    }
  }, [authUser, freeAgents, hasHydratedRemote, selections, teams]);

  async function signOut() {
    window.localStorage.setItem(profileSaveKey(authUser), JSON.stringify({ teams, freeAgents, selections }));
    await signOutSupabase();
    clearAuthUser();
    const guestSave = loadSavedState(null);
    setAuthUser(null);
    setTeams(guestSave?.teams ?? league.teams);
    setFreeAgents(guestSave?.freeAgents ?? league.freeAgents);
    setSelections(guestSave?.selections ?? defaultSelections(league.teams));
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

  function craftGear(team: Team, gear: "bats" | "gloves" | "cleats" | "uniforms") {
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
          {league.schedule.slice(0, 5).map((item, index) => (
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
            onTrain={trainTeam}
            onFacility={upgradeFacility}
          />
        ) : null}
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
        {activeTab === "training" ? <TrainingView team={selectedTeam} onTrainPlayer={trainPlayer} /> : null}
        {activeTab === "market" ? (
          <MarketView team={selectedTeam} freeAgents={freeAgents} onSign={signPlayer} onRelease={releasePlayer} />
        ) : null}
        {activeTab === "facilities" ? (
          <FacilitiesView team={selectedTeam} onUpgradeNamedFacility={upgradeNamedFacility} onCraftGear={craftGear} />
        ) : null}
        {activeTab === "sponsors" ? (
          <SponsorsView team={selectedTeam} onAcceptSponsor={acceptSponsor} onMediaDay={mediaDay} />
        ) : null}
        {activeTab === "match" ? (
          <MatchView game={game} eventIndex={eventIndex} onNext={nextEvent} onSkip={skipGame} onReset={resetGame} />
        ) : null}
        {activeTab === "season" ? (
          <OfficeView
            team={selectedTeam}
            nextGame={scheduled.label}
            onAutoPick={autoPick}
            onTrain={trainTeam}
            onFacility={upgradeFacility}
          />
        ) : null}
        {activeTab === "news" ? <ChronicleView entries={league.chronicle} game={game} /> : null}
        {activeTab === "league" ? <LeagueView teams={managedTeams} /> : null}
      </div>
    </main>
  );
}
