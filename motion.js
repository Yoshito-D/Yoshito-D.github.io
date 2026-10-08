// Draw flowing translucent ribbons on the GPU, without moving or repainting content.
(() => {
  const defaults = { color: '#66c0f4', accentColor: '#2a475e', saturation: 100, brightness: 40, speed: 70 };
  let settings = { ...defaults };
  let refresh = () => {};
  const applySettings = value => {
    for (const key of ['color', 'accentColor']) {
      if (/^#[0-9a-f]{6}$/i.test(value?.[key])) settings[key] = value[key];
    }
    for (const [key, max] of [['saturation', 200], ['brightness', 100], ['speed', 200]]) {
      if (typeof value?.[key] === 'number' && Number.isFinite(value[key])) settings[key] = Math.max(0, Math.min(max, value[key]));
    }
    const rgb = color => color.slice(1).match(/../g).map(part => parseInt(part, 16));
    const style = document.body.style;
    style.setProperty('--aura-color-rgb', rgb(settings.color).join(','));
    style.setProperty('--aura-accent-rgb', rgb(settings.accentColor).join(','));
    style.setProperty('--aura-primary-opacity', settings.brightness / 100 * .22);
    style.setProperty('--aura-accent-opacity', settings.brightness / 100 * .20);
    style.setProperty('--aura-saturation', settings.saturation / 100);
    document.body.dataset.aura = JSON.stringify(settings);
    refresh();
  };
  try { applySettings(JSON.parse(document.body.dataset.aura || '{}')); } catch { applySettings(defaults); }
  document.addEventListener('aura-settings-change', event => applySettings(event.detail));
  const canvas = document.createElement('canvas');
  canvas.className = 'background-aura';
  canvas.setAttribute('aria-hidden', 'true');
  let gl;
  try {
    gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
  } catch { return; }
  if (!gl) return;

  const shader = (type, source) => {
    const result = gl.createShader(type);
    gl.shaderSource(result, source);
    gl.compileShader(result);
    if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
      gl.deleteShader(result);
      throw new Error('Aura shader unavailable');
    }
    return result;
  };
  let program;
  try {
    const vertex = shader(gl.VERTEX_SHADER, 'attribute vec2 position; void main(){gl_Position=vec4(position,0.,1.);}');
    const fragment = shader(gl.FRAGMENT_SHADER, `
      #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
      #else
      precision mediump float;
      #endif
      uniform vec2 resolution;
      uniform float time;
      uniform vec3 backgroundColor;
      uniform vec3 auraColor;
      uniform vec3 accentColor;
      uniform float saturation;
      uniform float brightness;
      float bell(float x) { return exp(-x * x); }
      void main() {
        vec2 uv = gl_FragCoord.xy / resolution;
        float aspect = resolution.x / resolution.y;
        vec2 p = (uv - .5) * vec2(aspect, 1.);
        p.y += .07 * sin(p.x * 4. + time * .09);
        float mist = 0.;
        float folds = 0.;
        float edges = 0.;
        float teal = 0.;
        for (int i = 0; i < 6; i++) {
          float n = float(i);
          float phase = n * 1.83;
          float bend = .24 * sin(p.y * 5.8 + time * .18 + phase)
                     + .12 * sin(p.y * 11.1 - time * .13 + phase * .7);
          float center = (n - 2.5) * .20 * min(aspect, 1.8) + bend;
          float width = .018 + .055 * (.5 + .5 * sin(p.y * 7. + time * .12 + phase));
          float d = p.x - center;
          float envelope = .25 + .75 * pow(.5 + .5 * sin(p.y * 6.3 - time * .16 + phase), 2.);
          float haze = exp(-d * d / .023) * envelope;
          float veil = bell((d - width * 1.2) / (width * 1.4)) * envelope;
          float edge = (bell(d / .007) + .28 * bell((d - width * 2.4) / .012)) * envelope;
          mist += haze * .065;
          folds += veil * .18;
          edges += edge * .20;
          teal += (haze * .07 + veil * .06) * (.5 + .5 * sin(phase));
        }
        float fade = smoothstep(0., .18, uv.y) * smoothstep(0., .16, 1. - uv.y);
        vec3 color = backgroundColor;
        vec3 light = auraColor * vec3(.605263, .677966, .46875) * (mist + folds)
                   + auraColor * edges + accentColor * teal;
        float luminance = dot(light, vec3(.2126, .7152, .0722));
        light = max(mix(vec3(luminance), light, saturation), vec3(0.));
        color += brightness * fade * light;
        // A tiny, stationary dither keeps dark gradients from forming visible bands.
        color += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - .5) / 255.;
        gl_FragColor = vec4(color, 1.);
      }
    `);
    program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Aura program unavailable');
  } catch {
    if (program) gl.deleteProgram(program);
    return; // Keep the static CSS glow and all existing UI motion working.
  }

  gl.useProgram(program);
  const vertices = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const resolution = gl.getUniformLocation(program, 'resolution');
  const time = gl.getUniformLocation(program, 'time');
  const background = gl.getUniformLocation(program, 'backgroundColor');
  const color = gl.getUniformLocation(program, 'auraColor');
  const accent = gl.getUniformLocation(program, 'accentColor');
  const saturation = gl.getUniformLocation(program, 'saturation');
  const brightness = gl.getUniformLocation(program, 'brightness');
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0;
  let previous = 0;
  let elapsed = 18;
  let lost = false;
  const draw = () => {
    gl.uniform1f(time, elapsed);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };
  const resize = () => {
    if (lost) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    // Soft light does not need device-pixel resolution; cap GPU work on large displays.
    const scale = Math.min(1, Math.sqrt(650000 / (width * height)));
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(resolution, canvas.width, canvas.height);
    draw();
  };
  const animate = timestamp => {
    if (previous) elapsed += Math.min((timestamp - previous) / 1000, .05) * settings.speed / 100;
    previous = timestamp;
    draw();
    frame = window.requestAnimationFrame(animate);
  };
  const update = () => {
    window.cancelAnimationFrame(frame);
    previous = 0;
    if (lost) return;
    draw();
    if (!preference.matches && !document.hidden && settings.speed > 0) frame = window.requestAnimationFrame(animate);
  };
  refresh = () => {
    if (lost) return;
    const rgb = value => new Float32Array(value.slice(1).match(/../g).map(part => parseInt(part, 16) / 255));
    gl.uniform3fv(background, rgb(getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()));
    gl.uniform3fv(color, rgb(settings.color));
    gl.uniform3fv(accent, rgb(settings.accentColor));
    gl.uniform1f(saturation, settings.saturation / 100);
    gl.uniform1f(brightness, settings.brightness / 50);
    update();
  };
  canvas.addEventListener('webglcontextlost', () => {
    lost = true;
    window.cancelAnimationFrame(frame);
    canvas.remove(); // Reveal the static fallback if the GPU becomes unavailable.
  });
  document.body.prepend(canvas);
  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', update);
  preference.addEventListener('change', update);
  resize();
  refresh();
})();

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

