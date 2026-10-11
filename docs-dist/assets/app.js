// ui8kit site: code tabs, copy buttons, search. Progressive enhancement: without JS every runtime panel is visible.
(function () {
  "use strict";
  var root = document.documentElement;
  root.classList.add("js");

  // ---- tabs
  document.querySelectorAll("[data-tabs]").forEach(function (box, n) {
    var panels = Array.prototype.slice.call(box.querySelectorAll("[data-panel]"));
    if (!panels.length) return;
    var list = document.createElement("div");
    list.setAttribute("role", "tablist");
    list.setAttribute("aria-label", "Runtime");
    list.className = "flex gap-2 border-b border-border mb-4";
    var tabs = panels.map(function (p, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "tab");
      b.id = "tab-" + n + "-" + i;
      b.setAttribute("aria-controls", p.id);
      b.textContent = p.getAttribute("data-label");
      b.className = "h-10 px-4 text-sm font-medium text-muted-foreground border-b-2 border-transparent aria-selected:text-foreground aria-selected:border-primary";
      b.addEventListener("click", function () { select(i, true); });
      b.addEventListener("keydown", function (e) {
        var k = e.key, j = i;
        if (k === "ArrowRight") j = (i + 1) % tabs.length;
        else if (k === "ArrowLeft") j = (i + tabs.length - 1) % tabs.length;
        else if (k === "Home") j = 0;
        else if (k === "End") j = tabs.length - 1;
        else return;
        e.preventDefault();
        select(j, true);
      });
      list.appendChild(b);
      p.setAttribute("role", "tabpanel");
      p.setAttribute("aria-labelledby", b.id);
      return b;
    });
    function select(i, focus) {
      var saved;
      tabs.forEach(function (t, j) {
        t.setAttribute("aria-selected", j === i ? "true" : "false");
        t.tabIndex = j === i ? 0 : -1;
        panels[j].hidden = j !== i;
      });
      if (focus) tabs[i].focus();
      try { saved = panels[i].getAttribute("data-runtime"); localStorage.setItem("ui8kit-runtime", saved); } catch (e) {}
    }
    box.insertBefore(list, box.firstChild);
    var want = 0;
    try { var r = localStorage.getItem("ui8kit-runtime"); panels.forEach(function (p, i) { if (p.getAttribute("data-runtime") === r) want = i; }); } catch (e) {}
    select(want, false);
  });

  // ---- copy buttons
  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.hidden = false;
    btn.addEventListener("click", function () {
      var src = document.getElementById(btn.getAttribute("data-copy"));
      if (!src) return;
      var text = src.textContent || "";
      var done = function () {
        var old = btn.textContent;
        btn.textContent = "Copied";
        setTimeout(function () { btn.textContent = old; }, 1500);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () {});
      else {
        var ta = document.createElement("textarea");
        ta.value = text; document.body.appendChild(ta); ta.select();
        try { document.execCommand("copy"); done(); } catch (e) {}
        document.body.removeChild(ta);
      }
    });
  });

  // ---- search
  var form = document.getElementById("search");
  if (!form) return;
  var input = document.getElementById("search-input");
  var out = document.getElementById("search-results");
  var data = null, loading = null;
  function load() {
    if (data) return Promise.resolve(data);
    if (!loading) loading = fetch(form.getAttribute("data-index")).then(function (r) { return r.json(); }).then(function (j) { data = j; return j; });
    return loading;
  }
  function esc(s) { return s.replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function run() {
    var q = input.value.trim().toLowerCase();
    if (!q) { out.hidden = true; out.innerHTML = ""; return; }
    load().then(function (items) {
      var toks = q.split(/\s+/);
      var hits = [];
      items.forEach(function (it) {
        var hay = (it.t + " " + it.n + " " + it.k + " " + it.c + " " + it.d).toLowerCase();
        var score = 0;
        for (var i = 0; i < toks.length; i++) {
          if (hay.indexOf(toks[i]) < 0) return;
          score += it.n.indexOf(toks[i]) === 0 ? 3 : it.t.toLowerCase().indexOf(toks[i]) >= 0 ? 2 : 1;
        }
        hits.push([score, it]);
      });
      hits.sort(function (a, b) { return b[0] - a[0] || (a[1].n < b[1].n ? -1 : 1); });
      hits = hits.slice(0, 12);
      out.innerHTML = hits.length
        ? hits.map(function (h) { var it = h[1]; return '<li><a class="block px-4 py-2 text-sm hover:bg-accent" href="' + esc(it.u) + '"><span class="font-medium">' + esc(it.t) + '</span> <span class="text-muted-foreground">' + esc(it.k) + " / " + esc(it.c) + "</span></a></li>"; }).join("")
        : '<li class="px-4 py-2 text-sm text-muted-foreground">No results</li>';
      out.hidden = false;
    });
  }
  form.addEventListener("submit", function (e) { e.preventDefault(); run(); });
  input.addEventListener("input", run);
  input.addEventListener("focus", load);
  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && document.activeElement !== input && !/INPUT|TEXTAREA/.test((document.activeElement || {}).tagName || "")) { e.preventDefault(); input.focus(); }
    if (e.key === "Escape") { out.hidden = true; }
  });
})();
