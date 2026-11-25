import {
  PIM_PRESETS,
  POSITIONS,
  QUARTERS,
  STAT_BUTTONS,
  STORAGE_KEY,
  TABLE_COLUMNS,
  addEvent,
  addPlayer,
  boxScore,
  chipLabel,
  createGame,
  currentGame,
  currentTeam,
  deleteEvent,
  deleteGame,
  duplicateGroups,
  eventLabel,
  eventWho,
  exportPayload,
  formatCount,
  formatDate,
  formatPct,
  formatStat,
  formatTime,
  gameCsv,
  gamesForTeam,
  leaderboard,
  loadData,
  normNumber,
  parseBackup,
  playerAria,
  playerGameLog,
  playerName,
  positionLabel,
  removePlayer,
  sanitizeMinutes,
  saveData,
  scoreGame,
  seasonCsv,
  seasonForTeam,
  slug,
  sortPlayers,
  todayISO,
  undoLast,
  updateEvent,
  updateGameMeta,
  updatePlayer,
  versus,
  esc,
} from "./logic.js";
import { publishResults, publishingMode } from "./publisher.js";

const app = document.querySelector("#app");

let data = null;
let ui = freshUi();
let pendingConfirm = null;
let focusSheet = false;
let flashSide = "";
let toastTimer = 0;

function freshUi() {
  return {
    view: "games",
    sheet: null,
    statsTab: "season",
    avgMode: "totals",
    logPlayerId: "",
    selectedPlayerId: null,
    pendingStat: null,
    toast: "",
    draft: null,
    edit: null,
    confirmBack: null,
    fatal: "",
  };
}

function boot() {
  const loaded = loadData(localStorage);
  if (!loaded.ok) {
    data = null;
    ui = freshUi();
    ui.fatal = loaded.error || "Saved data could not be read.";
    render();
    return;
  }
  data = loaded.data;
  ui = freshUi();
  if (data.lastView === "box" && data.boxGameId) ui.view = "box";
  else if (["games", "live", "stats", "roster"].includes(data.lastView)) ui.view = data.lastView;
  applyTheme();
  render();
  registerSw();
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
    if (data && !data.theme) applyTheme();
  });
}

function applyTheme() {
  const dark = data?.theme === "dark" || (!data?.theme && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#0c1410" : "#e7f0e4");
}

function persist() {
  if (!data) return;
  data.lastView = ui.view;
  saveData(localStorage, data);
}

function toast(message) {
  ui.toast = message;
  render();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    if (ui.toast === message) {
      ui.toast = "";
      render();
    }
  }, 2600);
}

function registerSw() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function findGame(id) {
  return data.games.find((game) => game.id === id) || null;
}

function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function syncDraftFromDom() {
  const form = document.querySelector("form[data-draft-form]");
  if (!form || !ui.draft) return;
  for (const [key, value] of new FormData(form).entries()) ui.draft[key] = String(value);
}

function syncEditFields() {
  if (!ui.edit) return;
  const playerSelect = document.querySelector("#edit-player");
  if (playerSelect) ui.edit.playerId = playerSelect.value;
  const custom = document.querySelector("#edit-minutes");
  if (custom && custom.value.trim() !== "") ui.edit.minutes = custom.value.trim();
}

function duplicateOthers(team, selfId, number) {
  const value = normNumber(number);
  if (!value) return [];
  return team.players.filter((player) => player.id !== selfId && normNumber(player.number) === value);
}

function updateNumberWarning() {
  const input = document.querySelector("#player-number");
  const note = document.querySelector("#number-warning");
  if (!input || !note || !data) return;
  const others = duplicateOthers(currentTeam(data), ui.draft?.playerId || "", input.value);
  if (!others.length) {
    note.hidden = true;
    note.textContent = "";
    return;
  }
  note.hidden = false;
  note.textContent = `Same number as ${others.map(playerName).join(" and ")}. You can still save.`;
}

function render() {
  const scroll = {
    main: app.querySelector(".main")?.scrollTop || 0,
    players: app.querySelector(".player-grid")?.scrollTop || 0,
  };
  if (!data) {
    app.className = "app";
    app.innerHTML = renderFatal();
    document.body.classList.remove("sheet-open");
    return;
  }
  applyTheme();
  const view = ui.view === "live" ? renderLive()
    : ui.view === "roster" ? renderRoster()
    : ui.view === "stats" ? renderStats()
    : ui.view === "box" ? renderBox()
    : renderGames();
  app.className = `app${ui.view === "live" ? " is-live" : ""}`;
  app.innerHTML = renderShell(view);
  const main = app.querySelector(".main");
  if (main) main.scrollTop = scroll.main;
  const players = app.querySelector(".player-grid");
  if (players) players.scrollTop = scroll.players;
  document.body.classList.toggle("sheet-open", Boolean(ui.sheet));
  if (focusSheet) {
    focusSheet = false;
    app.querySelector(".sheet")?.focus();
  }
  if (flashSide) {
    app.querySelector(".scoreboard")?.classList.add(flashSide === "them" ? "flash-them" : "flash-us");
    flashSide = "";
  }
  if (ui.sheet?.type === "player") updateNumberWarning();
  app.querySelector(".player.is-on")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  const team = currentTeam(data);
  const labels = { games: "Games", live: "Live", stats: "Stats", roster: "Roster", box: "Box score" };
  document.title = `${labels[ui.view] || "Lacrosse"} · ${team.name}`;
}

function renderFatal() {
  return `<section class="view">
    <h1>Stats couldn't be read</h1>
    <p>${esc(ui.fatal)}</p>
    <p>You can start fresh. The unreadable save is kept on this phone as a spare copy.</p>
    <button type="button" class="primary" data-action="reset-save">Start fresh</button>
  </section>`;
}

function renderShell(body) {
  const team = currentTeam(data);
  const dark = document.documentElement.dataset.theme === "dark";
  const modal = ui.sheet ? " inert aria-hidden=\"true\"" : "";
  return `
    <header class="topbar"${modal}>
      <div class="teams" role="group" aria-label="Team">
        ${data.teams.map((item) => `<button type="button" class="team${item.id === team.id ? " is-on" : ""}" data-action="team" data-id="${esc(item.id)}" aria-pressed="${item.id === team.id ? "true" : "false"}">${esc(item.name)}</button>`).join("")}
      </div>
      <button type="button" class="icon-btn" data-action="theme" aria-label="${dark ? "Switch to light mode" : "Switch to dark mode"}">${dark ? sunSvg() : moonSvg()}</button>
    </header>
    <main class="main"${modal}>${body}</main>
    <nav class="nav" aria-label="Sections"${modal}>
      ${navButton("games", "Games", iconGames())}
      ${navButton("live", "Live", iconLive())}
      ${navButton("stats", "Stats", iconStats())}
      ${navButton("roster", "Roster", iconRoster())}
    </nav>
    ${renderSheet()}
    ${ui.toast ? `<div class="toast" role="status">${esc(ui.toast)}</div>` : ""}
  `;
}

