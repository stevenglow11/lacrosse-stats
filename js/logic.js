// Domain logic for the lacrosse stat tracker. No DOM, so it can be unit tested.

export const STORAGE_KEY = "laxstats.v1";

export const QUARTERS = ["Q1", "Q2", "Q3", "Q4", "OT"];

export const EVENT_TYPES = [
  "goal",
  "assist",
  "shot",
  "sog",
  "gb",
  "ct",
  "to",
  "fow",
  "fol",
  "save",
  "ga",
  "pim",
  "opp_goal",
];

const EVENT_SET = new Set(EVENT_TYPES);

export const POSITIONS = [
  { id: "A", label: "Attack" },
  { id: "M", label: "Midfield" },
  { id: "FO", label: "Faceoff" },
  { id: "D", label: "Defense" },
  { id: "LSM", label: "LSM" },
  { id: "SSDM", label: "SSDM" },
  { id: "G", label: "Goalie" },
];

const POSITION_SET = new Set(POSITIONS.map((p) => p.id));

export const COUNTING_KEYS = ["g", "a", "sh", "sog", "gb", "ct", "to", "fow", "fol", "sv", "ga", "pim"];

export const RATE_KEYS = new Set(["shPct", "foPct", "svPct"]);

export const TABLE_COLUMNS = [
  { key: "g", label: "G", title: "Goals" },
  { key: "a", label: "A", title: "Assists" },
  { key: "pts", label: "PTS", title: "Points (goals + assists)" },
  { key: "sh", label: "SH", title: "Shots. A goal counts as a shot." },
  { key: "sog", label: "SOG", title: "Shots on goal. A goal counts as a shot on goal." },
  { key: "shPct", label: "SH%", title: "Shooting percentage: goals divided by shots" },
  { key: "gb", label: "GB", title: "Ground balls" },
  { key: "ct", label: "CT", title: "Caused turnovers" },
  { key: "to", label: "TO", title: "Turnovers" },
  { key: "fow", label: "FOW", title: "Faceoff wins" },
  { key: "fol", label: "FOL", title: "Faceoff losses" },
  { key: "foPct", label: "FO%", title: "Faceoff percentage: wins divided by faceoffs" },
  { key: "sv", label: "SV", title: "Saves" },
  { key: "ga", label: "GA", title: "Goals against (goalie)" },
  { key: "svPct", label: "SV%", title: "Save percentage: saves divided by saves plus goals against" },
  { key: "pim", label: "PIM", title: "Penalty minutes" },
];

export const STAT_BUTTONS = [
  { type: "goal", name: "Goal", sub: "scores", className: "stat-goal span-2", aria: "Goal" },
  { type: "assist", name: "Assist", sub: "pass", className: "", aria: "Assist" },
  { type: "opp_goal", name: "Opp", sub: "their goal", className: "stat-opp", aria: "Opponent goal" },
  { type: "shot", name: "Shot", sub: "missed", className: "", aria: "Shot" },
  { type: "sog", name: "SOG", sub: "on goal", className: "", aria: "Shot on goal" },
  { type: "gb", name: "GB", sub: "ground ball", className: "", aria: "Ground ball" },
  { type: "ct", name: "CT", sub: "caused TO", className: "", aria: "Caused turnover" },
  { type: "to", name: "TO", sub: "turnover", className: "", aria: "Turnover" },
  { type: "fow", name: "FO+", sub: "win", className: "", aria: "Faceoff win" },
  { type: "fol", name: "FO−", sub: "loss", className: "", aria: "Faceoff loss" },
  { type: "save", name: "Save", sub: "goalie", className: "", aria: "Save" },
  { type: "ga", name: "GA", sub: "against", className: "", aria: "Goal against" },
  { type: "pim", name: "Penalty", sub: "minutes", className: "span-3", aria: "Penalty" },
];

export const PIM_PRESETS = [
  { minutes: 0.5, label: "0:30" },
  { minutes: 1, label: "1:00" },
  { minutes: 1.5, label: "1:30" },
  { minutes: 2, label: "2:00" },
  { minutes: 3, label: "3:00" },
];

const VIEWS = new Set(["games", "live", "stats", "roster", "box"]);

