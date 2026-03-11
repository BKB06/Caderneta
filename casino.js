// ========================
// CASINO.JS — Ganhos no Cassino
// ========================

const PROFILES_KEY = "caderneta.profiles.v1";
const ACTIVE_PROFILE_KEY = "caderneta.activeProfile.v1";

function getActiveProfileId() {
  const profiles = JSON.parse(localStorage.getItem(PROFILES_KEY) || "[]");
  let activeId = localStorage.getItem(ACTIVE_PROFILE_KEY);
  if (profiles.length === 0) return null;
  if (!activeId || !profiles.find(p => p.id === activeId)) {
    activeId = profiles[0].id;
    localStorage.setItem(ACTIVE_PROFILE_KEY, activeId);
  }
  return activeId;
}

function getCasinoKey() {
  const profileId = getActiveProfileId();
  return profileId ? `caderneta.casino.${profileId}` : "caderneta.casino.v1";
}

let casinoRecords = [];
let editingId = null;
let casinoChart = null;

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 2,
});

const percentFormatter = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 1,
});

const numberFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

// DOM
const form = document.getElementById("casino-form");
const submitButton = document.getElementById("casino-submit");
const resetButton = document.getElementById("casino-reset");
const casinoBody = document.getElementById("casino-body");
const gameFilter = document.getElementById("casino-game-filter");
const platformFilter = document.getElementById("casino-platform-filter");
const dateStart = document.getElementById("casino-date-start");
const dateEnd = document.getElementById("casino-date-end");
const clearFiltersBtn = document.getElementById("casino-clear-filters");
const sessionProfitEl = document.getElementById("casino-session-profit");

// ========================
// API
// ========================
async function loadCasinoRecords() {
  try {
    const profileId = getActiveProfileId();
    const resp = await fetch('api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'carregar_casino', profile_id: profileId })
    });
    const text = await resp.text();
    try {
      const dados = JSON.parse(text);
      casinoRecords = dados.map(r => ({
        ...r,
        bet_amount: Number(r.bet_amount),
        win_amount: Number(r.win_amount),
      }));
    } catch (e) {
      console.error("🚨 Resposta não-JSON do PHP:", text);
      casinoRecords = [];
    }
  } catch (e) {
    console.error("❌ Erro ao carregar cassino:", e);
    casinoRecords = [];
  }
}

async function salvarCasinoBD(record) {
  try {
    const resp = await fetch('api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        acao: 'salvar_casino',
        profile_id: getActiveProfileId(),
        casino: record
      })
    });
    const text = await resp.text();
    try {
      const res = JSON.parse(text);
      if (res.sucesso) {
        console.log("✅", res.mensagem);
      } else {
        console.error("❌", res.erro);
      }
    } catch (e) {
      console.error("🚨 Resposta não-JSON:", text);
    }
  } catch (e) {
    console.error("❌ Erro de comunicação:", e);
  }
}

async function excluirCasinoBD(id) {
  try {
    await fetch('api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        acao: 'excluir_casino',
        profile_id: getActiveProfileId(),
        id: id
      })
    });
  } catch (e) {
    console.error("❌ Erro ao excluir:", e);
  }
}

function saveCasinoLocal() {
  localStorage.setItem(getCasinoKey(), JSON.stringify(casinoRecords));
}

// ========================
// HELPERS
// ========================
function parseLocaleNumber(value) {
  if (typeof value !== "string") return Number(value);
  return Number(value.replace(/\./g, "").replace(/,/g, ".").trim());
}

