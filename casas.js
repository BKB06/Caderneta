const THEME_KEY = "caderneta.theme";
const {
  getActiveProfileId,
  setActiveProfileId,
  resolveActiveProfileId,
  formatCurrencyBRL,
  numberFormatter,
  parseLocaleNumber,
} = window.CadernetaUtils;

const Shell = window.CadernetaShell || {};

let casasData = [];
let agregacoesSemanal = [];
let agregacoesMenusal = [];
let iaStats = { total: 0, wins: 0, winrate: 0, taxa_acerto: 0 };

// DOM Elements
const casosList = document.getElementById("casas-list");
const totalBalanceEl = document.getElementById("total-balance");
const casasCountEl = document.getElementById("casas-count");
const bestCasaEl = document.getElementById("best-casa");
const bestCasaValorEl = document.getElementById("best-casa-valor");
const iaWinrateEl = document.getElementById("ia-winrate");
const iaBetsEl = document.getElementById("ia-bets");
const semanalBody = document.getElementById("semanal-body");
const mensalBody = document.getElementById("mensal-body");
const syncBtn = document.getElementById("sync-btn");
const resetBtn = document.getElementById("reset-btn");
const novaCasaForm = document.getElementById("nova-casa-form");
const novaCasaNomeEl = document.getElementById("nova-casa-nome");
const novaCasaSaldoEl = document.getElementById("nova-casa-saldo");
const novaCasaResetBtn = document.getElementById("nova-casa-reset");

async function apiPost(payload) {
  try {
    const response = await fetch("api.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      console.error("Resposta inválida da API:", text);
      Shell.showApiError?.("Resposta inválida da API.");
      return null;
    }
  } catch (error) {
    console.error("Erro de comunicação com API:", error);
    Shell.showApiError?.("Não foi possível comunicar com a API.");
    return null;
  }
}

function formatMoney(value) {
  return formatCurrencyBRL(value);
}

function formatPercent(value) {
  return (value * 100).toFixed(1) + "%";
}

async function loadCasasData() {
  try {
    const profileId = getActiveProfileId();
    const resposta = await apiPost({
      acao: "obter_casas_com_saldo",
      profile_id: profileId,
    });

    if (Array.isArray(resposta)) {
      casasData = resposta;
      renderCasasUI();
    }
  } catch (erro) {
    console.error("Erro ao carregar casas:", erro);
    Shell.showApiError?.("Não foi possível carregar as casas.");
  }
}

async function loadIAStats() {
  try {
    const profileId = getActiveProfileId();
    const resposta = await apiPost({
      acao: "obter_ia_taxa_acerto",
      profile_id: profileId,
    });

    if (resposta?.sucesso) {
      iaStats = resposta;
      updateIAUI();
    }
  } catch (erro) {
    console.error("Erro ao carregar stats da IA:", erro);
  }
}

async function loadAgregacoes() {
  try {
    const profileId = getActiveProfileId();

    // Semanal
    const respSemanal = await apiPost({
      acao: "agregacoes_periodo",
      profile_id: profileId,
      tipo: "semanal",
    });
    if (Array.isArray(respSemanal)) {
      agregacoesSemanal = respSemanal;
    }

    // Mensal
    const respMensal = await apiPost({
      acao: "agregacoes_periodo",
      profile_id: profileId,
      tipo: "mensal",
    });
    if (Array.isArray(respMensal)) {
      agregacoesMenusal = respMensal;
    }

    renderAgregacoes();
  } catch (erro) {
    console.error("Erro ao carregar agregações:", erro);
  }
}

