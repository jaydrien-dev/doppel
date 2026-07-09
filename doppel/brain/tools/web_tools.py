"""
Native web tools — always available to every clone, no connector required.

Providers tried in order for web_search:
  1. Brave Search API  (BRAVE_API_KEY env var)
  2. Serper.dev        (SERPER_API_KEY env var)
  3. DuckDuckGo HTML  (no key, fallback)

Price data: CoinGecko free API (no key, rate-limited to ~30 req/min).
"""
from __future__ import annotations

import logging
import os
import re
import urllib.parse

import httpx

_log = logging.getLogger(__name__)
_TIMEOUT = 20.0
_UA = "Mozilla/5.0 (compatible; DoppelAgent/1.0)"


# ---------------------------------------------------------------------------
# HTML cleaning
# ---------------------------------------------------------------------------

def _strip_html(html: str, max_chars: int = 8000) -> str:
    """Rough HTML → plain text. No external deps."""
    html = re.sub(r"<(script|style|head|nav|footer|header|noscript)[^>]*>.*?</\1>",
                  "", html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r"<!--.*?-->", "", html, flags=re.DOTALL)
    html = re.sub(r"<br\s*/?>", "\n", html, flags=re.IGNORECASE)
    html = re.sub(r"<p[^>]*>", "\n", html, flags=re.IGNORECASE)
    html = re.sub(r"<li[^>]*>", "\n• ", html, flags=re.IGNORECASE)
    html = re.sub(r"<[^>]+>", " ", html)
    html = re.sub(r"[ \t]+", " ", html)
    html = re.sub(r"\n{3,}", "\n\n", html)
    text = html.strip()
    return text[:max_chars] + ("…" if len(text) > max_chars else "")


# ---------------------------------------------------------------------------
# Search providers
# ---------------------------------------------------------------------------

async def _search_brave(query: str, n: int, api_key: str) -> str:
    url = "https://api.search.brave.com/res/v1/web/search"
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.get(url, headers={
                "Accept": "application/json",
                "Accept-Encoding": "gzip",
                "X-Subscription-Token": api_key,
            }, params={"q": query, "count": min(n, 10), "text_decorations": "false"})
            r.raise_for_status()
            data = r.json()
        results = data.get("web", {}).get("results", [])[:n]
        if not results:
            return "No results found."
        lines = []
        for i, item in enumerate(results, 1):
            lines.append(f"{i}. **{item.get('title', '')}**\n{item.get('url', '')}\n{item.get('description', '')}")
        return "\n\n".join(lines)
    except Exception as exc:
        _log.warning("Brave search failed: %s", exc)
        return await _search_ddg(query, n)


async def _search_serper(query: str, n: int, api_key: str) -> str:
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.post("https://google.serper.dev/search",
                             headers={"X-API-KEY": api_key, "Content-Type": "application/json"},
                             json={"q": query, "num": min(n, 10)})
            r.raise_for_status()
            data = r.json()
        results = data.get("organic", [])[:n]
        if not results:
            return "No results found."
        lines = []
        for i, item in enumerate(results, 1):
            lines.append(f"{i}. **{item.get('title', '')}**\n{item.get('link', '')}\n{item.get('snippet', '')}")
        return "\n\n".join(lines)
    except Exception as exc:
        _log.warning("Serper search failed: %s", exc)
        return await _search_ddg(query, n)


async def _search_ddg(query: str, n: int) -> str:
    """DuckDuckGo lite HTML scraper — no API key needed."""
    encoded = urllib.parse.quote_plus(query)
    url = f"https://lite.duckduckgo.com/lite/?q={encoded}"
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as c:
            r = await c.get(url, headers={"User-Agent": _UA})
            r.raise_for_status()
            html = r.text

        # Strategy 1: DDG Lite table structure — result-link + result-snippet classes
        snippets = re.findall(
            r'class="result-link"[^>]*href="([^"]+)"[^>]*>\s*([^<]+)\s*</a>.*?class="result-snippet"[^>]*>(.*?)</td>',
            html, re.DOTALL,
        )
        if snippets:
            lines = []
            for i, (link, title, snippet) in enumerate(snippets[:n], 1):
                clean = re.sub(r"<[^>]+>", "", snippet).strip()
                lines.append(f"{i}. **{title.strip()}**\n{link}\n{clean}")
            return "\n\n".join(lines)

        # Strategy 2: any external href in the page (DDG Lite often redirects URLs through its own proxy)
        # Match both direct external links and DDG's redirect links
        raw_links = re.findall(r'href="(//duckduckgo\.com/l/\?[^"]+|https?://(?!duckduckgo)[^"]+)"', html)
        resolved: list[tuple[str, str]] = []
        for raw in raw_links:
            if raw.startswith("//duckduckgo.com/l/?"):
                # extract uddg param which holds the actual URL
                m = re.search(r'uddg=([^&"]+)', raw)
                if m:
                    actual = urllib.parse.unquote(m.group(1))
                    resolved.append((actual, actual))
            elif raw.startswith("http"):
                resolved.append((raw, raw))
        if resolved:
            seen: set[str] = set()
            lines = []
            for url_r, _ in resolved:
                if url_r in seen:
                    continue
                seen.add(url_r)
                lines.append(f"{len(lines)+1}. {url_r}")
                if len(lines) >= n:
                    break
            if lines:
                return f"Search results for '{query}':\n" + "\n".join(lines)

        # Strategy 3: <a> tags with substantial anchor text pointing to real domains
        fallback = re.findall(r'href="(https?://(?!duckduckgo)[^"]+)"[^>]*>([^<]{10,100})<', html)
        fallback = [(u, t) for u, t in fallback if "privacy" not in u.lower()][:n]
        if fallback:
            return "\n".join(f"{i+1}. {t.strip()}\n   {u}" for i, (u, t) in enumerate(fallback))

        return f"Search for '{query}' returned no usable results. Try a different query or a direct URL."

    except Exception as exc:
        _log.warning("DDG search failed: %s", exc)
        return f"Search unavailable: {exc}"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def web_search(query: str, num_results: int = 5) -> str:
    """Search the web for current information."""
    brave_key = os.getenv("BRAVE_API_KEY")
    serper_key = os.getenv("SERPER_API_KEY")
    if brave_key:
        return await _search_brave(query, num_results, brave_key)
    if serper_key:
        return await _search_serper(query, num_results, serper_key)
    return await _search_ddg(query, num_results)


