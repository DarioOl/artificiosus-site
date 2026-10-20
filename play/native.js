// Pont avec l'appli Android (dossier android/). Dans un navigateur, window.AndroidApp n'existe pas et rien ne change.
(function () {
  const app = window.AndroidApp;
  window.Native = { on: !!app };
  if (!app) return;
  document.documentElement.classList.add('native');
  window.Native.version = app.version();

  // Encoche et barres système, en pixels CSS : remplacent env(safe-area-inset-*) que la WebView ne donne pas toujours.
  window.__androidInsets = (top, bottom) => {
    const s = document.documentElement.style;
    s.setProperty('--sat', top + 'px');
    s.setProperty('--sab', bottom + 'px');
  };
  const [top, bottom] = String(app.insets()).split(',').map(Number);
  window.__androidInsets(top || 0, bottom || 0);

  window.Native.vibrate = p => app.vibrate([].concat(p).join(','));
})();
