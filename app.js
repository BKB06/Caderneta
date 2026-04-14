const THEME_KEY = "caderneta.theme";
const {
  DEFAULT_AI_OPTIONS,
  getActiveProfileId,
  setActiveProfileId,
  resolveActiveProfileId,
  getSettingsKey,
  parseLocaleNumber,
  loadProfilesFromApi,
  formatCurrencyBRL,
  percentFormatter,
  numberFormatter,
} = window.CadernetaUtils;

const Shell = window.CadernetaShell || {};

function getStorageKey() {
  const profileId = getActiveProfileId();
  return profileId ? `caderneta.bets.${profileId}` : "caderneta.bets.v1";
}

function getCashflowKey() {
  const profileId = getActiveProfileId();
  return profileId ? `caderneta.cashflow.${profileId}` : "caderneta.cashflow.v1";
}

function getBankrollKey() {
  const profileId = getActiveProfileId();
  return profileId ? `caderneta.bankroll.${profileId}` : "caderneta.bankroll.base.v1";
}

function getNotesKey() {
  const profileId = getActiveProfileId();
  return profileId ? `caderneta.notes.${profileId}` : "caderneta.notes.v1";
}

function getGoalsKey() {
  const profileId = getActiveProfileId();
  return profileId ? `caderneta.goals.${profileId}` : "caderneta.goals.v1";
}

const form = document.getElementById("bet-form");
const potentialProfitEl = document.getElementById("potential-profit");
const betsBody = document.getElementById("bets-body");
const betsMobileList = document.getElementById("bets-mobile-list");
const finalizedBetsList = document.getElementById("finalized-bets-list");
const resetButton = document.getElementById("reset-button");
const submitButton = document.getElementById("submit-button");

const bankrollInput = document.getElementById("bankroll-input");
const bankrollProgress = document.getElementById("bankroll-progress");
const bankrollExposure = document.getElementById("bankroll-exposure");
const bankrollExposureValue = document.getElementById("bankroll-exposure-value");
const bankrollDeposits = document.getElementById("bankroll-deposits");
const bankrollWithdraws = document.getElementById("bankroll-withdraws");
const bankrollProfitIndicator = document.getElementById("bankroll-profit-indicator");
const bookFilter = document.getElementById("book-filter");
const statusFilter = document.getElementById("status-filter");
const boostFilter = document.getElementById("boost-filter");

const kpiProfit = document.getElementById("kpi-profit");
const kpiWinrate = document.getElementById("kpi-winrate");
const kpiRoi = document.getElementById("kpi-roi");
const kpiAvgOdd = document.getElementById("kpi-avg-odd");
const kpiAvgStake = document.getElementById("kpi-avg-stake");
const kpiTotalStake = document.getElementById("kpi-total-stake");
const kpiTotalBets = document.getElementById("kpi-total-bets");
const kpiStreak = document.getElementById("kpi-streak");

const dateFilterStart = document.getElementById("date-filter-start");
const dateFilterEnd = document.getElementById("date-filter-end");
const clearDateFilter = document.getElementById("clear-date-filter");
const betSearchInput = document.getElementById("bet-search");
const DEFAULT_TABLE_SORT = { key: "date", direction: "desc" };
const ALLOWED_SORT_KEYS = new Set(["date", "event", "odds", "stake", "status", "profit", "potentialProfit", "book", "category", "ai"]);
const ALLOWED_SORT_DIRECTIONS = new Set(["asc", "desc"]);

let tableSortState = {
  key: DEFAULT_TABLE_SORT.key,
  direction: DEFAULT_TABLE_SORT.direction,
};

const BETS_PAGE_SIZE = 50;
let betsCurrentPage = 1;
const betsPagePrevButton = document.getElementById("bets-page-prev");
const betsPageNextButton = document.getElementById("bets-page-next");
const betsPageInfo = document.getElementById("bets-page-info");

// Modal elements
const dayModal = document.getElementById("day-modal");
const modalTitle = document.getElementById("modal-title");
const modalSummary = document.getElementById("modal-summary");
const modalBetsList = document.getElementById("modal-bets-list");
const modalClose = document.getElementById("modal-close");

let bets = [];
let cashflows = [];
let editingId = null;
let deletePendingId = null;
let balanceChart = null;
let miniProfitChart = null;
let baseBankroll = null;
let settings = null;
let categories = [];

function applyTheme(theme) {
  const html = document.documentElement;
  const allowed = ["dark", "light-azulado", "light", "light-bege"];
  const resolved = allowed.includes(theme) ? theme : "dark";
  html.classList.remove("light", "dark", "light-azulado", "light-bege");
  html.classList.add(resolved);
  localStorage.setItem(THEME_KEY, resolved);

  const toggle = document.getElementById("theme-toggle");
  if (toggle) {
    if (resolved === "dark") toggle.textContent = "🌙";
    if (resolved === "light-azulado") toggle.textContent = "🧊";
    if (resolved === "light") toggle.textContent = "☀️";
    if (resolved === "light-bege") toggle.textContent = "🏖️";
    toggle.setAttribute("aria-label", `Alterar tema (atual: ${resolved})`);
  }
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "dark" || saved === "light" || saved === "light-azulado" || saved === "light-bege") {
    applyTheme(saved);
    return;
  }
  const preferredDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(preferredDark ? "dark" : "light-azulado");
}

function toggleTheme() {
  const html = document.documentElement;
  const themeOrder = ["dark", "light-azulado", "light", "light-bege"];
  // Destroy charts so they are recreated with correct theme colors
  if (typeof miniProfitChart !== "undefined" && miniProfitChart) {
    miniProfitChart.destroy();
    miniProfitChart = null;
  }
  if (typeof balanceChart !== "undefined" && balanceChart) {
    balanceChart.destroy();
    balanceChart = null;
  }
  const currentTheme = themeOrder.find((themeName) => html.classList.contains(themeName)) || "dark";
  const nextTheme = themeOrder[(themeOrder.indexOf(currentTheme) + 1) % themeOrder.length];
  applyTheme(nextTheme);
  refreshAll();
}
//calma
async function loadBets() {
  try {
    const profileId = getActiveProfileId();
    
    const resposta = await fetch('api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'carregar_apostas', profile_id: profileId })
    });

    // Em vez de transformar logo em JSON, lemos como texto bruto
    const textoBruto = await resposta.text();
    
    try {
      // Tentamos converter para JSON
      const dados = JSON.parse(textoBruto);
      
      bets = dados.map((bet) => ({
        ...bet,
        stake: Number(bet.stake),
        odds: Number(bet.odds),
        isFreebet: Boolean(bet.isFreebet || bet.freebet),
          isBoost: Boolean(bet.isBoost || bet.is_boost || bet.boost),
        cashout_value: bet.cashout_value != null ? Number(bet.cashout_value) : null
      }));
      
    } catch (erroJson) {
      // Se falhar, mostramos exatamente o que o PHP nos enviou!
      console.error("🚨 O PHP não devolveu JSON. Ele respondeu exatamente isto:", textoBruto);
      bets = []; 
    }

  } catch (erro) {
    console.error("Erro de comunicação com a API:", erro);
    Shell.showApiError?.("Nao foi possivel carregar apostas da API.");
    bets = []; 
  }
}

//calma
async function loadCashflows() {
  try {
    const profileId = getActiveProfileId();
    const resposta = await fetch('api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'carregar_fluxo', profile_id: profileId })
    });
    const dados = await resposta.json();
    cashflows = dados.map((flow) => ({
      ...flow,
      amount: Number(flow.amount),
    }));
  } catch (erro) {
    console.error("Erro ao carregar fluxo na página principal:", erro);
    Shell.showApiError?.("Nao foi possivel carregar o fluxo de caixa da API.");
    cashflows = [];
  }
}

async function loadCategories() {
  try {
    const profileId = getActiveProfileId();
    const resposta = await fetch('api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'carregar_categorias', profile_id: profileId })
    });
    const dados = await resposta.json();
    categories = Array.isArray(dados) ? dados : [];
  } catch (erro) {
    console.error("Erro ao carregar categorias:", erro);
    Shell.showApiError?.("Nao foi possivel carregar categorias da API.");
    categories = [];
  }
}

function renderCategorySelects() {
  const formSelect = document.getElementById("bet-category");
  const filterSelect = document.getElementById("category-filter");

  if (formSelect) {
    const currentVal = formSelect.value;
    formSelect.innerHTML = '<option value="">Sem categoria</option>';
    categories.forEach((cat) => {
      const opt = document.createElement("option");
      opt.value = cat.name;
      opt.textContent = `${cat.icon || '🏅'} ${cat.name}`;
      formSelect.appendChild(opt);
    });
    if (currentVal) formSelect.value = currentVal;
  }

  if (filterSelect) {
    const currentVal = filterSelect.value || "all";
    filterSelect.innerHTML = '<option value="all">Todas</option>';
    categories.forEach((cat) => {
      const opt = document.createElement("option");
      opt.value = cat.name;
      opt.textContent = `${cat.icon || '🏅'} ${cat.name}`;
      filterSelect.appendChild(opt);
    });
    // Add "Sem categoria" option for filter
    const noCatOpt = document.createElement("option");
    noCatOpt.value = "__none__";
    noCatOpt.textContent = "Sem categoria";
    filterSelect.appendChild(noCatOpt);
    filterSelect.value = currentVal;
  }
}

function loadSettings() {
  const defaultSettings = {
    profile: { name: "", goal: null },
    display: {
      showCalendar: true,
      showChart: true,
      showBankroll: true,
      showKpis: true,
      showAiSuggestions: true,
      showPotentialProfit: true,
      showTablePotential: true,
      showRoi: true,
      showAvgOdd: true,
      showAvgStake: true,
      showTotalStake: true,
      showTotalBets: true,
      showStreak: true,
      showStakedPeriod: true,
      maxStakePct: 5,
    },
    columns: {
      date: true,
      event: true,
      odds: true,
      stake: true,
      status: true,
      profit: true,
      potential: true,
      book: true,
    },
    favorites: [],
    aiOptions: [...DEFAULT_AI_OPTIONS],
    defaults: {
      status: "pending",
      filter: "pending",
      stakeType: "regular",
    },
  };

  const raw = localStorage.getItem(getSettingsKey());
  if (raw) {
    try {
      const saved = JSON.parse(raw);
      settings = { ...defaultSettings, ...saved };
      settings.profile = { ...defaultSettings.profile, ...saved.profile };
      settings.display = { ...defaultSettings.display, ...saved.display };
      settings.columns = { ...defaultSettings.columns, ...saved.columns };
      settings.defaults = { ...defaultSettings.defaults, ...saved.defaults };
      settings.favorites = saved.favorites || [];
      settings.aiOptions = sanitizeAiOptions(saved.aiOptions);
    } catch (e) {
      settings = defaultSettings;
      settings.aiOptions = [...DEFAULT_AI_OPTIONS];
    }
  } else {
    settings = defaultSettings;
    settings.aiOptions = [...DEFAULT_AI_OPTIONS];
  }
}

function applySettings() {
  if (!settings) return;

  // Apply display settings
  const calendarSection = document.querySelector('.panel.full:has(#calendar-container)');
  const chartGrid = document.querySelector('.chart-grid');
  const bankManagement = document.querySelector('.bank-management');
  const kpiGrid = document.querySelector('.kpi-grid');
  const potentialProfitContainer = potentialProfitEl?.closest('div');
  const aiSuggestionsContainer = document.getElementById('bet-ai-selector')?.closest('label');
  const aiRankingContainer = document.getElementById('ai-ranking-container');

  // KPI containers individuais
  const kpiRoiContainer = document.getElementById('kpi-roi-container');
  const kpiAvgOddContainer = document.getElementById('kpi-avg-odd-container');
  const kpiAvgStakeContainer = document.getElementById('kpi-avg-stake-container');
  const kpiTotalStakeContainer = document.getElementById('kpi-total-stake-container');
  const kpiTotalBetsContainer = document.getElementById('kpi-total-bets-container');
  const kpiStreakContainer = document.getElementById('kpi-streak-container');

  if (calendarSection) {
    calendarSection.style.display = settings.display.showCalendar ? '' : 'none';
  }
  if (chartGrid) {
    chartGrid.style.display = settings.display.showChart ? '' : 'none';
  }
  if (bankManagement) {
    bankManagement.style.display = settings.display.showBankroll ? '' : 'none';
  }
  if (kpiGrid) {
    kpiGrid.style.display = settings.display.showKpis ? '' : 'none';
  }
  if (aiSuggestionsContainer) {
    aiSuggestionsContainer.style.display = settings.display.showAiSuggestions !== false ? '' : 'none';
  }
  if (aiRankingContainer) {
    aiRankingContainer.style.display = settings.display.showAiSuggestions !== false ? '' : 'none';
  }
  if (potentialProfitContainer) {
    potentialProfitContainer.style.display = settings.display.showPotentialProfit ? '' : 'none';
  }

  // Novos KPIs individuais
  if (kpiRoiContainer) {
    kpiRoiContainer.style.display = settings.display.showRoi ? '' : 'none';
  }
  if (kpiAvgOddContainer) {
    kpiAvgOddContainer.style.display = settings.display.showAvgOdd ? '' : 'none';
  }
  if (kpiAvgStakeContainer) {
    kpiAvgStakeContainer.style.display = settings.display.showAvgStake ? '' : 'none';
  }
  if (kpiTotalStakeContainer) {
    kpiTotalStakeContainer.style.display = settings.display.showTotalStake ? '' : 'none';
  }
  if (kpiTotalBetsContainer) {
    kpiTotalBetsContainer.style.display = settings.display.showTotalBets ? '' : 'none';
  }
  if (kpiStreakContainer) {
    kpiStreakContainer.style.display = settings.display.showStreak ? '' : 'none';
  }

  // Painel de Total Apostado por Período
  const stakedPeriodContainer = document.getElementById('staked-period-container');
  if (stakedPeriodContainer) {
    stakedPeriodContainer.style.display = settings.display.showStakedPeriod !== false ? '' : 'none';
  }

  // Apply default status filter
  if (statusFilter && settings.defaults.filter) {
    statusFilter.value = settings.defaults.filter;
  }

  // Apply default status to form
  const betStatus = document.getElementById("bet-status");
  if (betStatus && settings.defaults.status) {
    betStatus.value = settings.defaults.status;
  }

  // Apply default stake type
  const betStakeType = document.getElementById("bet-stake-type");
  if (betStakeType && settings.defaults.stakeType) {
    betStakeType.value = settings.defaults.stakeType;
  }

  // Apply favorites to book input (datalist)
  const bookInput = document.getElementById("bet-book");
  if (bookInput && settings.favorites.length > 0) {
    let datalist = document.getElementById("book-datalist");
    if (!datalist) {
      datalist = document.createElement("datalist");
      datalist.id = "book-datalist";
      document.body.appendChild(datalist);
      bookInput.setAttribute("list", "book-datalist");
    }
    datalist.innerHTML = settings.favorites
      .map((fav) => `<option value="${fav}">`)
      .join("");
  }

  renderAiSelectorOptions("bet-ai-selector");
}

async function loadBankrollBase() {
  try {
    const resposta = await fetch('api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'carregar_dados_extras', profile_id: getActiveProfileId() })
    });
    const json = await resposta.json();
    baseBankroll = (json.sucesso && json.dados && json.dados.bankroll !== null) ? Number(json.dados.bankroll) : null;
  } catch (e) { baseBankroll = null; }
}

async function saveBankrollBase() {
  if (Number.isFinite(baseBankroll)) {
    await fetch('api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'salvar_dados_extras', profile_id: getActiveProfileId(), tipo: 'bankroll', valor: String(baseBankroll) })
    });
  }
}

function saveBets() {
  localStorage.setItem(getStorageKey(), JSON.stringify(bets));
}

function saveCashflows() {
  localStorage.setItem(getCashflowKey(), JSON.stringify(cashflows));
}

function normalizeAiName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function sanitizeAiOptions(options) {
  const source = Array.isArray(options) ? options : [];
  const unique = [];
  const seen = new Set();

  source.forEach((item) => {
    const name = normalizeAiName(item);
    if (!name) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(name);
  });

  return unique.length ? unique : [...DEFAULT_AI_OPTIONS];
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function syncAiChipStates(container) {
  if (!container) return;
  container.querySelectorAll(".ai-chip").forEach((chip) => {
    const input = chip.querySelector("input[type='checkbox']");
    chip.classList.toggle("ai-chip--active", Boolean(input?.checked));
  });
}

function renderAiSelectorOptions(containerId = "bet-ai-selector") {
  const container = document.getElementById(containerId);
  if (!container) return;

  const selected = getSelectedAIs(containerId);
  const options = sanitizeAiOptions(settings?.aiOptions);

  container.innerHTML = options
    .map((name) => `<label class="ai-chip"><input type="checkbox" value="${escapeHtml(name)}" />${escapeHtml(name)}</label>`)
    .join("");

  setSelectedAIs(containerId, selected);
  syncAiChipStates(container);
}

// ========================
// MULTI-AI HELPERS
// ========================
function getSelectedAIs(containerId) {
  if (containerId === "bet-ai-selector" && settings?.display?.showAiSuggestions === false) {
    return "";
  }
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
    cb.closest(".ai-chip")?.classList.toggle("ai-chip--active", cb.checked);
  });
}

function formatAITags(aisString) {
  if (!aisString) return "-";
  return aisString.split(",").map(ai => {
    const span = document.createElement("span");
    span.className = "fbet-ai";
    span.textContent = ai.trim();
    return span;
  });
}

function formatStake(value) {
  return formatCurrencyBRL(value);
}

function formatProfit(value) {
  return formatCurrencyBRL(value);
}

function getThemeColor(variableName, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
  return value || fallback;
}

function calcProfit(bet) {
  if (bet.status === "win") {
    return bet.stake * (bet.odds - 1);
  }
  if (bet.status === "loss") {
    return bet.isFreebet ? 0 : -bet.stake;
  }
  if (bet.status === "cashout") {
    const cashoutVal = Number(bet.cashout_value) || 0;
    return bet.isFreebet ? cashoutVal : cashoutVal - bet.stake;
  }
  if (bet.status === "void") {
    return 0;
  }
  return 0;
}

function calcPotentialProfit(stake, odds) {
  if (!Number.isFinite(stake) || !Number.isFinite(odds)) {
    return 0;
  }
  return stake * (odds - 1);
}

function calcKelly(winRate, odds, bankroll) {
  const b = odds - 1;
  const p = winRate / 100;
  const q = 1 - p;
  if (!Number.isFinite(b) || b <= 0 || !Number.isFinite(bankroll) || bankroll <= 0) {
    return { fraction: 0, suggested: 0 };
  }
  const fraction = (p * b - q) / b;
  const suggested = Math.max(0, fraction) * bankroll;
  return { fraction: fraction * 100, suggested };
}

function getSettledBetsByMonth(dateRef) {
  return bets.filter((bet) => {
    if (bet.status !== "win" && bet.status !== "loss" && bet.status !== "cashout" && bet.status !== "void") {
      return false;
    }
    const date = parseDateForSort(bet.date);
    return date && date.getMonth() === dateRef.getMonth() && date.getFullYear() === dateRef.getFullYear();
  });
}

