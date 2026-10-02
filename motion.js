// Hide navigation on downward scrolling and reveal it on upward scrolling.
(() => {
  const header = document.querySelector('.site-header');
  if (!header) return;
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let previous = Math.max(0, window.scrollY);
  let direction = 0;
  let distance = 0;
  window.addEventListener('scroll', () => {
    const current = Math.max(0, window.scrollY);
    const delta = current - previous;
    previous = current;
    if (preference.matches || current <= header.offsetHeight) {
      header.classList.remove('is-scroll-hidden');
      distance = 0;
      return;
    }
    if (!delta) return;
    const nextDirection = Math.sign(delta);
    if (nextDirection !== direction) distance = 0;
    direction = nextDirection;
    distance += Math.abs(delta);
    if (distance >= 6) {
      header.classList.toggle('is-scroll-hidden', direction > 0 && !header.contains(document.activeElement));
    }
  }, { passive: true });
  header.addEventListener('focusin', () => header.classList.remove('is-scroll-hidden'));
  preference.addEventListener('change', () => header.classList.remove('is-scroll-hidden'));
})();

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
  });
  document.querySelectorAll('.profile-section > div + div').forEach((element) => {
    element.setAttribute('data-motion', '');
  });

  const targets = [...document.querySelectorAll('[data-motion], .profile-section .eyebrow, .back-link, .all-works-link, .section-heading, .project-card, .year-group > h3, .work-category > h2, .detail > h1, .detail-media, .detail-section, footer')];
  const outside = element => {
    const rect = element.getBoundingClientRect();
    // Ignore the entrance translation when checking viewport boundaries.
    const transform = getComputedStyle(element).transform;
    const shift = transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m42;
    return rect.bottom - shift <= 0 || rect.top - shift >= window.innerHeight;
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
