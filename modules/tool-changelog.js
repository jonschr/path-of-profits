(() => {
  const dialog = document.getElementById('changelogDialog');
  const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  document.getElementById('openChangelog').addEventListener('click', async () => {
    dialog.showModal();
    try {
      const response = await fetch('changelog.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('Changelog unavailable.');
      const data = await response.json();
      document.getElementById('changelogContent').innerHTML = data.entries.map((entry) => `<article class="changelog-entry"><div class="changelog-meta"><span class="changelog-version">v${escape(entry.version)}</span><span>${escape(entry.date)}</span></div><ul class="changelog-list">${entry.changes.map((c) => `<li>${escape(c)}</li>`).join('')}</ul></article>`).join('');
    } catch (error) { document.getElementById('changelogContent').textContent = error.message; }
  });
  document.getElementById('closeChangelog').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
})();