function calculateMonthlyDelta(metric) {
  const now = new Date();
  const currentRef = new Date(now.getFullYear(), now.getMonth(), 1);
  const previousRef = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const currentList = getSettledBetsByMonth(currentRef);
  const previousList = getSettledBetsByMonth(previousRef);

  const extractMetric = (list) => {
    if (metric === "profit") {
      return list.reduce((sum, bet) => sum + calcProfit(bet), 0);
    }
    if (metric === "winrate") {
      if (!list.length) return 0;
      const wins = list.filter((bet) => bet.status === "win" || bet.status === "cashout").length;
      return wins / list.length;
    }
    if (metric === "roi") {
      const totalStake = list.reduce((sum, bet) => sum + bet.stake, 0);
      if (!totalStake) return 0;
      return list.reduce((sum, bet) => sum + calcProfit(bet), 0) / totalStake;
    }
    if (metric === "avgOdd") {
      if (!list.length) return 0;
      return list.reduce((sum, bet) => sum + bet.odds, 0) / list.length;
    }
    return 0;
  };

  const current = extractMetric(currentList);
  const previous = extractMetric(previousList);
  const delta = current - previous;
  const deltaPercent = previous !== 0 ? (delta / Math.abs(previous)) * 100 : (current !== 0 ? 100 : 0);

  return { current, previous, delta, deltaPercent };
}

function formatDeltaText(deltaValue, suffix, monthLabel) {
  if (!Number.isFinite(deltaValue) || deltaValue === 0) {
    return `= igual vs. ${monthLabel}`;
  }
  const prefix = deltaValue > 0 ? "▲" : "▼";
  const absValue = Math.abs(deltaValue);
  return `${prefix} ${numberFormatter.format(absValue)}${suffix} vs. ${monthLabel}`;
}

function updateFormInsights() {
  const kellyEl = document.getElementById("kelly-hint");
  const alertEl = document.getElementById("bankroll-alert");
  const stake = parseLocaleNumber(document.getElementById("bet-stake")?.value || "");
  const odds = parseLocaleNumber(document.getElementById("bet-odds")?.value || "");
  const bankroll = getEffectiveBankroll();

  if (kellyEl) {
    const settled = bets.filter((bet) => bet.status === "win" || bet.status === "loss" || bet.status === "cashout" || bet.status === "void");
    const wins = settled.filter((bet) => bet.status === "win" || bet.status === "cashout").length;
    const winRate = settled.length ? (wins / settled.length) * 100 : 0;

    if (Number.isFinite(stake) && Number.isFinite(odds) && Number.isFinite(bankroll) && bankroll > 0 && winRate > 0) {
      const kelly = calcKelly(winRate, odds, bankroll);
      kellyEl.textContent = `Kelly sugere ${formatProfit(kelly.suggested)} (${numberFormatter.format(Math.max(0, kelly.fraction))}% da banca de ${formatProfit(bankroll)})`;
      kellyEl.classList.add("visible");
    } else {
      kellyEl.classList.remove("visible");
      kellyEl.textContent = "";
    }
  }

  if (alertEl) {
    const maxStakePct = Number(settings?.display?.maxStakePct ?? 5);
    if (Number.isFinite(stake) && stake > 0 && Number.isFinite(bankroll) && bankroll > 0) {
      const pct = (stake / bankroll) * 100;
      if (pct > maxStakePct) {
        alertEl.textContent = `Stake de ${formatProfit(stake)} representa ${numberFormatter.format(pct)}% da banca - acima do limite de ${numberFormatter.format(maxStakePct)}%.`;
        alertEl.classList.add("visible");
      } else {
        alertEl.classList.remove("visible");
        alertEl.textContent = "";
      }
    } else {
      alertEl.classList.remove("visible");
      alertEl.textContent = "";
    }
  }
}

function calcSettledProfit(list = bets) {
  return list
    .filter((bet) => bet.status === "win" || bet.status === "loss" || bet.status === "cashout" || bet.status === "void")
    .reduce((sum, bet) => sum + calcProfit(bet), 0);
}

function calcCashflowTotal(list = cashflows) {
  return list.reduce((sum, flow) => {
    if (flow.type === "deposit") {
      return sum + flow.amount;
    }
    if (flow.type === "withdraw") {
      return sum - flow.amount;
    }
    return sum;
  }, 0);
}

function calcTotalDeposits(list = cashflows) {
  return list
    .filter((flow) => flow.type === "deposit")
    .reduce((sum, flow) => sum + flow.amount, 0);
}

function calcTotalWithdraws(list = cashflows) {
  return list
    .filter((flow) => flow.type === "withdraw")
    .reduce((sum, flow) => sum + flow.amount, 0);
}

function getEffectiveBankroll() {
  if (!Number.isFinite(baseBankroll)) {
    return null;
  }
  return baseBankroll + calcSettledProfit() + calcCashflowTotal();
}

function updateBankrollDisplay() {
  const effective = getEffectiveBankroll();
  if (!Number.isFinite(effective)) {
    return;
  }
  bankrollInput.value = numberFormatter.format(effective);
  
  // Atualiza indicadores de depósitos, saques e lucro
  const totalDeposits = calcTotalDeposits();
  const totalWithdraws = calcTotalWithdraws();
  const settledProfit = calcSettledProfit();
  
  if (bankrollDeposits) {
    bankrollDeposits.textContent = `${formatProfit(totalDeposits)} depósitos`;
  }
  if (bankrollWithdraws) {
    bankrollWithdraws.textContent = `${formatProfit(-totalWithdraws)} saques`;
  }
  if (bankrollProfitIndicator) {
    bankrollProfitIndicator.textContent = `${formatProfit(settledProfit)} lucro`;
    bankrollProfitIndicator.className = `breakdown-item ${settledProfit >= 0 ? 'positive' : 'negative'}`;
  }
}

function formatDateDisplay(value) {
  if (!value) {
    return "";
  }
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${day}/${month}/${year}`;
  }
  const brMatch = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    return value;
  }
  return "";
}

function formatDateForInput(value) {
  if (!value) {
    return "";
  }
  const brMatch = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    const [, day, month, year] = brMatch;
    return `${year}-${month}-${day}`;
  }
  return value;
}

function parseDateForSort(value) {
  if (!value) {
    return null;
  }
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

function updatePotentialProfit() {
  const stake = parseLocaleNumber(document.getElementById("bet-stake").value);
  const odds = parseLocaleNumber(document.getElementById("bet-odds").value);
  const value = calcPotentialProfit(stake, odds);
  if (potentialProfitEl) {
    potentialProfitEl.textContent = formatProfit(value);
  }
  updateFormInsights();
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getSearchTokens(query) {
  const normalized = normalizeSearchText(query);
  if (!normalized) return [];
  return normalized.split(/\s+/).filter(Boolean);
}

function getSearchableBetText(bet) {
  const statusMap = {
    pending: "aberta pending",
    win: "green ganhou win",
    loss: "red perdeu loss",
    void: "void devolvida",
    cashout: "cashout",
  };

  return normalizeSearchText([
    bet.date,
    bet.event,
    bet.book,
    bet.category,
    bet.ai,
    statusMap[bet.status] || bet.status,
  ].join(" "));
}

function filterByTextSearch(data) {
  const tokens = getSearchTokens(betSearchInput?.value || "");
  if (!tokens.length) return data;

  return data.filter((bet) => {
    const searchable = getSearchableBetText(bet);
    return tokens.every((token) => searchable.includes(token));
  });
}

function getSortValue(bet, key) {
  switch (key) {
    case "date": {
      const parsed = parseDateForSort(bet.date);
      return parsed ? parsed.getTime() : Number.NEGATIVE_INFINITY;
    }
    case "event":
      return normalizeSearchText(bet.event);
    case "odds":
      return Number.isFinite(bet.odds) ? bet.odds : Number.NEGATIVE_INFINITY;
    case "stake":
      return Number.isFinite(bet.stake) ? bet.stake : Number.NEGATIVE_INFINITY;
    case "status":
      return normalizeSearchText(statusLabel(bet.status));
    case "profit":
      return calcProfit(bet);
    case "potentialProfit":
      return calcPotentialProfit(bet.stake, bet.odds);
    case "book":
      return normalizeSearchText(bet.book);
    case "category":
      return normalizeSearchText(bet.category);
    case "ai":
      return normalizeSearchText(bet.ai);
    default:
      return "";
  }
}

function sortBets(data) {
  const directionMultiplier = tableSortState.direction === "asc" ? 1 : -1;
  const key = tableSortState.key;

  return [...data].sort((a, b) => {
    const aValue = getSortValue(a, key);
    const bValue = getSortValue(b, key);

    let comparison = 0;
    if (typeof aValue === "number" && typeof bValue === "number") {
      comparison = aValue - bValue;
    } else {
      comparison = String(aValue).localeCompare(String(bValue), "pt-BR", {
        sensitivity: "base",
        numeric: true,
      });
    }

    if (comparison === 0) {
      const fallbackA = parseDateForSort(a.date)?.getTime() || 0;
      const fallbackB = parseDateForSort(b.date)?.getTime() || 0;
      comparison = fallbackA - fallbackB;
    }

    return comparison * directionMultiplier;
  });
}

function getVisibleBets() {
  const filtered = getFilteredBets();
  const searched = filterByTextSearch(filtered);
  return sortBets(searched);
}

function updateSortHeaders() {
  const headers = document.querySelectorAll("#bets-table-head th.sortable-header");
  headers.forEach((header) => {
    const isActive = header.dataset.sortKey === tableSortState.key;
    const indicator = header.querySelector(".sort-indicator");
    header.classList.toggle("sorted", isActive);

    if (!isActive) {
      header.setAttribute("aria-sort", "none");
      if (indicator) indicator.textContent = "↕";
      return;
    }

    const isAsc = tableSortState.direction === "asc";
    header.setAttribute("aria-sort", isAsc ? "ascending" : "descending");
    if (indicator) indicator.textContent = isAsc ? "▲" : "▼";
  });
}

function handleTableSortClick(event) {
  const header = event.target.closest("th.sortable-header[data-sort-key]");
  if (!header) return;

  const nextKey = header.dataset.sortKey;
  if (!nextKey) return;

  if (tableSortState.key === nextKey) {
    tableSortState.direction = tableSortState.direction === "asc" ? "desc" : "asc";
  } else {
    tableSortState.key = nextKey;
    tableSortState.direction = nextKey === "date" ? "desc" : "asc";
  }

  refreshAll();
}

function applyTableStateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const rawQuery = params.get("q") || "";
  const rawSort = params.get("sort");
  const rawDir = params.get("dir");

  if (betSearchInput) {
    betSearchInput.value = rawQuery;
  }

  const sortKey = ALLOWED_SORT_KEYS.has(rawSort) ? rawSort : DEFAULT_TABLE_SORT.key;
  const sortDir = ALLOWED_SORT_DIRECTIONS.has(rawDir) ? rawDir : DEFAULT_TABLE_SORT.direction;
  tableSortState = { key: sortKey, direction: sortDir };
}

function syncTableStateToUrl() {
  const params = new URLSearchParams(window.location.search);
  const query = (betSearchInput?.value || "").trim();
  const isDefaultSort = tableSortState.key === DEFAULT_TABLE_SORT.key && tableSortState.direction === DEFAULT_TABLE_SORT.direction;

  if (query) params.set("q", query);
  else params.delete("q");

  if (isDefaultSort) {
    params.delete("sort");
    params.delete("dir");
  } else {
    params.set("sort", tableSortState.key);
    params.set("dir", tableSortState.direction);
  }

  const search = params.toString();
  const nextUrl = `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  if (nextUrl !== currentUrl) {
    history.replaceState(null, "", nextUrl);
  }
}

function getFilteredBets() {
  const selected = bookFilter.value;
  const status = statusFilter?.value || "all";
  const startDate = dateFilterStart?.value ? parseDateForSort(dateFilterStart.value) : null;
  const endDate = dateFilterEnd?.value ? parseDateForSort(dateFilterEnd.value) : null;
  const categoryFilter = document.getElementById("category-filter")?.value || "all";
  const boostFilterValue = boostFilter?.value || "all";

  return bets.filter((bet) => {
    // Filtro por casa
    const matchBook = !selected || selected === "all" || bet.book === selected;

    // Filtro por status
    let matchStatus = true;
    if (status === "pending") {
      matchStatus = bet.status === "pending";
    } else if (status === "settled") {
      matchStatus = bet.status === "win" || bet.status === "loss" || bet.status === "cashout" || bet.status === "void";
    }

    // Filtro por data
    let matchDate = true;
    if (startDate || endDate) {
      const betDate = parseDateForSort(bet.date);
      if (betDate) {
        if (startDate && betDate < startDate) {
          matchDate = false;
        }
        if (endDate && betDate > endDate) {
          matchDate = false;
        }
      } else {
        matchDate = false;
      }
    }

    // Filtro por categoria
    let matchCategory = true;
    if (categoryFilter !== "all") {
      if (categoryFilter === "__none__") {
        matchCategory = !bet.category;
      } else {
        matchCategory = bet.category === categoryFilter;
      }
    }

    let matchBoost = true;
    if (boostFilterValue === "boost") {
      matchBoost = Boolean(bet.isBoost);
    } else if (boostFilterValue === "no-boost") {
      matchBoost = !Boolean(bet.isBoost);
    }

    return matchBook && matchStatus && matchDate && matchCategory && matchBoost;
  });
}

function getBoostScopedBets() {
  const boostFilterValue = boostFilter?.value || "all";
  if (boostFilterValue === "boost") {
    return bets.filter((bet) => Boolean(bet.isBoost));
  }
  if (boostFilterValue === "no-boost") {
    return bets.filter((bet) => !Boolean(bet.isBoost));
  }
  return bets;
}

function renderBookFilter() {
  const books = Array.from(new Set(bets.map((bet) => bet.book))).sort();
  const current = bookFilter.value || "all";
  bookFilter.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "Todas";
  bookFilter.appendChild(allOption);

  books.forEach((book) => {
    const option = document.createElement("option");
    option.value = book;
    option.textContent = book;
    bookFilter.appendChild(option);
  });

  bookFilter.value = books.includes(current) ? current : "all";
}

