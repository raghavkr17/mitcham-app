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
window.MITCHAM_API_BASE = "https://your-api.example.com";
