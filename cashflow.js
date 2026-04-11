const {
  getActiveProfileId,
  setActiveProfileId,
  resolveActiveProfileId,
  loadProfilesFromApi,
  currencyFormatter,
  numberFormatter,
  parseLocaleNumber,
} = window.CadernetaUtils;

const Shell = window.CadernetaShell || {};

let cashflows = [];
let editingId = null;
let cashflowChart = null;

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
const bookFilterEl = document.getElementById("book-filter");
const dateFilterStart = document.getElementById("date-filter-start");
const dateFilterEnd = document.getElementById("date-filter-end");
const clearFiltersBtn = document.getElementById("clear-filters");
const cashflowBookSelect = document.getElementById("cashflow-book-select");
const cashflowPagePrevButton = document.getElementById("cashflow-page-prev");
const cashflowPageNextButton = document.getElementById("cashflow-page-next");
const cashflowPageInfo = document.getElementById("cashflow-page-info");

const CASHFLOW_PAGE_SIZE = 50;
let cashflowCurrentPage = 1;

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
      book: flow.book || '',
    }));
  } catch (erro) {
    console.error("Erro ao carregar fluxo:", erro);
    Shell.showApiError?.("Nao foi possivel carregar o fluxo de caixa. Verifique a API.");
    cashflows = [];
  }
}

async function salvarFluxoBD(flow) {
  try {
    await fetch('api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'salvar_fluxo', profile_id: getActiveProfileId(), fluxo: flow })
    });
  } catch (erro) { console.error("Erro:", erro); }
}

async function excluirFluxoBD(id) {
  try {
    await fetch('api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'excluir_fluxo', profile_id: getActiveProfileId(), id: id })
    });
  } catch (erro) { console.error("Erro:", erro); }
}

// Load books from existing bets for the datalist autocomplete
async function loadBooksFromBets() {
  try {
    const profileId = getActiveProfileId();
    const resposta = await fetch('api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'carregar_apostas', profile_id: profileId })
    });
    const dados = await resposta.json();
    const books = new Set();
    dados.forEach((b) => { if (b.book) books.add(b.book); });
    // Also include books from cashflows
    cashflows.forEach((f) => { if (f.book) books.add(f.book); });
    return Array.from(books).sort();
  } catch (erro) {
    console.error("Erro ao carregar casas:", erro);
    Shell.showApiError?.("Nao foi possivel carregar as casas de apostas.");
    return [];
  }
}

function populateBookDatalist(books) {
  const datalist = document.getElementById("cashflow-book-datalist");
  if (!datalist) return;
  datalist.innerHTML = "";
  books.forEach((book) => {
    const opt = document.createElement("option");
    opt.value = book;
    datalist.appendChild(opt);
  });

  if (!cashflowBookSelect) return;
  const previous = cashflowBookSelect.value;
  cashflowBookSelect.innerHTML = '<option value="">Selecionar...</option>';
  books.forEach((book) => {
    const opt = document.createElement("option");
    opt.value = book;
    opt.textContent = book;
    cashflowBookSelect.appendChild(opt);
  });
  if (previous && books.includes(previous)) {
    cashflowBookSelect.value = previous;
  }
}

