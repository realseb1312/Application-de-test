/* Pilotage Feuille de route 2027-2030 — application monopage (vanilla JS). */
(function () {
  "use strict";

  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = window.Charts.esc;

  const STATUTS = ["À faire", "En cours", "En attente", "Terminé", "Annulé"];
  const PRIORITES = ["Haute", "Moyenne", "Basse"];
  const CATEGORIES = ["Investissement", "Fonctionnement", "Prestation", "Licence", "Matériel", "Formation", "Autre"];
  const STATUT_COLORS = { "À faire": "#94a3b8", "En cours": "#2563eb", "En attente": "#d97706", "Terminé": "#16a34a", "Annulé": "#dc2626" };

  const state = { view: "dashboard", params: {}, filtres: null, actions: [], stats: null };

  /* ---------------- utils ---------------- */
  function user() { return localStorage.getItem("fdr_user") || ""; }
  function setUser(v) { localStorage.setItem("fdr_user", v); }

  async function api(path, opts) {
    opts = opts || {};
    const sep = path.indexOf("?") >= 0 ? "&" : "?";
    const url = path + sep + "auteur=" + encodeURIComponent(user());
    const r = await fetch(url, opts);
    if (!r.ok) {
      let msg = "Erreur " + r.status;
      try { msg = (await r.json()).error || msg; } catch (e) { /* ignore */ }
      throw new Error(msg);
    }
    return r.json();
  }

  function toast(msg, isErr) {
    const t = document.createElement("div");
    t.className = "toast" + (isErr ? " err" : "");
    t.textContent = msg;
    $("#toast-root").appendChild(t);
    setTimeout(() => t.remove(), 3800);
  }

  function fmtEur(v) {
    if (v === null || v === undefined || v === "") return "—";
    const n = Number(v);
    return n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: Number.isInteger(n) ? 0 : 2 });
  }
  function fmtDate(s) {
    if (!s) return "—";
    const d = new Date(String(s).slice(0, 10) + "T00:00:00");
    if (isNaN(d)) return s;
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  }
  function fmtDateShort(s) {
    if (!s) return "—";
    const d = new Date(String(s).slice(0, 10) + "T00:00:00");
    if (isNaN(d)) return s;
    return d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
  }
  function statutClass(s) {
    return "st-" + String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-");
  }
  function badgeStatut(s) { return `<span class="badge ${statutClass(s)}">${esc(s)}</span>`; }
  function prioClass(p) { return "prio-" + String(p || "").toLowerCase(); }
  function avBar(pct) {
    const cls = pct >= 100 ? "ok" : pct >= 50 ? "" : pct > 0 ? "warn" : "";
    return `<div class="av-cell"><div class="progress ${cls}"><div style="width:${pct}%"></div></div><span class="pct">${pct}%</span></div>`;
  }
  function debounce(fn, ms) {
    let t; return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  function currentQuery(extra) {
    const p = new URLSearchParams();
    const q = $("#global-search").value.trim();
    if (q) p.set("q", q);
    Object.entries(Object.assign({}, state.params, extra || {})).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== "") p.set(k, v);
    });
    return p.toString();
  }

  async function loadActions(extra) {
    state.actions = await api("/api/actions?" + currentQuery(extra));
    return state.actions;
  }
  async function loadFiltres() {
    if (!state.filtres) state.filtres = await api("/api/filtres");
    return state.filtres;
  }
  function refreshMeta() {
    api("/api/meta").then(m => {
      $("#meta-info").innerHTML =
        (m.source_file ? `Source : <strong>${esc(m.source_file)}</strong><br>` : "") +
        (m.imported_at ? `Import du ${esc(m.imported_at)}` : "");
    }).catch(() => {});
  }

  /* ---------------- routing ---------------- */
  function route() {
    const hash = location.hash.replace(/^#\/?/, "");
    const parts = hash.split("?");
    state.view = parts[0] || "dashboard";
    state.params = Object.fromEntries(new URLSearchParams(parts[1] || ""));
    $$("#nav a").forEach(a => a.classList.toggle("active", a.dataset.view === state.view));
    render().catch(e => { $("#view").innerHTML = `<div class="card"><p class="empty">${esc(e.message)}</p></div>`; });
  }
  window.addEventListener("hashchange", route);

  async function render() {
    const v = $("#view");
    if (state.view === "dashboard") return renderDashboard(v);
    if (state.view === "actions") return renderActions(v);
    if (state.view === "kanban") return renderKanban(v);
    if (state.view === "planning") return renderPlanning(v);
    if (state.view === "budget") return renderBudget(v);
    if (state.view === "rapports") return renderRapports(v);
    return renderDashboard(v);
  }

  function setParams(patch) {
    const p = Object.assign({}, state.params);
    Object.entries(patch).forEach(([k, v]) => { if (v) p[k] = v; else delete p[k]; });
    const qs = new URLSearchParams(p).toString();
    location.hash = "#/" + state.view + (qs ? "?" + qs : "");
  }

  /* ---------------- barre de filtres ---------------- */
  async function filterBar(container) {
    const f = await loadFiltres();
    const p = state.params;
    const mkSel = (key, values, allLabel) => {
      const optsHtml = [`<option value="">${allLabel}</option>`]
        .concat(values.map(v => `<option value="${esc(v)}" ${p[key] === v ? "selected" : ""}>${esc(v)}</option>`)).join("");
      return `<select data-f="${key}">${optsHtml}</select>`;
    };
    const triOpts = [["", "Tri : défaut"], ["echeance", "Tri : échéance"], ["avancement", "Tri : avancement"], ["budget", "Tri : budget"], ["priorite", "Tri : priorité"]]
      .map(([v, l]) => `<option value="${v}" ${p.tri === v || (!p.tri && v === "") ? "selected" : ""}>${l}</option>`).join("");
    container.innerHTML = `
      <div class="filter-bar">
        ${mkSel("axe", f.axes, "Tous les axes")}
        ${mkSel("thematique", f.thematiques, "Toutes les thématiques")}
        ${mkSel("statut", STATUTS, "Tous les statuts")}
        ${mkSel("priorite", PRIORITES, "Toutes priorités")}
        <select data-f="tri">${triOpts}</select>
        <label><input type="checkbox" data-f="retard" ${p.retard === "1" ? "checked" : ""}> En retard uniquement</label>
        <span class="spacer"></span>
        <span class="count-pill" id="count-pill"></span>
      </div>`;
    $$("select[data-f]", container).forEach(sel => {
      sel.addEventListener("change", () => setParams({ [sel.dataset.f]: sel.value }));
    });
    const cb = $('input[data-f="retard"]', container);
    if (cb) cb.addEventListener("change", () => setParams({ retard: cb.checked ? "1" : "" }));
  }

  function updateCount(n) {
    const el = $("#count-pill");
    if (el) el.textContent = n + " action" + (n > 1 ? "s" : "");
  }

  /* ---------------- vue tableau de bord ---------------- */
  async function renderDashboard(v) {
    v.innerHTML = `<h1 class="view-title">Tableau de bord</h1><p class="view-sub">Vue d'ensemble de la feuille de route 2027-2030</p><div id="dash-body"><div class="empty">Chargement…</div></div>`;
    const [stats, alertes] = await Promise.all([
      api("/api/stats?" + currentQuery()), api("/api/alertes?" + currentQuery())
    ]);
    state.stats = stats;
    const donutData = STATUTS.map(s => ({ label: s, value: stats.by_statut[s] || 0, color: STATUT_COLORS[s] })).filter(d => d.value > 0);
    const short = axe => axe.replace(/^AXE \d+\s*:\s*/i, "Axe ").slice(0, 42);
    const axeRows = Object.entries(stats.by_axe).map(([axe, e]) => ({
      label: short(axe), value: e.avancement, color: "#2563eb", valLabel: e.avancement + " %"
    }));
    const budgetRows = Object.entries(stats.by_axe).map(([axe, e]) => ({
      label: short(axe), v1: e.prevu, v2: e.conso, l1: fmtEur(e.prevu), l2: fmtEur(e.conso)
    }));
    v.innerHTML = `
      <h1 class="view-title">Tableau de bord</h1>
      <p class="view-sub">Feuille de route 2027-2030 — synthèse au ${new Date().toLocaleDateString("fr-FR")}</p>
      <div class="kpis">
        <div class="kpi"><div class="v">${stats.total}</div><div class="l">Actions</div></div>
        <div class="kpi"><div class="v">${stats.avancement_moyen} %</div><div class="l">Avancement moyen</div></div>
        <div class="kpi"><div class="v">${fmtEur(stats.budget_prevu)}</div><div class="l">Budget prévu</div></div>
        <div class="kpi"><div class="v ${stats.budget_conso > stats.budget_prevu ? "bad" : ""}">${fmtEur(stats.budget_conso)}</div><div class="l">Consommé</div></div>
        <div class="kpi"><div class="v">${fmtEur(stats.budget_reste)}</div><div class="l">Reste à engager</div></div>
        <div class="kpi"><div class="v bad">${stats.en_retard}</div><div class="l">En retard</div></div>
        <div class="kpi"><div class="v warn">${stats.echeance_30j}</div><div class="l">Échéance à 30 j</div></div>
      </div>
      <div class="grid-3">
        <div class="card"><h3>Répartition par statut</h3><div id="ch-statuts"></div></div>
        <div class="card"><h3>Avancement moyen par axe</h3><div id="ch-av"></div></div>
        <div class="card"><h3>Budget prévu / consommé par axe</h3><div id="ch-bud"></div>
          <div class="muted" style="font-size:11px;margin-top:8px">■ prévu &nbsp; ■ consommé</div></div>
      </div>
      <div class="grid-2">
        <div class="card"><h3>Alertes (${alertes.length})</h3>
          <div class="alert-list" id="dash-alertes">
            ${alertes.length ? alertes.slice(0, 12).map(a => `
              <div class="alert ${a.priorite === "moyenne" ? "moyenne" : ""}" data-id="${a.action.id}">
                <span class="a-id">#${a.action.id}</span> ${esc(a.action.action)}<div class="a-msg">${esc(a.message)}</div>
              </div>`).join("") : `<div class="empty">Aucune alerte 🎉</div>`}
          </div>
        </div>
        <div class="card"><h3>Actions à suivre en priorité</h3>
          <div id="dash-prio" class="alert-list"><div class="empty">Chargement…</div></div>
        </div>
      </div>`;
    window.Charts.donut($("#ch-statuts"), donutData.length ? donutData : [{ label: "Aucune action", value: 1, color: "#e2e8f0" }], { centerLabel: stats.total });
    window.Charts.hbars($("#ch-av"), axeRows.length ? axeRows : [{ label: "—", value: 0, valLabel: "—" }]);
    window.Charts.hbars2($("#ch-bud"), budgetRows.length ? budgetRows : [{ label: "—", v1: 0, v2: 0, l1: "—", l2: "—" }], ["#2563eb", "#94a3b8"]);
    const actions = await loadActions();
    const a_suivre = actions.filter(a => a.en_retard || a.priorite === "Haute" || (a.jours_restants !== null && a.jours_restants <= 60 && a.statut !== "Terminé"))
      .sort((a, b) => (b.en_retard ? 1 : 0) - (a.en_retard ? 1 : 0) || (a.echeance_end || "9999").localeCompare(b.echeance_end || "9999"))
      .slice(0, 12);
    $("#dash-prio").innerHTML = a_suivre.length ? a_suivre.map(a => `
      <div class="alert ${a.en_retard ? "" : "moyenne"}" data-id="${a.id}">
        <span class="a-id">#${a.id}</span> ${esc(a.action)}
        <div class="a-msg">${badgeStatut(a.statut)} · ${esc(a.echeance_text || a.echeance_end || "sans échéance")} · ${a.avancement}% · ${fmtEur(a.budget_conso)} / ${fmtEur(a.budget_prev)}</div>
      </div>`).join("") : `<div class="empty">Rien à signaler.</div>`;
    $$("#dash-alertes .alert, #dash-prio .alert").forEach(el =>
      el.addEventListener("click", () => openFiche(Number(el.dataset.id))));
  }

  /* ---------------- vue liste des actions ---------------- */
  async function renderActions(v) {
    v.innerHTML = `
      <h1 class="view-title">Actions</h1>
      <p class="view-sub">Cliquez sur une ligne pour ouvrir la fiche détaillée (statut, avancement, dépenses, jalons, commentaires, historique).</p>
      <div id="fb-actions"></div>
      <div class="table-wrap"><div id="tbl-actions"><div class="empty">Chargement…</div></div></div>`;
    await filterBar($("#fb-actions"));
    const actions = await loadActions();
    updateCount(actions.length);
    if (!actions.length) { $("#tbl-actions").innerHTML = `<div class="empty">Aucune action ne correspond aux filtres.</div>`; return; }
    const tri = state.params.tri || "";
    const th = (key, label, num) => `<th class="${num ? "num " : ""}sortable" data-tri="${key}">${label}${tri === key ? " ▲" : ""}</th>`;
    $("#tbl-actions").innerHTML = `
      <table class="data">
        <thead><tr>
          ${th("id", "#")}
          <th>Axe / Thématique</th>
          <th>Action</th>
          ${th("echeance", "Échéance")}
          <th>Statut</th>
          ${th("avancement", "Avancement")}
          ${th("priorite", "Priorité")}
          <th>Responsable</th>
          ${th("budget", "Budget prévu", 1)}
          <th class="num">Consommé</th>
          <th class="num">Reste</th>
        </tr></thead>
        <tbody>
        ${actions.map(a => `
          <tr data-id="${a.id}" class="${a.en_retard ? "row-retard" : ""}">
            <td class="muted">#${a.id}</td>
            <td><div class="sub">${esc(a.axe)}</div><span class="tag">${esc(a.thematique)}</span></td>
            <td style="max-width:420px">${esc(a.action)}<div class="sub">${esc(a.objectif || "")}</div></td>
            <td style="white-space:nowrap">${a.en_retard ? '<span class="tag retard">RETARD</span>' : ""}${a.recurrent ? '<span class="tag rec">🔄 récurrent</span>' : ""}<div>${esc(a.echeance_text || "—")}</div><div class="sub">${fmtDate(a.echeance_start)} → ${fmtDate(a.echeance_end)}</div></td>
            <td><select class="statut-sel" data-id="${a.id}" style="font-size:12px;padding:3px 6px">
              ${STATUTS.map(s => `<option ${s === a.statut ? "selected" : ""}>${s}</option>`).join("")}
            </select></td>
            <td style="min-width:130px">${avBar(a.avancement)}</td>
            <td><span class="${prioClass(a.priorite)}">${esc(a.priorite)}</span></td>
            <td>${esc(a.responsable || "—")}</td>
            <td class="num">${fmtEur(a.budget_prev)}<div class="sub">${esc(a.budget_type || "")}</div></td>
            <td class="num">${fmtEur(a.budget_conso)}</td>
            <td class="num">${fmtEur(a.reste)}</td>
          </tr>`).join("")}
        </tbody>
      </table>`;
    $$("#tbl-actions tbody tr").forEach(tr =>
      tr.addEventListener("click", e => {
        if (e.target.closest("select")) return;
        openFiche(Number(tr.dataset.id));
      }));
    $$("#tbl-actions thead th.sortable").forEach(th =>
      th.addEventListener("click", () => { if (th.dataset.tri) setParams({ tri: th.dataset.tri }); }));
    $$(".statut-sel").forEach(sel =>
      sel.addEventListener("change", async () => {
        try {
          await api("/api/actions/" + sel.dataset.id, {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ statut: sel.value })
          });
          toast("Statut mis à jour : " + sel.value);
          route();
        } catch (e) { toast(e.message, true); }
      }));
  }

  /* ---------------- vue kanban ---------------- */
  async function renderKanban(v) {
    v.innerHTML = `
      <h1 class="view-title">Kanban</h1>
      <p class="view-sub">Glissez-déposez une carte pour changer le statut de l'action.</p>
      <div id="fb-kanban"></div>
      <div class="kanban" id="kanban-board"><div class="empty">Chargement…</div></div>`;
    await filterBar($("#fb-kanban"));
    const actions = await loadActions();
    updateCount(actions.length);
    const board = $("#kanban-board");
    board.innerHTML = STATUTS.map(s => `
      <div class="kcol" data-statut="${esc(s)}">
        <h4>${esc(s)} <span class="n">${actions.filter(a => a.statut === s).length}</span></h4>
        <div class="kcol-body">
        ${actions.filter(a => a.statut === s).map(a => `
          <div class="kcard" draggable="true" data-id="${a.id}">
            <div class="k-id">#${a.id} · <span class="${prioClass(a.priorite)}">${esc(a.priorite)}</span></div>
            <div class="k-txt">${esc(a.action)}</div>
            <div class="av-cell"><div class="progress"><div style="width:${a.avancement}%"></div></div><span class="pct">${a.avancement}%</span></div>
            <div class="k-meta">
              <span class="tag">${esc((a.thematique || a.axe || "").slice(0, 30))}</span>
              ${a.en_retard ? '<span class="tag retard">RETARD</span>' : ""}
              ${a.echeance_end ? `<span class="tag">${esc(a.echeance_text || fmtDate(a.echeance_end))}</span>` : ""}
            </div>
            <div class="k-foot"><span>${esc(a.responsable || "—")}</span><span>${fmtEur(a.budget_conso)} / ${fmtEur(a.budget_prev)}</span></div>
          </div>`).join("")}
        </div>
      </div>`).join("");
    $$(".kcard", board).forEach(card => {
      card.addEventListener("dragstart", e => {
        e.dataTransfer.setData("text/plain", card.dataset.id);
        card.classList.add("dragging");
      });
      card.addEventListener("dragend", () => card.classList.remove("dragging"));
      card.addEventListener("click", () => openFiche(Number(card.dataset.id)));
    });
    $$(".kcol", board).forEach(col => {
      col.addEventListener("dragover", e => { e.preventDefault(); col.classList.add("over"); });
      col.addEventListener("dragleave", () => col.classList.remove("over"));
      col.addEventListener("drop", async e => {
        e.preventDefault();
        col.classList.remove("over");
        const id = e.dataTransfer.getData("text/plain");
        const statut = col.dataset.statut;
        try {
          await api("/api/actions/" + id, {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ statut })
          });
          toast("Action #" + id + " → " + statut);
          route();
        } catch (err) { toast(err.message, true); }
      });
    });
  }

  /* ---------------- vue planning (gantt) ---------------- */
  const GANTT_START = new Date(2026, 0, 1);
  const GANTT_END = new Date(2032, 0, 1);
  const GANTT_Q = 24;
  function ganttPos(d) {
    if (!d) return null;
    const t = new Date(String(d).slice(0, 10) + "T00:00:00");
    if (isNaN(t)) return null;
    return Math.max(0, Math.min(1, (t - GANTT_START) / (GANTT_END - GANTT_START)));
  }
  async function renderPlanning(v) {
    v.innerHTML = `
      <h1 class="view-title">Planning 2026 – 2031</h1>
      <p class="view-sub">Barres positionnées selon l'échéance ; la ligne rouge = aujourd'hui. Cliquez sur une barre pour ouvrir la fiche.</p>
      <div id="fb-planning"></div>
      <div class="g-legend">
        ${STATUTS.map(s => `<span><i style="background:${STATUT_COLORS[s]}"></i>${esc(s)}</span>`).join("")}
        <span><i style="background:repeating-linear-gradient(45deg,#94a3b8 0 4px,#fff 4px 8px)"></i>Récurrent</span>
      </div>
      <div class="gantt-wrap"><div class="gantt" id="gantt"><div class="empty">Chargement…</div></div></div>`;
    await filterBar($("#fb-planning"));
    const actions = (await loadActions()).filter(a => a.echeance_start || a.echeance_end)
      .sort((a, b) => (a.echeance_start || "9999").localeCompare(b.echeance_start || "9999"));
    updateCount(actions.length);
    const quarters = [];
    for (let i = 0; i < GANTT_Q; i++) {
      const d = new Date(GANTT_START.getFullYear(), GANTT_START.getMonth() + i * 3, 1);
      quarters.push({ y: d.getFullYear(), q: Math.floor(d.getMonth() / 3) + 1, isYear: Math.floor(d.getMonth() / 3) === 0 });
    }
    const todayPos = (new Date() - GANTT_START) / (GANTT_END - GANTT_START) * 100;
    $("#gantt").innerHTML = `
      <div class="g-head">
        <div class="g-label">Action</div>
        <div class="g-scale" style="grid-template-columns:repeat(${GANTT_Q},1fr)">
          ${quarters.map(q => `<div class="q ${q.isYear ? "year" : ""}">${q.isYear ? q.y : "T" + q.q}</div>`).join("")}
        </div>
      </div>
      ${actions.map(a => {
        const p0 = ganttPos(a.echeance_start) !== null ? ganttPos(a.echeance_start) : 0;
        const p1 = ganttPos(a.echeance_end) !== null ? ganttPos(a.echeance_end) : p0;
        const left = p0 * 100, width = Math.max(1.2, (p1 - p0) * 100);
        return `
        <div class="g-row">
          <div class="g-label" data-id="${a.id}">
            <div class="t">#${a.id} — ${esc(a.action.length > 52 ? a.action.slice(0, 52) + "…" : a.action)}</div>
            <div class="s">${esc(a.axe)} · ${esc(a.thematique)} · ${a.avancement}% · ${badgeStatut(a.statut)}</div>
          </div>
          <div class="g-track">
            <div class="g-bar b-${statutClass(a.statut).slice(3)} ${a.recurrent ? "rec" : ""} ${a.en_retard ? "b-annule" : ""}"
                 style="left:${left}%;width:${width}%"
                 data-id="${a.id}"
                 title="#${a.id} ${esc(a.action)}\n${esc(a.echeance_text || "")} (${fmtDate(a.echeance_start)} → ${fmtDate(a.echeance_end)})\nStatut : ${esc(a.statut)} — ${a.avancement}%">${esc(a.echeance_text || fmtDate(a.echeance_end))}</div>
          </div>
        </div>`;
      }).join("")}
      <div class="g-head" style="border-bottom:0"><div class="g-label"></div><div class="g-scale" style="grid-template-columns:repeat(${GANTT_Q},1fr);position:relative"><div class="g-today" style="left:${todayPos}%"></div></div></div>`;
    $$("#gantt .g-label, #gantt .g-bar").forEach(el =>
      el.addEventListener("click", () => openFiche(Number(el.dataset.id))));
  }

  /* ---------------- vue budget ---------------- */
  async function renderBudget(v) {
    v.innerHTML = `
      <h1 class="view-title">Budget</h1>
      <p class="view-sub">Budget prévu vs consommé (le consommé est la somme des dépenses enregistrées dans chaque fiche action).</p>
      <div id="fb-budget"></div>
      <div id="budget-body"><div class="empty">Chargement…</div></div>`;
    await filterBar($("#fb-budget"));
    const [stats, actions] = await Promise.all([api("/api/stats?" + currentQuery()), loadActions()]);
    updateCount(actions.length);
    const withBudget = actions.filter(a => a.budget_prev !== null).sort((a, b) => {
      const ta = a.taux_conso === null ? -1 : a.taux_conso, tb = b.taux_conso === null ? -1 : b.taux_conso;
      return tb - ta;
    });
    const typeRows = Object.entries(stats.by_type)
      .filter(([, e]) => e.count > 0)
      .map(([t, e]) => ({ label: t, v1: e.prevu, v2: e.conso, l1: fmtEur(e.prevu), l2: fmtEur(e.conso) }));
    const taux = stats.budget_prevu ? Math.round(stats.budget_conso / stats.budget_prevu * 100) : null;
    $("#budget-body").innerHTML = `
      <div class="kpis">
        <div class="kpi"><div class="v">${fmtEur(stats.budget_prevu)}</div><div class="l">Budget prévu (total)</div></div>
        <div class="kpi"><div class="v">${fmtEur(stats.budget_conso)}</div><div class="l">Consommé</div></div>
        <div class="kpi"><div class="v">${fmtEur(stats.budget_reste)}</div><div class="l">Reste à engager</div></div>
        <div class="kpi"><div class="v ${taux !== null && taux > 100 ? "bad" : taux !== null && taux >= 80 ? "warn" : "ok"}">${taux === null ? "—" : taux + " %"}</div><div class="l">Taux de consommation</div></div>
      </div>
      <div class="grid-2">
        <div class="card"><h3>Budget par type</h3><div id="ch-type"></div>
          <div class="muted" style="font-size:11px;margin-top:8px">■ prévu &nbsp; ■ consommé</div></div>
        <div class="card"><h3>Actions avec le plus fort taux de consommation</h3>
          <div id="ch-taux"></div></div>
      </div>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>#</th><th>Action</th><th>Type</th><th class="num">Budget prévu</th><th class="num">Consommé</th><th class="num">Reste</th><th>Taux</th><th class="num">Dépenses</th><th></th></tr></thead>
        <tbody>
        ${withBudget.map(a => `
          <tr data-id="${a.id}" class="${a.taux_conso !== null && a.taux_conso >= 100 ? "row-retard" : ""}">
            <td class="muted">#${a.id}</td>
            <td style="max-width:400px">${esc(a.action)}<div class="sub">${esc(a.thematique)}</div></td>
            <td>${esc(a.budget_type || "")}<div class="sub">${esc(a.budget_text || "")}</div></td>
            <td class="num">${fmtEur(a.budget_prev)}</td>
            <td class="num">${fmtEur(a.budget_conso)}</td>
            <td class="num">${fmtEur(a.reste)}</td>
            <td style="min-width:150px">${avBar(a.taux_conso === null ? 0 : Math.min(100, a.taux_conso))}${a.taux_conso !== null ? ` <span class="pct">${a.taux_conso}%</span>` : ""}</td>
            <td class="num">${a.depenses_count}</td>
            <td><button class="btn small" data-dep="${a.id}">+ Dépense</button></td>
          </tr>`).join("") || `<tr><td colspan="9"><div class="empty">Aucune action budgétée dans la sélection.</div></td></tr>`}
        </tbody>
      </table></div>`;
    window.Charts.hbars2($("#ch-type"), typeRows.length ? typeRows : [{ label: "—", v1: 0, v2: 0, l1: "—", l2: "—" }], ["#2563eb", "#94a3b8"]);
    window.Charts.hbars($("#ch-taux"), withBudget.length ? withBudget.slice(0, 8).map(a => ({
      label: "#" + a.id + " " + a.action.slice(0, 38), value: a.taux_conso === null ? 0 : a.taux_conso,
      color: a.taux_conso !== null && a.taux_conso >= 100 ? "#dc2626" : a.taux_conso !== null && a.taux_conso >= 80 ? "#d97706" : "#2563eb",
      valLabel: (a.taux_conso === null ? "—" : a.taux_conso + "%") })) : [{ label: "—", value: 0, valLabel: "" }]);
    $$("#budget-body tbody tr").forEach(tr => tr.addEventListener("click", e => {
      if (e.target.closest("button")) return;
      openFiche(Number(tr.dataset.id));
    }));
    $$("button[data-dep]").forEach(b => b.addEventListener("click", () => openFiche(Number(b.dataset.dep), "depenses")));
  }

  /* ---------------- vue rapports ---------------- */
  async function renderRapports(v) {
    const f = await loadFiltres();
    v.innerHTML = `
      <h1 class="view-title">Rapports &amp; impressions</h1>
      <p class="view-sub">Générez un rapport imprimable (A4) ou exportez les données. Le rapport s'ouvre dans un nouvel onglet : utilisez « Imprimer / Enregistrer en PDF ».</p>
      <div class="grid-2">
        <div class="card">
          <h3>Rapport imprimable</h3>
          <div class="form-grid">
            <div class="field"><label>Axe</label><select id="r-axe"><option value="">Tous les axes</option>${f.axes.map(a => `<option ${state.params.axe === a ? "selected" : ""}>${esc(a)}</option>`).join("")}</select></div>
            <div class="field"><label>Statut</label><select id="r-statut"><option value="">Tous les statuts</option>${STATUTS.map(s => `<option ${state.params.statut === s ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></div>
            <div class="field"><label>Priorité</label><select id="r-prio"><option value="">Toutes</option>${PRIORITES.map(s => `<option ${state.params.priorite === s ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></div>
            <div class="field"><label>Recherche</label><input id="r-q" type="text" value="${esc(state.params.q || $("#global-search").value || "")}" placeholder="Mot-clé…"></div>
          </div>
          <div class="flex mt">
            <button class="btn primary" id="r-open">Ouvrir le rapport imprimable</button>
            <button class="btn" id="r-open-retard">Rapport « actions en retard »</button>
          </div>
        </div>
        <div class="card">
          <h3>Exports de données</h3>
          <p class="muted" style="font-size:12.5px">Les exports appliquent la recherche globale et les filtres de la vue courante.</p>
          <div class="flex" style="flex-wrap:wrap">
            <button class="btn" id="r-xlsx">Excel (.xlsx) — actions + dépenses + synthèse</button>
            <button class="btn" id="r-csv">CSV</button>
          </div>
          <h3 class="mt">Alertes en cours</h3>
          <div class="alert-list" id="r-alertes"><div class="empty">Chargement…</div></div>
        </div>
      </div>`;
    const openRapport = (extra) => {
      const p = new URLSearchParams();
      const axe = $("#r-axe").value, statut = $("#r-statut").value, prio = $("#r-prio").value, q = $("#r-q").value.trim();
      if (axe) p.set("axe", axe); if (statut) p.set("statut", statut);
      if (prio) p.set("priorite", prio); if (q) p.set("q", q);
      Object.entries(extra || {}).forEach(([k, val]) => p.set(k, val));
      window.open("/rapport?" + p.toString(), "_blank");
    };
    $("#r-open").addEventListener("click", () => openRapport());
    $("#r-open-retard").addEventListener("click", () => openRapport({ retard: "1" }));
    $("#r-xlsx").addEventListener("click", () => { location.href = "/api/export.xlsx?auteur=" + encodeURIComponent(user()) + "&" + currentQuery(); });
    $("#r-csv").addEventListener("click", () => { location.href = "/api/export.csv?auteur=" + encodeURIComponent(user()) + "&" + currentQuery(); });
    const alertes = await api("/api/alertes?" + currentQuery());
    $("#r-alertes").innerHTML = alertes.length ? alertes.slice(0, 15).map(a => `
      <div class="alert ${a.priorite === "moyenne" ? "moyenne" : ""}" data-id="${a.action.id}">
        <span class="a-id">#${a.action.id}</span> ${esc(a.action.action)}<div class="a-msg">${esc(a.message)}</div>
      </div>`).join("") : `<div class="empty">Aucune alerte.</div>`;
    $$("#r-alertes .alert").forEach(el => el.addEventListener("click", () => openFiche(Number(el.dataset.id))));
  }

  /* ---------------- fiche action (modale) ---------------- */
  async function openFiche(id, tab) {
    const root = $("#modal-root");
    root.innerHTML = `<div class="modal-backdrop"><div class="modal"><div class="empty">Chargement…</div></div></div>`;
    let a;
    if (id) {
      try { a = await api("/api/actions/" + id); }
      catch (e) { toast(e.message, true); closeModal(); return; }
    } else {
      a = { id: null, axe: "", thematique: "", objectif: "", action: "", budget_text: "", budget_prev: null,
            budget_type: "", echeance_text: "", echeance_start: "", echeance_end: "", recurrent: 0,
            statut: "À faire", avancement: 0, priorite: "Moyenne", responsable: "", commentaire: "",
            depenses: [], jalons: [], commentaires: [], historique: [] };
    }
    let activeTab = tab || "general";
    const tabs = () => [
      ["general", "Général"],
      ["depenses", `Dépenses (${a.depenses.length})`],
      ["jalons", `Jalons (${a.jalons.length})`],
      ["commentaires", `Commentaires (${a.commentaires.length})`],
      ["historique", `Historique (${a.historique.length})`]
    ];

    function draw() {
      root.innerHTML = `
      <div class="modal-backdrop" id="m-back">
        <div class="modal" role="dialog" aria-modal="true">
          <div class="modal-head">
            <div class="titles">
              <h3>${a.id ? "Action #" + a.id : "Nouvelle action"}</h3>
              <div class="sub">${esc(a.axe || "")} ${a.thematique ? "· " + esc(a.thematique) : ""}</div>
            </div>
            <button class="modal-close" id="m-close" title="Fermer (Échap)">✕</button>
          </div>
          <div class="modal-tabs">
            ${tabs().map(([k, l]) => `<button data-tab="${k}" class="${activeTab === k ? "active" : ""}">${l}</button>`).join("")}
          </div>
          <div class="modal-body" id="m-body">${bodyFor(activeTab)}</div>
          <div class="modal-foot">
            <button class="btn danger" id="m-del" ${a.id ? "" : "style='display:none'"}>Supprimer</button>
            <span style="flex:1"></span>
            <button class="btn" id="m-cancel">Fermer</button>
            <button class="btn primary" id="m-save">Enregistrer</button>
          </div>
        </div>
      </div>`;
      $("#m-close").addEventListener("click", closeModal);
      $("#m-cancel").addEventListener("click", closeModal);
      $("#m-back").addEventListener("click", e => { if (e.target.id === "m-back") closeModal(); });
      $$(".modal-tabs button").forEach(b => b.addEventListener("click", () => { activeTab = b.dataset.tab; draw(); }));
      $("#m-save").addEventListener("click", saveFiche);
      const del = $("#m-del");
      if (del) del.addEventListener("click", delFiche);
      bindTab(activeTab);
    }

    function bodyFor(t) {
      if (t === "general") return bodyGeneral();
      if (t === "depenses") return bodyDepenses();
      if (t === "jalons") return bodyJalons();
      if (t === "commentaires") return bodyCommentaires();
      return bodyHistorique();
    }

    function bodyGeneral() {
      return `
      <div class="form-grid">
        <div class="field"><label>Axe</label><input id="f-axe" value="${esc(a.axe)}"></div>
        <div class="field"><label>Thématique</label><input id="f-thematique" value="${esc(a.thematique)}"></div>
        <div class="field full"><label>Action</label><textarea id="f-action" rows="2">${esc(a.action)}</textarea></div>
        <div class="field full"><label>Objectif</label><textarea id="f-objectif" rows="2">${esc(a.objectif)}</textarea></div>
        <div class="field"><label>Échéance (texte libre)</label><input id="f-echeance_text" value="${esc(a.echeance_text)}" placeholder="ex : 2027-2028, T4 2026…"></div>
        <div class="field"><label>Récurrent</label><select id="f-recurrent"><option value="0" ${!a.recurrent ? "selected" : ""}>Non</option><option value="1" ${a.recurrent ? "selected" : ""}>Oui (🔄)</option></select></div>
        <div class="field"><label>Début</label><input type="date" id="f-echeance_start" value="${esc(a.echeance_start || "")}"></div>
        <div class="field"><label>Fin</label><input type="date" id="f-echeance_end" value="${esc(a.echeance_end || "")}"></div>
        <div class="field"><label>Statut</label><select id="f-statut">${STATUTS.map(s => `<option ${s === a.statut ? "selected" : ""}>${s}</option>`).join("")}</select></div>
        <div class="field"><label>Priorité</label><select id="f-priorite">${PRIORITES.map(p => `<option ${p === a.priorite ? "selected" : ""}>${p}</option>`).join("")}</select></div>
        <div class="field"><label>Avancement</label>
          <div class="av-row"><input type="range" id="f-avancement" min="0" max="100" value="${a.avancement}"><input type="number" id="f-avancement-n" min="0" max="100" value="${a.avancement}"></div>
        </div>
        <div class="field"><label>Responsable</label><input id="f-responsable" value="${esc(a.responsable)}" placeholder="Nom du pilote"></div>
        <div class="field"><label>Budget (texte, ex : « 50 K€ - Inv. »)</label><input id="f-budget_text" value="${esc(a.budget_text)}"></div>
        <div class="field"><label>Budget prévu (€)</label><input type="number" step="0.01" id="f-budget_prev" value="${a.budget_prev === null || a.budget_prev === undefined ? "" : a.budget_prev}"></div>
        <div class="field"><label>Type de budget</label><input id="f-budget_type" value="${esc(a.budget_type)}"></div>
        <div class="field full"><label>Commentaire / notes</label><textarea id="f-commentaire" rows="3">${esc(a.commentaire)}</textarea></div>
      </div>`;
    }

    function readGeneral() {
      return {
        axe: $("#f-axe").value, thematique: $("#f-thematique").value,
        action: $("#f-action").value, objectif: $("#f-objectif").value,
        echeance_text: $("#f-echeance_text").value,
        echeance_start: $("#f-echeance_start").value || null,
        echeance_end: $("#f-echeance_end").value || null,
        recurrent: $("#f-recurrent").value === "1" ? 1 : 0,
        statut: $("#f-statut").value, priorite: $("#f-priorite").value,
        avancement: Number($("#f-avancement-n").value || 0),
        responsable: $("#f-responsable").value,
        budget_text: $("#f-budget_text").value,
        budget_prev: $("#f-budget_prev").value === "" ? null : Number($("#f-budget_prev").value),
        budget_type: $("#f-budget_type").value,
        commentaire: $("#f-commentaire").value
      };
    }

    async function saveFiche() {
      try {
        const data = readGeneral();
        if (a.id) {
          a = await api("/api/actions/" + a.id, {
            method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data)
          });
        } else {
          const r = await api("/api/actions", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data)
          });
          a = await api("/api/actions/" + r.id);
        }
        toast("Enregistré ✔");
        draw();
        route();
      } catch (e) { toast(e.message, true); }
    }

    async function delFiche() {
      if (!a.id || !confirm("Supprimer définitivement l'action #" + a.id + " ?")) return;
      try {
        await api("/api/actions/" + a.id, { method: "DELETE" });
        toast("Action supprimée");
        closeModal();
        route();
      } catch (e) { toast(e.message, true); }
    }

    function bodyDepenses() {
      const conso = a.depenses.reduce((s, d) => s + Number(d.montant), 0);
      const reste = a.budget_prev !== null && a.budget_prev !== undefined ? a.budget_prev - conso : null;
      const taux = a.budget_prev ? Math.round(conso / a.budget_prev * 100) : null;
      return `
        <div class="budget-summary">
          <div class="kpi"><div class="v">${fmtEur(a.budget_prev)}</div><div class="l">Budget prévu</div></div>
          <div class="kpi"><div class="v">${fmtEur(conso)}</div><div class="l">Consommé (${a.depenses.length} dépense${a.depenses.length > 1 ? "s" : ""})</div></div>
          <div class="kpi"><div class="v">${fmtEur(reste)}</div><div class="l">Reste</div></div>
          <div class="kpi"><div class="v ${taux !== null && taux >= 100 ? "bad" : taux !== null && taux >= 80 ? "warn" : ""}">${taux === null ? "—" : taux + " %"}</div><div class="l">Taux de conso</div></div>
        </div>
        ${taux !== null ? `<div class="progress ${taux >= 100 ? "bad" : taux >= 80 ? "warn" : ""}" style="height:14px;margin-bottom:14px"><div style="width:${Math.min(100, taux)}%"></div></div>` : ""}
        <div class="add-form">
          <div class="field"><label>Date</label><input type="date" id="d-date" value="${new Date().toISOString().slice(0, 10)}"></div>
          <div class="field" style="grid-column:span 2"><label>Libellé</label><input id="d-libelle" placeholder="ex : achat 10 postes reconditionnés"></div>
          <div class="field"><label>Montant €</label><input type="number" step="0.01" min="0" id="d-montant" placeholder="0.00"></div>
          <div class="field"><label>Catégorie</label><select id="d-cat">${CATEGORIES.map(c => `<option>${c}</option>`).join("")}</select></div>
          <div class="field"><button class="btn primary small" id="d-add">+ Ajouter</button></div>
        </div>
        <table class="sub-table">
          <thead><tr><th>Date</th><th>Libellé</th><th>Catégorie</th><th class="num">Montant</th><th></th></tr></thead>
          <tbody>
          ${a.depenses.map(d => `
            <tr><td style="white-space:nowrap">${fmtDate(d.date)}</td><td>${esc(d.libelle)}</td><td>${esc(d.categorie)}</td>
            <td class="num">${fmtEur(d.montant)}</td>
            <td><button class="btn small danger" data-ddel="${d.id}">✕</button></td></tr>`).join("")
          || `<tr><td colspan="5"><div class="empty">Aucune dépense enregistrée.</div></td></tr>`}
          </tbody>
          <tfoot><tr><th colspan="3">Total</th><th class="num">${fmtEur(conso)}</th><th></th></tr></tfoot>
        </table>`;
    }

    function bodyJalons() {
      return `
        <div class="add-form">
          <div class="field" style="grid-column:span 2"><label>Jalon</label><input id="j-titre" placeholder="ex : appel d'offres lancé"></div>
          <div class="field"><label>Date prévue</label><input type="date" id="j-date"></div>
          <div class="field"><button class="btn primary small" id="j-add">+ Ajouter</button></div>
        </div>
        <table class="sub-table">
          <thead><tr><th>Jalon</th><th>Date prévue</th><th>Date réalisée</th><th>Statut</th><th></th></tr></thead>
          <tbody>
          ${a.jalons.map(j => `
            <tr>
              <td><input class="j-titre" data-jid="${j.id}" value="${esc(j.titre)}" style="width:100%"></td>
              <td><input type="date" class="j-dp" data-jid="${j.id}" value="${esc(j.date_prevue || "")}"></td>
              <td><input type="date" class="j-dr" data-jid="${j.id}" value="${esc(j.date_realisation || "")}"></td>
              <td><select class="j-st" data-jid="${j.id}">${STATUTS.map(s => `<option ${s === j.statut ? "selected" : ""}>${s}</option>`).join("")}</select></td>
              <td><button class="btn small danger" data-jdel="${j.id}">✕</button></td>
            </tr>`).join("") || `<tr><td colspan="5"><div class="empty">Aucun jalon.</div></td></tr>`}
          </tbody>
        </table>`;
    }

    function bodyCommentaires() {
      return `
        <div class="add-form" style="grid-template-columns:1fr auto">
          <div class="field"><label>Nouveau commentaire</label><textarea id="c-texte" rows="2" placeholder="Point d'avancement, décision, blocage…"></textarea></div>
          <div class="field"><button class="btn primary small" id="c-add">Publier</button></div>
        </div>
        ${a.commentaires.map(c => `
          <div class="comment">
            <div class="c-meta"><span><strong>${esc(c.auteur || "Anonyme")}</strong> · ${esc(c.date)}</span>
            <button class="btn small danger" data-cdel="${c.id}">✕</button></div>
            <div>${esc(c.texte).replace(/\n/g, "<br>")}</div>
          </div>`).join("") || `<div class="empty">Aucun commentaire.</div>`}`;
    }

    function bodyHistorique() {
      const labels = { statut: "Statut", avancement: "Avancement", priorite: "Priorité", responsable: "Responsable",
        budget_prev: "Budget prévu", echeance_end: "Fin d'échéance", echeance_start: "Début d'échéance",
        commentaire: "Commentaire", action: "Action", objectif: "Objectif", thematique: "Thématique", axe: "Axe",
        budget_text: "Budget (texte)", budget_type: "Type de budget", echeance_text: "Échéance (texte)",
        recurrent: "Récurrence", création: "Création", "dépense ajoutée": "Dépense ajoutée",
        "dépense supprimée": "Dépense supprimée", "dépense modifiée": "Dépense modifiée" };
      return `<table class="sub-table"><thead><tr><th>Date</th><th>Auteur</th><th>Modification</th><th>Détail</th></tr></thead>
        <tbody>
        ${a.historique.map(h => `
          <tr><td style="white-space:nowrap">${esc(h.date)}</td><td>${esc(h.auteur || "")}</td>
          <td>${esc(labels[h.champ] || h.champ)}</td>
          <td><span class="old">${esc(h.ancienne_valeur || "—")}</span> → <span class="new">${esc(h.nouvelle_valeur || "—")}</span></td></tr>`).join("")
        || `<tr><td colspan="4"><div class="empty">Aucune modification enregistrée.</div></td></tr>`}
        </tbody></table>`;
    }

    function bindTab(t) {
      if (t === "general") {
        const r = $("#f-avancement"), n = $("#f-avancement-n");
        if (r && n) {
          r.addEventListener("input", () => { n.value = r.value; });
          n.addEventListener("input", () => { r.value = n.value; });
        }
      }
      if (t === "depenses") {
        $("#d-add").addEventListener("click", async () => {
          try {
            const montant = Number($("#d-montant").value);
            if (!montant) { toast("Saisissez un montant", true); return; }
            await api(`/api/actions/${a.id}/depenses`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ date: $("#d-date").value, libelle: $("#d-libelle").value, montant, categorie: $("#d-cat").value })
            });
            a = await api("/api/actions/" + a.id);
            toast("Dépense ajoutée");
            draw(); route();
          } catch (e) { toast(e.message, true); }
        });
        $$("[data-ddel]").forEach(b => b.addEventListener("click", async () => {
          try {
            await api("/api/depenses/" + b.dataset.ddel, { method: "DELETE" });
            a = await api("/api/actions/" + a.id);
            toast("Dépense supprimée");
            draw(); route();
          } catch (e) { toast(e.message, true); }
        }));
      }
      if (t === "jalons") {
        $("#j-add").addEventListener("click", async () => {
          try {
            await api(`/api/actions/${a.id}/jalons`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ titre: $("#j-titre").value, date_prevue: $("#j-date").value || null })
            });
            a = await api("/api/actions/" + a.id);
            toast("Jalon ajouté"); draw();
          } catch (e) { toast(e.message, true); }
        });
        $$(".j-titre, .j-dp, .j-dr, .j-st").forEach(el => el.addEventListener("change", async () => {
          const jid = el.dataset.jid;
          const old = a.jalons.find(j => String(j.id) === String(jid)) || {};
          try {
            await api("/api/jalons/" + jid, {
              method: "PUT", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                titre: $(`.j-titre[data-jid="${jid}"]`).value,
                date_prevue: $(`.j-dp[data-jid="${jid}"]`).value || null,
                date_realisation: $(`.j-dr[data-jid="${jid}"]`).value || null,
                statut: $(`.j-st[data-jid="${jid}"]`).value,
                commentaire: old.commentaire || ""
              })
            });
            toast("Jalon mis à jour");
          } catch (e) { toast(e.message, true); }
        }));
        $$("[data-jdel]").forEach(b => b.addEventListener("click", async () => {
          try {
            await api("/api/jalons/" + b.dataset.jdel, { method: "DELETE" });
            a = await api("/api/actions/" + a.id);
            draw();
          } catch (e) { toast(e.message, true); }
        }));
      }
      if (t === "commentaires") {
        $("#c-add").addEventListener("click", async () => {
          try {
            await api(`/api/actions/${a.id}/commentaires`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ texte: $("#c-texte").value })
            });
            a = await api("/api/actions/" + a.id);
            toast("Commentaire publié"); draw();
          } catch (e) { toast(e.message, true); }
        });
        $$("[data-cdel]").forEach(b => b.addEventListener("click", async () => {
          try {
            await api("/api/commentaires/" + b.dataset.cdel, { method: "DELETE" });
            a = await api("/api/actions/" + a.id);
            draw();
          } catch (e) { toast(e.message, true); }
        }));
      }
    }

    draw();
    function escClose(e) { if (e.key === "Escape") { closeModal(); document.removeEventListener("keydown", escClose); } }
    document.addEventListener("keydown", escClose);
  }

  function closeModal() { $("#modal-root").innerHTML = ""; }

  /* ---------------- barre supérieure & sidebar ---------------- */
  function wireChrome() {
    $("#user-name").value = user();
    $("#user-name").addEventListener("change", e => { setUser(e.target.value.trim()); toast("Nom enregistré : " + e.target.value.trim()); });
    $("#global-search").addEventListener("input", debounce(() => route(), 350));
    $("#btn-new-action").addEventListener("click", () => openFiche(null));
    $("#btn-print").addEventListener("click", () => {
      const p = new URLSearchParams();
      const q = $("#global-search").value.trim();
      if (q) p.set("q", q);
      ["axe", "statut", "priorite", "thematique"].forEach(k => { if (state.params[k]) p.set(k, state.params[k]); });
      window.open("/rapport?" + p.toString(), "_blank");
    });
    $("#btn-export-xlsx").addEventListener("click", () => { location.href = "/api/export.xlsx?auteur=" + encodeURIComponent(user()) + "&" + currentQuery(); });
    $("#btn-export-csv").addEventListener("click", () => { location.href = "/api/export.csv?auteur=" + encodeURIComponent(user()) + "&" + currentQuery(); });
    $("#btn-import").addEventListener("click", () => $("#import-file").click());
    $("#import-file").addEventListener("change", async e => {
      const f = e.target.files[0];
      if (!f) return;
      if (!confirm("Réimporter « " + f.name + " » ? Toutes les actions actuelles seront remplacées.")) { e.target.value = ""; return; }
      const fd = new FormData();
      fd.append("file", f);
      try {
        const r = await fetch("/api/import?auteur=" + encodeURIComponent(user()), { method: "POST", body: fd });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "échec");
        toast(j.nb_actions + " actions importées ✔");
        state.filtres = null;
        refreshMeta();
        location.hash = "#/actions";
        route();
      } catch (err) { toast(err.message, true); }
      e.target.value = "";
    });
    $("#btn-backup").addEventListener("click", () => { location.href = "/api/backup"; });
    $("#btn-restore").addEventListener("click", () => $("#restore-file").click());
    $("#restore-file").addEventListener("change", async e => {
      const f = e.target.files[0];
      if (!f) return;
      if (!confirm("Restaurer la base « " + f.name + " » ? Les données actuelles seront remplacées.")) { e.target.value = ""; return; }
      const fd = new FormData();
      fd.append("file", f);
      try {
        const r = await fetch("/api/restore", { method: "POST", body: fd });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "échec");
        toast("Base restaurée ✔");
        state.filtres = null;
        route();
      } catch (err) { toast(err.message, true); }
      e.target.value = "";
    });
  }

  /* ---------------- démarrage ---------------- */
  wireChrome();
  refreshMeta();
  if (!location.hash) location.hash = "#/dashboard";
  route();
})();
