const ACTIVE_PROFILE_KEY = "caderneta.activeProfile.v1";
const DEFAULT_AI_OPTIONS = ["Grok", "Claude", "Gemini", "Gemini DS", "ChatGPT"];

// Chaves dinâmicas baseadas no perfil ativo
function getStorageKey(profileId) {
  return `caderneta.bets.${profileId}`;
}
function getCashflowKey(profileId) {
  return `caderneta.cashflow.${profileId}`;
}
function getBankrollKey(profileId) {
  return `caderneta.bankroll.${profileId}`;
}
function getSettingsKey(profileId) {
  return `caderneta.settings.${profileId}`;
}

const defaultSettings = {
  profile: {
    name: "",
    goal: null,
  },
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
  houseBalances: {},
  aiOptions: [...DEFAULT_AI_OPTIONS],
  defaults: {
    status: "pending",
    filter: "pending",
    stakeType: "regular",
  },
};

let settings = { ...defaultSettings };
let profiles = [];
let activeProfileId = null;
let categories = [];
let favoriteEditingIndex = null;
let houseHistoryBets = [];
let houseHistoryCashflows = [];

function normalizeFavoriteName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function sanitizeFavorites(list) {
  const source = Array.isArray(list) ? list : [];
  const unique = [];
  const seen = new Set();

  source.forEach((item) => {
    const name = normalizeFavoriteName(item);
    if (!name) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(name);
  });

  return unique;
}

function normalizeHouseBalanceKey(value) {
  return normalizeFavoriteName(value).toLowerCase();
}

function sanitizeHouseBalances(map) {
  if (!map || typeof map !== "object" || Array.isArray(map)) return {};

  const result = {};
  Object.entries(map).forEach(([rawKey, rawValue]) => {
    const key = normalizeHouseBalanceKey(rawKey);
    if (!key) return;
    const value = Number(rawValue);
    result[key] = Number.isFinite(value) ? value : 0;
  });

  return result;
}

function getHouseBalanceByName(name) {
  const key = normalizeHouseBalanceKey(name);
  const map = sanitizeHouseBalances(settings.houseBalances);
  return Number(map[key] || 0);
}

function calcProfitFromHistoryBet(bet) {
  const stake = Number(bet?.stake) || 0;
  const odds = Number(bet?.odds) || 0;
  const cashout = Number(bet?.cashout_value) || 0;
  const isFreebet = Boolean(bet?.isFreebet || bet?.is_freebet || bet?.freebet);
  const status = String(bet?.status || "");

  if (status === "win") return stake * (odds - 1);
  if (status === "loss") return isFreebet ? 0 : -stake;
  if (status === "cashout") return isFreebet ? cashout : cashout - stake;
  if (status === "void") return 0;
  return 0;
}

function calcSettledProfitFromHistoryByBook(book) {
  const target = normalizeFavoriteName(book);
  if (!target) return 0;

  return houseHistoryBets
    .filter((bet) => normalizeFavoriteName(bet?.book) === target)
    .filter((bet) => ["win", "loss", "cashout", "void"].includes(String(bet?.status || "")))
    .reduce((sum, bet) => sum + calcProfitFromHistoryBet(bet), 0);
}

function calcCashflowTotalFromHistoryByBook(book) {
  const target = normalizeFavoriteName(book);
  if (!target) return 0;

  return houseHistoryCashflows
    .filter((flow) => normalizeFavoriteName(flow?.book) === target)
    .reduce((sum, flow) => {
      const amount = Number(flow?.amount) || 0;
      if (flow?.type === "deposit") return sum + amount;
      if (flow?.type === "withdraw") return sum - amount;
      return sum;
    }, 0);
}

function getCurrentHouseBankrollByName(book) {
  return getHouseBalanceByName(book)
    + calcSettledProfitFromHistoryByBook(book)
    + calcCashflowTotalFromHistoryByBook(book);
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

async function loadProfilesFromApi() {
  try {
    const resposta = await fetch('api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'carregar_perfis' })
    });
    const dados = await resposta.json();
    return Array.isArray(dados) ? dados : [];
  } catch (e) {
    console.error("Erro ao carregar perfis:", e);
    return [];
  }
}

async function salvarPerfilApi(perfil) {
  try {
    const resposta = await fetch('api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'salvar_perfil', perfil })
    });
    const json = await resposta.json();
    return json.sucesso ? json.perfil : null;
  } catch (e) {
    console.error("Erro ao salvar perfil:", e);
    return null;
  }
}

async function excluirPerfilApi(profileId) {
  try {
    const resposta = await fetch('api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'excluir_perfil', profile_id: profileId })
    });
    const json = await resposta.json();
    return Boolean(json.sucesso);
  } catch (e) {
    console.error("Erro ao excluir perfil:", e);
    return false;
  }
}

// Gerenciamento de Perfis
async function loadProfiles() {
  profiles = await loadProfilesFromApi();

  activeProfileId = localStorage.getItem(ACTIVE_PROFILE_KEY);
  if (profiles.length > 0 && (!activeProfileId || !profiles.find(p => p.id === activeProfileId))) {
    activeProfileId = profiles[0].id;
    localStorage.setItem(ACTIVE_PROFILE_KEY, activeProfileId);
  }
}

