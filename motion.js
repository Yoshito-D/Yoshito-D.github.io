// Animate each section once as it enters the viewport, without hiding content.
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

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('motion-enter');
      observer.unobserve(entry.target);
    }
  }, { threshold: 0.08 });

  document.querySelectorAll('[data-motion], .site-header, .section-heading, .project-card, .year-group > h3, .work-category > h2, .detail > h1, .detail-media, .detail-section, footer')
    .forEach((element) => observer.observe(element));

  preference.addEventListener('change', (event) => {
    if (!event.matches) return;
    observer.disconnect();
    document.querySelectorAll('.motion-enter').forEach((element) => {
      element.classList.remove('motion-enter');
    });
  });
})();