export function uid(prefix) {
  const rnd = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${rnd}`;
}

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function clip(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

export function todayISO(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!match) return iso || "";
  const dt = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

export function formatTime(ts) {
  if (!ts) return "";
  const dt = new Date(ts);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function normNumber(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (!/^\d{1,3}$/.test(raw)) return "";
  return String(Number(raw));
}

export function positionLabel(id) {
  return POSITIONS.find((p) => p.id === id)?.label || "";
}

export function playerName(player) {
  if (!player) return "Unknown player";
  const first = String(player.firstName || "").trim();
  const last = String(player.lastName || "").trim();
  return [first, last].filter(Boolean).join(" ") || "Unnamed";
}

export function chipLabel(player, players) {
  const first = String(player.firstName || "").trim();
  const last = String(player.lastName || "").trim();
  if (!last) return first || "Player";
  if (!first) return last;
  const collisions = (players || []).filter((p) => String(p.lastName || "").trim() === last);
  if (collisions.length > 1) return `${first} ${last[0].toUpperCase()}.`;
  return last;
}

export function playerAria(player) {
  const name = playerName(player);
  const number = normNumber(player.number);
  return number ? `Number ${number}, ${name}` : `No number, ${name}`;
}

export function sortPlayers(players) {
  return [...players].sort((a, b) => {
    const an = normNumber(a.number);
    const bn = normNumber(b.number);
    if (an && bn && an !== bn) return Number(an) - Number(bn);
    if (an && !bn) return -1;
    if (!an && bn) return 1;
    return playerName(a).localeCompare(playerName(b), "en", { sensitivity: "base" });
  });
}

export function duplicateGroups(players) {
  const groups = new Map();
  for (const player of players) {
    const number = normNumber(player.number);
    if (!number) continue;
    if (!groups.has(number)) groups.set(number, []);
    groups.get(number).push(player);
  }
  return [...groups.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([number, list]) => ({ number, names: list.map(playerName) }));
}

export function versus(game) {
  if (!game) return "";
  return game.homeAway === "away" ? `@ ${game.opponent}` : `vs ${game.opponent}`;
}

export function emptyLine() {
  return { g: 0, a: 0, sh: 0, sog: 0, gb: 0, ct: 0, to: 0, fow: 0, fol: 0, sv: 0, ga: 0, pim: 0 };
}

export function applyEvent(line, event) {
  switch (event.type) {
    case "goal":
      line.g += 1;
      line.sh += 1;
      line.sog += 1;
      break;
    case "assist":
      line.a += 1;
      break;
    case "shot":
      line.sh += 1;
      break;
    case "sog":
      line.sh += 1;
      line.sog += 1;
      break;
    case "gb":
      line.gb += 1;
      break;
    case "ct":
      line.ct += 1;
      break;
    case "to":
      line.to += 1;
      break;
    case "fow":
      line.fow += 1;
      break;
    case "fol":
      line.fol += 1;
      break;
    case "save":
      line.sv += 1;
      break;
    case "ga":
      line.ga += 1;
      break;
    case "pim":
      line.pim += Number(event.minutes) || 0;
      break;
    default:
      break;
  }
}

export function derive(line) {
  const base = emptyLine();
  for (const key of COUNTING_KEYS) base[key] = Number(line?.[key]) || 0;
  base.pts = base.g + base.a;
  base.shPct = base.sh > 0 ? base.g / base.sh : null;
  base.foPct = base.fow + base.fol > 0 ? base.fow / (base.fow + base.fol) : null;
  base.svPct = base.sv + base.ga > 0 ? base.sv / (base.sv + base.ga) : null;
  return base;
}

export function sumLines(lines) {
  const total = emptyLine();
  for (const line of lines) {
    for (const key of COUNTING_KEYS) total[key] += Number(line[key]) || 0;
  }
  return derive(total);
}

export function formatPct(ratio) {
  if (ratio == null || !Number.isFinite(ratio)) return "—";
  const rounded = Math.round(ratio * 1000) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text}%`;
}

