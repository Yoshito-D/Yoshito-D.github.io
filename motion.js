// Prepare fades only outside the viewport; leave initially visible content alone.
(() => {
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (preference.matches || !('IntersectionObserver' in window)) return;

  // Stagger cards within each visible row.
  document.querySelectorAll('.featured-grid').forEach((grid) => {
    let rowTop;
    let position = 0;
    grid.querySelectorAll('.project-card').forEach((card) => {
      if (card.offsetTop !== rowTop) { rowTop = card.offsetTop; position = 0; }
      card.style.setProperty('--motion-delay', Math.min(position++, 3) * 100 + 'ms');
    });
  });
  document.querySelectorAll('.profile-section .reading, .profile-section h1').forEach((element) => element.setAttribute('data-motion', ''));
  document.querySelectorAll('.profile-section .role').forEach((element) => {
    element.setAttribute('data-motion', '');
    element.style.setProperty('--motion-delay', '100ms');
  });
  document.querySelectorAll('.profile-section > div + div').forEach((element) => {
    element.setAttribute('data-motion', '');
    element.style.setProperty('--motion-delay', '200ms');
  });

  const targets = [...document.querySelectorAll('[data-motion], .site-header, .section-heading, .project-card, .year-group > h3, .work-category > h2, .detail > h1, .detail-media, .detail-section, footer')];
  const outside = element => {
    const rect = element.getBoundingClientRect();
    return rect.bottom <= 0 || rect.top >= window.innerHeight;
  };
  const prepare = element => {
    // Filtering may temporarily hide an entire group; wait until it has layout.
    if (!element.getClientRects().length) return;
    if (outside(element)) {
      element.classList.remove('motion-enter');
      element.classList.add('motion-pending');
    } else if (element.classList.contains('motion-pending')) {
      element.classList.remove('motion-pending');
      element.classList.add('motion-enter');
    }
  };
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) prepare(entry.target);
  }, { threshold: 0 });
  targets.forEach(element => { prepare(element); observer.observe(element); });

  // Recheck synchronously after filtering, before the browser paints moved cards.
  const refresh = () => targets.forEach(prepare);
  document.addEventListener('works-filter-change', refresh);
  const focus = event => {
    targets.filter(element => element.contains(event.target)).forEach(element => {
      element.classList.remove('motion-pending', 'motion-enter');
    });
  };
  document.addEventListener('focusin', focus);
  preference.addEventListener('change', event => {
    if (!event.matches) return;
    observer.disconnect();
    document.removeEventListener('works-filter-change', refresh);
    document.removeEventListener('focusin', focus);
    targets.forEach(element => element.classList.remove('motion-pending', 'motion-enter'));
  });
})();
