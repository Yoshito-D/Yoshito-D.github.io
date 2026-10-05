// Draw flowing translucent ribbons on the GPU, without moving or repainting content.
(() => {
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
        vec3 color = vec3(.06667, .08235, .07843);
        color += .8 * fade * (vec3(.23, .40, .075) * (mist + folds)
                     + vec3(.38, .59, .16) * edges
                     + vec3(.025, .28, .19) * teal);
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
    if (previous) elapsed += Math.min((timestamp - previous) / 1000, .05) * .7;
    previous = timestamp;
    draw();
    frame = window.requestAnimationFrame(animate);
  };
  const update = () => {
    window.cancelAnimationFrame(frame);
    previous = 0;
    if (lost) return;
    draw();
    if (!preference.matches && !document.hidden) frame = window.requestAnimationFrame(animate);
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
  update();
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