function migrateExistingData(profileId) {
  // Migrar dados antigos (v1) para o novo perfil
  const oldBets = localStorage.getItem("caderneta.bets.v1");
  const oldCashflow = localStorage.getItem("caderneta.cashflow.v1");
  const oldBankroll = localStorage.getItem("caderneta.bankroll.base.v1");
  const oldSettings = localStorage.getItem("caderneta.settings.v1");
  
  if (oldBets) {
    localStorage.setItem(getStorageKey(profileId), oldBets);
  }
  if (oldCashflow) {
    localStorage.setItem(getCashflowKey(profileId), oldCashflow);
  }
  if (oldBankroll) {
    localStorage.setItem(getBankrollKey(profileId), oldBankroll);
  }
  if (oldSettings) {
    localStorage.setItem(getSettingsKey(profileId), oldSettings);
  }
}

async function createProfile(name) {
  const created = await salvarPerfilApi({ name: name.trim() });
  if (!created) return null;

  profiles = await loadProfilesFromApi();
  return created;
}

async function deleteProfile(profileId) {
  if (profiles.length <= 1) {
    alert("Você precisa ter pelo menos um perfil.");
    return false;
  }
  
  const profile = profiles.find(p => p.id === profileId);
  if (!profile) return false;
  
  if (!confirm(`Tem certeza que deseja excluir o perfil "${profile.name}"? Todos os dados serão perdidos.`)) {
    return false;
  }
  
  const sucesso = await excluirPerfilApi(profileId);
  if (!sucesso) {
    alert("Não foi possível excluir o perfil.");
    return false;
  }

  profiles = await loadProfilesFromApi();
  
  // Se era o perfil ativo, trocar para outro
  if (activeProfileId === profileId) {
    await switchProfile(profiles[0].id);
  }
  
  return true;
}

async function switchProfile(profileId) {
  const profile = profiles.find(p => p.id === profileId);
  if (!profile) return false;
  
  activeProfileId = profileId;
  localStorage.setItem(ACTIVE_PROFILE_KEY, profileId);
  
  // Recarregar configurações do novo perfil
  await loadSettings();
  await syncFavoritesWithHistory();
  populateForm();
  renderProfiles();
  
  showToast(`Trocado para: ${profile.name}`);
  return true;
}

function getActiveProfile() {
  return profiles.find(p => p.id === activeProfileId);
}

function renderProfiles() {
  const container = document.getElementById("profiles-list");
  const infoContainer = document.getElementById("current-profile-info");
  
  if (!container) return;
  
  container.innerHTML = "";
  
  profiles.forEach((profile) => {
    const isActive = profile.id === activeProfileId;
    const card = document.createElement("div");
    card.className = `profile-card ${isActive ? 'active' : ''}`;
    
    card.innerHTML = `
      <div class="profile-card-info">
        <strong>${profile.name}</strong>
        <small>${isActive ? '✓ Ativo' : 'Clique para ativar'}</small>
      </div>
      <div class="profile-card-actions">
        ${!isActive ? `<button type="button" class="ghost small" data-action="switch" data-id="${profile.id}">Usar</button>` : ''}
        <button type="button" class="ghost small danger" data-action="delete" data-id="${profile.id}" ${profiles.length <= 1 ? 'disabled' : ''}>✕</button>
      </div>
    `;
    
    container.appendChild(card);
  });
  
  // Event listeners
  container.querySelectorAll("button[data-action]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const action = e.target.dataset.action;
      const id = e.target.dataset.id;
      
      if (action === "switch") {
        await switchProfile(id);
      } else if (action === "delete") {
        if (await deleteProfile(id)) {
          renderProfiles();
          showToast("Perfil excluído!");
        }
      }
    });
  });
  
  // Atualizar info do perfil atual
  const activeProfile = getActiveProfile();
  if (infoContainer && activeProfile) {
    infoContainer.innerHTML = `
      <div class="current-profile-stats">
        <span>📊 Perfil ativo: <strong>${activeProfile.name}</strong></span>
        <span>✅ Sincronizado com a API</span>
      </div>
    `;
  }
}

async function loadSettings() {
  try {
    const resposta = await fetch('api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'carregar_dados_extras', profile_id: activeProfileId })
    });
    
    const json = await resposta.json();

    if (json.sucesso && json.dados && json.dados.settings_json) {
      const saved = JSON.parse(json.dados.settings_json);
      settings = { ...defaultSettings, ...saved };
      settings.profile = { ...defaultSettings.profile, ...saved.profile };
      settings.display = { ...defaultSettings.display, ...saved.display };
      settings.columns = { ...defaultSettings.columns, ...saved.columns };
      settings.defaults = { ...defaultSettings.defaults, ...saved.defaults };
      settings.favorites = sanitizeFavorites(saved.favorites);
      settings.houseBalances = sanitizeHouseBalances(saved.houseBalances);
      settings.aiOptions = sanitizeAiOptions(saved.aiOptions);
    } else {
      settings = { ...defaultSettings }; // Usa o padrão se não houver nada no BD
      settings.aiOptions = [...DEFAULT_AI_OPTIONS];
    }
  } catch (e) {
    console.error("Erro ao carregar configurações da API:", e);
    settings = { ...defaultSettings };
    settings.aiOptions = [...DEFAULT_AI_OPTIONS];
  }
}

