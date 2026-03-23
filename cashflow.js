const ACTIVE_PROFILE_KEY = "caderneta.activeProfile.v1";

function getActiveProfileId() {
  const activeId = localStorage.getItem(ACTIVE_PROFILE_KEY);
  return activeId || null;
}

let cashflows = [];
let editingId = null;
let cashflowChart = null;
let configuredHouses = [];

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

// DOM Elements
const form = document.getElementById("cashflow-form");
const submitButton = document.getElementById("cashflow-submit");
const resetButton = document.getElementById("cashflow-reset");
const cashflowBody = document.getElementById("cashflow-body");
const typeFilter = document.getElementById("type-filter");
const bookFilter = document.getElementById("book-filter");
const dateFilterStart = document.getElementById("date-filter-start");
const dateFilterEnd = document.getElementById("date-filter-end");
const clearFiltersBtn = document.getElementById("clear-filters");

function normalizeBookName(value) {
  return String(value || "").trim();
}

function sanitizeHouseList(list) {
  const source = Array.isArray(list) ? list : [];
  const unique = [];
  const seen = new Set();

  source.forEach((item) => {
    const name = normalizeBookName(item);
    if (!name) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(name);
  });

  return unique;
}

function getKnownBooks() {
  return sanitizeHouseList([
    ...configuredHouses,
    ...cashflows.map((flow) => normalizeBookName(flow.book)).filter(Boolean),
  ]).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
}

function renderBookInputSuggestions() {
  const input = document.getElementById("cashflow-book");
  if (!input) return;

  let datalist = document.getElementById("cashflow-book-suggestions");
  if (!datalist) {
    datalist = document.createElement("datalist");
    datalist.id = "cashflow-book-suggestions";
    document.body.appendChild(datalist);
  }

  input.setAttribute("list", "cashflow-book-suggestions");
  input.setAttribute("autocomplete", "off");

  const books = getKnownBooks();
  datalist.innerHTML = "";
  books.forEach((book) => {
    const option = document.createElement("option");
    option.value = book;
    datalist.appendChild(option);
  });
}

async function loadConfiguredHouses() {
  try {
    const profileId = getActiveProfileId();
    const resposta = await fetch('api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'carregar_dados_extras', profile_id: profileId })
    });

    const json = await resposta.json();
    const raw = json?.dados?.settings_json;
    let parsed = {};

    if (typeof raw === "string" && raw.trim()) {
      try {
        parsed = JSON.parse(raw);
      } catch (erro) {
        console.warn("settings_json inválido ao carregar casas:", erro);
      }
    }

    configuredHouses = sanitizeHouseList(parsed?.favorites || []);
  } catch (erro) {
    console.error("Erro ao carregar casas configuradas:", erro);
    configuredHouses = [];
  }

  renderBookInputSuggestions();
}

async function ensureBookInConfiguredHouses(book) {
  const houseName = normalizeBookName(book);
  if (!houseName) return;

  const alreadyExists = configuredHouses.some((item) => item.toLowerCase() === houseName.toLowerCase());
  if (alreadyExists) return;

  const profileId = getActiveProfileId();
  try {
    const loadResponse = await fetch('api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'carregar_dados_extras', profile_id: profileId })
    });
    const loaded = await loadResponse.json();
    const raw = loaded?.dados?.settings_json;

    let settingsPayload = {};
    if (typeof raw === "string" && raw.trim()) {
      try {
        settingsPayload = JSON.parse(raw);
      } catch (erro) {
        console.warn("settings_json inválido ao integrar casa:", erro);
      }
    }

    const favorites = sanitizeHouseList(settingsPayload?.favorites || []);
    favorites.push(houseName);
    settingsPayload.favorites = sanitizeHouseList(favorites);

    if (!settingsPayload.houseBalances || typeof settingsPayload.houseBalances !== "object" || Array.isArray(settingsPayload.houseBalances)) {
      settingsPayload.houseBalances = {};
    }

    const saveResponse = await fetch('api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        acao: 'salvar_dados_extras',
        profile_id: profileId,
        tipo: 'settings',
        valor: JSON.stringify(settingsPayload),
      })
    });

    const saveJson = await saveResponse.json();
    if (saveJson?.sucesso) {
      configuredHouses = settingsPayload.favorites;
      renderBookInputSuggestions();
      renderBookFilter();
    }
  } catch (erro) {
    console.error("Erro ao sincronizar casa com configurações:", erro);
  }
}