function renderTable() {
  const data = getVisibleBets();
  const openCount = document.getElementById("open-count");
  const totalOpen = bets.filter((bet) => bet.status === "pending").length;
  if (openCount) openCount.textContent = String(totalOpen);

  if (betsBody) betsBody.innerHTML = "";
  if (betsMobileList) betsMobileList.innerHTML = "";

  if (data.length === 0) {
    const hasSearch = getSearchTokens(betSearchInput?.value || "").length > 0;
    const emptyMessage = hasSearch ? "Nenhuma aposta encontrada para essa busca." : "Nenhuma aposta cadastrada ainda.";

    if (betsBody) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 11;
      cell.textContent = emptyMessage;
      row.appendChild(cell);
      betsBody.appendChild(row);
    }
    if (betsMobileList) {
      betsMobileList.innerHTML = `<div class="bet-card"><div class="bet-card-event">${emptyMessage}</div></div>`;
    }
    updateSortHeaders();
    renderBetsPagination(0, 0, 0, 0);
    return;
  }

  const totalItems = data.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / BETS_PAGE_SIZE));
  if (betsCurrentPage > totalPages) betsCurrentPage = totalPages;
  if (betsCurrentPage < 1) betsCurrentPage = 1;
  const startIndex = (betsCurrentPage - 1) * BETS_PAGE_SIZE;
  const endIndex = Math.min(startIndex + BETS_PAGE_SIZE, totalItems);
  const pageData = data.slice(startIndex, endIndex);

  pageData.forEach((bet) => {
    const profit = calcProfit(bet);
    const potentialProfit = calcPotentialProfit(bet.stake, bet.odds);
    const statusClass = `status-badge ${bet.status}`;
    const freebetBadge = bet.isFreebet ? '<span class="stake-type-badge">Grátis</span>' : "";
    const boostBadge = bet.isBoost ? '<span class="stake-type-badge boost">Boost</span>' : "";
    const stakeBadges = `${freebetBadge}${boostBadge}`;

    if (betsBody) {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${bet.date}</td>
        <td><strong>${bet.event}</strong></td>
        <td>${numberFormatter.format(bet.odds)}x</td>
        <td><div class="stake-cell">${formatStake(bet.stake)}${stakeBadges}</div></td>
        <td><span class="${statusClass}">${statusLabel(bet.status)}</span></td>
        <td>${formatProfit(profit)}</td>
        <td>${formatProfit(potentialProfit)}</td>
        <td>${bet.book || "-"}</td>
        <td>${bet.category || "-"}</td>
        <td>${bet.ai || "-"}</td>
        <td>
          ${bet.status === "pending" ? `
            <button type="button" class="quick-action green" data-action="resolve-win" data-id="${bet.id}">✓ Green</button>
            <button type="button" class="quick-action red" data-action="resolve-loss" data-id="${bet.id}">✗ Red</button>
            <button type="button" class="quick-action cash" data-action="toggle-cash" data-id="${bet.id}">$ Cash</button>
            <button type="button" class="quick-action" data-action="edit" data-id="${bet.id}">...</button>
            <button type="button" class="quick-action" data-action="clone" data-id="${bet.id}">Clonar</button>
            <button type="button" class="quick-action danger" data-action="delete" data-id="${bet.id}">Apagar</button>
            <div class="inline-cashout" id="cashout-inline-${bet.id}" style="display:none;">
              <input type="text" inputmode="decimal" placeholder="Valor" id="cashout-value-${bet.id}" />
              <button type="button" class="quick-action" data-action="confirm-cash" data-id="${bet.id}">Confirmar</button>
            </div>
          ` : `
            <button type="button" class="quick-action" data-action="edit" data-id="${bet.id}">...</button>
            <button type="button" class="quick-action" data-action="clone" data-id="${bet.id}">Clonar</button>
            <button type="button" class="quick-action danger" data-action="delete" data-id="${bet.id}">Apagar</button>
          `}
        </td>
      `;
      betsBody.appendChild(row);
    }

    if (betsMobileList) {
      const card = document.createElement("article");
      card.className = "bet-card";
      card.innerHTML = `
        <div class="bet-card-head">
          <strong class="bet-card-event">${bet.event}</strong>
          <span class="${statusClass}">${statusLabel(bet.status)}</span>
        </div>
        <div class="bet-card-meta">
          <span>${numberFormatter.format(bet.odds)}x Odd</span>
          <span>${formatStake(bet.stake)} Stake</span>
          <span>${formatProfit(potentialProfit)} Potencial</span>
          ${stakeBadges}
        </div>
        <div class="bet-card-actions">
          ${bet.status === "pending" ? `
            <button type="button" class="quick-action green" data-action="resolve-win" data-id="${bet.id}">✓ Green</button>
            <button type="button" class="quick-action red" data-action="resolve-loss" data-id="${bet.id}">✗ Red</button>
            <button type="button" class="quick-action cash" data-action="toggle-cash" data-id="${bet.id}">$ Cash</button>
          ` : ""}
          <button type="button" class="quick-action" data-action="edit" data-id="${bet.id}">...</button>
          <button type="button" class="quick-action" data-action="clone" data-id="${bet.id}">Clonar</button>
          <button type="button" class="quick-action danger" data-action="delete" data-id="${bet.id}">Apagar</button>
        </div>
        ${bet.status === "pending" ? `
          <div class="inline-cashout" id="cashout-inline-mobile-${bet.id}" style="display:none;">
            <input type="text" inputmode="decimal" placeholder="Valor" id="cashout-value-mobile-${bet.id}" />
            <button type="button" class="quick-action" data-action="confirm-cash" data-id="${bet.id}">Confirmar</button>
          </div>
        ` : ""}
      `;
      betsMobileList.appendChild(card);
    }
  });

  updateSortHeaders();
  renderBetsPagination(startIndex + 1, endIndex, totalItems, totalPages);
}

function renderBetsPagination(start, end, totalItems, totalPages) {
  if (betsPageInfo) {
    betsPageInfo.textContent = `Mostrando ${start}-${end} de ${totalItems}`;
  }

  if (betsPagePrevButton) {
    betsPagePrevButton.disabled = betsCurrentPage <= 1 || totalItems === 0;
  }

  if (betsPageNextButton) {
    betsPageNextButton.disabled = betsCurrentPage >= totalPages || totalItems === 0;
  }
}

function resetBetsPagination() {
  betsCurrentPage = 1;
}

function resetBetsPaginationAndRefresh() {
  resetBetsPagination();
  refreshAll();
}

function statusLabel(status) {
  const map = {
    pending: "Aberta",
    win: "Green",
    loss: "Red",
    void: "Void",
    cashout: "Cashout",
  };
  return map[status] || status;
}

function renderKpis() {
  const scopedBets = getBoostScopedBets();
  const allSettled = scopedBets.filter((bet) => bet.status === "win" || bet.status === "loss" || bet.status === "cashout" || bet.status === "void");
  const totalStake = allSettled.reduce((sum, bet) => sum + bet.stake, 0);
  const totalProfit = allSettled.reduce((sum, bet) => sum + calcProfit(bet), 0);
  const wins = allSettled.filter((bet) => bet.status === "win" || bet.status === "cashout").length;
  const winrate = allSettled.length ? wins / allSettled.length : 0;

  // ROI = Lucro / Total Apostado
  const roi = totalStake > 0 ? totalProfit / totalStake : 0;

  // Odd média
  const avgOdd = allSettled.length > 0 
    ? allSettled.reduce((sum, bet) => sum + bet.odds, 0) / allSettled.length 
    : 0;

  // Ticket médio (stake média)
  const avgStake = allSettled.length > 0 ? totalStake / allSettled.length : 0;

  const currentStreak = calcCurrentStreak(scopedBets);

  kpiProfit.textContent = formatProfit(totalProfit);
  kpiWinrate.textContent = percentFormatter.format(winrate);
  
  if (kpiRoi) kpiRoi.textContent = percentFormatter.format(roi);
  if (kpiAvgOdd) kpiAvgOdd.textContent = `${numberFormatter.format(avgOdd)}x`;
  if (kpiAvgStake) kpiAvgStake.textContent = formatStake(avgStake);
  if (kpiTotalStake) kpiTotalStake.textContent = formatStake(totalStake);
  if (kpiTotalBets) kpiTotalBets.textContent = allSettled.length;
  if (kpiStreak) {
    if (currentStreak.count === 0) {
      kpiStreak.textContent = "-";
      kpiStreak.className = "";
    } else {
      const streakEmoji = currentStreak.type === "win" ? "🟢" : "🔴";
      kpiStreak.textContent = `${streakEmoji} ${currentStreak.count}`;
      kpiStreak.className = currentStreak.type === "win" ? "positive" : "negative";
    }
  }

  // Renderizar Total Apostado por Período
  renderStakedPeriod();
}

function renderStakedPeriod() {
  const stakedToday = document.getElementById('staked-today');
  const stakedWeek = document.getElementById('staked-week');
  const stakedMonth = document.getElementById('staked-month');
  const stakedYear = document.getElementById('staked-year');

  if (!stakedToday || !stakedWeek || !stakedMonth || !stakedYear) return;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  // Início da semana (domingo)
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  
  // Início do mês
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  
  // Início do ano
  const yearStart = new Date(now.getFullYear(), 0, 1);

  let totalToday = 0;
  let totalWeek = 0;
  let totalMonth = 0;
  let totalYear = 0;

  bets.forEach((bet) => {
    const betDate = parseDateForSort(bet.date);
    if (!betDate) return;
    
    const stake = bet.stake || 0;

    // Hoje
    if (betDate >= today) {
      totalToday += stake;
    }
    // Esta semana
    if (betDate >= weekStart) {
      totalWeek += stake;
    }
    // Este mês
    if (betDate >= monthStart) {
      totalMonth += stake;
    }
    // Este ano
    if (betDate >= yearStart) {
      totalYear += stake;
    }
  });

  stakedToday.textContent = formatStake(totalToday);
  stakedWeek.textContent = formatStake(totalWeek);
  stakedMonth.textContent = formatStake(totalMonth);
  stakedYear.textContent = formatStake(totalYear);
}

function calcCurrentStreak(data) {
  // Ordenar por data (mais recente primeiro)
  const sorted = data
    .filter((bet) => bet.status === "win" || bet.status === "loss" || bet.status === "cashout" || bet.status === "void")
    .slice()
    .sort((a, b) => {
      const aDate = parseDateForSort(a.date);
      const bDate = parseDateForSort(b.date);
      if (aDate && bDate) return bDate - aDate;
      if (aDate) return 1;
      if (bDate) return -1;
      return 0;
    });

  if (sorted.length === 0) return { type: null, count: 0 };

  const firstStatus = sorted[0].status;
  let count = 0;

  for (const bet of sorted) {
    if (bet.status === firstStatus) {
      count++;
    } else {
      break;
    }
  }

  return { type: firstStatus, count };
}

function updateBankrollExposure() {
  const pendingStake = bets
    .filter((bet) => bet.status === "pending" && !bet.isFreebet)
    .reduce((sum, bet) => sum + bet.stake, 0);
  const effective = getEffectiveBankroll();
  const bankroll = Number.isFinite(effective) ? effective : parseLocaleNumber(bankrollInput.value);
  const exposure = bankroll > 0 ? pendingStake / bankroll : 0;

  bankrollProgress.style.width = `${Math.min(exposure * 100, 100)}%`;
  bankrollExposure.textContent = `Exposição ${percentFormatter.format(exposure)}`;
  bankrollExposureValue.textContent = `${formatProfit(pendingStake)} expostos`;
}

function handleBankrollInput() {
  const current = parseLocaleNumber(bankrollInput.value);
  if (!Number.isFinite(current)) {
    baseBankroll = null;
    saveBankrollBase();
    updateBankrollExposure();
    return;
  }

  baseBankroll = current - calcSettledProfit() - calcCashflowTotal();
  saveBankrollBase();
  updateBankrollExposure();
}

function renderBalanceChart() {
  const context = document.getElementById("balance-chart");
  if (!context || typeof Chart === "undefined") {
    return;
  }

  const isDarkTheme = document.documentElement.classList.contains("dark");
  const tickColor = getThemeColor("--text-muted", "rgba(120, 130, 150, 0.9)");
  const gridColor = getThemeColor("--border", "rgba(120, 130, 150, 0.2)");
  const lineColor = isDarkTheme
    ? "#2dd4bf"
    : getThemeColor("--primary", "#7c5cff");
  const fillColor = isDarkTheme
    ? "rgba(45, 212, 191, 0.20)"
    : "rgba(124, 92, 255, 0.20)";

  const data = getBoostScopedBets()
    .filter((bet) => bet.status === "win" || bet.status === "loss" || bet.status === "cashout" || bet.status === "void")
    .slice()
    .sort((a, b) => {
      const aDate = parseDateForSort(a.date);
      const bDate = parseDateForSort(b.date);
      if (aDate && bDate) {
        return aDate - bDate;
      }
      if (aDate) {
        return -1;
      }
      if (bDate) {
        return 1;
      }
      return 0;
    });

  const labels = [];
  const values = [];
  let total = 0;

  data.forEach((bet) => {
    total += calcProfit(bet);
    labels.push(bet.date || bet.event || "-");
    values.push(Number(total.toFixed(2)));
  });

  if (labels.length === 0) {
    labels.push("Sem dados");
    values.push(0);
  }

  if (balanceChart) {
    balanceChart.data.labels = labels;
    balanceChart.data.datasets[0].data = values;
    balanceChart.data.datasets[0].borderColor = lineColor;
    balanceChart.options.scales.x.ticks.color = tickColor;
    balanceChart.options.scales.y.ticks.color = tickColor;
    balanceChart.options.scales.x.grid.color = gridColor;
    balanceChart.options.scales.y.grid.color = gridColor;
    balanceChart.update();
    return;
  }

  balanceChart = new Chart(context, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Lucro acumulado",
          data: values,
          borderColor: lineColor,
          backgroundColor: fillColor,
          tension: 0.35,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: false,
        },
      },
      scales: {
        x: {
          ticks: {
            color: tickColor,
          },
          grid: {
            color: gridColor,
          },
        },
        y: {
          ticks: {
            color: tickColor,
          },
          grid: {
            color: gridColor,
          },
        },
      },
    },
  });
}

function refreshAll() {
  renderBookFilter();
  renderCategorySelects();
  renderTable();
  renderKpis();
  renderKpiDeltas();
  updateBankrollDisplay();
  updateBankrollExposure();
  updateFormInsights();
  renderBalanceChart();
  renderMiniProfitChart();
  renderAIRanking();
  renderWeekdayPerformance();
  renderProfitGoals();
  renderFinalizedBets();
  syncTableStateToUrl();
}

function renderAll() {
  refreshAll();
}

function renderMiniProfitChart() {
  const context = document.getElementById("mini-profit-chart");
  if (!context || typeof Chart === "undefined") {
    return;
  }

  const now = new Date();
  const byDay = new Map();
  const scopedBets = getBoostScopedBets();

  // Filter by selected book
  const selectedBook = bookFilter?.value || "all";

  scopedBets.forEach((bet) => {
    const date = parseDateForSort(bet.date);
    if (!date || date.getMonth() !== now.getMonth() || date.getFullYear() !== now.getFullYear()) {
      return;
    }
    if (bet.status !== "win" && bet.status !== "loss" && bet.status !== "cashout" && bet.status !== "void") {
      return;
    }
    if (selectedBook !== "all" && bet.book !== selectedBook) {
      return;
    }

    const day = date.getDate();
    const prev = byDay.get(day) || 0;
    byDay.set(day, prev + calcProfit(bet));
  });

  const labels = Array.from(byDay.keys()).sort((a, b) => a - b).map((day) => String(day));
  const values = labels.map((day) => byDay.get(Number(day)) || 0);

  // Calculate summary stats
  const monthTotal = values.reduce((sum, v) => sum + v, 0);
  const bestDay = values.length > 0 ? Math.max(...values) : 0;
  const worstDay = values.length > 0 ? Math.min(...values) : 0;

  // Update summary cards
  const monthTotalEl = document.getElementById("chart-month-total");
  const bestDayEl = document.getElementById("chart-best-day");
  const worstDayEl = document.getElementById("chart-worst-day");

  if (monthTotalEl) {
    monthTotalEl.textContent = formatProfit(monthTotal);
    monthTotalEl.className = "profit-day-stat-value " + (monthTotal >= 0 ? "positive" : "negative");
  }
  if (bestDayEl) {
    bestDayEl.textContent = formatProfit(bestDay);
    bestDayEl.className = "profit-day-stat-value " + (bestDay >= 0 ? "positive" : "negative");
  }
  if (worstDayEl) {
    worstDayEl.textContent = formatProfit(worstDay);
    worstDayEl.className = "profit-day-stat-value " + (worstDay >= 0 ? "positive" : "negative");
  }

  if (!labels.length) {
    labels.push("-");
    values.push(0);
  }

  const html = document.documentElement;
  const isDark = html.classList.contains("dark") || (!html.classList.contains("light") && !html.classList.contains("light-azulado") && !html.classList.contains("light-bege"));
  const tickColor = isDark ? "rgba(245, 247, 255, 0.5)" : "rgba(30, 40, 60, 0.75)";
  const gridColor = isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.1)";

  const dataset = {
    label: "Lucro diário",
    data: values,
    backgroundColor: values.map((v) =>
      v >= 0 ? "rgba(34, 197, 94, 0.75)" : "rgba(239, 68, 68, 0.55)"
    ),
    borderColor: "transparent",
    borderWidth: 0,
    borderRadius: 3,
    borderSkipped: false,
    maxBarThickness: 18,
    categoryPercentage: 0.7,
    barPercentage: 0.75,
  };

  if (miniProfitChart) {
    miniProfitChart.data.labels = labels;
    miniProfitChart.data.datasets[0] = dataset;
    miniProfitChart.options.scales.x.ticks.color = tickColor;
    miniProfitChart.options.scales.y.ticks.color = tickColor;
    miniProfitChart.options.scales.y.grid.color = gridColor;
    miniProfitChart.update();
    return;
  }

  miniProfitChart = new Chart(context, {
    type: "bar",
    data: { labels, datasets: [dataset] },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 2,
      layout: {
        padding: { top: 8, bottom: 4, left: 0, right: 0 },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isDark ? "rgba(20, 22, 35, 0.95)" : "rgba(255, 255, 255, 0.95)",
          titleColor: isDark ? "#f5f7ff" : "#1e2840",
          bodyColor: isDark ? "#f5f7ff" : "#1e2840",
          borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          displayColors: false,
          callbacks: {
            title: (items) => `Dia ${items[0].label}`,
            label: (item) => {
              const val = item.raw;
              return formatProfit(val);
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: tickColor,
            font: { size: 10, weight: "500" },
            maxRotation: 0,
            autoSkip: true,
            autoSkipPadding: 6,
          },
        },
        y: {
          grid: {
            color: gridColor,
            drawBorder: false,
            lineWidth: 0.5,
          },
          border: { display: false },
          ticks: {
            color: tickColor,
            font: { size: 10 },
            callback: (value) => {
              return formatProfit(Number(value) || 0);
            },
            maxTicksLimit: 6,
          },
        },
      },
    },
  });
}

function renderKpiDeltas() {
  const monthNames = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const prevMonthLabel = monthNames[(new Date().getMonth() + 11) % 12];

  const map = [
    { metric: "profit", id: "kpi-profit-delta", suffix: "%" },
    { metric: "winrate", id: "kpi-winrate-delta", suffix: "%" },
    { metric: "roi", id: "kpi-roi-delta", suffix: "%" },
    { metric: "avgOdd", id: "kpi-avg-odd-delta", suffix: "x" },
  ];

  map.forEach(({ metric, id, suffix }) => {
    const el = document.getElementById(id);
    if (!el) return;
    const result = calculateMonthlyDelta(metric);
    const deltaVal = metric === "profit" ? result.deltaPercent : (metric === "winrate" || metric === "roi" ? result.delta * 100 : result.delta);
    el.classList.remove("positive", "negative");
    if (deltaVal > 0) el.classList.add("positive");
    if (deltaVal < 0) el.classList.add("negative");
    el.textContent = formatDeltaText(deltaVal, suffix, prevMonthLabel);
  });
}

function resetForm() {
  form.reset();
  setSelectedAIs("bet-ai-selector", "");
  updatePotentialProfit();
  editingId = null;
  submitButton.textContent = "Salvar aposta";
  // Esconde campo de cashout
  const cashoutLabel = document.getElementById("cashout-value-label");
  if (cashoutLabel) cashoutLabel.style.display = "none";
}

function fillBetForm(bet) {
  if (!bet) return;

  document.getElementById("bet-date").value = formatDateForInput(bet.date);
  document.getElementById("bet-event").value = bet.event || "";
  document.getElementById("bet-odds").value = numberFormatter.format(bet.odds);
  document.getElementById("bet-stake").value = numberFormatter.format(bet.stake);
  document.getElementById("bet-book").value = bet.book || "";
  document.getElementById("bet-status").value = bet.status || "pending";
  document.getElementById("bet-stake-type").value = bet.isFreebet ? "freebet" : "regular";

  const boostInput = document.getElementById("bet-is-boost");
  if (boostInput) boostInput.checked = Boolean(bet.isBoost);

  setSelectedAIs("bet-ai-selector", bet.ai || "");
  document.getElementById("bet-category").value = bet.category || "";

  const cashoutLabel = document.getElementById("cashout-value-label");
  const cashoutInput = document.getElementById("bet-cashout-value");
  if (bet.status === "cashout") {
    if (cashoutLabel) cashoutLabel.style.display = "";
    if (cashoutInput) cashoutInput.value = bet.cashout_value != null ? numberFormatter.format(bet.cashout_value) : "";
  } else {
    if (cashoutLabel) cashoutLabel.style.display = "none";
    if (cashoutInput) cashoutInput.value = "";
  }

  updatePotentialProfit();
}

async function handleSubmit(event) {
  event.preventDefault();

  const rawDate = document.getElementById("bet-date").value.trim();
  const formattedDate = formatDateDisplay(rawDate);
  const oddsValue = parseLocaleNumber(document.getElementById("bet-odds").value);
  const stakeValue = parseLocaleNumber(document.getElementById("bet-stake").value);

  const bet = {
    id: editingId ? editingId : crypto.randomUUID(), 
    date: formattedDate,
    event: document.getElementById("bet-event").value.trim(),
    odds: oddsValue,
    stake: stakeValue,
    book: document.getElementById("bet-book").value.trim(),
    status: document.getElementById("bet-status").value,
    isFreebet: document.getElementById("bet-stake-type").value === "freebet",
    isBoost: document.getElementById("bet-is-boost")?.checked === true,
    ai: getSelectedAIs("bet-ai-selector") || null,
    category: document.getElementById("bet-category").value || null,
    cashout_value: null,
  };

  // Se status for cashout, capturar o valor do cashout
  if (bet.status === "cashout") {
    const cashoutInput = document.getElementById("bet-cashout-value");
    const cashoutVal = parseLocaleNumber(cashoutInput?.value || "0");
    if (!Number.isFinite(cashoutVal) || cashoutVal < 0) {
      alert("Informe o valor do cashout.");
      return;
    }
    bet.cashout_value = cashoutVal;
  }

  if (!bet.date || !bet.event || !bet.book || !Number.isFinite(bet.odds) || !Number.isFinite(bet.stake)) {
    alert("Preencha todos os campos obrigatórios com data no formato DD/MM/AAAA.");
    return;
  }

  if (editingId) {
    const index = bets.findIndex((item) => item.id === editingId);
    if (index >= 0) {
      bets[index] = { ...bets[index], ...bet };
    }
  } else {
    bets.unshift(bet);
  }
  await salvarApostaBD(bet);
  saveBets();
  refreshAll();
  resetForm();
}

function startEdit(bet) {
  editingId = bet.id;
  fillBetForm(bet);
  submitButton.textContent = "Atualizar aposta";
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function cloneBet(bet) {
  if (!bet) return;
  resetForm();
  fillBetForm(bet);
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function resolveAposta(id, novoStatus, cashoutValue = null) {
  const aposta = bets.find((b) => b.id === id);
  if (!aposta) return;

  const payload = { ...aposta, status: novoStatus };
  if (novoStatus === "cashout" && cashoutValue !== null) {
    payload.cashout_value = cashoutValue;
  }

  await fetch("api.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      acao: "salvar_aposta",
      profile_id: getActiveProfileId(),
      aposta: payload,
    }),
  });

  await loadBets();
  renderAll();
}

function toggleInlineCashout(id) {
  const desktop = document.getElementById(`cashout-inline-${id}`);
  const mobile = document.getElementById(`cashout-inline-mobile-${id}`);
  [desktop, mobile].forEach((el) => {
    if (!el) return;
    el.style.display = el.style.display === "none" || !el.style.display ? "flex" : "none";
  });
}

async function handleTableClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const id = button.dataset.id;
  const action = button.dataset.action;

  if (action === "edit") {
    const bet = bets.find((item) => item.id === id);
    if (bet) startEdit(bet);
    return;
  }

  if (action === "clone") {
    const bet = bets.find((item) => item.id === id);
    if (bet) cloneBet(bet);
    return;
  }

  if (action === "delete") {
    const bet = bets.find((item) => item.id === id);
    if (bet) showDeleteConfirmation(bet);
    return;
  }

  if (action === "resolve-win") {
    await resolveAposta(id, "win");
    return;
  }

  if (action === "resolve-loss") {
    await resolveAposta(id, "loss");
    return;
  }

  if (action === "toggle-cash") {
    toggleInlineCashout(id);
    return;
  }

  if (action === "confirm-cash") {
    const desktopInput = document.getElementById(`cashout-value-${id}`);
    const mobileInput = document.getElementById(`cashout-value-mobile-${id}`);
    const cashValue = parseLocaleNumber((desktopInput?.value || mobileInput?.value || "").trim());

    if (!Number.isFinite(cashValue) || cashValue < 0) {
      alert("Informe um valor de cashout válido.");
      return;
    }

    await resolveAposta(id, "cashout", cashValue);
    return;
  }
}

// Calendar state
let calendarDate = new Date();
let calendarView = 'month';

const calendarContainer = document.getElementById('calendar-container');
const calendarTitle = document.getElementById('calendar-title');
const calendarViewSelect = document.getElementById('calendar-view');
const calendarPrev = document.getElementById('calendar-prev');
const calendarNext = document.getElementById('calendar-next');
const calendarPeriodProfit = document.getElementById('calendar-period-profit');
const calendarPositiveDays = document.getElementById('calendar-positive-days');
const calendarNegativeDays = document.getElementById('calendar-negative-days');

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function getProfitByDate(dateKey) {
  return bets
    .filter((bet) => {
      if (bet.status !== 'win' && bet.status !== 'loss' && bet.status !== 'cashout' && bet.status !== 'void') return false;
      const betDate = parseDateForSort(bet.date);
      if (!betDate) return false;
      const betKey = `${betDate.getFullYear()}-${String(betDate.getMonth() + 1).padStart(2, '0')}-${String(betDate.getDate()).padStart(2, '0')}`;
      return betKey === dateKey;
    })
    .reduce((sum, bet) => sum + calcProfit(bet), 0);
}

function getProfitByMonth(year, month) {
  return bets
    .filter((bet) => {
      if (bet.status !== 'win' && bet.status !== 'loss' && bet.status !== 'cashout' && bet.status !== 'void') return false;
      const betDate = parseDateForSort(bet.date);
      if (!betDate) return false;
      return betDate.getFullYear() === year && betDate.getMonth() === month;
    })
    .reduce((sum, bet) => sum + calcProfit(bet), 0);
}

function getProfitByYear(year) {
  return bets
    .filter((bet) => {
      if (bet.status !== 'win' && bet.status !== 'loss' && bet.status !== 'cashout' && bet.status !== 'void') return false;
      const betDate = parseDateForSort(bet.date);
      if (!betDate) return false;
      return betDate.getFullYear() === year;
    })
    .reduce((sum, bet) => sum + calcProfit(bet), 0);
}

function getBetsCountByMonth(year, month) {
  return bets.filter((bet) => {
    if (bet.status !== 'win' && bet.status !== 'loss' && bet.status !== 'cashout' && bet.status !== 'void') return false;
    const betDate = parseDateForSort(bet.date);
    if (!betDate) return false;
    return betDate.getFullYear() === year && betDate.getMonth() === month;
  }).length;
}

function renderMonthCalendar() {
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const today = new Date();
  
  calendarTitle.textContent = `${MONTH_NAMES[month]} ${year}`;
  calendarContainer.className = 'calendar-grid';
  calendarContainer.innerHTML = '';

  // Render day headers
  DAY_NAMES.forEach((day) => {
    const header = document.createElement('div');
    header.className = 'calendar-header';
    header.textContent = day;
    calendarContainer.appendChild(header);
  });

  // Get first day of month and total days
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let periodProfit = 0;
  let positiveDays = 0;
  let negativeDays = 0;

  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement('div');
    empty.className = 'calendar-day empty';
    calendarContainer.appendChild(empty);
  }

  // Days of month
  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const profit = getProfitByDate(dateKey);
    periodProfit += profit;

    const dayEl = document.createElement('div');
    dayEl.className = 'calendar-day';

    const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
    if (isToday) {
      dayEl.classList.add('today');
    }

    if (profit > 0) {
      dayEl.classList.add('positive');
      positiveDays++;
    } else if (profit < 0) {
      dayEl.classList.add('negative');
      negativeDays++;
    }

    const dayNumber = document.createElement('span');
    dayNumber.className = 'day-number';
    dayNumber.textContent = day;
    dayEl.appendChild(dayNumber);

    if (profit !== 0) {
      const dayProfit = document.createElement('span');
      dayProfit.className = `day-profit ${profit > 0 ? 'positive' : 'negative'}`;
      dayProfit.textContent = formatProfit(profit).replace(/^R\$\s*/, '').trim();
      dayEl.appendChild(dayProfit);
    }

    dayEl.title = `${day}/${month + 1}/${year}: ${formatProfit(profit)} - Clique para ver detalhes`;
    dayEl.style.cursor = 'pointer';
    
    // Add click event to open modal
    const clickDateKey = dateKey;
    const clickDisplayDate = `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}`;
    dayEl.addEventListener('click', () => {
      openDayModal(clickDateKey, clickDisplayDate);
    });

    calendarContainer.appendChild(dayEl);
  }

  // Update summary
  calendarPeriodProfit.textContent = formatProfit(periodProfit);
  calendarPeriodProfit.className = periodProfit >= 0 ? 'positive' : 'negative';
  calendarPositiveDays.textContent = positiveDays;
  calendarNegativeDays.textContent = negativeDays;
}

function renderYearCalendar() {
  const year = calendarDate.getFullYear();
  
  calendarTitle.textContent = `${year}`;
  calendarContainer.className = 'calendar-grid year-view';
  calendarContainer.innerHTML = '';

  let periodProfit = 0;
  let positiveMonths = 0;
  let negativeMonths = 0;

  for (let month = 0; month < 12; month++) {
    const profit = getProfitByMonth(year, month);
    const betsCount = getBetsCountByMonth(year, month);
    periodProfit += profit;

    const card = document.createElement('div');
    card.className = 'calendar-month-card';

    if (profit > 0) {
      card.classList.add('positive');
      positiveMonths++;
    } else if (profit < 0) {
      card.classList.add('negative');
      negativeMonths++;
    }

    const monthName = document.createElement('div');
    monthName.className = 'month-name';
    monthName.textContent = MONTH_NAMES[month];
    card.appendChild(monthName);

    const monthProfit = document.createElement('div');
    monthProfit.className = `month-profit ${profit > 0 ? 'positive' : profit < 0 ? 'negative' : ''}`;
    monthProfit.textContent = formatProfit(profit);
    card.appendChild(monthProfit);

    const monthStats = document.createElement('div');
    monthStats.className = 'month-stats';
    monthStats.textContent = `${betsCount} aposta${betsCount !== 1 ? 's' : ''}`;
    card.appendChild(monthStats);

    card.addEventListener('click', () => {
      calendarDate = new Date(year, month, 1);
      calendarView = 'month';
      calendarViewSelect.value = 'month';
      renderCalendar();
    });

    calendarContainer.appendChild(card);
  }

  // Update summary
  calendarPeriodProfit.textContent = formatProfit(periodProfit);
  calendarPeriodProfit.className = periodProfit >= 0 ? 'positive' : 'negative';
  calendarPositiveDays.textContent = positiveMonths;
  calendarNegativeDays.textContent = negativeMonths;

  // Update labels for year view
  document.querySelector('.calendar-kpi:nth-child(2) span').textContent = 'Meses Positivos';
  document.querySelector('.calendar-kpi:nth-child(3) span').textContent = 'Meses Negativos';
}

function renderCalendar() {
  if (!calendarContainer) return;

  // Reset labels
  const kpiLabels = document.querySelectorAll('.calendar-kpi span');
  if (kpiLabels.length >= 3) {
    kpiLabels[1].textContent = calendarView === 'year' ? 'Meses Positivos' : 'Dias Positivos';
    kpiLabels[2].textContent = calendarView === 'year' ? 'Meses Negativos' : 'Dias Negativos';
  }

  if (calendarView === 'month') {
    renderMonthCalendar();
  } else {
    renderYearCalendar();
  }
}

function handleCalendarNavigation(direction) {
  if (calendarView === 'month') {
    calendarDate.setMonth(calendarDate.getMonth() + direction);
  } else {
    calendarDate.setFullYear(calendarDate.getFullYear() + direction);
  }
  renderCalendar();
}

// Modal functions
function getBetsByDateKey(dateKey) {
  return bets.filter((bet) => {
    const betDate = parseDateForSort(bet.date);
    if (!betDate) return false;
    const betKey = `${betDate.getFullYear()}-${String(betDate.getMonth() + 1).padStart(2, '0')}-${String(betDate.getDate()).padStart(2, '0')}`;
    return betKey === dateKey;
  });
}

function openDayModal(dateKey, displayDate) {
 if (!dayModal) return;

  const dayBets = getBetsByDateKey(dateKey);
  
  // Guardar dados para o compartilhamento
  dayModal._currentDateKey = dateKey;
  dayModal._currentDisplayDate = displayDate;
  dayModal._currentBets = dayBets;

  // Atualizar Título e adicionar botão de compartilhar
  const headerContainer = dayModal.querySelector('.modal-header');
  // Limpa o header atual e recria para garantir que não duplique botões
  headerContainer.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px;">
      <h3 id="modal-title">Apostas - ${displayDate}</h3>
      <button type="button" class="ghost small" id="share-day-btn" title="Compartilhar Resumo do Dia">
        📱 Compartilhar
      </button>
    </div>
    <button type="button" class="modal-close" id="modal-close">&times;</button>
  `;

  // Reconectar o evento de fechar (pois recriamos o botão close)
  document.getElementById('modal-close').addEventListener('click', closeDayModal);
  
  // Conectar o evento do novo botão de compartilhar
  document.getElementById('share-day-btn').addEventListener('click', () => {
    openShareDayModal(displayDate, dayBets);
  });

  const modalSummary = document.getElementById("modal-summary");
  const modalBetsList = document.getElementById("modal-bets-list");

  // Calculate summary
  const settled = dayBets.filter(b => b.status === 'win' || b.status === 'loss' || b.status === 'cashout' || b.status === 'void');
  const wins = dayBets.filter(b => b.status === 'win' || b.status === 'cashout').length;
  const losses = dayBets.filter(b => b.status === 'loss').length;
  const totalProfit = settled.reduce((sum, bet) => sum + calcProfit(bet), 0);

  modalSummary.innerHTML = `
    <div class="modal-stat">
      <span>Apostas</span>
      <strong>${dayBets.length}</strong>
    </div>
    <div class="modal-stat ${wins > 0 ? 'positive' : ''}">
      <span>Greens</span>
      <strong>${wins}</strong>
    </div>
    <div class="modal-stat ${losses > 0 ? 'negative' : ''}">
      <span>Reds</span>
      <strong>${losses}</strong>
    </div>
    <div class="modal-stat ${totalProfit >= 0 ? 'positive' : 'negative'}">
      <span>Lucro</span>
      <strong>${formatProfit(totalProfit)}</strong>
    </div>
  `;

  // Render bets list
  if (dayBets.length === 0) {
    modalBetsList.innerHTML = '<div class="modal-empty">Nenhuma aposta neste dia.</div>';
  } else {
    modalBetsList.innerHTML = dayBets.map(bet => {
      const profit = calcProfit(bet);
      const profitClass = profit > 0 ? 'positive' : profit < 0 ? 'negative' : '';
      return `
        <div class="modal-bet-item">
          <div class="modal-bet-header">
            <span class="modal-bet-event">${bet.event}</span>
            <span class="modal-bet-status ${bet.status}">${statusLabel(bet.status)}</span>
          </div>
          <div class="modal-bet-details">
            <span>Odd: <strong>${numberFormatter.format(bet.odds)}x</strong></span>
            <span>Stake: <strong>${formatStake(bet.stake)}</strong></span>
            <span>Casa: <strong>${bet.book}</strong></span>
            <span class="modal-bet-profit ${profitClass}">Lucro: ${formatProfit(profit)}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  dayModal.style.display = 'flex';
}
//termina aqui a func
function closeDayModal() {
  if (dayModal) {
    dayModal.style.display = 'none';
  }
}

// Modal event listeners
modalClose?.addEventListener('click', closeDayModal);
dayModal?.addEventListener('click', (e) => {
  if (e.target === dayModal) {
    closeDayModal();
  }
});
document.addEventListener('keydown', (e) => {
  const ctrlOrMeta = e.ctrlKey || e.metaKey;

  if (ctrlOrMeta && e.key.toLowerCase() === 'f') {
    if (betSearchInput) {
      e.preventDefault();
      betSearchInput.focus();
      betSearchInput.select();
    }
    return;
  }

  if (ctrlOrMeta && e.key.toLowerCase() === 'i') {
    e.preventDefault();
    document.getElementById("import-coupon-btn")?.click();
    return;
  }

  if (ctrlOrMeta && e.key.toLowerCase() === 's') {
    if (form) {
      e.preventDefault();
      form.requestSubmit();
    }
    return;
  }

  if (e.key === 'Escape') {
    if (betSearchInput?.value) {
      betSearchInput.value = "";
      refreshAll();
    }
    closeDayModal();
    closeDeleteModal();
    if (typeof closePdfModal === 'function') closePdfModal();
    if (typeof closeShareModal === 'function') closeShareModal();
  }
});
function openShareDayModal(date, betsList) {
  if (!shareModal || !shareCardCanvas) return;
  
  // Renderiza o card específico do dia
  renderDayShareCard(date, betsList);
  
  // Limpa a referência de aposta única para evitar conflitos no botão nativo
  shareModal._currentBet = null; 
  shareModal.style.display = 'flex';
}

function renderDayShareCard(dateString, betsList) {
  const canvas = shareCardCanvas;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  // Aumentamos a altura para caber a lista (formato Story/Portrait: 1080x1350)
  const w = 1080;
  const h = 1350; 
  canvas.width = w;
  canvas.height = h;

  // 1. Fundo (Gradiente Dark)
  const bgGrad = ctx.createLinearGradient(0, 0, w, h);
  bgGrad.addColorStop(0, '#0b1020');
  bgGrad.addColorStop(0.5, '#161b33');
  bgGrad.addColorStop(1, '#0b1020');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // Decoração de fundo (Círculos)
  ctx.beginPath();
  ctx.arc(0, 0, 400, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(124, 92, 255, 0.08)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(w, h, 350, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(45, 212, 191, 0.08)';
  ctx.fill();

  // Cálculos do Dia
  const settled = betsList.filter(b => b.status === 'win' || b.status === 'loss');
  const wins = settled.filter(b => b.status === 'win').length;
  const losses = settled.filter(b => b.status === 'loss').length;
  const totalProfit = settled.reduce((sum, b) => sum + calcProfit(b), 0);
  const totalStake = settled.reduce((sum, b) => sum + b.stake, 0);
  const roi = totalStake > 0 ? (totalProfit / totalStake) * 100 : 0;
  const isPositive = totalProfit >= 0;

  let y = 80;

  // 2. Cabeçalho: Data
  ctx.fillStyle = 'rgba(245, 247, 255, 0.6)';
  ctx.font = '600 32px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`RESUMO DO DIA • ${dateString}`, w / 2, y);
  
  y += 100;

  // 3. Lucro Total em Destaque
  const profitColor = isPositive ? '#22c55e' : '#ff6b6b';
  const profitBg = isPositive ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255, 107, 107, 0.1)';
  
  // Card do Lucro
  ctx.fillStyle = profitBg;
  roundRect(ctx, 140, y - 60, w - 280, 140, 24);
  ctx.fill();
  ctx.strokeStyle = profitColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = profitColor;
  ctx.font = 'bold 80px Inter, sans-serif';
  ctx.textAlign = 'center';
  // Centralizar verticalmente no box
  ctx.fillText(formatProfit(totalProfit), w / 2, y + 40);

  y += 140;

  // 4. Grid de Estatísticas (Wins, Reds, ROI)
  const cardsY = y + 40;
  const cardW = 240;
  const cardH = 120;
  const gap = 40;
  const startX = (w - (cardW * 3 + gap * 2)) / 2;

  // Card Wins
  drawMiniStatCard(ctx, startX, cardsY, cardW, cardH, '✅ Greens', wins.toString(), '#22c55e');
  // Card Reds
  drawMiniStatCard(ctx, startX + cardW + gap, cardsY, cardW, cardH, '❌ Reds', losses.toString(), '#ff6b6b');
  // Card ROI
  const roiColor = roi >= 0 ? '#22c55e' : '#ff6b6b';
  drawMiniStatCard(ctx, startX + (cardW + gap) * 2, cardsY, cardW, cardH, '📈 ROI', `${roi.toFixed(1)}%`, roiColor);

  y = cardsY + cardH + 60;

  // 5. Lista de Apostas (Top lista)
  ctx.fillStyle = '#f5f7ff';
  ctx.font = 'bold 36px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('📋 Histórico do Dia', 80, y);
  
  // Linha divisória
  y += 20;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(80, y);
  ctx.lineTo(w - 80, y);
  ctx.stroke();
  
  y += 40;

  // Ordenar: Wins primeiro, depois losses (ou cronológico se preferir)
  // Vamos priorizar os maiores lucros/perdas para mostrar o que importa
  const sortedBets = [...settled].sort((a, b) => Math.abs(calcProfit(b)) - Math.abs(calcProfit(a)));
  
  // Mostrar no máximo 6 apostas para caber
  const maxBetsToShow = 6;
  const betsToShow = sortedBets.slice(0, maxBetsToShow);

  betsToShow.forEach(bet => {
    const bProfit = calcProfit(bet);
    const bColor = bProfit >= 0 ? '#22c55e' : '#ff6b6b';
    const bIcon = bProfit >= 0 ? '✅' : '❌';
    
    // Fundo da linha
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    roundRect(ctx, 80, y, w - 160, 90, 12);
    ctx.fill();

    // Icone
    ctx.font = '30px Inter, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText(bIcon, 100, y + 55);

    // Evento (Truncado)
    ctx.font = '600 28px Inter, sans-serif';
    ctx.fillStyle = '#f5f7ff';
    let eventName = bet.event;
    if (ctx.measureText(eventName).width > 550) {
      while (ctx.measureText(eventName + '...').width > 550) {
        eventName = eventName.slice(0, -1);
      }
      eventName += '...';
    }
    ctx.fillText(eventName, 160, y + 55);

    // Odd
    ctx.font = '400 24px Inter, sans-serif';
    ctx.fillStyle = 'rgba(245, 247, 255, 0.6)';
    ctx.fillText(`@${numberFormatter.format(bet.odds)}`, 740, y + 55);

    // Valor Lucro
    ctx.font = 'bold 28px Inter, sans-serif';
    ctx.fillStyle = bColor;
    ctx.textAlign = 'right';
    ctx.fillText(formatProfit(bProfit), w - 100, y + 55);

    y += 105;
  });

  // Se houver mais apostas que não couberam
  if (sortedBets.length > maxBetsToShow) {
    ctx.fillStyle = 'rgba(245, 247, 255, 0.5)';
    ctx.font = 'italic 24px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`... e mais ${sortedBets.length - maxBetsToShow} apostas`, w / 2, y + 20);
  } else if (sortedBets.length === 0) {
    ctx.fillStyle = 'rgba(245, 247, 255, 0.5)';
    ctx.font = 'italic 24px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Nenhuma aposta finalizada neste dia`, w / 2, y + 40);
  }

  // Footer
  ctx.fillStyle = 'rgba(245, 247, 255, 0.3)';
  ctx.font = '400 24px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Caderneta de Apostas', w / 2, h - 50);
}

function drawMiniStatCard(ctx, x, y, w, h, label, value, color) {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  roundRect(ctx, x, y, w, h, 16);
  ctx.fill();
  
  ctx.fillStyle = 'rgba(245, 247, 255, 0.6)';
  ctx.font = '400 24px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, x + w / 2, y + 40);

  ctx.fillStyle = color;
  ctx.font = 'bold 36px Inter, sans-serif';
  ctx.fillText(value, x + w / 2, y + 90);
}
async function init() {
  Shell.showGlobalLoading?.("Carregando dados da caderneta...");
  try {
    initTheme();
    applyTableStateFromUrl();
    const periodPill = document.getElementById("period-pill");
    if (periodPill) {
      const date = new Date();
      const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
      periodPill.textContent = `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
    }

    await renderProfileSwitcher();
    await loadBets();
    await loadCashflows();
    await loadCategories();
    loadSettings();
    await loadBankrollBase();
    await loadGoals();
    applySettings();
    updatePotentialProfit();
    refreshAll();
    renderCalendar();
    handleHashSection();
    await loadQuickNotes();
  } catch (error) {
    console.error("Falha ao iniciar app:", error);
    Shell.showApiError?.("Nao foi possivel iniciar a pagina de apostas.");
  } finally {
    Shell.hideGlobalLoading?.();
  }
}
async function salvarApostaBD(aposta) {
  try {
    const resposta = await fetch('api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        acao: 'salvar_aposta',
        profile_id: getActiveProfileId(),
        aposta: aposta
      })
    });
    
    // Em vez de forçar o JSON, lemos o texto puro que o PHP enviou
    const textoBruto = await resposta.text();
    
    try {
      // Agora sim, tentamos converter para JSON
      const resultado = JSON.parse(textoBruto);
      
      if (resultado.sucesso) {
        console.log("✅ Servidor diz:", resultado.mensagem);
      } else {
        console.error("❌ Erro no Banco de Dados:", resultado.erro);
      }
      
    } catch (erroJson) {
      // Se falhar a conversão, mostramos a MENSAGEM REAL do PHP com a sirene!
      console.error("🚨 O PHP não devolveu JSON ao salvar. Ele respondeu exatamente isto:", textoBruto);
    }
    
  } catch (erro) {
    console.error("❌ Erro geral de comunicação:", erro);
  }
}
// ========================
// DELETE - API
// ========================
async function excluirApostaBD(id) {
  try {
    const resposta = await fetch('api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        acao: 'excluir_aposta',
        profile_id: getActiveProfileId(),
        id: id
      })
    });
    const textoBruto = await resposta.text();
    try {
      const resultado = JSON.parse(textoBruto);
      if (resultado.sucesso) {
        console.log("✅ Aposta excluída do banco:", resultado.mensagem);
      } else {
        console.error("❌ Erro ao excluir no banco:", resultado.erro);
      }
    } catch (erroJson) {
      console.error("🚨 O PHP não devolveu JSON ao excluir. Resposta:", textoBruto);
    }
  } catch (erro) {
    console.error("❌ Erro de comunicação ao excluir:", erro);
  }
}

// ========================
// DELETE CONFIRMATION
// ========================
const deleteModal = document.getElementById('delete-modal');
const deleteModalClose = document.getElementById('delete-modal-close');
const deleteModalCancel = document.getElementById('delete-modal-cancel');
const deleteModalConfirm = document.getElementById('delete-modal-confirm');
const deleteModalBetInfo = document.getElementById('delete-modal-bet-info');
const deleteModalConfirmInput = document.getElementById('delete-modal-confirm-input');
const deleteModalExpectedText = "excluir";

function showDeleteConfirmation(bet) {
  if (!deleteModal) return;
  deletePendingId = bet.id;
  const profit = calcProfit(bet);
  deleteModalBetInfo.innerHTML = `
    <div class="modal-bet-header">
      <span class="modal-bet-event">${bet.event}</span>
      <span class="modal-bet-status ${bet.status}">${statusLabel(bet.status)}</span>
    </div>
    <div class="modal-bet-details">
      <span>Data: <strong>${bet.date}</strong></span>
      <span>Odd: <strong>${numberFormatter.format(bet.odds)}x</strong></span>
      <span>Stake: <strong>${formatStake(bet.stake)}</strong></span>
      <span>Casa: <strong>${bet.book}</strong></span>
      ${bet.ai ? `<span>Quem sugeriu: <strong>${bet.ai.split(",").join(", ")}</strong></span>` : ''}
    </div>
  `;
  if (deleteModalConfirmInput) {
    deleteModalConfirmInput.value = "";
    deleteModalConfirmInput.focus();
  }
  if (deleteModalConfirm) {
    deleteModalConfirm.disabled = true;
  }
  deleteModal.style.display = 'flex';
}

function closeDeleteModal() {
  if (deleteModal) {
    deleteModal.style.display = 'none';
    deletePendingId = null;
    if (deleteModalConfirmInput) deleteModalConfirmInput.value = "";
    if (deleteModalConfirm) deleteModalConfirm.disabled = true;
  }
}

deleteModalClose?.addEventListener('click', closeDeleteModal);
deleteModalCancel?.addEventListener('click', closeDeleteModal);
deleteModal?.addEventListener('click', (e) => {
  if (e.target === deleteModal) closeDeleteModal();
});

deleteModalConfirmInput?.addEventListener('input', () => {
  if (!deleteModalConfirm) return;
  const typedValue = String(deleteModalConfirmInput?.value || "").trim().toLowerCase();
  const expectedValue = deleteModalExpectedText.toLowerCase();
  deleteModalConfirm.disabled = typedValue !== expectedValue || !expectedValue;
});

deleteModalConfirm?.addEventListener('click', async () => {
  if (deletePendingId) {
    const idToDelete = deletePendingId;
    bets = bets.filter((bet) => bet.id !== idToDelete);
    saveBets();
    await excluirApostaBD(idToDelete);
    refreshAll();
    closeDeleteModal();
  }
});

// ========================
// AI RANKING
// ========================
  function renderAIRanking() {
  const container = document.getElementById('ai-ranking-grid');
  if (!container) return;

  const scopedBets = getBoostScopedBets();
  const settledStatuses = new Set(['win', 'loss', 'cashout', 'void']);
  const configuredAiNames = sanitizeAiOptions(settings?.aiOptions);
  const usedAiNames = scopedBets.reduce((acc, bet) => {
    if (!bet.ai) return acc;
    bet.ai
      .split(',')
      .map((name) => name.trim())
      .map((name) => (name === 'Opus 4' ? 'Claude' : name))
      .filter(Boolean)
      .forEach((name) => acc.push(name));
    return acc;
  }, []);
  const aiNames = [];
  const seenAi = new Set();

  [...configuredAiNames, ...usedAiNames].forEach((name) => {
    const normalized = normalizeAiName(name);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seenAi.has(key)) return;
    seenAi.add(key);
    aiNames.push(normalized);
  });
  
  const aiStats = aiNames.map(name => {
    const aiBets = scopedBets.filter(b => {
        if (!b.ai || !settledStatuses.has(b.status)) return false;
        const aisList = b.ai
          .split(',')
          .map(a => a.trim())
          .map((aiName) => (aiName === 'Opus 4' ? 'Claude' : aiName));
        return aisList.includes(name);
    });

    const wins = aiBets.filter(b => b.status === 'win').length;
    const losses = aiBets.filter(b => b.status === 'loss').length;
    const total = aiBets.length;
    const winrate = total > 0 ? wins / total : 0;
    const profit = aiBets.reduce((sum, b) => sum + calcProfit(b), 0);
    
    return { name, wins, losses, total, winrate, profit };
  });

  // Ordenação (quem tem mais taxa de acerto fica em primeiro)
  aiStats.sort((a, b) => {
    if (b.winrate !== a.winrate) return b.winrate - a.winrate;
    return b.total - a.total;
  });

  const medals = ['\ud83e\udd47', '\ud83e\udd48', '\ud83e\udd49'];

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
        <span>Lucro: <strong style="color: ${ai.profit >= 0 ? 'var(--success)' : 'var(--danger)'}">${formatProfit(ai.profit)}</strong></span>
      </div>
    </div>
  `).join('');
}
 

// ========================
// WEEKDAY PERFORMANCE
// ========================
function renderWeekdayPerformance() {
  const container = document.getElementById('weekday-grid');
  if (!container) return;
  const scopedBets = getBoostScopedBets();

  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'S\u00e1b'];
  const dayFullNames = ['Domingo', 'Segunda', 'Ter\u00e7a', 'Quarta', 'Quinta', 'Sexta', 'S\u00e1bado'];

  const dayStats = dayNames.map((_, index) => {
    const dayBets = scopedBets.filter(b => {
      if (b.status !== 'win' && b.status !== 'loss' && b.status !== 'cashout' && b.status !== 'void') return false;
      const betDate = parseDateForSort(b.date);
      if (!betDate) return false;
      return betDate.getDay() === index;
    });
    const wins = dayBets.filter(b => b.status === 'win' || b.status === 'cashout').length;
    const total = dayBets.length;
    const winrate = total > 0 ? wins / total : 0;
    const profit = dayBets.reduce((sum, b) => sum + calcProfit(b), 0);
    return { dayIndex: index, name: dayNames[index], fullName: dayFullNames[index], wins, total, winrate, profit };
  });

  // Find best and worst days
  const daysWithBets = dayStats.filter(d => d.total > 0);
  let bestDay = null;
  let worstDay = null;
  if (daysWithBets.length > 0) {
    bestDay = daysWithBets.reduce((a, b) => a.profit > b.profit ? a : b).dayIndex;
    worstDay = daysWithBets.reduce((a, b) => a.profit < b.profit ? a : b).dayIndex;
  }

  container.innerHTML = dayStats.map(day => {
    const isBest = day.dayIndex === bestDay;
    const isWorst = day.dayIndex === worstDay && bestDay !== worstDay;
    const profitClass = day.profit > 0 ? 'positive' : day.profit < 0 ? 'negative' : '';
    return `
      <div class="weekday-card ${isBest ? 'best' : ''} ${isWorst ? 'worst' : ''}">
        <span class="weekday-name">${day.name}</span>
        <span class="weekday-profit ${profitClass}">${day.total > 0 ? formatProfit(day.profit) : '-'}</span>
        <span class="weekday-detail">${day.total} aposta${day.total !== 1 ? 's' : ''}</span>
        <span class="weekday-winrate">${day.total > 0 ? percentFormatter.format(day.winrate) : '-'}</span>
        ${isBest ? '<span style="font-size:0.65rem;color:var(--success)">\u2b50 Melhor</span>' : ''}
        ${isWorst ? '<span style="font-size:0.65rem;color:var(--danger)">\u26a0\ufe0f Pior</span>' : ''}
      </div>
    `;
  }).join('');
}

// ========================
// PROFIT GOALS
// ========================
let profitGoals = { weekly: 0, monthly: 0 };
let goalsSaveTimer = null;
let goalsSaveRequestSeq = 0;

function normalizeGoals(raw) {
  const weekly = Number(raw?.weekly);
  const monthly = Number(raw?.monthly);
  return {
    weekly: Number.isFinite(weekly) ? weekly : 0,
    monthly: Number.isFinite(monthly) ? monthly : 0,
  };
}

async function loadGoals() {
  const localRaw = localStorage.getItem(getGoalsKey());
  if (localRaw) {
    try {
      profitGoals = normalizeGoals(JSON.parse(localRaw));
    } catch (e) {
      profitGoals = { weekly: 0, monthly: 0 };
    }
  }

  try {
    const resposta = await fetch('api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'carregar_dados_extras', profile_id: getActiveProfileId() })
    });
    const json = await resposta.json();
    const fromApi = (json.sucesso && json.dados && json.dados.goals_json)
      ? JSON.parse(json.dados.goals_json)
      : null;
    if (fromApi) {
      profitGoals = normalizeGoals(fromApi);
      localStorage.setItem(getGoalsKey(), JSON.stringify(profitGoals));
    }
  } catch (e) {
    // Mantém fallback local quando API falhar.
  }
  
  const weeklyInput = document.getElementById('weekly-goal-input');
  const monthlyInput = document.getElementById('monthly-goal-input');
  if (weeklyInput && profitGoals.weekly > 0) weeklyInput.value = numberFormatter.format(profitGoals.weekly);
  if (monthlyInput && profitGoals.monthly > 0) monthlyInput.value = numberFormatter.format(profitGoals.monthly);
}