function navButton(view, label, icon) {
  const on = ui.view === view;
  return `<button type="button" data-action="nav" data-view="${view}" ${on ? 'aria-current="page"' : ""}>
    ${icon}<span>${label}</span>
  </button>`;
}

function renderInstallBanner() {
  if (data.installDismissed || isStandalone()) return "";
  return `<aside class="banner">
    <p><strong>Take it to the field.</strong> In Safari, tap Share, then Add to Home Screen. Open the icon once while you have service, and it keeps working if the signal drops.</p>
    <button type="button" data-action="dismiss-install">Got it</button>
  </aside>`;
}

function renderDataPanel() {
  const endpoint = publishingMode() === "endpoint";
  return `<section class="panel">
    <h2>Public results</h2>
    <p>${endpoint
      ? "Submit a finished game and it is sent to the public results page."
      : "Submit a finished game to download results.json. Upload that file on GitHub and the public page updates. Steps are in the README."}</p>
    <div class="stack">
      <button type="button" class="primary" data-action="publish-results">Publish results</button>
      <a class="secondary block" href="results.html">View public results</a>
    </div>
  </section>
  <section class="panel">
    <h2>Save a copy</h2>
    <p>Stats stay on this phone until you publish. Download a backup before clearing browser data, or to move games onto another phone. CSV files open in Excel or Sheets.</p>
    <div class="stack">
      <button type="button" class="primary" data-action="export-json">Download backup</button>
      <button type="button" class="secondary" data-action="import-json">Restore backup</button>
      <button type="button" class="secondary" data-action="export-season">Export season CSV</button>
    </div>
  </section>`;
}

function renderGames() {
  const team = currentTeam(data);
  const games = gamesForTeam(data, team.id);
  const activeId = data.activeGameByTeam?.[team.id];
  const cards = games.length ? games.map((game) => {
    const score = scoreGame(game.events, game.quarter);
    const started = game.events.length > 0;
    return `<article class="card">
      <div class="card-top">
        <div>
          <p class="card-date">${esc(formatDate(game.date))} · ${game.homeAway === "away" ? "Away" : "Home"}${activeId === game.id ? " · Current" : ""}</p>
          <h2>${esc(versus(game))}</h2>
          ${game.location ? `<p class="card-loc">${esc(game.location)}</p>` : ""}
        </div>
        <p class="card-score"><span>${started ? score.total.us : "–"}</span><span class="dash">–</span><span>${started ? score.total.them : "–"}</span></p>
      </div>
      <div class="card-actions">
        <button type="button" class="primary" data-action="go-live" data-id="${esc(game.id)}" aria-label="Track this game live">Live</button>
        <button type="button" class="secondary" data-action="open-box" data-id="${esc(game.id)}">Box score</button>
        <button type="button" class="secondary" data-action="edit-game" data-id="${esc(game.id)}" aria-label="Edit ${esc(versus(game))}">Edit</button>
        <button type="button" class="secondary" data-action="delete-game" data-id="${esc(game.id)}" aria-label="Delete ${esc(versus(game))}">Delete</button>
        <button type="button" class="primary wide" data-action="submit-game" data-id="${esc(game.id)}">Submit results</button>
        <button type="button" class="secondary wide" data-action="toggle-final" data-id="${esc(game.id)}" aria-pressed="${game.final ? "true" : "false"}">${game.final ? "On the public page" : "Hidden from public page"}</button>
      </div>
    </article>`;
  }).join("") : `<p class="empty-copy">No games yet. Start one when you get to the field.</p>`;
  return `<section class="view">
    <h1>Games</h1>
    <p class="lede">${esc(team.name)}</p>
    ${renderInstallBanner()}
    <button type="button" class="primary block" data-action="new-game">New game</button>
    ${cards}
    ${renderDataPanel()}
  </section>`;
}

function renderLive() {
  const team = currentTeam(data);
  const game = currentGame(data);
  if (!game) {
    const games = gamesForTeam(data, team.id);
    return `<section class="view">
      <h1>Live</h1>
      <p class="lede">Start a game, then track it here with one hand.</p>
      <button type="button" class="primary block" data-action="new-game">New game</button>
      <div class="stack">
        ${games.map((item) => `<button type="button" class="secondary" data-action="go-live" data-id="${esc(item.id)}">${esc(versus(item))} · ${esc(formatDate(item.date))}</button>`).join("")}
      </div>
    </section>`;
  }
  const score = scoreGame(game.events, game.quarter);
  const players = sortPlayers(team.players);
  const selected = players.find((player) => player.id === ui.selectedPlayerId);
  const armed = STAT_BUTTONS.find((button) => button.type === ui.pendingStat);
  let status = "Tap a player, then a stat. A goal counts as a shot and a shot on goal.";
  if (selected) {
    const number = normNumber(selected.number);
    status = `Logging ${number ? `#${number} ` : ""}${playerName(selected)}`;
  } else if (armed) status = `${armed.aria} — now tap the player`;
  const newest = game.events.slice().reverse();
  return `<section class="live">
    <h1 class="sr-only">Live stats ${esc(versus(game))}</h1>
    <div class="scoreboard">
      <div class="score-side"><div class="score-num" data-testid="score-us">${score.total.us}</div><div class="score-label">Us</div></div>
      <div class="score-mid"><div class="score-q" data-testid="quarter-label">${esc(game.quarter)}</div><div class="score-vs">${esc(versus(game))}</div></div>
      <div class="score-side"><div class="score-num" data-testid="score-them">${score.total.them}</div><div class="score-label">Them</div></div>
    </div>
    <div class="qrow">
      <div class="quarters" role="group" aria-label="Quarter">
        ${QUARTERS.map((quarter) => `<button type="button" data-action="quarter" data-quarter="${quarter}" aria-label="${quarter === "OT" ? "Overtime" : `Quarter ${quarter.slice(1)}`}" aria-pressed="${game.quarter === quarter ? "true" : "false"}" class="${game.quarter === quarter ? "is-on" : ""}">${quarter}</button>`).join("")}
      </div>
      <button type="button" class="box-jump" data-action="open-box" data-id="${esc(game.id)}" aria-label="Box score">Box</button>
      <button type="button" class="undo" data-action="undo" aria-label="Undo last event"${game.events.length ? "" : " disabled"}>Undo</button>
    </div>
    <div class="status" data-testid="status-line">
      <p>${esc(status)}</p>
      ${selected || armed ? `<button type="button" data-action="clear-selection" aria-label="Clear selection">Clear</button>` : ""}
    </div>
    ${players.length ? "" : `<p class="empty-copy pad">No players on this roster yet. Opponent goals still count. Add players on the Roster tab.</p>`}
    <div class="player-grid" data-testid="player-grid">
      ${players.map((player) => {
        const on = player.id === ui.selectedPlayerId;
        const number = normNumber(player.number);
        return `<button type="button" class="player${on ? " is-on" : ""}" data-action="pick-player" data-id="${esc(player.id)}" aria-label="${esc(playerAria(player))}" aria-pressed="${on ? "true" : "false"}">
          <span class="num">${number ? esc(number) : "—"}</span>
          <span class="nm">${esc(chipLabel(player, players))}</span>
        </button>`;
      }).join("")}
    </div>
    <div class="stat-pad">
      ${STAT_BUTTONS.map((button) => {
        const armedOn = ui.pendingStat === button.type;
        const disabled = !players.length && button.type !== "opp_goal";
        return `<button type="button" class="stat ${button.className}${armedOn ? " is-armed" : ""}" data-action="stat" data-stat="${button.type}" aria-label="${esc(button.aria)}" aria-pressed="${armedOn ? "true" : "false"}"${disabled ? " disabled" : ""}>
          <span class="stat-name">${esc(button.name)}</span>
          <span class="stat-sub">${esc(button.sub)}</span>
        </button>`;
      }).join("")}
    </div>
    <section class="feed" data-testid="feed" aria-label="Recent events">
      <div class="feed-head">
        <h2>Recent</h2>
        ${newest.length > 2 ? `<button type="button" data-action="show-events">All ${newest.length}</button>` : ""}
      </div>
      ${newest.length ? `<ul class="feed-list">${newest.slice(0, 2).map((event) => renderEvent(event, team)).join("")}</ul>` : `<p class="feed-empty">Stats you tap show up here.</p>`}
    </section>
    <div class="publish-bar">
      <button type="button" class="primary block" data-action="submit-game" data-id="${esc(game.id)}">Submit results</button>
      <p class="fine">${game.final ? "This game is marked final. " : ""}${publishingMode() === "endpoint" ? "Submit sends it to the public page." : "Submit downloads results.json for the public page."}</p>
    </div>
    <div class="nav-spacer"></div>
  </section>`;
}

