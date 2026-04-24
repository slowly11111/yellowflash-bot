const refreshSeconds = 20;

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function loadTrading() {
  const data = await api("/api/paper-trading?limit=12");
  window.__latestTradingPayload = data;
  renderAccount(data.account, data.positions || [], data.liveTrading, data.analytics || {});
  renderAnalytics(data.analytics || {});
  renderMarketBuckets(data.positionsByMarket || {}, data.analytics || {});
  renderSegmentedPositions(data.positionsByMarket || {});
  renderSegmentedOrders(data.ordersByMarket || {});
  renderOpportunityBoard(data.opportunityBoard || {});
  renderDecisionLog(data.decisions || []);
  document.getElementById("tradingUpdated").textContent = `刷新：${new Date().toLocaleTimeString()}`;
}

function renderAccount(account, positions, liveTrading, analytics) {
  const equity = Number(account?.equity_usd || 0);
  const cash = Number(account?.cash_usd || 0);
  const pnl = Number(account?.realized_pnl_usd || 0);
  const drawdown = Number(account?.max_drawdown_pct || 0);
  const rollingWinRate = Number(analytics?.rollingWinRate || 0);
  document.getElementById("equity").textContent = `$${money(equity)}`;
  document.getElementById("accountLine").textContent = `纸面账户运行中；最近 20 笔滚动胜率 ${round(rollingWinRate)}%；实盘 ${liveTrading?.enabled ? "已预留，等待二次确认" : "未启用"}。`;
  const metrics = [
    ["现金", `$${money(cash)}`],
    ["已实现", signedMoney(pnl)],
    ["回撤", `${round(drawdown)}%`],
    ["持仓", positions.length]
  ];
  document.getElementById("accountMetrics").innerHTML = metrics
    .map(([label, value]) => `<div class="stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");
  renderTradingRegime(window.__latestTradingPayload?.marketRegime || null);
}

function renderTradingRegime(regime) {
  const badge = document.getElementById("tradingRegimeBadge");
  const name = document.getElementById("tradingRegimeName");
  const summary = document.getElementById("tradingRegimeSummary");
  if (!badge || !name || !summary) return;
  badge.textContent = regime?.name || "等待环境判断";
  badge.className = `mode-chip ${regime?.name || "neutral"}`;
  name.textContent = regimeLabel(regime?.name);
  if (!regime) {
    summary.textContent = "环境会影响链上、Alpha、合约的试错强度。";
    return;
  }
  const risk = regime.riskTilt || {};
  summary.textContent = `${regime.summary} 链上 ${round(risk.onchain || 0)} / Alpha ${round(risk.alpha || 0)} / 合约 ${round(risk.futures || 0)}。`;
}

function renderAnalytics(analytics) {
  const perf = document.getElementById("performanceStats");
  const chain = document.getElementById("chainStats");
  const market = document.getElementById("marketStats");
  const setup = document.getElementById("setupStats");
  const lines = [
    ["滚动胜率(20)", `${round(analytics?.rollingWinRate || 0)}%`],
    ["利润因子(20)", `${round(analytics?.rollingProfitFactor || 0)}`],
    ["Focus GMGN 胜率", `${round(analytics?.focusGmgn?.winRate || 0)}%`],
    ["Focus GMGN PnL", `${signedMoney(analytics?.focusGmgn?.pnlUsd || 0)}`]
  ];
  perf.innerHTML = lines.map(([label, value]) => statsLine(label, value)).join("");

  const chainRows = analytics?.byChain || [];
  chain.innerHTML = chainRows.length ? chainRows.map((row) => statsRow(row.chain, row)).join("") : emptyLine("暂无链别平仓样本");

  const marketRows = analytics?.byMarket || [];
  market.innerHTML = marketRows.length ? marketRows.map((row) => statsRow(bucketLabel(row.market), row)).join("") : emptyLine("暂无市场分层样本");

  const setupRows = analytics?.bySetup || [];
  setup.innerHTML = setupRows.length ? setupRows.map((row) => statsRow(row.setup, row)).join("") : emptyLine("暂无策略归因样本");
}

function renderMarketBuckets(positionsByMarket, analytics) {
  const byMarket = analytics?.byMarket || [];
  const el = document.getElementById("marketBuckets");
  el.innerHTML = ["onchain", "alpha", "futures"].map((bucket) => {
    const positions = positionsByMarket[bucket] || [];
    const exposure = positions.reduce((sum, row) => sum + Number(row.marketValueUsd || 0), 0);
    const stat = byMarket.find((row) => row.market === bucket) || {};
    return `<article class="market-summary-card ${bucket}">
      <p class="eyebrow">${bucketLabel(bucket)}</p>
      <strong>${positions.length} 个持仓</strong>
      <span>持仓市值 $${money(exposure)}</span>
      <span>胜率 ${round(stat.winRate || 0)}% · PnL ${signedMoney(stat.pnlUsd || 0)}</span>
    </article>`;
  }).join("");
}

function renderSegmentedPositions(groups) {
  renderPositionList("positionsOnchain", groups.onchain || []);
  renderPositionList("positionsAlpha", groups.alpha || []);
  renderPositionList("positionsFutures", groups.futures || []);
}

function renderPositionList(id, rows) {
  const el = document.getElementById(id);
  if (!rows.length) {
    el.innerHTML = emptyLine("暂无持仓");
    return;
  }
  el.innerHTML = rows.map((row) => {
    const gain = pct(row.markPriceUsd, row.entryPriceUsd);
    return `<article class="line-row">
      <div>
        <strong>${escapeHtml(row.symbol || row.tokenKey)}</strong>
        <span>${escapeHtml(bucketLabel(row.marketBucket))} · ${escapeHtml(row.chain || "")}</span>
      </div>
      <div class="row-meta">
        <span>${gain}</span>
        <span>市值 $${money(row.marketValueUsd)} · setup ${escapeHtml(row.strategySetup || "generic")} · 止损 ${price(row.stopLossPrice)}</span>
      </div>
    </article>`;
  }).join("");
}

function renderSegmentedOrders(groups) {
  renderOrderList("ordersOnchain", groups.onchain || []);
  renderOrderList("ordersAlpha", groups.alpha || []);
  renderOrderList("ordersFutures", groups.futures || []);
}

function renderOrderList(id, rows) {
  const el = document.getElementById(id);
  if (!rows.length) {
    el.innerHTML = emptyLine("暂无操作");
    return;
  }
  el.innerHTML = rows.slice(0, 6).map((row) => `<article class="line-row compact">
    <div>
      <strong>${escapeHtml(row.action)} · ${escapeHtml(row.symbol || row.token_key)}</strong>
      <span>${escapeHtml(row.reason || "")}</span>
    </div>
    <div class="row-meta">
      <span>$${money(row.notional_usd)} · ${escapeHtml(row.strategy_setup || "generic")}</span>
      <span>${escapeHtml(row.status)} · ${escapeHtml(row.created_at)}</span>
    </div>
  </article>`).join("");
}

function renderOpportunityBoard(board) {
  const el = document.getElementById("opportunityBoard");
  const blocks = [
    ["链上", board.onchain || []],
    ["Alpha", board.alpha || []],
    ["合约", board.futures || []]
  ];
  el.innerHTML = blocks.map(([label, rows]) => `<section class="opportunity-column">
    <p class="eyebrow">${escapeHtml(label)}</p>
    ${(rows.length ? rows.slice(0, 4) : []).map(renderOpportunityCard).join("") || emptyLine("当前没有机会")}
  </section>`).join("");
}

function renderOpportunityCard(row) {
  return `<article class="line-row compact">
    <div>
      <strong>${escapeHtml(row.symbol || row.tokenKey)}</strong>
      <span>${escapeHtml(row.highlight || row.note || "")}</span>
    </div>
    <div class="row-meta">
      <span>score ${escapeHtml(round(row.universeScore || row.curatedScore || row.score || 0))}</span>
      <span>${escapeHtml(bucketLabel(row.marketBucket || "onchain"))}</span>
    </div>
  </article>`;
}

function statsLine(label, value) {
  return `<article class="line-row compact"><div><strong>${escapeHtml(label)}</strong></div><div class="row-meta"><span>${escapeHtml(value)}</span></div></article>`;
}

function statsRow(label, row) {
  return `<article class="line-row compact">
    <div>
      <strong>${escapeHtml(label || "unknown")}</strong>
      <span>平仓 ${escapeHtml(row.sellCount || 0)} 笔</span>
    </div>
    <div class="row-meta">
      <span>胜率 ${escapeHtml(round(row.winRate || 0))}%</span>
      <span>PnL ${escapeHtml(signedMoney(row.pnlUsd || 0))}</span>
    </div>
  </article>`;
}

function renderDecisionLog(rows) {
  const el = document.getElementById("decisionLog");
  if (!rows.length) {
    el.innerHTML = emptyLine("暂无决策记录");
    return;
  }
  el.innerHTML = rows.map((row) => `<details class="decision-detail">
    <summary>
      <strong>${escapeHtml(row.created_at)}</strong>
      <span>${escapeHtml(actionSummary(row.actions))}</span>
    </summary>
    <div class="decision-text-grid">
      <section class="decision-panel">
        <h3>输入</h3>
        <p>${escapeHtml(promptSummary(row.prompt))}</p>
      </section>
      <section class="decision-panel">
        <h3>判断</h3>
        <p>${escapeHtml(decisionSummary(row.decision))}</p>
      </section>
      <section class="decision-panel">
        <h3>执行</h3>
        <p>${escapeHtml(actionsSummaryChinese(row.actions))}</p>
      </section>
    </div>
    <details class="raw-json">
      <summary>查看原始 JSON</summary>
      <div class="json-columns">
        <pre>${escapeHtml(JSON.stringify(row.prompt, null, 2))}</pre>
        <pre>${escapeHtml(JSON.stringify(row.decision, null, 2))}</pre>
        <pre>${escapeHtml(JSON.stringify(row.actions, null, 2))}</pre>
      </div>
    </details>
  </details>`).join("");
}

function actionSummary(actions) {
  if (!actions?.length) return "NOOP";
  return actions.map((action) => `${action.action || action.type}:${action.symbol || action.tokenKey || action.reason || ""}`).join(" · ");
}

function promptSummary(prompt) {
  const account = prompt?.account || {};
  const policy = prompt?.policy || {};
  const memory = prompt?.memory || {};
  const cooldownCount = Array.isArray(memory.cooldownTokenKeys) ? memory.cooldownTokenKeys.length : 0;
  const counts = { onchain: 0, alpha: 0, futures: 0 };
  for (const item of prompt?.candidates || []) {
    const bucket = item.marketBucket || "onchain";
    if (counts[bucket] === undefined) counts[bucket] = 0;
    counts[bucket] += 1;
  }
  return `账户权益 $${money(account.equityUsd)}，现金 $${money(account.cashUsd)}，持仓 ${(prompt?.positions || []).length} 个，候选 ${counts.onchain}/${counts.alpha}/${counts.futures}，最大持仓 ${policy.maxPositions || "-"} 个，最近连亏 ${memory.lossStreak || 0} 次${cooldownCount ? `，冷却 ${cooldownCount} 个旧票` : ""}。`;
}

function decisionSummary(decision) {
  const risk = decision?.accountRisk || {};
  const diagnostics = Array.isArray(decision?.diagnostics) && decision.diagnostics.length ? ` 风控提示：${decision.diagnostics.join("；")}` : "";
  return `账户回撤 ${round(risk.drawdownPct)}%，风控锁定 ${risk.riskLocked ? "是" : "否"}，本轮动作 ${Array.isArray(decision?.actions) ? decision.actions.length : 0} 条。${decision?.summary || ""}${diagnostics}`;
}

function actionsSummaryChinese(actions) {
  if (!actions?.length) return "无动作。";
  return actions.map((action) => {
    const label = action.symbol || action.tokenKey || "未知标的";
    if (action.type === "BUY") {
      return `开仓 ${label}，金额 $${money(action.notionalUsd)}，止损 ${price(action.stopLossPrice)}，止盈 ${price(action.takeProfitPrice)}，结果 ${action.status || "pending"}。`;
    }
    if (action.type === "SELL") {
      return `卖出 ${label}，数量 ${shortNumber(action.quantity)}，结果 ${action.status || "pending"}${action.realizedPnlUsd !== undefined ? `，已实现 ${signedMoney(action.realizedPnlUsd)}` : ""}。`;
    }
    if (action.type === "ADJUST_STOP") {
      return `上调 ${label} 的止损到 ${price(action.stopLossPrice)}，结果 ${action.status || "pending"}。`;
    }
    if (action.type === "HOLD") {
      return `${label} 继续持有。`;
    }
    if (action.type === "NOOP") {
      return "本轮不操作。";
    }
    return `${action.type || "ACTION"} ${label}，结果 ${action.status || "recorded"}。`;
  }).join(" ");
}

function wireRun() {
  const button = document.getElementById("runCycle");
  button.addEventListener("click", async () => {
    button.disabled = true;
    const old = button.textContent;
    button.textContent = "决策中";
    try {
      await api("/api/actions/trading-cycle", { method: "POST", body: "{}" });
      await loadTrading();
    } catch (error) {
      document.body.insertAdjacentHTML("afterbegin", `<pre>${escapeHtml(error.message)}</pre>`);
    } finally {
      button.disabled = false;
      button.textContent = old;
    }
  });
}

function bucketLabel(bucket) {
  return { onchain: "链上", alpha: "Alpha", futures: "合约" }[bucket] || "混合";
}

function pct(now, entry) {
  const current = Number(now);
  const base = Number(entry);
  if (!Number.isFinite(current) || !Number.isFinite(base) || base <= 0) return "未知";
  const value = (current / base - 1) * 100;
  return `${value > 0 ? "+" : ""}${round(value)}%`;
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

function signedMoney(value) {
  const n = Number(value);
  return `${n > 0 ? "+" : ""}$${money(n)}`;
}

function round(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function shortNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 1_000_000) return `${round(n / 1_000_000)}M`;
  if (Math.abs(n) >= 1_000) return `${round(n / 1_000)}K`;
  return `${round(n)}`;
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

function emptyLine(text) {
  return `<div class="muted-line">${escapeHtml(text)}</div>`;
}

wireRun();
loadTrading().catch((error) => {
  document.body.insertAdjacentHTML("afterbegin", `<pre>${escapeHtml(error.message)}</pre>`);
});
setInterval(() => loadTrading().catch(console.error), refreshSeconds * 1000);

function regimeLabel(name) {
  return { bull: "风险偏强", bear: "偏空防守", chop: "震荡筛选" }[name] || "等待环境判断";
}