async function saveGoals() {
  profitGoals = normalizeGoals(profitGoals);
  localStorage.setItem(getGoalsKey(), JSON.stringify(profitGoals));

  const requestSeq = ++goalsSaveRequestSeq;
  try {
    const resposta = await fetch('api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'salvar_dados_extras', profile_id: getActiveProfileId(), tipo: 'goals', valor: JSON.stringify(profitGoals) })
    });
    const json = await resposta.json();
    if (requestSeq !== goalsSaveRequestSeq) return;
    if (!json?.sucesso) {
      console.warn('Falha ao salvar metas no servidor. Mantendo backup local.');
    }
  } catch (e) {
    if (requestSeq !== goalsSaveRequestSeq) return;
    console.warn('Erro ao salvar metas no servidor. Mantendo backup local.', e);
  }
}

function queueSaveGoals() {
  if (goalsSaveTimer) {
    clearTimeout(goalsSaveTimer);
  }
  goalsSaveTimer = setTimeout(() => {
    saveGoals();
  }, 350);
}

function renderProfitGoals() {
  const now = new Date();

  const applyGoalValueTone = (element, value) => {
    if (!element) return;
    element.classList.remove('positive', 'negative');
    if (value > 0) element.classList.add('positive');
    if (value < 0) element.classList.add('negative');
  };
  
  // Week start (Sunday)
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  
  // Month start
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Calculate weekly profit
  const weeklyProfit = bets
    .filter(b => {
      if (b.status !== 'win' && b.status !== 'loss' && b.status !== 'cashout' && b.status !== 'void') return false;
      const d = parseDateForSort(b.date);
      return d && d >= weekStart;
    })
    .reduce((sum, b) => sum + calcProfit(b), 0);

  // Calculate monthly profit
  const monthlyProfit = bets
    .filter(b => {
      if (b.status !== 'win' && b.status !== 'loss' && b.status !== 'cashout' && b.status !== 'void') return false;
      const d = parseDateForSort(b.date);
      return d && d >= monthStart;
    })
    .reduce((sum, b) => sum + calcProfit(b), 0);

  // Update weekly
  const weeklyGoalCurrent = document.getElementById('weekly-goal-current');
  const weeklyGoalBar = document.getElementById('weekly-goal-bar');
  const weeklyGoalPercent = document.getElementById('weekly-goal-percent');

  if (weeklyGoalCurrent) weeklyGoalCurrent.textContent = formatProfit(weeklyProfit);
  applyGoalValueTone(weeklyGoalCurrent, weeklyProfit);
  
  const weeklyPct = profitGoals.weekly > 0 ? Math.max(0, (weeklyProfit / profitGoals.weekly) * 100) : 0;
  if (weeklyGoalBar) {
    weeklyGoalBar.style.width = `${Math.min(weeklyPct, 100)}%`;
    weeklyGoalBar.className = `progress-bar ${weeklyPct >= 100 ? 'exceeded' : ''}`;
  }
  if (weeklyGoalPercent) {
    weeklyGoalPercent.textContent = `${Math.round(weeklyPct)}% atingido`;
    weeklyGoalPercent.classList.toggle('reached', weeklyPct >= 100);
  }

  // Update monthly
  const monthlyGoalCurrent = document.getElementById('monthly-goal-current');
  const monthlyGoalCurrentPanel = document.getElementById('monthly-goal-current-panel');
  const monthlyGoalTarget = document.getElementById('monthly-goal-target');
  const monthlyGoalBar = document.getElementById('monthly-goal-bar');
  const monthlyGoalPercent = document.getElementById('monthly-goal-percent');

  if (monthlyGoalCurrent) monthlyGoalCurrent.textContent = formatProfit(monthlyProfit);
  if (monthlyGoalCurrentPanel) monthlyGoalCurrentPanel.textContent = formatProfit(monthlyProfit);
  applyGoalValueTone(monthlyGoalCurrent, monthlyProfit);
  applyGoalValueTone(monthlyGoalCurrentPanel, monthlyProfit);
  if (monthlyGoalTarget) monthlyGoalTarget.textContent = `de ${formatProfit(profitGoals.monthly)}`;
  
  const monthlyPct = profitGoals.monthly > 0 ? Math.max(0, (monthlyProfit / profitGoals.monthly) * 100) : 0;
  if (monthlyGoalBar) {
    monthlyGoalBar.style.width = `${Math.min(monthlyPct, 100)}%`;
    monthlyGoalBar.className = `progress-bar ${monthlyPct >= 100 ? 'exceeded' : ''}`;
  }
  if (monthlyGoalPercent) {
    monthlyGoalPercent.textContent = `${Math.round(monthlyPct)}% atingido`;
    monthlyGoalPercent.classList.toggle('reached', monthlyPct >= 100);
  }
}