async def web_fetch(url: str) -> str:
    """Fetch and read the text content of a URL."""
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as c:
            r = await c.get(url, headers={"User-Agent": _UA})
            r.raise_for_status()
            ct = r.headers.get("content-type", "")
            if "json" in ct:
                return r.text[:8000]
            return _strip_html(r.text)
    except httpx.HTTPStatusError as exc:
        return f"[HTTP {exc.response.status_code} fetching {url}]"
    except Exception as exc:
        return f"[Could not fetch {url}: {exc}]"


async def price_lookup(coin_id: str = "bitcoin", vs_currency: str = "usd") -> str:
    """Look up current crypto price from CoinGecko (free, no API key)."""
    url = "https://api.coingecko.com/api/v3/simple/price"
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.get(url, params={
                "ids": coin_id.lower(),
                "vs_currencies": vs_currency.lower(),
                "include_24hr_change": "true",
                "include_last_updated_at": "true",
            })
            r.raise_for_status()
            data = r.json()

        coin_data = data.get(coin_id.lower())
        if not coin_data:
            # Try searching for the coin ID
            return f"Coin '{coin_id}' not found. Try IDs like 'bitcoin', 'ethereum', 'solana'."

        price = coin_data.get(vs_currency.lower())
        change_24h = coin_data.get(f"{vs_currency.lower()}_24h_change")
        if price is None:
            return f"Price data unavailable for {coin_id}/{vs_currency}."

        change_str = f" ({change_24h:+.2f}% 24h)" if change_24h is not None else ""
        return f"{coin_id.title()}: {vs_currency.upper()} {price:,.2f}{change_str}"

    except Exception as exc:
        _log.warning("price_lookup failed for %s: %s", coin_id, exc)
        return f"[Price lookup failed: {exc}]"


async def call_web_tool(tool_name: str, args: dict) -> str:
    """Dispatch a web tool call."""
    bare = tool_name.split("__", 1)[-1] if "__" in tool_name else tool_name
    if bare == "search":
        return await web_search(args.get("query", ""), int(args.get("num_results", 5)))
    if bare == "fetch":
        return await web_fetch(args.get("url", ""))
    if bare == "price":
        return await price_lookup(args.get("coin_id", "bitcoin"), args.get("vs_currency", "usd"))
    return f"[Unknown web tool: {tool_name}]"


# ---------------------------------------------------------------------------
# Anthropic tool schemas
# ---------------------------------------------------------------------------

NATIVE_WEB_TOOLS: list[dict] = [
    {
        "name": "Web__search",
        "description": (
            "Search the web for current, real-time information. Use when the user asks about "
            "recent news, prices, events, people, products, or anything that requires up-to-date data."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "The search query"},
                "num_results": {"type": "integer", "description": "Number of results (1–10)", "default": 5},
            },
            "required": ["query"],
        },
    },
    {
        "name": "Web__fetch",
        "description": (
            "Fetch and read the text content of a specific URL. Use to read articles, "
            "live data pages, documentation, or any publicly accessible webpage."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "Full URL to fetch (must start with http:// or https://)"},
            },
            "required": ["url"],
        },
    },
    {
        "name": "Web__price",
        "description": (
            "Look up the current price of a cryptocurrency (Bitcoin, Ethereum, Solana, etc.). "
            "Returns live price and 24h change from CoinGecko."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "coin_id": {"type": "string", "description": "CoinGecko coin ID, e.g. 'bitcoin', 'ethereum', 'solana'"},
                "vs_currency": {"type": "string", "description": "Pricing currency, e.g. 'usd', 'eur'", "default": "usd"},
            },
            "required": ["coin_id"],
        },
    },
]
