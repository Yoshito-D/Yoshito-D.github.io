(() => {
  'use strict';
  document.querySelectorAll('[data-gallery]').forEach(gallery => {
    const slides = [...gallery.querySelectorAll('.gallery-slide')];
    if (slides.length < 2) return;
    const track = gallery.querySelector('.gallery-track');
    const controls = gallery.querySelector('.gallery-controls');
    let index = 0;
    function show(value) {
      index = (value + slides.length) % slides.length;
      track.style.transform = `translateX(-${index * 100}%)`;
      slides.forEach((slide, position) => {
        slide.setAttribute('aria-hidden', String(position !== index));
        slide.setAttribute('role', 'group');
        slide.setAttribute('aria-label', `${position + 1} / ${slides.length}`);
        if (position === index) slide.querySelector('img').loading = 'eager';
      });
      gallery.querySelector('.gallery-count').textContent = `${index + 1} / ${slides.length}`;
    }
    gallery.querySelector('[data-gallery-prev]').addEventListener('click', () => show(index - 1));
    gallery.querySelector('[data-gallery-next]').addEventListener('click', () => show(index + 1));
    controls.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      show(index + (event.key === 'ArrowRight' ? 1 : -1));
    });
    gallery.classList.add('is-ready');
    show(0);
    controls.hidden = false;
  });
})();
