# 妖币筛选器

本项目是本地运行的虚拟货币链上妖币交易判断系统 v1。它用 GMGN、DEX Screener 和历史社媒证据写入 SQLite 和 Obsidian vault，Dashboard 只展示最终交易结论：可交易、等待、禁止。

默认边界：

- 主扫描范围：SOL/BSC/Base 链上妖币。
- 默认风控：保守验证，不自动下单。
- 交易结论：只有 CAN_TRADE 才提醒。
- 自学习：保留复盘和规则沉淀，但不占用主面板。

## 快速开始

```bash
npm run setup
npm run doctor
npm run dev
```

Dashboard: http://localhost:8787

X 和 Binance Square 浏览器抓取已经退出主流程，避免 CDP 和页面变化拖慢交易判断。后续优先用 GMGN/KOL/Smart Money 和稳定 API 补社媒信号。

## 常用命令

```bash
npm run scan:market      # DEX Screener + GMGN 市场扫描
npm run scan:gmgn-track  # GMGN KOL / Smart Money 跟踪
npm run score            # 重新评分并生成交易结论
npm run signals          # 只看交易结论
npm run worker           # 高频轮询 worker
```

## Obsidian 位置

Vault 位于：

```text
/Users/jiangyitao/Documents/Codex/妖币筛选器/vault
```

每日重点检查：

- `candidates/trade-decisions.md`：当前交易结论。
- `rules/active-rules.md`：过滤规则是否过松或过严。
- `daily-reviews/`：只复盘 CAN_TRADE 和接近 CAN_TRADE 的样本。

## Dashboard 使用重点

- 出现“可交易”：可以进入人工下单确认。
- 显示“当前没有可交易标的”：不交易，等下一轮。
- 提醒区只处理高优先级交易结论和后台异常。

## 数据源边界

- DEX Screener：免费 API，作为基础链上发现和池子备份。
- GMGN：优先链上 trending、安全、持仓、smart money/KOL 数据；需要 `gmgn-cli` 和本地 API key。
- X/Binance Square：历史数据保留，当前不参与高频主流程。
- CoinGlass/Binance Futures：v1 仅保留 adapter 插口，不参与链上妖币主评分。

## 安全原则

- 不把 API key 写入代码或 Obsidian。
- 不绕过验证码，不规避平台安全机制。
- 未配置并审计交易密钥前，不发送真实订单。
- 任何真实交易前都必须明确展示金额、滑点、止损、失效条件和最大亏损，并要求二次确认。