async function loadBooksFromHistory(profileId) {
  if (!profileId) return [];

  try {
    const [betsResp, cashflowResp] = await Promise.all([
      fetch('api.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'carregar_apostas', profile_id: profileId })
      }),
      fetch('api.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'carregar_fluxo', profile_id: profileId })
      })
    ]);

    const betsJson = await betsResp.json();
    const cashflowJson = await cashflowResp.json();
    houseHistoryBets = Array.isArray(betsJson) ? betsJson : [];
    houseHistoryCashflows = Array.isArray(cashflowJson) ? cashflowJson : [];

    const betBooks = houseHistoryBets
      .map((bet) => normalizeFavoriteName(bet?.book))
      .filter(Boolean);

    const cashflowBooks = houseHistoryCashflows
      .map((flow) => normalizeFavoriteName(flow?.book))
      .filter(Boolean);

    return sanitizeFavorites([...betBooks, ...cashflowBooks]);
  } catch (e) {
    console.error("Erro ao carregar casas do histórico:", e);
    houseHistoryBets = [];
    houseHistoryCashflows = [];
    return [];
  }
}

async function syncFavoritesWithHistory() {
  const historyBooks = await loadBooksFromHistory(activeProfileId);
  if (!historyBooks.length) return;

  const current = sanitizeFavorites(settings.favorites);
  const houseBalances = sanitizeHouseBalances(settings.houseBalances);
  const currentSet = new Set(current.map((name) => name.toLowerCase()));
  const toAdd = historyBooks.filter((name) => !currentSet.has(name.toLowerCase()));

  if (!toAdd.length) return;

  settings.favorites = sanitizeFavorites([...current, ...toAdd]);
  toAdd.forEach((name) => {
    const key = normalizeHouseBalanceKey(name);
    if (!(key in houseBalances)) {
      houseBalances[key] = 0;
    }
  });
  settings.houseBalances = houseBalances;
  await saveSettings();
  showToast(`${toAdd.length} casa(s) do histórico adicionada(s).`);
}

async function saveSettings() {
  try {
    await fetch('api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        acao: 'salvar_dados_extras', 
        profile_id: activeProfileId,
        tipo: 'settings', // Avisa o PHP que estamos a guardar configurações
        valor: JSON.stringify(settings) // Transforma as configurações em texto para o BD
      })
    });
    
    // Mantemos o backup local por enquanto
    localStorage.setItem(getSettingsKey(activeProfileId), JSON.stringify(settings));
  } catch (e) {
    console.error("Erro ao salvar configurações na API:", e);
  }
}

function parseLocaleNumber(value) {
  if (typeof value !== "string") return Number(value);
  const normalized = value.replace(/\./g, "").replace(/,/g, ".").trim();
  return Number(normalized);
}

const numberFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 2,
});

// Preencher formulário com configurações salvas
function populateForm() {
  // Perfil
  document.getElementById("profile-name").value = settings.profile.name || "";
  document.getElementById("profile-goal").value = settings.profile.goal 
    ? numberFormatter.format(settings.profile.goal) 
    : "";

  // Display
  document.getElementById("show-calendar").checked = settings.display.showCalendar;
  document.getElementById("show-chart").checked = settings.display.showChart;
  document.getElementById("show-bankroll").checked = settings.display.showBankroll;
  document.getElementById("show-kpis").checked = settings.display.showKpis;
  document.getElementById("show-ai-suggestions").checked = settings.display.showAiSuggestions !== false;
  document.getElementById("show-potential-profit").checked = settings.display.showPotentialProfit;
  document.getElementById("show-table-potential").checked = settings.display.showTablePotential;
  document.getElementById("show-roi").checked = settings.display.showRoi;
  document.getElementById("show-avg-odd").checked = settings.display.showAvgOdd;
  document.getElementById("show-avg-stake").checked = settings.display.showAvgStake;
  document.getElementById("show-total-stake").checked = settings.display.showTotalStake;
  document.getElementById("show-total-bets").checked = settings.display.showTotalBets;
  document.getElementById("show-streak").checked = settings.display.showStreak;
  document.getElementById("show-staked-period").checked = settings.display.showStakedPeriod !== false;

  // Columns
  document.getElementById("col-date").checked = settings.columns.date;
  document.getElementById("col-odds").checked = settings.columns.odds;
  document.getElementById("col-stake").checked = settings.columns.stake;
  document.getElementById("col-status").checked = settings.columns.status;
  document.getElementById("col-profit").checked = settings.columns.profit;
  document.getElementById("col-potential").checked = settings.columns.potential;
  document.getElementById("col-book").checked = settings.columns.book;

  // Defaults
  document.getElementById("default-status").value = settings.defaults.status;
  document.getElementById("default-filter").value = settings.defaults.filter;
  document.getElementById("default-stake-type").value = settings.defaults.stakeType;

  // Favorites
  renderFavorites();
  renderAiOptions();
}

