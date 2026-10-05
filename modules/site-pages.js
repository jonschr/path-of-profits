(() => {
  'use strict';
  const localHost = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(location.hostname);
  let pages = {};
  let localPreview = false;
  let view = 'public';

  function pageForLink(href) {
    if (!href || href.startsWith('#')) return null;
    const url = new URL(href, location.href);
    if (url.origin !== location.origin && url.hostname !== 'pathofprofits.com') return null;
    return url.pathname === '/' ? 'index.html' : url.pathname.endsWith('.html') ? decodeURIComponent(url.pathname.slice(1)) : null;
  }

  function allowsLink(href) {
    const page = pageForLink(href);
    return !page || (localPreview && view === 'all') || pages[page]?.published === true;
  }

  function publicHome() {
    const preferred = document.body.dataset.game === 'poe2' || location.pathname.includes('poe2') || location.pathname === '/breachstone-flip.html'
      ? 'currency-exchange-poe2.html' : 'index.html';
    return pages[preferred]?.published ? preferred : Object.keys(pages).find((page) => pages[page].published);
  }

  function applyVisibility() {
    for (const link of document.querySelectorAll('a[href]')) {
      const page = pageForLink(link.getAttribute('href'));
      link.classList.toggle('page-unavailable-link', !allowsLink(link.getAttribute('href')));
      if (page && link.classList.contains('top-nav-link')) {
        link.classList.toggle('local-only-link', localPreview && !pages[page]?.published);
        if (localPreview && !pages[page]?.published) link.title = 'Local-only page — excluded from publishing';
        else if (link.title === 'Local-only page — excluded from publishing') link.removeAttribute('title');
      }
    }
    const current = pageForLink(location.href);
    document.body.dataset.pageVisibility = pages[current]?.published ? 'published' : 'local-only';
    if ((!localPreview || view === 'public') && !pages[current]?.published) {
      const home = publicHome();
      if (home) location.replace(home);
    }
  }

  async function init() {
    if (localHost) {
      try {
        const response = await fetch('/api/local/pages', { cache: 'no-store' });
        if (response.ok) {
          const data = await response.json();
          if (data.available === true) {
            pages = data.pages;
            localPreview = true;
            view = document.cookie.split(';').some((part) => part.trim() === 'popPageView=public') ? 'public' : 'all';
          }
        }
      } catch (_) { /* Static previews use the published manifest below. */ }
    }
    if (!localPreview) {
      try {
        const response = await fetch('site-pages.json', { cache: 'no-store' });
        if (!response.ok) throw new Error('Page flags unavailable.');
        pages = await response.json();
      } catch (_) { /* Unknown pages stay hidden. */ }
    }
    if (localPreview) renderToolbar();
    applyVisibility();
  }

  function renderToolbar() {
    const current = pageForLink(location.href);
    const toolbar = document.createElement('div');
    toolbar.className = 'local-preview-toolbar';
    toolbar.setAttribute('aria-label', 'Local preview settings');
    toolbar.innerHTML = '<span>Local preview</span>'
      + '<label for="pageView">View <select id="pageView"><option value="all">All pages</option><option value="public">Public only</option></select></label>'
      + '<label for="pagePublication">This page <select id="pagePublication"><option value="true">Published</option><option value="false">Local only</option></select></label>'
      + '<span class="local-preview-feedback" role="status" aria-live="polite"></span>';
    document.querySelector('.site-header')?.after(toolbar);
    const viewSelect = toolbar.querySelector('#pageView');
    const publication = toolbar.querySelector('#pagePublication');
    const feedback = toolbar.querySelector('[role="status"]');
    function updateStatus(message) {
      publication.value = String(pages[current]?.published === true);
      publication.classList.toggle('is-published', pages[current]?.published === true);
      publication.classList.add('local-page-status');
      const published = Object.values(pages).filter((page) => page.published).length;
      feedback.textContent = message || `${published} published · ${Object.keys(pages).length - published} local only`;
    }
    viewSelect.value = view;
    updateStatus();
    viewSelect.addEventListener('change', () => {
      view = viewSelect.value;
      document.cookie = `popPageView=${view}; Path=/; Max-Age=31536000; SameSite=Lax`;
      applyVisibility();
    });
    publication.addEventListener('change', async () => {
      publication.disabled = true;
      feedback.textContent = 'Saving page flag…';
      try {
        const response = await fetch('/api/local/pages', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ page: current, published: publication.value === 'true' })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not save the page flag.');
        pages = data.pages;
        updateStatus('Saved · applies to the next publish');
        applyVisibility();
      } catch (error) {
        updateStatus(error.message);
      } finally { publication.disabled = false; }
    });
  }

  // The mobile menu waits for the flags before adding its extra page links.
  window.SitePages = { allowsLink, applyVisibility, isLocalPreview: () => localPreview, ready: init() };
})();