function renderEvent(event, team) {
  const label = eventLabel(event);
  const who = eventWho(event, team);
  const time = formatTime(event.ts);
  return `<li class="event">
    <div class="event-main">
      <span class="event-k">${esc(event.quarter)} · ${esc(label)}</span>
      <span class="event-who">${esc(who)}${time ? ` · ${esc(time)}` : ""}</span>
    </div>
    <div class="event-actions">
      <button type="button" data-action="edit-event" data-id="${esc(event.id)}" aria-label="Edit ${esc(label)} by ${esc(who)}">Edit</button>
      <button type="button" data-action="delete-event" data-id="${esc(event.id)}" aria-label="Delete ${esc(label)} by ${esc(who)}">Delete</button>
    </div>
  </li>`;
}

function renderRoster() {
  const team = currentTeam(data);
  const players = sortPlayers(team.players);
  const dups = duplicateGroups(players);
  const list = players.length ? `<ul class="roster">${players.map((player) => {
    const number = normNumber(player.number);
    const shared = number && dups.some((group) => group.number === number);
    return `<li class="roster-row" data-testid="roster-player" data-name="${esc(playerName(player))}">
      <div class="jersey">${number ? esc(number) : "—"}</div>
      <div>
        <p class="pname">${esc(playerName(player))}</p>
        <p class="pmeta">${esc(positionLabel(player.position) || "No position")}</p>
        ${shared ? `<p class="warn-inline">Same number as another player</p>` : ""}
      </div>
      <div class="roster-actions">
        <button type="button" data-action="edit-player" data-id="${esc(player.id)}" aria-label="Edit ${esc(playerName(player))}">Edit</button>
        <button type="button" data-action="remove-player" data-id="${esc(player.id)}" aria-label="Remove ${esc(playerName(player))}">Remove</button>
      </div>
    </li>`;
  }).join("")}</ul>` : `<p class="empty-copy">No players yet. Add your roster before the game. Nothing is filled in for you.</p>`;
  const banner = dups.map((group) => `<p>#${esc(group.number)} is shared by ${esc(group.names.join(" and "))}.</p>`).join("");
  return `<section class="view">
    <h1>Roster</h1>
    <p class="lede">${esc(team.name)} · ${players.length} ${players.length === 1 ? "player" : "players"}</p>
    <button type="button" class="primary block" data-action="add-player">Add player</button>
    ${dups.length ? `<div class="warn-banner" data-testid="dup-banner">${banner}<p>That's allowed. Change a number if it was a typo.</p></div>` : ""}
    ${list}
  </section>`;
}

function renderStats() {
  const team = currentTeam(data);
  const season = seasonForTeam(data, team);
  const tabs = [["season", "Season"], ["leaders", "Leaders"], ["player", "Players"]];
  return `<section class="view">
    <h1>Stats</h1>
    <p class="lede">${esc(team.name)}</p>
    <div class="segment" role="group" aria-label="Stat views">
      ${tabs.map(([id, label]) => `<button type="button" data-action="stats-tab" data-tab="${id}" aria-pressed="${ui.statsTab === id ? "true" : "false"}">${label}</button>`).join("")}
    </div>
    ${ui.statsTab === "leaders" ? renderLeaders(season.players) : ""}
    ${ui.statsTab === "player" ? renderPlayerTab(team, season) : ""}
    ${ui.statsTab === "season" ? renderSeason(season) : ""}
    ${renderDataPanel()}
  </section>`;
}

function countPhrase(value, singular, plural) {
  const n = Number(value) || 0;
  return `${formatCount(n)} ${n === 1 ? singular : plural}`;
}

function metric(id, value, label) {
  return `<div class="metric" data-testid="${id}"><b>${esc(value)}</b><span>${esc(label)}</span></div>`;
}

function renderSeason(season) {
  const { record } = season;
  return `
    <div class="metrics" data-testid="team-metrics">
      ${metric("metric-record", `${record.w}-${record.l}-${record.t}`, "Record")}
      ${metric("metric-gf", String(season.goalsFor), "Goals for")}
      ${metric("metric-ga", String(season.goalsAgainst), "Goals against")}
      ${metric("metric-gp", String(season.gamesPlayed), "Games")}
      ${metric("metric-sh", formatPct(season.totals.shPct), "SH%")}
      ${metric("metric-fo", formatPct(season.totals.foPct), "FO%")}
      ${metric("metric-sv", formatPct(season.totals.svPct), "SV%")}
      ${metric("metric-pim", formatCount(season.totals.pim), "PIM")}
    </div>
    <div class="segment slim" role="group" aria-label="Totals or averages">
      <button type="button" data-action="avg-mode" data-mode="totals" aria-pressed="${ui.avgMode !== "avg" ? "true" : "false"}">Totals</button>
      <button type="button" data-action="avg-mode" data-mode="avg" aria-pressed="${ui.avgMode === "avg" ? "true" : "false"}">Per game</button>
    </div>
    ${season.gamesPlayed ? renderStatTable(season.players, season.totals, { mode: ui.avgMode, teamGames: season.gamesPlayed, showGp: true, testid: "season-table" }) : `<p class="empty-copy">No games logged yet.</p>`}
    <p class="legend">Swipe the table sideways for every stat. SH% is goals ÷ shots. A goal counts as a shot and a shot on goal. FO% is faceoff wins ÷ faceoffs. SV% is saves ÷ (saves + goals against). Per game divides a player's counting stats by the games they appeared in, and the team row by games played. Percentages stay season rates.</p>
  `;
}

function renderLeaders(players) {
  const boards = leaderboard(players);
  if (!boards.length) return `<p class="empty-copy">No stats yet. Track a game and the leaders show up here.</p>`;
  return boards.map((board) => `<section class="panel">
    <h2>${esc(board.label)}</h2>
    <ol class="leaders">
      ${board.rows.map((row) => `<li><span class="rank">${row.rank}</span><span>${row.number ? `<b>#${esc(row.number)}</b> ` : ""}${esc(row.name)}</span><span class="val">${esc(row.value)}</span></li>`).join("")}
    </ol>
  </section>`).join("");
}

function renderPlayerTab(team, season) {
  const players = sortPlayers(team.players);
  if (!players.length) return `<p class="empty-copy">Add players on the Roster tab first.</p>`;
  const selected = players.some((player) => player.id === ui.logPlayerId) ? ui.logPlayerId : players[0].id;
  const seasonRow = season.players.find((player) => player.playerId === selected);
  const summary = seasonRow && seasonRow.gp
    ? `${countPhrase(seasonRow.g, "goal", "goals")}, ${countPhrase(seasonRow.a, "assist", "assists")}, ${countPhrase(seasonRow.pts, "point", "points")} in ${countPhrase(seasonRow.gp, "game", "games")}.`
    : "No stats for this player yet.";
  const log = playerGameLog(data, team, selected).filter((game) => game.played);
  const rows = log.map((game) => `<tr>
    <th class="name-col" scope="row"><button type="button" data-action="open-box" data-id="${esc(game.gameId)}">${esc(formatDate(game.date))}<br>${esc(versus(game))}</button></th>
    <td>${game.score.total.us}–${game.score.total.them}</td>
    ${TABLE_COLUMNS.map((column) => `<td data-stat="${column.key}">${esc(formatStat(column.key, game, "totals", 1))}</td>`).join("")}
  </tr>`).join("");
  return `
    <label class="field"><span>Player</span>
      <select id="log-player">
        ${players.map((player) => `<option value="${esc(player.id)}"${player.id === selected ? " selected" : ""}>${esc(playerAria(player))}</option>`).join("")}
      </select>
    </label>
    <p class="lede">${esc(summary)}</p>
    ${log.length ? `<p class="swipe-hint">Swipe sideways for every column.</p><div class="table-wrap" data-testid="player-log"><table>
      <thead><tr><th class="name-col">Game</th><th>Score</th>${TABLE_COLUMNS.map((column) => `<th title="${esc(column.title)}">${esc(column.label)}</th>`).join("")}</tr></thead>
      <tbody>${rows}</tbody>
    </table></div>` : `<p class="empty-copy">No game log yet.</p>`}
  `;
}

function renderBox() {
  const team = currentTeam(data);
  const game = data.games.find((item) => item.id === data.boxGameId && item.teamId === team.id);
  if (!game) {
    return `<section class="view"><h1>Box score</h1><p class="empty-copy">Pick a game first.</p><button type="button" class="primary" data-action="nav" data-view="games">Go to games</button></section>`;
  }
  const box = boxScore(game, team);
  return `<section class="view">
    <button type="button" class="back" data-action="back-box">Back</button>
    <h1>${esc(versus(game))}</h1>
    <p class="lede">${esc(formatDate(game.date))} · ${game.homeAway === "away" ? "Away" : "Home"}${game.location ? ` · ${esc(game.location)}` : ""}</p>
    ${renderQuarterTable(box.score)}
    <div class="metrics" data-testid="team-metrics">
      ${metric("metric-goals", String(box.totals.g), "Goals")}
      ${metric("metric-assists", String(box.totals.a), "Assists")}
      ${metric("metric-shots", String(box.totals.sh), "Shots")}
      ${metric("metric-sh", formatPct(box.totals.shPct), "SH%")}
      ${metric("metric-sog", String(box.totals.sog), "SOG")}
      ${metric("metric-gb", String(box.totals.gb), "GB")}
      ${metric("metric-fo", formatPct(box.totals.foPct), "FO%")}
      ${metric("metric-sv", formatPct(box.totals.svPct), "SV%")}
    </div>
    ${renderStatTable(box.players, box.totals, { mode: "totals", teamGames: 1, showGp: false, testid: "box-table" })}
    <button type="button" class="secondary block" data-action="export-game" data-id="${esc(game.id)}">Export this game</button>
    <p class="legend">A goal counts as a shot and a shot on goal. Opponent goals update the Them score. Goal against is only the goalie's stat.</p>
  </section>`;
}

function renderQuarterTable(score) {
  const head = score.quarters.map((quarter) => `<th>${quarter}</th>`).join("");
  const row = (label, side) => `<tr><th scope="row">${label}</th>${score.quarters.map((quarter) => `<td>${score.byQ[quarter][side]}</td>`).join("")}<td>${score.total[side]}</td></tr>`;
  return `<table class="qscore" data-testid="quarter-score"><thead><tr><th></th>${head}<th>Total</th></tr></thead><tbody>${row("Us", "us")}${row("Them", "them")}</tbody></table>`;
}

function renderStatTable(rows, totals, options) {
  const gpHead = options.showGp ? "<th>GP</th>" : "";
  const head = TABLE_COLUMNS.map((column) => `<th title="${esc(column.title)}">${esc(column.label)}</th>`).join("");
  const body = rows.map((row) => {
    const gpCell = options.showGp ? `<td data-stat="gp">${row.gp}</td>` : "";
    const cells = TABLE_COLUMNS.map((column) => `<td data-stat="${column.key}">${esc(formatStat(column.key, row, options.mode, options.showGp ? row.gp : 1))}</td>`).join("");
    const number = row.number ? `#${row.number} ` : "";
    const removed = row.removed ? " (removed)" : "";
    return `<tr data-player="${esc(row.name)}"><th class="name-col" scope="row">${esc(`${number}${row.name}${removed}`)}</th>${gpCell}${cells}</tr>`;
  }).join("");
  const totalGp = options.showGp ? `<td data-stat="gp">${options.teamGames}</td>` : "";
  const totalCells = TABLE_COLUMNS.map((column) => `<td data-stat="${column.key}">${esc(formatStat(column.key, totals, options.mode, options.showGp ? options.teamGames : 1))}</td>`).join("");
  return `<p class="swipe-hint">Swipe sideways for every column.</p><div class="table-wrap"><table data-testid="${options.testid}">
    <thead><tr><th class="name-col">Player</th>${gpHead}${head}</tr></thead>
    <tbody>${body}<tr data-testid="totals-row" data-player="Totals"><th class="name-col" scope="row">Team</th>${totalGp}${totalCells}</tr></tbody>
  </table></div>`;
}

