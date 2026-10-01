// Short, silent gameplay previews. Empty URLs leave the image untouched.
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const hoverPointer = window.matchMedia('(hover: hover) and (pointer: fine)');
const previews = [];

document.querySelectorAll('.project-link').forEach((card) => {
  const media = card.querySelector('[data-preview]');
  const source = media?.dataset.preview?.trim();
  if (!source) return;

  const video = document.createElement('video');
  video.className = 'preview-video';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'none';
  video.setAttribute('aria-hidden', 'true');
  video.tabIndex = -1;
  media.append(video);

  let active = false;
  let generation = 0;
  let timeout;
  const stop = () => {
    active = false;
    generation += 1;
    clearTimeout(timeout);
    video.pause();
    media.classList.remove('is-previewing');
  };
  const start = async () => {
    if (active || reducedMotion.matches || document.hidden) return;
    active = true;
    const current = ++generation;
    if (!video.getAttribute('src')) video.src = source;
    try {
      if (video.readyState > 0) video.currentTime = 0;
      await video.play();
      if (!active || current !== generation) {
        if (!active) video.pause();
        return;
      }
      media.classList.add('is-previewing');
      timeout = setTimeout(stop, 5000);
    } catch {
      if (current === generation) stop();
    }
  };
  card.addEventListener('pointerenter', () => {
    if (hoverPointer.matches) start();
  });
  card.addEventListener('pointerleave', stop);
  card.addEventListener('focus', start);
  card.addEventListener('blur', stop);
  card.addEventListener('click', stop);
  video.addEventListener('ended', stop);
  video.addEventListener('error', stop);
  previews.push(stop);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) previews.forEach((stop) => stop());
});
reducedMotion.addEventListener('change', () => previews.forEach((stop) => stop()));
