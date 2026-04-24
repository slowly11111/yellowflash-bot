const refreshSeconds = 20;

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function load() {
  const [status, tradeDecisions, alerts, paperTrading] = await Promise.all([
    api("/api/status"),
    api("/api/trade-decisions?limit=12"),
    api("/api/alerts"),
    api("/api/paper-trading?limit=6")
  ]);
  renderStatus(status);
  renderTradeDecisions(tradeDecisions);
  renderOpportunityBoard(paperTrading?.opportunityBoard || {});
  renderPaperSnapshot(paperTrading || {});
  renderSystem(status, alerts);
  document.getElementById("lastUpdated").textContent = `刷新：${new Date().toLocaleTimeString()}`;
  document.body.classList.toggle("has-trade", Boolean(tradeDecisions?.canTrade));
}

function renderStatus(status) {
  const regime = status.marketRegime || {};
  const healthySources = (status.sourceHealth || []).filter((row) => row.status === "healthy").length;
  const sourceProblems = (status.sourceHealth || []).filter((row) => ["failed", "backoff", "degraded"].includes(row.status)).length;
  const entries = [
    ["候选", status.counts?.candidates || 0],
    ["提醒", status.counts?.alerts || 0],
    ["数据源", `${healthySources}/${(status.sourceHealth || []).length}`],
    ["异常", sourceProblems]
  ];
  document.getElementById("statusGrid").innerHTML = entries
    .map(([label, value]) => `<div class="stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");
  const badge = document.getElementById("regimeBadge");
  const name = document.getElementById("regimeName");
  const summary = document.getElementById("regimeSummary");
  if (badge) {
    badge.textContent = regime.name || "等待环境判断";
    badge.className = `mode-chip ${regime.name || "neutral"}`;
  }
  if (name) name.textContent = regime.name ? regimeLabel(regime.name) : "等待环境判断";
  if (summary) {
    const risk = regime.riskTilt || {};
    summary.textContent = regime.summary
      ? `${regime.summary} 链上 ${round(risk.onchain || 0)} / Alpha ${round(risk.alpha || 0)} / 合约 ${round(risk.futures || 0)}。`
      : "环境结论会影响链上、Alpha、合约的风险倾斜。";
  }
}

function renderTradeDecisions(payload) {
  const el = document.getElementById("tradeDecisions");
  const verdict = document.getElementById("mainVerdict");
  const subtext = document.getElementById("mainSubtext");
  const rows = payload?.decisions || [];
  const observations = payload?.observations || [];
  const tradable = rows.filter((row) => row.decision === "CAN_TRADE");
  renderObservationQueue(observations);

  if (tradable.length) {
    verdict.textContent = "可以交易";
    subtext.textContent = observations.length
      ? `${tradable.length} 个链上标的进人工确认，另有 ${observations.length} 个高风险观察。`
      : `${tradable.length} 个链上标的进人工确认。`;
    el.innerHTML = tradable.map(renderTradeCard).join("");
    return;
  }

  verdict.textContent = "继续等";
  subtext.textContent = observations.length
    ? `当前没有主交易标的；另有 ${observations.length} 个高风险观察。`
    : "当前没有可交易标的，继续等下一轮。";
  el.innerHTML = `<article class="decision-row blocked"><strong>当前没有可交易标的</strong><span>主交易层先空仓等待。</span></article>`;
}

function renderTradeCard(row) {
  const contractAddress = displayAddress(row);
  const setup = row.strategySetup ? `<span class="meta-chip">${escapeHtml(row.strategySetup)}</span>` : "";
  const sources = Array.isArray(row.evidenceSources) && row.evidenceSources.length
    ? `<span class="meta-chip muted">${escapeHtml(row.evidenceSources.join(" + "))}</span>`
    : "";
  return `<article class="decision-row ${decisionClass(row.decision)}">
    <div class="row-main">
      <div class="row-headline">
        <strong>${escapeHtml(row.symbol || row.tokenKey)}</strong>
        <span class="decision-badge ready">${decisionText(row.decision)}</span>
      </div>
      <span class="token-meta">${escapeHtml(row.chain || "")} · score ${escapeHtml(row.score)} · 置信度 ${escapeHtml(row.confidence)}</span>
      <span class="token-ca">CA ${escapeHtml(contractAddress || "未知")}</span>
      <div class="meta-chips">${setup}${sources}</div>
    </div>
    <div class="row-meta">
      <span>当前 ${formatPct(row.currentGain)} · 最高 ${formatPct(row.maxGain)} · 回撤 ${formatPct(row.maxDrawdown)}</span>
      <span>${escapeHtml(row.maxRisk || "需要人工确认")}</span>
    </div>
  </article>`;
}

function renderObservationQueue(rows) {
  const section = document.getElementById("watchSection");
  const el = document.getElementById("observationQueue");
  const subtext = document.getElementById("watchSubtext");
  if (!rows.length) {
    section.hidden = true;
    el.innerHTML = "";
    return;
  }
  section.hidden = false;
  subtext.textContent = `${rows.length} 个标的热度够强，但风险太高，只做观察。`;
  el.innerHTML = rows.map(renderObservationCard).join("");
}

function renderObservationCard(row) {
  const contractAddress = displayAddress(row);
  return `<article class="decision-row observe">
    <div class="row-main">
      <div class="row-headline">
        <strong>${escapeHtml(row.symbol || row.tokenKey)}</strong>
        <span class="decision-badge observe">观察</span>
      </div>
      <span class="token-meta">${escapeHtml(row.chain || "")} · score ${escapeHtml(row.score)} · 观察分 ${escapeHtml(row.observationRank || 0)}</span>
      <span class="token-ca">CA ${escapeHtml(contractAddress || "未知")}</span>
      <span class="token-note">${escapeHtml(row.observationReason || "热度够，但主规则不允许直接买。")}</span>
    </div>
    <div class="row-meta">
      <span>当前 ${formatPct(row.currentGain)} · 最高 ${formatPct(row.maxGain)} · 回撤 ${formatPct(row.maxDrawdown)}</span>
      <span>${escapeHtml(row.maxRisk || "")}</span>
    </div>
  </article>`;
}

function renderOpportunityBoard(board) {
  const alpha = Array.isArray(board?.alpha) ? board.alpha.slice(0, 5) : [];
  const futures = Array.isArray(board?.futures) ? board.futures.slice(0, 5) : [];
  document.getElementById("alphaSubtext").textContent = alpha.length
    ? `当前展示 ${alpha.length} 个 Alpha 精选。`
    : "当前没有满足条件的 Alpha 精选。";
  document.getElementById("futuresSubtext").textContent = futures.length
    ? `当前展示 ${futures.length} 个合约埋伏。`
    : "当前没有满足条件的合约埋伏。";
  document.getElementById("alphaQueue").innerHTML = alpha.length
    ? alpha.map((row) => renderMarketCard(row, "alpha")).join("")
    : emptyState("当前没有 Alpha 精选");
  document.getElementById("futuresQueue").innerHTML = futures.length
    ? futures.map((row) => renderMarketCard(row, "futures")).join("")
    : emptyState("当前没有合约埋伏");
}

function renderMarketCard(row, type) {
  const badgeText = type === "alpha" ? "Alpha" : "Futures";
  const metaLine = type === "alpha"
    ? `${escapeHtml(row.chain || "")} · 精选分 ${escapeHtml(row.curatedScore || row.score || 0)}`
    : `合约分 ${escapeHtml(row.curatedScore || row.score || 0)} · 资金费率 ${formatBps(row.fundingBps)}`;
  const noteLine = type === "alpha"
    ? `${escapeHtml(row.highlight || "Alpha")} · ${escapeHtml((row.tags || []).join(" / ") || "轮动候选")}`
    : `${escapeHtml(row.highlight || "合约埋伏")} · OI ${formatCompact(row.openInterest)} · 成交 ${formatCompact(row.quoteVolume)}`;
  const lowerLeft = type === "alpha"
    ? `24h ${formatPct(row.change24h)} · 成交 ${formatCompact(row.volume24h)} · 流动性 ${formatCompact(row.liquidityUsd)}`
    : `24h ${formatPct(row.priceChangePercent)} · 价格 ${formatCompact(row.markPrice)} · ${row.alphaLinked ? "已映射 Alpha" : "独立合约热度"}`;
  const lowerRight = type === "alpha"
    ? `CA ${escapeHtml(row.tokenAddress || "未知")}`
    : escapeHtml(row.symbol || "未知");
  return `<article class="decision-row ${type}">
    <div class="row-main">
      <div class="row-headline">
        <strong>${escapeHtml(row.symbol || row.tokenKey)}</strong>
        <span class="decision-badge ${type}">${badgeText}</span>
      </div>
      <span class="token-meta">${metaLine}</span>
      <span class="token-note">${noteLine}</span>
    </div>
    <div class="row-meta">
      <span>${lowerLeft}</span>
      <span class="${type === "alpha" ? "token-ca" : ""}">${lowerRight}</span>
    </div>
  </article>`;
}

function renderPaperSnapshot(data) {
  const account = data?.account || {};
  const analytics = data?.analytics || {};
  const positions = data?.positions || [];
  const orders = data?.orders || [];
  const decisions = data?.decisions || [];
  document.getElementById("paperEquity").textContent = `$${money(account.equity_usd || 0)}`;
  document.getElementById("paperLine").textContent = `最近 20 笔胜率 ${round(analytics.rollingWinRate || 0)}%，利润因子 ${round(analytics.rollingProfitFactor || 0)}，当前 ${positions.length} 个持仓。`;
  document.getElementById("paperQuickStats").innerHTML = [
    ["现金", `$${money(account.cash_usd || 0)}`],
    ["已实现", signedMoney(account.realized_pnl_usd || 0)],
    ["回撤", `${round(account.max_drawdown_pct || 0)}%`],
    ["仓位", positions.length]
  ].map(([label, value]) => `<div class="mini-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("");

  const groups = data?.positionsByMarket || {};
  const marketStats = analytics.byMarket || [];
  const labels = { onchain: "链上", alpha: "Alpha", futures: "合约" };
  document.getElementById("paperMarketBoard").innerHTML = ["onchain", "alpha", "futures"]
    .map((key) => {
      const bucketRows = groups[key] || [];
      const closed = marketStats.find((row) => row.market === key) || {};
      const exposure = bucketRows.reduce((sum, row) => sum + Number(row.marketValueUsd || 0), 0);
      return `<article class="market-summary-card ${key}">
        <p class="eyebrow">${labels[key]}</p>
        <strong>${bucketRows.length} 个仓位</strong>
        <span>持仓市值 $${money(exposure)}</span>
        <span>平仓胜率 ${round(closed.winRate || 0)}% · PnL ${signedMoney(closed.pnlUsd || 0)}</span>
      </article>`;
    })
    .join("");

  document.getElementById("paperRecentActions").innerHTML = orders.length
    ? orders.slice(0, 6).map(renderCompactOrder).join("")
    : emptyLine("暂无成交和风控动作");
  document.getElementById("paperRecentDecisions").innerHTML = decisions.length
    ? decisions.slice(0, 4).map(renderCompactDecision).join("")
    : emptyLine("暂无决策记录");
}

function renderCompactOrder(row) {
  return `<article class="line-row compact">
    <div>
      <strong>${escapeHtml(bucketLabel(row.marketBucket))} · ${escapeHtml(row.action)} · ${escapeHtml(row.symbol || row.token_key)}</strong>
      <span>${escapeHtml(row.reason || "")}</span>
    </div>
    <div class="row-meta">
      <span>$${money(row.notional_usd || 0)}</span>
      <span>${escapeHtml(row.created_at || "")}</span>
    </div>
  </article>`;
}

function renderCompactDecision(row) {
  return `<article class="line-row compact">
    <div>
      <strong>${escapeHtml(row.created_at || "")}</strong>
      <span>${escapeHtml(actionSummary(row.actions || []))}</span>
    </div>
    <div class="row-meta">
      <span>${escapeHtml(promptBucketSummary(row.prompt || {}))}</span>
    </div>
  </article>`;
}

function renderSystem(status, alerts) {
  const line = document.getElementById("systemLine");
  const state = document.getElementById("systemState");
  const detail = document.getElementById("systemDetail");
  const sourceProblems = (status.sourceHealth || []).filter((row) => ["failed", "backoff", "degraded"].includes(row.status));
  const firstAlert = alerts?.[0];

  line.classList.toggle("problem", Boolean(sourceProblems.length || firstAlert));
  if (firstAlert) {
    state.textContent = "需要处理";
    detail.textContent = firstAlert.source === "trade_decision" ? "出现可交易提醒，进入人工确认。" : firstAlert.title || firstAlert.body || "有未处理提醒。";
    return;
  }
  if (sourceProblems.length) {
    state.textContent = "数据源异常";
    detail.textContent = sourceProblems.map((row) => row.label || row.service).join("、");
    return;
  }

  state.textContent = "系统正常";
  detail.textContent = status.marketRegime?.summary || "链上、Alpha、合约和模拟交易都在自动刷新。";
}

function decisionClass(decision) {
  return { CAN_TRADE: "ready", WAIT: "blocked", AVOID: "avoid" }[decision] || "blocked";
}

function decisionText(decision) {
  return { CAN_TRADE: "可交易", WAIT: "等待", AVOID: "禁止" }[decision] || decision;
}

function bucketLabel(bucket) {
  return { onchain: "链上", alpha: "Alpha", futures: "合约" }[bucket] || "混合";
}

function promptBucketSummary(prompt) {
  const counts = { onchain: 0, alpha: 0, futures: 0 };
  for (const row of prompt?.candidates || []) {
    const key = row.marketBucket || "onchain";
    if (counts[key] === undefined) counts[key] = 0;
    counts[key] += 1;
  }
  return `候选 ${counts.onchain} / ${counts.alpha} / ${counts.futures}`;
}

function actionSummary(actions) {
  if (!actions?.length) return "NOOP";
  return actions.map((action) => `${action.action || action.type}:${action.symbol || action.tokenKey || action.reason || ""}`).join(" · ");
}

function emptyState(text) {
  return `<article class="decision-row blocked"><strong>${escapeHtml(text)}</strong><span>等待下一轮扫描。</span></article>`;
}

function emptyLine(text) {
  return `<div class="muted-line">${escapeHtml(text)}</div>`;
}

function regimeLabel(name) {
  return { bull: "风险偏强", bear: "偏空防守", chop: "震荡筛选" }[name] || name;
}

function formatPct(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "未知";
  return `${number > 0 ? "+" : ""}${round(number)}%`;
}

function formatBps(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "未知";
  return `${number > 0 ? "+" : ""}${round(number)} bps`;
}

function formatCompact(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "未知";
  if (number >= 1_000_000_000) return `${round(number / 1_000_000_000)}B`;
  if (number >= 1_000_000) return `${round(number / 1_000_000)}M`;
  if (number >= 1_000) return `${round(number / 1_000)}K`;
  return `${round(number)}`;
}

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
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

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function displayAddress(row) {
  if (row?.tokenAddress) return row.tokenAddress;
  const tokenKey = String(row?.tokenKey || "");
  const parts = tokenKey.split(":");
  return parts.length > 1 ? parts.slice(1).join(":") : "";
}

function wireAction(id, path) {
  const button = document.getElementById(id);
  if (!button) return;
  button.addEventListener("click", async () => {
    button.disabled = true;
    const oldText = button.textContent;
    button.textContent = "运行中";
    try {
      await api(path, { method: "POST", body: "{}" });
      await load();
    } catch (error) {
      document.body.insertAdjacentHTML("afterbegin", `<pre>${escapeHtml(error.message)}</pre>`);
    } finally {
      button.disabled = false;
      button.textContent = oldText;
    }
  });
}

wireAction("scanMarket", "/api/actions/scan-market");
wireAction("score", "/api/actions/score");
wireAction("cleanAlerts", "/api/actions/clean-alerts");

load().catch((error) => {
  document.body.insertAdjacentHTML("afterbegin", `<pre>${escapeHtml(error.message)}</pre>`);
});
setInterval(() => load().catch(console.error), refreshSeconds * 1000);