function renderSheet() {
  const sheet = ui.sheet;
  if (!sheet) return "";
  let title = "";
  let body = "";
  if (sheet.type === "game") {
    title = ui.draft?.gameId ? "Edit game" : "New game";
    body = renderGameForm();
  } else if (sheet.type === "player") {
    title = ui.draft?.playerId ? "Edit player" : "Add player";
    body = renderPlayerForm();
  } else if (sheet.type === "assist") {
    const team = currentTeam(data);
    const scorer = team.players.find((player) => player.id === sheet.scorerId);
    title = scorer ? `Assist on ${playerName(scorer)}'s goal?` : "Who assisted?";
    const choices = sortPlayers(team.players).filter((player) => player.id !== sheet.scorerId);
    body = `<p class="fine">Skip this if you didn't see the pass. The goal is already saved.</p>
      <div class="assist-list">
        ${choices.map((player) => {
          const number = normNumber(player.number);
          return `<button type="button" data-action="assist-player" data-id="${esc(player.id)}" aria-label="${esc(playerAria(player))}"><b>${number ? `#${esc(number)}` : "—"}</b><span>${esc(playerName(player))}</span></button>`;
        }).join("")}
      </div>
      <button type="button" class="primary skip" data-action="skip-assist">Skip assist</button>`;
  } else if (sheet.type === "pim") {
    const team = currentTeam(data);
    const player = team.players.find((item) => item.id === sheet.playerId);
    title = player ? `Penalty for ${playerName(player)}` : "Penalty";
    body = `<div class="pim-grid">
        ${PIM_PRESETS.map((preset) => `<button type="button" data-action="pim-preset" data-minutes="${preset.minutes}" aria-label="${preset.label}">${preset.label}</button>`).join("")}
      </div>
      <div class="pim-custom">
        <label class="field"><span>Other minutes</span><input id="custom-minutes" inputmode="decimal" min="0.5" max="10" step="0.5" placeholder="1.5"></label>
        <button type="button" class="primary" data-action="pim-custom">Add</button>
      </div>
      <button type="button" class="secondary block" data-action="close-sheet">Cancel</button>`;
  } else if (sheet.type === "edit") {
    title = "Edit event";
    body = renderEditForm();
  } else if (sheet.type === "events") {
    const team = currentTeam(data);
    const game = currentGame(data);
    const events = game ? game.events.slice().reverse() : [];
    title = `All events (${events.length})`;
    body = `${events.length ? `<ul class="feed-list">${events.map((event) => renderEvent(event, team)).join("")}</ul>` : `<p class="empty-copy">No events yet.</p>`}
      <button type="button" class="secondary block" data-action="close-sheet">Close</button>`;
  } else if (sheet.type === "confirm") {
    title = sheet.title;
    body = `<p>${esc(sheet.body)}</p>
      <div class="sheet-actions">
        <button type="button" class="secondary" data-action="close-sheet">Cancel</button>
        <button type="button" class="${sheet.tone === "danger" ? "danger-btn" : "primary"}" data-action="confirm-yes">${esc(sheet.confirm)}</button>
      </div>`;
  }
  return `<div class="overlay">
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" tabindex="-1">
      <h2 id="sheet-title">${esc(title)}</h2>
      ${body}
    </div>
  </div>`;
}

