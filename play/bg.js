// Fond animé en basse résolution pour l'effet pixel :
// fumée de poudre pour les menus, nuit étoilée pendant le jeu (fondu entre les deux).
(function () {
  const PIX = 4;
  const PALETTES = {
    normal:    ['#c9601c', '#45208a', '#120820'],
    pluie:     ['#5b7c99', '#1d3b5a', '#0f1820'],
    couvrefeu: ['#6b3fa0', '#2a1a4a', '#0d0a16'],
    voisin:    ['#4f9a3c', '#a3a02a', '#142010'],
    humides:   ['#1d8a8a', '#3d5a7a', '#0c1a1c'],
    final:     ['#ef4135', '#0055a4', '#141428'],
    brouillard: ['#8a8f9c', '#3e4454', '#15171c'],
    penurie:   ['#9c7a3c', '#4a3220', '#140e0a'],
    critique:  ['#b03a5a', '#3a1a3a', '#120812'],
    courte:    ['#d08a20', '#6a2a10', '#180a06'],
    taxe:      ['#c9a227', '#2f5a3a', '#0c140e'],
    orage:     ['#c8d8ff', '#2a2f6a', '#06081a'],
    jury:      ['#e0408a', '#5a1e7a', '#140820'],
    nuitnoire: ['#30305a', '#101028', '#030308'],
  };

  const canvas = document.getElementById('bg');
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
  if (!gl) { window.Bg = { setPalette() {}, setMode() {}, setHome() {}, kick() {} }; return; }

  const vs = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }';
  // En mediump (vraie demi-précision sur téléphone), le hash en sin() s'effondre : plus de fumée ni d'étoiles.
  const fs = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    uniform vec2 uRes;
    uniform float uTime, uSpin, uMix, uSky;
    uniform vec3 uC1, uC2, uC3;

    // Sans sin() et sur des coordonnées bornées : sur téléphone, le GPU calcule le coin d'une case un peu autrement
    // que la case voisine, et fract(sin(x) * 43758) grossit cet écart jusqu'à couper la fumée en blocs.
    float hash(vec2 p) {
      vec3 p3 = fract(vec3(mod(p, 289.0).xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    float fbm(vec2 p) {
      float v = 0.0, a = 0.5;
      for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
      return v;
    }
    // Accueil : le ciel de nuit (étoiles, lune) se voit par les trous de la fumée.
    vec3 gap() {
      vec2 fc = floor(gl_FragCoord.xy);
      vec3 col = uC3;
      float h = hash(fc);
      float h2 = hash(fc + 17.0);
      float tw = 0.7 + 0.3 * sin(uTime * (0.25 + h2 * 0.4) + h2 * 90.0);
      col += step(0.9984, h) * tw * (0.35 + 0.25 * h2) * mix(vec3(0.75, 0.75, 0.95), vec3(1.0, 0.85, 0.55), step(0.5, h2));
      vec2 mc = vec2(uRes.x * 0.16, uRes.y * 0.935);
      float r = max(5.0, uRes.y * 0.036);
      float d = length(fc + 0.5 - mc);
      if (d < r) {
        col = vec3(0.93, 0.88, 0.76);
        if (length(fc + 0.5 - mc - vec2(r * 0.35, r * 0.15)) < r * 0.3) col = vec3(0.80, 0.75, 0.64);
        if (length(fc + 0.5 - mc + vec2(r * 0.3, r * 0.35)) < r * 0.2) col = vec3(0.80, 0.75, 0.64);
      } else if (d < r * 2.6) {
        col += vec3(0.10, 0.08, 0.10) * (1.0 - (d - r) / (r * 1.6));
      }
      return col;
    }
    // Fumée de poudre : volutes en aplats qui montent, éclairées par le bas.
    vec3 smoke() {
      vec2 uv = gl_FragCoord.xy / uRes.y * 2.6;
      float t = uTime;
      vec2 q = vec2(fbm(uv + vec2(0.0, -t * 0.12)), fbm(uv + vec2(5.2, 1.3) - t * 0.08));
      float v = fbm(uv + 2.2 * q + vec2(uSpin * 1.5, -t * 0.22));
      v = clamp((v - 0.3) * 2.0, 0.0, 1.0) + 0.3 * (0.4 - gl_FragCoord.y / uRes.y);
      vec3 col = uC3;
      if (uSky > 0.01) col = mix(col, gap(), uSky);
      col = mix(col, uC2, smoothstep(0.44, 0.46, v));
      col = mix(col, uC1, smoothstep(0.8, 0.82, v));
      return col;
    }

    vec3 night() {
      vec2 fc = floor(gl_FragCoord.xy);
      float y = gl_FragCoord.y / uRes.y;
      vec3 col = mix(vec3(0.16, 0.09, 0.28), vec3(0.02, 0.02, 0.09), smoothstep(0.0, 1.0, y));
      col = mix(col, uC2 * 0.45, 0.15);
      float band = abs(gl_FragCoord.x / uRes.x * 0.8 + y - 1.15);
      col += vec3(0.09, 0.07, 0.15) * smoothstep(0.22, 0.0, band) * (0.55 + 0.45 * hash(floor(fc / 3.0)));
      float h = hash(fc), h2 = hash(fc + 17.0);
      float tw = 0.65 + 0.35 * sin(uTime * (0.5 + h2 * 0.9) + h2 * 90.0);
      col += step(0.995, h) * tw * (0.45 + 0.45 * h2) * mix(vec3(0.85, 0.9, 1.0), vec3(1.0, 0.85, 0.55), step(0.8, h2));
      vec2 mc = vec2(uRes.x * 0.84, uRes.y * 0.68);
      float r = max(5.0, uRes.y * 0.032);
      float d = length(fc + 0.5 - mc);
      if (d < r) {
        col = vec3(0.72, 0.70, 0.62);
        if (length(fc + 0.5 - mc - vec2(r * 0.35, r * 0.15)) < r * 0.3) col = vec3(0.60, 0.58, 0.51);
        if (length(fc + 0.5 - mc + vec2(r * 0.3, r * 0.35)) < r * 0.2) col = vec3(0.60, 0.58, 0.51);
      } else if (d < r * 2.4) {
        col += vec3(0.07, 0.07, 0.05) * (1.0 - (d - r) / (r * 1.4));
      }
      return col;
    }

    void main() {
      vec3 col = uMix > 0.99 ? night() : uMix < 0.01 ? smoke() : mix(smoke(), night(), uMix);
      gl_FragColor = vec4(col, 1.0);
    }`;

  function shader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = {};
  for (const n of ['uRes', 'uTime', 'uSpin', 'uMix', 'uSky', 'uC1', 'uC2', 'uC3']) u[n] = gl.getUniformLocation(prog, n);

  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  let cur = PALETTES.normal.map(rgb), goal = cur;
  let spin = 0, spinSpeed = 0.04, time = 0, last = performance.now();
  let mixCur = 0, mixGoal = 0, skyCur = 0, skyGoal = 0;

  // Blocs d'un nombre entier de pixels de l'écran, et au moins ~240 lignes : sur un téléphone, 4 px CSS donnent un grain trop gros.
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const block = Math.max(1, Math.round(Math.min(PIX * dpr, innerHeight * dpr / 240)));
    canvas.width = Math.ceil(innerWidth * dpr / block);
    canvas.height = Math.ceil(innerHeight * dpr / block);
    canvas.style.width = canvas.width * block / dpr + 'px';
    canvas.style.height = canvas.height * block / dpr + 'px';
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  addEventListener('resize', resize);
  resize();

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt * (1 + spinSpeed * 6);
    spin += dt * spinSpeed;
    spinSpeed += (0.04 - spinSpeed) * Math.min(1, dt * 1.5);
    cur = cur.map((c, i) => c.map((v, j) => v + (goal[i][j] - v) * Math.min(1, dt * 2)));
    mixCur += (mixGoal - mixCur) * Math.min(1, dt * 3);
    if (Math.abs(mixGoal - mixCur) < 0.005) mixCur = mixGoal;
    skyCur += (skyGoal - skyCur) * Math.min(1, dt * 3);
    if (Math.abs(skyGoal - skyCur) < 0.005) skyCur = skyGoal;
    gl.uniform2f(u.uRes, canvas.width, canvas.height);
    gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uSpin, spin);
    gl.uniform1f(u.uMix, mixCur);
    gl.uniform1f(u.uSky, skyCur);
    gl.uniform3fv(u.uC1, cur[0]);
    gl.uniform3fv(u.uC2, cur[1]);
    gl.uniform3fv(u.uC3, cur[2]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.Bg = {
    setPalette(name) { goal = (PALETTES[name] || PALETTES.normal).map(rgb); },
    // 'menu' : tourbillon ; 'jeu' : nuit étoilée.
    setMode(mode) { mixGoal = mode === 'jeu' ? 1 : 0; },
    // Accueil : la lune et les étoiles apparaissent derrière la fumée.
    setHome(on) { skyGoal = on ? 1 : 0; },
    // Accélère le tourbillon (et le scintillement) un instant.
    kick(amount) { spinSpeed = Math.min(1.2, spinSpeed + amount); },
  };
})();