function renderAiOptions() {
  const container = document.getElementById("ais-list");
  if (!container) return;

  const options = sanitizeAiOptions(settings.aiOptions);
  settings.aiOptions = options;

  container.innerHTML = "";
  options.forEach((name, index) => {
    const item = document.createElement("div");
    item.className = "favorite-item";
    item.innerHTML = `
      <span>${name}</span>
      <button type="button" class="ghost small" data-ai-index="${index}" title="Remover IA">✕</button>
    `;
    container.appendChild(item);
  });

  container.querySelectorAll("button[data-ai-index]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      if (settings.aiOptions.length <= 1) {
        alert("Você precisa manter pelo menos 1 IA na lista.");
        return;
      }
      const index = Number(e.currentTarget.dataset.aiIndex);
      if (!Number.isInteger(index)) return;
      settings.aiOptions.splice(index, 1);
      settings.aiOptions = sanitizeAiOptions(settings.aiOptions);
      await saveSettings();
      renderAiOptions();
      showToast("IA removida!");
    });
  });
}

function renderFavorites() {
  const container = document.getElementById("favorites-list");
  if (!container) return;

  settings.favorites = sanitizeFavorites(settings.favorites);
  settings.houseBalances = sanitizeHouseBalances(settings.houseBalances);
  container.innerHTML = "";

  if (settings.favorites.length === 0) {
    container.innerHTML = '<p class="empty-message">Nenhuma casa cadastrada ainda.</p>';
    return;
  }

  const sortedFavorites = settings.favorites
    .map((fav, index) => ({
      fav,
      index,
      baseBalance: getHouseBalanceByName(fav),
      currentBankroll: getCurrentHouseBankrollByName(fav),
    }))
    .sort((a, b) => {
      if (b.currentBankroll !== a.currentBankroll) return b.currentBankroll - a.currentBankroll;
      return a.fav.localeCompare(b.fav, "pt-BR", { sensitivity: "base" });
    });

  sortedFavorites.forEach(({ fav, index, baseBalance, currentBankroll }) => {
    const item = document.createElement("div");
    item.className = "favorite-item";
    const isEditing = favoriteEditingIndex === index;
    const currentBalance = baseBalance;

    if (isEditing) {
      const escaped = String(fav).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
      item.innerHTML = `
        <div class="favorite-edit-wrap">
          <input type="text" class="favorite-edit-input" data-edit-input="${index}" value="${escaped}" />
          <input type="text" class="favorite-balance-input" data-balance-input="${index}" value="${numberFormatter.format(currentBalance)}" placeholder="Saldo" />
        </div>
        <div class="favorite-actions">
          <button type="button" class="ghost small" data-action="save" data-index="${index}">Salvar</button>
          <button type="button" class="ghost small" data-action="save-apply" data-index="${index}">Salvar + Aplicar</button>
          <button type="button" class="ghost small" data-action="cancel" data-index="${index}">Cancelar</button>
        </div>
      `;
    } else {
      item.innerHTML = `
        <div class="favorite-main">
          <span>${fav}</span>
          <small class="muted">Extrato: ${currencyFormatter.format(currentBankroll)} · Saldo: ${numberFormatter.format(currentBalance)}</small>
        </div>
        <div class="favorite-actions">
          <button type="button" class="ghost small" data-action="edit" data-index="${index}">Editar</button>
          <button type="button" class="ghost small danger" data-action="remove" data-index="${index}">✕</button>
        </div>
      `;
    }

    container.appendChild(item);
  });

  container.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const action = e.currentTarget.dataset.action;
      const index = Number(e.currentTarget.dataset.index);
      if (!Number.isInteger(index)) return;

      if (action === "edit") {
        favoriteEditingIndex = index;
        renderFavorites();
        const input = container.querySelector(`input[data-edit-input="${index}"]`);
        input?.focus();
        input?.select();
        return;
      }

      if (action === "cancel") {
        favoriteEditingIndex = null;
        renderFavorites();
        return;
      }

      if (action === "remove") {
        const removedName = settings.favorites[index];
        settings.favorites.splice(index, 1);
        favoriteEditingIndex = null;
        settings.favorites = sanitizeFavorites(settings.favorites);
        const removedKey = normalizeHouseBalanceKey(removedName);
        delete settings.houseBalances[removedKey];
        await saveSettings();
        renderFavorites();
        showToast("Casa removida.");
        return;
      }

      if (action === "save" || action === "save-apply") {
        const input = container.querySelector(`input[data-edit-input="${index}"]`);
        const balanceInput = container.querySelector(`input[data-balance-input="${index}"]`);
        const nextName = normalizeFavoriteName(input?.value || "");
        const prevName = normalizeFavoriteName(settings.favorites[index] || "");
        const nextBalance = parseLocaleNumber(balanceInput?.value || "0");

        if (!nextName) {
          alert("Digite o nome da casa.");
          input?.focus();
          return;
        }

        if (!Number.isFinite(nextBalance)) {
          alert("Informe um saldo válido para a casa.");
          balanceInput?.focus();
          return;
        }

        const duplicate = settings.favorites.some((name, i) => i !== index && normalizeFavoriteName(name).toLowerCase() === nextName.toLowerCase());
        if (duplicate) {
          alert("Já existe uma casa com esse nome.");
          input?.focus();
          input?.select();
          return;
        }

        settings.favorites[index] = nextName;
        settings.favorites = sanitizeFavorites(settings.favorites);
        const prevKey = normalizeHouseBalanceKey(prevName);
        const nextKey = normalizeHouseBalanceKey(nextName);
        if (prevKey && prevKey !== nextKey) {
          delete settings.houseBalances[prevKey];
        }
        settings.houseBalances[nextKey] = nextBalance;
        favoriteEditingIndex = null;
        await saveSettings();
        renderFavorites();

        if (action === "save-apply" && prevName && prevName.toLowerCase() !== nextName.toLowerCase()) {
          const ok = await renameHouseInHistory(prevName, nextName);
          if (ok) return;
        }

        showToast("Casa renomeada!");
      }
    });
  });

  container.querySelectorAll("input[data-edit-input]").forEach((input) => {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const index = Number(e.currentTarget.dataset.editInput);
        container.querySelector(`button[data-action="save"][data-index="${index}"]`)?.click();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        const index = Number(e.currentTarget.dataset.editInput);
        container.querySelector(`button[data-action="cancel"][data-index="${index}"]`)?.click();
      }
    });
  });
}

