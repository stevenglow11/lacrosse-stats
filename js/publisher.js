// Turns private scorekeeping into the public results.json document, then
// hands it to the active publisher. The file publisher is the default.
// A non-empty RESULTS_CONFIG.submitUrl selects the endpoint publisher.

import { activeSubmitUrl } from "./results-config.js";
import {
  TABLE_COLUMNS,
  boxScore,
  formatStat,
  formatDate,
  leaderboard,
  seasonForTeam,
  COUNTING_KEYS,
} from "./logic.js";

const PRIVATE_KEYS = new Set([
  "events",
  "playerId",
  "goalEventId",
  "playerName",
  "playerNumber",
  "createdAt",
  "ts",
  "token",
  "secret",
  "authorization",
  "password",
]);

function endpointUrl() {
  return activeSubmitUrl();
}

function statMap(line) {
  const stats = {};
  for (const column of TABLE_COLUMNS) stats[column.key] = formatStat(column.key, line, "totals", 1);
  return stats;
}

function hasCountingStat(line) {
  return COUNTING_KEYS.some((key) => Number(line[key]) > 0);
}

function resultLetter(us, them) {
  if (us > them) return "W";
  if (us < them) return "L";
  return "T";
}

export function publishingMode() {
  return endpointUrl() ? "endpoint" : "file";
}

export function toPublicGame(game, team) {
  const box = boxScore(game, team);
  const players = box.players.filter(hasCountingStat).map((player) => ({
    name: player.name,
    number: player.number || "",
    stats: statMap(player),
  }));
  return {
    id: game.id,
    date: game.date,
    dateLabel: formatDate(game.date),
    opponent: game.opponent,
    homeAway: game.homeAway === "away" ? "away" : "home",
    location: game.location || "",
    result: resultLetter(box.score.total.us, box.score.total.them),
    us: box.score.total.us,
    them: box.score.total.them,
    quarters: box.score.quarters.map((label) => ({
      label,
      us: box.score.byQ[label].us,
      them: box.score.byQ[label].them,
    })),
    players,
    totals: statMap(box.totals),
  };
}

export function submissionForGame(data, game, hidden) {
  const team = (data?.teams || []).find((item) => item.id === game.teamId);
  if (!team) throw new Error("That team is missing.");
  const publicGame = toPublicGame(game, team);
  assertPublic(publicGame);
  return {
    teamId: team.id,
    teamName: team.name,
    hidden: hidden === true,
    game: publicGame,
  };
}

export function buildPublicResults(data, now = new Date()) {
  const teams = (data?.teams || []).map((team) => {
    const games = (data.games || [])
      .filter((game) => game.teamId === team.id && game.final === true && Array.isArray(game.events) && game.events.length > 0)
      .slice()
      .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || 0) - (a.createdAt || 0));
    const season = seasonForTeam({ games }, team);
    const publicGames = games.map((game) => toPublicGame(game, team));
    return {
      id: team.id,
      name: team.name,
      record: season.record,
      recordLabel: `${season.record.w}-${season.record.l}-${season.record.t}`,
      goalsFor: season.goalsFor,
      goalsAgainst: season.goalsAgainst,
      games: publicGames,
      leaders: leaderboard(season.players).map((board) => ({
        label: board.label,
        rows: board.rows.map((row) => ({
          rank: row.rank,
          name: row.name,
          number: row.number || "",
          value: row.value,
        })),
      })),
    };
  });
  return {
    version: 1,
    updatedAt: now.toISOString(),
    teams,
  };
}

function assertPublic(payload) {
  const walk = (value) => {
    if (!value || typeof value !== "object") return;
    for (const key of Object.keys(value)) {
      if (PRIVATE_KEYS.has(key)) throw new Error("Public results included private data.");
      walk(value[key]);
    }
  };
  walk(payload);
}

function downloadFile(filename, text) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function publishFile(payload, deps) {
  const text = `${JSON.stringify(payload, null, 2)}\n`;
  const download = deps.downloadImpl || downloadFile;
  download("results.json", text);
  return { mode: "file", payload };
}

export async function postToResults(body, deps = {}) {
  const url = endpointUrl();
  if (!url) {
    const missing = new Error("No results address is set.");
    missing.code = "no-url";
    throw missing;
  }
  if (deps.online === false) {
    const offline = new Error("offline");
    offline.code = "offline";
    throw offline;
  }
  const doFetch = deps.fetchImpl || fetch;
  let response;
  try {
    response = await doFetch(url, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
    });
  } catch {
    const offline = new Error("offline");
    offline.code = "offline";
    throw offline;
  }
  let parsed = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }
  if (!response?.ok || !parsed || parsed.ok !== true) {
    const message = parsed?.error || "The results page did not accept this update.";
    const error = new Error(message);
    error.code = /not set up/i.test(message) ? "setup" : (/passcode/i.test(message) ? "passcode" : "rejected");
    throw error;
  }
  return { mode: "endpoint", payload: parsed };
}

async function publishEndpoint(payload, deps) {
  const passcode = String(deps.passcode || "");
  if (!passcode) {
    const error = new Error("Enter the results passcode.");
    error.code = "need-passcode";
    throw error;
  }
  const hiddenIds = (deps.hiddenIds || []).filter(Boolean);
  return postToResults({ ...payload, passcode, hiddenIds }, deps);
}

const publishers = {
  file: publishFile,
  endpoint: publishEndpoint,
};

export async function publishResults(data, deps = {}) {
  const payload = buildPublicResults(data, deps.now || new Date());
  assertPublic(payload);
  const mode = publishingMode();
  return publishers[mode](payload, deps);
}