function renderCasasUI() {
  if (!casosList) return;

  if (casasData.length === 0) {
    casosList.innerHTML = '<p class="empty-message">Nenhuma casa registrada.</p>';
    totalBalanceEl.textContent = "R$ 0,00";
    casasCountEl.textContent = "0";
    bestCasaEl.textContent = "-";
    bestCasaValorEl.textContent = "R$ 0,00";
    return;
  }

  let totalBalance = 0;
  casasData.forEach((casa) => {
    totalBalance += casa.balance;
  });

  totalBalanceEl.textContent = formatMoney(totalBalance);
  casasCountEl.textContent = casasData.length.toString();

  if (casasData.length > 0) {
    const best = casasData[0];
    bestCasaEl.textContent = best.book || "-";
    bestCasaValorEl.textContent = formatMoney(best.balance);
  }

  // Renderizar lista de casas
  const html = casasData
    .map((casa) => {
      const balanceClass = casa.balance >= 0 ? "positive" : "negative";
      const winratePercent = formatPercent(casa.winrate);
      const windowRateClass = casa.winrate > 0.5 ? "positive" : "negative";

      return `
        <div class="casa-card">
          <div class="casa-header">
            <h3>${casa.book}</h3>
            <span class="casa-balance ${balanceClass}">Saldo: ${formatMoney(casa.balance)}</span>
          </div>
          <div class="casa-stats">
            <div class="stat">
              <span class="stat-label">Depósitos</span>
              <span class="stat-value">${formatMoney(casa.deposits)}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Saques</span>
              <span class="stat-value">${formatMoney(casa.withdraws)}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Lucro em Apostas</span>
              <span class="stat-value ${casa.profit >= 0 ? 'positive' : 'negative'}">${formatMoney(casa.profit)}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Taxa de Acerto</span>
              <span class="stat-value ${windowRateClass}">${winratePercent}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Vitórias</span>
              <span class="stat-value">${casa.wins}/${casa.bets_count}</span>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  casosList.innerHTML = html;
}

function updateIAUI() {
  iaWinrateEl.textContent = formatPercent(iaStats.winrate);
  iaBetsEl.textContent = `${iaStats.wins}/${iaStats.total} apostas`;
}

function renderAgregacoes() {
  // Semanal
  if (semanalBody && agregacoesSemanal.length > 0) {
    semanalBody.innerHTML = agregacoesSemanal
      .map((agg) => {
        const taxaPercent = formatPercent(agg.winrate);
        const roiPercent = formatPercent(agg.roi);

        return `
          <tr>
            <td>${new Date(agg.periodo).toLocaleDateString("pt-BR")}</td>
            <td>${agg.total_apostas}</td>
            <td>${agg.vitrias}</td>
            <td>${taxaPercent}</td>
            <td>${formatMoney(agg.total_apostado)}</td>
            <td class="${agg.lucro >= 0 ? 'positive' : 'negative'}">${formatMoney(agg.lucro)}</td>
            <td class="${agg.roi >= 0 ? 'positive' : 'negative'}">${roiPercent}</td>
          </tr>
        `;
      })
      .join("");
  }

  // Mensal
  if (mensalBody && agregacoesMenusal.length > 0) {
    mensalBody.innerHTML = agregacoesMenusal
      .map((agg) => {
        const taxaPercent = formatPercent(agg.winrate);
        const roiPercent = formatPercent(agg.roi);

        return `
          <tr>
            <td>${new Date(agg.periodo).toLocaleDateString("pt-BR", {
              year: "numeric",
              month: "long",
            })}</td>
            <td>${agg.total_apostas}</td>
            <td>${agg.vitrias}</td>
            <td>${taxaPercent}</td>
            <td>${formatMoney(agg.total_apostado)}</td>
            <td class="${agg.lucro >= 0 ? 'positive' : 'negative'}">${formatMoney(agg.lucro)}</td>
            <td class="${agg.roi >= 0 ? 'positive' : 'negative'}">${roiPercent}</td>
          </tr>
        `;
      })
      .join("");
  }
}

async function sincronizarCasas() {
  if (casasData.length === 0) {
    Shell.showToast?.("Nenhuma casa para sincronizar.");
    return;
  }

  const profileId = getActiveProfileId();
  const confirmar = confirm(
    "Sincronizar casas vai calcular e ajustar os saldos com base no fluxo de caixa e apostas. Deseja continuar?"
  );

  if (!confirmar) return;

  try {
    const resposta = await apiPost({
      acao: "sincronizar_casas",
      profile_id: profileId,
      casas: casasData,
    });

    if (resposta?.sucesso) {
      Shell.showToast?.("Casas sincronizadas com sucesso!");
      await loadCasasData();
    } else {
      Shell.showApiError?.(resposta?.erro || "Erro ao sincronizar.");
    }
  } catch (erro) {
    console.error("Erro ao sincronizar:", erro);
    Shell.showApiError?.("Erro ao sincronizar casas.");
  }
}

async function resetarDados() {
  const confirmar = confirm(
    "⚠️ ATENÇÃO: Isso vai deletar:\n- Apostas finalizadas\n- Histórico de cassino\n- Fluxo de caixa antigo\n\nSerão mantidos:\n✅ Apostas em aberto (pending)\n✅ Taxa de acerto da IA\n\nDeseja continuar?"
  );

  if (!confirmar) return;

  try {
    const profileId = getActiveProfileId();
    const resposta = await apiPost({
      acao: "resetar_dados",
      profile_id: profileId,
    });

    if (resposta?.sucesso) {
      Shell.showToast?.(resposta.mensagem);
      setTimeout(() => {
        location.reload();
      }, 1500);
    } else {
      Shell.showApiError?.(resposta?.erro || "Erro ao resetar dados.");
    }
  } catch (erro) {
    console.error("Erro ao resetar:", erro);
    Shell.showApiError?.("Erro ao resetar dados.");
  }
}

async function criarNovaCasa(e) {
  e.preventDefault();

  const nome = (novaCasaNomeEl.value || "").trim();
  const saldoStr = (novaCasaSaldoEl.value || "0").trim();
  const saldo = parseLocaleNumber(saldoStr);

  if (nome === "") {
    Shell.showApiError?.("Nome da casa é obrigatório.");
    return;
  }

  try {
    const profileId = getActiveProfileId();
    const resposta = await apiPost({
      acao: "criar_casa",
      profile_id: profileId,
      book: nome,
      saldo_inicial: saldo,
    });

    if (resposta?.sucesso) {
      Shell.showToast?.(resposta.mensagem);
      novaCasaForm.reset();
      await loadCasasData();
    } else {
      Shell.showApiError?.(resposta?.erro || "Erro ao criar casa.");
    }
  } catch (erro) {
    console.error("Erro ao criar casa:", erro);
    Shell.showApiError?.("Erro ao criar casa.");
  }
}

async function initializePageData() {
  try {
    await Promise.all([loadCasasData(), loadIAStats(), loadAgregacoes()]);
  } catch (erro) {
    console.error("Erro ao inicializar página:", erro);
  }
}

// Event Listeners
if (syncBtn) {
  syncBtn.addEventListener("click", sincronizarCasas);
}

if (resetBtn) {
  resetBtn.addEventListener("click", resetarDados);
}

if (novaCasaForm) {
  novaCasaForm.addEventListener("submit", criarNovaCasa);
}

if (novaCasaResetBtn) {
  novaCasaResetBtn.addEventListener("click", () => {
    novaCasaForm.reset();
  });
}

// Initialize on page load
document.addEventListener("DOMContentLoaded", initializePageData);

// Reload when profile changes
if (window.CadernetaShell) {
  const originalProfileSwitch = window.CadernetaShell.setActiveProfileId;
  window.CadernetaShell.setActiveProfileId = function (id) {
    originalProfileSwitch?.(id);
    initializePageData();
  };
}
