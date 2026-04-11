const DEFAULT_AI_OPTIONS = ["Grok", "Claude", "Gemini", "Gemini DS", "ChatGPT"];

const {
  getActiveProfileId,
  setActiveProfileId,
  resolveActiveProfileId,
  getSettingsKey,
  normalizeAiName,
  loadProfilesFromApi,
  currencyFormatter,
  percentFormatter,
  numberFormatter,
} = window.CadernetaUtils;

const Shell = window.CadernetaShell || {};

function getConfiguredAiNames() {
  const fallback = [...DEFAULT_AI_OPTIONS];
  try {
    const raw = localStorage.getItem(getSettingsKey());
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    const options = Array.isArray(parsed?.aiOptions) ? parsed.aiOptions : fallback;
    const unique = [];
    const seen = new Set();

    options.forEach((option) => {
      const normalized = normalizeAiName(option);
      if (!normalized) return;
      const key = normalized.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      unique.push(normalized);
    });

    return unique.length ? unique : fallback;
  } catch (error) {
    return fallback;
  }
}

function getAiNamesFromBet(bet) {
  if (!bet?.ai) return [];
  return bet.ai
    .split(',')
    .map((name) => normalizeAiName(name))
    .map((name) => (name === 'Opus 4' ? 'Claude' : name))
    .filter(Boolean);
}

let bets = [];
let balanceRanking = [];
let bookDistributionChart = null;
let bookProfitChart = null;
const rankingBoostFilter = document.getElementById('ranking-boost-filter');

const RANKING_TABLE_PAGE_SIZE = 20;
let bookRankingCurrentPage = 1;
let aiRankingCurrentPage = 1;
let balanceRankingCurrentPage = 1;

const bookRankingPrevButton = document.getElementById('book-ranking-prev');
const bookRankingNextButton = document.getElementById('book-ranking-next');
const bookRankingInfo = document.getElementById('book-ranking-info');

const aiRankingPrevButton = document.getElementById('ai-ranking-prev');
const aiRankingNextButton = document.getElementById('ai-ranking-next');
const aiRankingInfo = document.getElementById('ai-ranking-info');

const balanceRankingPrevButton = document.getElementById('balance-ranking-prev');
const balanceRankingNextButton = document.getElementById('balance-ranking-next');
const balanceRankingInfo = document.getElementById('balance-ranking-info');
const balanceSortControls = document.getElementById('balance-sort-controls');

let balanceRankingSort = 'balance';

async function loadBets() {
  try {
    const profileId = getActiveProfileId();
    const resposta = await fetch('api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'carregar_apostas', profile_id: profileId })
    });

    const dados = await resposta.json();

    bets = dados.map((bet) => {
      const statusMap = {
        Pendente: "pending",Aberta: "pending", Green: "win", "Green / Ganhou": "win",
        Red: "loss", "Red / Perdeu": "loss", Void: "void",
        "Devolvida / Void": "void", Cashout: "cashout",
      };
      return {
        ...bet,
        status: statusMap[bet.status] || bet.status,
        stake: Number(bet.stake),
        odds: Number(bet.odds),
        isFreebet: Boolean(bet.isFreebet || bet.freebet),
        isBoost: Boolean(bet.isBoost || bet.is_boost || bet.boost),
      };
    });
  } catch (erro) {
    console.error("Erro ao carregar apostas no ranking:", erro);
    Shell.showApiError?.("Nao foi possivel carregar as apostas do ranking.");
    bets = [];
  }
}

function formatProfit(value) {
  return currencyFormatter.format(value);
}