async function loadCashflows() {
  try {
    const profileId = getActiveProfileId();
    const resposta = await fetch('api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'carregar_fluxo', profile_id: profileId })
    });
    const dados = await resposta.json();
    const rows = Array.isArray(dados) ? dados : [];
    cashflows = rows.map((flow) => ({
      ...flow,
      amount: Number(flow.amount),
      book: normalizeBookName(flow.book),
    }));
  } catch (erro) {
    console.error("Erro ao carregar fluxo:", erro);
    cashflows = [];
  }
}

// Novas funções para falar com a API
async function salvarFluxoBD(flow) {
  const resposta = await fetch('api.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acao: 'salvar_fluxo', profile_id: getActiveProfileId(), fluxo: flow })
  });

  const json = await resposta.json();
  if (!json?.sucesso) {
    throw new Error(json?.erro || "Não foi possível salvar a movimentação no banco.");
  }
}

async function excluirFluxoBD(id) {
  const resposta = await fetch('api.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acao: 'excluir_fluxo', profile_id: getActiveProfileId(), id: id })
  });

  const json = await resposta.json();
  if (!json?.sucesso) {
    throw new Error(json?.erro || "Não foi possível excluir a movimentação no banco.");
  }
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
  } catch (erro) {
    console.error("Erro ao carregar perfis:", erro);
    return [];
  }
}

function parseLocaleNumber(value) {
  if (typeof value !== "string") {
    return Number(value);
  }
  const normalized = value.replace(/\./g, "").replace(/,/g, ".").trim();
  return Number(normalized);
}