function renderGameForm() {
  const draft = ui.draft;
  const home = draft.homeAway !== "away";
  return `<form data-draft-form="game" novalidate>
    <label class="field"><span>Opponent</span><input name="opponent" required maxlength="60" value="${esc(draft.opponent)}" autocomplete="off" enterkeyhint="next"></label>
    <label class="field"><span>Date</span><input name="date" type="date" required value="${esc(draft.date)}"></label>
    <fieldset class="ha">
      <legend>Home or away</legend>
      <button type="button" data-action="home-away" data-ha="home" aria-pressed="${home ? "true" : "false"}" class="${home ? "is-on" : ""}">Home</button>
      <button type="button" data-action="home-away" data-ha="away" aria-pressed="${home ? "false" : "true"}" class="${home ? "" : "is-on"}">Away</button>
    </fieldset>
    <input type="hidden" name="homeAway" value="${esc(draft.homeAway || "home")}">
    <label class="field"><span>Location <em>optional</em></span><input name="location" maxlength="80" value="${esc(draft.location || "")}" placeholder="Field or school"></label>
    <div class="sheet-actions">
      <button type="button" class="secondary" data-action="close-sheet">Cancel</button>
      <button type="submit" class="primary">${draft.gameId ? "Save game" : "Start game"}</button>
    </div>
  </form>`;
}

function renderPlayerForm() {
  const draft = ui.draft;
  const others = duplicateOthers(currentTeam(data), draft.playerId || "", draft.number);
  return `<form data-draft-form="player" novalidate>
    <label class="field"><span>First name</span><input name="firstName" maxlength="40" value="${esc(draft.firstName || "")}" autocomplete="given-name" autocapitalize="words"></label>
    <label class="field"><span>Last name</span><input name="lastName" maxlength="40" value="${esc(draft.lastName || "")}" autocomplete="family-name" autocapitalize="words"></label>
    <label class="field"><span>Jersey number <em>optional</em></span>
      <input id="player-number" name="number" inputmode="numeric" maxlength="3" value="${esc(draft.number || "")}" placeholder="Blank is ok">
    </label>
    <p id="number-warning" class="warn"${others.length ? "" : " hidden"}>${others.length ? esc(`Same number as ${others.map(playerName).join(" and ")}. You can still save.`) : ""}</p>
    <label class="field"><span>Position <em>optional</em></span>
      <select name="position">
        <option value=""${draft.position ? "" : " selected"}>No position</option>
        ${POSITIONS.map((position) => `<option value="${position.id}"${draft.position === position.id ? " selected" : ""}>${esc(position.label)}</option>`).join("")}
      </select>
    </label>
    <p class="fine">Duplicate numbers are allowed. Players without a number can still be picked in the game.</p>
    <div class="sheet-actions">
      <button type="button" class="secondary" data-action="close-sheet">Cancel</button>
      <button type="submit" class="primary">${draft.playerId ? "Save player" : "Add player"}</button>
    </div>
    ${draft.playerId ? `<button type="button" class="text-danger" data-action="remove-player" data-id="${esc(draft.playerId)}">Remove player</button>` : ""}
  </form>`;
}

