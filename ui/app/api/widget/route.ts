import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const handle = req.nextUrl.searchParams.get("handle") ?? "";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://doppel-pi.vercel.app";

  const js = buildWidgetScript(handle, appUrl);

  return new Response(js, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function buildWidgetScript(handle: string, appUrl: string): string {
  // Everything inlined — no external deps, works on any website
  return `(function () {
  'use strict';

  var handle = ${JSON.stringify(handle)};
  var base   = ${JSON.stringify(appUrl)};

  if (!handle) return;
  if (document.getElementById('doppel-root')) return;

  /* ── Inject styles ─────────────────────────────────────────── */
  var css = document.createElement('style');
  css.textContent = [
    '#doppel-root { position: fixed; bottom: 24px; right: 24px; z-index: 2147483647; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }',

    '#doppel-btn {',
    '  width: 56px; height: 56px; border-radius: 50%;',
    '  background: rgba(18,18,18,0.95);',
    '  border: 1px solid rgba(255,255,255,0.14);',
    '  cursor: pointer; display: flex; align-items: center; justify-content: center;',
    '  box-shadow: 0 4px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04);',
    '  transition: transform 0.2s ease, box-shadow 0.2s ease;',
    '  outline: none;',
    '}',
    '#doppel-btn:hover { transform: scale(1.06); box-shadow: 0 6px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08); }',
    '#doppel-btn:active { transform: scale(0.96); }',

    '#doppel-panel {',
    '  position: absolute; bottom: 68px; right: 0;',
    '  width: 380px; height: 540px;',
    '  border-radius: 20px; overflow: hidden;',
    '  border: 1px solid rgba(255,255,255,0.10);',
    '  box-shadow: 0 12px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04);',
    '  opacity: 0; transform: translateY(12px) scale(0.96); pointer-events: none;',
    '  transition: opacity 0.22s ease, transform 0.22s ease;',
    '}',
    '#doppel-panel.open { opacity: 1; transform: translateY(0) scale(1); pointer-events: all; }',

    '#doppel-iframe { width: 100%; height: 100%; border: none; display: block; }',

    '@media (max-width: 460px) {',
    '  #doppel-panel { width: calc(100vw - 32px); right: -8px; }',
    '}',
  ].join('\\n');
  document.head.appendChild(css);

  /* ── Build DOM ──────────────────────────────────────────────── */
  var root = document.createElement('div');
  root.id = 'doppel-root';

  // Panel + iframe
  var panel = document.createElement('div');
  panel.id = 'doppel-panel';

  var iframe = document.createElement('iframe');
  iframe.id = 'doppel-iframe';
  iframe.src = base + '/embed/' + handle;
  iframe.allow = 'clipboard-write';
  iframe.title = 'Chat with ' + handle;
  panel.appendChild(iframe);

  // Toggle button
  var btn = document.createElement('button');
  btn.id = 'doppel-btn';
  btn.setAttribute('aria-label', 'Open chat');
  btn.innerHTML = [
    '<svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">',
    '  <path d="M3 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H7l-4 3V5z"',
    '    stroke="rgba(255,255,255,0.75)" stroke-width="1.5" stroke-linejoin="round" fill="none"/>',
    '</svg>',
  ].join('');

  var closeIcon = [
    '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">',
    '  <path d="M2 2l14 14M16 2L2 16" stroke="rgba(255,255,255,0.65)" stroke-width="1.6" stroke-linecap="round"/>',
    '</svg>',
  ].join('');

  var chatIcon = btn.innerHTML;
  var isOpen = false;

  btn.addEventListener('click', function () {
    isOpen = !isOpen;
    if (isOpen) {
      panel.classList.add('open');
      btn.setAttribute('aria-label', 'Close chat');
      btn.innerHTML = closeIcon;
    } else {
      panel.classList.remove('open');
      btn.setAttribute('aria-label', 'Open chat');
      btn.innerHTML = chatIcon;
    }
  });

  root.appendChild(panel);
  root.appendChild(btn);
  document.body.appendChild(root);
})();
`;
}