function formatProfit(value) {
  return currencyFormatter.format(value);
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

function cashflowLabel(type) {
  const map = {
    deposit: "Depósito",
    withdraw: "Saque",
  };
  return map[type] || type;
}

function getFilteredCashflows() {
  const type = typeFilter?.value || "all";
  const selectedBook = bookFilter?.value || "all";
  const startDate = dateFilterStart?.value ? parseDateForSort(dateFilterStart.value) : null;
  const endDate = dateFilterEnd?.value ? parseDateForSort(dateFilterEnd.value) : null;

  return cashflows.filter((flow) => {
    // Filtro por tipo
    const matchType = type === "all" || flow.type === type;
    const flowBook = normalizeBookName(flow.book);
    const matchBook = selectedBook === "all" || flowBook === selectedBook;

    // Filtro por data
    let matchDate = true;
    if (startDate || endDate) {
      const flowDate = parseDateForSort(flow.date);
      if (flowDate) {
        if (startDate && flowDate < startDate) matchDate = false;
        if (endDate && flowDate > endDate) matchDate = false;
      } else {
        matchDate = false;
      }
    }

    return matchType && matchDate && matchBook;
  });
}

function renderBookFilter() {
  if (!bookFilter) return;

  const books = getKnownBooks();

  const current = bookFilter.value || "all";
  bookFilter.innerHTML = '<option value="all">Todas</option>';

  books.forEach((book) => {
    const option = document.createElement("option");
    option.value = book;
    option.textContent = book;
    bookFilter.appendChild(option);
  });

  bookFilter.value = books.includes(current) ? current : "all";
}

function calcStats() {
  const deposits = cashflows.filter(f => f.type === "deposit");
  const withdraws = cashflows.filter(f => f.type === "withdraw");
  
  const totalDeposits = deposits.reduce((sum, f) => sum + f.amount, 0);
  const totalWithdraws = withdraws.reduce((sum, f) => sum + f.amount, 0);
  const netFlow = totalDeposits - totalWithdraws;

  return {
    totalDeposits,
    totalWithdraws,
    netFlow,
    totalMovements: cashflows.length,
    depositsCount: deposits.length,
    withdrawsCount: withdraws.length,
  };
}

function renderStats() {
  const stats = calcStats();

  document.getElementById("total-deposits").textContent = formatProfit(stats.totalDeposits);
  document.getElementById("total-withdraws").textContent = formatProfit(stats.totalWithdraws);
  
  const netFlowEl = document.getElementById("net-flow");
  netFlowEl.textContent = formatProfit(stats.netFlow);
  netFlowEl.style.color = stats.netFlow >= 0 ? 'var(--success)' : 'var(--danger)';

  document.getElementById("total-movements").textContent = stats.totalMovements;
}

function renderTable() {
  const data = getFilteredCashflows();
  cashflowBody.innerHTML = "";

  if (data.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.textContent = "Nenhuma movimentação encontrada.";
    row.appendChild(cell);
    cashflowBody.appendChild(row);
    return;
  }

  // Ordenar por data (mais recente primeiro)
  const sorted = [...data].sort((a, b) => {
    const dateA = parseDateForSort(a.date);
    const dateB = parseDateForSort(b.date);
    if (dateA && dateB) return dateB - dateA;
    return 0;
  });

  sorted.forEach((flow) => {
    const row = document.createElement("tr");

    const tdDate = document.createElement("td");
    tdDate.textContent = flow.date;
    row.appendChild(tdDate);

    const tdType = document.createElement("td");
    const typeBadge = document.createElement("span");
    typeBadge.className = `type-badge ${flow.type}`;
    typeBadge.textContent = cashflowLabel(flow.type);
    tdType.appendChild(typeBadge);
    row.appendChild(tdType);

    const tdBook = document.createElement("td");
    tdBook.textContent = flow.book || "-";
    row.appendChild(tdBook);

    const tdAmount = document.createElement("td");
    const signedAmount = flow.type === "withdraw" ? -Math.abs(flow.amount) : flow.amount;
    tdAmount.textContent = formatProfit(signedAmount);
    tdAmount.style.color = flow.type === "deposit" ? 'var(--success)' : 'var(--danger)';
    tdAmount.style.fontWeight = '600';
    row.appendChild(tdAmount);

    const tdNote = document.createElement("td");
    tdNote.textContent = flow.note || "-";
    row.appendChild(tdNote);

    const tdActions = document.createElement("td");
    tdActions.innerHTML = `
      <button type="button" class="ghost" data-action="edit" data-id="${flow.id}">Editar</button>
      <button type="button" class="ghost" data-action="delete" data-id="${flow.id}">Excluir</button>
    `;
    row.appendChild(tdActions);

    cashflowBody.appendChild(row);
  });
}

function renderChart() {
  const ctx = document.getElementById("cashflow-chart");
  if (!ctx || typeof Chart === "undefined") return;

  // Agrupar por mês
  const monthlyData = {};

  cashflows.forEach((flow) => {
    const date = parseDateForSort(flow.date);
    if (!date) return;

    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!monthlyData[key]) {
      monthlyData[key] = { deposits: 0, withdraws: 0 };
    }

    if (flow.type === "deposit") {
      monthlyData[key].deposits += flow.amount;
    } else {
      monthlyData[key].withdraws += flow.amount;
    }
  });

  const sortedKeys = Object.keys(monthlyData).sort();
  const labels = sortedKeys.map((key) => {
    const [year, month] = key.split('-');
    return `${MONTH_NAMES[parseInt(month) - 1].slice(0, 3)}/${year.slice(2)}`;
  });

  const depositsData = sortedKeys.map((key) => monthlyData[key].deposits);
  const withdrawsData = sortedKeys.map((key) => -monthlyData[key].withdraws);

  if (cashflowChart) {
    cashflowChart.destroy();
  }

  if (labels.length === 0) {
    labels.push("Sem dados");
    depositsData.push(0);
    withdrawsData.push(0);
  }

  cashflowChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Depósitos",
          data: depositsData,
          backgroundColor: "rgba(34, 197, 94, 0.7)",
          borderColor: "#22c55e",
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          label: "Saques",
          data: withdrawsData,
          backgroundColor: "rgba(255, 107, 107, 0.7)",
          borderColor: "#ff6b6b",
          borderWidth: 1,
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: 'rgba(245, 247, 255, 0.8)',
          },
        },
      },
      scales: {
        x: {
          ticks: { color: "rgba(245, 247, 255, 0.6)" },
          grid: { color: "rgba(255, 255, 255, 0.05)" },
        },
        y: {
          ticks: { color: "rgba(245, 247, 255, 0.6)" },
          grid: { color: "rgba(255, 255, 255, 0.05)" },
        },
      },
    },
  });
}