function truncateText(value, maxLength = 58) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3).trimEnd()}...`;
}

function getPrimaryAiLabel(aisValue) {
  if (!aisValue) return '';
  const first = String(aisValue)
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)[0] || '';
  if (!first) return '';
  return first === 'Opus 4' ? 'Claude' : first;
}

function calcProfit(bet) {
  if (bet.status === "win") {
    return bet.stake * (bet.odds - 1);
  }
  if (bet.status === "loss") {
    return bet.isFreebet ? 0 : -bet.stake;
  }
  return 0;
}

function getRankingBoostFilterValue() {
  return rankingBoostFilter?.value || 'all';
}

function getFilteredRankingBets() {
  const filter = getRankingBoostFilterValue();
  if (filter === 'boost') {
    return bets.filter((bet) => Boolean(bet.isBoost));
  }
  if (filter === 'no-boost') {
    return bets.filter((bet) => !Boolean(bet.isBoost));
  }
  return bets;
}

function calcRankingStats() {
  const filteredBets = getFilteredRankingBets();
  const settled = filteredBets.filter((bet) => bet.status === 'win' || bet.status === 'loss');
  const wins = filteredBets.filter((bet) => bet.status === 'win');
  const losses = filteredBets.filter((bet) => bet.status === 'loss');
  const lossesWithValue = losses.filter((bet) => !bet.isFreebet);
  const pending = filteredBets.filter((bet) => bet.status === 'pending');

  // Maior lucro em uma única aposta
  let maxProfitBet = null;
  let maxProfit = 0;
  wins.forEach((bet) => {
    const profit = calcProfit(bet);
    if (profit > maxProfit) {
      maxProfit = profit;
      maxProfitBet = bet;
    }
  });

  // Maior perda em uma única aposta
  let maxLossBet = null;
  let maxLoss = 0;
  lossesWithValue.forEach((bet) => {
    const loss = Math.abs(calcProfit(bet));
    if (loss > maxLoss) {
      maxLoss = loss;
      maxLossBet = bet;
    }
  });

  // Maior odd acertada
  let maxOddWinBet = null;
  let maxOddWin = 0;
  wins.forEach((bet) => {
    if (bet.odds > maxOddWin) {
      maxOddWin = bet.odds;
      maxOddWinBet = bet;
    }
  });

  // Menor odd perdida
  let minOddLossBet = null;
  let minOddLoss = Infinity;
  losses.forEach((bet) => {
    if (bet.odds < minOddLoss) {
      minOddLoss = bet.odds;
      minOddLossBet = bet;
    }
  });

  // Estatísticas adicionais
  const totalProfit = settled.reduce((sum, bet) => sum + calcProfit(bet), 0);
  const winrate = settled.length ? wins.length / settled.length : 0;
  const avgOdd = settled.length ? settled.reduce((sum, bet) => sum + bet.odds, 0) / settled.length : 0;
  const avgStake = settled.length ? settled.reduce((sum, bet) => sum + bet.stake, 0) / settled.length : 0;

  return {
    totalBets: filteredBets.length,
    totalGreens: wins.length,
    totalReds: losses.length,
    totalPending: pending.length,
    totalProfit,
    winrate,
    avgOdd,
    avgStake,
    maxProfitBet,
    maxProfit,
    maxLossBet,
    maxLoss,
    maxOddWinBet,
    maxOddWin,
    minOddLossBet,
    minOddLoss: minOddLoss === Infinity ? 0 : minOddLoss,
  };
}

function calcStatsByBook() {
  const filteredBets = getFilteredRankingBets();
  const books = Array.from(new Set(filteredBets.map((bet) => bet.book))).sort();
  
  return books.map((book) => {
    const bookBets = filteredBets.filter((bet) => bet.book === book);
    const settled = bookBets.filter((bet) => bet.status === 'win' || bet.status === 'loss');
    const wins = bookBets.filter((bet) => bet.status === 'win');
    const losses = bookBets.filter((bet) => bet.status === 'loss');
    const profit = settled.reduce((sum, bet) => sum + calcProfit(bet), 0);
    const totalStake = settled.reduce((sum, bet) => sum + bet.stake, 0);
    const winrate = settled.length ? wins.length / settled.length : 0;
    const roi = totalStake > 0 ? profit / totalStake : 0;

    return {
      book,
      total: bookBets.length,
      greens: wins.length,
      reds: losses.length,
      winrate,
      profit,
      roi,
    };
  });
}

function getTopProfits(count = 5) {
  return getFilteredRankingBets()
    .filter((bet) => bet.status === 'win')
    .map((bet) => ({ ...bet, profit: calcProfit(bet) }))
    .sort((a, b) => b.profit - a.profit)
    .slice(0, count);
}

function getTopLosses(count = 5) {
  return getFilteredRankingBets()
    .filter((bet) => bet.status === 'loss' && !bet.isFreebet)
    .map((bet) => ({ ...bet, profit: calcProfit(bet) }))
    .sort((a, b) => a.profit - b.profit)
    .slice(0, count);
}

function renderRecords() {
  const stats = calcRankingStats();

  // Recordes
  const maxProfitEl = document.getElementById('ranking-max-profit');
  const maxProfitDetailEl = document.getElementById('ranking-max-profit-detail');
  const maxLossEl = document.getElementById('ranking-max-loss');
  const maxLossDetailEl = document.getElementById('ranking-max-loss-detail');
  const maxOddWinEl = document.getElementById('ranking-max-odd-win');
  const maxOddWinDetailEl = document.getElementById('ranking-max-odd-win-detail');
  const minOddLossEl = document.getElementById('ranking-min-odd-loss');
  const minOddLossDetailEl = document.getElementById('ranking-min-odd-loss-detail');

  if (maxProfitEl) {
    maxProfitEl.textContent = formatProfit(stats.maxProfit);
    maxProfitDetailEl.textContent = stats.maxProfitBet 
      ? `${truncateText(stats.maxProfitBet.event, 44)}${getPrimaryAiLabel(stats.maxProfitBet.ai) ? ` - ${getPrimaryAiLabel(stats.maxProfitBet.ai)}` : ''} @ ${numberFormatter.format(stats.maxProfitBet.odds)}x`
      : '-';
  }

  if (maxLossEl) {
    maxLossEl.textContent = formatProfit(-stats.maxLoss);
    maxLossDetailEl.textContent = stats.maxLossBet 
      ? `${truncateText(stats.maxLossBet.event, 44)}${getPrimaryAiLabel(stats.maxLossBet.ai) ? ` - ${getPrimaryAiLabel(stats.maxLossBet.ai)}` : ''} @ ${numberFormatter.format(stats.maxLossBet.odds)}x`
      : '-';
  }

  if (maxOddWinEl) {
    maxOddWinEl.textContent = `${numberFormatter.format(stats.maxOddWin)}x`;
    maxOddWinDetailEl.textContent = stats.maxOddWinBet 
      ? truncateText(stats.maxOddWinBet.event, 66)
      : '-';
  }

  if (minOddLossEl) {
    minOddLossEl.textContent = stats.minOddLoss > 0 ? `${numberFormatter.format(stats.minOddLoss)}x` : '-';
    minOddLossDetailEl.textContent = stats.minOddLossBet 
      ? truncateText(stats.minOddLossBet.event, 66)
      : '-';
  }
}

function renderStats() {
  const stats = calcRankingStats();

  document.getElementById('stats-total-bets').textContent = stats.totalBets;
  document.getElementById('stats-total-greens').textContent = stats.totalGreens;
  document.getElementById('stats-total-reds').textContent = stats.totalReds;
  document.getElementById('stats-pending').textContent = stats.totalPending;
  document.getElementById('stats-winrate').textContent = percentFormatter.format(stats.winrate);
  
  const profitEl = document.getElementById('stats-total-profit');
  profitEl.textContent = formatProfit(stats.totalProfit);
  profitEl.style.color = stats.totalProfit >= 0 ? 'var(--success)' : 'var(--danger)';

  document.getElementById('stats-avg-odd').textContent = `${numberFormatter.format(stats.avgOdd)}x`;
  document.getElementById('stats-avg-stake').textContent = formatProfit(stats.avgStake);
}

function renderTopLists() {
  const topProfits = getTopProfits(5);
  const topLosses = getTopLosses(5);

  const profitsContainer = document.getElementById('top-profits');
  const lossesContainer = document.getElementById('top-losses');

  // Top Lucros
  profitsContainer.innerHTML = '';
  if (topProfits.length === 0) {
    profitsContainer.innerHTML = '<p class="empty-message">Nenhum green registrado ainda.</p>';
  } else {
    topProfits.forEach((bet, index) => {
      const item = document.createElement('div');
      item.className = 'top-item';
      item.innerHTML = `
        <span class="top-rank">#${index + 1}</span>
        <div class="top-info">
          <strong>${bet.event}</strong>
          <span class="top-detail">${bet.date} • ${bet.book} • ${numberFormatter.format(bet.odds)}x</span>
        </div>
        <span class="top-value positive">${formatProfit(bet.profit)}</span>
      `;
      profitsContainer.appendChild(item);
    });
  }

  // Top Perdas
  lossesContainer.innerHTML = '';
  if (topLosses.length === 0) {
    lossesContainer.innerHTML = '<p class="empty-message">Nenhum red registrado ainda.</p>';
  } else {
    topLosses.forEach((bet, index) => {
      const item = document.createElement('div');
      item.className = 'top-item';
      item.innerHTML = `
        <span class="top-rank">#${index + 1}</span>
        <div class="top-info">
          <strong>${bet.event}</strong>
          <span class="top-detail">${bet.date} • ${bet.book} • ${numberFormatter.format(bet.odds)}x</span>
        </div>
        <span class="top-value negative">${formatProfit(bet.profit)}</span>
      `;
      lossesContainer.appendChild(item);
    });
  }
}

function renderBookTable() {
  const byBook = calcStatsByBook();
  const rankingByBookBody = document.getElementById('ranking-by-book');

  rankingByBookBody.innerHTML = '';

  if (byBook.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 8;
    cell.textContent = 'Nenhuma aposta cadastrada ainda.';
    row.appendChild(cell);
    rankingByBookBody.appendChild(row);
    renderRankingTablePagination('book', 0, 0, 0, 0);
    return;
  }

  // Ordenar por lucro (maior para menor)
  byBook.sort((a, b) => b.profit - a.profit);

  const totalItems = byBook.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / RANKING_TABLE_PAGE_SIZE));
  if (bookRankingCurrentPage > totalPages) bookRankingCurrentPage = totalPages;
  if (bookRankingCurrentPage < 1) bookRankingCurrentPage = 1;
  const startIndex = (bookRankingCurrentPage - 1) * RANKING_TABLE_PAGE_SIZE;
  const endIndex = Math.min(startIndex + RANKING_TABLE_PAGE_SIZE, totalItems);
  const pageItems = byBook.slice(startIndex, endIndex);

  pageItems.forEach((item, index) => {
    const row = document.createElement('tr');

    const tdRank = document.createElement('td');
    const absoluteIndex = startIndex + index;
    const medal = absoluteIndex === 0 ? '🥇' : absoluteIndex === 1 ? '🥈' : absoluteIndex === 2 ? '🥉' : `${absoluteIndex + 1}`;
    tdRank.textContent = medal;
    row.appendChild(tdRank);

    const tdBook = document.createElement('td');
    tdBook.innerHTML = `<strong>${item.book}</strong>`;
    row.appendChild(tdBook);

    const tdTotal = document.createElement('td');
    tdTotal.textContent = item.total;
    row.appendChild(tdTotal);

    const tdGreens = document.createElement('td');
    tdGreens.textContent = item.greens;
    tdGreens.style.color = 'var(--success)';
    row.appendChild(tdGreens);

    const tdReds = document.createElement('td');
    tdReds.textContent = item.reds;
    tdReds.style.color = 'var(--danger)';
    row.appendChild(tdReds);

    const tdWinrate = document.createElement('td');
    tdWinrate.textContent = percentFormatter.format(item.winrate);
    row.appendChild(tdWinrate);

    const tdProfit = document.createElement('td');
    tdProfit.textContent = formatProfit(item.profit);
    tdProfit.style.color = item.profit >= 0 ? 'var(--success)' : 'var(--danger)';
    tdProfit.style.fontWeight = '600';
    row.appendChild(tdProfit);

    const tdRoi = document.createElement('td');
    tdRoi.textContent = percentFormatter.format(item.roi);
    tdRoi.style.color = item.roi >= 0 ? 'var(--success)' : 'var(--danger)';
    row.appendChild(tdRoi);

    rankingByBookBody.appendChild(row);
  });

  renderRankingTablePagination('book', startIndex + 1, endIndex, totalItems, totalPages);
}

function renderCharts() {
  const byBook = calcStatsByBook();

  if (byBook.length === 0) {
    if (bookDistributionChart) {
      bookDistributionChart.destroy();
      bookDistributionChart = null;
    }
    if (bookProfitChart) {
      bookProfitChart.destroy();
      bookProfitChart = null;
    }
    return;
  }

  const colors = [
    '#7c5cff', '#2dd4bf', '#f59e0b', '#ec4899', '#22c55e',
    '#3b82f6', '#ef4444', '#a855f7', '#14b8a6', '#f97316'
  ];

  // Gráfico de Distribuição por Casa
  const distributionCtx = document.getElementById('book-distribution-chart');
  if (distributionCtx && typeof Chart !== 'undefined') {
    if (bookDistributionChart) {
      bookDistributionChart.destroy();
    }

    bookDistributionChart = new Chart(distributionCtx, {
      type: 'doughnut',
      data: {
        labels: byBook.map(b => b.book),
        datasets: [{
          data: byBook.map(b => b.total),
          backgroundColor: colors.slice(0, byBook.length),
          borderColor: 'rgba(0,0,0,0.2)',
          borderWidth: 1,
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: 'rgba(245, 247, 255, 0.8)',
              padding: 12,
              font: { size: 11 }
            }
          }
        }
      }
    });
  }

  // Gráfico de Lucro por Casa
  const profitCtx = document.getElementById('book-profit-chart');
  if (profitCtx && typeof Chart !== 'undefined') {
    if (bookProfitChart) {
      bookProfitChart.destroy();
    }

    const sortedByProfit = [...byBook].sort((a, b) => b.profit - a.profit);

    bookProfitChart = new Chart(profitCtx, {
      type: 'bar',
      data: {
        labels: sortedByProfit.map(b => b.book),
        datasets: [{
          label: 'Lucro',
          data: sortedByProfit.map(b => b.profit),
          backgroundColor: sortedByProfit.map(b => b.profit >= 0 ? 'rgba(34, 197, 94, 0.7)' : 'rgba(255, 107, 107, 0.7)'),
          borderColor: sortedByProfit.map(b => b.profit >= 0 ? '#22c55e' : '#ff6b6b'),
          borderWidth: 1,
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          x: {
            ticks: { color: 'rgba(245, 247, 255, 0.6)' },
            grid: { color: 'rgba(255, 255, 255, 0.05)' }
          },
          y: {
            ticks: { color: 'rgba(245, 247, 255, 0.6)' },
            grid: { color: 'rgba(255, 255, 255, 0.05)' }
          }
        }
      }
    });
  }
}

function renderAIRankingPage() {
  const container = document.getElementById('ai-ranking-grid-page');
  const tableBody = document.getElementById('ai-ranking-table');
  if (!container && !tableBody) return;
  const filteredBets = getFilteredRankingBets();

  const configuredAiNames = getConfiguredAiNames();
  const usedAiNames = filteredBets.reduce((acc, bet) => {
    getAiNamesFromBet(bet).forEach((name) => acc.push(name));
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
    const aiBets = filteredBets.filter((b) => {
      if (b.status !== 'win' && b.status !== 'loss') return false;
      const names = getAiNamesFromBet(b);
      return names.includes(name);
    });
    const wins = aiBets.filter(b => b.status === 'win').length;
    const losses = aiBets.filter(b => b.status === 'loss').length;
    const total = aiBets.length;
    const winrate = total > 0 ? wins / total : 0;
    const profit = aiBets.reduce((sum, b) => sum + calcProfit(b), 0);
    return { name, wins, losses, total, winrate, profit };
  });

  aiStats.sort((a, b) => {
    if (b.winrate !== a.winrate) return b.winrate - a.winrate;
    return b.total - a.total;
  });

  const medals = ['\ud83e\udd47', '\ud83e\udd48', '\ud83e\udd49'];

  if (container) {
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

  if (tableBody) {
    const totalItems = aiStats.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / RANKING_TABLE_PAGE_SIZE));
    if (aiRankingCurrentPage > totalPages) aiRankingCurrentPage = totalPages;
    if (aiRankingCurrentPage < 1) aiRankingCurrentPage = 1;
    const startIndex = (aiRankingCurrentPage - 1) * RANKING_TABLE_PAGE_SIZE;
    const endIndex = Math.min(startIndex + RANKING_TABLE_PAGE_SIZE, totalItems);
    const pageItems = aiStats.slice(startIndex, endIndex);

    tableBody.innerHTML = pageItems.map((ai, index) => {
      const absoluteIndex = startIndex + index;
      const medal = medals[absoluteIndex] || '';
      return `
        <tr>
          <td>${medal}</td>
          <td><strong>${ai.name}</strong></td>
          <td>${ai.total}</td>
          <td style="color: var(--success)">${ai.wins}</td>
          <td style="color: var(--danger)">${ai.losses}</td>
          <td>${ai.total > 0 ? percentFormatter.format(ai.winrate) : '-'}</td>
          <td style="color: ${ai.profit >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight: 600">${formatProfit(ai.profit)}</td>
        </tr>
      `;
    }).join('');

    renderRankingTablePagination('ai', startIndex + 1, endIndex, totalItems, totalPages);
  }
}

async function init() {
  Shell.showGlobalLoading?.("Carregando ranking...");
  try {
    await renderProfileSwitcher();
    await loadBets();
    await loadBalanceRanking();
    refreshRankingView();
  } catch (error) {
    console.error("Falha ao iniciar ranking:", error);
    Shell.showApiError?.("Nao foi possivel iniciar o ranking.");
  } finally {
    Shell.hideGlobalLoading?.();
  }
}

function refreshRankingView() {
  renderRecords();
  renderStats();
  renderTopLists();
  renderBookTable();
  renderCharts();
  renderAIRankingPage();
  renderBalanceRanking();
}

async function loadBalanceRanking() {
  try {
    const profileId = getActiveProfileId();
    const resposta = await fetch('api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'ranking_saldo_casas', profile_id: profileId })
    });
    const dados = await resposta.json();
    balanceRanking = Array.isArray(dados)
      ? dados.map((casa) => ({
        ...casa,
        deposits: Number(casa.deposits) || 0,
        withdraws: Number(casa.withdraws) || 0,
        profit: Number(casa.profit) || 0,
        balance: Number(casa.balance) || 0,
        total_staked: Number(casa.total_staked) || 0,
        wins: Number(casa.wins) || 0,
        bets_count: Number(casa.bets_count) || 0,
        winrate: Number(casa.winrate) || 0,
      }))
      : [];
  } catch (erro) {
    console.error('Erro ao carregar ranking de saldo:', erro);
    Shell.showApiError?.("Nao foi possivel carregar o ranking de saldo.");
    balanceRanking = [];
  }
}

function sortBalanceMetricValue(casa, sortType) {
  if (sortType === 'profit') return Number(casa.profit) || 0;
  if (sortType === 'staked') return Number(casa.total_staked) || 0;
  if (sortType === 'winrate') return Number(casa.winrate) || 0;
  return Number(casa.balance) || 0;
}

function getSortedBalanceRanking() {
  const sorted = [...balanceRanking];
  sorted.sort((a, b) => {
    const diff = sortBalanceMetricValue(b, balanceRankingSort) - sortBalanceMetricValue(a, balanceRankingSort);
    if (Math.abs(diff) > 0.000001) return diff;
    return (Number(b.balance) || 0) - (Number(a.balance) || 0);
  });
  return sorted;
}

function renderBalanceRanking() {
  const podium = document.getElementById('balance-ranking-podium');
  const tableBody = document.getElementById('balance-ranking-body');
  if (!podium && !tableBody) return;

  const sortedRanking = getSortedBalanceRanking();

  if (sortedRanking.length === 0) {
    if (podium) podium.innerHTML = '<p class="empty-message">Nenhuma movimentação registrada com casa de apostas.</p>';
    if (tableBody) {
      tableBody.innerHTML = '<tr><td colspan="7">Nenhum dado disponível.</td></tr>';
    }
    renderRankingTablePagination('balance', 0, 0, 0, 0);
    return;
  }

  const medals = ['🥇', '🥈', '🥉'];
  const topThree = sortedRanking.slice(0, 3);
  const maxMetric = Math.max(...topThree.map((casa) => Math.abs(sortBalanceMetricValue(casa, balanceRankingSort))), 1);

  const podiumMetricLabel = {
    balance: 'banca atual',
    profit: 'lucro apostas',
    staked: 'total apostado',
    winrate: 'aproveitamento',
  };

  // Podium cards
  if (podium) {
    podium.innerHTML = topThree.map((casa, i) => {
      const metric = sortBalanceMetricValue(casa, balanceRankingSort);
      const barWidth = Math.min(Math.abs(metric) / maxMetric * 100, 100);
      const isPositive = metric >= 0;

      const metricText = balanceRankingSort === 'winrate'
        ? percentFormatter.format(Number(casa.winrate) || 0)
        : formatProfit(metric);

      return `
        <div class="balance-ranking-card ${i === 0 ? 'first' : ''} ${isPositive ? 'positive' : 'negative'}">
          <div class="balance-ranking-header">
            <span class="balance-medal">${medals[i] || (i + 1)}</span>
            <strong class="balance-house-name">${casa.book}</strong>
          </div>
          <div class="balance-value" style="color: ${isPositive ? 'var(--success)' : 'var(--danger)'}">${metricText}</div>
          <span class="balance-metric-label">${podiumMetricLabel[balanceRankingSort] || 'banca atual'}</span>
          <div class="balance-bar-track">
            <div class="balance-bar-fill ${isPositive ? 'green' : 'red'}" style="width: ${barWidth}%"></div>
          </div>
          <div class="balance-breakdown">
            <span class="balance-detail">Banca: ${formatProfit(casa.balance)}</span>
            <span class="balance-detail">Lucro: ${formatProfit(casa.profit)}</span>
            <span class="balance-detail">Apostas: ${casa.bets_count}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // Table
  if (tableBody) {
    const totalItems = sortedRanking.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / RANKING_TABLE_PAGE_SIZE));
    if (balanceRankingCurrentPage > totalPages) balanceRankingCurrentPage = totalPages;
    if (balanceRankingCurrentPage < 1) balanceRankingCurrentPage = 1;
    const startIndex = (balanceRankingCurrentPage - 1) * RANKING_TABLE_PAGE_SIZE;
    const endIndex = Math.min(startIndex + RANKING_TABLE_PAGE_SIZE, totalItems);
    const pageItems = sortedRanking.slice(startIndex, endIndex);

    tableBody.innerHTML = pageItems.map((casa, i) => {
      const absoluteIndex = startIndex + i;
      const rank = `${absoluteIndex + 1}`;
      const isPositiveBalance = casa.balance >= 0;
      const isPositiveProfit = casa.profit >= 0;
      const winrate = Number(casa.winrate) || 0;
      const winratePct = Math.max(0, Math.min(100, Math.round(winrate * 100)));
      return `
        <tr>
          <td>${rank}</td>
          <td><strong>${casa.book}</strong></td>
          <td style="color: ${isPositiveBalance ? 'var(--success)' : 'var(--danger)'}; font-weight: 700; font-size: 1.05em">${formatProfit(casa.balance)}</td>
          <td>${formatProfit(casa.total_staked)}</td>
          <td><span class="profit-pill ${isPositiveProfit ? 'positive' : 'negative'}">${formatProfit(casa.profit)}</span></td>
          <td>
            <div class="winrate-cell">
              <div class="winrate-track"><div class="winrate-fill ${winratePct >= 55 ? 'good' : (winratePct >= 45 ? 'mid' : 'bad')}" style="width:${winratePct}%"></div></div>
              <span>${percentFormatter.format(winrate)}</span>
            </div>
          </td>
          <td>${casa.bets_count}</td>
        </tr>
      `;
    }).join('');

    renderRankingTablePagination('balance', startIndex + 1, endIndex, totalItems, totalPages);
  }
}

