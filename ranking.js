const ACTIVE_PROFILE_KEY = "caderneta.activeProfile.v1";
const DEFAULT_AI_OPTIONS = ["Grok", "Claude", "Gemini", "Gemini DS", "ChatGPT"];

function getActiveProfileId() {
  const activeId = localStorage.getItem(ACTIVE_PROFILE_KEY);
  return activeId || null;
}

function getSettingsKey() {
  const profileId = getActiveProfileId();
  return profileId ? `caderneta.settings.${profileId}` : "caderneta.settings.v1";
}

function normalizeAiName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

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

let bets = [];
let bookDistributionChart = null;
let bookProfitChart = null;

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
      };
    });
  } catch (erro) {
    console.error("Erro ao carregar apostas no ranking:", erro);
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

function calcRankingStats() {
  const settled = bets.filter((bet) => bet.status === 'win' || bet.status === 'loss');
  const wins = bets.filter((bet) => bet.status === 'win');
  const losses = bets.filter((bet) => bet.status === 'loss');
  const pending = bets.filter((bet) => bet.status === 'pending');

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
  losses.forEach((bet) => {
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
    totalBets: bets.length,
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
  const books = Array.from(new Set(bets.map((bet) => bet.book))).sort();
  
  return books.map((book) => {
    const bookBets = bets.filter((bet) => bet.book === book);
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
  return bets
    .filter((bet) => bet.status === 'win')
    .map((bet) => ({ ...bet, profit: calcProfit(bet) }))
    .sort((a, b) => b.profit - a.profit)
    .slice(0, count);
}

function getTopLosses(count = 5) {
  return bets
    .filter((bet) => bet.status === 'loss')
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
    return;
  }

  // Ordenar por lucro (maior para menor)
  byBook.sort((a, b) => b.profit - a.profit);

  byBook.forEach((item, index) => {
    const row = document.createElement('tr');

    const tdRank = document.createElement('td');
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`;
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
}

function renderCharts() {
  const byBook = calcStatsByBook();

  if (byBook.length === 0) return;

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

  const configuredAiNames = getConfiguredAiNames();
  const usedAiNames = bets.reduce((acc, bet) => {
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
    const aiBets = bets.filter((b) => {
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
    tableBody.innerHTML = aiStats.map((ai, index) => {
      const medal = medals[index] || '';
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
  }
}

async function init() {
  await renderProfileSwitcher();
  await loadBets(); // Agora espera que as apostas cheguem do BD
  renderRecords();
  renderStats();
  renderTopLists();
  renderBookTable();
  renderCharts();
  renderAIRankingPage();
}

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

init();