async function renameHouseInHistory(oldName, newName) {
  try {
    const resposta = await fetch('api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        acao: 'renomear_casa_historico',
        profile_id: activeProfileId,
        old_name: oldName,
        new_name: newName,
      })
    });

    const json = await resposta.json();
    if (!json?.sucesso) {
      alert(json?.erro || 'Não foi possível aplicar a renomeação no histórico.');
      return false;
    }

    const apostas = Number(json.apostas_atualizadas || 0);
    const fluxos = Number(json.fluxos_atualizados || 0);
    await loadBooksFromHistory(activeProfileId);
    showToast(`Renomeação aplicada: ${apostas} apostas e ${fluxos} fluxos atualizados.`);
    return true;
  } catch (e) {
    console.error('Erro ao renomear casa no histórico:', e);
    alert('Falha de comunicação ao aplicar renomeação no histórico.');
    return false;
  }
}

function addFavorite() {
  const input = document.getElementById("new-favorite");
  const value = normalizeFavoriteName(input?.value || "");

  if (!value) {
    alert("Digite o nome da casa.");
    input?.focus();
    return;
  }

  const exists = sanitizeFavorites(settings.favorites).some((item) => item.toLowerCase() === value.toLowerCase());
  if (exists) {
    alert("Essa casa já está cadastrada.");
    input?.focus();
    input?.select();
    return;
  }

  settings.favorites.push(value);
  settings.favorites = sanitizeFavorites(settings.favorites);
  const balanceKey = normalizeHouseBalanceKey(value);
  if (!(balanceKey in settings.houseBalances)) {
    settings.houseBalances[balanceKey] = 0;
  }
  favoriteEditingIndex = null;
  saveSettings();
  renderFavorites();
  if (input) input.value = "";
  showToast("Casa adicionada!");
}

function collectSettings() {
  settings.profile.name = document.getElementById("profile-name").value.trim();
  const goalValue = parseLocaleNumber(document.getElementById("profile-goal").value);
  settings.profile.goal = Number.isFinite(goalValue) ? goalValue : null;

  settings.display.showCalendar = document.getElementById("show-calendar").checked;
  settings.display.showChart = document.getElementById("show-chart").checked;
  settings.display.showBankroll = document.getElementById("show-bankroll").checked;
  settings.display.showKpis = document.getElementById("show-kpis").checked;
  settings.display.showAiSuggestions = document.getElementById("show-ai-suggestions").checked;
  settings.display.showPotentialProfit = document.getElementById("show-potential-profit").checked;
  settings.display.showTablePotential = document.getElementById("show-table-potential").checked;
  settings.display.showRoi = document.getElementById("show-roi").checked;
  settings.display.showAvgOdd = document.getElementById("show-avg-odd").checked;
  settings.display.showAvgStake = document.getElementById("show-avg-stake").checked;
  settings.display.showTotalStake = document.getElementById("show-total-stake").checked;
  settings.display.showTotalBets = document.getElementById("show-total-bets").checked;
  settings.display.showStreak = document.getElementById("show-streak").checked;
  settings.display.showStakedPeriod = document.getElementById("show-staked-period").checked;

  settings.columns.date = document.getElementById("col-date").checked;
  settings.columns.odds = document.getElementById("col-odds").checked;
  settings.columns.stake = document.getElementById("col-stake").checked;
  settings.columns.status = document.getElementById("col-status").checked;
  settings.columns.profit = document.getElementById("col-profit").checked;
  settings.columns.potential = document.getElementById("col-potential").checked;
  settings.columns.book = document.getElementById("col-book").checked;

  settings.defaults.status = document.getElementById("default-status").value;
  settings.defaults.filter = document.getElementById("default-filter").value;
  settings.defaults.stakeType = document.getElementById("default-stake-type").value;
}

