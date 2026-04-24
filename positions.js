const refreshSeconds = 20;

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function loadPositions() {
  const data = await api("/api/paper-trading?limit=12");
  renderOverview(data);
  renderExposure(data);
  renderFocus(data);
  renderTable(data.positions || []);
  renderOrders(data.orders || []);
  document.getElementById("positionsUpdated").textContent = `刷新：${new Date().toLocaleTimeString()}`;
}

function renderOverview(data) {
  const account = data.account || {};
  const positions = data.positions || [];
  const regime = data.marketRegime || {};
  document.getElementById("positionsOpenCount").textContent = `${positions.length}`;
  document.getElementById("positionsHeadline").textContent = positions.length
    ? `当前总权益 $${money(account.equity_usd || 0)}，已实现 ${signedMoney(account.realized_pnl_usd || 0)}。`
    : "当前暂无持仓。";
  document.getElementById("positionsMetrics").innerHTML = [
    ["权益", `$${money(account.equity_usd || 0)}`],
    ["现金", `$${money(account.cash_usd || 0)}`],
    ["已实现", signedMoney(account.realized_pnl_usd || 0)],
    ["回撤", `${round(account.max_drawdown_pct || 0)}%`]
  ].map(([label, value]) => `<div class="stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("");
  const badge = document.getElementById("positionsRegimeBadge");
  badge.textContent = regime.name || "等待环境判断";
  badge.className = `mode-chip ${regime.name || "neutral"}`;
  document.getElementById("positionsRegimeName").textContent = regimeLabel(regime.name);
  document.getElementById("positionsRegimeSummary").textContent = regime.summary
    ? `${regime.summary} 链上 ${round(regime.riskTilt?.onchain || 0)} / Alpha ${round(regime.riskTilt?.alpha || 0)} / 合约 ${round(regime.riskTilt?.futures || 0)}。`
    : "环境与账户回撤会影响当前持仓管理力度。";
}

function renderExposure(data) {
  const groups = data.positionsByMarket || {};
  const target = document.getElementById("positionsExposure");
  target.innerHTML = ["onchain", "alpha", "futures"].map((bucket) => {
    const rows = groups[bucket] || [];
    const exposure = rows.reduce((sum, row) => sum + Number(row.marketValueUsd || 0), 0);
    const unrealized = rows.reduce((sum, row) => {
      const mark = Number(row.markPriceUsd || 0);
      const entry = Number(row.entryPriceUsd || 0);
      const qty = Number(row.quantity || 0);
      if (mark <= 0 || entry <= 0 || qty <= 0) return sum;
      return sum + (mark - entry) * qty;
    }, 0);
    return `<article class="market-summary-card ${bucket}">
      <p class="eyebrow">${bucketLabel(bucket)}</p>
      <strong>${rows.length} 个持仓</strong>
      <span>敞口 $${money(exposure)}</span>
      <span>未实现 ${signedMoney(unrealized)}</span>
    </article>`;
  }).join("");
}

function renderFocus(data) {
  const rows = data.positions || [];
  const target = document.getElementById("positionsFocus");
  if (!rows.length) {
    target.innerHTML = emptyLine("暂无持仓。");
    return;
  }
  const sorted = [...rows].sort((a, b) => distanceToStop(a) - distanceToStop(b)).slice(0, 5);
  target.innerHTML = sorted.map((row) => `<article class="line-row compact">
    <div>
      <strong>${escapeHtml(row.symbol || row.tokenKey)}</strong>
      <span>${escapeHtml(bucketLabel(row.marketBucket))} · 距止损 ${formatPct(distanceToStop(row))}</span>
    </div>
    <div class="row-meta">
      <span>止损 ${price(row.stopLossPrice)} · 止盈 ${price(row.takeProfitPrice)}</span>
    </div>
  </article>`).join("");
}

function renderTable(rows) {
  const target = document.getElementById("positionsTable");
  if (!rows.length) {
    target.innerHTML = emptyLine("当前暂无持仓。");
    return;
  }
  target.innerHTML = `<div class="position-table-head">
    <span>标的</span>
    <span>市场</span>
    <span>入场</span>
    <span>现价</span>
    <span>仓位</span>
    <span>止损</span>
    <span>止盈</span>
    <span>浮盈</span>
  </div>${rows.map(renderPositionRow).join("")}`;
}

function renderPositionRow(row) {
  const pnlPct = pct(row.markPriceUsd, row.entryPriceUsd);
  return `<div class="position-row">
    <span><strong>${escapeHtml(row.symbol || row.tokenKey)}</strong><small>${escapeHtml(row.strategySetup || "generic")}</small></span>
    <span>${escapeHtml(bucketLabel(row.marketBucket))}</span>
    <span>${price(row.entryPriceUsd)}</span>
    <span>${price(row.markPriceUsd)}</span>
    <span>$${money(row.marketValueUsd || 0)}</span>
    <span>${price(row.stopLossPrice)}</span>
    <span>${price(row.takeProfitPrice)}</span>
    <span class="${Number(String(pnlPct).replace('%','')) >= 0 ? 'positive' : 'negative'}">${escapeHtml(pnlPct)}</span>
  </div>`;
}

function renderOrders(rows) {
  const target = document.getElementById("positionsOrders");
  const filtered = rows.filter((row) => ["SELL", "ADJUST_STOP", "BUY"].includes(row.action)).slice(0, 12);
  target.innerHTML = filtered.length
    ? filtered.map((row) => `<article class="line-row compact">
        <div>
          <strong>${escapeHtml(row.action)} · ${escapeHtml(row.symbol || row.token_key)}</strong>
          <span>${escapeHtml(row.reason || "")}</span>
        </div>
        <div class="row-meta">
          <span>${escapeHtml(row.created_at || "")}</span>
          <span>$${money(row.notional_usd || 0)}</span>
        </div>
      </article>`).join("")
    : emptyLine("暂无仓位动作。");
}

function distanceToStop(row) {
  const mark = Number(row.markPriceUsd || 0);
  const stop = Number(row.stopLossPrice || 0);
  if (!Number.isFinite(mark) || !Number.isFinite(stop) || mark <= 0 || stop <= 0) return 999;
  return ((mark - stop) / mark) * 100;
}

function bucketLabel(bucket) {
  return { onchain: "链上", alpha: "Alpha", futures: "合约" }[bucket] || "混合";
}

function regimeLabel(name) {
  return { bull: "风险偏强", bear: "偏空防守", chop: "震荡筛选" }[name] || "等待环境判断";
}

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function price(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "未知";
  if (n < 0.01) return `$${n.toPrecision(6)}`;
  return `$${money(n)}`;
}

function pct(now, entry) {
  const current = Number(now);
  const base = Number(entry);
  if (!Number.isFinite(current) || !Number.isFinite(base) || base <= 0) return "未知";
  const value = (current / base - 1) * 100;
  return `${value > 0 ? "+" : ""}${round(value)}%`;
}

function formatPct(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "未知";
  return `${number > 0 ? "+" : ""}${round(number)}%`;
}

function signedMoney(value) {
  const n = Number(value);
  return `${n > 0 ? "+" : ""}$${money(n)}`;
}

function round(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function emptyLine(text) {
  return `<div class="muted-line">${escapeHtml(text)}</div>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

loadPositions().catch((error) => {
  document.body.insertAdjacentHTML("afterbegin", `<pre>${escapeHtml(error.message)}</pre>`);
});
setInterval(() => loadPositions().catch(console.error), refreshSeconds * 1000);
