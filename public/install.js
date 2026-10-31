(() => {
  const button = document.getElementById('install-button');
  const standalone = window.matchMedia('(display-mode: standalone)');
  let pendingPrompt;

  window.addEventListener('beforeinstallprompt', event => {
    if (standalone.matches) return;
    event.preventDefault();
    pendingPrompt = event;
    button.hidden = false;
  });

  button.addEventListener('click', async () => {
    if (!pendingPrompt) return;
    const prompt = pendingPrompt;
    pendingPrompt = undefined;
    button.hidden = true;
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch (error) {
      console.warn('Installazione non disponibile. Usa il menu di Chrome per installare la dashboard.', error);
    }
  });

  const hideInstall = () => {
    pendingPrompt = undefined;
    button.hidden = true;
  };
  window.addEventListener('appinstalled', hideInstall);
  standalone.addEventListener('change', event => { if (event.matches) hideInstall(); });
})();