// Auto-save on change
function setupAutoSave() {
  const inputs = document.querySelectorAll('input[type="checkbox"], select');
  inputs.forEach((input) => {
    input.addEventListener("change", () => {
      collectSettings();
      saveSettings();
      showToast("Configurações salvas!");
    });
  });
}

function showToast(message) {
  // Criar toast se não existir
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2000);
}

// Profile form submit
document.getElementById("profile-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  collectSettings();
  await saveSettings();
  
  // Atualizar nome do perfil se alterado
  const activeProfile = getActiveProfile();
  if (activeProfile && settings.profile.name) {
    const atualizado = await salvarPerfilApi({ id: activeProfile.id, name: settings.profile.name });
    if (atualizado) {
      profiles = await loadProfilesFromApi();
    }
    renderProfiles();
  }
  
  showToast("Perfil salvo com sucesso!");
});

// Criar novo perfil
document.getElementById("create-profile-btn").addEventListener("click", async () => {
  const input = document.getElementById("new-profile-name");
  const name = input.value.trim();
  
  if (!name) {
    alert("Digite um nome para o perfil.");
    return;
  }
  
  const newProfile = await createProfile(name);
  if (!newProfile) {
    alert("Não foi possível criar o perfil.");
    return;
  }

  await switchProfile(newProfile.id);
  input.value = "";
  renderProfiles();
  showToast(`Perfil "${newProfile.name}" criado!`);
});

document.getElementById("new-profile-name").addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    document.getElementById("create-profile-btn").click();
  }
});

// Add favorite
document.getElementById("add-favorite-btn").addEventListener("click", addFavorite);

document.getElementById("new-favorite").addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addFavorite();
  }
});

// Add AI option
document.getElementById("add-ai-btn")?.addEventListener("click", async () => {
  const input = document.getElementById("new-ai-name");
  const value = normalizeAiName(input?.value);

  if (!value) {
    alert("Digite um nome de IA.");
    return;
  }

  const exists = sanitizeAiOptions(settings.aiOptions).some((ai) => ai.toLowerCase() === value.toLowerCase());
  if (exists) {
    alert("Essa IA já está na lista.");
    return;
  }

  settings.aiOptions = sanitizeAiOptions([...(settings.aiOptions || []), value]);
  await saveSettings();
  renderAiOptions();
  if (input) input.value = "";
  showToast("IA adicionada!");
});

document.getElementById("new-ai-name")?.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    document.getElementById("add-ai-btn")?.click();
  }
});