// Restart a short, damped swing on each new interaction with a wire sign.
(() => {
  const cards = [...document.querySelectorAll('.project-card-wire')];
  if (!cards.length) return;
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const active = new Map();
  const steps = [[0, 0], [.14, -5], [.36, 2.5], [.58, -1], [.8, .3], [1, 0]];
  const cancel = () => {
    active.forEach(animations => animations.forEach(animation => animation.cancel()));
    active.clear();
  };
  for (const card of cards) {
    const link = card.querySelector('.project-link');
    if (!link?.animate) continue;
    const targets = [link, ...card.querySelectorAll('.card-wire')];
    const start = () => {
      if (preference.matches || document.hidden || card.hidden) return;
      let animations = [];
      try {
        const initial = targets.map(target => getComputedStyle(target).transform);
        active.get(card)?.forEach(animation => animation.cancel());
        targets.forEach((target, index) => {
          animations.push(target.animate(steps.map(([offset, angle]) => ({
            offset, transform: offset === 0 ? initial[index] : `rotate(${angle}deg)`, easing: 'ease-in-out'
          })), { duration: 1400, iterations: 1 }));
        });
        active.set(card, animations);
        Promise.allSettled(animations.map(animation => animation.finished)).then(() => {
          if (active.get(card) === animations) active.delete(card);
        });
      } catch {
        animations.forEach(animation => animation.cancel());
        active.get(card)?.forEach(animation => animation.cancel());
        active.delete(card);
      }
    };
    // The stationary article prevents its moving edges from retriggering hover.
    card.addEventListener('pointerenter', start);
    link.addEventListener('pointerdown', event => { if (event.pointerType !== 'mouse') start(); });
    link.addEventListener('focus', start);
  }
  preference.addEventListener('change', event => { if (event.matches) cancel(); });
  window.addEventListener('pagehide', cancel);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
  document.addEventListener('works-filter-change', cancel);
})();

