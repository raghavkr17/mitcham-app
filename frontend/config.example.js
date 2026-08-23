/* =========================================================
   Mitcham — frontend config
   -----------------------------------------------------------
   Copy this file to config.js and set MITCHAM_API_BASE to your
   deployed API's URL (e.g. the Render service URL). config.js is
   loaded before api.js — once MITCHAM_API_BASE is set, api.js takes
   over from mock-api.js and "Sign in with Google" becomes a real
   OAuth login against your server, instead of the demo persona
   picker.

   config.js is gitignored on purpose: it's an environment-specific
   value, not app code. The GitHub Pages deploy workflow writes it
   from a repo variable at build time — see docs/DEPLOY.md.
   ========================================================= */
// This static GitHub Pages demo has no working backend deployed, so leave
// MITCHAM_API_BASE unset — mock-api.js then takes over and runs the app
// entirely client-side (localStorage), which is what actually works here.
// To point the app at a real backend later, uncomment the line below.
window.MITCHAM_API_BASE = "https://mitcham-api.onrender.com";