function renderRankingTablePagination(type, start, end, totalItems, totalPages) {
  const map = {
    book: {
      info: bookRankingInfo,
      prev: bookRankingPrevButton,
      next: bookRankingNextButton,
      page: bookRankingCurrentPage,
    },
    ai: {
      info: aiRankingInfo,
      prev: aiRankingPrevButton,
      next: aiRankingNextButton,
      page: aiRankingCurrentPage,
    },
    balance: {
      info: balanceRankingInfo,
      prev: balanceRankingPrevButton,
      next: balanceRankingNextButton,
      page: balanceRankingCurrentPage,
    },
  };

  const current = map[type];
  if (!current) return;

  if (current.info) {
    current.info.textContent = `Mostrando ${start}-${end} de ${totalItems}`;
  }
  if (current.prev) {
    current.prev.disabled = current.page <= 1 || totalItems === 0;
  }
  if (current.next) {
    current.next.disabled = current.page >= totalPages || totalItems === 0;
  }
}

function resetRankingTablePagination() {
  bookRankingCurrentPage = 1;
  aiRankingCurrentPage = 1;
  balanceRankingCurrentPage = 1;
}

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

bookRankingPrevButton?.addEventListener('click', () => {
  if (bookRankingCurrentPage <= 1) return;
  bookRankingCurrentPage -= 1;
  renderBookTable();
});
bookRankingNextButton?.addEventListener('click', () => {
  bookRankingCurrentPage += 1;
  renderBookTable();
});

aiRankingPrevButton?.addEventListener('click', () => {
  if (aiRankingCurrentPage <= 1) return;
  aiRankingCurrentPage -= 1;
  renderAIRankingPage();
});
aiRankingNextButton?.addEventListener('click', () => {
  aiRankingCurrentPage += 1;
  renderAIRankingPage();
});

balanceRankingPrevButton?.addEventListener('click', () => {
  if (balanceRankingCurrentPage <= 1) return;
  balanceRankingCurrentPage -= 1;
  renderBalanceRanking();
});
balanceRankingNextButton?.addEventListener('click', () => {
  balanceRankingCurrentPage += 1;
  renderBalanceRanking();
});

rankingBoostFilter?.addEventListener('change', () => {
  resetRankingTablePagination();
  refreshRankingView();
});

balanceSortControls?.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-sort]');
  if (!button) return;

  const nextSort = button.dataset.sort;
  if (!nextSort || nextSort === balanceRankingSort) return;

  balanceRankingSort = nextSort;
  balanceRankingCurrentPage = 1;

  balanceSortControls.querySelectorAll('button[data-sort]').forEach((item) => {
    item.classList.toggle('active', item.dataset.sort === balanceRankingSort);
  });

  renderBalanceRanking();
});

init();