// Goal input listeners
const weeklyGoalInput = document.getElementById('weekly-goal-input');
const monthlyGoalInput = document.getElementById('monthly-goal-input');

weeklyGoalInput?.addEventListener('input', () => {
  profitGoals.weekly = parseLocaleNumber(weeklyGoalInput.value) || 0;
  queueSaveGoals();
  renderProfitGoals();
});

monthlyGoalInput?.addEventListener('input', () => {
  profitGoals.monthly = parseLocaleNumber(monthlyGoalInput.value) || 0;
  queueSaveGoals();
  renderProfitGoals();
});

// ========================
// FINALIZED BETS LIST
// ========================
function renderFinalizedBets() {
  const container = document.getElementById('finalized-bets-list');
  if (!container) return;

  const settled = bets
        .filter((bet) => {
          const boostFilterValue = boostFilter?.value || "all";
          if (boostFilterValue === "boost") return Boolean(bet.isBoost);
          if (boostFilterValue === "no-boost") return !Boolean(bet.isBoost);
          return true;
        })
    .filter(b => b.status === 'win' || b.status === 'loss' || b.status === 'cashout' || b.status === 'void')
    .slice()
    .sort((a, b) => {
      const aDate = parseDateForSort(a.date);
      const bDate = parseDateForSort(b.date);
      if (aDate && bDate) return bDate - aDate;
      return 0;
    });

  if (settled.length === 0) {
    container.innerHTML = '<p class="empty-message">Nenhuma aposta finalizada ainda.</p>';
    return;
  }

  container.innerHTML = settled.map(bet => {
    const profit = calcProfit(bet);
    const profitClass = profit > 0 ? 'positive' : profit < 0 ? 'negative' : '';
    const stakeValue = Number.isFinite(Number(bet.stake)) ? Number(bet.stake) : 0;
    const aiChips = bet.ai
      ? bet.ai
          .split(",")
          .map(ai => ai.trim())
          .filter(Boolean)
          .map(ai => `<span class="fbet-ai">${ai}</span>`)
          .join("")
      : '';
    return `
      <div class="finalized-bet-item">
        <div class="fbet-main">
          <span class="fbet-event">${bet.event}</span>
          <div class="fbet-meta-row">
            <span class="fbet-date">${bet.date}</span>
            <span class="fbet-odd">${numberFormatter.format(bet.odds)}x</span>
            ${aiChips ? `<span class="fbet-ai-list">${aiChips}</span>` : ''}
            <span class="fbet-status-badge ${bet.status}">${statusLabel(bet.status)}</span>
          </div>
        </div>
        <div class="fbet-side">
          <div class="fbet-money">
            <span class="fbet-profit ${profitClass}">${formatProfit(profit)}</span>
            <span class="fbet-stake">stake ${formatStake(stakeValue)}</span>
          </div>
          <button type="button" class="quick-action" data-action="clone" data-id="${bet.id}">Clonar</button>
          <button type="button" class="quick-action danger" data-action="delete" data-id="${bet.id}">Apagar</button>
        </div>
      </div>
    `;
  }).join('');
}