export function formatCount(value) {
  const n = Number(value) || 0;
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function formatAvg(value) {
  if (value == null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

export function formatStat(key, line, mode, gp) {
  if (RATE_KEYS.has(key)) return formatPct(line[key]);
  const value = Number(line[key]) || 0;
  if (mode === "avg") {
    if (!gp) return "—";
    return formatAvg(value / gp);
  }
  return formatCount(value);
}

export function sanitizeMinutes(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(Math.min(n, 10) * 100) / 100;
}

export function scoreGame(events, gameQuarter = "Q1") {
  const byQ = Object.fromEntries(QUARTERS.map((q) => [q, { us: 0, them: 0 }]));
  for (const event of events || []) {
    const quarter = byQ[event.quarter] ? event.quarter : "Q1";
    if (event.type === "goal") byQ[quarter].us += 1;
    else if (event.type === "opp_goal") byQ[quarter].them += 1;
  }
  const total = { us: 0, them: 0 };
  for (const quarter of QUARTERS) {
    total.us += byQ[quarter].us;
    total.them += byQ[quarter].them;
  }
  const showOT = gameQuarter === "OT" || (events || []).some((event) => event.quarter === "OT");
  return { quarters: showOT ? QUARTERS : QUARTERS.slice(0, 4), byQ, total };
}

export function eventLabel(event) {
  switch (event.type) {
    case "goal":
      return "Goal";
    case "assist":
      return "Assist";
    case "shot":
      return "Shot";
    case "sog":
      return "Shot on goal";
    case "gb":
      return "Ground ball";
    case "ct":
      return "Caused turnover";
    case "to":
      return "Turnover";
    case "fow":
      return "Faceoff win";
    case "fol":
      return "Faceoff loss";
    case "save":
      return "Save";
    case "ga":
      return "Goal against";
    case "pim":
      return event.minutes ? `Penalty ${formatCount(event.minutes)} min` : "Penalty";
    case "opp_goal":
      return "Opponent goal";
    default:
      return "Event";
  }
}

export function eventWho(event, team) {
  if (!event || event.type === "opp_goal") return "Opponent";
  const player = team?.players?.find((p) => p.id === event.playerId);
  if (player) {
    const number = normNumber(player.number);
    return `${number ? `#${number} ` : ""}${playerName(player)}`;
  }
  if (event.playerName) {
    const number = normNumber(event.playerNumber);
    return `${number ? `#${number} ` : ""}${event.playerName}`;
  }
  return "Unknown player";
}

function rosterMeta(team, playerId, snapshot) {
  const player = team.players.find((p) => p.id === playerId);
  if (player) {
    return {
      playerId,
      name: playerName(player),
      number: normNumber(player.number),
      position: player.position || "",
      removed: false,
    };
  }
  return {
    playerId,
    name: snapshot?.playerName || "Removed player",
    number: normNumber(snapshot?.playerNumber),
    position: "",
    removed: true,
  };
}

export function boxScore(game, team) {
  const rows = new Map();
  for (const player of sortPlayers(team.players)) {
    rows.set(player.id, {
      playerId: player.id,
      name: playerName(player),
      number: normNumber(player.number),
      position: player.position || "",
      removed: false,
      ...emptyLine(),
    });
  }
  for (const event of game.events) {
    if (!event.playerId || event.type === "opp_goal") continue;
    if (!rows.has(event.playerId)) {
      const meta = rosterMeta(team, event.playerId, event);
      rows.set(event.playerId, { ...meta, ...emptyLine() });
    }
    applyEvent(rows.get(event.playerId), event);
  }
  const players = [...rows.values()].map((row) => ({ ...row, ...derive(row) }));
  return { players, totals: sumLines(players), score: scoreGame(game.events, game.quarter) };
}

export function gamesForTeam(data, teamId) {
  return data.games
    .filter((game) => game.teamId === teamId)
    .slice()
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || 0) - (a.createdAt || 0));
}

export function seasonForTeam(data, team) {
  const games = data.games.filter((game) => game.teamId === team.id);
  const rows = new Map();
  for (const player of sortPlayers(team.players)) {
    rows.set(player.id, {
      playerId: player.id,
      name: playerName(player),
      number: normNumber(player.number),
      position: player.position || "",
      removed: false,
      gp: 0,
      ...emptyLine(),
    });
  }
  let gamesPlayed = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  const record = { w: 0, l: 0, t: 0 };
  for (const game of games) {
    if (!game.events.length) continue;
    gamesPlayed += 1;
    const score = scoreGame(game.events, game.quarter);
    goalsFor += score.total.us;
    goalsAgainst += score.total.them;
    if (score.total.us > score.total.them) record.w += 1;
    else if (score.total.us < score.total.them) record.l += 1;
    else record.t += 1;
    const seen = new Set();
    for (const event of game.events) {
      if (!event.playerId || event.type === "opp_goal") continue;
      if (!rows.has(event.playerId)) {
        const meta = rosterMeta(team, event.playerId, event);
        rows.set(event.playerId, { ...meta, gp: 0, ...emptyLine() });
      }
      applyEvent(rows.get(event.playerId), event);
      seen.add(event.playerId);
    }
    for (const id of seen) rows.get(id).gp += 1;
  }
  const players = [...rows.values()].map((row) => {
    const stats = derive(row);
    return { ...row, ...stats, gp: row.gp };
  });
  return {
    gamesPlayed,
    gamesScheduled: games.length,
    record,
    goalsFor,
    goalsAgainst,
    players,
    totals: sumLines(players),
  };
}

export function leaderboard(players) {
  const cats = [
    { key: "g", label: "Goals", min: (p) => p.g > 0, format: (p) => formatCount(p.g) },
    { key: "a", label: "Assists", min: (p) => p.a > 0, format: (p) => formatCount(p.a) },
    { key: "pts", label: "Points", min: (p) => p.pts > 0, format: (p) => formatCount(p.pts) },
    { key: "sh", label: "Shots", min: (p) => p.sh > 0, format: (p) => formatCount(p.sh) },
    { key: "sog", label: "Shots on goal", min: (p) => p.sog > 0, format: (p) => formatCount(p.sog) },
    { key: "shPct", label: "Shooting %", min: (p) => p.sh >= 1, format: (p) => `${formatPct(p.shPct)} · ${formatCount(p.g)}/${formatCount(p.sh)}` },
    { key: "gb", label: "Ground balls", min: (p) => p.gb > 0, format: (p) => formatCount(p.gb) },
    { key: "ct", label: "Caused turnovers", min: (p) => p.ct > 0, format: (p) => formatCount(p.ct) },
    { key: "foPct", label: "Faceoff %", min: (p) => p.fow + p.fol >= 1, format: (p) => `${formatPct(p.foPct)} · ${formatCount(p.fow)}/${formatCount(p.fow + p.fol)}` },
    { key: "sv", label: "Saves", min: (p) => p.sv > 0, format: (p) => formatCount(p.sv) },
    { key: "svPct", label: "Save %", min: (p) => p.sv + p.ga >= 1, format: (p) => `${formatPct(p.svPct)} · ${formatCount(p.sv)}/${formatCount(p.sv + p.ga)}` },
    { key: "pim", label: "Penalty minutes", min: (p) => p.pim > 0, format: (p) => formatCount(p.pim) },
  ];
  return cats
    .map((cat) => {
      const ranked = players.filter(cat.min).sort((a, b) => (b[cat.key] - a[cat.key]) || a.name.localeCompare(b.name));
      const top = ranked.slice(0, 5);
      let lastValue = null;
      let lastRank = 0;
      const rows = top.map((player, index) => {
        const rank = lastValue != null && Math.abs(player[cat.key] - lastValue) < 1e-9 ? lastRank : index + 1;
        lastValue = player[cat.key];
        lastRank = rank;
        return { rank, name: player.name, number: player.number, value: cat.format(player) };
      });
      return { label: cat.label, rows };
    })
    .filter((cat) => cat.rows.length);
}

export function playerGameLog(data, team, playerId) {
  const games = gamesForTeam(data, team.id);
  const log = [];
  for (const game of games) {
    const line = emptyLine();
    let played = false;
    for (const event of game.events) {
      if (event.playerId === playerId && event.type !== "opp_goal") {
        applyEvent(line, event);
        played = true;
      }
    }
    if (!played && !game.events.length) continue;
    const score = scoreGame(game.events, game.quarter);
    log.push({
      gameId: game.id,
      date: game.date,
      opponent: game.opponent,
      homeAway: game.homeAway,
      location: game.location,
      played,
      score,
      ...derive(line),
    });
  }
  return log;
}

export function cleanPlayerFields(fields) {
  const firstName = clip(fields.firstName, 40);
  const lastName = clip(fields.lastName, 40);
  const rawNumber = String(fields.number ?? "").trim();
  if (!firstName && !lastName) return { error: "Enter a first or last name." };
  if (rawNumber && !/^\d{1,3}$/.test(rawNumber)) return { error: "Use a jersey number from 0 to 999, or leave it blank." };
  const position = POSITION_SET.has(fields.position) ? fields.position : "";
  return { value: { firstName, lastName, number: normNumber(rawNumber), position } };
}

export function cleanGameFields(fields) {
  const opponent = clip(fields.opponent, 60);
  const date = String(fields.date || "").trim();
  const location = clip(fields.location, 80);
  const homeAway = fields.homeAway === "away" ? "away" : "home";
  if (!opponent) return { error: "Enter the opponent." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Enter the game date." };
  return { value: { opponent, date, location, homeAway } };
}

export function addPlayer(team, fields) {
  const cleaned = cleanPlayerFields(fields);
  if (cleaned.error) return cleaned;
  const player = { id: uid("p"), ...cleaned.value };
  team.players.push(player);
  return { player };
}

export function updatePlayer(team, playerId, fields) {
  const cleaned = cleanPlayerFields(fields);
  if (cleaned.error) return cleaned;
  const player = team.players.find((p) => p.id === playerId);
  if (!player) return { error: "That player is no longer on the roster." };
  Object.assign(player, cleaned.value);
  return { player };
}

export function removePlayer(team, playerId) {
  team.players = team.players.filter((player) => player.id !== playerId);
}

export function createGame(data, teamId, fields) {
  const cleaned = cleanGameFields(fields);
  if (cleaned.error) return cleaned;
  const game = {
    id: uid("g"),
    teamId,
    ...cleaned.value,
    quarter: "Q1",
    createdAt: Date.now(),
    events: [],
  };
  data.games.push(game);
  if (!data.activeGameByTeam) data.activeGameByTeam = {};
  data.activeGameByTeam[teamId] = game.id;
  return { game };
}

export function updateGameMeta(game, fields) {
  const cleaned = cleanGameFields(fields);
  if (cleaned.error) return cleaned;
  Object.assign(game, cleaned.value);
  return { game };
}

export function deleteGame(data, gameId) {
  const game = data.games.find((item) => item.id === gameId);
  data.games = data.games.filter((item) => item.id !== gameId);
  if (game && data.activeGameByTeam?.[game.teamId] === gameId) delete data.activeGameByTeam[game.teamId];
  if (data.boxGameId === gameId) data.boxGameId = null;
}

export function addEvent(game, { type, player, quarter, minutes, goalEventId }) {
  if (!EVENT_SET.has(type)) return null;
  if (type !== "opp_goal" && !player) return null;
  const event = {
    id: uid("e"),
    type,
    playerId: type === "opp_goal" || !player ? null : player.id,
    playerName: type === "opp_goal" || !player ? "" : playerName(player),
    playerNumber: type === "opp_goal" || !player ? "" : normNumber(player.number),
    quarter: QUARTERS.includes(quarter) ? quarter : (game.quarter || "Q1"),
    minutes: type === "pim" ? sanitizeMinutes(minutes) : null,
    goalEventId: goalEventId || null,
    ts: Date.now(),
  };
  if (type === "pim" && event.minutes == null) return null;
  game.events.push(event);
  return event;
}

export function undoLast(game) {
  if (!game.events.length) return null;
  return game.events.pop() || null;
}

export function deleteEvent(game, eventId) {
  const before = game.events.length;
  game.events = game.events.filter((event) => event.id !== eventId && event.goalEventId !== eventId);
  return game.events.length !== before;
}

export function updateEvent(game, team, eventId, patch) {
  const event = game.events.find((item) => item.id === eventId);
  if (!event) return { error: "That event is gone." };
  if (patch.type && EVENT_SET.has(patch.type)) event.type = patch.type;
  if (patch.quarter && QUARTERS.includes(patch.quarter)) event.quarter = patch.quarter;
  if (event.type === "opp_goal") {
    event.playerId = null;
    event.playerName = "";
    event.playerNumber = "";
    event.minutes = null;
    event.goalEventId = null;
    return { event };
  }
  const player = team.players.find((p) => p.id === patch.playerId) || team.players.find((p) => p.id === event.playerId);
  if (!player) return { error: "Pick a player for that stat." };
  event.playerId = player.id;
  event.playerName = playerName(player);
  event.playerNumber = normNumber(player.number);
  if (event.type === "pim") {
    const minutes = sanitizeMinutes(patch.minutes != null ? patch.minutes : event.minutes);
    if (minutes == null) return { error: "Enter penalty minutes." };
    event.minutes = minutes;
  } else {
    event.minutes = null;
  }
  if (event.type !== "assist") event.goalEventId = null;
  if (event.type !== "goal") {
    game.events = game.events.filter((item) => item.goalEventId !== event.id);
  }
  return { event };
}

function seedPlayer(id, firstName, lastName, number) {
  return { id, firstName, lastName, number: number || "", position: "" };
}

export function seedTeams() {
  return [
    {
      id: "team91",
      name: "Team 91 2033",
      players: [
        seedPlayer("p_ecke", "", "Ecke", "1"),
        seedPlayer("p_raichle", "Christopher", "Raichle", "2"),
        seedPlayer("p_brandt", "Weston", "Brandt", "3"),
        seedPlayer("p_dimitrakakis", "Ryker", "Dimitrakakis", "5"),
        seedPlayer("p_marron", "Declan", "Marron", "7"),
        seedPlayer("p_tricarico", "Michael", "Tricarico", "10"),
        seedPlayer("p_eichner", "Logan", "Eichner", "12"),
        seedPlayer("p_carey", "Jake", "Carey", "15"),
        seedPlayer("p_fernandez", "JP", "Fernandez-Castaneda", "16"),
        seedPlayer("p_heckler", "Thomas", "Heckler", "17"),
        seedPlayer("p_butts", "Jaxon", "Butts", "22"),
        seedPlayer("p_steenweg", "Russell", "Steenweg III", "23"),
        seedPlayer("p_fittante", "Teddy", "Fittante", "25"),
        seedPlayer("p_luke", "Luke", "", "27"),
        seedPlayer("p_kowaliwskyj", "Grayson", "Kowaliwskyj", "29"),
        seedPlayer("p_lopes", "Jake", "Lopes", "32"),
        seedPlayer("p_carter", "Carter", "Glowacki", "33"),
        seedPlayer("p_donlan", "Jack", "Donlan", "33"),
        seedPlayer("p_doyle", "Gavin", "Doyle", "49"),
        seedPlayer("p_cruz", "Jose (Manny)", "Cruz", "81"),
        seedPlayer("p_keegan", "Keegan", "Glowacki", "99"),
        seedPlayer("p_lukas", "Lukas", "", ""),
        seedPlayer("p_bradly", "Bradly", "", ""),
        seedPlayer("p_bill", "Bill", "", ""),
        seedPlayer("p_brunner", "James", "Brunner", ""),
      ],
    },
    { id: "brick56", name: "Brick 5/6", players: [] },
  ];
}

export function defaultData() {
  return {
    version: 1,
    activeTeamId: "team91",
    activeGameByTeam: {},
    lastView: "games",
    theme: null,
    installDismissed: false,
    boxGameId: null,
    teams: seedTeams(),
    games: [],
  };
}

function normalizePlayer(player) {
  if (!player || typeof player !== "object") return null;
  const id = clip(player.id, 80);
  if (!id) return null;
  const position = POSITION_SET.has(player.position) ? player.position : "";
  const rawNumber = String(player.number ?? "").trim();
  const number = /^\d{1,3}$/.test(rawNumber) ? normNumber(rawNumber) : "";
  return {
    id,
    firstName: clip(player.firstName, 40),
    lastName: clip(player.lastName, 40),
    number,
    position,
  };
}

function normalizeEvent(event) {
  if (!event || typeof event !== "object") return null;
  const type = EVENT_SET.has(event.type) ? event.type : "";
  const id = clip(event.id, 80);
  if (!type || !id) return null;
  const quarter = QUARTERS.includes(event.quarter) ? event.quarter : "Q1";
  const minutes = type === "pim" ? sanitizeMinutes(event.minutes) : null;
  if (type === "pim" && minutes == null) return null;
  const playerId = type === "opp_goal" ? null : clip(event.playerId, 80) || null;
  if (type !== "opp_goal" && !playerId) return null;
  return {
    id,
    type,
    playerId,
    playerName: type === "opp_goal" ? "" : clip(event.playerName, 80),
    playerNumber: type === "opp_goal" ? "" : normNumber(event.playerNumber),
    quarter,
    minutes,
    goalEventId: type === "assist" ? clip(event.goalEventId, 80) || null : null,
    ts: Number.isFinite(Number(event.ts)) ? Number(event.ts) : Date.now(),
  };
}

function normalizeTeam(team) {
  if (!team || typeof team !== "object") return null;
  const id = clip(team.id, 80);
  const name = clip(team.name, 60);
  if (!id || !name) return null;
  const players = (Array.isArray(team.players) ? team.players : []).map(normalizePlayer).filter(Boolean).slice(0, 80);
  return { id, name, players };
}

function normalizeGame(game, teamIds) {
  if (!game || typeof game !== "object") return null;
  const id = clip(game.id, 80);
  const teamId = clip(game.teamId, 80);
  if (!id || !teamIds.has(teamId)) return null;
  const opponent = clip(game.opponent, 60) || "Opponent";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(game.date || "") ? game.date : todayISO();
  const homeAway = game.homeAway === "away" ? "away" : "home";
  const quarter = QUARTERS.includes(game.quarter) ? game.quarter : "Q1";
  const events = (Array.isArray(game.events) ? game.events : []).map(normalizeEvent).filter(Boolean).slice(0, 5000);
  return {
    id,
    teamId,
    opponent,
    date,
    homeAway,
    location: clip(game.location, 80),
    quarter,
    createdAt: Number.isFinite(Number(game.createdAt)) ? Number(game.createdAt) : Date.now(),
    events,
  };
}

export function normalizeData(input) {
  if (!input || typeof input !== "object") return null;
  const source = input.app === "lacrosse-stats" && input.data && typeof input.data === "object" ? input.data : input;
  if (!Array.isArray(source.teams) || !Array.isArray(source.games)) return null;
  const teams = source.teams.map(normalizeTeam).filter(Boolean).slice(0, 12);
  if (!teams.length) return null;
  const teamIds = new Set(teams.map((team) => team.id));
  const games = source.games.map((game) => normalizeGame(game, teamIds)).filter(Boolean).slice(0, 500);
  const activeTeamId = teamIds.has(source.activeTeamId) ? source.activeTeamId : teams[0].id;
  const activeGameByTeam = {};
  const storedActive = source.activeGameByTeam && typeof source.activeGameByTeam === "object" ? source.activeGameByTeam : {};
  for (const team of teams) {
    const gameId = storedActive[team.id];
    if (typeof gameId === "string" && games.some((game) => game.id === gameId && game.teamId === team.id)) {
      activeGameByTeam[team.id] = gameId;
    }
  }
  const boxGameId = games.some((game) => game.id === source.boxGameId) ? source.boxGameId : null;
  return {
    version: 1,
    activeTeamId,
    activeGameByTeam,
    lastView: VIEWS.has(source.lastView) ? source.lastView : "games",
    theme: source.theme === "light" || source.theme === "dark" ? source.theme : null,
    installDismissed: Boolean(source.installDismissed),
    boxGameId,
    teams,
    games,
  };
}

export function loadData(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return { ok: true, fresh: true, data: defaultData() };
  try {
    const data = normalizeData(JSON.parse(raw));
    if (!data) return { ok: false, raw, error: "Saved data could not be read." };
    return { ok: true, fresh: false, data };
  } catch {
    return { ok: false, raw, error: "Saved data could not be read." };
  }
}

export function saveData(storage, data) {
  storage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function exportPayload(data, now = new Date()) {
  return {
    app: "lacrosse-stats",
    version: 1,
    exportedAt: now.toISOString(),
    data,
  };
}

export function parseBackup(text) {
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return { error: "That file isn't valid JSON." };
  }
  const data = normalizeData(json);
  if (!data) return { error: "That file isn't a lacrosse stats backup." };
  const exportedAt = json && json.app === "lacrosse-stats" && typeof json.exportedAt === "string" ? json.exportedAt : "";
  return { data, exportedAt };
}

function csvCell(value) {
  const raw = String(value ?? "");
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  if (/[",\n\r]/.test(safe)) return `"${safe.replaceAll('"', '""')}"`;
  return safe;
}

function csvLine(cells) {
  return cells.map(csvCell).join(",");
}

function statCells(line, mode, gp) {
  return TABLE_COLUMNS.map((column) => {
    if (RATE_KEYS.has(column.key)) {
      const ratio = line[column.key];
      return ratio == null ? "" : String(Math.round(ratio * 1000) / 10);
    }
    const value = Number(line[column.key]) || 0;
    if (mode === "avg") {
      if (!gp) return "";
      return formatAvg(value / gp);
    }
    return formatCount(value);
  });
}

export function gameCsv(team, game, box) {
  const rows = [
    csvLine(["Team", team.name]),
    csvLine(["Opponent", game.opponent]),
    csvLine(["Date", game.date]),
    csvLine(["Home/Away", game.homeAway === "away" ? "Away" : "Home"]),
    csvLine(["Location", game.location || ""]),
    csvLine(["Us", box.score.total.us]),
    csvLine(["Them", box.score.total.them]),
    "",
    csvLine(["Number", "Player", "Position", ...TABLE_COLUMNS.map((column) => column.label)]),
  ];
  for (const player of box.players) {
    rows.push(csvLine([
      player.number,
      player.removed ? `${player.name} (removed)` : player.name,
      positionLabel(player.position),
      ...statCells(player, "totals", 1),
    ]));
  }
  rows.push(csvLine(["", "Totals", "", ...statCells(box.totals, "totals", 1)]));
  return `\uFEFF${rows.join("\r\n")}\r\n`;
}

export function seasonCsv(team, season) {
  const header = ["Number", "Player", "Position", "GP", ...TABLE_COLUMNS.map((column) => column.label)];
  const record = `${season.record.w}-${season.record.l}-${season.record.t}`;
  const rows = [
    csvLine(["Team", team.name]),
    csvLine(["Games played", season.gamesPlayed]),
    csvLine(["Record", record]),
    csvLine(["Goals for", season.goalsFor]),
    csvLine(["Goals against", season.goalsAgainst]),
    "",
    "Totals",
    csvLine(header),
  ];
  for (const player of season.players) {
    rows.push(csvLine([
      player.number,
      player.removed ? `${player.name} (removed)` : player.name,
      positionLabel(player.position),
      player.gp,
      ...statCells(player, "totals", player.gp),
    ]));
  }
  rows.push(csvLine(["", "Totals", "", season.gamesPlayed, ...statCells(season.totals, "totals", season.gamesPlayed)]));
  rows.push("");
  rows.push("Per game averages");
  rows.push("Percentages stay as season rates (not averaged game by game).");
  rows.push(csvLine(header));
  for (const player of season.players) {
    rows.push(csvLine([
      player.number,
      player.name,
      positionLabel(player.position),
      player.gp,
      ...statCells(player, "avg", player.gp),
    ]));
  }
  rows.push(csvLine(["", "Totals", "", season.gamesPlayed, ...statCells(season.totals, "avg", season.gamesPlayed)]));
  return `\uFEFF${rows.join("\r\n")}\r\n`;
}

export function slug(value) {
  return String(value || "team").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "team";
}

export function currentTeam(data) {
  return data.teams.find((team) => team.id === data.activeTeamId) || data.teams[0];
}

export function currentGame(data) {
  const team = currentTeam(data);
  const gameId = data.activeGameByTeam?.[team.id];
  if (!gameId) return null;
  const game = data.games.find((item) => item.id === gameId && item.teamId === team.id);
  return game || null;
}
