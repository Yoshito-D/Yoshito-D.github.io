// Static tags and achievements remain available without JavaScript.
(() => {
  const form = document.querySelector('.work-filters');
  if (!form) return;
  const cards = [...document.querySelectorAll('.project-card')];
  const count = form.querySelector('.filter-count');
  const empty = document.querySelector('.filter-empty');
  const apply = () => {
    const values = new FormData(form);
    let visible = 0;
    for (const card of cards) {
      const dimension = values.get('dimension');
      const genre = values.get('genre');
      const achievement = values.get('achievement');
      const matches = (!dimension || card.dataset.dimension === dimension)
        && (!genre || card.dataset.genre === genre)
        && (!achievement || (achievement === 'vote' ? card.dataset.achievement !== 'none' : card.dataset.achievement === 'award'));
      card.hidden = !matches;
      if (matches) visible++;
    }
    document.querySelectorAll('.year-group, .work-category').forEach(group => {
      group.hidden = ![...group.querySelectorAll('.project-card')].some(card => !card.hidden);
    });
    // Recalculate stagger positions after a row changes.
    document.querySelectorAll('.featured-grid').forEach(grid => {
      let rowTop;
      let position = 0;
      [...grid.querySelectorAll('.project-card')].filter(card => !card.hidden).forEach(card => {
        if (card.offsetTop !== rowTop) { rowTop = card.offsetTop; position = 0; }
        card.style.setProperty('--motion-delay', Math.min(position++, 3) * 100 + 'ms');
      });
    });
    count.textContent = visible + ' / ' + cards.length + '作品を表示';
    empty.hidden = visible !== 0;
  };
  form.addEventListener('change', apply);
  form.addEventListener('submit', event => event.preventDefault());
  form.addEventListener('reset', () => setTimeout(apply, 0));
  apply();
  form.hidden = false;
})();