// Prepare fades only outside the viewport; leave initially visible content alone.
(() => {
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (preference.matches) return;
  document.querySelectorAll('.profile-section .reading, .profile-section h1').forEach((element) => element.setAttribute('data-motion', ''));
  document.querySelectorAll('.profile-section .role').forEach((element) => {
    element.setAttribute('data-motion', '');
  });
  document.querySelectorAll('.profile-section > div + div').forEach((element) => {
    element.setAttribute('data-motion', '');
  });

  const targets = [...document.querySelectorAll('[data-motion], .profile-section .eyebrow, .back-link, .all-works-link, .section-heading, .project-card, .year-group > h3, .work-category > h2, .detail > h1, .detail-media, .detail-section, footer')];
  const grids = [...document.querySelectorAll('.featured-grid')];
  let active = true;
  let frame = 0;
  let observer;
  let layoutObserver;
  const show = element => element.classList.remove('motion-pending', 'motion-enter');
  const stop = () => {
    active = false;
    targets.forEach(show);
    window.cancelAnimationFrame(frame);
    frame = 0;
    observer?.disconnect();
    layoutObserver?.disconnect();
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('pageshow', restore);
    document.removeEventListener('load', schedule, true);
    document.removeEventListener('visibilitychange', restore);
    document.removeEventListener('works-filter-change', restore);
    document.removeEventListener('focusin', focus);
    preference.removeEventListener('change', reduce);
  };
  const refresh = () => {
    frame = 0;
    if (!active) return;
    try {
      // Read layout before changing classes. Also ignore entrance shifts on ancestors.
      const shifts = new Map();
      const states = targets.map(element => {
        if (!element.getClientRects().length || element.contains(document.activeElement)) return [element, null];
        const rect = element.getBoundingClientRect();
        let shift = 0;
        for (let parent = element; parent; parent = parent.parentElement) {
          if (!parent.classList.contains('motion-enter')) continue;
          if (!shifts.has(parent)) {
            const transform = getComputedStyle(parent).transform;
            shifts.set(parent, transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m42);
          }
          shift += shifts.get(parent);
        }
        return [element, rect.bottom - shift <= 0 || rect.top - shift >= window.innerHeight];
      });
      // Keep the shared 100ms row stagger correct after resizing or filtering.
      grids.forEach(grid => {
        let rowTop;
        let position = 0;
        grid.querySelectorAll('.project-card').forEach(card => {
          if (!card.getClientRects().length) return;
          if (card.offsetTop !== rowTop) { rowTop = card.offsetTop; position = 0; }
          card.style.setProperty('--motion-delay', Math.min(position++, 3) * 100 + 'ms');
        });
      });
      states.forEach(([element, outside]) => {
        if (outside === null) show(element);
        else if (outside) {
          element.classList.remove('motion-enter');
          element.classList.add('motion-pending');
        } else if (element.classList.contains('motion-pending')) {
          element.classList.remove('motion-pending');
          element.classList.add('motion-enter');
        }
      });
    } catch {
      stop(); // A failed enhancement must never leave the page invisible.
    }
  };
  const schedule = () => {
    try {
      if (active && !frame) frame = window.requestAnimationFrame(refresh);
    } catch {
      stop();
    }
  };
  const restore = () => {
    window.cancelAnimationFrame(frame);
    refresh();
  };
  const focus = event => {
    targets.filter(element => element.contains(event.target)).forEach(show);
  };
  const reduce = event => { if (event.matches) stop(); };
  try {
    // threshold: 0 can report an edge touch and then miss the first visible pixel.
    // Scroll/layout events are authoritative; observer notifications are extra hints.
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('pageshow', restore);
    document.addEventListener('load', schedule, true);
    document.addEventListener('visibilitychange', restore);
    document.addEventListener('works-filter-change', restore);
    document.addEventListener('focusin', focus);
    preference.addEventListener('change', reduce);
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(schedule, { threshold: 0 });
      targets.forEach(element => observer.observe(element));
    }
    if ('ResizeObserver' in window) {
      layoutObserver = new ResizeObserver(schedule);
      layoutObserver.observe(document.body);
      targets.forEach(element => layoutObserver.observe(element));
    }
    refresh();
  } catch {
    stop();
  }
})();
