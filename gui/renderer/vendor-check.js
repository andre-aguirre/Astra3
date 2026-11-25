"use strict";
// Says what is wrong, instead of leaving a blank window, when the libraries
// that scripts/vendor-deps.sh fetches are missing from renderer/vendor/.
window.addEventListener("load", function () {
  setTimeout(function () {
    if (window.React && window.ReactDOM) return;
    document.getElementById("root").innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;height:100vh;' +
      'flex-direction:column;gap:12px;font-family:sans-serif;color:#EDEFF2;background:#0F1216;">' +
      '<div style="font-size:16px;font-weight:600;">Astra3 could not load its interface</div>' +
      '<div style="font-size:13px;color:#A7AFBC;max-width:420px;text-align:center;">' +
      "Required scripts are missing from renderer/vendor/. Run " +
      '<code style="background:#1D222A;padding:2px 6px;border-radius:4px;">scripts/vendor-deps.sh</code> ' +
      "once (with internet access), then relaunch Astra3.</div></div>";
  }, 800);
});
