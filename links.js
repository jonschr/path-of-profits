(() => {
  if (new URLSearchParams(location.search).get('game') !== 'poe2') return;
  document.body.dataset.game = 'poe2';
  const tabs = document.querySelectorAll('.game-tab');
  tabs[0].classList.remove('is-active');
  tabs[0].removeAttribute('aria-current');
  tabs[1].classList.add('is-active');
  tabs[1].setAttribute('aria-current', 'true');
  document.querySelector('.top-nav-brand').href = 'currency-exchange-poe2.html';
  document.querySelector('.top-nav-links').innerHTML = [
    ['Triangle Arbitrage', 'currency-exchange-poe2.html'], ['Breachstone Flip', 'breachstone-flip.html'],
    ['Conversion Flips', 'conversions-poe2.html'], ['Links', 'links.html?game=poe2']
  ].map(([label, href]) => `<a class="top-nav-link${label === 'Links' ? ' is-active' : ''}" href="${href}"${label === 'Links' ? ' aria-current="page"' : ''}>${label}</a>`).join('');
})();
