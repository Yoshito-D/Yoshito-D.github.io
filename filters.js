// Tag buttons require all selected tags. Content stays visible without JavaScript.
(() => {
  const filters = document.querySelector('.work-filters');
  if (!filters) return;
  const cards = [...document.querySelectorAll('.project-card')];
  const buttons = [...filters.querySelectorAll('[data-tag]')];
  const count = filters.querySelector('.filter-count');
  const reset = filters.querySelector('.filter-reset');
  const empty = document.querySelector('.filter-empty');
  const selected = new Set();
  const apply = () => {
    let visible = 0;
    for (const card of cards) {
      const tagElements = [...card.querySelectorAll('.project-tags li')];
      const tags = new Set(tagElements.map(tag => tag.textContent.trim()));
      const matches = [...selected].every(tag => tags.has(tag));
      tagElements.forEach(tag => tag.classList.toggle('is-selected', selected.has(tag.textContent.trim())));
      card.hidden = !matches;
      if (matches) visible++;
    }
    document.querySelectorAll('.work-category').forEach(group => {
      group.hidden = ![...group.querySelectorAll('.project-card')].some(card => !card.hidden);
    });
    buttons.forEach(button => button.setAttribute('aria-pressed', String(selected.has(button.dataset.tag))));
    reset.setAttribute('aria-disabled', String(selected.size === 0));
    count.textContent = visible + ' / ' + cards.length + '作品を表示';
    empty.hidden = visible !== 0;
    document.dispatchEvent(new Event("works-filter-change"));
  };
  buttons.forEach(button => button.addEventListener('click', () => {
    const tag = button.dataset.tag;
    if (selected.has(tag)) selected.delete(tag);
    else selected.add(tag);
    apply();
  }));
  reset.addEventListener('click', () => {
    if (!selected.size) return;
    selected.clear();
    apply();
  });
  filters.querySelector('.filter-options').open = window.matchMedia('(min-width: 36rem)').matches;
  apply();
  filters.hidden = false;
})();