// Quick Notes (Anotações Rápidas)
async function loadQuickNotes() {
  const notesTextarea = document.getElementById("quick-notes");
  if (!notesTextarea) return;
  try {
    const resposta = await fetch('api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'carregar_dados_extras', profile_id: getActiveProfileId() })
    });
    const json = await resposta.json();
    notesTextarea.value = (json.sucesso && json.dados && json.dados.notes) ? json.dados.notes : "";
  } catch (e) { notesTextarea.value = ""; }
}
async function saveQuickNotes() {
  const notesTextarea = document.getElementById("quick-notes");
  const notesStatus = document.getElementById("quick-notes-status");
  if (!notesTextarea) return;
  
  await fetch('api.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acao: 'salvar_dados_extras', profile_id: getActiveProfileId(), tipo: 'notes', valor: notesTextarea.value })
  });
  
  if (notesStatus) {
    notesStatus.textContent = "✓ Salvo";
    notesStatus.className = "notes-status saved";
    setTimeout(() => { notesStatus.textContent = ""; notesStatus.className = "notes-status"; }, 2000);
  }
}

// Auto-save anotações ao digitar (debounce)
let quickNotesTimeout = null;
const quickNotesTextarea = document.getElementById("quick-notes");
quickNotesTextarea?.addEventListener("input", () => {
  const notesStatus = document.getElementById("quick-notes-status");
  if (notesStatus) {
    notesStatus.textContent = "...";
    notesStatus.className = "notes-status";
  }
  
  clearTimeout(quickNotesTimeout);
  quickNotesTimeout = setTimeout(() => {
    saveQuickNotes();
  }, 1000);
});

form?.addEventListener("submit", handleSubmit);
resetButton?.addEventListener("click", resetForm);

// Toggle cashout value field visibility
const betStatusSelect = document.getElementById("bet-status");
betStatusSelect?.addEventListener("change", (e) => {
  const cashoutLabel = document.getElementById("cashout-value-label");
  if (cashoutLabel) {
    cashoutLabel.style.display = e.target.value === "cashout" ? "" : "none";
  }
});

["bet-stake", "bet-odds"].forEach((id) => {
  const input = document.getElementById(id);
  input?.addEventListener("input", updatePotentialProfit);
});

bankrollInput?.addEventListener("input", handleBankrollInput);
statusFilter?.addEventListener("change", resetBetsPaginationAndRefresh);
betSearchInput?.addEventListener("input", resetBetsPaginationAndRefresh);
document.getElementById("category-filter")?.addEventListener("change", resetBetsPaginationAndRefresh);
boostFilter?.addEventListener("change", resetBetsPaginationAndRefresh);
dateFilterStart?.addEventListener("change", resetBetsPaginationAndRefresh);
dateFilterEnd?.addEventListener("change", resetBetsPaginationAndRefresh);
bookFilter?.addEventListener("change", resetBetsPaginationAndRefresh);
clearDateFilter?.addEventListener("click", () => {
  if (dateFilterStart) dateFilterStart.value = "";
  if (dateFilterEnd) dateFilterEnd.value = "";
  resetBetsPaginationAndRefresh();
});
betsBody?.addEventListener("click", handleTableClick);
betsMobileList?.addEventListener("click", handleTableClick);
finalizedBetsList?.addEventListener("click", handleTableClick);
document.getElementById("bets-table-head")?.addEventListener("click", handleTableSortClick);
betsPagePrevButton?.addEventListener("click", () => {
  if (betsCurrentPage <= 1) return;
  betsCurrentPage -= 1;
  renderTable();
});
betsPageNextButton?.addEventListener("click", () => {
  betsCurrentPage += 1;
  renderTable();
});

const aiSelector = document.getElementById("bet-ai-selector");
if (aiSelector) {
  aiSelector.addEventListener("change", () => syncAiChipStates(aiSelector));
  syncAiChipStates(aiSelector);
}

const mobileMenuBtn = document.getElementById("mobile-menu-btn");
const mobileOverlay = document.getElementById("mobile-overlay");
const appSidebar = document.getElementById("app-sidebar");
const sidebarLinkBets = document.getElementById("sidebar-link-bets");
const sidebarLinkCalendar = document.getElementById("sidebar-link-calendar");
const topbarTitle = document.querySelector(".topbar-title");

const newBetShortcut = document.getElementById("new-bet-shortcut");
newBetShortcut?.addEventListener("click", () => {
  if (window.location.hash) {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
  setSidebarSection("bets");
  document.getElementById("new-bet-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
});

sidebarLinkCalendar?.addEventListener("click", (event) => {
  event.preventDefault();
  window.location.hash = "calendar-section";
  handleHashSection();
});

sidebarLinkBets?.addEventListener("click", (event) => {
  event.preventDefault();
  history.replaceState(null, "", window.location.pathname + window.location.search);
  setSidebarSection("bets");
  window.scrollTo({ top: 0, behavior: "smooth" });
});

window.addEventListener("hashchange", handleHashSection);

function setSidebarSection(section) {
  if (sidebarLinkBets) sidebarLinkBets.classList.toggle("active", section === "bets");
  if (sidebarLinkCalendar) sidebarLinkCalendar.classList.toggle("active", section === "calendar");
  if (topbarTitle) topbarTitle.textContent = section === "calendar" ? "Calendário" : "Apostas";
}

function scrollToSectionWithOffset(elementId) {
  const target = document.getElementById(elementId);
  if (!target) return;
  const topOffset = 70;
  const top = target.getBoundingClientRect().top + window.scrollY - topOffset;
  window.scrollTo({ top, behavior: "smooth" });
}

function handleHashSection() {
  const hash = (window.location.hash || "").toLowerCase();
  const isCalendarHash = hash === "#calendar-section" || hash === "#calendar-container";
  setSidebarSection(isCalendarHash ? "calendar" : "bets");
  if (isCalendarHash) {
    scrollToSectionWithOffset("calendar-section");
  }
}

mobileMenuBtn?.addEventListener("click", () => {
  appSidebar?.classList.toggle("open");
  mobileOverlay?.classList.toggle("show");
});

mobileOverlay?.addEventListener("click", () => {
  appSidebar?.classList.remove("open");
  mobileOverlay?.classList.remove("show");
});

document.getElementById("theme-toggle")?.addEventListener("click", toggleTheme);

// Calendar event listeners
calendarViewSelect?.addEventListener('change', (e) => {
  calendarView = e.target.value;
  renderCalendar();
});

calendarPrev?.addEventListener('click', () => handleCalendarNavigation(-1));
calendarNext?.addEventListener('click', () => handleCalendarNavigation(1));

// ========================
// IMPORTAÇÃO DE CUPOM - OCR GRATUITO + GEMINI OPCIONAL
// ========================
const GEMINI_API_KEY_STORAGE = "caderneta.gemini.apikey";
const importCouponBtn = document.getElementById("import-coupon-btn");
const couponFileInput = document.getElementById("coupon-file-input");
const importCouponSection = document.querySelector(".import-coupon-section");
const importStatus = document.getElementById("import-status");
const importProgress = document.getElementById("import-progress");
const importProgressBar = document.getElementById("import-progress-bar");
const importProgressText = document.getElementById("import-progress-text");

function showImportStatus(message, type) {
  if (!importStatus) return;
  
  importStatus.textContent = message;
  importStatus.className = `import-status show ${type}`;
  
  if (type !== "info") {
    setTimeout(() => {
      importStatus.className = "import-status";
    }, 8000);
  }
}

function showProgress(percent, text) {
  if (!importProgress) return;
  importProgress.style.display = "block";
  if (importProgressBar) importProgressBar.style.width = `${percent}%`;
  if (importProgressText) importProgressText.textContent = text || `${Math.round(percent)}%`;
}

function hideProgress() {
  if (importProgress) importProgress.style.display = "none";
}

function getGeminiApiKey() {
  return localStorage.getItem(GEMINI_API_KEY_STORAGE);
}

// ---- PARSER DE TEXTO OCR ----
function parseBetFromText(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  const fullText = lines.join(" ");
  
  const result = {
    evento: null,
    odd: null,
    stake: null,
    casa: null,
    data: null,
    tipo_aposta: null,
  };
  
  // Detectar casa de apostas
  const casas = [
    { patterns: ["bet365"], name: "Bet365" },
    { patterns: ["betano"], name: "Betano" },
    { patterns: ["sportingbet"], name: "Sportingbet" },
    { patterns: ["betfair"], name: "Betfair" },
    { patterns: ["pixbet"], name: "PixBet" },
    { patterns: ["stake"], name: "Stake" },
    { patterns: ["pinnacle"], name: "Pinnacle" },
    { patterns: ["1xbet"], name: "1xBet" },
    { patterns: ["novibet"], name: "Novibet" },
    { patterns: ["betnacional"], name: "BetNacional" },
    { patterns: ["estrela ?bet"], name: "EstrelaBet" },
    { patterns: ["casa ?de ?apostas", "casadeapostas"], name: "Casa de Apostas" },
    { patterns: ["superbet"], name: "Superbet" },
    { patterns: ["f12\\.?bet", "f12bet"], name: "F12.bet" },
    { patterns: ["galera\\.?bet", "galerabet"], name: "Galera.bet" },
    { patterns: ["mr\\.?jack", "mrjack"], name: "Mr. Jack Bet" },
    { patterns: ["parimatch"], name: "Parimatch" },
    { patterns: ["rivalry"], name: "Rivalry" },
    { patterns: ["luva\\.?bet", "luvabet"], name: "Luva.bet" },
    { patterns: ["aposta ?ganha"], name: "Aposta Ganha" },
  ];
  
  const lowerText = fullText.toLowerCase();
  for (const casa of casas) {
    for (const pattern of casa.patterns) {
      if (new RegExp(pattern, "i").test(lowerText)) {
        result.casa = casa.name;
        break;
      }
    }
    if (result.casa) break;
  }
  
  // Detectar data (DD/MM/AAAA ou DD/MM/AA ou DD.MM.AAAA)
  const dateMatch = fullText.match(/(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})/);
  if (dateMatch) {
    let [, day, month, year] = dateMatch;
    if (year.length === 2) year = "20" + year;
    result.data = `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${year}`;
  }
  
  // --- DETECTAR STAKE (valores com R$) ---
  const valoresMonetarios = new Set();
  const monetaryRegex = /R\$\s*(\d+[.,]?\d*)/gi;
  let mMatch;
  while ((mMatch = monetaryRegex.exec(fullText)) !== null) {
    const val = parseFloat(mMatch[1].replace(",", "."));
    if (val > 0) valoresMonetarios.add(val);
  }
  
  const stakeMatch = fullText.match(/(?:simples|aposta)\s+R?\$?\s*(\d+[.,]?\d*)/i)
    || fullText.match(/(?:aposta|valor|stake|investido)\s*[:=]?\s*R?\$?\s*(\d+[.,]?\d*)/i)
    || fullText.match(/R\$\s*(\d+[.,]?\d*)/i);
  if (stakeMatch) {
    const val = parseFloat(stakeMatch[1].replace(",", "."));
    if (val > 0 && val < 100000) result.stake = val;
  }
  
  // --- DETECTAR ODD ---
  // Coletar TODOS os números decimais do texto inteiro
  const todosNumeros = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Encontrar todos os números decimais na linha
    const regex = /(\d{1,3})[.,](\d{1,3})/g;
    let numMatch;
    while ((numMatch = regex.exec(line)) !== null) {
      const raw = numMatch[0];
      const val = parseFloat(raw.replace(",", "."));
      // Verificar se NÃO é precedido por R$ na mesma posição
      const before = line.substring(Math.max(0, numMatch.index - 3), numMatch.index);
      const isPrecededByRS = /R\$\s*$/.test(before);
      // Verificar se NÃO faz parte de um ID longo (número com mais de 5 dígitos)
      // Checar apenas caracteres IMEDIATAMENTE adjacentes (sem espaço)
      const charBefore = numMatch.index > 0 ? line[numMatch.index - 1] : ' ';
      const charAfter = numMatch.index + raw.length < line.length ? line[numMatch.index + raw.length] : ' ';
      const isPartOfLongNumber = /\d/.test(charBefore) || /\d/.test(charAfter);
      // Verificar se NÃO faz parte de uma data
      const isDate = /\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4}/.test(
        line.substring(Math.max(0, numMatch.index - 6), numMatch.index + raw.length + 6)
      );
      // Verificar se NÃO faz parte de horário (HH:MM)
      const isTime = /\d{1,2}:\d{2}/.test(
        line.substring(Math.max(0, numMatch.index - 3), numMatch.index + raw.length + 3)
      );
      
      // Verificar se faz parte de um nome de mercado (ex: "Mais de 3.5", "Over 2.5", "Menos de 1.5")
      const beforeMarket = line.substring(Math.max(0, numMatch.index - 15), numMatch.index);
      const isMarketNumber = /(?:mais\s+de|menos\s+de|over|under|acima\s+de|abaixo\s+de|[+-])\s*$/i.test(beforeMarket);
      
      todosNumeros.push({
        val,
        raw,
        line: i,
        isPrecededByRS,
        isPartOfLongNumber,
        isDate,
        isTime,
        isMarketNumber,
        isMonetary: valoresMonetarios.has(val),
        lineText: line,
      });
    }
  }
  
  // Contar frequência de cada valor candidato a odd
  const oddCandidates = todosNumeros.filter(n => 
    n.val >= 1.01 && n.val <= 500 && !n.isPrecededByRS && !n.isMonetary && !n.isDate && !n.isTime && !n.isPartOfLongNumber && !n.isMarketNumber
  );
  
  // Prioridade 1: se um valor aparece mais de uma vez, provavelmente é a odd real
  if (oddCandidates.length > 0) {
    const freq = {};
    for (const n of oddCandidates) {
      freq[n.val] = (freq[n.val] || 0) + 1;
    }
    // Encontrar o valor com maior frequência
    let bestOdd = null;
    let bestFreq = 0;
    for (const [val, count] of Object.entries(freq)) {
      if (count > bestFreq) {
        bestFreq = count;
        bestOdd = parseFloat(val);
      }
    }
    // Se algum valor aparece 2+ vezes, usar esse; senão usar o primeiro candidato
    if (bestFreq >= 2) {
      result.odd = bestOdd;
    } else {
      result.odd = oddCandidates[0].val;
    }
  }
  
  // Prioridade 2: qualquer número decimal entre 1.01 e 500 que não é monetário e não é mercado
  if (!result.odd) {
    for (const n of todosNumeros) {
      if (n.val >= 1.01 && n.val <= 500 && !n.isMonetary && !n.isDate && !n.isTime && !n.isMarketNumber) {
        result.odd = n.val;
        break;
      }
    }
  }
  
  // Prioridade 3: OCR frequentemente lê odds sem o ponto decimal (1.18 → 118, 2.50 → 250)
  // Buscar APENAS números inteiros de 3-4 dígitos (2 dígitos é ambíguo demais, ex: "12" pode ser qualquer coisa)
  if (!result.odd) {
    for (const line of lines) {
      // Ignorar linhas com R$ (monetárias), IDs longos, datas, linhas de mercado
      if (/R\$/.test(line) && !/simples/i.test(line)) continue;
      if (/\bID\b/i.test(line)) continue;
      if (/(?:mais\s+de|menos\s+de|over|under|acima|abaixo)/i.test(line)) continue;
      
      // Buscar números inteiros isolados (3-4 dígitos apenas)
      const intNums = line.match(/(?:^|[\s©@:])(\d{3,4})(?:[\s,.|]|$)/g);
      if (intNums) {
        for (const raw of intNums) {
          const digits = raw.replace(/[^\d]/g, "");
          const num = parseInt(digits, 10);
          
          // Ignorar se for ano (2020-2035), horário ou ID
          if (num >= 2020 && num <= 2035) continue;
          if (num > 2400) continue; // Muito grande para ser odd
          
          // Tentar inserir ponto decimal: 118 → 1.18, 172 → 1.72, 250 → 2.50
          let possibleOdd = null;
          if (digits.length === 3) {
            possibleOdd = parseFloat(digits[0] + "." + digits.slice(1)); // 172 → 1.72
          } else if (digits.length === 4) {
            possibleOdd = parseFloat(digits.slice(0, 2) + "." + digits.slice(2)); // 1250 → 12.50
          }
          
          if (possibleOdd && possibleOdd >= 1.01 && possibleOdd <= 500) {
            // Verificar que esse número não é um valor monetário
            if (!valoresMonetarios.has(num) && !valoresMonetarios.has(possibleOdd)) {
              result.odd = possibleOdd;
              break;
            }
          }
        }
      }
      if (result.odd) break;
    }
  }
  

  
  // Detectar evento - procurar padrão "Time A - Time B" ou "Time A vs Time B" ou "Time A x Time B"
  const eventPatterns = [
    // Separador deve ser: " - ", " x ", " vs ", " vs. " (com espaços ao redor)
    /([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú]?[a-zà-ú]+)*)\s+(?:-|x|vs\.?)\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú]?[a-zà-ú]+)*)/,
    // Também aceitar "Time A-Time B" (sem espaço mas com hífen)
    /([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú]?[a-zà-ú]+)*)\s*-\s*([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú]?[a-zà-ú]+)*)/,
  ];
  
  // Frases/linhas comuns em cupons que NÃO são nomes de times
  const frasesIgnorar = /ganhos?\s*potencia|lucro\s*potencia|mais\s+detalhes|aposta\s+realizada|compartilh|notifica[çc]|manter|fechar|total\s+de\s+cart|resultado\s+final|dupla\s+chance|simples|m[úu]ltipla|ganhos|potenciais|sucesso|cart[õo]es\s+mais|mais.{0,3}menos/i;
  
  // Palavras que NÃO são nomes de times
  const palavrasNaoTimes = /^(ganhos?|potenciais?|lucro|total|mais|menos|simples|resultado|detalhes|aposta|valor|over|under|fechar|manter|compartilhar|notifica)$/i;
  
  for (const line of lines) {
    // Ignorar linhas que contêm frases comuns de cupom
    if (frasesIgnorar.test(line)) continue;
    
    for (const pattern of eventPatterns) {
      const match = line.match(pattern);
      if (match) {
        const team1 = match[1].trim();
        const team2 = match[2].trim();
        // Ignorar se parecer com data, valor monetário, ou palavra comum
        if (team1.length > 2 && team2.length > 2 && !/^\d/.test(team1) && !/^\d/.test(team2)
            && !palavrasNaoTimes.test(team1) && !palavrasNaoTimes.test(team2)) {
          result.evento = `${team1} - ${team2}`;
          break;
        }
      }
    }
    if (result.evento) break;
  }
  
  // Detectar tipo de aposta / mercado
  const mercados = [
    { patterns: ["resultado final", "1x2", "match result"], name: "Resultado Final" },
    { patterns: ["dupla chance", "double chance"], name: "Dupla Chance" },
    { patterns: ["over", "acima", "mais de"], name: "Over" },
    { patterns: ["under", "abaixo", "menos de"], name: "Under" },
    { patterns: ["ambas marcam", "btts", "both teams"], name: "Ambas Marcam" },
    { patterns: ["handicap"], name: "Handicap" },
    { patterns: ["escanteio", "corner"], name: "Escanteios" },
    { patterns: ["cart.{0,3}o", "card"], name: "Cartões" },
    { patterns: ["intervalo", "half.?time", "1.{0,2}tempo"], name: "Intervalo" },
    { patterns: ["gols", "goals", "total de gols"], name: "Gols" },
    { patterns: ["vencedor", "winner", "moneyline"], name: "Vencedor" },
  ];
  
  for (const mercado of mercados) {
    for (const pattern of mercado.patterns) {
      if (new RegExp(pattern, "i").test(fullText)) {
        result.tipo_aposta = mercado.name;
        break;
      }
    }
    if (result.tipo_aposta) break;
  }
  
  return result;
}

