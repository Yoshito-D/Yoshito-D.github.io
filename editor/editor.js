(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const form = $('#content-form');
  const frame = $('#site-preview');
  const message = $('#message');
  let content, token, revision, savedFingerprint, selected = null;
  let page = 'index.html', busy = false, pendingPublish = false;
  let timer, previewJob = null, previewAgain = false, inputVersion = 0, draftedVersion = 0;
  let previewScroll = 0, messageTimer;
  const fingerprint = () => JSON.stringify(content);
  const currentProject = () => content.projects.find(project => project.id === selected);
  const element = (name, text, className) => {
    const node = document.createElement(name);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const notice = (text, failed = false, persistent = false) => {
    clearTimeout(messageTimer);
    message.textContent = text;
    message.classList.toggle('is-error', failed);
    message.hidden = false;
    if (!persistent) messageTimer = setTimeout(() => { message.hidden = true; }, 7000);
  };
  async function api(route, body, headers = {}) {
    const response = await fetch(`/api/${route}`, body === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Editor-Token': token, ...headers }, body: headers['Content-Type'] === 'application/octet-stream' ? body : JSON.stringify(body)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '通信できませんでした。');
    return result;
  }
  function updateStatus() {
    const dirty = fingerprint() !== savedFingerprint;
    $('#save').disabled = busy || (!dirty && !pendingPublish);
    $('#discard').disabled = busy || !dirty;
    $('#add-project').disabled = busy;
    $('#draft-status').textContent = busy ? '処理中…' : pendingPublish ? '保存済み・公開未完了' : dirty ? '変更あり・下書きを保存中' : '保存済み';
  }
  function renderList() {
    const list = $('#project-list');
    list.replaceChildren();
    $('#project-count').textContent = content.projects.length;
    const search = $('#project-search').value.trim().toLowerCase();
    const matches = content.projects.filter(project => `${project.title} ${project.genre} ${project.tags.join(' ')}`.toLowerCase().includes(search));
    for (const project of matches) {
      const button = element('button', undefined, 'editor-project-item');
      button.type = 'button';
      button.setAttribute('aria-pressed', String(selected === project.id));
      if (project.images[0]) { const image = element('img'); image.src = `/preview/${project.images[0].src}`; image.alt = ''; button.append(image); }
      else button.append(element('span', '', 'editor-project-placeholder'));
      const label = element('span', project.title || 'タイトル未入力');
      label.append(element('small', `${project.production} / ${project.year}${project.featured ? ' / 代表作品' : ''}`));
      button.append(label);
      button.addEventListener('click', () => choose(project.id));
      list.append(button);
    }
    if (!matches.length) list.append(element('p', '該当する作品はありません。', 'editor-help'));
    $('#select-profile').setAttribute('aria-pressed', String(selected === null));
    $('#preview-detail').disabled = selected === null || busy;
  }
  function renderTags() {
    const list = $('#tag-list');
    list.replaceChildren();
    const project = currentProject();
    if (!project) return;
    for (const tag of project.tags) {
      const button = element('button', `${tag} ×`);
      button.type = 'button';
      button.setAttribute('aria-label', `タグ「${tag}」を外す`);
      button.addEventListener('click', () => { project.tags = project.tags.filter(value => value !== tag); renderTags(); changed(); });
      list.append(button);
    }
  }
  function renderMedia() {
    const project = currentProject();
    if (!project) return;
    const list = $('#image-list');
    list.replaceChildren();
    $('#image-empty').hidden = project.images.length > 0;
    $('#image-upload').disabled = busy || project.images.length >= 20;
    project.images.forEach((image, index) => {
      const item = element('div', undefined, 'editor-image-item');
      const thumbnail = element('img'); thumbnail.src = `/preview/${image.src}`; thumbnail.alt = image.alt || `作品画像 ${index + 1}`;
      item.append(thumbnail, element('p', `${index + 1}枚目${index === 0 ? ' ・ カードのサムネイル' : ''}`, 'editor-image-title'));
      const label = element('label', `画像${index + 1}の説明`), input = element('input');
      input.type = 'text'; input.maxLength = 500; input.value = image.alt; input.disabled = busy;
      input.placeholder = '例：惑星をジャンプするゲーム画面';
      input.addEventListener('input', () => { image.alt = input.value; thumbnail.alt = input.value || `作品画像 ${index + 1}`; changed(); });
      label.append(input); item.append(label);
      const actions = element('div', undefined, 'editor-image-actions');
      for (const [text, direction] of [['↑ 前へ', -1], ['↓ 後ろへ', 1], ['外す', 0]]) {
        const button = element('button', text, 'editor-button secondary'); button.type = 'button';
        button.setAttribute('aria-label', `画像${index + 1}を${direction === -1 ? '前へ移動' : direction === 1 ? '後ろへ移動' : '外す'}`);
        button.disabled = busy || (direction === -1 && index === 0) || (direction === 1 && index === project.images.length - 1);
        button.addEventListener('click', () => {
          if (direction) [project.images[index], project.images[index + direction]] = [project.images[index + direction], project.images[index]];
          else project.images.splice(index, 1);
          renderMedia(); changed();
          const next = list.querySelectorAll('.editor-image-item')[Math.min(direction ? index + direction : index, project.images.length - 1)];
          (next?.querySelector('button:not(:disabled)') || $('#image-upload')).focus();
        });
        actions.append(button);
      }
      item.append(actions); list.append(item);
    });
    $('#clear-video').disabled = !project.video || busy;
    $('#video-status').textContent = project.video ? 'プレビュー動画を設定済みです。作品カードで確認できます。' : '動画は未設定です。';
  }
  function choose(id, changePage = true) {
    selected = id;
    const project = currentProject();
    $('#profile-fields').hidden = Boolean(project);
    $('#project-fields').hidden = !project;
    $('#form-title').textContent = project ? project.title || '新しい作品' : 'プロフィール';
    $('#form-eyebrow').textContent = project ? 'PROJECT' : 'PROFILE';
    const updated = project?.updatedAt || content.pageUpdatedAt.profile;
    $('#updated-status').textContent = `更新日：${updated.replace(/-/g, '/')}（保存時に自動更新）`;
    for (const field of form.querySelectorAll('[name]')) {
      if (field.name === 'tool') { field.checked = content.profile.tools.includes(field.value); field.disabled = Boolean(project) || busy; continue; }
      const [section, key] = field.name.split('.');
      const value = section === 'project' ? project?.[key] : section === 'profile' ? content.profile[key] : content[field.name];
      if (field.type === 'checkbox') field.checked = Boolean(value);
      else field.value = Array.isArray(value) ? value.join('\n') : value ?? '';
      field.disabled = busy || (section === 'project' ? !project : Boolean(project));
    }
    $('#tag-input').value = '';
    renderList(); renderTags(); renderMedia(); updateOrderButtons();
    if (changePage) setPage(project ? `projects/${project.id}.html` : 'index.html');
    document.dispatchEvent(new Event('works-filter-change'));
  }
  function setPage(value) {
    page = value;
    frame.src = `/preview/${page}?v=${inputVersion}`;
    previewScroll = 0;
    syncPreviewButtons();
  }
  function syncPreviewButtons() {
    document.querySelectorAll('[data-preview]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.preview === page || (button.dataset.preview === 'detail' && page.startsWith('projects/')))));
  }
  async function updatePreview() {
    clearTimeout(timer);
    if (previewJob) { previewAgain = true; return previewJob; }
    const version = inputVersion;
    const snapshot = structuredClone(content);
    previewJob = (async () => {
      try {
        await api('preview', { content: snapshot, revision });
        draftedVersion = version;
        if (version === inputVersion) {
          try { previewScroll = frame.contentWindow.scrollY; } catch { previewScroll = 0; }
          frame.src = `/preview/${page}?v=${version}`;
          if (!busy && fingerprint() !== savedFingerprint) $('#draft-status').textContent = '下書き保存済み';
        }
      } catch (cause) { if (!busy) $('#draft-status').textContent = cause.message; }
    })();
    await previewJob;
    previewJob = null;
    if (previewAgain && !busy) { previewAgain = false; return updatePreview(); }
  }
  function changed() {
    inputVersion++;
    updateStatus(); renderList();
    clearTimeout(timer);
    timer = setTimeout(updatePreview, 450);
  }
  function updateOrderButtons() {
    const project = currentProject();
    const group = project ? content.projects.filter(item => item.production === project.production && item.year === project.year) : [];
    const index = group.indexOf(project);
    $('#move-up').disabled = busy || index <= 0;
    $('#move-down').disabled = busy || index < 0 || index === group.length - 1;
  }
  function move(direction) {
    const project = currentProject();
    const group = content.projects.filter(item => item.production === project.production && item.year === project.year);
    const other = group[group.indexOf(project) + direction];
    if (!other) return;
    const a = content.projects.indexOf(project), b = content.projects.indexOf(other);
    [content.projects[a], content.projects[b]] = [content.projects[b], content.projects[a]];
    updateOrderButtons(); changed();
  }
  function addTag() {
    const project = currentProject();
    const values = $('#tag-input').value.split(/[,、\n]/).map(value => value.trim()).filter(Boolean);
    if (!project || !values.length) return;
    project.tags = [...new Set([...project.tags, ...values])];
    $('#tag-input').value = '';
    renderTags(); changed();
  }
  function setBusy(value) {
    busy = value;
    for (const control of document.querySelectorAll('button, input, textarea, select')) control.disabled = value;
    if (!value) choose(selected, false);
    updateStatus();
  }
  form.addEventListener('submit', event => event.preventDefault());
  form.addEventListener('input', event => {
    const field = event.target;
    if (!field.name || busy) return;
    if (field.name === 'tool') content.profile.tools = [...form.querySelectorAll('[name=tool]:checked')].map(checkbox => checkbox.value);
    else {
      const [section, key] = field.name.split('.');
      const value = field.type === 'checkbox' ? field.checked : key === 'achievements' ? field.value.split('\n').filter(line => line.trim()) : field.value;
      if (section === 'profile') content.profile[key] = value;
      else if (section === 'project') currentProject()[key] = value;
      else content[field.name] = value;
    }
    if (field.name === 'project.title') $('#form-title').textContent = field.value || '新しい作品';
    if (['project.production', 'project.year'].includes(field.name)) updateOrderButtons();
    changed();
  });
  $('#project-search').addEventListener('input', renderList);
  $('#select-profile').addEventListener('click', () => choose(null));
  $('#add-project').addEventListener('click', async () => {
    const project = { id: `work-${crypto.randomUUID().slice(0, 8)}`, title: '新しい作品', production: '個人制作', year: '3年次', dimension: '3D', genre: 'アクション', tags: [], description: '', environment: '', role: '', teamSize: '', duration: '', achievements: [], implementation: '', images: [], updatedAt: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date()), video: '', videoLink: '', featured: false };
    content.projects.push(project);
    selected = project.id;
    changed(); await updatePreview(); choose(project.id);
    form.elements.namedItem('project.title').focus(); form.elements.namedItem('project.title').select();
  });
  $('#add-tag').addEventListener('click', addTag);
  $('#tag-input').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); addTag(); } });
  $('#move-up').addEventListener('click', () => move(-1));
  $('#move-down').addEventListener('click', () => move(1));
  for (const kind of ['image', 'video']) {
    $(`#${kind}-upload`).addEventListener('change', async event => {
      const files = [...event.target.files];
      if (!files.length) return;
      const project = currentProject();
      if (kind === 'image' && project.images.length + files.length > 20) { notice('画像は1作品につき20枚まで登録できます。', true); event.target.value = ''; return; }
      const allowed = kind === 'image' ? ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'] : ['mp4'];
      if (files.some(file => !allowed.includes(file.name.split('.').pop().toLowerCase()) || file.size > (kind === 'image' ? 12 : 50) * 1024 * 1024)) { notice('対応する形式・ファイルサイズを確認してください。', true); event.target.value = ''; return; }
      setBusy(true);
      try {
        for (const file of files) {
          const extension = file.name.split('.').pop().toLowerCase();
          const result = await api('upload', await file.arrayBuffer(), { 'Content-Type': 'application/octet-stream', 'X-File-Extension': extension });
          if (kind === 'image') project.images.push({ src: result.path, alt: '' });
          else project.video = result.path;
          changed();
        }
        notice(kind === 'image' ? `${files.length}枚の画像を追加しました。` : '動画を設定しました。');
      } catch (cause) { notice(cause.message, true); }
      finally { event.target.value = ''; setBusy(false); await updatePreview(); }
    });
    if (kind === 'video') $('#clear-video').addEventListener('click', () => { currentProject().video = ''; renderMedia(); changed(); });
  }
  document.querySelectorAll('[data-preview]').forEach(button => button.addEventListener('click', async () => {
    await updatePreview(); setPage(button.dataset.preview === 'detail' ? `projects/${selected}.html` : button.dataset.preview);
  }));
  $('#preview-width').addEventListener('click', () => {
    const mobile = $('#preview-container').classList.toggle('is-mobile');
    $('#preview-width').setAttribute('aria-pressed', String(mobile));
    $('#preview-width').textContent = mobile ? 'PC表示' : 'スマホ表示';
  });
  $('#save').addEventListener('click', async () => {
    addTag();
    if (!form.reportValidity()) return;
    clearTimeout(timer);
    setBusy(true);
    previewAgain = false;
    if (previewJob) await previewJob;
    try {
      const result = await api('save', { content, revision });
      content = result.content; revision = result.revision;
      savedFingerprint = fingerprint(); pendingPublish = !result.published;
      notice(result.message, !result.published, true);
      frame.src = `/preview/${page}?v=${++inputVersion}`;
    } catch (cause) { notice(cause.message, true, true); }
    finally { setBusy(false); }
  });
  $('#discard').addEventListener('click', () => $('#discard-dialog').showModal());
  $('#cancel-discard').addEventListener('click', () => $('#discard-dialog').close());
  $('#confirm-discard').addEventListener('click', async () => {
    $('#discard-dialog').close();
    clearTimeout(timer);
    setBusy(true);
    previewAgain = false;
    if (previewJob) await previewJob;
    try {
      const result = await api('discard', {});
      content = result.content; revision = result.revision; savedFingerprint = fingerprint();
      if (selected && !currentProject()) selected = null;
      choose(selected); notice('保存済みの内容に戻しました。');
    } catch (cause) { notice(cause.message, true); }
    finally { setBusy(false); }
  });
  frame.addEventListener('load', () => {
    let doc;
    try {
      doc = frame.contentDocument;
      const location = frame.contentWindow.location.pathname.replace(/^\/preview\//, '');
      if (location === 'index.html' || location === 'works.html' || /^projects\/[a-z0-9-]+\.html$/.test(location)) page = location;
      syncPreviewButtons();
      if (previewScroll) { frame.contentWindow.scrollTo(0, previewScroll); previewScroll = 0; }
    } catch { return; }
    doc.addEventListener('click', event => {
      if (busy || !content) return;
      const target = event.target;
      const card = target.closest('.project-card');
      if (card) {
        event.preventDefault();
        const id = card.querySelector('a').getAttribute('href').match(/projects\/([a-z0-9-]+)\.html/)[1];
        choose(id); return;
      }
      let fieldName;
      if (page === 'index.html') {
        if (target.closest('#profile-title')) fieldName = 'profile.name';
        else if (target.closest('.reading')) fieldName = 'profile.reading';
        else if (target.closest('.role')) fieldName = 'profile.role';
        else if (target.closest('.profile-description')) fieldName = 'profile.description';
        else if (target.closest('.profile dd')) { const label = target.closest('dd').previousElementSibling.textContent; fieldName = 'profile.' + ({'所属':'school','卒業予定':'graduation','趣味':'hobby','Email':'email'}[label]); }
        if (fieldName) choose(null, false);
      } else if (page === 'works.html' && target.closest('.profile-description')) { choose(null, false); fieldName = 'worksIntro'; }
      else if (page.startsWith('projects/')) {
        const id = page.slice(9, -5);
        if (target.closest('.detail-video-section')) fieldName = 'project.videoLink';
        else if (target.closest('h1')) fieldName = 'project.title';
        else if (target.closest('.detail-section > p')) fieldName = 'project.description';
        else if (target.closest('.achievement-list')) fieldName = 'project.achievements';
        else if (target.closest('.implementation-copy, .empty-content')) fieldName = 'project.implementation';
        else if (target.closest('.profile dd')) { const label = target.closest('dd').previousElementSibling.textContent; fieldName = 'project.' + ({'開発環境':'environment','担当':'role','制作人数':'teamSize','開発期間':'duration'}[label]); }
        if (fieldName) choose(id, false);
      }
      if (fieldName) { event.preventDefault(); const field = form.elements.namedItem(fieldName); field?.focus(); }
    });
  });
  window.addEventListener('beforeunload', event => { if (content && inputVersion > draftedVersion && fingerprint() !== savedFingerprint) { event.preventDefault(); event.returnValue = ''; } });
  api('content').then(result => {
    content = result.content; token = result.token; revision = result.revision;
    pendingPublish = result.pendingPublish;
    savedFingerprint = JSON.stringify(result.savedContent);
    choose(null); updateStatus();
    if (result.hasDraft) notice('前回の下書きを復元しました。プレビューを確認してから公開できます。', false, true);
  }).catch(cause => { $('#draft-status').textContent = '読み込み失敗'; notice(`編集画面を開く.cmdから起動してください。\n${cause.message}`, true, true); });
})();
