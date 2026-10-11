// Colour mode (system/light/dark) and skin: sets html.dark and data-skin from localStorage before first paint (loaded
// synchronously in <head>, same-origin file, so a CSP of script-src 'self' is enough), then wires the two header selects.
(function () {
  var d = document.documentElement, M = "ui8kit-theme", S = "ui8kit-skin", mq = matchMedia("(prefers-color-scheme: dark)");
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function apply() {
    var t = get(M), s = get(S);
    d.classList.toggle("dark", t === "dark" || (t !== "light" && mq.matches));
    if (s && /^[a-z0-9-]+$/.test(s)) d.setAttribute("data-skin", s); else d.removeAttribute("data-skin");
  }
  d.classList.add("js");
  apply();
  mq.addEventListener("change", apply);
  addEventListener("storage", apply);
  document.addEventListener("DOMContentLoaded", function () {
    [["theme-select", M, "system"], ["skin-select", S, ""]].forEach(function (c) {
      var el = document.getElementById(c[0]);
      if (!el) return;
      el.value = get(c[1]) || c[2];
      if (el.selectedIndex < 0) el.value = c[2];
      el.addEventListener("change", function () { put(c[1], el.value); apply(); });
    });
  });
})();