// ---- OCR COM TESSERACT.JS (GRATUITO) ----
async function extractBetWithTesseract(imageUrl) {
  try {
    showProgress(10, "Carregando OCR...");
    
    const worker = await Tesseract.createWorker("por+eng", 1, {
      logger: (m) => {
        if (m.status === "recognizing text") {
          const pct = Math.round(m.progress * 80) + 10;
          showProgress(pct, `Lendo texto... ${Math.round(m.progress * 100)}%`);
        }
      },
    });
    
    showProgress(20, "Analisando imagem...");
    const { data } = await worker.recognize(imageUrl);
    
    showProgress(90, "Extraindo dados...");
    await worker.terminate();
    
    const betData = parseBetFromText(data.text);
    
    showProgress(100, "Concluído!");
    
    return betData;
  } catch (error) {
    console.error("Erro Tesseract:", error);
    throw error;
  }
}

// ---- OCR COM GEMINI (OPCIONAL, MAIS PRECISO) ----
async function resolveGeminiModel(apiKey) {
  const saved = localStorage.getItem("caderneta.gemini.model");
  if (saved) return saved;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      { method: "GET" }
    );
    if (!response.ok) return null;
    const data = await response.json();
    const models = Array.isArray(data.models) ? data.models : [];
    const generative = models.filter((m) =>
      m.supportedGenerationMethods?.includes("generateContent")
    );
    const preferred = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-pro"];
    for (const pref of preferred) {
      const match = generative.find((m) => m.name?.includes(pref));
      if (match) return match.name;
    }
    return generative[0]?.name || null;
  } catch (err) {
    return null;
  }
}

async function extractBetWithGemini(imageBase64, mimeType) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return null;
  
  const prompt = `Analise esta imagem de um cupom/comprovante de aposta esportiva e extraia as seguintes informações em formato JSON:

{
  "evento": "Time A - Time B",
  "odd": número decimal da odd (ex: 1.85),
  "stake": valor apostado em reais sem símbolo (ex: 50.00),
  "casa": "Nome da casa de apostas (ex: Bet365, Betano, Sportingbet)",
  "data": "Data da aposta no formato DD/MM/AAAA",
  "tipo_aposta": "Mercado + seleção apostada (ex: Resultado Final Arsenal, Over 2.5 gols, Ambas Marcam Sim)"
}

REGRAS IMPORTANTES:
- Retorne APENAS o JSON, sem explicações ou markdown
- Se não conseguir identificar algum campo, use null
- A odd deve ser um número decimal (use ponto como separador)
- O stake deve ser apenas o número, sem R$ ou símbolos
- O campo "evento" deve conter APENAS os nomes dos times/jogadores separados por " - " (ex: "Arsenal - Sunderland"). NÃO inclua mercados, seleções ou promoções no evento.
- O campo "tipo_aposta" deve conter o mercado E a seleção apostada. Exemplos:
  * Se apostou no Arsenal no resultado final: "Resultado Final Arsenal"
  * Se apostou em Over 2.5 gols: "Over 2.5 gols"
  * Se apostou em Ambas Marcam Sim: "Ambas Marcam Sim"
  * Se apostou no empate: "Resultado Final Empate"
  * Se apostou em handicap -1.5 Arsenal: "Handicap -1.5 Arsenal"
  IGNORE nomes de promoções como "SuperOdds", "Odds Turbinadas", "Boost", etc.
- Se houver múltiplas apostas (aposta múltipla/combo), extraia apenas os dados gerais: odd total, stake total
- Para o evento em aposta múltipla, liste os eventos separados por " + "
- Se a data não estiver visível, use null`;

  const model = await resolveGeminiModel(apiKey);
  if (!model) return null;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: imageBase64 } }
          ]
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1024 }
      })
    }
  );
  
  if (!response.ok) return null;
  
  const data = await response.json();
  const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textResponse) return null;
  
  return parseGeminiJsonResponse(textResponse);
}

function parseGeminiJsonResponse(textResponse) {
  const normalized = textResponse
    .replace(/```json\n?/gi, "")
    .replace(/```\n?/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();

  const tryParse = (value) => {
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  const direct = tryParse(normalized);
  if (direct) return direct;

  const start = normalized.indexOf("{");
  const end = normalized.lastIndexOf("}");
  if (start !== -1 && end > start) {
    const extracted = normalized.slice(start, end + 1);
    const withoutTrailingCommas = extracted.replace(/,\s*([}\]])/g, "$1");
    const parsed = tryParse(withoutTrailingCommas);
    if (parsed) return parsed;
  }

  throw new Error("Resposta inválida da IA ao extrair o cupom.");
}

// ---- PREENCHIMENTO DO FORMULÁRIO ----
function fillFormWithBetData(betData) {
  if (!betData) return;
  
  if (betData.data) {
    const parts = betData.data.split("/");
    if (parts.length === 3) {
      document.getElementById("bet-date").value = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
    }
  } else {
    document.getElementById("bet-date").value = new Date().toISOString().split("T")[0];
  }
  
  if (betData.evento) {
    let eventText = betData.evento;
    if (betData.tipo_aposta) eventText += ` - ${betData.tipo_aposta}`;
    document.getElementById("bet-event").value = eventText;
  }
  
  if (betData.odd != null) {
    document.getElementById("bet-odds").value = numberFormatter.format(betData.odd);
  }
  
  if (betData.stake != null) {
    document.getElementById("bet-stake").value = numberFormatter.format(betData.stake);
  }
  
  if (betData.casa) {
    document.getElementById("bet-book").value = betData.casa;
  }
  
  document.getElementById("bet-status").value = "pending";
  updatePotentialProfit();
}

// ---- FLUXO PRINCIPAL DE IMPORTAÇÃO ----
async function handleCouponImport(file) {
  if (!file) return;
  
  if (!file.type.startsWith("image/")) {
    showImportStatus("❌ Selecione uma imagem válida (PNG, JPG, etc.)", "error");
    return;
  }
  
  if (file.size > 10 * 1024 * 1024) {
    showImportStatus("❌ Imagem muito grande. Máximo: 10MB", "error");
    return;
  }
  
  importCouponBtn.disabled = true;
  importCouponBtn.classList.add("loading");
  importCouponBtn.textContent = "";
  
  const apiKey = getGeminiApiKey();
  
  try {
    let betData = null;
    
    if (apiKey) {
      // Tentar Gemini primeiro (mais preciso)
      showImportStatus("🤖 Analisando com Gemini...", "info");
      showProgress(50, "Enviando para análise...");

      try {
        const base64 = await fileToBase64(file);
        betData = await extractBetWithGemini(base64, file.type);
      } catch (geminiError) {
        console.warn("Falha ao analisar com Gemini, usando OCR local:", geminiError);
      }
      
      if (betData) {
        showProgress(100, "Concluído!");
        hideProgress();
        fillFormWithBetData(betData);
        showImportStatus("✅ Dados extraídos com Gemini! Revise e salve.", "success");
        return;
      }
      
      // Se Gemini falhou, usar Tesseract como fallback
      showImportStatus("⚠️ Não foi possível ler com Gemini, usando OCR local...", "info");
    } else {
      showImportStatus("🔍 Analisando cupom (OCR local)...", "info");
    }
    
    // OCR Local com Tesseract.js (gratuito)
    const imageUrl = URL.createObjectURL(file);
    betData = await extractBetWithTesseract(imageUrl);
    URL.revokeObjectURL(imageUrl);
    
    hideProgress();
    
    if (betData && (betData.evento || betData.odd || betData.stake)) {
      fillFormWithBetData(betData);
      const campos = [];
      if (betData.evento) campos.push("evento");
      if (betData.odd) campos.push("odd");
      if (betData.stake) campos.push("stake");
      if (betData.casa) campos.push("casa");
      if (betData.data) campos.push("data");
      showImportStatus(`✅ Encontrado: ${campos.join(", ")}. Revise os dados e complete o que faltar.`, "success");
    } else {
      showImportStatus("⚠️ Não consegui extrair dados. Tente uma foto mais nítida ou preencha manualmente.", "error");
    }
    
  } catch (error) {
    console.error("Erro no import:", error);
    hideProgress();
    showImportStatus(`❌ Erro: ${error.message}`, "error");
  } finally {
    importCouponBtn.disabled = false;
    importCouponBtn.classList.remove("loading");
    importCouponBtn.textContent = "📷 Importar do Cupom";
    couponFileInput.value = "";
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Event listeners
importCouponBtn?.addEventListener("click", () => {
  couponFileInput?.click();
});

couponFileInput?.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (file) handleCouponImport(file);
});

function getDroppedImageFile(dataTransfer) {
  const files = Array.from(dataTransfer?.files || []);
  return files.find((file) => file.type.startsWith("image/")) || null;
}

["dragenter", "dragover"].forEach((eventName) => {
  importCouponSection?.addEventListener(eventName, (event) => {
    event.preventDefault();
    event.stopPropagation();
    importCouponSection.classList.add("drag-over");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  importCouponSection?.addEventListener(eventName, (event) => {
    event.preventDefault();
    event.stopPropagation();
    importCouponSection.classList.remove("drag-over");
  });
});

importCouponSection?.addEventListener("drop", (event) => {
  const file = getDroppedImageFile(event.dataTransfer);
  if (!file) {
    showImportStatus("❌ Solte um arquivo de imagem válido.", "error");
    return;
  }
  handleCouponImport(file);
});

window.addEventListener("dragover", (event) => {
  if (event.dataTransfer?.types?.includes("Files")) {
    event.preventDefault();
  }
});

window.addEventListener("drop", (event) => {
  const targetElement = event.target instanceof Element ? event.target : null;
  if (event.dataTransfer?.types?.includes("Files") && !targetElement?.closest(".import-coupon-section")) {
    event.preventDefault();
  }
});

// Profile Switcher
const profileSwitch = document.getElementById('profile-switch');
const profileDropdown = document.getElementById('profile-dropdown');
const profileNameDisplay = document.getElementById('profile-name-display');
const profileAvatar = document.getElementById('profile-avatar');
const profileTrigger = document.getElementById('profile-trigger');

function initialsFromName(name) {
  if (!name) return "PF";
  const parts = name.split(" ").filter(Boolean);
  if (!parts.length) return "PF";
  return parts.slice(0, 2).map((p) => p[0].toUpperCase()).join("");
}

function syncProfileVisual(profiles, activeId) {
  const active = profiles.find((p) => p.id === activeId) || profiles[0] || { name: "Perfil principal", id: "" };

  if (profileNameDisplay) {
    profileNameDisplay.textContent = active.name || "Perfil principal";
  }

  if (profileAvatar) {
    profileAvatar.textContent = initialsFromName(active.name);
  }

  if (profileDropdown) {
    profileDropdown.innerHTML = "";
    profiles.forEach((profile) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `profile-option ${profile.id === activeId ? "active" : ""}`;
      button.textContent = profile.name;
      button.dataset.value = profile.id;
      button.addEventListener("click", () => {
        profileSwitch.value = profile.id;
        profileSwitch.dispatchEvent(new Event("change", { bubbles: true }));
      });
      profileDropdown.appendChild(button);
    });
  }
}

async function renderProfileSwitcher() {
  if (!profileSwitch) return;

  const profiles = await loadProfilesFromApi();
  const activeId = await resolveActiveProfileId(profiles);
  
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

  syncProfileVisual(profiles, activeId);
}

profileSwitch?.addEventListener('change', (e) => {
  const newProfileId = e.target.value;
  if (newProfileId) {
    setActiveProfileId(newProfileId);
    // Recarregar a página para aplicar o novo perfil
    window.location.reload();
  }
});

profileTrigger?.addEventListener("click", () => {
  profileDropdown?.classList.toggle("open");
});

document.addEventListener("click", (event) => {
  if (!profileDropdown || !profileTrigger) return;
  if (profileDropdown.contains(event.target) || profileTrigger.contains(event.target)) return;
  profileDropdown.classList.remove("open");
});

// ========================
// BACKUP AUTOMÁTICO SEMANAL
// ========================
function getBackupKey() {
  const profileId = getActiveProfileId();
  return profileId ? `caderneta.backup.${profileId}` : "caderneta.backup.v1";
}

function getLastBackupKey() {
  const profileId = getActiveProfileId();
  return profileId ? `caderneta.lastBackup.${profileId}` : "caderneta.lastBackup.v1";
}

function performWeeklyBackup() {
  const lastBackupStr = localStorage.getItem(getLastBackupKey());
  const now = Date.now();
  const oneWeek = 7 * 24 * 60 * 60 * 1000;

  if (lastBackupStr && (now - Number(lastBackupStr)) < oneWeek) {
    return; // Ainda não passou 1 semana
  }

  const backupData = {
    timestamp: new Date().toISOString(),
    bets: JSON.parse(localStorage.getItem(getStorageKey()) || "[]"),
    cashflows: JSON.parse(localStorage.getItem(getCashflowKey()) || "[]"),
    settings: JSON.parse(localStorage.getItem(getSettingsKey()) || "{}"),
    bankroll: localStorage.getItem(getBankrollKey()),
    notes: localStorage.getItem(getNotesKey()) || "",
    goals: JSON.parse(localStorage.getItem(getGoalsKey()) || "{}"),
  };

  // Rotação: manter apenas os últimos 4 backups (1 mês)
  const backupKey = getBackupKey();
  const existingRaw = localStorage.getItem(backupKey);
  let backups = existingRaw ? JSON.parse(existingRaw) : [];
  backups.push(backupData);
  if (backups.length > 4) {
    backups = backups.slice(-4);
  }

  try {
    localStorage.setItem(backupKey, JSON.stringify(backups));
    localStorage.setItem(getLastBackupKey(), String(now));
    console.log(`✅ Backup automático realizado em ${backupData.timestamp}`);
  } catch (e) {
    console.warn("⚠️ Erro ao salvar backup automático:", e.message);
  }
}

function restoreFromBackup(index) {
  const backupKey = getBackupKey();
  const existingRaw = localStorage.getItem(backupKey);
  if (!existingRaw) return false;

  const backups = JSON.parse(existingRaw);
  const backup = backups[index];
  if (!backup) return false;

  localStorage.setItem(getStorageKey(), JSON.stringify(backup.bets));
  localStorage.setItem(getCashflowKey(), JSON.stringify(backup.cashflows));
  localStorage.setItem(getSettingsKey(), JSON.stringify(backup.settings));
  if (backup.bankroll) localStorage.setItem(getBankrollKey(), backup.bankroll);
  if (backup.notes) localStorage.setItem(getNotesKey(), backup.notes);
  if (backup.goals) localStorage.setItem(getGoalsKey(), JSON.stringify(backup.goals));

  return true;
}

// ========================
// EXPORTAR PDF MENSAL
// ========================
const MONTH_NAMES_PDF = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const pdfModal = document.getElementById('pdf-modal');
const pdfModalClose = document.getElementById('pdf-modal-close');
const pdfMonthSelect = document.getElementById('pdf-month-select');
const pdfGenerateBtn = document.getElementById('pdf-generate-btn');
const pdfStatus = document.getElementById('pdf-status');
const exportPdfBtn = document.getElementById('export-pdf-btn');

function populatePdfMonthSelect() {
  if (!pdfMonthSelect) return;
  pdfMonthSelect.innerHTML = '';

  // Encontrar meses com apostas
  const monthsSet = new Set();
  bets.forEach(bet => {
    const d = parseDateForSort(bet.date);
    if (d) monthsSet.add(`${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`);
  });

  // Gerar os últimos 12 meses
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = `${MONTH_NAMES_PDF[d.getMonth()]} ${d.getFullYear()}`;
    if (monthsSet.has(key)) opt.textContent += ' ✓';
    pdfMonthSelect.appendChild(opt);
  }
}

function openPdfModal() {
  populatePdfMonthSelect();
  pdfStatus.style.display = 'none';
  pdfModal.style.display = 'flex';
}

function closePdfModal() {
  pdfModal.style.display = 'none';
}

exportPdfBtn?.addEventListener('click', openPdfModal);
window.addEventListener('caderneta:open-pdf-modal', openPdfModal);
pdfModalClose?.addEventListener('click', closePdfModal);
pdfModal?.addEventListener('click', (e) => { if (e.target === pdfModal) closePdfModal(); });

if (new URLSearchParams(window.location.search).get('openPdf') === '1') {
  window.setTimeout(openPdfModal, 100);
}

