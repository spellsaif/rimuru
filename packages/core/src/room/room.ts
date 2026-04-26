import type { GateStatus } from "../core/types.js";

export function renderRoomHtml(status: GateStatus): string {
  const initialStatus = JSON.stringify(status).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Rimuru Room</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #06111f; color: #e9fbff; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: radial-gradient(circle at top left, rgba(56, 189, 248, .34), transparent 36rem), linear-gradient(135deg, #06111f, #081827 48%, #10233a); }
    main { width: min(1440px, calc(100% - 28px)); margin: 0 auto; padding: 22px 0 34px; display: grid; gap: 16px; }
    .hero { position: relative; overflow: hidden; padding: 28px; border: 1px solid rgba(125, 211, 252, .34); border-radius: 28px; background: linear-gradient(135deg, rgba(14, 165, 233, .25), rgba(15, 23, 42, .9)); box-shadow: 0 22px 80px rgba(8, 47, 73, .42); }
    .hero:after { content: ""; position: absolute; right: -80px; top: -80px; width: 220px; height: 220px; border-radius: 45% 55% 52% 48%; background: rgba(125, 211, 252, .34); filter: blur(1px); }
    h1 { margin: 0; font-size: clamp(34px, 6vw, 76px); letter-spacing: -.07em; line-height: .9; }
    h2 { margin: 0 0 12px; font-size: 18px; letter-spacing: -.02em; }
    p { margin: 8px 0 0; }
    textarea, input, select { width: 100%; border-radius: 14px; border: 1px solid rgba(125, 211, 252, .24); background: rgba(2, 6, 23, .76); color: #e9fbff; padding: 12px 13px; font: inherit; }
    textarea { min-height: 112px; resize: vertical; }
    button { border: 0; border-radius: 999px; padding: 10px 15px; color: #03111f; background: linear-gradient(135deg, #7dd3fc, #38bdf8); font-weight: 800; cursor: pointer; }
    button.secondary { color: #d9f8ff; background: rgba(125, 211, 252, .14); border: 1px solid rgba(125, 211, 252, .3); }
    button.danger { color: #fff1f2; background: rgba(244, 63, 94, .78); }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; margin: 0; max-height: 360px; overflow: auto; background: rgba(2, 6, 23, .72); border: 1px solid rgba(125, 211, 252, .14); border-radius: 14px; padding: 13px; }
    section, .card { border: 1px solid rgba(125, 211, 252, .2); border-radius: 22px; background: rgba(8, 21, 36, .78); padding: 16px; backdrop-filter: blur(18px); }
    .toolbar, .row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    .toolbar > * { flex: 1 1 180px; }
    .layout { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(320px, .75fr); gap: 16px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
    .stack { display: grid; gap: 12px; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; margin-top: 18px; }
    .stat { padding: 12px; border-radius: 18px; background: rgba(2, 132, 199, .18); border: 1px solid rgba(125, 211, 252, .22); }
    .label { color: #a7e8ff; font-size: 12px; text-transform: uppercase; letter-spacing: .12em; }
    .value { margin-top: 4px; font-weight: 800; overflow-wrap: anywhere; }
    .muted { color: #a7c7d9; }
    .pill { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 999px; background: rgba(125, 211, 252, .12); color: #c9f3ff; border: 1px solid rgba(125, 211, 252, .24); font-size: 13px; }
    .list { display: grid; gap: 8px; }
    .item { padding: 10px; border-radius: 14px; border: 1px solid rgba(125, 211, 252, .14); background: rgba(2, 6, 23, .34); }
    @media (max-width: 900px) { .layout { grid-template-columns: 1fr; } main { width: min(100% - 18px, 1440px); } .hero { padding: 22px; } }
  </style>
</head>
<body>
  <main>
    <div class="hero">
      <h1>Rimuru Room</h1>
      <p class="muted">A local control center for Gate, Souls, Runes, Vows, Shards, Circles, Chronicle, Sage traces, and Pacts.</p>
      <div class="stats" id="status-cards"></div>
    </div>

    <div class="layout">
      <section class="stack">
        <div class="row"><span class="pill">Chat</span><span class="pill">Streaming</span><span class="pill">Trace Ready</span></div>
        <div class="toolbar">
          <input id="session-id" placeholder="Soul/session id" value="${escapeHtml(status.soul)}">
          <button id="create-session" class="secondary">Create Soul</button>
          <label class="pill"><input id="stream" type="checkbox" checked style="width:auto"> stream</label>
        </div>
        <textarea id="prompt" placeholder="Ask Rimuru to inspect, explain, plan, or operate this workspace..."></textarea>
        <div class="row"><button id="send">Send</button><button id="refresh" class="secondary">Refresh</button></div>
        <pre id="answer">Ready.</pre>
      </section>

      <section>
        <h2>Pending Pacts</h2>
        <div id="approvals" class="list"><div class="muted">Loading...</div></div>
      </section>
    </div>

    <div class="grid">
      <section><h2>Sessions</h2><div id="sessions" class="list">Loading...</div><pre id="history"></pre></section>
      <section><h2>Runes</h2><select id="rune-select"></select><textarea id="rune-input" placeholder='{"question":"where am I?"}'>{}</textarea><div class="row"><button id="call-rune">Call Rune</button></div><pre id="rune-output"></pre></section>
      <section><h2>Memory</h2><input id="memory-query" placeholder="Search Chronicle memory"><div class="row"><button id="memory-search">Search</button><button id="memory-remember" class="secondary">Remember Prompt</button></div><pre id="memory-output"></pre></section>
      <section><h2>Traces and Audit</h2><div class="row"><button id="load-traces" class="secondary">Traces</button><button id="load-audit" class="secondary">Audit</button></div><pre id="trace-output"></pre></section>
      <section><h2>Shards and Vows</h2><pre id="providers">Loading...</pre></section>
      <section><h2>Circles and Pairings</h2><pre id="circles">Loading...</pre></section>
      <section><h2>Vault and Rituals</h2><pre id="ops">Loading...</pre></section>
      <section><h2>Canvas</h2><pre id="canvas">Loading...</pre></section>
    </div>
  </main>
  <script>
    const initialStatus = ${initialStatus};
    let overview = null;

    async function request(path, options = {}) {
      const response = await fetch(path, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
      const text = await response.text();
      const data = text ? JSON.parse(text) : null;
      if (!response.ok) throw new Error(data && data.error ? data.error : response.statusText);
      return data;
    }
    async function get(path) { return request(path); }
    async function post(path, body) { return request(path, { method: 'POST', body: JSON.stringify(body || {}) }); }
    function $(id) { return document.getElementById(id); }
    function setJson(id, value) { $(id).textContent = JSON.stringify(value, null, 2); }
    function setText(id, value) { $(id).textContent = value; }
    function item(text) { const node = document.createElement('div'); node.className = 'item'; node.textContent = text; return node; }

    async function refresh() {
      overview = await get('/gate/overview');
      renderStatus(overview.status || initialStatus, overview.policy || {});
      renderSessions(overview.sessions || []);
      renderRunes(overview.runes || []);
      renderApprovals(overview.approvals || []);
      setJson('providers', { providers: overview.providers, vessels: overview.vessels, policy: overview.policy });
      setJson('circles', { circles: overview.circles, pairings: overview.pairings });
      setJson('ops', { vault: overview.vault, rituals: overview.rituals });
      setJson('canvas', overview.canvas);
    }

    function renderStatus(status, policy) {
      const cards = [
        ['Gate', status.state], ['Soul', status.soul], ['Shard', status.shard + '/' + status.model],
        ['Vows', (status.vows || []).join(', ') || 'none'], ['Barrier', status.barrier], ['Approvals', policy.approvals ? 'enabled' : 'off']
      ];
      $('status-cards').innerHTML = cards.map(([label, value]) => '<div class="stat"><div class="label">' + label + '</div><div class="value">' + escapeHtml(String(value)) + '</div></div>').join('');
    }

    function renderSessions(sessions) {
      const target = $('sessions');
      target.innerHTML = '';
      if (!sessions.length) target.appendChild(item('No sessions yet.'));
      for (const session of sessions) {
        const row = document.createElement('div');
        row.className = 'item row';
        const label = document.createElement('span');
        label.textContent = session;
        const open = document.createElement('button');
        open.className = 'secondary';
        open.textContent = 'Open';
        open.onclick = async () => { $('session-id').value = session; setJson('history', await get('/sessions/' + encodeURIComponent(session) + '/history')); };
        row.append(label, open);
        target.appendChild(row);
      }
    }

    function renderRunes(runes) {
      const select = $('rune-select');
      const previous = select.value;
      select.innerHTML = '';
      for (const rune of runes) {
        const option = document.createElement('option');
        option.value = rune.name;
        option.textContent = rune.name + ' (' + rune.risk + ')';
        select.appendChild(option);
      }
      if (previous) select.value = previous;
    }

    function renderApprovals(approvals) {
      const target = $('approvals');
      target.innerHTML = '';
      if (!approvals.length) target.appendChild(item('No pending tool approvals.'));
      for (const approval of approvals) {
        const row = document.createElement('div');
        row.className = 'item stack';
        const title = document.createElement('div');
        title.innerHTML = '<strong>' + escapeHtml(approval.rune) + '</strong> <span class="muted">' + escapeHtml(approval.risk) + ' / ' + escapeHtml(approval.sessionId) + '</span>';
        const input = document.createElement('pre');
        input.textContent = JSON.stringify(approval.input, null, 2);
        const actions = document.createElement('div');
        actions.className = 'row';
        const approveOnce = document.createElement('button');
        approveOnce.textContent = 'Approve Once';
        approveOnce.onclick = async () => { await post('/approvals/' + approval.id + '/approve', { scope: 'once' }); await refresh(); };
        const approveSession = document.createElement('button');
        approveSession.className = 'secondary';
        approveSession.textContent = 'Approve Session';
        approveSession.onclick = async () => { await post('/approvals/' + approval.id + '/approve', { scope: 'session' }); await refresh(); };
        const deny = document.createElement('button');
        deny.className = 'danger';
        deny.textContent = 'Deny';
        deny.onclick = async () => { await post('/approvals/' + approval.id + '/deny', { reason: 'denied in Room' }); await refresh(); };
        actions.append(approveOnce, approveSession, deny);
        row.append(title, input, actions);
        target.appendChild(row);
      }
    }

    async function sendChat() {
      const prompt = $('prompt').value.trim();
      const sessionId = $('session-id').value.trim() || initialStatus.soul;
      if (!prompt) return;
      setText('answer', 'Thinking...');
      if ($('stream').checked) await streamChat(sessionId, prompt);
      else setJson('answer', await post('/sessions/' + encodeURIComponent(sessionId) + '/message', { prompt }));
      await refresh();
    }

    async function streamChat(sessionId, prompt) {
      const response = await fetch('/sessions/' + encodeURIComponent(sessionId) + '/stream', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) });
      if (!response.ok || !response.body) throw new Error('Stream failed: ' + response.statusText);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let text = '';
      setText('answer', '');
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const part of parts) {
          const line = part.split('\n').find((item) => item.startsWith('data: '));
          if (!line) continue;
          const event = JSON.parse(line.slice(6));
          if (event.type === 'text') text += event.text;
          if (event.type === 'done') text = event.response.content;
          if (event.type === 'error') text += '\nError: ' + event.error;
          setText('answer', text);
        }
      }
    }

    $('send').onclick = () => sendChat().catch((error) => setText('answer', String(error)));
    $('refresh').onclick = () => refresh().catch((error) => setText('answer', String(error)));
    $('create-session').onclick = async () => { const body = $('session-id').value.trim() ? { sessionId: $('session-id').value.trim() } : {}; setJson('answer', await post('/sessions', body)); await refresh(); };
    $('call-rune').onclick = async () => { setJson('rune-output', await post('/runes/call', { name: $('rune-select').value, sessionId: $('session-id').value.trim() || initialStatus.soul, input: JSON.parse($('rune-input').value || '{}') })); await refresh(); };
    $('memory-search').onclick = async () => { setJson('memory-output', await get('/memory/search?query=' + encodeURIComponent($('memory-query').value || $('prompt').value || 'rimuru') + '&sessionId=' + encodeURIComponent($('session-id').value.trim() || initialStatus.soul))); };
    $('memory-remember').onclick = async () => { setJson('memory-output', await post('/memory/remember', { sessionId: $('session-id').value.trim() || initialStatus.soul, text: $('prompt').value || $('memory-query').value, scope: 'note' })); await refresh(); };
    $('load-traces').onclick = async () => { setJson('trace-output', await get('/traces')); };
    $('load-audit').onclick = async () => { setJson('trace-output', await get('/audit?limit=50')); };

    function escapeHtml(value) { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }
    renderStatus(initialStatus, {});
    refresh().catch((error) => { setText('answer', String(error)); });
  </script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