function renderEditForm() {
  const edit = ui.edit;
  const team = currentTeam(data);
  const options = sortPlayers(team.players).map((player) => `<option value="${esc(player.id)}"${player.id === edit.playerId ? " selected" : ""}>${esc(playerAria(player))}</option>`).join("");
  return `<form data-edit-form novalidate>
    <div class="edit-stats" role="group" aria-label="Stat">
      ${STAT_BUTTONS.map((button) => `<button type="button" class="stat${edit.type === button.type ? " is-armed" : ""}" data-action="edit-type" data-stat="${button.type}" aria-label="${esc(button.aria)}" aria-pressed="${edit.type === button.type ? "true" : "false"}">
        <span class="stat-name">${esc(button.name)}</span><span class="stat-sub">${esc(button.sub)}</span>
      </button>`).join("")}
    </div>
    ${edit.type === "opp_goal" ? "" : `<label class="field"><span>Player</span><select id="edit-player">${options}</select></label>`}
    <div class="quarters edit-quarters" role="group" aria-label="Quarter">
      ${QUARTERS.map((quarter) => `<button type="button" data-action="edit-quarter" data-quarter="${quarter}" aria-pressed="${edit.quarter === quarter ? "true" : "false"}" class="${edit.quarter === quarter ? "is-on" : ""}">${quarter}</button>`).join("")}
    </div>
    ${edit.type === "pim" ? `<div class="pim-grid">
        ${PIM_PRESETS.map((preset) => `<button type="button" data-action="edit-minutes" data-minutes="${preset.minutes}" class="${Number(edit.minutes) === preset.minutes ? "is-on" : ""}">${preset.label}</button>`).join("")}
      </div>
      <label class="field"><span>Other minutes</span><input id="edit-minutes" inputmode="decimal" placeholder="1.5"></label>` : ""}
    <div class="sheet-actions">
      <button type="button" class="secondary" data-action="close-sheet">Cancel</button>
      <button type="submit" class="primary">Save event</button>
    </div>
  </form>`;
}

function closeSheet() {
  if (ui.sheet?.type === "confirm" && ui.confirmBack) {
    pendingConfirm = null;
    ui.sheet = ui.confirmBack;
    ui.confirmBack = null;
    focusSheet = true;
    render();
    return;
  }
  pendingConfirm = null;
  ui.sheet = null;
  ui.draft = null;
  ui.edit = null;
  ui.confirmBack = null;
  render();
}

function openConfirm(sheet, action, back) {
  pendingConfirm = action;
  ui.confirmBack = back || null;
  ui.sheet = sheet;
  focusSheet = true;
  render();
}

function setTeam(id) {
  if (!data.teams.some((team) => team.id === id) || data.activeTeamId === id) return;
  data.activeTeamId = id;
  ui.selectedPlayerId = null;
  ui.pendingStat = null;
  ui.logPlayerId = "";
  ui.sheet = null;
  ui.draft = null;
  ui.edit = null;
  if (ui.view === "box") ui.view = "games";
  persist();
  render();
}

function setView(view) {
  ui.view = view;
  ui.sheet = null;
  ui.draft = null;
  ui.edit = null;
  persist();
  render();
}

function openNewGame() {
  ui.draft = { gameId: null, opponent: "", date: todayISO(), homeAway: "home", location: "" };
  ui.sheet = { type: "game" };
  focusSheet = true;
  render();
}

function openEditGame(id) {
  const game = findGame(id);
  if (!game) return;
  ui.draft = { gameId: game.id, opponent: game.opponent, date: game.date, homeAway: game.homeAway, location: game.location || "" };
  ui.sheet = { type: "game" };
  focusSheet = true;
  render();
}

function saveGame() {
  syncDraftFromDom();
  if (ui.draft.gameId) {
    const game = findGame(ui.draft.gameId);
    if (!game) return toast("That game is gone.");
    const result = updateGameMeta(game, ui.draft);
    if (result.error) return toast(result.error);
    ui.sheet = null;
    ui.draft = null;
    persist();
    toast("Game saved.");
    return;
  }
  const result = createGame(data, currentTeam(data).id, ui.draft);
  if (result.error) return toast(result.error);
  ui.sheet = null;
  ui.draft = null;
  ui.view = "live";
  ui.selectedPlayerId = null;
  ui.pendingStat = null;
  persist();
  render();
}

function goLive(id) {
  const game = findGame(id);
  const team = currentTeam(data);
  if (!game || game.teamId !== team.id) return;
  if (!data.activeGameByTeam) data.activeGameByTeam = {};
  data.activeGameByTeam[team.id] = game.id;
  ui.view = "live";
  ui.sheet = null;
  ui.pendingStat = null;
  persist();
  render();
}

function openBox(id) {
  const game = findGame(id);
  if (!game) return;
  data.boxGameId = game.id;
  ui.view = "box";
  ui.sheet = null;
  persist();
  render();
}

function askDeleteGame(id) {
  const game = findGame(id);
  if (!game) return;
  openConfirm({
    type: "confirm",
    title: `Delete ${versus(game)}?`,
    body: `${formatDate(game.date)}. This removes the game and every stat in it.`,
    confirm: "Delete game",
    tone: "danger",
  }, () => {
    deleteGame(data, id);
    if (ui.view === "box") ui.view = "games";
    ui.sheet = null;
    persist();
    toast("Game deleted.");
  });
}

function openPlayerForm(id) {
  const team = currentTeam(data);
  const player = id ? team.players.find((item) => item.id === id) : null;
  ui.draft = player
    ? { playerId: player.id, firstName: player.firstName, lastName: player.lastName, number: player.number, position: player.position }
    : { playerId: null, firstName: "", lastName: "", number: "", position: "" };
  ui.sheet = { type: "player" };
  focusSheet = true;
  render();
}

function savePlayer() {
  syncDraftFromDom();
  const team = currentTeam(data);
  const result = ui.draft.playerId ? updatePlayer(team, ui.draft.playerId, ui.draft) : addPlayer(team, ui.draft);
  if (result.error) return toast(result.error);
  ui.sheet = null;
  ui.draft = null;
  persist();
  toast("Roster saved.");
}

function askRemovePlayer(id) {
  const team = currentTeam(data);
  const player = team.players.find((item) => item.id === id);
  if (!player) return;
  openConfirm({
    type: "confirm",
    title: `Remove ${playerName(player)}?`,
    body: "They come off the roster. Stats already logged in games stay, under this name.",
    confirm: "Remove player",
    tone: "danger",
  }, () => {
    removePlayer(team, id);
    if (ui.selectedPlayerId === id) ui.selectedPlayerId = null;
    if (ui.logPlayerId === id) ui.logPlayerId = "";
    ui.sheet = null;
    ui.draft = null;
    persist();
    toast("Player removed. Logged stats stay in the games.");
  });
}

function setQuarter(quarter) {
  const game = currentGame(data);
  if (!game || !QUARTERS.includes(quarter)) return;
  game.quarter = quarter;
  persist();
  render();
}

function clearSelection() {
  ui.selectedPlayerId = null;
  ui.pendingStat = null;
  render();
}

function openAssist(goal) {
  ui.sheet = { type: "assist", goalEventId: goal.id, scorerId: goal.playerId };
  focusSheet = true;
  render();
}

function openPim(playerId) {
  ui.pendingStat = null;
  ui.selectedPlayerId = playerId;
  ui.sheet = { type: "pim", playerId };
  focusSheet = true;
  render();
}