// Export data
document.getElementById("export-data").addEventListener("click", () => {
  const data = {
    profileId: activeProfileId,
    profileName: getActiveProfile()?.name || "Perfil",
    bets: JSON.parse(localStorage.getItem(getStorageKey(activeProfileId)) || "[]"),
    cashflows: JSON.parse(localStorage.getItem(getCashflowKey(activeProfileId)) || "[]"),
    bankroll: localStorage.getItem(getBankrollKey(activeProfileId)),
    settings: settings,
    exportDate: new Date().toISOString(),
  };

  const profileName = getActiveProfile()?.name?.replace(/[^a-z0-9]/gi, '_') || 'perfil';
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `caderneta-${profileName}-${new Date().toISOString().split("T")[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Dados exportados!");
});

// Import data
document.getElementById("import-data").addEventListener("click", () => {
  document.getElementById("import-file").click();
});

document.getElementById("import-file").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target.result);

      if (!data.bets && !data.cashflows && !data.bankroll && !data.settings) {
        alert("Arquivo inválido: não contém dados reconhecidos (bets, cashflows, bankroll ou settings).");
        return;
      }

      // Se o arquivo veio com profileId diferente, perguntar se quer importar mesmo assim
      if (data.profileId && data.profileId !== activeProfileId) {
        const profileName = data.profileName || data.profileId;
        if (!confirm(`Este arquivo é do perfil "${profileName}". Deseja importar os dados para o perfil atual?`)) {
          return;
        }
      }

      let importCount = 0;

      if (data.bets && Array.isArray(data.bets)) {
        // Garantir que todas as apostas tenham os campos necessários
        const normalizedBets = data.bets.map(bet => ({
          ...bet,
          odds: Number(bet.odds),
          stake: Number(bet.stake),
          isFreebet: bet.isFreebet || false,
          ai: bet.ai || null,
        }));
        localStorage.setItem(getStorageKey(activeProfileId), JSON.stringify(normalizedBets));
        importCount += normalizedBets.length;
      }
      if (data.cashflows && Array.isArray(data.cashflows)) {
        localStorage.setItem(getCashflowKey(activeProfileId), JSON.stringify(data.cashflows));
      }
      if (data.bankroll !== undefined && data.bankroll !== null) {
        localStorage.setItem(getBankrollKey(activeProfileId), String(data.bankroll));
      }
      if (data.settings) {
        settings = { ...defaultSettings, ...data.settings };
        settings.favorites = sanitizeFavorites(data.settings.favorites);
        settings.houseBalances = sanitizeHouseBalances(data.settings.houseBalances);
        settings.aiOptions = sanitizeAiOptions(data.settings.aiOptions);
        saveSettings();
        populateForm();
      }

      renderProfiles();
      
      const msg = `✅ Importação concluída!\n\n` +
        `• ${data.bets ? data.bets.length : 0} apostas\n` +
        `• ${data.cashflows ? data.cashflows.length : 0} movimentações\n` +
        `• Bankroll: ${data.bankroll ? 'Sim' : 'Não'}\n` +
        `• Configurações: ${data.settings ? 'Sim' : 'Não'}\n\n` +
        `Deseja ir para a página principal para ver os dados?`;
      
      if (confirm(msg)) {
        window.location.href = 'index.html';
      } else {
        showToast("Dados importados com sucesso!");
      }
    } catch (err) {
      console.error("Erro na importação:", err);
      alert("Erro ao importar arquivo. Verifique se é um JSON válido.\n\nDetalhes: " + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = "";
});

// Clear all data
document.getElementById("clear-data").addEventListener("click", () => {
  const profileName = getActiveProfile()?.name || "este perfil";
  if (confirm(`Tem certeza que deseja apagar todos os dados de "${profileName}"? Esta ação não pode ser desfeita.`)) {
    if (confirm("Última chance! Todos os dados do perfil serão perdidos permanentemente.")) {
      localStorage.removeItem(getStorageKey(activeProfileId));
      localStorage.removeItem(getCashflowKey(activeProfileId));
      localStorage.removeItem(getBankrollKey(activeProfileId));
      localStorage.setItem(getSettingsKey(activeProfileId), JSON.stringify(defaultSettings));
      settings = { ...defaultSettings };
      populateForm();
      renderProfiles();
      showToast("Dados do perfil foram apagados.");
    }
  }
});

// ========================
// CONFIGURAÇÃO DA API GEMINI
// ========================
const GEMINI_API_KEY_STORAGE = "caderneta.gemini.apikey";

function loadGeminiApiKey() {
  const input = document.getElementById("gemini-api-key");
  if (!input) return;
  
  const savedKey = localStorage.getItem(GEMINI_API_KEY_STORAGE);
  if (savedKey) {
    input.value = savedKey;
  }
}

function saveGeminiApiKey() {
  const input = document.getElementById("gemini-api-key");
  if (!input) return;
  
  const key = input.value.trim();
  // Clear cached model whenever the key changes so the next use picks the best
  // available model for the new key.
  localStorage.removeItem("caderneta.gemini.model");
  if (key) {
    localStorage.setItem(GEMINI_API_KEY_STORAGE, key);
    showApiStatus("✓ Chave API salva com sucesso!", "success");
  } else {
    localStorage.removeItem(GEMINI_API_KEY_STORAGE);
    showApiStatus("Chave API removida.", "info");
  }
}

function showApiStatus(message, type) {
  const statusEl = document.getElementById("api-key-status");
  if (!statusEl) return;
  
  statusEl.textContent = message;
  statusEl.className = `api-status show ${type}`;
  
  setTimeout(() => {
    statusEl.className = "api-status";
  }, 4000);
}

async function resolveGeminiModel(apiKey) {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      { method: "GET" }
    );

    if (!response.ok) return null;

    const data = await response.json();
    const models = Array.isArray(data.models) ? data.models : [];
    
    // Filtrar modelos que suportam generateContent
    const generative = models.filter((m) =>
      m.supportedGenerationMethods?.includes("generateContent")
    );

    // Ordem de preferência — do mais capaz para o fallback.
    // Utiliza correspondência exata/versionada para evitar que
    // "gemini-2.0-flash" resolva acidentalmente para "gemini-2.0-flash-lite".
    const preferred = [
      "gemini-2.5-flash-preview",
      "gemini-2.5-flash",
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite",
      "gemini-1.5-flash",
      "gemini-pro",
    ];

    for (const pref of preferred) {
      const match = generative.find((m) => {
        const shortName = (m.name || "").replace("models/", "");
        return shortName === pref || shortName.startsWith(pref + "-");
      });
      if (match) return match.name;
    }

    // Qualquer modelo que suporte generateContent
    return generative[0]?.name || null;
  } catch (err) {
    return null;
  }
}

async function testGeminiApiKey() {
  const input = document.getElementById("gemini-api-key");
  if (!input) return;
  
  const key = input.value.trim();
  if (!key) {
    showApiStatus("❌ Insira uma chave API primeiro.", "error");
    return;
  }
  
  showApiStatus("🔄 Buscando modelos disponíveis...", "info");
  
  try {
    // Primeiro listar modelos disponíveis
    const model = await resolveGeminiModel(key);
    
    if (!model) {
      showApiStatus("❌ Nenhum modelo disponível. Verifique sua chave API e billing do projeto.", "error");
      return;
    }
    
    showApiStatus(`🔄 Testando modelo: ${model}...`, "info");
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Responda apenas: OK" }] }]
        })
      }
    );
    
    if (response.ok) {
      // Salvar o modelo que funcionou para usar na importação
      localStorage.setItem("caderneta.gemini.model", model);
      showApiStatus(`✅ Conexão bem sucedida! Modelo: ${model}`, "success");
    } else {
      const error = await response.json();
      showApiStatus(`❌ Erro: ${error.error?.message || "Chave inválida"}`, "error");
    }
  } catch (err) {
    showApiStatus(`❌ Erro de conexão: ${err.message}`, "error");
  }
}

function toggleApiKeyVisibility() {
  const input = document.getElementById("gemini-api-key");
  if (!input) return;
  
  input.type = input.type === "password" ? "text" : "password";
}

// Event listeners Gemini API
document.getElementById("save-api-key")?.addEventListener("click", saveGeminiApiKey);
document.getElementById("test-api-key")?.addEventListener("click", testGeminiApiKey);
document.getElementById("toggle-api-key")?.addEventListener("click", toggleApiKeyVisibility);

// ========================
// CATEGORIAS DE ESPORTES
// ========================
async function loadCategories() {
  try {
    const resposta = await fetch('api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'carregar_categorias', profile_id: activeProfileId })
    });
    const dados = await resposta.json();
    categories = Array.isArray(dados) ? dados : [];
  } catch (e) {
    console.error("Erro ao carregar categorias:", e);
    categories = [];
  }
}

async function saveCategory(cat) {
  try {
    const resposta = await fetch('api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'salvar_categoria', profile_id: activeProfileId, categoria: cat })
    });
    const resultado = await resposta.json();
    return resultado.sucesso;
  } catch (e) {
    console.error("Erro ao salvar categoria:", e);
    return false;
  }
}

async function deleteCategory(id) {
  try {
    const resposta = await fetch('api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'excluir_categoria', profile_id: activeProfileId, id })
    });
    const resultado = await resposta.json();
    return resultado.sucesso;
  } catch (e) {
    console.error("Erro ao excluir categoria:", e);
    return false;
  }
}

async function createDefaultCategories() {
  const defaults = [
    { id: crypto.randomUUID(), name: 'Futebol', icon: '⚽', sort_order: 0 },
    { id: crypto.randomUUID(), name: 'Basquete', icon: '🏀', sort_order: 1 },
    { id: crypto.randomUUID(), name: 'Outros', icon: '🏅', sort_order: 2 },
  ];
  for (const cat of defaults) {
    await saveCategory(cat);
  }
  await loadCategories();
}

function renderCategories() {
  const container = document.getElementById("categories-list");
  if (!container) return;

  container.innerHTML = "";

  if (categories.length === 0) {
    container.innerHTML = '<p class="empty-message">Nenhuma categoria cadastrada. As padrão serão criadas automaticamente.</p>';
    return;
  }

  categories.forEach((cat) => {
    const item = document.createElement("div");
    item.className = "favorite-item";
    item.innerHTML = `
      <span>${cat.icon || '🏅'} ${cat.name}</span>
      <button type="button" class="ghost small" data-cat-id="${cat.id}" title="Excluir categoria">✕</button>
    `;
    container.appendChild(item);
  });

  // Event listeners para remover
  container.querySelectorAll("button[data-cat-id]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.dataset.catId;
      const cat = categories.find(c => c.id === id);
      if (cat && confirm(`Excluir categoria "${cat.name}"? Apostas com esta categoria ficarão sem categoria.`)) {
        if (await deleteCategory(id)) {
          await loadCategories();
          renderCategories();
          showToast("Categoria excluída!");
        }
      }
    });
  });
}

// Add category
document.getElementById("add-category-btn")?.addEventListener("click", async () => {
  const nameInput = document.getElementById("new-category-name");
  const iconInput = document.getElementById("new-category-icon");
  const name = nameInput.value.trim();
  const icon = iconInput.value.trim() || '🏅';

  if (!name) {
    alert("Digite um nome para a categoria.");
    return;
  }

  // Verificar duplicatas
  if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
    alert("Já existe uma categoria com este nome.");
    return;
  }

  const cat = {
    id: crypto.randomUUID(),
    name: name,
    icon: icon,
    sort_order: categories.length,
  };

  if (await saveCategory(cat)) {
    await loadCategories();
    renderCategories();
    nameInput.value = "";
    iconInput.value = "";
    showToast(`Categoria "${name}" adicionada!`);
  }
});

document.getElementById("new-category-name")?.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    document.getElementById("add-category-btn")?.click();
  }
});

// Init Async
async function inicializarPaginaConfiguracoes() {
  await loadProfiles();
  await loadSettings(); // Agora espera o BD responder!
  await syncFavoritesWithHistory();
  populateForm();
  renderProfiles();
  setupAutoSave();
  loadGeminiApiKey();
  await loadCategories();
  if (categories.length === 0) {
    await createDefaultCategories();
  }
  renderCategories();
}

inicializarPaginaConfiguracoes();
