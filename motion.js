// Animate each section once as it enters the viewport, without hiding content.
(() => {
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (preference.matches || !('IntersectionObserver' in window)) return;

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('motion-enter');
      observer.unobserve(entry.target);
    }
  }, { threshold: 0.08 });

  document.querySelectorAll('[data-motion], .site-header, .profile-section, .section-heading, .project-card, .year-group > h3, .work-category > h2, .detail > h1, .detail-media, .detail-section, footer')
    .forEach((element) => observer.observe(element));

  preference.addEventListener('change', (event) => {
    if (!event.matches) return;
    observer.disconnect();
    document.querySelectorAll('.motion-enter').forEach((element) => {
      element.classList.remove('motion-enter');
    });
  });
})();