function onStat(type) {
  const game = currentGame(data);
  const team = currentTeam(data);
  if (!game) return;
  if (type === "opp_goal") {
    const event = addEvent(game, { type, quarter: game.quarter });
    if (!event) return;
    flashSide = "them";
    ui.pendingStat = null;
    persist();
    render();
    return;
  }
  if (!team.players.length) return toast("Add players on the Roster tab first.");
  const player = team.players.find((item) => item.id === ui.selectedPlayerId) || null;
  if (!player) {
    ui.pendingStat = ui.pendingStat === type ? null : type;
    render();
    return;
  }
  if (type === "pim") return openPim(player.id);
  const event = addEvent(game, { type, player, quarter: game.quarter });
  if (!event) return;
  if (type === "goal") flashSide = "us";
  ui.pendingStat = null;
  persist();
  if (type === "goal") openAssist(event);
  else render();
}

function onPlayer(id) {
  const game = currentGame(data);
  const team = currentTeam(data);
  if (!game) return;
  const player = team.players.find((item) => item.id === id);
  if (!player) return;
  if (ui.pendingStat === "pim") return openPim(id);
  if (ui.pendingStat) {
    const type = ui.pendingStat;
    const event = addEvent(game, { type, player, quarter: game.quarter });
    if (!event) return;
    ui.pendingStat = null;
    ui.selectedPlayerId = id;
    if (type === "goal") flashSide = "us";
    persist();
    if (type === "goal") openAssist(event);
    else render();
    return;
  }
  ui.selectedPlayerId = ui.selectedPlayerId === id ? null : id;
  render();
}

function chooseAssist(playerId) {
  const game = currentGame(data);
  const team = currentTeam(data);
  const sheet = ui.sheet;
  if (!game || sheet?.type !== "assist") return;
  const goal = game.events.find((event) => event.id === sheet.goalEventId);
  const player = team.players.find((item) => item.id === playerId);
  if (!goal || !player || player.id === sheet.scorerId) {
    ui.sheet = null;
    render();
    return;
  }
  addEvent(game, { type: "assist", player, quarter: goal.quarter, goalEventId: goal.id });
  ui.sheet = null;
  persist();
  render();
}

function applyPim(minutes) {
  const sheet = ui.sheet;
  const game = currentGame(data);
  const team = currentTeam(data);
  if (!sheet || sheet.type !== "pim" || !game) return;
  const player = team.players.find((item) => item.id === sheet.playerId);
  const clean = sanitizeMinutes(minutes);
  if (!player || clean == null) return toast("Enter penalty minutes greater than 0.");
  const event = addEvent(game, { type: "pim", player, quarter: game.quarter, minutes: clean });
  if (!event) return toast("Couldn't add that penalty.");
  ui.sheet = null;
  ui.selectedPlayerId = player.id;
  persist();
  render();
}

function onUndo() {
  const game = currentGame(data);
  if (!game) return;
  const removed = undoLast(game);
  if (!removed) return;
  if (ui.sheet?.type === "assist" && ui.sheet.goalEventId === removed.id) ui.sheet = null;
  if (removed.type === "goal") flashSide = "us";
  if (removed.type === "opp_goal") flashSide = "them";
  persist();
  render();
}

function askDeleteEvent(id) {
  const game = currentGame(data);
  const event = game?.events.find((item) => item.id === id);
  if (!event) return;
  const fromList = ui.sheet?.type === "events";
  const linked = game.events.some((item) => item.goalEventId === id);
  openConfirm({
    type: "confirm",
    title: "Delete this event?",
    body: `${event.quarter} · ${eventLabel(event)} · ${eventWho(event, currentTeam(data))}.${linked ? " The assist on this goal will be removed too." : ""}`,
    confirm: "Delete event",
    tone: "danger",
  }, () => {
    deleteEvent(game, id);
    ui.sheet = fromList ? { type: "events" } : null;
    focusSheet = Boolean(ui.sheet);
    persist();
    render();
  }, fromList ? { type: "events" } : null);
}

function openEdit(id) {
  const game = currentGame(data);
  const event = game?.events.find((item) => item.id === id);
  if (!event) return;
  ui.edit = { eventId: event.id, type: event.type, playerId: event.playerId || "", quarter: event.quarter, minutes: event.minutes };
  ui.confirmBack = null;
  ui.sheet = { type: "edit" };
  focusSheet = true;
  render();
}

function saveEdit() {
  syncEditFields();
  const game = currentGame(data);
  const team = currentTeam(data);
  if (!game || !ui.edit) return;
  const result = updateEvent(game, team, ui.edit.eventId, ui.edit);
  if (result.error) return toast(result.error);
  ui.sheet = null;
  ui.edit = null;
  persist();
  toast("Event updated.");
}

function exportSeason() {
  const team = currentTeam(data);
  download(`${slug(team.name)}-season.csv`, seasonCsv(team, seasonForTeam(data, team)), "text/csv;charset=utf-8");
}

function exportGame(id) {
  const team = currentTeam(data);
  const game = findGame(id);
  if (!game) return;
  download(`${slug(team.name)}-vs-${slug(game.opponent)}-${game.date}.csv`, gameCsv(team, game, boxScore(game, team)), "text/csv;charset=utf-8");
}

function exportJson() {
  download("lacrosse-stats-backup.json", JSON.stringify(exportPayload(data), null, 2), "application/json");
}

function toggleFinal(id) {
  const game = findGame(id);
  if (!game) return;
  if (!game.final && !game.events.length) {
    toast("Enter the stats before marking this game final.");
    return;
  }
  game.final = !game.final;
  persist();
  render();
  toast(game.final
    ? "Marked final. Tap Submit results to put it on the public page."
    : "Hidden from the public page. Tap Submit results to update what people see.");
}

async function submitGame(id) {
  const game = (id && findGame(id)) || currentGame(data);
  if (!game) {
    toast("Open a game before submitting.");
    return;
  }
  if (!game.events.length) {
    toast("Enter the stats before submitting this game.");
    return;
  }
  game.final = true;
  persist();
  render();
  try {
    const result = await publishResults(data);
    toast(result.mode === "endpoint"
      ? "Results submitted. They will show on the public page shortly."
      : "Downloaded results.json. Upload that file on GitHub to publish it.");
  } catch (error) {
    toast(error?.message || "Couldn't submit results.");
  }
}

async function publishMarked() {
  const anyFinal = data.games.some((game) => game.final && game.events.length);
  if (!anyFinal) {
    toast("Mark a game final, or tap Submit results after the game.");
    return;
  }
  try {
    const result = await publishResults(data);
    toast(result.mode === "endpoint"
      ? "Results submitted. They will show on the public page shortly."
      : "Downloaded results.json. Upload that file on GitHub to publish it.");
  } catch (error) {
    toast(error?.message || "Couldn't submit results.");
  }
}

