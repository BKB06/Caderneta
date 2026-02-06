const PROFILES_KEY = "caderneta.profiles.v1";
const ACTIVE_PROFILE_KEY = "caderneta.activeProfile.v1";

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
function getNotesKey(profileId) {
  return `caderneta.notes.${profileId}`;
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
  defaults: {
    status: "pending",
    filter: "pending",
    stakeType: "regular",
  },
};

let settings = { ...defaultSettings };
let profiles = [];
let activeProfileId = null;

// Gerenciamento de Perfis
function loadProfiles() {
  const raw = localStorage.getItem(PROFILES_KEY);
  if (raw) {
    try {
      profiles = JSON.parse(raw);
    } catch (e) {
      profiles = [];
    }
  }
  
  // Se não há perfis, criar o perfil padrão
  if (profiles.length === 0) {
    const defaultProfile = {
      id: "default",
      name: "Perfil Principal",
      createdAt: new Date().toISOString(),
    };
    profiles.push(defaultProfile);
    saveProfiles();
    
    // Migrar dados existentes para o perfil padrão
    migrateExistingData("default");
  }
  
  // Carregar perfil ativo
  activeProfileId = localStorage.getItem(ACTIVE_PROFILE_KEY);
  if (!activeProfileId || !profiles.find(p => p.id === activeProfileId)) {
    activeProfileId = profiles[0].id;
    localStorage.setItem(ACTIVE_PROFILE_KEY, activeProfileId);
  }
}

function saveProfiles() {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
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

function createProfile(name) {
  const id = `profile_${Date.now()}`;
  const newProfile = {
    id,
    name: name.trim(),
    createdAt: new Date().toISOString(),
  };
  profiles.push(newProfile);
  saveProfiles();
  
  // Criar configurações padrão para o novo perfil
  localStorage.setItem(getSettingsKey(id), JSON.stringify(defaultSettings));
  
  return newProfile;
}

function deleteProfile(profileId) {
  if (profiles.length <= 1) {
    alert("Você precisa ter pelo menos um perfil.");
    return false;
  }
  
  const profile = profiles.find(p => p.id === profileId);
  if (!profile) return false;
  
  if (!confirm(`Tem certeza que deseja excluir o perfil "${profile.name}"? Todos os dados serão perdidos.`)) {
    return false;
  }
  
  // Remover todos os dados do perfil
  localStorage.removeItem(getStorageKey(profileId));
  localStorage.removeItem(getCashflowKey(profileId));
  localStorage.removeItem(getBankrollKey(profileId));
  localStorage.removeItem(getSettingsKey(profileId));
  
  // Remover da lista
  profiles = profiles.filter(p => p.id !== profileId);
  saveProfiles();
  
  // Se era o perfil ativo, trocar para outro
  if (activeProfileId === profileId) {
    switchProfile(profiles[0].id);
  }
  
  return true;
}

function switchProfile(profileId) {
  const profile = profiles.find(p => p.id === profileId);
  if (!profile) return false;
  
  activeProfileId = profileId;
  localStorage.setItem(ACTIVE_PROFILE_KEY, profileId);
  
  // Recarregar configurações do novo perfil
  loadSettings();
  populateForm();
  renderProfiles();
  loadNotes();
  
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
    btn.addEventListener("click", (e) => {
      const action = e.target.dataset.action;
      const id = e.target.dataset.id;
      
      if (action === "switch") {
        switchProfile(id);
      } else if (action === "delete") {
        if (deleteProfile(id)) {
          renderProfiles();
          showToast("Perfil excluído!");
        }
      }
    });
  });
  
  // Atualizar info do perfil atual
  const activeProfile = getActiveProfile();
  if (infoContainer && activeProfile) {
    const betsCount = JSON.parse(localStorage.getItem(getStorageKey(activeProfileId)) || "[]").length;
    infoContainer.innerHTML = `
      <div class="current-profile-stats">
        <span>📊 Perfil ativo: <strong>${activeProfile.name}</strong></span>
        <span>📝 ${betsCount} apostas registradas</span>
      </div>
    `;
  }
}

function loadSettings() {
  const raw = localStorage.getItem(getSettingsKey(activeProfileId));
  if (raw) {
    try {
      const saved = JSON.parse(raw);
      settings = { ...defaultSettings, ...saved };
      // Merge nested objects
      settings.profile = { ...defaultSettings.profile, ...saved.profile };
      settings.display = { ...defaultSettings.display, ...saved.display };
      settings.columns = { ...defaultSettings.columns, ...saved.columns };
      settings.defaults = { ...defaultSettings.defaults, ...saved.defaults };
      settings.favorites = saved.favorites || [];
    } catch (e) {
      settings = { ...defaultSettings };
    }
  } else {
    settings = { ...defaultSettings };
  }
}

function saveSettings() {
  localStorage.setItem(getSettingsKey(activeProfileId), JSON.stringify(settings));
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
}

function renderFavorites() {
  const container = document.getElementById("favorites-list");
  container.innerHTML = "";

  if (settings.favorites.length === 0) {
    container.innerHTML = '<p class="empty-message">Nenhuma casa favorita adicionada.</p>';
    return;
  }

  settings.favorites.forEach((fav, index) => {
    const item = document.createElement("div");
    item.className = "favorite-item";
    item.innerHTML = `
      <span>${fav}</span>
      <button type="button" class="ghost small" data-index="${index}">✕</button>
    `;
    container.appendChild(item);
  });

  // Event listeners para remover
  container.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const index = parseInt(e.target.dataset.index);
      settings.favorites.splice(index, 1);
      saveSettings();
      renderFavorites();
    });
  });
}