function formatDateDisplay(value) {
  if (!value) return "";
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${day}/${month}/${year}`;
  }
  const brMatch = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) return value;
  return "";
}

function formatDateForInput(value) {
  if (!value) return "";
  const brMatch = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    const [, day, month, year] = brMatch;
    return `${year}-${month}-${day}`;
  }
  return value;
}

function parseDateForSort(value) {
  if (!value) return null;
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  const brMatch = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    const [, day, month, year] = brMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  return null;
}

function getSelectedAIs(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return "";
  const checked = container.querySelectorAll('input[type="checkbox"]:checked');
  return Array.from(checked).map(cb => cb.value).join(",");
}

function setSelectedAIs(containerId, aisString) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const checkboxes = container.querySelectorAll('input[type="checkbox"]');
  const selected = aisString ? aisString.split(",").map(s => s.trim()) : [];
  checkboxes.forEach(cb => {
    cb.checked = selected.includes(cb.value);
  });
}

function formatAITags(aisString) {
  if (!aisString) return "-";
  return aisString.split(",").map(ai => 
    `<span class="fbet-ai">${ai.trim()}</span>`
  ).join(" ");
}

// ========================
// FILTERS
// ========================
function getFilteredRecords() {
  const game = gameFilter?.value || "all";
  const platform = platformFilter?.value || "all";
  const start = dateStart?.value ? parseDateForSort(dateStart.value) : null;
  const end = dateEnd?.value ? parseDateForSort(dateEnd.value) : null;

  return casinoRecords.filter(r => {
    if (game !== "all" && r.game !== game) return false;
    if (platform !== "all" && r.platform !== platform) return false;
    if (start || end) {
      const d = parseDateForSort(r.date);
      if (!d) return false;
      if (start && d < start) return false;
      if (end && d > end) return false;
    }
    return true;
  });
}

function renderFilters() {
  // Games
  if (gameFilter) {
    const currentGame = gameFilter.value;
    const games = [...new Set(casinoRecords.map(r => r.game).filter(Boolean))].sort();
    gameFilter.innerHTML = '<option value="all">Todos</option>';
    games.forEach(g => {
      const opt = document.createElement("option");
      opt.value = g;
      opt.textContent = g;
      gameFilter.appendChild(opt);
    });
    if (games.includes(currentGame)) gameFilter.value = currentGame;
  }

  // Platforms
  if (platformFilter) {
    const currentPlatform = platformFilter.value;
    const platforms = [...new Set(casinoRecords.map(r => r.platform).filter(Boolean))].sort();
    platformFilter.innerHTML = '<option value="all">Todas</option>';
    platforms.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p;
      opt.textContent = p;
      platformFilter.appendChild(opt);
    });
    if (platforms.includes(currentPlatform)) platformFilter.value = currentPlatform;
  }
}

// ========================
// STATS
// ========================
function renderStats() {
  const totalBet = casinoRecords.reduce((s, r) => s + r.bet_amount, 0);
  const totalWon = casinoRecords.reduce((s, r) => s + r.win_amount, 0);
  const totalProfit = totalWon - totalBet;
  const sessions = casinoRecords.length;
  const positiveSessions = casinoRecords.filter(r => r.win_amount > r.bet_amount).length;
  const winrate = sessions > 0 ? positiveSessions / sessions : 0;
  const roi = totalBet > 0 ? totalProfit / totalBet : 0;

  const profitEl = document.getElementById("casino-total-profit");
  profitEl.textContent = currencyFormatter.format(totalProfit);
  profitEl.style.color = totalProfit >= 0 ? 'var(--success)' : 'var(--danger)';

  document.getElementById("casino-total-bet").textContent = currencyFormatter.format(totalBet);
  document.getElementById("casino-total-won").textContent = currencyFormatter.format(totalWon);
  document.getElementById("casino-total-sessions").textContent = sessions;
  document.getElementById("casino-winrate").textContent = percentFormatter.format(winrate);

  const roiEl = document.getElementById("casino-roi");
  roiEl.textContent = percentFormatter.format(roi);
  roiEl.style.color = roi >= 0 ? 'var(--success)' : 'var(--danger)';
}

// ========================
// TABLE
// ========================
function renderTable() {
  const data = getFilteredRecords();
  casinoBody.innerHTML = "";

  if (data.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 8;
    cell.textContent = "Nenhum registro de cassino encontrado.";
    row.appendChild(cell);
    casinoBody.appendChild(row);
    return;
  }

  const sorted = [...data].sort((a, b) => {
    const da = parseDateForSort(a.date);
    const db = parseDateForSort(b.date);
    if (da && db) return db - da;
    return 0;
  });

  sorted.forEach(r => {
    const row = document.createElement("tr");
    const profit = r.win_amount - r.bet_amount;

    const tdDate = document.createElement("td");
    tdDate.textContent = r.date;
    row.appendChild(tdDate);

    const tdGame = document.createElement("td");
    const strong = document.createElement("strong");
    strong.textContent = r.game;
    tdGame.appendChild(strong);
    row.appendChild(tdGame);

    const tdPlatform = document.createElement("td");
    tdPlatform.textContent = r.platform;
    row.appendChild(tdPlatform);

    const tdBet = document.createElement("td");
    tdBet.textContent = currencyFormatter.format(r.bet_amount);
    row.appendChild(tdBet);

    const tdWin = document.createElement("td");
    tdWin.textContent = currencyFormatter.format(r.win_amount);
    tdWin.style.color = r.win_amount > 0 ? 'var(--success)' : '';
    row.appendChild(tdWin);

    const tdProfit = document.createElement("td");
    tdProfit.textContent = currencyFormatter.format(profit);
    tdProfit.style.color = profit >= 0 ? 'var(--success)' : 'var(--danger)';
    tdProfit.style.fontWeight = '600';
    row.appendChild(tdProfit);

    const tdNote = document.createElement("td");
    tdNote.textContent = r.note || "-";
    row.appendChild(tdNote);

    const tdActions = document.createElement("td");
    tdActions.innerHTML = `
      <button type="button" class="ghost small" data-action="edit" data-id="${r.id}">Editar</button>
      <button type="button" class="ghost small" data-action="delete" data-id="${r.id}">Excluir</button>
    `;
    row.appendChild(tdActions);

    casinoBody.appendChild(row);
  });
}

// ========================
// CHART
// ========================
function renderChart() {
  const ctx = document.getElementById("casino-chart");
  if (!ctx || typeof Chart === "undefined") return;

  const monthlyData = {};
  casinoRecords.forEach(r => {
    const date = parseDateForSort(r.date);
    if (!date) return;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!monthlyData[key]) monthlyData[key] = { bet: 0, won: 0 };
    monthlyData[key].bet += r.bet_amount;
    monthlyData[key].won += r.win_amount;
  });

  const sortedKeys = Object.keys(monthlyData).sort();
  const labels = sortedKeys.map(key => {
    const [year, month] = key.split('-');
    return `${MONTH_NAMES[parseInt(month) - 1].slice(0, 3)}/${year.slice(2)}`;
  });

  const profitData = sortedKeys.map(key => monthlyData[key].won - monthlyData[key].bet);

  // Evolução cumulativa
  let cumulative = 0;
  const cumulativeData = profitData.map(p => { cumulative += p; return cumulative; });

  if (casinoChart) casinoChart.destroy();

  if (labels.length === 0) {
    labels.push("Sem dados");
    profitData.push(0);
    cumulativeData.push(0);
  }

  casinoChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          type: "line",
          label: "Lucro Acumulado",
          data: cumulativeData,
          borderColor: "#7c5cff",
          backgroundColor: "rgba(124, 92, 255, 0.1)",
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          yAxisID: 'y1',
        },
        {
          label: "Lucro Mensal",
          data: profitData,
          backgroundColor: profitData.map(v => v >= 0 ? "rgba(34, 197, 94, 0.7)" : "rgba(255, 107, 107, 0.7)"),
          borderColor: profitData.map(v => v >= 0 ? "#22c55e" : "#ff6b6b"),
          borderWidth: 1,
          borderRadius: 4,
          yAxisID: 'y',
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: 'rgba(245, 247, 255, 0.8)' },
        },
      },
      scales: {
        x: {
          ticks: { color: "rgba(245, 247, 255, 0.6)" },
          grid: { color: "rgba(255, 255, 255, 0.05)" },
        },
        y: {
          position: 'left',
          ticks: { color: "rgba(245, 247, 255, 0.6)" },
          grid: { color: "rgba(255, 255, 255, 0.05)" },
        },
        y1: {
          position: 'right',
          ticks: { color: "rgba(124, 92, 255, 0.6)" },
          grid: { drawOnChartArea: false },
        },
      },
    },
  });
}

// ========================
// TOP GAMES / PLATFORMS
// ========================
function renderTopGames() {
  const container = document.getElementById("casino-top-games");
  if (!container) return;

  const gameMap = {};
  casinoRecords.forEach(r => {
    if (!gameMap[r.game]) gameMap[r.game] = { bet: 0, won: 0, count: 0 };
    gameMap[r.game].bet += r.bet_amount;
    gameMap[r.game].won += r.win_amount;
    gameMap[r.game].count++;
  });

  const sorted = Object.entries(gameMap)
    .map(([name, d]) => ({ name, profit: d.won - d.bet, count: d.count }))
    .sort((a, b) => b.profit - a.profit);

  if (sorted.length === 0) {
    container.innerHTML = '<p class="empty-message">Nenhum jogo registrado.</p>';
    return;
  }

  container.innerHTML = sorted.map(g => `
    <div class="monthly-item ${g.profit >= 0 ? 'deposit' : 'withdraw'}">
      <div class="monthly-info">
        <strong>🎮 ${g.name}</strong>
        <span class="monthly-count">${g.count} sessão${g.count !== 1 ? 'ões' : ''}</span>
      </div>
      <span class="monthly-value" style="color: ${g.profit >= 0 ? 'var(--success)' : 'var(--danger)'}">${currencyFormatter.format(g.profit)}</span>
    </div>
  `).join('');
}

function renderTopPlatforms() {
  const container = document.getElementById("casino-top-platforms");
  if (!container) return;

  const platMap = {};
  casinoRecords.forEach(r => {
    const key = r.platform || "Desconhecida";
    if (!platMap[key]) platMap[key] = { bet: 0, won: 0, count: 0 };
    platMap[key].bet += r.bet_amount;
    platMap[key].won += r.win_amount;
    platMap[key].count++;
  });

  const sorted = Object.entries(platMap)
    .map(([name, d]) => ({ name, profit: d.won - d.bet, count: d.count }))
    .sort((a, b) => b.profit - a.profit);

  if (sorted.length === 0) {
    container.innerHTML = '<p class="empty-message">Nenhuma plataforma registrada.</p>';
    return;
  }

  container.innerHTML = sorted.map(p => `
    <div class="monthly-item ${p.profit >= 0 ? 'deposit' : 'withdraw'}">
      <div class="monthly-info">
        <strong>🏢 ${p.name}</strong>
        <span class="monthly-count">${p.count} sessão${p.count !== 1 ? 'ões' : ''}</span>
      </div>
      <span class="monthly-value" style="color: ${p.profit >= 0 ? 'var(--success)' : 'var(--danger)'}">${currencyFormatter.format(p.profit)}</span>
    </div>
  `).join('');
}

// ========================
// AI RANKING (CASINO)
// ========================
function renderCasinoAIRanking() {
  const container = document.getElementById("casino-ai-ranking-grid");
  if (!container) return;

  const aiNames = ['Grok', 'Gemini', 'Claude'];
  
  const aiStats = aiNames.map(name => {
    const aiBets = casinoRecords.filter(r => {
      if (!r.ais) return false;
      const aisList = r.ais.split(",").map(a => a.trim());
      return aisList.includes(name);
    });

    const wins = aiBets.filter(r => r.win_amount > r.bet_amount).length;
    const losses = aiBets.filter(r => r.win_amount <= r.bet_amount).length;
    const total = aiBets.length;
    const winrate = total > 0 ? wins / total : 0;
    const profit = aiBets.reduce((s, r) => s + (r.win_amount - r.bet_amount), 0);

    return { name, wins, losses, total, winrate, profit };
  });

  aiStats.sort((a, b) => {
    if (b.winrate !== a.winrate) return b.winrate - a.winrate;
    return b.total - a.total;
  });

  const medals = ['🥇', '🥈', '🥉'];

  container.innerHTML = aiStats.map((ai, index) => `
    <div class="ai-ranking-card ${index === 0 && ai.total > 0 ? 'first' : ''}">
      <span class="ai-medal">${medals[index] || ''}</span>
      <span class="ai-name">${ai.name}</span>
      <div class="ai-stats">
        <span class="ai-winrate">${ai.total > 0 ? percentFormatter.format(ai.winrate) : '-'}</span>
        <span>Taxa de acerto</span>
        <div class="ai-record">
          <span class="ai-green">${ai.wins}W</span>
          <span class="ai-red">${ai.losses}L</span>
        </div>
        <span>Lucro: <strong style="color: ${ai.profit >= 0 ? 'var(--success)' : 'var(--danger)'}">${currencyFormatter.format(ai.profit)}</strong></span>
      </div>
    </div>
  `).join('');
}

// ========================
// SESSION PROFIT PREVIEW
// ========================
function updateSessionProfit() {
  const bet = parseLocaleNumber(document.getElementById("casino-bet-amount")?.value || "0");
  const win = parseLocaleNumber(document.getElementById("casino-win-amount")?.value || "0");
  const profit = win - bet;
  if (sessionProfitEl) {
    sessionProfitEl.textContent = currencyFormatter.format(profit);
    sessionProfitEl.style.color = profit >= 0 ? 'var(--success)' : 'var(--danger)';
  }
}

// ========================
// REFRESH ALL
// ========================
function refreshAll() {
  renderStats();
  renderFilters();
  renderTable();
  renderChart();
  renderTopGames();
  renderTopPlatforms();
}

function resetForm() {
  form.reset();
  editingId = null;
  submitButton.textContent = "Salvar registro";
  updateSessionProfit();
}

// ========================
// FORM SUBMIT
// ========================
async function handleSubmit(event) {
  event.preventDefault();

  const rawDate = document.getElementById("casino-date").value.trim();
  const formattedDate = formatDateDisplay(rawDate);
  const betAmount = parseLocaleNumber(document.getElementById("casino-bet-amount").value);
  const winAmount = parseLocaleNumber(document.getElementById("casino-win-amount").value);

  const record = {
    id: editingId || crypto.randomUUID(),
    date: formattedDate,
    game: document.getElementById("casino-game").value.trim(),
    platform: document.getElementById("casino-platform").value.trim(),
    bet_amount: betAmount,
    win_amount: winAmount,
    ais: null,
    note: document.getElementById("casino-note").value.trim(),
  };

  if (!record.date || !record.game || !Number.isFinite(record.bet_amount)) {
    alert("Preencha data, jogo e valor apostado.");
    return;
  }

  if (editingId) {
    const idx = casinoRecords.findIndex(r => r.id === editingId);
    if (idx >= 0) casinoRecords[idx] = { ...casinoRecords[idx], ...record };
  } else {
    casinoRecords.unshift(record);
  }

  await salvarCasinoBD(record);
  saveCasinoLocal();
  refreshAll();
  resetForm();
}

function startEdit(record) {
  editingId = record.id;
  document.getElementById("casino-date").value = formatDateForInput(record.date);
  document.getElementById("casino-game").value = record.game;
  document.getElementById("casino-platform").value = record.platform || "";
  document.getElementById("casino-bet-amount").value = numberFormatter.format(record.bet_amount);
  document.getElementById("casino-win-amount").value = numberFormatter.format(record.win_amount);
  document.getElementById("casino-note").value = record.note || "";
  updateSessionProfit();
  submitButton.textContent = "Atualizar registro";
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function handleTableClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const id = button.dataset.id;

  if (button.dataset.action === "edit") {
    const record = casinoRecords.find(r => r.id === id);
    if (record) startEdit(record);
    return;
  }

  if (button.dataset.action === "delete") {
    if (confirm("Tem certeza que deseja excluir este registro?")) {
      casinoRecords = casinoRecords.filter(r => r.id !== id);
      await excluirCasinoBD(id);
      saveCasinoLocal();
      refreshAll();
    }
  }
}

function clearFilters() {
  if (gameFilter) gameFilter.value = "all";
  if (platformFilter) platformFilter.value = "all";
  if (dateStart) dateStart.value = "";
  if (dateEnd) dateEnd.value = "";
  renderTable();
}

// ========================
// EVENT LISTENERS
// ========================
if (form) form.addEventListener("submit", handleSubmit);
if (resetButton) resetButton.addEventListener("click", resetForm);
if (casinoBody) casinoBody.addEventListener("click", handleTableClick);
gameFilter?.addEventListener("change", renderTable);
platformFilter?.addEventListener("change", renderTable);
dateStart?.addEventListener("change", renderTable);
dateEnd?.addEventListener("change", renderTable);
clearFiltersBtn?.addEventListener("click", clearFilters);

document.getElementById("casino-bet-amount")?.addEventListener("input", updateSessionProfit);
document.getElementById("casino-win-amount")?.addEventListener("input", updateSessionProfit);

// Profile Switcher
const profileSwitch = document.getElementById('profile-switch');

function renderProfileSwitcher() {
  if (!profileSwitch) return;
  const profiles = JSON.parse(localStorage.getItem(PROFILES_KEY) || "[]");
  const activeId = getActiveProfileId();
  profileSwitch.innerHTML = '';
  profiles.forEach(profile => {
    const option = document.createElement('option');
    option.value = profile.id;
    option.textContent = profile.name;
    option.selected = profile.id === activeId;
    profileSwitch.appendChild(option);
  });
  if (profiles.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Perfil Principal';
    profileSwitch.appendChild(option);
  }
}

profileSwitch?.addEventListener('change', (e) => {
  const newProfileId = e.target.value;
  if (newProfileId) {
    localStorage.setItem(ACTIVE_PROFILE_KEY, newProfileId);
    window.location.reload();
  }
});

// ========================
// INIT
// ========================
async function iniciarCasino() {
  try {
    await loadCasinoRecords();
    refreshAll();
    renderProfileSwitcher();
  } catch (e) {
    console.error("❌ Erro ao iniciar cassino:", e);
  }
}
iniciarCasino();