pdfGenerateBtn?.addEventListener('click', async () => {
  const val = pdfMonthSelect.value;
  const [yearStr, monthStr] = val.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const monthName = `${MONTH_NAMES_PDF[month]} ${year}`;

  pdfStatus.textContent = 'Gerando relatório... 📊';
  pdfStatus.style.display = 'block';
  pdfStatus.style.color = 'var(--primary)';
  pdfGenerateBtn.disabled = true;

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 15;
    let y = 20;

    // Filter bets for month
    const monthBets = bets.filter(bet => {
      const d = parseDateForSort(bet.date);
      return d && d.getFullYear() === year && d.getMonth() === month;
    });
    const settled = monthBets.filter(b => b.status === 'win' || b.status === 'loss');
    const wins = settled.filter(b => b.status === 'win');
    const losses = settled.filter(b => b.status === 'loss');
    const totalStake = settled.reduce((s, b) => s + b.stake, 0);
    const totalProfit = settled.reduce((s, b) => s + calcProfit(b), 0);
    const winrate = settled.length > 0 ? wins.length / settled.length : 0;
    const roi = totalStake > 0 ? totalProfit / totalStake : 0;

    // Header
    doc.setFillColor(11, 16, 32);
    doc.rect(0, 0, pageW, 40, 'F');
    doc.setTextColor(245, 247, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text(`RELATÓRIO MENSAL - ${monthName.toUpperCase()}`, pageW / 2, 18, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Gestão de Banca de Apostas', pageW / 2, 28, { align: 'center' });
    doc.setFontSize(8);
    doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, pageW / 2, 34, { align: 'center' });
    y = 50;

    /// KPIs
    const incKpis = document.getElementById('pdf-inc-kpis')?.checked;
    if (incKpis) {
      doc.setTextColor(124, 92, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      // CORREÇÃO: Removido o emoji 📊 que causava erro
      doc.text('RESUMO GERAL', margin, y); 
      y += 8;
      doc.setDrawColor(124, 92, 255);
      doc.line(margin, y, pageW - margin, y);
      y += 8;

      doc.setTextColor(60, 60, 60);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      
      

      const kpiData = [
        ['Total apostado:', formatStake(totalStake)],
        ['Lucro líquido:', formatProfit(totalProfit)],
        ['ROI:', percentFormatter.format(roi)],
        ['Winrate:', `${percentFormatter.format(winrate)} (${wins.length} greens / ${settled.length} apostas)`],
        ['Total de apostas no mês:', `${monthBets.length} (${settled.length} finalizadas, ${monthBets.length - settled.length} pendentes)`],
        ['Odd média:', settled.length > 0 ? `${numberFormatter.format(settled.reduce((s, b) => s + b.odds, 0) / settled.length)}x` : '-'],
        ['Ticket médio:', settled.length > 0 ? formatStake(totalStake / settled.length) : '-'],
      ];

      kpiData.forEach(([label, value]) => {
        doc.setFont('helvetica', 'bold');
        doc.text(label, margin, y);
        doc.setFont('helvetica', 'normal');
        if (label.includes('Lucro')) {
          doc.setTextColor(totalProfit >= 0 ? 34 : 220, totalProfit >= 0 ? 150 : 50, totalProfit >= 0 ? 80 : 50);
        }
        doc.text(value, margin + 50, y);
        doc.setTextColor(60, 60, 60);
        y += 6;
      });
      y += 6;
    }

    // Chart
    const incChart = document.getElementById('pdf-inc-chart')?.checked;
    if (incChart) {
      if (y > 230) { doc.addPage(); y = 20; }
      doc.setTextColor(124, 92, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      // CORREÇÃO: Removido o emoji 📈
      doc.text('GRÁFICO DE EVOLUÇÃO', margin, y);
      y += 8;
      doc.setDrawColor(124, 92, 255);
      doc.line(margin, y, pageW - margin, y);
      y += 4;

      const chartEl = document.getElementById('balance-chart');
      if (chartEl) {
        try {
          const chartCanvas = await html2canvas(chartEl.closest('.chart-card') || chartEl, { backgroundColor: '#0b1020', scale: 2 });
          const chartImg = chartCanvas.toDataURL('image/png');
          const chartW = pageW - margin * 2;
          const chartH = (chartCanvas.height / chartCanvas.width) * chartW;
          doc.addImage(chartImg, 'PNG', margin, y, chartW, Math.min(chartH, 70));
          y += Math.min(chartH, 70) + 8;
        } catch (e) {
          doc.setTextColor(150, 150, 150);
          doc.setFontSize(9);
          doc.text('(Gráfico não disponível)', margin, y + 10);
          y += 16;
        }
      }
    }

    // Stats by house
    const incHouses = document.getElementById('pdf-inc-houses')?.checked;
    if (incHouses) {
      if (y > 230) { doc.addPage(); y = 20; }
      doc.setTextColor(124, 92, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      // CORREÇÃO: Removido o emoji 🏠
      doc.text('ESTATÍSTICAS POR CASA', margin, y);
      y += 8;
      doc.setDrawColor(124, 92, 255);
      doc.line(margin, y, pageW - margin, y);
      y += 6;

      const books = Array.from(new Set(settled.map(b => b.book))).sort();
      if (books.length > 0) {
        // Header
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(100, 100, 100);
        const cols = [margin, margin+35, margin+55, margin+72, margin+92, margin+115, margin+145];
        doc.text('Casa', cols[0], y);
        doc.text('Apostas', cols[1], y);
        doc.text('Greens', cols[2], y);
        doc.text('Reds', cols[3], y);
        doc.text('Winrate', cols[4], y);
        doc.text('Lucro', cols[5], y);
        doc.text('ROI', cols[6], y);
        y += 5;

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(60, 60, 60);

        books.forEach(book => {
          if (y > 275) { doc.addPage(); y = 20; }
          const hBets = settled.filter(b => b.book === book);
          const hWins = hBets.filter(b => b.status === 'win').length;
          const hLosses = hBets.filter(b => b.status === 'loss').length;
          const hStake = hBets.reduce((s, b) => s + b.stake, 0);
          const hProfit = hBets.reduce((s, b) => s + calcProfit(b), 0);
          const hWinrate = hBets.length > 0 ? hWins / hBets.length : 0;
          const hRoi = hStake > 0 ? hProfit / hStake : 0;

          doc.setFontSize(8);
          doc.text(book.substring(0, 15), cols[0], y);
          doc.text(String(hBets.length), cols[1], y);
          doc.text(String(hWins), cols[2], y);
          doc.text(String(hLosses), cols[3], y);
          doc.text(percentFormatter.format(hWinrate), cols[4], y);
          doc.setTextColor(hProfit >= 0 ? 34 : 220, hProfit >= 0 ? 150 : 50, hProfit >= 0 ? 80 : 50);
          doc.text(formatProfit(hProfit), cols[5], y);
          doc.setTextColor(hRoi >= 0 ? 34 : 220, hRoi >= 0 ? 150 : 50, hRoi >= 0 ? 80 : 50);
          doc.text(percentFormatter.format(hRoi), cols[6], y);
          doc.setTextColor(60, 60, 60);
          y += 5;
        });
        y += 6;
      }
    }

    // Top 5
    const incTop5 = document.getElementById('pdf-inc-top5')?.checked;
    if (incTop5 && wins.length > 0) {
      if (y > 230) { doc.addPage(); y = 20; }
      
      doc.setTextColor(124, 92, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      // Título sem emoji
      doc.text('TOP 5 MELHORES APOSTAS', margin, y);
      y += 8;
      doc.setDrawColor(124, 92, 255);
      doc.line(margin, y, pageW - margin, y);
      y += 6;

      const top5 = wins
        .map(b => ({ ...b, profit: calcProfit(b) }))
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 5);

      doc.setFontSize(9);
      
      top5.forEach((bet, i) => {
        if (y > 275) { doc.addPage(); y = 20; }
        
        // 1. Número do Ranking (Verde)
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(34, 150, 80); 
        doc.text(`${i + 1}.`, margin, y);

        // 2. Lucro (Alinhado à DIREITA para ficar organizado)
        // Mantemos a cor verde para destacar o ganho
        doc.text(`${formatProfit(bet.profit)}`, pageW - margin, y, { align: 'right' });

        // 3. Evento + Odd (Alinhado à ESQUERDA)
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(60, 60, 60);
        
        const oddText = `(${numberFormatter.format(bet.odds)}x)`;
        let eventText = bet.event || '-';
        
        // Truncar o nome do evento para não bater no valor do lucro
        // 60 caracteres é um bom limite seguro para esta linha
        if (eventText.length > 55) {
          eventText = eventText.substring(0, 55) + '...';
        }

        // Escreve: "Nome do Evento... (2.00x)"
        doc.text(`${eventText} ${oddText}`, margin + 8, y);
        
        y += 6;
      });
      y += 6;
    }

    /// Full table
    const incTable = document.getElementById('pdf-inc-table')?.checked;
    if (incTable && monthBets.length > 0) {
      if (y > 200) { doc.addPage(); y = 20; }
      
      doc.setTextColor(124, 92, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      // CORREÇÃO: Removido o emoji 📋
      doc.text('HISTÓRICO COMPLETO', margin, y);
      y += 8;
      doc.setDrawColor(124, 92, 255);
      doc.line(margin, y, pageW - margin, y);
      y += 6;

      // --- CONFIGURAÇÃO DAS COLUNAS (FIX) ---
      const colX = {
        date: margin,
        event: margin + 18,
        odd: margin + 95,      // DIREITA
        stake: margin + 115,   // DIREITA
        status: margin + 120,
        profit: margin + 155,  // DIREITA
        book: margin + 160
      };

      // Header
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(100, 100, 100);
      doc.text('Data', colX.date, y);
      doc.text('Evento', colX.event, y);
      doc.text('Odd', colX.odd, y, { align: 'right' });   
      doc.text('Stake', colX.stake, y, { align: 'right' }); 
      doc.text('Status', colX.status, y);
      doc.text('Lucro', colX.profit, y, { align: 'right' }); 
      doc.text('Casa', colX.book, y);
      y += 1;
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, y, pageW - margin, y);
      y += 4;

      doc.setFont('helvetica', 'normal');
      const sortedMonthBets = [...monthBets].sort((a, b) => {
        const ad = parseDateForSort(a.date);
        const bd = parseDateForSort(b.date);
        return (bd || 0) - (ad || 0);
      });

      sortedMonthBets.forEach(bet => {
        if (y > 275) {
          doc.addPage();
          y = 20;
          doc.setFontSize(7);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(100, 100, 100);
          doc.text('Data', colX.date, y);
          doc.text('Evento', colX.event, y);
          doc.text('Odd', colX.odd, y, { align: 'right' });
          doc.text('Stake', colX.stake, y, { align: 'right' });
          doc.text('Status', colX.status, y);
          doc.text('Lucro', colX.profit, y, { align: 'right' });
          doc.text('Casa', colX.book, y);
          y += 1;
          doc.line(margin, y, pageW - margin, y);
          y += 4;
          doc.setFont('helvetica', 'normal');
        }

        const profit = calcProfit(bet);
        doc.setFontSize(7);
        doc.setTextColor(60, 60, 60);
        doc.text(bet.date || '-', colX.date, y);
        const eventText = (bet.event || '-');
        doc.text(eventText.length > 35 ? eventText.substring(0, 35) + '...' : eventText, colX.event, y);
        doc.text(numberFormatter.format(bet.odds), colX.odd, y, { align: 'right' });
        doc.text(formatStake(bet.stake), colX.stake, y, { align: 'right' });

        if (bet.status === 'win') doc.setTextColor(34, 150, 80);
        else if (bet.status === 'loss') doc.setTextColor(220, 50, 50);
        else doc.setTextColor(200, 160, 0);
        doc.text(statusLabel(bet.status).substring(0, 10), colX.status, y);

        doc.setTextColor(profit >= 0 ? 34 : 220, profit >= 0 ? 150 : 50, profit >= 0 ? 80 : 50);
        doc.text(formatProfit(profit), colX.profit, y, { align: 'right' });
        doc.setTextColor(60, 60, 60);
        doc.text((bet.book || '-').substring(0, 12), colX.book, y);
        y += 5;
      });
      y += 6;
    }

    // Notes
    const incNotes = document.getElementById('pdf-inc-notes')?.checked;
    if (incNotes) {
      const notes = localStorage.getItem(getNotesKey()) || '';
      if (notes.trim()) {
        if (y > 230) { doc.addPage(); y = 20; }
        doc.setTextColor(124, 92, 255);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        // CORREÇÃO: Removido o emoji 📝
        doc.text('NOTAS E OBSERVAÇÕES', margin, y);
        y += 8;
        doc.setDrawColor(124, 92, 255);
        doc.line(margin, y, pageW - margin, y);
        y += 6;
        doc.setTextColor(60, 60, 60);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        const noteLines = doc.splitTextToSize(notes, pageW - margin * 2);
        noteLines.forEach(line => {
          if (y > 275) { doc.addPage(); y = 20; }
          doc.text(line, margin, y);
          y += 5;
        });
      }
    }

    // Footer on last page
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      doc.text(`Caderneta de Apostas • Página ${i} de ${pageCount}`, pageW / 2, 290, { align: 'center' });
    }

    doc.save(`relatorio-${monthName.replace(' ', '-').toLowerCase()}.pdf`);

    pdfStatus.textContent = '✅ PDF gerado com sucesso!';
    pdfStatus.style.color = 'var(--success)';
    setTimeout(() => closePdfModal(), 2000);

  } catch (e) {
    console.error('Erro ao gerar PDF:', e);
    pdfStatus.textContent = `❌ Erro: ${e.message}`;
    pdfStatus.style.color = 'var(--danger)';
  } finally {
    pdfGenerateBtn.disabled = false;
  }
});

// ========================
// COMPARTILHAR CARD REDES SOCIAIS
// ========================
const shareModal = document.getElementById('share-modal');
const shareModalClose = document.getElementById('share-modal-close');
const shareCardCanvas = document.getElementById('share-card-canvas');
const shareDownloadBtn = document.getElementById('share-download-btn');
const shareCopyBtn = document.getElementById('share-copy-btn');
const shareNativeBtn = document.getElementById('share-native-btn');

function openShareCardModal(bet) {
  if (!shareModal || !shareCardCanvas) return;
  renderShareCard(bet);
  shareModal.style.display = 'flex';

  // Store current bet for actions
  shareModal._currentBet = bet;
}

function closeShareModal() {
  if (shareModal) shareModal.style.display = 'none';
}

shareModalClose?.addEventListener('click', closeShareModal);
shareModal?.addEventListener('click', (e) => { if (e.target === shareModal) closeShareModal(); });

function renderShareCard(bet) {
  const canvas = shareCardCanvas;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = 1080;
  const h = 1080;
  canvas.width = w;
  canvas.height = h;

  // Background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, w, h);
  bgGrad.addColorStop(0, '#0b1020');
  bgGrad.addColorStop(0.5, '#121830');
  bgGrad.addColorStop(1, '#0b1020');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // Decorative circles
  ctx.beginPath();
  ctx.arc(100, 100, 300, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(124, 92, 255, 0.12)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(w - 100, h - 100, 250, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(45, 212, 191, 0.1)';
  ctx.fill();

  const profit = calcProfit(bet);
  const isWin = bet.status === 'win';
  const roiVal = bet.stake > 0 ? (profit / bet.stake) * 100 : 0;

  // Status badge at top
  const statusColor = isWin ? '#22c55e' : '#ff6b6b';
  const statusText = isWin ? '✅ GREEN' : '❌ RED';
  const statusBg = isWin ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 107, 107, 0.2)';

  // Top banner
  ctx.fillStyle = statusBg;
  roundRect(ctx, 60, 60, w - 120, 120, 24);
  ctx.fill();
  ctx.strokeStyle = statusColor;
  ctx.lineWidth = 2;
  roundRect(ctx, 60, 60, w - 120, 120, 24);
  ctx.stroke();

  ctx.fillStyle = statusColor;
  ctx.font = 'bold 52px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(statusText, w / 2, 138);

  // Event name
  ctx.fillStyle = '#f5f7ff';
  ctx.font = 'bold 42px Inter, sans-serif';
  ctx.textAlign = 'center';
  const eventLines = wrapText(ctx, bet.event || '-', w - 160, 42);
  let eventY = 260;
  eventLines.forEach(line => {
    ctx.fillText(line, w / 2, eventY);
    eventY += 52;
  });

  // Divider
  let divY = eventY + 20;
  ctx.strokeStyle = 'rgba(124, 92, 255, 0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(120, divY);
  ctx.lineTo(w - 120, divY);
  ctx.stroke();

  // Info cards
  let cardsY = divY + 40;
  const cardW = (w - 180) / 2;
  const cardH = 140;

  // Card: Casa
  drawInfoCard(ctx, 70, cardsY, cardW, cardH, '🏠', 'Casa', bet.book || '-');
  // Card: Odd
  drawInfoCard(ctx, 70 + cardW + 40, cardsY, cardW, cardH, '📊', 'Odd', `${numberFormatter.format(bet.odds)}x`);

  cardsY += cardH + 20;

  // Card: Stake
  drawInfoCard(ctx, 70, cardsY, cardW, cardH, '💰', 'Stake', formatStake(bet.stake));
  // Card: Lucro
  const profitColor = profit >= 0 ? '#22c55e' : '#ff6b6b';
  drawInfoCard(ctx, 70 + cardW + 40, cardsY, cardW, cardH, '💸', 'Lucro', formatProfit(profit), profitColor);

  cardsY += cardH + 20;

  // ROI big
  if (bet.status === 'win' || bet.status === 'loss') {
    const roiColor = roiVal >= 0 ? '#22c55e' : '#ff6b6b';
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    roundRect(ctx, 70, cardsY, w - 140, 100, 16);
    ctx.fill();
    ctx.fillStyle = roiColor;
    ctx.font = 'bold 48px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${roiVal >= 0 ? '+' : ''}${roiVal.toFixed(0)}% ROI`, w / 2, cardsY + 65);
    cardsY += 120;
  }

  // AI badge
  if (bet.ai) {
    ctx.fillStyle = 'rgba(124, 92, 255, 0.15)';
    roundRect(ctx, 70, cardsY, w - 140, 70, 16);
    ctx.fill();
    ctx.fillStyle = '#7c5cff';
    ctx.font = '600 30px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`🤖 Sugestão: ${bet.ai}`, w / 2, cardsY + 45);
    cardsY += 90;
  }

  // Date
  ctx.fillStyle = 'rgba(245, 247, 255, 0.5)';
  ctx.font = '400 26px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`📅 ${bet.date || '-'}`, w / 2, h - 110);

  // Footer
  ctx.fillStyle = 'rgba(245, 247, 255, 0.3)';
  ctx.font = '400 22px Inter, sans-serif';
  ctx.fillText('Caderneta de Apostas', w / 2, h - 50);
}

function drawInfoCard(ctx, x, y, w, h, emoji, label, value, valueColor) {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  roundRect(ctx, x, y, w, h, 16);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, 16);
  ctx.stroke();

  ctx.fillStyle = 'rgba(245, 247, 255, 0.5)';
  ctx.font = '400 24px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${emoji} ${label}`, x + w / 2, y + 40);

  ctx.fillStyle = valueColor || '#f5f7ff';
  ctx.font = 'bold 36px Inter, sans-serif';
  ctx.fillText(value, x + w / 2, y + 95);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapText(ctx, text, maxWidth, fontSize) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  words.forEach(word => {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  });
  if (currentLine) lines.push(currentLine);
  return lines.slice(0, 3); // max 3 lines
}

// Share actions
shareDownloadBtn?.addEventListener('click', () => {
  if (!shareCardCanvas) return;
  const link = document.createElement('a');
  link.download = `aposta-card-${Date.now()}.png`;
  link.href = shareCardCanvas.toDataURL('image/png');
  link.click();
});

shareCopyBtn?.addEventListener('click', async () => {
  if (!shareCardCanvas) return;
  try {
    const blob = await new Promise(resolve => shareCardCanvas.toBlob(resolve, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    shareCopyBtn.textContent = '✅ Copiado!';
    setTimeout(() => { shareCopyBtn.textContent = '📋 Copiar'; }, 2000);
  } catch (e) {
    // Fallback: download
    shareDownloadBtn?.click();
  }
});

shareNativeBtn?.addEventListener('click', async () => {
  if (!shareCardCanvas) return;
  
  // Muda o texto do botão para indicar processamento
  const originalText = shareNativeBtn.innerHTML;
  shareNativeBtn.innerHTML = '🔄 Processando...';
  
  try {
    // 1. Converter o Canvas em um Arquivo de imagem real (Blob -> File)
    const blob = await new Promise(resolve => shareCardCanvas.toBlob(resolve, 'image/png'));
    const file = new File([blob], 'resumo-apostas.png', { type: 'image/png' });

    // 2. Preparar os dados para compartilhamento
    const shareData = {
      title: 'Caderneta de Apostas',
      text: shareModal?._currentBet 
        ? `Minha aposta: ${shareModal._currentBet.event}` 
        : 'Confira meu resumo do dia na Caderneta!',
      files: [file],
    };

    // 3. Verificar se o navegador suporta compartilhamento nativo de ARQUIVOS
    // (Geralmente funciona no Mobile, mas falha no Desktop)
    if (navigator.canShare && navigator.canShare(shareData)) {
      await navigator.share(shareData);
      // Se der certo, volta o texto normal
      shareNativeBtn.innerHTML = originalText;
    } else {
      throw new Error("Sharing not supported");
    }

  } catch (e) {
    // Se der erro (ou se for Desktop e não suportar), cai aqui
    
    // Ignora erro se o usuário cancelou o menu de compartilhar
    if (e.name !== 'AbortError') {
      // Se não for cancelamento, é porque não suporta.
      // Mostramos um aviso (se a função showToast existir, senão usa alert ou console)
      if (typeof showToast === 'function') {
        showToast("Compartilhamento nativo indisponível no PC. Baixando imagem...");
      } else {
        alert("Neste dispositivo, a imagem será baixada para você enviar manualmente.");
      }
      
      // Fallback: Clica no botão de download automaticamente
      shareDownloadBtn?.click();
    }
    shareNativeBtn.innerHTML = originalText;
  }
});
//fim da func sharenativebtn
init();
performWeeklyBackup();