function renderBookFilter() {
  if (!bookFilterEl) return;
  const books = Array.from(new Set(cashflows.map((f) => f.book).filter(Boolean))).sort();
  const current = bookFilterEl.value || "all";
  bookFilterEl.innerHTML = '<option value="all">Todas</option>';
  books.forEach((book) => {
    const opt = document.createElement("option");
    opt.value = book;
    opt.textContent = book;
    bookFilterEl.appendChild(opt);
  });
  bookFilterEl.value = books.includes(current) ? current : "all";
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
  const bookVal = bookFilterEl?.value || "all";
  const startDate = dateFilterStart?.value ? parseDateForSort(dateFilterStart.value) : null;
  const endDate = dateFilterEnd?.value ? parseDateForSort(dateFilterEnd.value) : null;

  return cashflows.filter((flow) => {
    const matchType = type === "all" || flow.type === type;
    const matchBook = bookVal === "all" || flow.book === bookVal;

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

    return matchType && matchBook && matchDate;
  });
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
    renderCashflowPagination(0, 0, 0, 0);
    return;
  }

  // Ordenar por data (mais recente primeiro)
  const sorted = [...data].sort((a, b) => {
    const dateA = parseDateForSort(a.date);
    const dateB = parseDateForSort(b.date);
    if (dateA && dateB) return dateB - dateA;
    return 0;
  });

  const totalItems = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / CASHFLOW_PAGE_SIZE));
  if (cashflowCurrentPage > totalPages) cashflowCurrentPage = totalPages;
  if (cashflowCurrentPage < 1) cashflowCurrentPage = 1;
  const startIndex = (cashflowCurrentPage - 1) * CASHFLOW_PAGE_SIZE;
  const endIndex = Math.min(startIndex + CASHFLOW_PAGE_SIZE, totalItems);
  const pageData = sorted.slice(startIndex, endIndex);

  pageData.forEach((flow) => {
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
    tdBook.style.fontWeight = "500";
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

  renderCashflowPagination(startIndex + 1, endIndex, totalItems, totalPages);
}

function renderCashflowPagination(start, end, totalItems, totalPages) {
  if (cashflowPageInfo) {
    cashflowPageInfo.textContent = `Mostrando ${start}-${end} de ${totalItems}`;
  }
  if (cashflowPagePrevButton) {
    cashflowPagePrevButton.disabled = cashflowCurrentPage <= 1 || totalItems === 0;
  }
  if (cashflowPageNextButton) {
    cashflowPageNextButton.disabled = cashflowCurrentPage >= totalPages || totalItems === 0;
  }
}

function resetCashflowPagination() {
  cashflowCurrentPage = 1;
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
  renderTable();
  renderChart();
  renderMonthlyLists();
  renderBookFilter();
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
  const bookValue = document.getElementById("cashflow-book").value.trim();

  if (!bookValue) {
    alert("Selecione ou digite a casa de apostas.");
    return;
  }

  const flow = {
    id: editingId || crypto.randomUUID(),
    date: formattedDate,
    type: document.getElementById("cashflow-type").value,
    amount: amountValue,
    note: document.getElementById("cashflow-note").value.trim(),
    book: bookValue,
  };

  if (!flow.date || !Number.isFinite(flow.amount)) {
    alert("Preencha data e valor da movimentação.");
    return;
  }

  if (editingId) {
    const index = cashflows.findIndex((item) => item.id === editingId);
    if (index >= 0) {
      cashflows[index] = flow;
    }
  } else {
    cashflows.unshift(flow);
  }
  await salvarFluxoBD(flow);
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
    const confirmed = await (Shell.confirmAction?.({
      title: "Excluir movimentacao",
      message: "Tem certeza que deseja excluir esta movimentacao? Esta acao nao pode ser desfeita.",
      confirmText: "Excluir",
      cancelText: "Cancelar",
      danger: true,
    }) ?? Promise.resolve(confirm("Tem certeza que deseja excluir esta movimentação?")));

    if (!confirmed) return;

    cashflows = cashflows.filter((flow) => flow.id !== id);
    await excluirFluxoBD(id);
    refreshAll();
  }
}

function clearFilters() {
  typeFilter.value = "all";
  if (bookFilterEl) bookFilterEl.value = "all";
  dateFilterStart.value = "";
  dateFilterEnd.value = "";
  resetCashflowPagination();
  renderTable();
}

// Event Listeners
form.addEventListener("submit", handleSubmit);
resetButton.addEventListener("click", resetForm);
cashflowBody.addEventListener("click", handleTableClick);
bookFilterEl?.addEventListener("change", () => { resetCashflowPagination(); renderTable(); });
dateFilterStart?.addEventListener("change", () => { resetCashflowPagination(); renderTable(); });
dateFilterEnd?.addEventListener("change", () => { resetCashflowPagination(); renderTable(); });
typeFilter?.addEventListener("change", () => { resetCashflowPagination(); renderTable(); });
clearFiltersBtn?.addEventListener("click", clearFilters);
cashflowBookSelect?.addEventListener("change", (event) => {
  const value = event.target.value || "";
  const input = document.getElementById("cashflow-book");
  if (!value || !input) return;
  input.value = value;
});
cashflowPagePrevButton?.addEventListener("click", () => {
  if (cashflowCurrentPage <= 1) return;
  cashflowCurrentPage -= 1;
  renderTable();
});
cashflowPageNextButton?.addEventListener("click", () => {
  cashflowCurrentPage += 1;
  renderTable();
});

// Profile Switcher
const profileSwitch = document.getElementById('profile-switch');

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
}

profileSwitch?.addEventListener('change', (e) => {
  const newProfileId = e.target.value;
  if (newProfileId) {
    setActiveProfileId(newProfileId);
    window.location.reload();
  }
});

async function iniciarCashflow() {
  Shell.showGlobalLoading?.("Carregando fluxo de caixa...");
  try {
    await renderProfileSwitcher();
    await loadCashflows();
    const books = await loadBooksFromBets();
    populateBookDatalist(books);
    refreshAll();
  } catch (error) {
    console.error("Falha ao iniciar fluxo de caixa:", error);
    Shell.showApiError?.("Nao foi possivel iniciar a pagina de fluxo de caixa.");
  } finally {
    Shell.hideGlobalLoading?.();
  }
}
iniciarCashflow();
