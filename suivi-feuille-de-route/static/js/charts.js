/* Mini-bibliothèque de graphiques en HTML/CSS (aucune dépendance externe). */
(function () {
  "use strict";

  const PALETTE = ["#2563eb", "#16a34a", "#d97706", "#dc2626", "#0891b2", "#7c3aed", "#db2777", "#65a30d"];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /* Donut : data = [{label, value, color}] */
  function donut(el, data, opts) {
    opts = opts || {};
    const total = data.reduce((s, d) => s + d.value, 0) || 1;
    let acc = 0;
    const stops = data.map((d, i) => {
      const color = d.color || PALETTE[i % PALETTE.length];
      const from = (acc / total) * 360;
      acc += d.value;
      const to = (acc / total) * 360;
      return `${color} ${from}deg ${to}deg`;
    }).join(", ");
    el.innerHTML = `
      <div class="donut-wrap">
        <div class="donut" data-total="${esc(opts.centerLabel || total)}" style="background: conic-gradient(${stops || "#e2e8f0 0 360deg"})"></div>
        <div class="donut-legend">
          ${data.map((d, i) => `<div class="li"><i style="background:${d.color || PALETTE[i % PALETTE.length]}"></i><span>${esc(d.label)}</span><span class="n">${d.value}</span></div>`).join("")}
        </div>
      </div>`;
  }

  /* Barres horizontales : rows = [{label, value, color, valLabel}] */
  function hbars(el, rows, opts) {
    opts = opts || {};
    const max = Math.max(1, ...rows.map(r => r.value));
    el.innerHTML = `<div class="hbars">` + rows.map(r => `
      <div class="brow" title="${esc(r.label)} : ${esc(r.valLabel != null ? r.valLabel : r.value)}">
        <div class="lbl">${esc(r.label)}</div>
        <div class="track"><div class="fill" style="width:${(r.value / max) * 100}%;background:${r.color || "#2563eb"}"></div></div>
        <div class="val">${esc(r.valLabel != null ? r.valLabel : r.value)}</div>
      </div>`).join("") + `</div>`;
  }

  /* Barres horizontales groupées (2 séries) : rows = [{label, v1, v2, l1, l2}] */
  function hbars2(el, rows, colors) {
    const max = Math.max(1, ...rows.flatMap(r => [r.v1, r.v2]));
    el.innerHTML = `<div class="hbars">` + rows.map(r => `
      <div class="brow" title="${esc(r.label)} — ${esc(r.l1)} / ${esc(r.l2)}">
        <div class="lbl">${esc(r.label)}</div>
        <div class="track">
          <div class="fill" style="width:${(r.v1 / max) * 100}%;background:${colors[0]}"></div>
          <div class="fill" style="width:${(r.v2 / max) * 100}%;background:${colors[1]};opacity:.75;margin-top:-16px"></div>
        </div>
        <div class="val">${esc(r.l1)} / ${esc(r.l2)}</div>
      </div>`).join("") + `</div>`;
  }

  window.Charts = { donut, hbars, hbars2, esc, PALETTE };
})();
