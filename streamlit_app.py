from __future__ import annotations

import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import streamlit as st

API = "http://localhost:8787"


def get_json(path: str):
    req = Request(f"{API}{path}", headers={"content-type": "application/json"})
    with urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def post_json(path: str):
    req = Request(f"{API}{path}", data=b"{}", method="POST", headers={"content-type": "application/json"})
    with urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


st.set_page_config(page_title="Scanner Command", layout="wide")
st.title("妖币筛选器 / Streamlit Command")
st.caption("X + Binance Square + 链上 + Alpha + 合约")

try:
    status = get_json("/api/status")
    heatmap = get_json("/api/social-heatmap")
    decisions = get_json("/api/trade-decisions?limit=12")
    paper = get_json("/api/paper-trading?limit=8")
    binance_watch = get_json("/api/binance-watch")
except (HTTPError, URLError) as error:
    st.error(f"后端不可用：{error}")
    st.stop()


top = st.columns(4)
top[0].metric("候选", status["counts"]["candidates"])
top[1].metric("提醒", status["counts"]["alerts"])
top[2].metric("Paper Equity", f"${paper['account']['equity_usd']:.2f}")
top[3].metric("可交易", decisions["canTrade"])

left, right = st.columns([1.2, 1], gap="large")

with left:
    st.subheader("Heatmap")
    st.dataframe(heatmap, use_container_width=True, hide_index=True)

    st.subheader("Signal Center")
    st.dataframe(decisions["decisions"], use_container_width=True, hide_index=True)

with right:
    st.subheader("A / B / C 联动")
    options = {row["token_key"]: row for row in heatmap}
    selected = st.selectbox("热度币种", list(options.keys())) if options else None
    if selected:
      token = options[selected]
      st.json(token)
      candidate_rows = [row for row in get_json("/api/candidates") if row["token_key"] == selected][:1]
      if candidate_rows:
          st.markdown("**链上候选**")
          st.json(candidate_rows[0])
      alpha_rows = [row for row in binance_watch.get("alpha", []) if row.get("tokenKey") == selected or row.get("symbol") == token.get("symbol")]
      futures_rows = [row for row in binance_watch.get("futures", []) if row.get("symbol", "").startswith((token.get("symbol") or "").upper())]
      st.markdown("**Binance Alpha**")
      st.json(alpha_rows[:3] or [])
      st.markdown("**Binance Futures**")
      st.json(futures_rows[:3] or [])

    st.subheader("Feedback Loop")
    if st.button("记录当前盘面到 Obsidian"):
        result = post_json("/api/actions/trading-review")
        st.success(f"已写入：{result['path']}")

    st.subheader("策略模板阈值")
    st.json(status.get("strategyProfile", {}))

st.subheader("Paper Execution")
st.dataframe(paper["orders"], use_container_width=True, hide_index=True)