function pickBackup() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.hidden = true;
  document.body.appendChild(input);
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    let text = "";
    try {
      text = await file.text();
    } catch {
      toast("Couldn't read that file.");
      return;
    }
    const parsed = parseBackup(text);
    if (parsed.error) return toast(parsed.error);
    const when = parsed.exportedAt ? new Date(parsed.exportedAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "an unknown time";
    openConfirm({
      type: "confirm",
      title: "Restore this backup?",
      body: `This replaces teams, rosters, and games on this phone with the backup from ${when}.`,
      confirm: "Replace data",
      tone: "danger",
    }, () => {
      data = parsed.data;
      ui.selectedPlayerId = null;
      ui.pendingStat = null;
      ui.logPlayerId = "";
      ui.sheet = null;
      ui.view = data.lastView === "box" && data.boxGameId ? "box" : (["live", "stats", "roster"].includes(data.lastView) ? data.lastView : "games");
      applyTheme();
      persist();
      toast("Backup restored on this phone.");
    });
  };
  input.click();
  setTimeout(() => input.remove(), 60_000);
}

function resetSave() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) localStorage.setItem(`${STORAGE_KEY}.broken`, raw);
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* keep going */ }
  location.reload();
}

function setHomeAway(value) {
  if (!ui.draft) return;
  const homeAway = value === "away" ? "away" : "home";
  ui.draft.homeAway = homeAway;
  const hidden = document.querySelector('input[name="homeAway"]');
  if (hidden) hidden.value = homeAway;
  document.querySelectorAll("[data-ha]").forEach((button) => {
    const on = button.dataset.ha === homeAway;
    button.classList.toggle("is-on", on);
    button.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function onClick(event) {
  if (event.target.classList?.contains("overlay")) {
    closeSheet();
    return;
  }
  const el = event.target.closest("[data-action]");
  if (!el || el.disabled) return;
  try {
    const id = el.dataset.id || "";
    switch (el.dataset.action) {
      case "team": setTeam(id); break;
      case "theme": {
        const dark = document.documentElement.dataset.theme === "dark";
        data.theme = dark ? "light" : "dark";
        applyTheme();
        persist();
        render();
        break;
      }
      case "nav": setView(el.dataset.view); break;
      case "dismiss-install": data.installDismissed = true; persist(); render(); break;
      case "new-game": openNewGame(); break;
      case "edit-game": openEditGame(id); break;
      case "delete-game": askDeleteGame(id); break;
      case "go-live": goLive(id); break;
      case "open-box": openBox(id); break;
      case "back-box": ui.view = currentGame(data)?.id === data.boxGameId ? "live" : "games"; persist(); render(); break;
      case "close-sheet": closeSheet(); break;
      case "confirm-yes": {
        const fn = pendingConfirm;
        pendingConfirm = null;
        ui.sheet = null;
        ui.confirmBack = null;
        if (fn) fn();
        else render();
        break;
      }
      case "home-away": setHomeAway(el.dataset.ha); break;
      case "add-player": openPlayerForm(""); break;
      case "edit-player": openPlayerForm(id); break;
      case "remove-player": askRemovePlayer(id); break;
      case "quarter": setQuarter(el.dataset.quarter); break;
      case "clear-selection": clearSelection(); break;
      case "stat": onStat(el.dataset.stat); break;
      case "pick-player": onPlayer(id); break;
      case "assist-player": chooseAssist(id); break;
      case "skip-assist": ui.sheet = null; render(); break;
      case "undo": onUndo(); break;
      case "show-events": ui.sheet = { type: "events" }; focusSheet = true; render(); break;
      case "edit-event": openEdit(id); break;
      case "delete-event": askDeleteEvent(id); break;
      case "pim-preset": applyPim(el.dataset.minutes); break;
      case "pim-custom": applyPim(document.querySelector("#custom-minutes")?.value); break;
      case "edit-type": syncEditFields(); ui.edit.type = el.dataset.stat; if (ui.edit.type === "pim" && !sanitizeMinutes(ui.edit.minutes)) ui.edit.minutes = 1; if (ui.edit.type !== "pim") ui.edit.minutes = null; render(); break;
      case "edit-quarter": syncEditFields(); ui.edit.quarter = el.dataset.quarter; render(); break;
      case "edit-minutes": syncEditFields(); ui.edit.minutes = Number(el.dataset.minutes); render(); break;
      case "stats-tab": ui.statsTab = el.dataset.tab; render(); break;
      case "avg-mode": ui.avgMode = el.dataset.mode === "avg" ? "avg" : "totals"; render(); break;
      case "export-json": exportJson(); break;
      case "import-json": pickBackup(); break;
      case "export-season": exportSeason(); break;
      case "export-game": exportGame(id); break;
      case "submit-game": submitGame(id); break;
      case "toggle-final": toggleFinal(id); break;
      case "publish-results": publishMarked(); break;
      case "reset-save": resetSave(); break;
      default: break;
    }
  } catch {
    toast("Couldn't save on this phone. Download a backup.");
  }
}

function onInput(event) {
  const target = event.target;
  if (!target?.name && target?.id !== "edit-minutes") return;
  if (ui.draft && target.name && target.closest("form[data-draft-form]")) {
    ui.draft[target.name] = target.value;
    if (target.name === "number") updateNumberWarning();
  }
  if (ui.edit && target.id === "edit-minutes") ui.edit.minutes = target.value;
}

function onChange(event) {
  const target = event.target;
  if (ui.draft && target?.name && target.closest("form[data-draft-form]")) {
    ui.draft[target.name] = target.value;
    if (target.name === "number") updateNumberWarning();
  }
  if (target?.id === "log-player") {
    ui.logPlayerId = target.value;
    render();
  }
}

function onSubmit(event) {
  event.preventDefault();
  try {
    if (event.target.dataset.draftForm === "game") saveGame();
    else if (event.target.dataset.draftForm === "player") savePlayer();
    else if (event.target.hasAttribute("data-edit-form")) saveEdit();
  } catch {
    toast("Couldn't save on this phone. Download a backup.");
  }
}

function iconGames() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 10h16M8 3v4M16 3v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
}
function iconLive() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="currentColor"/></svg>`;
}
function iconStats() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V10M12 19V5M19 19v-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
}
function iconRoster() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3.5 19c.8-3 2.8-4.5 5.5-4.5S14.2 16 15 19M17 8.5a2.5 2.5 0 1 1 0 5M16.5 14.6c2.2.3 3.7 1.6 4.3 4.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
}
function moonSvg() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M15.5 3.2a8.2 8.2 0 1 0 5.4 13.8A8.2 8.2 0 0 1 15.5 3.2z"/></svg>`;
}
function sunSvg() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="currentColor"/><path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5M5 5l1.8 1.8M17.2 17.2 19 19M19 5l-1.8 1.8M6.8 17.2 5 19"/></svg>`;
}

app.addEventListener("click", onClick);
app.addEventListener("input", onInput);
app.addEventListener("change", onChange);
app.addEventListener("submit", onSubmit);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && ui?.sheet) {
    event.preventDefault();
    closeSheet();
  }
});

boot();