function collectSettings() {
  settings.profile.name = document.getElementById("profile-name").value.trim();
  const goalValue = parseLocaleNumber(document.getElementById("profile-goal").value);
  settings.profile.goal = Number.isFinite(goalValue) ? goalValue : null;

  settings.display.showCalendar = document.getElementById("show-calendar").checked;
  settings.display.showChart = document.getElementById("show-chart").checked;
  settings.display.showBankroll = document.getElementById("show-bankroll").checked;
  settings.display.showKpis = document.getElementById("show-kpis").checked;
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
document.getElementById("profile-form").addEventListener("submit", (e) => {
  e.preventDefault();
  collectSettings();
  saveSettings();
  
  // Atualizar nome do perfil se alterado
  const activeProfile = getActiveProfile();
  if (activeProfile && settings.profile.name) {
    activeProfile.name = settings.profile.name;
    saveProfiles();
    renderProfiles();
  }
  
  showToast("Perfil salvo com sucesso!");
});

// Criar novo perfil
document.getElementById("create-profile-btn").addEventListener("click", () => {
  const input = document.getElementById("new-profile-name");
  const name = input.value.trim();
  
  if (!name) {
    alert("Digite um nome para o perfil.");
    return;
  }
  
  const newProfile = createProfile(name);
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
document.getElementById("add-favorite-btn").addEventListener("click", () => {
  const input = document.getElementById("new-favorite");
  const value = input.value.trim();
  if (value && !settings.favorites.includes(value)) {
    settings.favorites.push(value);
    saveSettings();
    renderFavorites();
    input.value = "";
    showToast("Casa adicionada!");
  }
});

document.getElementById("new-favorite").addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    document.getElementById("add-favorite-btn").click();
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
      
      if (data.bets) {
        localStorage.setItem(getStorageKey(activeProfileId), JSON.stringify(data.bets));
      }
      if (data.cashflows) {
        localStorage.setItem(getCashflowKey(activeProfileId), JSON.stringify(data.cashflows));
      }
      if (data.bankroll) {
        localStorage.setItem(getBankrollKey(activeProfileId), data.bankroll);
      }
      if (data.settings) {
        settings = { ...defaultSettings, ...data.settings };
        saveSettings();
        populateForm();
      }

      renderProfiles();
      showToast("Dados importados com sucesso!");
    } catch (err) {
      alert("Erro ao importar arquivo. Verifique se é um JSON válido.");
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
      localStorage.removeItem(getNotesKey(activeProfileId));
      localStorage.setItem(getSettingsKey(activeProfileId), JSON.stringify(defaultSettings));
      settings = { ...defaultSettings };
      populateForm();
      renderProfiles();
      loadNotes();
      showToast("Dados do perfil foram apagados.");
    }
  }
});

// Anotações
function loadNotes() {
  const notesTextarea = document.getElementById("user-notes");
  const notesStatus = document.getElementById("notes-status");
  if (!notesTextarea || !activeProfileId) return;
  
  const saved = localStorage.getItem(getNotesKey(activeProfileId));
  notesTextarea.value = saved || "";
  if (notesStatus) notesStatus.textContent = "";
}

function saveNotes() {
  const notesTextarea = document.getElementById("user-notes");
  const notesStatus = document.getElementById("notes-status");
  if (!notesTextarea || !activeProfileId) return;
  
  localStorage.setItem(getNotesKey(activeProfileId), notesTextarea.value);
  if (notesStatus) {
    notesStatus.textContent = "✓ Salvo";
    notesStatus.className = "notes-status saved";
    setTimeout(() => {
      notesStatus.textContent = "";
      notesStatus.className = "notes-status";
    }, 2000);
  }
}

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
  const statusEl = document.getElementById("api-key-status");
  if (!input) return;
  
  const key = input.value.trim();
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

async function testGeminiApiKey() {
  const input = document.getElementById("gemini-api-key");
  if (!input) return;
  
  const key = input.value.trim();
  if (!key) {
    showApiStatus("❌ Insira uma chave API primeiro.", "error");
    return;
  }
  
  showApiStatus("🔄 Testando conexão...", "info");
  
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Responda apenas: OK" }] }]
        })
      }
    );
    
    if (response.ok) {
      showApiStatus("✅ Conexão bem sucedida! API funcionando.", "success");
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

// Event listeners para anotações
document.getElementById("save-notes-btn")?.addEventListener("click", saveNotes);

// Auto-save anotações ao digitar (debounce)
let notesTimeout = null;
document.getElementById("user-notes")?.addEventListener("input", () => {
  const notesStatus = document.getElementById("notes-status");
  if (notesStatus) {
    notesStatus.textContent = "Digitando...";
    notesStatus.className = "notes-status";
  }
  
  clearTimeout(notesTimeout);
  notesTimeout = setTimeout(() => {
    saveNotes();
  }, 1000);
});

// Init
loadProfiles();
loadSettings();
populateForm();
renderProfiles();
setupAutoSave();
loadNotes();
loadGeminiApiKey();