function renderMonthlyLists() {
  const depositsContainer = document.getElementById("deposits-by-month");
  const withdrawsContainer = document.getElementById("withdraws-by-month");

  // Agrupar por mês
  const monthlyDeposits = {};
  const monthlyWithdraws = {};

  cashflows.forEach((flow) => {
    const date = parseDateForSort(flow.date);
    if (!date) return;

    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const label = `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;

    if (flow.type === "deposit") {
      if (!monthlyDeposits[key]) {
        monthlyDeposits[key] = { label, total: 0, count: 0 };
      }
      monthlyDeposits[key].total += flow.amount;
      monthlyDeposits[key].count++;
    } else {
      if (!monthlyWithdraws[key]) {
        monthlyWithdraws[key] = { label, total: 0, count: 0 };
      }
      monthlyWithdraws[key].total += flow.amount;
      monthlyWithdraws[key].count++;
    }
  });

  // Renderizar depósitos
  depositsContainer.innerHTML = "";
  const depositKeys = Object.keys(monthlyDeposits).sort().reverse();
  
  if (depositKeys.length === 0) {
    depositsContainer.innerHTML = '<p class="empty-message">Nenhum depósito registrado.</p>';
  } else {
    depositKeys.forEach((key) => {
      const data = monthlyDeposits[key];
      const item = document.createElement("div");
      item.className = "monthly-item deposit";
      item.innerHTML = `
        <div class="monthly-info">
          <strong>${data.label}</strong>
          <span class="monthly-count">${data.count} depósito${data.count !== 1 ? 's' : ''}</span>
        </div>
        <span class="monthly-value">${formatProfit(data.total)}</span>
      `;
      depositsContainer.appendChild(item);
    });
  }

  // Renderizar saques
  withdrawsContainer.innerHTML = "";
  const withdrawKeys = Object.keys(monthlyWithdraws).sort().reverse();
  
  if (withdrawKeys.length === 0) {
    withdrawsContainer.innerHTML = '<p class="empty-message">Nenhum saque registrado.</p>';
  } else {
    withdrawKeys.forEach((key) => {
      const data = monthlyWithdraws[key];
      const item = document.createElement("div");
      item.className = "monthly-item withdraw";
      item.innerHTML = `
        <div class="monthly-info">
          <strong>${data.label}</strong>
          <span class="monthly-count">${data.count} saque${data.count !== 1 ? 's' : ''}</span>
        </div>
        <span class="monthly-value">${formatProfit(-data.total)}</span>
      `;
      withdrawsContainer.appendChild(item);
    });
  }
}

function refreshAll() {
  renderStats();
  renderBookFilter();
  renderTable();
  renderChart();
  renderMonthlyLists();
}

function resetForm() {
  form.reset();
  editingId = null;
  submitButton.textContent = "Salvar movimentação";
}

async function handleSubmit(event) {
  event.preventDefault();

  const rawDate = document.getElementById("cashflow-date").value.trim();
  const formattedDate = formatDateDisplay(rawDate);
  const amountValue = parseLocaleNumber(document.getElementById("cashflow-amount").value);
  const rawBook = document.getElementById("cashflow-book").value.trim();

  if (!rawDate) {
    alert("Preencha a data.");
    return;
  }
  if (!rawBook) {
    alert("⚠️ Preencha a casa de aposta. Campo obrigatório!");
    document.getElementById("cashflow-book").focus();
    return;
  }
  if (!Number.isFinite(amountValue) || amountValue <= 0) {
    alert("Preencha um valor válido (> 0).");
    return;
  }

  const flow = {
    id: editingId || crypto.randomUUID(),
    date: formattedDate,
    type: document.getElementById("cashflow-type").value,
    amount: amountValue,
    book: normalizeBookName(rawBook),
    note: document.getElementById("cashflow-note").value.trim(),
  };

  const previousCashflows = [...cashflows];

  if (editingId) {
    const index = cashflows.findIndex((item) => item.id === editingId);
    if (index >= 0) {
      cashflows[index] = flow;
    }
  } else {
    cashflows.unshift(flow);
  }

  try {
    await salvarFluxoBD(flow);
    await ensureBookInConfiguredHouses(flow.book);
  } catch (erro) {
    cashflows = previousCashflows;
    alert(erro?.message || "Não foi possível salvar no banco. Tente novamente.");
    return;
  }

  refreshAll();
  resetForm();
}

function startEdit(flow) {
  editingId = flow.id;
  document.getElementById("cashflow-date").value = formatDateForInput(flow.date);
  document.getElementById("cashflow-type").value = flow.type;
  document.getElementById("cashflow-book").value = flow.book || "";
  document.getElementById("cashflow-amount").value = numberFormatter.format(flow.amount);
  document.getElementById("cashflow-note").value = flow.note || "";
  submitButton.textContent = "Atualizar movimentação";
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function handleTableClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const id = button.dataset.id;
  
  if (button.dataset.action === "edit") {
    const flow = cashflows.find((item) => item.id === id);
    if (flow) startEdit(flow);
    return;
  }

  if (button.dataset.action === "delete") {
    if (confirm("Tem certeza que deseja excluir esta movimentação?")) {
      const previousCashflows = [...cashflows];
      cashflows = cashflows.filter((flow) => flow.id !== id);

      try {
        await excluirFluxoBD(id);
      } catch (erro) {
        cashflows = previousCashflows;
        alert(erro?.message || "Não foi possível excluir no banco. Tente novamente.");
        return;
      }

      refreshAll();
    }
  }
}

function clearFilters() {
  typeFilter.value = "all";
  if (bookFilter) bookFilter.value = "all";
  dateFilterStart.value = "";
  dateFilterEnd.value = "";
  renderTable();
}

// Event Listeners
form.addEventListener("submit", handleSubmit);
resetButton.addEventListener("click", resetForm);
cashflowBody.addEventListener("click", handleTableClick);
typeFilter?.addEventListener("change", renderTable);
bookFilter?.addEventListener("change", renderTable);
dateFilterStart?.addEventListener("change", renderTable);
dateFilterEnd?.addEventListener("change", renderTable);
clearFiltersBtn?.addEventListener("click", clearFilters);

// Profile Switcher
const profileSwitch = document.getElementById('profile-switch');

async function renderProfileSwitcher() {
  if (!profileSwitch) return;
  
  const profiles = await loadProfilesFromApi();
  let activeId = getActiveProfileId();

  if (profiles.length > 0 && !profiles.find(p => p.id === activeId)) {
    activeId = profiles[0].id;
    localStorage.setItem(ACTIVE_PROFILE_KEY, activeId);
  }
  
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

async function iniciarCashflow() {
  await renderProfileSwitcher();
  await loadCashflows();
  await loadConfiguredHouses();
  refreshAll();
}
iniciarCashflow();
