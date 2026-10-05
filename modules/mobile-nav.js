(() => {
  'use strict';
  const nav = document.querySelector('.top-nav');
  const inner = nav?.querySelector('.top-nav-inner');
  const menu = nav?.querySelector('.top-nav-center');
  if (!inner || !menu) return;
  const links = menu.querySelector('.top-nav-links');
  const game = document.body.dataset.game === 'poe2' || new URLSearchParams(location.search).get('game') === 'poe2' ? 'poe2' : 'poe1';
  const pages = game === 'poe2' ? [['Socket Extraction', 'socket-extraction.html'], ['Legacy Crafting', 'legacy-crafting.html']]
    : [['Unique Assembly', 'unique-assembly.html'], ['Runegrafts & Tattoos', 'recycling-flips.html']];
  function addPageLinks() {
    for (const [label, href] of pages) {
      if (window.SitePages && !window.SitePages.isLocalPreview() && !window.SitePages.allowsLink(href)) continue;
      const link = document.createElement('a');
      link.className = 'top-nav-link'; link.href = href; link.textContent = label;
      if (location.pathname.endsWith(`/${href}`)) { link.classList.add('is-active'); link.setAttribute('aria-current', 'page'); }
      const last = links?.querySelector('a[href^="links.html"]');
      if (last) last.before(link); else links?.append(link);
    }
    window.SitePages?.applyVisibility();
  }
  if (window.SitePages) window.SitePages.ready.then(addPageLinks); else addPageLinks();
  menu.id ||= 'primaryMobileMenu';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mobile-nav-toggle';
  button.setAttribute('aria-label', 'Open navigation');
  button.setAttribute('aria-controls', menu.id);
  button.setAttribute('aria-expanded', 'false');
  button.innerHTML = '<span class="mobile-nav-icon" aria-hidden="true"><i></i><i></i><i></i></span>';
  inner.append(button);
  nav.classList.add('has-mobile-menu');
  function setOpen(open) {
    nav.classList.toggle('is-menu-open', open);
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  }
  button.addEventListener('click', () => setOpen(button.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && nav.classList.contains('is-menu-open')) { setOpen(false); button.focus(); }
  });
  menu.addEventListener('click', (event) => { if (event.target.closest('a')) setOpen(false); });
  document.addEventListener('pointerdown', (event) => { if (!nav.contains(event.target)) setOpen(false); });
  window.matchMedia('(max-width: 720px)').addEventListener('change', () => setOpen(false));
})();
