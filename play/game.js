(function () {
  const R = window.Rules, A = window.Sfx, BG = window.Bg, L = window.I18n, M = window.Meta;
  const T = L.t;
  const { COLS, ROWS, TYPES } = R;
  const W = 360, H = 506, PIX = 2;
  const CELL = 56, GX = 12, GY = 8;
  const BAND_Y = GY + ROWS * CELL + 14;
  const WAVE_MS = 160, FALL_SPEED = 14;
  const FONT = '"Pixel", monospace';
  const OUTLINE = '#141c1e';
  const CHIPS = '#ff8f2e', MULT = '#e0408a', GOLD = '#f5c543';
  // Page de dons (vide : bouton caché). Le Play Store n'accepte un lien de don hors de sa facturation
  // que si le don ne donne rien en échange : ni contenu, ni succès, ni badge.
  const TIP_URL = 'https://ko-fi.com/darioolibet';
  // Démo de la version web du site : window.DEMO (nombre de soirées) est posé par tools/publish-web.ps1, jamais dans l'appli.
  const DEMO = !window.Native.on && window.DEMO > 0 ? window.DEMO : 0;
  const SITE_URL = 'https://dariool.github.io/artificiosus-site/';

  const $ = id => document.getElementById(id);
  const canvas = $('field');
  const ctx = canvas.getContext('2d');
  // Le monde est dessiné en basse résolution puis agrandi sans lissage : c'est ce qui donne les gros pixels.
  const buf = document.createElement('canvas');
  buf.width = W / PIX;
  buf.height = H / PIX;
  const b = buf.getContext('2d');
  b.imageSmoothingEnabled = false;
  // Traînées lumineuses façon photo en pose longue : les étincelles laissent une trace qui s'efface.
  const trail = document.createElement('canvas');
  trail.width = buf.width;
  trail.height = buf.height;
  const tg = trail.getContext('2d');
  let trailIdle = 0;
  const view = { scale: 1, ox: 0, oy: 0, dpr: 1 };
  // Hauteur dessinée du monde : H, ou plus sur un écran haut (voir resize).
  let HH = H;
  const cam = { zoom: 0, shake: 0, rot: 0 };

  const st = {
    phase: 'menu', round: 0, bag: null, perks: null, owned: null, levels: null, bosses: null,
    grid: null, score: 0, shown: 0, shots: 0, used: 0, refunds: 0, sel: null, anim: null, paused: false, token: 0,
    money: 0, shop: null, rerolls: 0, run: null, mod: null, carry: 0, reflex: false, endless: false, runDone: false,
    calibre: 1, locked: {}, sky: Math.random, skipMeteor: false, tools: [], tool: null,
  };
  // Les minuteries d'une soirée abandonnée (Recommencer, Menu principal) ne doivent rien toucher.
  function later(fn, ms) {
    const tk = st.token;
    setTimeout(() => { if (tk === st.token) fn(); }, ms);
  }
  // rings : ondes de choc ; pops : coques qui gonflent et blanchissent en éclatant ; tint : lueur de la couleur du dernier feu.
  // rockets / sky : fusées tirées dans le ciel derrière la grille et leurs étincelles.
  const fx = { particles: [], links: [], texts: [], meteors: [], rings: [], pops: [], rockets: [], sky: [], flash: 0, tint: '#ffffff', tintA: 0, cheer: 0, cheerText: '' };
  // Arrêt sur image : quelques centièmes de seconde figés sur les gros moments.
  let hitstop = 0;
  const freeze = ms => { if (!calm) hitstop = Math.max(hitstop, ms / 1000); };
  const scoreTick = { t: 0, k: 0 };
  const shock = (x, y, color, r0, r1, max) => { if (!calm) fx.rings.push({ x, y, color, r0, r1, life: 0, max }); };
  const rain = [];
  for (let i = 0; i < 60; i++) rain.push({ x: Math.random() * W, y: Math.random() * BAND_Y, v: 380 + Math.random() * 220 });
  // La foule : une rangée du fond (plus petite) puis celle de devant, vues de dos, en contre-jour. x en pixels du tampon.
  // Les silhouettes grandissent avec la hauteur de la bande sous la grille (crowdS), donc la foule est refaite quand l'écran change.
  // order : rang d'arrivée, la foule se remplit dans cet ordre (surtout devant d'abord).
  const crowd = [];
  let crowdS = 1;
  function layoutCrowd() {
    const bh = buf.height - art(BAND_Y);
    // Dans une bande basse (bandeau de boss, petit écran), les silhouettes restent grandes et sont coupées en bas : on voit têtes et épaules.
    crowdS = Math.max(1.5, Math.min(2.2, bh / 10));
    const s = crowdS, shown = crowdShown();
    crowd.length = 0;
    for (const back of [true, false]) {
      const step = back ? 5.6 * s * 0.65 : 7 * s;
      for (let x = back ? 2 : 2 + Math.random() * 3; x < buf.width - 1; x += step + Math.random() * 1.8 * s) {
        const r = Math.random();
        const look = back ? 'plain' : r < 0.09 ? 'hat' : r < 0.18 ? 'kid' : r < 0.32 ? 'phone' : r < 0.41 ? 'tail' : r < 0.5 ? 'bun' : r < 0.58 ? 'cap' : r < 0.66 ? 'long' : 'plain';
        crowd.push({ x: Math.round(x), back, look, p: Math.random() * 6, h: Math.floor(Math.random() * 3), slim: Math.random() < 0.35,
          arms: Math.random() < 0.6, rank: Math.random() + (back ? 0.6 : 0), vis: 0 });
      }
    }
    crowd.slice().sort((a, b) => a.rank - b.rank).forEach((c, i) => { c.order = i; c.vis = i < shown ? 1 : 0; });
  }
  // 1 silhouette par spectateur ; au-delà, chacun en plus allume un briquet au-dessus d'une tête.
  const crowdShown = () => (st.grid ? Math.min(crowd.length, st.crowd || 0) : 0);
  const lighters = () => (st.grid ? Math.max(0, (st.crowd || 0) - crowd.length) : 0);
  let crowdIcon = null;

  function bossId() { return st.bosses ? st.bosses[st.round] || null : null; }
  // shotNo : allumettes déjà craquées ce soir (Crescendo) ; folletPts/folletN : feux éteints mis de côté par le Feu follet.
  function mods() {
    const f = st.follet || {};
    return { ...st.perks, boss: bossId(), levels: st.levels, first: st.used === 0, shotNo: st.used, kinds: Object.keys(st.bag).length, run: st.mod,
      lantern: !!st.lantern, folletPts: f.pts || 0, folletN: f.n || 0, crowd: st.crowd || 0 };
  }
  const price = base => R.priceOf(base, st);
  let vibOn = localStorage.getItem('bf-vib') !== '0';
  const canVibrate = !!(window.Native.vibrate || navigator.vibrate);
  function vibrate(p) {
    if (!vibOn) return;
    if (window.Native.vibrate) window.Native.vibrate(p);
    else if (navigator.vibrate) try { navigator.vibrate(p); } catch (e) { /* refusé par le navigateur */ }
  }
  // Moins d'effets : ni secousses, ni zoom, ni flashs, ni ralenti.
  const calmSaved = localStorage.getItem('bf-calm');
  let calm = calmSaved ? calmSaved === '1' : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  document.body.classList.toggle('calm', calm);
  const kick = v => { if (!calm) BG.kick(v); };
  // Appli installée : Android laisse la zone de la caméra en noir ; le plein écran du navigateur la rend au jeu.
  // pointerup : au doigt, pointerdown ne compte pas comme un geste de l'utilisateur pour le plein écran.
  // Le navigateur n'autorise le son qu'après un geste : le premier toucher lance la musique du menu.
  const wakeAudio = () => { A.init(); A.startMusic(); };
  addEventListener('pointerup', wakeAudio, { capture: true, once: true });
  addEventListener('keydown', wakeAudio, { capture: true, once: true });
  // Dans l'appli Android, le son n'attend pas de geste et l'écran est déjà plein.
  if (window.Native.on) wakeAudio();
  else addEventListener('pointerup', () => {
    if (document.fullscreenElement || !document.documentElement.requestFullscreen) return;
    if (!matchMedia('(display-mode: fullscreen)').matches || innerHeight >= screen.height - 2) return;
    document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  }, true);
  const fmtNum = L.num;
  const typeName = id => L.entry('types', id).name;
  const typeDesc = id => L.entry('types', id).desc;
  const bossText = id => {
    const r = R.bossById(id).rules;
    return L.entry('bosses', id, { rain: r.wet ? Math.round(1 / r.wet) : 0, min: r.grumpy, waves: r.waves });
  };
  const isFinal = id => !!(id && R.bossById(id).final);
  const sacText = id => L.entry('sacs', id);
  const cap = s => s[0].toUpperCase() + s.slice(1);
  const art = v => Math.round(v / PIX);
  const atHome = () => document.body.classList.contains('at-home');
  const visible = id => !$(id).classList.contains('hidden');

  // ---------- Sprites pixel art ----------
  const ICONS = {
    petard:    ['...##...', '...##...', '...##...', '########', '########', '...##...', '...##...', '...##...'],
    fusee:     ['...##...', '..####..', '.######.', '########', '...##...', '...##...', '...##...', '...##...'],
    chandelle: ['........', '..#..#..', '.##..##.', '########', '########', '.##..##.', '..#..#..', '........'],
    soleil:    ['#..##..#', '.#.##.#.', '..####..', '########', '########', '..####..', '.#.##.#.', '#..##..#'],
    bombe:     ['..####..', '.#....#.', '#......#', '#..##..#', '#..##..#', '#......#', '.#....#.', '..####..'],
    etoile:    ['#......#', '##....##', '.##..##.', '...##...', '...##...', '.##..##.', '##....##', '#......#'],
    bengale:   ['...#....', '...##...', '..###...', '..####..', '.##.###.', '.#...##.', '.##..##.', '..####..'],
    ricochet:  ['.#....#.', '#......#', '.#....#.', '..#..#..', '...##...', '...##...', '..####..', '........'],
    miroir:    ['...##...', '..#.##..', '.#..###.', '#...####', '#...####', '.#..###.', '..#.##..', '...##...'],
    lente:     ['########', '.#....#.', '..#..#..', '...##...', '...##...', '..####..', '.######.', '########'],
    double:    ['..####..', '.#....#.', '.#....#.', '..####..', '..####..', '.#....#.', '.#....#.', '..####..'],
    sauteur:   ['...##...', '........', '...##...', '##.##.##', '##.##.##', '...##...', '........', '...##...'],
    cascade:   ['########', '########', '.#.#.#.#', '.#.#.#.#', '#.#.#.#.', '#.#.#.#.', '.#.#.#.#', '........'],
    brume:     ['..####..', '.##..##.', '.....##.', '....##..', '...##...', '...##...', '........', '...##...'],
  };
  const GLYPHS = {
    // Bouton Arsenal : trois fusées prêtes à partir.
    arsenal:   { w: '#fff3c4', y: GOLD, Y: '#a8821f', r: '#ff4d5e', R: '#a8323f', b: '#4db8ff', B: '#2a6fa8', s: '#3a2a50',
      rows: ['.....ww.....', '.....yy.....', '.ww..yy..ww.', '.rr..yy..bb.', '.rr..yy..bb.', '.rr.YYYY.bb.', '.rr..s...bb.', 'RRRR.s..BBBB', '..s..s....s.', '..s..s....s.', '..s.......s.', '..s.......s.'] },
    fiole:     { d: '#b07a44', g: '#7f9fb8', r: '#ff4d5e', y: GOLD, b: '#4db8ff', rows: ['..dddd..', '...gg...', '...gg...', '..gggg..', '.grrrrg.', 'gyyyyyyg', 'gbbbbbbg', '.gggggg.'] },
    ciel:      { y: GOLD, w: '#ffffff', rows: ['.y......', 'yyy...w.', '.y...www', '......w.', '..w.....', '.www..y.', '..w..yyy', '......y.'] },
    etincelle: { y: GOLD, w: '#fff3c4', rows: ['...y....', '...y....', '.y.w.y..', '..www...', 'yywwwyy.', '..www...', '.y.w.y..', '...y....'] },
    arcenciel: { r: MULT, y: GOLD, g: '#4bc292', b: CHIPS, rows: ['..rrrr..', '.rryyrr.', 'rryyyyrr', 'ryyggyyr', 'yggbbggy', 'ggb..bgg', 'gb....bg', 'b......b'] },
    sacre:     { o: '#ff7a1a', y: '#ffd23f', w: '#fff3c4', rows: ['...o....', '..oo....', '..ooo.o.', '.ooyooo.', '.oyyyoo.', 'ooywwyoo', '.oywwyo.', '..oooo..'] },
    meteore:   { p: '#a782d1', w: '#ffffff', rows: ['.......p', '......p.', '.....p..', '..pp....', '.pwwp...', '.pwwp...', '..pp....', '........'] },
    piece:     { d: '#a8741f', y: GOLD, w: '#fff3c4', rows: ['..dddd..', '.dyyyyd.', 'dywyyyyd', 'dywyyyyd', 'dyyyyyyd', 'dyyyyyyd', '.dyyyyd.', '..dddd..'] },
    pieces:    { d: '#a8741f', y: GOLD, w: '#fff3c4', rows: ['.dddd...', 'dywyyd..', 'dyyyyddd', '.dddydyy', '...dywyy', '...dyyyy', '....dddd', '........'] },
    allumette: { r: MULT, w: '#e0b070', d: '#8a5a2a', rows: ['......rr', '.....rrr', '....wrr.', '...wd...', '..wd....', '.wd.....', 'wd......', 'd.......'] },
    croix:     { r: MULT, w: '#ffffff', rows: ['rr....rr', 'rrr..rrr', '.rrrrrr.', '..rwwr..', '..rwwr..', '.rrrrrr.', 'rrr..rrr', 'rr....rr'] },
    cadenas:   { d: '#6b5a8f', g: '#b9addb', rows: ['..dddd..', '.d....d.', '.d....d.', 'gggggggg', 'gddddddg', 'gddggddg', 'gddddddg', 'gggggggg'] },
    goutte:    { b: '#6fb8ff', w: '#ffffff', d: '#2f5f9f', rows: ['...b....', '...bb...', '..bbbb..', '.bbbbbb.', '.bwbbbb.', '.bwbbbd.', '..bbbd..', '...dd...'] },
    lune:      { y: GOLD, d: '#a8821f', rows: ['..yyy...', '.yy.....', 'yy......', 'yy......', 'yy......', 'yyy...d.', '.yyyyyd.', '..yyyd..'] },
    voisin:    { s: '#f0c49a', d: '#3a2400', r: MULT, rows: ['.ssssss.', 'sdd..dds', 'ss.ss.ss', 'sd.ss.ds', 'ssssssss', 'ss.dd.ss', 'sdssssds', '.ssssss.'] },
    brouillard: { g: '#9aa3b5', w: '#dfe6f0', rows: ['........', '..ggg...', '.gwwwg..', 'gwwwwwgg', '........', '.ggggg..', 'gwwwwwwg', '.gggggg.'] },
    penurie:   { d: '#6b5a8f', g: '#b9addb', rows: ['dddddddd', 'd......d', 'd......d', 'd...g..d', 'd......d', 'd.g....d', 'd......d', 'dddddddd'] },
    critique:  { k: '#2a1a2a', w: '#ffffff', r: MULT, rows: ['.kkkkkk.', 'kwwkkwwk', 'kwkkkkwk', 'kkkkkkkk', 'kkkkkkkk', 'kkrrrrkk', 'krkkkkrk', '.kkkkkk.'] },
    courte:    { o: '#ff7a1a', y: '#ffd23f', d: '#8a5a2a', rows: ['....y...', '...yoy..', '....o...', '....d...', '....d...', '........', '........', '........'] },
    taxe:      { d: '#a8741f', y: GOLD, r: MULT, rows: ['..dddd..', '.dyyyyd.', 'dyrrrryd', 'dyyyyyyd', 'dyrrrryd', 'dyyyyyyd', '.dyyyyd.', '..dddd..'] },
    orage:     { b: '#c8d8ff', y: '#ffe25a', g: '#5a6b8f', rows: ['.gggggg.', 'gggggggg', '.gggggg.', '...yy...', '..yy....', '.yyyyy..', '....yy..', '...yy...'] },
    jury:      { y: GOLD, d: '#a8821f', rows: ['y.y..y.y', 'yyyyyyyy', '.yyyyyy.', '..dyyd..', '...yy...', '...yy...', '..yyyy..', '.yyyyyy.'] },
    nuitnoire: { w: '#dfe6f0', g: '#5a6b8f', rows: ['........', '.w......', '....g...', '........', '......w.', '..g.....', '........', '....w...'] },
    sac:       { d: '#7a4a1a', b: '#c98a4b', y: GOLD, rows: ['..d..d..', '...dd...', '..bbbb..', '.bbbbbb.', 'bbbyybbb', 'bbyyyybb', 'bbbyybbb', '.bbbbbb.'] },
    retour:    { y: GOLD, w: '#fff3c4', rows: ['...yy...', '..yyyy..', '.yy..yy.', 'yy....yy', '..y..y..', '..y..y..', '..yyyy..', '........'] },
    eco:       { g: '#4bc292', w: '#ffffff', rows: ['..gggg..', '.g....g.', 'g..ww..g', 'g.w....g', 'g.w....g', 'g..ww..g', '.g....g.', '..gggg..'] },
    joie:      { o: '#ff7a1a', y: '#ffd23f', r: MULT, rows: ['.o..o..o', '..o.o.o.', 'o.yyyy.o', '.yyrryy.', '.yrrrry.', 'yyrrrryy', '.yyyyyy.', 'dddddddd'], d: '#5a3a1a' },
    coeur:     { r: MULT, p: '#ff9ac8', rows: ['........', '.rr..rr.', 'rpprrrrr', 'rprrrrrr', 'rrrrrrrr', '.rrrrrr.', '..rrrr..', '...rr...'] },
    briquet:   { r: '#ff4d5e', g: '#c8ccd4', y: '#ffd23f', o: '#ff7a1a', rows: ['...yo...', '...oy...', '..gggg..', '..g..g..', '.rrrrrr.', '.rrrrrr.', '.rrrrrr.', '.rrrrrr.'] },
    pince:     { g: '#c8ccd4', d: '#6a707a', rows: ['g......g', '.g....g.', '..g..g..', '...gg...', '...dd...', '..d..d..', '.d....d.', 'd......d'] },
    renfort:   { b: '#4db8ff', r: '#ff4d5e', y: '#ffd23f', rows: ['........', '.r.yy.b.', '...yy...', '.yyyyyy.', '.yyyyyy.', '...yy...', '.b.yy.r.', '........'] },
    vent:      { w: '#dfe6f0', b: '#9ad0ff', rows: ['........', 'wwwww...', '.....w..', 'bbbbbbb.', '.......b', 'wwwwww..', '......w.', '........'] },
    secours:   { r: '#ff4d5e', w: '#f0c49a', g: '#5be37d', rows: ['.r....g.', '.rw..ggg', '..w...g.', '..w.....', '...w....', '...w....', '....w...', '....w...'] },
    dore:      { y: GOLD, d: '#a8821f', w: '#fff3c4', rows: ['..yyyy..', '.yddddy.', 'ydwyyydy', 'ydyyyydy', 'ydyyyydy', 'ydyyyydy', '.yddddy.', '..yyyy..'] },
    geant:     { p: '#ff7ad9', k: '#2a1030', w: '#ffffff', rows: ['.pppppppppp.', 'pkkkkkkkkkkp', 'pkkkkkwwwkkp', 'pkwkwkkkwkkp', 'pkkwkkwwwkkp', 'pkwkwkwkkkkp', 'pkkkkkwwwkkp', 'pkkkkkkkkkkp', '.pppppppppp.'] },
    brillant:  { w: '#ffffff', b: '#3d8bff', rows: ['...b....', '...b....', '..bwb...', 'bbwwwbb.', '..bwb...', '...b....', '...b....', '........'] },
    paquet:    { g: '#4fd1a5', d: '#2f8f6b', w: '#ffffff', y: GOLD, rows: ['.gggggg.', 'gdgggdgg', 'gggyyggg', 'yyyyyyyy', 'gggyyggg', 'gdgyygdg', 'gggyyggg', '.gggggg.'] },
    braise:    { o: '#ff7a1a', y: GOLD, r: '#c0392b', d: '#5d626c', rows: ['...y....', '..yoy...', '..oro.y.', '.orrro..', '.orrrro.', 'drrorrd.', 'ddrrrdd.', '.ddddd..'] },
    medaille:  { r: '#ff4d5e', b: '#4db8ff', y: GOLD, d: '#a8821f', rows: ['.rr.bb..', '.rr.bb..', '..rbb...', '..yyy...', '.yyyyy..', '.yydyy..', '.yyyyy..', '..yyy...'] },
    boule:     { w: '#ffffff', b: '#9ad0ff', d: '#5b8fc9', rows: ['..wwww..', '.wwwwbw.', 'wwwwwwbw', 'wwwwwwbb', 'wbwwwwbb', 'wwbwwbbd', '.wbbbbd.', '..bddd..'] },
    coupefeu:  { o: '#ff9a2e', y: GOLD, r: '#c0573e', d: '#7a3326', rows: ['.o......', 'oyo.rrdr', 'oyo.dddd', '.o..rdrr', '....dddd', '.o..rrdr', 'oyo.dddd', '.o..rdrr'] },
    cendres:   { g: '#8a8f99', d: '#5d626c', o: '#ff7a1a', y: '#ffd23f', rows: ['...g....', '..g.g...', '...g....', '....y...', '...yo...', '..dggd..', '.dggggd.', 'dddddddd'] },
    reflexe:   { y: '#ffe25a', w: '#ffffff', rows: ['....yy..', '...yy...', '..yy....', '.yyyyy..', '...yy...', '..yy....', '.yy.....', 'yy......'] },
    dorure:    { y: GOLD, w: '#fff3c4', d: '#a8821f', b: '#8a5a2a', rows: ['.....yyy', '....ywyy', '....yyyd', '...ddyd.', '..bd....', '.bb.....', 'bb......', 'b.......'] },
    gonfleur:  { p: '#ff7ad9', w: '#ffffff', d: '#b34d97', g: '#c8ccd4', rows: ['..pppp..', '.pwpppp.', '.pppppd.', '..pddd..', '...gg...', '...gg...', '.gggggg.', '.g....g.'] },
    strass:    { b: '#3d8bff', w: '#ffffff', c: '#9ad0ff', d: '#1d4f9f', rows: ['........', '.cccccc.', 'cwwccbbc', 'bbbbbbbb', '.dbbbbd.', '..dbbd..', '...dd...', '........'] },
    coupe:     { y: GOLD, d: '#a8821f', w: '#fff3c4', rows: ['y.yyyy.y', 'y.wyyy.y', '.ywyyyd.', '..yyyd..', '...yd...', '...yd...', '..yyyd..', '.dddddd.'] },
    cartes:    { r: MULT, o: CHIPS, y: GOLD, w: '#fff3c4', rows: ['.rrr....', '.rrooo..', '.rroowyy', '.rrooyyy', '.rrooyyy', '.rrooyyy', '...ooyyy', '.....yyy'] },
    horloge:   { d: '#6b5a8f', w: '#dfe6f0', k: '#2a1a2a', rows: ['..dddd..', '.dwwwwd.', 'dwwkwwwd', 'dwwkwwwd', 'dwwkkkwd', 'dwwwwwwd', '.dwwwwd.', '..dddd..'] },
    mystere:   { g: '#b9addb', rows: ['..gggg..', '.gg..gg.', '.....gg.', '....gg..', '...gg...', '...gg...', '........', '...gg...'] },
    infini:    { p: '#9b6cf0', w: '#d9c8ff', rows: ['........', '........', '.wp..wp.', 'p..pp..p', 'p..pp..p', '.pp..pp.', '........', '........'] },
    main:      { s: '#f0c49a', d: '#a8744a', rows: ['...s....', '.s.s.s..', '.s.s.s.s', '.sssss.s', 's.ssssss', 'sssssss.', '.sssss..', '..dddd..'] },
    doigt:     { s: '#f0c49a', d: '#a8744a', k: OUTLINE, rows: ['.kk.....', 'kssk....', 'kssk....', 'ksskkkk.', 'ksssssk.', 'kssssssk', 'kssssssk', '.kddddk.'] },
    // Le A du titre, comme sur l'icône du jeu.
    lettreA:   { y: GOLD, w: '#fff3c4', r: MULT, rows: ['.....w...', '....wyw..', '...wyyyw.', '..wyyryyw', '..yyr.ryy', '..yy...yy', '..yywwwyy', '..yyyyyyy', '..yyrrryy', '..yy...yy', '..rr...rr'] },
    eteignoir: { g: '#c8ccd4', w: '#ffffff', d: '#8a5a2a', rows: ['...gg...', '..gwgg..', '.gwgggg.', 'gggggggg', '...dd...', '...dd...', '...dd...', '..dddd..'] },
    lanterne:  { d: '#6a707a', y: GOLD, w: '#fff3c4', rows: ['...dd...', '..d..d..', '.dddddd.', '.dyyyyd.', '.dywyyd.', '.dyyyyd.', '.dddddd.', '..dddd..'] },
    sablier:   { d: '#8a5a2a', b: '#9ad0ff', y: GOLD, rows: ['dddddddd', '.byyyyb.', '..byyb..', '...yy...', '...bb...', '..b..b..', '.byyyyb.', 'dddddddd'] },
    chaussette: { r: MULT, w: '#ffffff', y: GOLD, rows: ['..rrrr..', '..wwww..', '..rrrr..', '..ryrr..', '..rrrr..', '..rrrrr.', '.rrrrrrr', '.rrrrrr.'] },
    tambour:   { r: MULT, w: '#ffffff', y: GOLD, rows: ['w......w', '.w....w.', '.yyyyyy.', 'rrrrrrrr', 'rwrwrwrr', 'rrrrrrrr', '.yyyyyy.', '........'] },
    crescendo: { r: MULT, rows: ['.......r', '......rr', '.....rrr', '....rrrr', '...rrrrr', '..rrrrrr', '.rrrrrrr', 'rrrrrrrr'] },
    follet:    { c: '#7cf2d0', w: '#e8fff8', rows: ['...c....', '..cc....', '..ccc.c.', '.cwccc..', '.cwwcc..', '.ccwcc..', '..ccc...', '........'] },
    pacte:     { w: '#e8c8ff', k: '#140a24', rows: ['..wwww..', '.wwwwww.', 'wkkwwkkw', 'wkkwwkkw', 'wwwwwwww', '.ww..ww.', '.wwwwww.', '..w.w.w.'] },
    gregeois:  { g: '#5be37d', y: '#c8ff70', w: '#f0fff0', b: '#4db8ff', rows: ['...g....', '..gg....', '..ggg.g.', '.ggyggg.', '.gyyygg.', 'ggywwygg', '.gywwyg.', 'bbbbbbbb'] },
    poudre:    { d: '#8a5a2a', k: '#2a1a2a', o: '#ff7a1a', rows: ['......o.', '..dddd.o', '.dkkkkd.', 'dddddddd', 'dkkkkkkd', 'dkkkkkkd', 'dddddddd', '.dkkkkd.'] },
    foule:     { y: GOLD, d: '#a8821f', rows: ['...yy...', '..yyyy..', '..yyyd..', '...dd...', '.yyyyyy.', 'yyyyyyyd', 'yyyyyyyd', 'yyyyyydd'] },
    affiche:   { k: '#4b3d6e', w: '#f2ead8', r: MULT, y: GOLD, rows: ['kkkkkkkk', 'kwwwwwwk', 'kwryyrwk', 'kwyrrywk', 'kwryyrwk', 'kwwwwwwk', 'kwkkkkwk', 'kkkkkkkk'] },
    ticket:    { y: GOLD, d: '#a8821f', rows: ['........', '.yyyyyy.', 'yyydyyyy', '.yydyyy.', '.yydyyy.', 'yyydyyyy', '.yyyyyy.', '........'] },
  };
  const PERK_ICON = {
    meche: 't:petard', etages: 't:fusee', ciel: 'g:ciel', etincelle: 'g:etincelle', ouverture: 'g:allumette',
    arcenciel: 'g:arcenciel', sacre: 'g:sacre', meteore: 'g:meteore', allumette: 'x:+1', grand: 'x:×2', final: 'x:×3',
    tirelire: 'g:piece', pourboire: 'g:pieces', cendres: 'g:cendres', braise: 'g:braise', veteran: 'g:medaille', boule: 'g:boule', souffle: 'g:vent', orfevre: 'g:dore', colosse: 'g:geant', paillettes: 'g:brillant',
    rafale: 't:petard', eclairante: 't:fusee', doree: 't:bengale', ligne: 't:chandelle', solaire: 't:soleil',
    nitro: 't:bombe', constellation: 't:etoile', monochrome: 'x:×3', collection: 'x:+2', specialiste: 'x:×2',
    croise: 't:petard', boomerang: 't:fusee', reflexe: 'g:reflexe', reserve: 'g:allumette', econome: 'g:eco', joie: 'g:joie', coeur: 'g:coeur',
    basdelaine: 'g:chaussette', roulement: 'g:tambour', pluiedor: 't:bengale', crescendo: 'g:crescendo', tonnerre: 't:bombe', eclipse: 't:soleil',
    trophee: 'g:coupe', claque: 'g:main', billetterie: 'g:ticket', chef: 'g:briquet', bis: 'g:retour', follet: 'g:follet', pacte: 'g:pacte', gregeois: 'g:gregeois', usurier: 'g:taxe', poudre: 'g:poudre',
  };
  const AFFICHE_ICON = { tete: 'g:affiche', bouche: 'g:foule', quete: 'g:pieces', rappel: 'g:allumette' };
  // Valeur courante d'un bonus qui grandit (sa valeur de départ s'il n'est pas encore acheté).
  const grown = (id, start) => (st.perks && id in st.perks ? st.perks[id] : start);
  const PERK_TAG = {
    pourboire: () => '12+', tirelire: () => '+' + L.money(2), ouverture: () => '×2',
    meche: () => T('tag.meche'), etages: () => T('tag.etages'), sacre: () => '×' + L.dec((st.perks && st.perks.sacre) || 1.5),
    rafale: () => '+1', eclairante: () => '+8', doree: () => '+' + L.money(1), ligne: () => '×2', solaire: () => '×' + L.dec(1.3),
    nitro: () => '+3', constellation: () => '+50', croise: () => '×', reserve: () => '+' + R.RESERVE_MAX,
    econome: () => L.money(0), cendres: () => '+' + L.money(1), orfevre: () => '+' + L.money(1), paillettes: () => '+15',
    braise: () => '+' + grown('braise', 0), veteran: () => '+' + grown('veteran', 10),
    boule: () => '×' + L.dec(grown('boule', 1)), souffle: () => '+' + L.dec(grown('souffle', 0.05)),
    basdelaine: () => L.money(8), roulement: () => '+1', pluiedor: () => '+4', crescendo: () => '+' + L.dec(0.5), tonnerre: () => T('tag.r3'),
    eclipse: () => '5×5', trophee: () => '×' + L.dec(grown('trophee', 1)),
    claque: () => '×' + L.dec(R.claqueMult(st.crowd)), billetterie: () => '+' + L.money(R.billetPay(st.crowd)), chef: () => '+1', bis: () => R.BIS_COUNT + '+', pacte: () => '×4', gregeois: () => '×2',
  };
  const BOSS_ICON = {
    pluie: 'g:goutte', couvrefeu: 'g:lune', voisin: 'g:voisin', humides: 'w:petard', brouillard: 'g:brouillard', penurie: 'g:penurie',
    critique: 'g:critique', courte: 'g:courte', taxe: 'g:taxe', coupefeu: 'g:coupefeu', orage: 'g:orage', jury: 'g:jury', nuitnoire: 'g:nuitnoire',
  };

  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const mix = (x, y, k) => x.map((v, i) => Math.round(v + (y[i] - v) * k));
  const css = c => `rgb(${c.join(',')})`;

  function sprite(size, paint) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    paint(c.getContext('2d'));
    return c;
  }

  function disc(g, size, r, color) {
    const m = size / 2;
    g.fillStyle = color;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (Math.hypot(x + 0.5 - m, y + 0.5 - m) <= r) g.fillRect(x, y, 1, 1);
  }

  function makeShell(type, wet, color) {
    return sprite(22, g => {
      let base = rgb(color || TYPES[type].color);
      if (wet) base = mix(base, [111, 127, 153], 0.6);
      const light = mix(base, [255, 255, 255], 0.4), dark = mix(base, [0, 0, 0], 0.38);
      const m = 11, r = 10.6;
      for (let y = 0; y < 22; y++) for (let x = 0; x < 22; x++) {
        const dx = x + 0.5 - m, dy = y + 0.5 - m, d = Math.hypot(dx, dy);
        if (d > r) continue;
        const l = (-dx - dy) / r;
        g.fillStyle = d > r - 1.4 ? OUTLINE : css(l > 0.55 ? light : l < -0.6 ? dark : base);
        g.fillRect(x, y, 1, 1);
      }
      g.fillStyle = '#fff';
      g.fillRect(5, 6, 1, 2);
      g.fillRect(6, 5, 2, 1);
      const on = (i, j) => ICONS[type][j] && ICONS[type][j][i] === '#';
      if (cbOn) {
        // Mode daltonien : symbole blanc cerné de noir, lisible sur n'importe quelle couleur.
        g.fillStyle = OUTLINE;
        for (let j = -1; j <= 8; j++) for (let i = -1; i <= 8; i++) {
          if (!on(i, j) && (on(i - 1, j) || on(i + 1, j) || on(i, j - 1) || on(i, j + 1))) g.fillRect(7 + i, 7 + j, 1, 1);
        }
        g.fillStyle = '#fff';
      } else g.fillStyle = 'rgba(20, 28, 30, .9)';
      for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) if (on(i, j)) g.fillRect(7 + i, 7 + j, 1, 1);
      if (wet) {
        const drop = ['..o..', '.ono.', 'onnno', 'onnno', '.ooo.'];
        drop.forEach((row, j) => { for (let i = 0; i < 5; i++) if (row[i] !== '.') { g.fillStyle = row[i] === 'o' ? OUTLINE : '#bfe6ff'; g.fillRect(16 + i, j, 1, 1); } });
      }
    });
  }

  // Mode daltonien (Options) : palette d'Okabe et Ito, et symboles blancs cernés.
  const CB_COLORS = {
    petard: '#d55e00', fusee: '#0072b2', chandelle: '#009e73', soleil: '#f0e442', bombe: '#cc79a7', etoile: '#56b4e9',
    bengale: '#e69f00', ricochet: '#5a3e9b', miroir: '#dfe6f0', lente: '#8c5a2b', double: '#3d3d3d', sauteur: '#9a2a6a', cascade: '#b8b8b8',
  };
  const BASE_COLORS = {};
  for (const t in TYPES) BASE_COLORS[t] = TYPES[t].color;
  let cbOn = localStorage.getItem('bf-cb') === '1';
  // Sel de couleur : un bocal de poudre de la couleur du feu, avec son symbole sur l'étiquette.
  // Sans type : le mélange arc-en-ciel, en couches de toutes les couleurs.
  const MIX_LAYERS = ['#ff4d5e', '#ff9a2e', '#ffd23f', '#5be37d', '#4db8ff', '#c08bff'];
  function makeSalt(type) {
    return sprite(22, g => {
      const glass = (x, y) => (x >= 3 && x <= 18 && y >= 6 && y <= 20 && !((x === 3 || x === 18) && (y === 6 || y === 20))) || (x >= 8 && x <= 13 && y >= 4 && y <= 5);
      const base = type ? rgb(TYPES[type].color) : null;
      for (let y = 0; y < 22; y++) for (let x = 0; x < 22; x++) {
        if (!glass(x, y)) continue;
        const edge = !glass(x - 1, y) || !glass(x + 1, y) || !glass(x, y - 1) || !glass(x, y + 1);
        let c;
        if (edge) c = OUTLINE;
        else if (y < 9) c = x === 5 && y >= 7 ? '#ffffff' : '#3a3f5a';
        else {
          const col = base || rgb(MIX_LAYERS[Math.min(MIX_LAYERS.length - 1, Math.floor((y - 9) / 2))]);
          const l = -(x - 10.5) / 8 - (y - 14) / 7;
          c = css(l > 0.7 ? mix(col, [255, 255, 255], 0.4) : l < -0.6 ? mix(col, [0, 0, 0], 0.38) : col);
          if (x === 5 && y < 15) c = css(mix(col, [255, 255, 255], 0.6));
        }
        g.fillStyle = c;
        g.fillRect(x, y, 1, 1);
      }
      g.fillStyle = OUTLINE;
      g.fillRect(7, 0, 8, 4);
      g.fillStyle = '#b07a44';
      g.fillRect(8, 1, 6, 2);
      g.fillStyle = '#d9a46a';
      g.fillRect(8, 1, 6, 1);
      if (!type) return;
      g.fillStyle = '#f2ead8';
      g.fillRect(7, 11, 8, 8);
      g.fillStyle = 'rgba(20, 28, 30, .9)';
      ICONS[type].forEach((row, j) => { for (let i = 0; i < 8; i++) if (row[i] === '#') g.fillRect(7 + i, 11 + j, 1, 1); });
    });
  }
  const SPR = {}, SPR_WET = {}, SALT = {};
  const SALT_MIX = makeSalt(null);
  const saltOf = id => SALT[id] || SALT_MIX;
  function buildShells() {
    for (const t in TYPES) {
      TYPES[t].color = (cbOn && CB_COLORS[t]) || BASE_COLORS[t];
      SPR[t] = makeShell(t, false);
      SPR_WET[t] = makeShell(t, true);
      SALT[t] = makeSalt(t);
    }
  }
  buildShells();
  // Feu caché par le brouillard : une coque grise avec un point d'interrogation.
  const FOG = makeShell('brume', false, '#5a6070');
  // Double qui a déjà explosé une fois : une fêlure sur la coque.
  const CRACK = sprite(22, g => {
    g.fillStyle = OUTLINE;
    for (const [x, y] of [[14, 3], [13, 4], [13, 5], [12, 6], [13, 7], [14, 8], [14, 9], [15, 10], [8, 15], [7, 16], [7, 17], [6, 18]]) g.fillRect(x, y, 1, 1);
  });
  const SHADOW = sprite(22, g => disc(g, 22, 10.6, 'rgba(0, 0, 0, .45)'));
  const WHITE_DISC = sprite(22, g => disc(g, 22, 10.6, '#ffffff'));
  const ring = (color, r0, r1) => sprite(30, g => {
    g.fillStyle = color;
    for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) {
      const d = Math.hypot(x + 0.5 - 15, y + 0.5 - 15);
      if (d > r0 && d <= r1) g.fillRect(x, y, 1, 1);
    }
  });
  const RING = ring('#fff', 12.6, 14.2);
  // Cible d'un outil, et halo d'un feu doré.
  const RING_TOOL = ring(GOLD, 12.6, 14.2);
  const HALO_GOLD = ring('rgba(255, 210, 63, .85)', 10.8, 12.2);
  // Sacs de départ : un sac fermé par un lien doré. Chacun a sa toile et, brodé dessus, le signe de sa règle
  // (6×6 pixels, o : contour). stripes : toile rayée des couleurs des feux.
  const BAG_LOOK = {
    classique:  { body: '#c98a4b', r: '#e0402f', w: '#fff', rows: ['..oo..', '.orro.', 'orwrro', 'orrrro', '.orro.', '..oo..'] },
    petardier:  { body: '#c8402e', y: GOLD, w: '#fff3c4', rows: ['y.yy.y', '.ywwy.', 'ywwwwy', 'ywwwwy', '.ywwy.', 'y.yy.y'] },
    prudent:    { body: '#5f9fd8', r: '#e0402f', w: '#f2ead8', rows: ['..oo..', '.orro.', '.orro.', '..ww..', '..ww..', '..ww..'] },
    mecene:     { body: '#3f9a5a', y: GOLD, w: '#fff3c4', d: '#a8821f', rows: ['.oooo.', 'oywyyo', 'owyyyo', 'oyyydo', 'oyyddo', '.oooo.'] },
    bariole:    { body: '#c98a4b', stripes: ['#e0402f', '#ff9a2e', GOLD, '#4bc292', '#4c8dff'], rows: [] },
    chimiste:   { body: '#c0508f', w: '#dfe6f0', g: '#7dff6a', rows: ['.oooo.', '..ww..', '.wwww.', 'wggggw', 'wggggw', '.wwww.'] },
    noctambule: { body: '#2c3566', y: '#fff3c4', w: '#fff', rows: ['..yy..', '.yy..w', 'yy....', 'yy....', '.yy...', '..yy..'] },
    heritier:   { body: '#7a52b0', y: GOLD, r: '#e0402f', d: '#a8821f', rows: ['y.yy.y', 'yyyyyy', 'yryyry', 'yyyyyy', 'dddddd', '......'] },
  };
  function makeBag(look) {
    return sprite(16, g => {
      const tie = (x, y) => y === 5 && x >= 5 && x <= 10;
      const inBag = (x, y) => {
        const dx = (x + 0.5 - 8) / 6.8, dy = (y + 0.5 - 10.4) / 5.4;
        return dx * dx + dy * dy <= 1 || tie(x, y) || (y >= 3 && y <= 6 && x >= 6 && x <= 9) ||
          (y >= 1 && y <= 2 && x >= 5 && x <= 10 && !(y === 1 && (x === 7 || x === 8)));
      };
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        if (!inBag(x, y)) continue;
        const base = rgb(look.stripes && y >= 6 ? look.stripes[Math.min(look.stripes.length - 1, (y - 6) >> 1)] : look.body);
        const light = mix(base, [255, 255, 255], 0.4), dark = mix(base, [0, 0, 0], 0.38);
        const edge = !inBag(x - 1, y) || !inBag(x + 1, y) || !inBag(x, y - 1) || !inBag(x, y + 1);
        const l = -(x - 8) / 7 - (y - 10) / 6;
        g.fillStyle = tie(x, y) ? (x === 5 || x === 10 ? '#a8821f' : GOLD) : edge ? OUTLINE : css(l > 0.6 ? light : l < -0.5 ? dark : base);
        g.fillRect(x, y, 1, 1);
      }
      look.rows.forEach((row, j) => {
        for (let i = 0; i < row.length; i++) if (row[i] !== '.') { g.fillStyle = row[i] === 'o' ? OUTLINE : look[row[i]]; g.fillRect(5 + i, 8 + j, 1, 1); }
      });
    });
  }
  const BAG = {};
  for (const id in BAG_LOOK) BAG[id] = makeBag(BAG_LOOK[id]);
  const bagOf = id => BAG[id] || BAG.classique;
  // Calibre : un tas de poudre noire, plus gros à chaque calibre ; celui qu'on a choisi flambe, avec des braises.
  const FLAME = { y: '#ffb02e', r: '#ff5a1f', w: '#fff3c4' };
  function powder(n, lit) {
    return sprite(16, g => {
      const w = 3.6 + n * 0.85, h = 3 + n * 1.4, cx = 7.5;
      const inside = (x, y) => {
        const dx = Math.abs(x + 0.5 - cx) / w;
        return dx <= 1 && y >= 0 && y <= 15 && y + 0.5 >= 16 - h * (1 - Math.pow(dx, 1.7));
      };
      const base = rgb('#6a6478'), light = mix(base, [255, 255, 255], 0.3), dark = mix(base, [0, 0, 0], 0.35);
      let top = 15;
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        if (!inside(x, y)) continue;
        top = Math.min(top, y);
        const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
        const l = -(x + 0.5 - cx) / w - (y + 0.5 - (15 - h / 2)) / h;
        let c = css(l > 0.5 ? light : l < -0.45 ? dark : base);
        if ((x * 7 + y * 13) % (lit ? 5 : 9) === 0) c = lit ? (x % 2 ? GOLD : '#ff7a1a') : '#a69cbc';
        g.fillStyle = edge ? OUTLINE : c;
        g.fillRect(x, y, 1, 1);
      }
      if (lit) ['...o...', '..oyo..', '..oyo..', '.oyryo.', 'oyrrryo', 'oyrwryo', '.oyyyo.'].forEach((row, j) => {
        for (let i = 0; i < row.length; i++) if (row[i] !== '.') { g.fillStyle = row[i] === 'o' ? OUTLINE : FLAME[row[i]]; g.fillRect(4 + i, top - 6 + j, 1, 1); }
      });
    });
  }
  const CAL_ON = [null], CAL_OFF = [null];
  for (let n = 1; n <= R.CALIBRES; n++) { CAL_ON.push(powder(n, true)); CAL_OFF.push(powder(n, false)); }
  function glyph(key) {
    const gdef = GLYPHS[key];
    const n = Math.max(gdef.rows.length, ...gdef.rows.map(r => r.length));
    return sprite(n, g => gdef.rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) if (row[i] !== '.') { g.fillStyle = gdef[row[i]]; g.fillRect(i, j, 1, 1); }
    }));
  }
  const EDGLYPH = {};
  for (const id of R.EDITIONS) EDGLYPH[id] = glyph(id);
  document.querySelectorAll('.arsenal-btn .fan').forEach(f => f.appendChild(glyph('arsenal')));
  function copyCanvas(src) {
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    c.getContext('2d').drawImage(src, 0, 0);
    return c;
  }

  // Pièces et trouvailles n'ont ni cadre (ce ne sont pas des cartes) ni gerbe d'étincelles derrière elles (Dario n'en veut nulle part).
  // La rareté d'un bonus se lit au liseré du dessin (style.css, withShine).

  // Un bonus légendaire : un reflet blanc traverse son dessin, découpé à sa forme (masque agrandi sans lissage pour garder les pixels nets).
  function withShine(cv, cls) {
    if (!String(cls).split(' ').includes('legendaire') || cv.tagName !== 'CANVAS') return cv;
    const big = document.createElement('canvas');
    big.width = cv.width * 8;
    big.height = cv.height * 8;
    const g = big.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(cv, 0, 0, big.width, big.height);
    const wrap = document.createElement('span');
    wrap.className = 'rim-wrap';
    wrap.appendChild(cv);
    const s = wrap.appendChild(document.createElement('i'));
    s.className = 'shine';
    s.style.webkitMaskImage = s.style.maskImage = `url(${big.toDataURL()})`;
    s.style.animationDelay = (-Math.random() * 2.4).toFixed(2) + 's';
    return wrap;
  }

  // Petite icône d'objet. icon : 't:type' (sprite de feu), 'w:type' (feu mouillé), 'g:glyphe', 'c:calibre', 'b:sac', 'j:type' (sel de couleur, 'j:mix' pour le mélange) ou 'x:texte'.
  function iconCard(icon, cls, tag) {
    const el = document.createElement('div');
    el.className = 'pcard ' + cls;
    el.style.animationDelay = (-Math.random() * 3).toFixed(2) + 's';
    const [kind, val] = icon.split(':');
    if (kind === 'x') {
      const s = el.appendChild(document.createElement('i'));
      s.className = 'txt-ico';
      s.textContent = val;
      s.style.color = val === '+1' ? CHIPS : MULT;
    } else el.appendChild(withShine(copyCanvas(kind === 't' ? SPR[val] : kind === 'w' ? SPR_WET[val] : kind === 'c' ? CAL_ON[val] : kind === 'b' ? bagOf(val) : kind === 'j' ? saltOf(val) : glyph(val)), cls));
    if (tag) {
      const s = document.createElement('span');
      s.className = 'tag';
      s.textContent = tag;
      el.appendChild(s);
    }
    return el;
  }

  function perkCard(p) { return iconCard(PERK_ICON[p.id], p.rarity, PERK_TAG[p.id] && PERK_TAG[p.id]()); }

  // ---------- Colis, pièces et trouvailles ----------
  // Couleur du carton d'un colis et emblème imprimé dessus.
  const PACK_LOOK = {
    caisse: { color: '#ff8f2e', icon: 'renfort' },
    astres: { color: '#4d6bff', icon: 'fiole' },
    artificier: { color: '#e0408a', icon: 'etincelle' },
    atelier: { color: '#b07a3a', icon: 'pince' },
    comete: { color: '#9b6cf0', icon: 'meteore' },
    affiches: { color: '#4bc292', icon: 'foule' },
  };
  // Le paquet en pixel art : un carton fermé, une étiquette, une mèche. Un méga a un liseré doré.
  function packArt(id, size) {
    const look = PACK_LOOK[id], w = 22, h = 28, top = 4;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h + top;
    const g = c.getContext('2d');
    const base = rgb(look.color), light = css(mix(base, [255, 255, 255], 0.35)), dark = css(mix(base, [0, 0, 0], 0.4));
    g.fillStyle = size === 'mega' ? GOLD : OUTLINE;
    g.fillRect(0, top, w, h);
    g.fillStyle = look.color;
    g.fillRect(1, top + 1, w - 2, h - 2);
    g.fillStyle = light;
    g.fillRect(1, top + 1, w - 2, 4);
    g.fillRect(1, top + 6, 1, h - 8);
    g.fillStyle = dark;
    g.fillRect(1, top + 5, w - 2, 1);
    g.fillRect(w - 2, top + 6, 1, h - 8);
    g.fillRect(1, top + h - 3, w - 2, 2);
    if (size !== 'normal') { g.fillStyle = size === 'mega' ? GOLD : light; g.fillRect(1, top + h - 6, w - 2, 1); }
    g.fillStyle = OUTLINE;
    g.fillRect(4, top + 8, 14, 14);
    g.fillStyle = '#f2ead8';
    g.fillRect(5, top + 9, 12, 12);
    g.drawImage(glyph(look.icon), 7, top + 11);
    g.fillStyle = '#d9b26a';
    for (const [x, y] of [[11, 3], [11, 2], [12, 1], [13, 0]]) g.fillRect(x, y, 1, 1);
    return c;
  }

  // Ce qu'affiche une carte : icône, étiquette sur l'icône, style, catégorie, nom et description.
  function cardInfo(ch) {
    if (ch.kind === 'perks') {
      const p = R.perkById(ch.id);
      return { icon: PERK_ICON[p.id], cls: p.rarity, tag: PERK_TAG[p.id] && PERK_TAG[p.id](), label: L.rarity(p.rarity), ...L.entry('perks', p.id) };
    }
    if (ch.kind === 'tools') return { icon: 'g:' + ch.id, cls: 'tool', label: T('shop.toolLabel'), ...L.entry('tools', ch.id) };
    if (ch.kind === 'feux') {
      const more = !!st.bag[ch.id], lv = R.arrivalLevel(st, ch.id);
      const join = more ? T('shop.feuMoreDesc') : lv > 1 ? T('shop.feuNewLv', { n: lv }) : T('shop.feuNewDesc');
      return {
        icon: 't:' + ch.id, cls: 'feu', tag: '+' + ch.add, label: T(more ? 'shop.feuMore' : 'shop.feuNew'), name: typeName(ch.id),
        desc: `${cap(typeDesc(ch.id))}. ${join}`,
      };
    }
    if (ch.kind === 'astres' || ch.kind === 'supernova') {
      const up = ch.kind === 'supernova' ? 2 : 1, from = R.ptsOf(ch.id, { levels: st.levels });
      return {
        icon: 'j:' + ch.id, cls: ch.kind === 'astres' ? 'astre' : 'comete', tag: T('card.lv', { n: R.levelOf(ch.id, st) + up }),
        label: T(ch.kind === 'astres' ? 'card.astre' : 'card.comete'), name: L.entry('stars', ch.kind === 'astres' ? ch.id : 'supernova').name,
        desc: T('card.astreDesc', { name: typeName(ch.id), n: up, from, to: from + up * TYPES[ch.id].up }) + (st.bag[ch.id] ? '' : ' ' + T('card.notInSky')),
      };
    }
    if (ch.kind === 'retrait') return { icon: 'g:croix', cls: 'retrait', label: T('shop.retraitLabel'), name: T('shop.retrait'), desc: T('shop.retraitDesc') };
    if (ch.kind === 'affiche') {
      const n = st.crowd || 0;
      const tag = { tete: '+' + R.TETE_ADD, bouche: '+' + Math.min(R.BOUCHE_MAX, n), quete: '+' + L.money(R.queteMoney(n)), rappel: '+1' }[ch.id];
      return { icon: AFFICHE_ICON[ch.id], cls: 'affiche', tag, label: T('card.affiche'), ...L.entry('affiches', ch.id, { add: Math.min(R.BOUCHE_MAX, n), money: L.money(R.queteMoney(n)) }) };
    }
    const vars = { n: R.slotsOf(st) + 1, money: L.money(ch.value || 0) };
    const icon = { slot: 'x:+1', money: 'g:piece', levels: 'j:mix', toolbox: 'g:renfort' }[ch.kind];
    return {
      icon, cls: ch.kind === 'levels' ? 'astre' : 'comete', tag: ch.kind === 'levels' ? '+1' : '',
      label: T(ch.kind === 'levels' ? 'card.astre' : 'card.comete'), name: T('reward.' + ch.kind, vars), desc: T('reward.' + ch.kind + 'Desc', vars),
    };
  }

  // Une icône agrandie d'un nombre entier de fois, pour rester nette.
  function bigIcon(icon, px) {
    const [kind, val] = icon.split(':');
    if (kind === 'x') { const s = document.createElement('i'); s.className = 'big-x'; s.textContent = val; return s; }
    const cv = copyCanvas(kind === 't' ? SPR[val] : kind === 'j' ? saltOf(val) : glyph(val));
    cv.style.width = cv.width * Math.max(1, Math.floor(px / cv.width)) + 'px';
    return cv;
  }

  // Une pièce ou une trouvaille en grand : l'objet, son étiquette et son nom.
  // back : le colis d'où elle sort ; tant qu'elle n'est pas révélée, c'est une étincelle de la couleur du colis.
  function makeCard(ch, back) {
    const info = cardInfo(ch);
    const el = document.createElement('div');
    el.className = 'card ' + info.cls;
    el.innerHTML = '<div class="bob"><div class="card-in"><div class="face"><div class="ico"></div></div><div class="back"></div></div></div>';
    el.querySelector('.bob').style.animationDelay = (-Math.random() * 3).toFixed(2) + 's';
    const face = el.querySelector('.face'), ico = face.querySelector('.ico');
    ico.appendChild(withShine(bigIcon(info.icon, 44), info.cls));
    if (info.tag) { const s = document.createElement('span'); s.className = 'tag'; s.textContent = info.tag; ico.appendChild(s); }
    const nm = document.createElement('b');
    nm.className = 'nm';
    nm.textContent = info.name;
    face.appendChild(nm);
    if (back) {
      const bk = el.querySelector('.back');
      bk.style.setProperty('--pk', PACK_LOOK[back].color);
      bk.appendChild(bigIcon('g:etincelle', 32));
    }
    return el;
  }

  // La fiche de l'article touché : catégorie, nom, description et un bouton.
  function renderInfo(box, info, btnText, ok, onClick) {
    box.innerHTML = `<div class="info-txt"><em class="${info.cls}">${info.label}</em><b>${info.name}</b><span>${info.desc}</span></div>`;
    const btn = document.createElement('button');
    btn.className = 'btn gold';
    btn.textContent = btnText;
    btn.disabled = !ok;
    btn.addEventListener('click', onClick);
    box.appendChild(btn);
  }
  function infoHint(box, text) { box.innerHTML = `<p class="info-hint">${text}</p>`; }

  // Une ligne de boutique ou d'arsenal : carte + étiquette + nom + description (+ prix).
  function offerRow(card, cls, label, name, desc) {
    const el = document.createElement('div');
    el.className = 'offer ' + cls;
    el.appendChild(card);
    const txt = document.createElement('div');
    txt.className = 'txt';
    txt.innerHTML = `<em>${label}</em><b>${name}</b><span>${desc}</span>`;
    el.appendChild(txt);
    return el;
  }

  // ---------- Effets d'interface ----------
  function juice(el, amt) {
    if (!el || !el.animate) return;
    const rot = (Math.random() - 0.5) * 14 * amt;
    el.animate([
      { transform: 'scale(1) rotate(0deg)' },
      { transform: `scale(${1 + amt}) rotate(${rot}deg)` },
      { transform: 'scale(1) rotate(0deg)' },
    ], { duration: 300, easing: 'cubic-bezier(.2, 1.6, .4, 1)' });
  }

  function shakeApp(px) {
    if (calm) return;
    const k = [];
    for (let i = 0; i < 6; i++) k.push({ transform: `translate(${(Math.random() - 0.5) * px}px, ${(Math.random() - 0.5) * px}px) rotate(${(Math.random() - 0.5) * px * 0.15}deg)` });
    k.push({ transform: 'none' });
    $('app').animate(k, { duration: 380, easing: 'ease-out' });
  }

  let toastTimer = 0, toastAt = 0, toastDone = null;
  // ack : le joueur a fermé l'annonce (les astuces ne sont notées lues qu'à ce moment-là).
  function hideToast(ack) {
    clearTimeout(toastTimer);
    $('toast').classList.add('hidden');
    const done = toastDone;
    toastDone = null;
    if (ack && done) done();
  }
  // Les explications (boss, astuces) restent jusqu'au toucher : un regard ailleurs ne doit pas les faire rater.
  function toast(text, small, cls, onDone) {
    const t = $('toast');
    t.className = cls || '';
    t.innerHTML = text + (small ? `<small>${small}</small>` : '');
    t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
    clearTimeout(toastTimer);
    toastDone = onDone || null;
    toastAt = performance.now();
  }
  // Un toucher du ciel ferme l'encart, mais pas dans la première seconde (on n'a pas encore pu le lire).
  addEventListener('pointerdown', e => {
    const t = $('toast');
    if (t.classList.contains('hidden') || performance.now() - toastAt < 1200) return;
    if (!e.target.closest('#field-wrap')) return;
    hideToast(true);
  }, true);
  // La première fois qu'un feu fume, on explique pourquoi (sans couvrir l'annonce d'un boss).
  function tipAlone() {
    if (localStorage.getItem('bf-tip-alone') || !$('toast').classList.contains('hidden')) return;
    if (!st.grid.some(row => row.some(c => c.alone))) return;
    toast(T('toast.alone'), T('toast.aloneDesc'), 'info', () => localStorage.setItem('bf-tip-alone', '1'));
  }
  // Pas pendant le bouquet : l'écran de victoire la recouvrait avant qu'on ait pu la lire.
  function tipNudge() {
    if (!st.help || localStorage.getItem('bf-tip-nudge') || !$('toast').classList.contains('hidden')) return;
    toast(T('nudge.help'), T('nudge.helpDesc'), 'info', () => localStorage.setItem('bf-tip-nudge', '1'));
  }
  function tipCrowd() {
    if (localStorage.getItem('bf-tip-crowd')) return;
    st.crowdTip = true;
  }
  function showCrowdTip() {
    if (!st.crowdTip || localStorage.getItem('bf-tip-crowd') || !$('toast').classList.contains('hidden')) return;
    toast(T('toast.crowd'), T('toast.crowdDesc'), 'info', () => {
      st.crowdTip = false;
      localStorage.setItem('bf-tip-crowd', '1');
    });
  }

  function setCalc(chips, mult, pop) {
    $('chips').textContent = fmtNum(chips);
    $('mult').textContent = Number.isInteger(mult) ? fmtNum(mult) : L.dec(mult);
    if (pop) { juice($('chips').parentElement, 0.18); juice($('mult').parentElement, 0.18); }
  }

  function hideScreens() {
    for (const id of ['recap', 'shop-screen', 'arsenal', 'howto', 'credits', 'collection', 'succes', 'sacs', 'stats', 'pack']) $(id).classList.add('hidden');
    packView = null;
  }

  // ---------- Partie ----------
  function startRun() {
    clearRun();
    st.calibre = M.calibre;
    // Un défi réussi pendant une run précédente se débloque maintenant, avant de tirer le contenu de la run.
    const waiting = M.startRun(st.calibre);
    if (waiting.length) setTimeout(() => showUnlocks(waiting), 1200);
    st.locked = M.locked();
    Object.assign(st, R.newRun(R.runMod(M.sac), st.calibre, st.locked, Math.random));
    st.help = true;
    st.round = 0;
    st.reward = null;
    st.endless = false;
    st.runDone = false;
    // oneShots, maxUsed, feu, perk : pour les succès qui se jouent sur toute une run.
    st.run = { chain: 0, shot: 0, total: 0, oneShots: 0, maxUsed: 0, feu: false, perk: R.perkCount(st) > 0, streak: 0 };
    st.bosses = R.drawBosses(Math.random);
    startRound();
    if (st.mod.legend) {
      const choices = R.heirChoices(st, Math.random);
      if (choices.length) {
        st.reward = { from: 'heir', pack: 'comete', size: 'normal', keep: 1, choices, taken: [], fresh: [] };
        saveRun('aim');
        openPackScreen(true);
      }
    }
  }

  // Mode infini : le boss de chaque soirée au-delà de la 8e est tiré au dernier moment.
  function ensureBoss(round) {
    if (round >= R.TARGETS.length && !(round in st.bosses)) st.bosses[round] = R.endlessBoss(round, Math.random);
  }

  function startRound() {
    st.token++;
    st.anim = null;
    st.lantern = false;
    ensureBoss(st.round);
    st.sky = Math.random;
    st.grid = R.newGrid(st.bag, mods(), st.sky);
    for (const row of st.grid) for (const c of row) c.dy = ROWS + Math.random() * 0.8;
    st.score = 0; st.shown = 0;
    st.shots = R.shotsFor(mods()) + st.carry;
    st.carry = 0;
    st.used = 0;
    st.refunds = 0;
    st.reflex = false;
    st.bis = false;
    st.follet = { pts: 0, n: 0 };
    st.crowdNight = 0;
    // Ce qui se joue sur la soirée, pour les défis : points de chaque allumette, chaînes de 25+, feux éteints.
    st.night = { scores: [], big: 0, fizzled: 0 };
    st.sel = null;
    st.tool = null;
    st.nudge = null;
    st.pending = null;
    enterRound();
    hideToast(false);
    const boss = bossId();
    if (boss) { const bt = bossText(boss); toast(T('toast.boss', { name: bt.name }), bt.desc, 'info'); vibrate([60, 60, 60]); shakeApp(10); }
    else if (st.endless && st.round === R.TARGETS.length) toast(T('toast.endless'), T('toast.endlessDesc'), 'info');
    updateHud();
  }

  // Ce qui est commun à une soirée neuve et à une soirée reprise.
  function enterRound() {
    st.phase = 'fall';
    st.paused = false;
    hideScreens();
    document.body.classList.remove('at-home');
    $('top').querySelector('.score').classList.remove('fire');
    $('top').querySelector('.calc').classList.remove('fire');
    setCalc(0, 0, false);
    const boss = bossId();
    BG.setMode('jeu');
    BG.setPalette(boss || (st.round === R.TARGETS.length - 1 ? 'final' : 'normal'));
    A.setMood(isFinal(boss) ? 'final' : boss ? 'boss' : 'normal');
    A.setBoss(boss);
    A.setScene('jeu');
  }

  function target() { return R.targetFor(st.round, st.calibre, st.mod); }

  // ---------- Sauvegarde de la run en cours ----------
  // where : 'aim' (en pleine soirée) ou 'shop' ; pending : l'allumette qu'on venait de craquer, rejouée à la reprise.
  const RUN_KEY = 'bf-run';
  function saveRun(where, pending) {
    const grid = st.grid && st.grid.map(row => row.map(c => ({ id: c.id, type: c.type, wet: c.wet, lit: c.lit, charges: c.charges, seen: c.seen, alone: c.alone, ed: c.ed, idle: c.idle })));
    const shop = st.shop;
    const keep = ['calibre', 'locked', 'round', 'bag', 'perks', 'owned', 'levels', 'bosses', 'money', 'mod', 'carry', 'run',
      'endless', 'endlessBest', 'runDone', 'score', 'shots', 'used', 'refunds', 'reflex', 'rerolls', 'tools', 'slots', 'reward',
      'bis', 'lantern', 'follet', 'night', 'crowd', 'crowdNight', 'crowdTip', 'nudges', 'help', 'posted'];
    const data = { v: 1, where, pending: pending || null, grid, shop: where === 'shop' ? shop : null };
    for (const k of keep) data[k] = st[k];
    try { localStorage.setItem(RUN_KEY, JSON.stringify(data)); } catch (e) { /* stockage plein ou refusé */ }
  }
  function loadRun() { try { const d = JSON.parse(localStorage.getItem(RUN_KEY)); return d && d.v === 1 ? d : null; } catch (e) { return null; } }
  function clearRun() { localStorage.removeItem(RUN_KEY); }

  function resumeRun() {
    const d = loadRun();
    if (!d) return;
    A.init(); A.startMusic(); A.click();
    for (const k in d) if (!['v', 'where', 'pending', 'grid', 'shop'].includes(k)) st[k] = d[k];
    // Run sauvegardée avant les succès : on ignore son passé, elle ne peut pas donner les succès de run.
    if (st.run && st.run.maxUsed === undefined) Object.assign(st.run, { oneShots: 0, maxUsed: 9, feu: true, perk: true });
    st.night = st.night || { scores: [], big: 0, fizzled: 0 };
    st.follet = st.follet || { pts: 0, n: 0 };
    st.crowd = st.crowd || 0;
    st.crowdNight = st.crowdNight || 0;
    // Une partie enregistrée avant le coup de pouce, ou sans le bouton : on le rend, avec ses 3 décalages.
    if (!st.help) { st.help = true; st.nudges = R.NUDGES; }
    else if (st.nudges == null) st.nudges = R.NUDGES;
    st.posted = st.posted || {};
    st.shown = st.score;
    st.sel = null;
    st.tool = null;
    st.tools = st.tools || [];
    st.anim = null;
    st.token++;
    st.grid = d.grid.map(row => row.map(c => Object.assign(R.cell(c.type), c, { dy: ROWS + Math.random() * 0.8 })));
    st.sky = Math.random;
    if (d.where === 'shop') {
      // Une boutique sauvegardée avant les paquets : on en tire une neuve.
      st.shop = d.shop && d.shop.cards ? d.shop : { ...R.shop(st, Math.random), skip: d.shop && d.shop.skip };
      if (!st.shop.skip) st.shop.skip = R.SKIPS[0];
      document.body.classList.remove('at-home');
      updateHud();
      openShop(true);
      if (st.reward) openPackScreen(false);
      return;
    }
    st.pending = d.pending;
    st.skipMeteor = true;
    st.burnChecked = true;
    enterRound();
    updateHud();
    if (st.reward) openPackScreen(false);
  }

  // also : autres feux allumés par la même allumette (Briquet).
  function fire(x, y, also) {
    saveRun('aim', { x, y, also });
    st.tool = null;
    st.nudge = null;
    const tax = R.bossRules(mods()).tax || 0;
    if (tax) {
      st.money = Math.max(0, st.money - tax);
      fx.texts.push({ x: W / 2, y: H * 0.3, text: T('chain.taxe', { money: L.money(tax) }), color: GOLD, life: 0, max: 1.3, size: 15, still: true });
      juice($('money').parentElement, 0.4);
    }
    st.shots--;
    st.burnChecked = false;
    const res = R.chain(st.grid, x, y, mods(), st.shots === 0, also);
    st.used++;
    st.sel = null;
    st.phase = 'chain';
    st.anim = { res, i: 0, t: 0, count: 0, eclats: 0, hits: {} };
    // L'allumette craque : gerbe d'étincelles et petite onde sur le feu touché.
    const p = cellCenter(x, y);
    for (let i = 0; i < 14; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, v = 60 + Math.random() * 90;
      fx.particles.push({ x: p.x, y: p.y - 10, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.35 + Math.random() * 0.3, color: Math.random() < 0.5 ? '#ffd23f' : '#ff7a1a', size: 1 });
    }
    shock(p.x, p.y, '#ffffff', 8, 30, 0.22);
    $('top').querySelector('.calc').classList.remove('fire');
    setCalc(0, 0, false);
    A.click();
    updateHud();
  }

  function cellCenter(x, y) { return { x: GX + x * CELL + CELL / 2, y: GY + y * CELL + CELL / 2 }; }

  function explode(f, stepN) {
    const c = st.grid[f.y][f.x];
    // Un double ne disparaît qu'à sa dernière explosion.
    const k = f.y * COLS + f.x, h = (st.anim.hits[k] || 0) + 1;
    st.anim.hits[k] = h;
    if (h >= R.chargesOf(c)) c.burnt = true;
    const p = cellCenter(f.x, f.y);
    const color = TYPES[f.type].color;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + Math.random() * 0.3;
      const v = 70 + Math.random() * 120;
      fx.particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.6 + Math.random() * 0.5, color, size: Math.random() < 0.3 ? 2 : 1 });
    }
    for (let i = 0; i < 4; i++) fx.particles.push({ x: p.x, y: p.y, vx: (Math.random() - 0.5) * 50, vy: (Math.random() - 0.5) * 50, life: 0, max: 0.3, color: '#ffffff', size: 2 });
    for (let i = 0; i < 3; i++) fx.particles.push({ x: p.x + (Math.random() - 0.5) * 16, y: p.y, vx: (Math.random() - 0.5) * 24, vy: -30 - Math.random() * 30, life: 0, max: 1 + Math.random() * 0.6, color: Math.random() < 0.5 ? GOLD : '#ff7a1a', size: 1, ember: true });
    fx.pops.push({ x: p.x, y: p.y, type: f.type, wet: c.wet, life: 0, max: 0.16 });
    shock(p.x, p.y, color, 12, 44 + Math.min(20, stepN * 2), 0.34);
    fx.tint = color;
    fx.tintA = Math.min(1, fx.tintA + 0.18);
    if (f.fx !== undefined) {
      const q = cellCenter(f.fx, f.fy);
      fx.links.push({ x1: q.x, y1: q.y, x2: p.x, y2: p.y, color, life: 0, max: 0.35 });
    }
    fx.texts.push({ x: p.x, y: p.y - 8, text: '+' + f.pts, color: CHIPS, life: 0, max: 0.9, size: 17 });
    st.anim.count++;
    st.anim.eclats += f.pts;
    fx.flash = Math.min(1, fx.flash + 0.1);
    cam.shake = Math.min(10, cam.shake + 0.5 + stepN * 0.2);
    cam.zoom = Math.min(0.08, cam.zoom + 0.004);
  }

  // Une fusée part du bas du terrain et éclate dans le ciel, derrière les coques.
  function skyRocket(color, wait, big) {
    if (fx.rockets.length >= 10) return;
    fx.rockets.push({ x: 30 + Math.random() * (W - 60), y: BAND_Y, vy: -(300 + Math.random() * 120), top: 40 + Math.random() * 160, wait: wait || 0, color, big: !!big });
  }
  const chainColors = res => res.waves.flat().map(f => TYPES[f.type].color);

  function updateChain(dt) {
    const a = st.anim;
    const waves = a.res.waves;
    // Les très grosses chaînes ralentissent et zooment sur leurs dernières vagues.
    const slow = !calm && a.res.count >= 15 && a.i >= waves.length - 2;
    a.t += dt * 1000 * (slow ? 0.4 : 1);
    if (slow) cam.zoom = Math.min(0.14, cam.zoom + dt * 0.9);
    while (a.i < waves.length && a.t >= a.i * WAVE_MS) {
      // Une note par feu, de plus en plus haute : on entend la chaîne grandir.
      waves[a.i].forEach((f, j) => {
        explode(f, a.i);
        if (j < 6) A.chip(a.count - 1, j * 0.035);
      });
      boom(a.i, waves[a.i].length);
      if (!calm && a.count >= 10 && a.i % 2 === 0) skyRocket(TYPES[waves[a.i][0].type].color);
      a.i++;
      // Compteur de vagues : l'élan monte à chaque vague, et chaque palier de 4 vagues fait un éclair.
      if (a.i >= 2) {
        fx.wave = { n: a.i, mult: R.config.elan ? 1 + R.config.elan * (a.i - 1) : 0, t: 0 };
        if (a.i % 4 === 0 && !calm) { fx.flash = Math.min(1, fx.flash + 0.35); cam.shake += 3; A.bonus(Math.min(6, a.i / 4), true); freeze(60); }
      }
    }
    if (a.i >= waves.length && a.t >= (waves.length - 1) * WAVE_MS + 600) finishChain();
  }

  function boom(stepN, size) {
    A.boom(stepN, size);
    setCalc(st.anim.eclats, st.anim.count, true);
    vibrate(Math.min(60, 12 + size * 6));
    kick(0.12 + size * 0.02);
    cam.rot += (Math.random() - 0.5) * 0.012 * Math.min(4, size);
  }

  // TEXT_TOP : assez bas pour rester visible quand la caméra zoome sur une grosse chaîne.
  const BONUS_MS = 380, FUSE_MS = 460, WAVE_HOLD = 1.6, TEXT_TOP = 78;

  // Les bonus des feux spéciaux ont un id 'ed:dore', 'ed:geant'… ; l'élan n'est pas un bonus acheté.
  function bonusName(bo) {
    if (bo.id === 'elan') return T('chain.elan');
    if (bo.id === 'public') return T('chain.public');
    return bo.id.startsWith('ed:') ? L.entry('editions', bo.id.slice(3)).name : L.entry('perks', bo.id).name;
  }
  function bonusValue(bo) {
    if (bo.pts) return T('bonus.pts', { n: fmtNum(bo.pts) });
    if (bo.feux) return T('bonus.feux', { n: bo.feux });
    if (bo.cash) return T('bonus.cash', { money: L.money(bo.cash) });
    return T('bonus.mult', { n: L.dec(bo.mult) });
  }

  // Après la chaîne : chaque bonus tombe l'un après l'autre sur le calcul, puis la mèche brûle et le total explose.
  function finishChain() {
    const r = st.anim.res;
    st.anim = null;
    st.phase = 'score';
    let t = 160, pts = r.base, feux = r.count, mult = 1;
    r.bonus.forEach((bo, i) => {
      later(() => {
        if (bo.pts) pts += bo.pts;
        if (bo.feux) feux += bo.feux;
        if (bo.mult) mult *= bo.mult;
        setCalc(pts, feux * mult, false);
        juice($(bo.pts ? 'chips' : 'mult').parentElement, bo.mult ? 0.45 : 0.3);
        A.bonus(i, !!bo.mult);
        if (bo.mult) freeze(35);
        vibrate(15);
        cam.shake += bo.mult ? 4 : 2;
        const color = bo.pts ? CHIPS : bo.cash ? GOLD : MULT;
        if (i === 0) fx.wave = null;
        fx.texts.push({ x: W / 2, y: TEXT_TOP + i * 28, text: `${bonusName(bo)} ${bonusValue(bo)}`, color, life: 0, max: 0.6 + (r.bonus.length - i) * BONUS_MS / 1000 + 0.9, size: 19, still: true });
      }, t);
      t += BONUS_MS;
    });
    if (r.grumpy) {
      later(() => {
        fx.texts.push({ x: W / 2, y: H * 0.5, text: T('chain.voisin', { min: R.bossRules(mods()).grumpy }), color: MULT, life: 0, max: 1.6, size: 15, still: true });
        A.lose();
      }, t);
      t += 600;
    }
    later(() => burnFuse(), t);
    later(() => scoreChain(r), t + FUSE_MS);
  }

  function burnFuse() {
    const calc = $('top').querySelector('.calc');
    calc.classList.remove('burn', 'blast');
    void calc.offsetWidth;
    calc.classList.add('burn');
    A.fuse(FUSE_MS / 1000);
  }

  function scoreChain(r) {
    const calc = $('top').querySelector('.calc');
    calc.classList.remove('burn');
    calc.classList.add('blast');
    setTimeout(() => calc.classList.remove('blast'), 400);
    st.score += r.score;
    let refund = false;
    if (st.perks.etincelle && r.count < 3 && st.refunds < R.MAX_REFUNDS) { st.refunds++; st.shots++; refund = true; }
    let reflex = false;
    if (st.perks.reflexe && !st.reflex && r.colors >= R.REFLEX_KINDS) { st.reflex = true; st.shots++; reflex = true; }
    let bis = false;
    if (st.perks.bis && !st.bis && r.count >= R.BIS_COUNT) { st.bis = true; st.shots++; bis = true; }
    st.follet = { pts: 0, n: 0 };
    st.night.scores.push(r.score);
    if (r.count >= R.BIS_COUNT) st.night.big++;
    M.record('chain', { count: r.count, score: r.score });
    M.best('bestGold', r.waves.reduce((m, w) => m + w.filter(f => f.ed === 'dore').length, 0));
    if (r.score === 0) M.grant('mouille');
    if (st.grid.every(row => row.every(c => !c.type || c.burnt))) M.grant('rase');
    const tip = st.perks.pourboire && r.count >= 12;
    const cash = r.cash + (tip ? 1 : 0);
    st.run.chain = Math.max(st.run.chain, r.count);
    st.run.shot = Math.max(st.run.shot, r.score);
    st.run.total += r.count;
    const oneShot = st.used === 1 && r.score >= target();
    if (oneShot) {
      st.run.oneShots++;
      M.best('bestOneShots', st.run.oneShots);
      if (bossId() === 'nuitnoire') M.grant('noir');
    }
    const big = r.count >= 15 || oneShot;
    fx.texts.push({ x: W / 2, y: H * 0.44, text: '+' + fmtNum(r.score), color: big ? '#fff3c4' : '#ffffff', life: 0, max: 1.4, size: big ? 58 : 42, glow: big });
    let y = H * 0.44 + 46;
    if (refund) { fx.texts.push({ x: W / 2, y, text: T('chain.etincelle'), color: GOLD, life: 0, max: 1.5, size: 15 }); y += 24; }
    if (reflex) { fx.texts.push({ x: W / 2, y, text: T('chain.reflexe'), color: GOLD, life: 0, max: 1.5, size: 15 }); y += 24; }
    if (bis) { fx.texts.push({ x: W / 2, y, text: T('chain.bis'), color: GOLD, life: 0, max: 1.5, size: 15 }); y += 24; }
    for (const id of R.afterChain(st, r)) {
      fx.texts.push({ x: W / 2, y, text: T('chain.grows', { name: L.entry('perks', id).name, tag: PERK_TAG[id]() }), color: MULT, life: 0, max: 1.6, size: 15 });
      y += 24;
    }
    if (cash) {
      st.money += cash;
      if (tip) fx.texts.push({ x: W / 2, y, text: T('chain.pourboire', { money: L.money(1) }), color: GOLD, life: 0, max: 1.5, size: 15 });
      later(() => { juice($('money').parentElement, 0.4); A.cash(false); }, 250);
    }
    A.blast(big);
    A.cash(big);
    // Salve de fusées aux couleurs des feux de la chaîne, plus fournie pour les grosses.
    const volley = r.count >= 25 ? 8 : big ? 5 : r.count >= 8 ? 2 : 0;
    if (volley) {
      const cols = chainColors(r);
      for (let i = 0; i < (calm ? Math.min(2, volley) : volley); i++) skyRocket(cols[Math.floor(Math.random() * cols.length)], 0.1 + i * 0.16, big && i % 3 === 0);
    }
    juice($('top').querySelector('.score'), big ? 0.35 : 0.2);
    if (oneShot) calc.classList.add('fire');
    if (st.score >= target()) $('top').querySelector('.score').classList.add('fire');
    const mid = GY + (ROWS * CELL) / 2;
    if (big) {
      shakeApp(14); kick(0.7); cam.shake += 6; cam.zoom = Math.min(0.12, cam.zoom + 0.05);
      freeze(110);
      A.surge(4);
      shock(W / 2, mid, '#fff3c4', 20, 320, 0.7);
      shock(W / 2, mid, GOLD, 10, 220, 0.55);
    } else {
      kick(0.25);
      freeze(r.count >= 6 ? 45 : 0);
      shock(W / 2, mid, '#ffffff', 16, 140 + r.count * 8, 0.45);
    }
    const tier = R.crowdTier(r.score, target());
    const gain = R.crowdGain(r.score, target(), st.crowdNight);
    if (gain) {
      st.crowd += gain;
      st.crowdNight += gain;
      later(() => {
        fx.texts.push({ x: W - 80, y: BAND_Y - 14, text: T('fx.crowd', { n: gain }), color: GOLD, life: 0, max: 1.6, size: 17 });
        A.cash(false);
        vibrate(20);
        tipCrowd();
      }, 300);
    }
    const cheers = T('cheers');
    const cheer = tier >= R.CROWD_FULL ? cheers[3] : tier ? cheers[2] : r.count >= 10 ? cheers[1] : r.count >= 5 ? cheers[0] : '';
    if (cheer) { fx.cheer = 1; fx.cheerText = cheer; }
    if (r.count >= 15) goldenBouquet(r.count >= 25 ? 9 : 5);
    if (oneShot) celebrate();
    showUnlocks(M.check({ type: 'chain', r }));
    later(() => {
      R.settle(st.grid, r);
      refill(r);
      st.phase = 'fall';
      updateHud();
    }, 450);
    updateHud();
  }

  // Le ciel se recharge. Un feu posé au milieu du ciel ne peut pas tomber d'en haut : il descend en parachute.
  function refill(res) {
    for (const q of R.gravity(st.grid, res, st.bag, mods(), st.sky)) {
      const c = st.grid[q.y][q.x];
      c.dy = 0.9;
      c.chute = 1;
    }
  }

  function afterFall() {
    if (st.score >= target()) { st.phase = 'pause'; later(() => showRecap(true), partyOn ? 2200 : 900); }
    else if (st.shots <= 0) { st.phase = 'pause'; later(() => showRecap(false), 900); }
    else {
      st.phase = 'aim';
      // Reprise d'une run fermée en pleine chaîne : on rejoue l'allumette.
      if (st.pending) { const p = st.pending; st.pending = null; st.skipMeteor = false; fire(p.x, p.y, p.also); return; }
      if (!st.burnChecked) {
        st.burnChecked = true;
        const gone = R.burnout(st.grid, mods());
        if (gone.length) { burnOut(gone); return; }
      }
      if (st.perks.meteore && !st.skipMeteor) {
        const p = R.meteor(st.grid, st.sky);
        if (p) fx.meteors.push({ x: p.x, y: p.y, life: 0, max: 0.45 });
      }
      st.skipMeteor = false;
      R.markAlone(st.grid, mods());
      tipAlone();
      showCrowdTip();
      tipNudge();
      saveRun('aim');
    }
    updateHud();
  }

  // Les feux restés seuls depuis l'allumette d'avant s'éteignent dans un nuage de fumée, puis le ciel comble les trous.
  function burnOut(gone) {
    st.phase = 'pause';
    for (const k of gone) {
      const x = k % COLS, y = Math.floor(k / COLS), p = cellCenter(x, y);
      st.grid[y][x].burnt = true;
      for (let i = 0; i < 24; i++) {
        fx.particles.push({ x: p.x + (Math.random() - 0.5) * 22, y: p.y + (Math.random() - 0.5) * 14, vx: (Math.random() - 0.5) * 36, vy: -20 - Math.random() * 50,
          life: 0, max: 0.8 + Math.random() * 0.7, color: Math.random() < 0.5 ? '#9aa0aa' : '#6a707a', size: 2 + (Math.random() < 0.4 ? 1 : 0), smoke: true });
      }
    }
    const first = cellCenter(gone[0] % COLS, Math.floor(gone[0] / COLS));
    fx.texts.push({ x: Math.max(70, Math.min(W - 70, first.x)), y: Math.max(20, first.y - 30), text: T('chain.eteint', { n: gone.length }), color: '#b8bcc6', life: 0, max: 1.4, size: 13 });
    A.fizzle();
    vibrate(15);
    M.record('fizzle', gone.length);
    R.onBurnout(st, gone.length);
    st.night.fizzled += gone.length;
    if (st.perks.follet) {
      const m = mods();
      st.follet = { pts: st.follet.pts + gone.reduce((s, k) => s + R.ptsOf(st.grid[Math.floor(k / COLS)][k % COLS].type, m), 0), n: st.follet.n + gone.length };
      fx.texts.push({ x: W / 2, y: Math.max(56, first.y + 6), text: T('chain.follet', { n: st.follet.pts }), color: '#7cf2d0', life: 0, max: 1.5, size: 13 });
    }
    if (st.perks.cendres) {
      st.money += gone.length;
      fx.texts.push({ x: Math.max(70, Math.min(W - 70, first.x)), y: Math.max(38, first.y - 12), text: T('chain.cendres', { money: L.money(gone.length) }), color: GOLD, life: 0, max: 1.5, size: 13 });
      later(() => { juice($('money').parentElement, 0.4); A.cash(false); }, 200);
    }
    later(() => {
      refill({ gone });
      st.phase = 'fall';
      updateHud();
    }, 380);
    updateHud();
  }

  // Grosses gerbes dorées dans le ciel pour les très longues chaînes.
  function goldenBouquet(n) {
    vibrate([40, 30, 80, 30, 120]);
    for (let k = 0; k < n; k++) {
      const cx = 30 + Math.random() * (W - 60), cy = 30 + Math.random() * (BAND_Y * 0.55);
      const color = k % 3 === 0 ? '#fff3c4' : k % 3 === 1 ? GOLD : '#ff7a1a';
      setTimeout(() => {
        for (let i = 0; i < 40; i++) {
          const a = (i / 40) * Math.PI * 2, v = 90 + Math.random() * 120;
          fx.particles.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 1.1 + Math.random() * 0.6, color, size: 2 });
        }
        fx.flash = Math.min(1, fx.flash + 0.25);
        cam.shake += 2;
        A.boom(6 + k, 6);
      }, k * 140);
    }
  }

  // ---------- Récap de fin de soirée (façon Balatro : tout s'affiche au fur et à mesure) ----------
  let reveal = null;

  function line(label, small, val, valCls) {
    const el = document.createElement('div');
    el.className = 'line';
    el.innerHTML = `<span class="lbl">${label}${small ? `<small>${small}</small>` : ''}</span><b class="val ${valCls || ''}">${val}</b>`;
    return el;
  }

  function loadBest() { try { return JSON.parse(localStorage.getItem('bf-best')) || null; } catch (e) { return null; } }

  function showRecap(win) {
    st.phase = 'menu';
    A.setUrgent(false);
    A.setBoss(null);
    BG.setMode('menu');
    const n = st.round + 1;
    const last = st.round === R.TARGETS.length - 1 && !st.endless;
    const demoEnd = DEMO && win && !st.endless && st.round === DEMO - 1;
    // Fin de run : un air à part. Une soirée gagnée au milieu de la run garde la musique, jusqu'à la boutique.
    if (!win) { A.setMood('normal'); A.setScene('defaite'); }
    else if (last || demoEnd) { A.setMood('final'); A.setScene('victoire'); }
    const boss = bossId();
    if (win) { R.onRoundWon(st, boss); M.record('night', { night: n, endless: st.endless }); nightSucces(boss); }
    if (win) A.win(); else { A.lose(); BG.setPalette('couvrefeu'); }
    $('recap-title').textContent = !win ? T('recap.lose') : demoEnd ? T('demo.end') : last ? T('recap.final') : boss ? T('recap.boss', { name: bossText(boss).name }) : T('recap.win', { n });
    $('recap-title').style.color = win ? '' : 'var(--mult)';
    $('recap-target').textContent = T('recap.target', { target: fmtNum(target()) });
    $('recap-score').textContent = '0';
    $('recap-bar').style.width = '0';
    $('recap-bar').classList.toggle('done', win);

    const steps = [];
    $('recap-money').classList.add('hidden');
    $('recap-run').classList.add('hidden');
    for (const id of ['btn-cashout', 'btn-endless', 'btn-again', 'btn-recap-home', 'btn-demo']) $(id).classList.add('hidden');
    if (win) st.carry = R.carryOf(st, st.shots);
    const income = win ? R.income(st, st.round, st.shots, st.score / target()) : [];
    const total = income.reduce((m, [, v]) => m + v, 0);
    const interest = (income.find(l => l[0] === 'interest') || [0, 0])[1];
    if (win) st.run.streak = interest >= 5 ? (st.run.streak || 0) + 1 : 0;
    const unlocked = win ? M.check({
      type: 'night', round: st.round, shots: st.shots, used: st.used, kinds: Object.keys(st.bag).length, money: st.money + (last ? 0 : total),
      boss, levels: st.levels, scores: st.night.scores, big: st.night.big, fizzled: st.night.fizzled, streak: st.run.streak,
    }) : [];
    let buttons;
    if (win && !last && !demoEnd) {
      const box = $('recap-income');
      box.innerHTML = '';
      for (const [id, v, k] of income) {
        const el = line(T('income.' + id, { n: k }), '', '+' + L.money(v), 'gold');
        box.appendChild(el);
        steps.push({ el, sound: () => A.cash(false), section: 'recap-money' });
      }
      if (st.carry) {
        const el = line(T('income.reserve', { n: st.carry }), '', T('income.reserveVal', { n: st.carry }), 'chips');
        box.appendChild(el);
        steps.push({ el, sound: () => A.chip(8), section: 'recap-money' });
      }
      $('btn-cashout').textContent = T('recap.cashout', { money: L.money(total) });
      $('btn-cashout').onclick = () => {
        if (reveal) return finishReveal();
        A.cash(true);
        vibrate(30);
        st.money += total;
        const beat = !!boss;
        openShop();
        if (beat) { st.reward = bossReward(); saveRun('shop'); openPackScreen(true); }
      };
      buttons = ['btn-cashout'];
    } else {
      const nights = win ? st.round + 1 : st.round;
      const box = $('recap-stats');
      box.innerHTML = '';
      const stats = [
        [T('run.nights'), st.endless ? `${nights} ∞` : `${nights}/${R.TARGETS.length}`],
        [T('run.chain'), T('run.feux', { n: st.run.chain })],
        [T('run.shot'), fmtNum(st.run.shot)],
      ];
      let record = false, banner = '';
      // Une run ne compte qu'une fois, même si elle continue en mode infini après la soirée 8. La fin de la démo n'est pas une run gagnée.
      if (!st.runDone && !demoEnd) {
        st.runDone = true;
        M.record('run', { sac: st.mod.sac, win, calibre: st.calibre });
        unlocked.push(...M.check({ type: 'run', win, round: st.round, calibre: st.calibre, sac: st.mod.sac, runs: M.stats.runs }));
        const cal = win ? M.winCalibre(st.calibre, st.mod.sac) : 0;
        if (cal) {
          const sac = sacText(st.mod.sac).name;
          banner = T('unlock.calibre', { n: cal, sac });
          unlocked.push({ calibre: cal, sac });
        }
        if (win) runSucces();
      }
      stats.push([T('run.total'), fmtNum(st.run.total)]);
      const prev = loadBest() || { night: 0, chain: 0 };
      const night = Math.min(nights, R.TARGETS.length);
      record = night > prev.night || st.run.chain > prev.chain || (st.endless && nights > (st.endlessBest || 0));
      if (record) localStorage.setItem('bf-best', JSON.stringify({ night: Math.max(night, prev.night), chain: Math.max(st.run.chain, prev.chain) }));
      clearRun();
      for (const [lbl, v] of stats) steps.push({ el: box.appendChild(line(lbl, '', v, 'gold')), sound: i => A.chip(10 + i * 2), section: 'recap-run' });
      for (const txt of [record && T('run.record'), banner].filter(Boolean)) {
        const el = document.createElement('div');
        el.className = 'line record';
        el.textContent = txt;
        steps.push({ el: box.appendChild(el), sound: () => A.win(), section: 'recap-run' });
      }
      if (!win && M.unlockNudge()) {
        const el = document.createElement('p');
        el.className = 'nudge-help';
        el.innerHTML = `<b>${T('nudge.help')}</b><span>${T('nudge.helpDesc')}</span>`;
        steps.push({ el: box.appendChild(el), sound: () => A.cash(false), section: 'recap-run' });
      }
      if (demoEnd) {
        const el = document.createElement('p');
        el.className = 'nudge-help';
        el.innerHTML = `<b>${T(boss ? 'demo.endBoss' : 'demo.endTitle')}</b><span>${T('demo.endDesc', { from: DEMO + 1, to: R.TARGETS.length })}</span>`;
        steps.push({ el: box.appendChild(el), sound: () => A.cash(false), section: 'recap-run' });
      }
      buttons = demoEnd ? ['btn-demo', 'btn-recap-home'] : ['btn-again', 'btn-recap-home'];
      if (win && !demoEnd) {
        buttons.unshift('btn-endless');
        $('btn-endless').onclick = () => {
          if (reveal) return finishReveal();
          A.cash(true);
          vibrate(30);
          st.endless = true;
          st.endlessBest = M.stats.bestEndless;
          st.money += total;
          openShop();
        };
      }
    }
    if (unlocked.length) setTimeout(() => showUnlocks(unlocked), 900);

    $('recap').classList.remove('hidden');
    $('recap-skip').classList.remove('hidden');
    $('recap').querySelector('.recap-body').scrollTop = 0;
    // Le score de la soirée grimpe, puis chaque ligne arrive l'une après l'autre.
    const goal = st.score;
    reveal = { steps, i: 0, buttons, timer: 0, t0: performance.now(), goal, pct: Math.min(100, (goal / target()) * 100) };
    countScore();
    reveal.timer = setTimeout(nextStep, 750);
  }

  function nightSucces(boss) {
    st.run.maxUsed = Math.max(st.run.maxUsed, st.used);
    M.best('bestNightScore', st.score);
    if (boss) M.record('boss', boss);
    if (st.score >= 2 * target()) M.grant('ecart');
    if (st.shots === 0 && st.score < target() * 1.05) M.grant('fil');
    const h = new Date().getHours();
    if (h >= 2 && h < 5) M.grant('insomnie');
  }
  function runSucces() {
    if (st.run.maxUsed <= 2) M.grant('efficace');
    if (R.perkCount(st) <= 2) M.grant('minimaliste');
    if (!st.run.feu) M.grant('fidele');
    if (!st.run.perk) M.grant('mains');
  }
  // Ce qu'on vient de prendre, à l'étal ou dans un paquet.
  function takeSucces(ch) {
    if (ch.kind === 'feux') st.run.feu = true;
    if (ch.kind === 'perks') st.run.perk = true;
    M.best('bestPerks', R.perkCount(st));
    M.best('bestLevel', Math.max(1, ...Object.values(st.levels)));
  }

  function countScore() {
    if (!reveal) return;
    const k = Math.min(1, (performance.now() - reveal.t0) / 650);
    $('recap-score').textContent = fmtNum(reveal.goal * k);
    $('recap-bar').style.width = reveal.pct * k + '%';
    if (k < 1) requestAnimationFrame(countScore);
  }

  function nextStep() {
    const rv = reveal;
    if (!rv) return;
    if (rv.i >= rv.steps.length) return endReveal();
    const s = rv.steps[rv.i];
    if (s.section) $(s.section).classList.remove('hidden');
    s.el.classList.add('in');
    s.el.scrollIntoView({ block: 'nearest' });
    s.sound(rv.i);
    juice(s.el.querySelector('.val'), 0.3);
    rv.i++;
    rv.timer = setTimeout(nextStep, 330);
  }

  function endReveal() {
    const rv = reveal;
    reveal = null;
    $('recap-skip').classList.add('hidden');
    $('recap-score').textContent = fmtNum(rv.goal);
    $('recap-bar').style.width = rv.pct + '%';
    for (const id of rv.buttons) { $(id).classList.remove('hidden'); juice($(id), 0.2); }
  }

  function finishReveal() {
    const rv = reveal;
    if (!rv) return;
    clearTimeout(rv.timer);
    for (const s of rv.steps) { if (s.section) $(s.section).classList.remove('hidden'); s.el.classList.add('in'); }
    endReveal();
  }
  $('recap').addEventListener('click', e => { if (reveal && !e.target.closest('button')) { A.click(); finishReveal(); } });

  // ---------- Boutique ----------
  let shopRows = [], shopSel = null;

  // resume : on revient d'une run sauvegardée en boutique, avec les mêmes articles.
  function openShop(resume) {
    if (!resume) { st.rerolls = 0; st.shop = R.shop(st, Math.random); markFresh(); }
    skipArmed = false;
    st.phase = 'menu';
    hideScreens();
    BG.setMode('menu');
    A.setMood('normal');
    A.setBoss(null);
    A.setUrgent(false);
    A.setScene('boutique', st.round);
    // Le prochain boss, même s'il est dans plusieurs soirées : on prépare son ciel dès la boutique.
    let at = -1;
    for (let r = st.round + 1; r <= st.round + 3 && at < 0; r++) { ensureBoss(r); if (st.bosses[r]) at = r; }
    if (at >= 0) {
      const bt = bossText(st.bosses[at]), soon = at === st.round + 1;
      $('shop-boss').innerHTML = T(soon ? 'shop.nextBoss' : 'shop.laterBoss', { n: at + 1, k: at - st.round, name: bt.name, desc: bt.desc });
      $('shop-boss').classList.toggle('later', !soon);
    }
    $('shop-boss').classList.toggle('hidden', at < 0);
    renderShop();
    $('shop-screen').classList.remove('hidden');
    $('shop').scrollTop = 0;
    saveRun('shop');
  }

  // Contenu débloqué qui passe en boutique pour la première fois : étiquette « Nouveau ! ».
  const freshIds = list => list.filter(c => c.kind === 'perks' || c.kind === 'feux').map(c => c.id).filter(id => M.isUnlocked(id) && M.newInShop(id));
  function markFresh() { st.shop.fresh = freshIds(st.shop.cards); }
  function tagNew(el) {
    const tag = document.createElement('i');
    tag.className = 'new';
    tag.textContent = T('shop.new');
    el.appendChild(tag);
  }

  // ---------- Ouvrir un paquet : il tremble, explose en feu d'artifice, et ses cartes s'étalent ----------
  // st.reward : { from: 'pack' | 'boss' | 'heir', pack, size, keep, choices, taken: [indices], fresh }.
  // 'heir' : le légendaire du sac de l'héritier, choisi au début de la soirée 1 ; on revient ensuite au ciel, pas à la boutique.
  const packSky = makeSky($('pack-fx'), 2);
  let packView = null;

  function bossReward() {
    return { from: 'boss', pack: 'comete', size: 'normal', keep: 1, choices: R.bossRewards(st, Math.random), taken: [], fresh: [] };
  }
  function packLeft(rw) { return Math.min(rw.keep || 1, rw.choices.length) - rw.taken.length; }
  const packWhere = rw => (rw.from === 'heir' ? 'aim' : 'shop');

  function openPackScreen(intro) {
    const rw = st.reward;
    if (!rw.taken) rw.taken = [];
    if (!PACK_LOOK[rw.pack]) rw.pack = 'comete';
    rw.size = rw.size || 'normal';
    const boss = rw.from !== 'pack', look = PACK_LOOK[rw.pack];
    const scr = $('pack');
    scr.style.setProperty('--pk', boss ? GOLD : look.color);
    $('pack-title').textContent = rw.from === 'heir' ? T('pick.heir') : boss ? T('pick.boss') : L.entry('packs', rw.pack).name;
    $('pack-skip').textContent = T('pick.skip');
    $('pack-cards').innerHTML = '';
    const box = $('pack-box');
    box.innerHTML = '';
    box.className = '';
    packView = { rw, sel: -1, els: [], busy: true, burst: false, timer: 0, next: performance.now() + 900 };
    renderOwned();
    updatePackSub();
    scr.classList.remove('hidden');
    if (!intro) { box.className = 'gone'; deal(false); return; }
    box.appendChild(packArt(rw.pack, boss ? 'mega' : rw.size));
    const tip = document.createElement('small');
    tip.textContent = T('pack.tap');
    box.appendChild(tip);
    box.className = 'in';
    infoHint($('pack-info'), '');
    A.card();
    packView.timer = setTimeout(() => {
      if (!packView || packView.burst) return;
      box.className = 'shake';
      A.fuse(0.8);
      vibrate([10, 60, 10, 60, 10]);
      packView.timer = setTimeout(burst, 800);
    }, 500);
  }
  $('pack-box').addEventListener('click', () => burst());

  // Le paquet saute : un bouquet au milieu de l'écran, aux couleurs du paquet, et les cartes en sortent.
  function burst() {
    const v = packView;
    if (!v || v.burst || $('pack-box').classList.contains('gone')) return;
    v.burst = true;
    clearTimeout(v.timer);
    $('pack-box').className = 'gone';
    const r = $('pack-stage').getBoundingClientRect(), k = packSky.k;
    const color = getComputedStyle($('pack')).getPropertyValue('--pk').trim() || GOLD;
    skyStep(packSky, 0);
    packSky.rockets.push({ x: (r.left + r.width / 2) / k, y: (r.top + r.height * 0.45) / k, vy: -1, top: Infinity, wait: 0, big: true, color });
    for (let i = 0; i < 4; i++) launch(packSky, { wait: 0.15 + i * 0.18, high: true });
    const scr = $('pack');
    scr.classList.remove('flash'); void scr.offsetWidth; scr.classList.add('flash');
    A.blast(true);
    vibrate([40, 30, 90]);
    shakeApp(10);
    deal(true);
  }

  function deal(anim) {
    const v = packView, rw = v.rw, box = $('pack-cards');
    const n = rw.choices.length;
    box.innerHTML = '';
    box.classList.toggle('many', n > 3);
    v.els = rw.choices.map((ch, i) => {
      const el = makeCard(ch, rw.pack);
      const k = i - (n - 1) / 2;
      el.classList.add('dealt');
      el.style.setProperty('--x', k);
      el.style.setProperty('--r', (k * (n > 3 ? 4 : 5)) + 'deg');
      el.style.setProperty('--y', (k * k * (n > 3 ? 4 : 6)) + 'px');
      el.style.zIndex = String(10 - Math.round(Math.abs(k)));
      if ((rw.fresh || []).includes(ch.id) && !rw.taken.includes(i)) tagNew(el.querySelector('.face'));
      if (rw.taken.includes(i)) el.classList.add('taken');
      if (!R.choiceOk(st, ch)) el.classList.add('cant');
      if (anim) { el.classList.add('from', 'down'); el.style.transitionDelay = (i * 0.07) + 's'; }
      el.addEventListener('click', () => selectPack(i));
      box.appendChild(el);
      return el;
    });
    if (anim) {
      requestAnimationFrame(() => requestAnimationFrame(() => { for (const el of v.els) el.classList.remove('from'); }));
      v.els.forEach((el, i) => setTimeout(() => { el.classList.remove('down'); el.style.transitionDelay = ''; A.card(); }, 380 + i * 90));
      setTimeout(() => { if (packView === v) v.busy = false; }, 420 + n * 90);
    } else v.busy = false;
    renderPackInfo();
  }

  function updatePackSub() {
    const rw = packView.rw;
    $('pack-sub').textContent = T('pack.sub', { n: packLeft(rw), total: rw.choices.length, feux: packOfFeux(rw) });
  }
  const packOfFeux = rw => rw.choices.every(c => c.kind === 'feux' || c.kind === 'retrait');

  // Vendre depuis l'arsenal pendant un colis ouvert : les places se libèrent tout de suite.
  function refreshOpenPack() {
    if (!packView) return;
    renderOwned();
    const rw = packView.rw;
    packView.els.forEach((el, j) => {
      if (!rw.taken.includes(j)) el.classList.toggle('cant', !R.choiceOk(st, rw.choices[j]));
    });
    if (packView.els.length) renderPackInfo();
  }

  // En haut de l'écran : les bonus et les outils qu'on a déjà, pour choisir en connaissance de cause.
  function renderOwned() {
    const box = $('pack-owned');
    box.innerHTML = '';
    for (const p of R.PERKS.filter(q => st.owned[q.id])) box.appendChild(perkCard(p));
    for (let i = R.perkCount(st); i < R.slotsOf(st); i++) { const e = document.createElement('div'); e.className = 'pcard slot'; box.appendChild(e); }
    const sep = document.createElement('span');
    sep.className = 'sep';
    box.appendChild(sep);
    for (let i = 0; i < R.toolSlots(st); i++) box.appendChild(st.tools[i] ? iconCard('g:' + st.tools[i], 'tool') : Object.assign(document.createElement('div'), { className: 'pcard slot' }));
  }

  function selectPack(i) {
    const v = packView;
    if (!v || v.busy || v.rw.taken.includes(i)) return;
    if (v.sel === i) { takePack(i); return; }
    v.sel = i;
    A.card();
    vibrate(10);
    v.els.forEach((el, j) => el.classList.toggle('sel', j === i));
    renderPackInfo();
  }

  function renderPackInfo() {
    const v = packView, box = $('pack-info');
    if (v.sel < 0) { infoHint(box, T('pack.hint', { feux: packOfFeux(v.rw) })); return; }
    const ch = v.rw.choices[v.sel], ok = R.choiceOk(st, ch);
    renderInfo(box, cardInfo(ch), ok ? T('pack.take') : T('shop.full'), ok, () => takePack(v.sel));
  }

  function takePack(i) {
    const v = packView;
    if (!v || v.busy) return;
    const ch = v.rw.choices[i], el = v.els[i];
    if (!R.choiceOk(st, ch)) { A.click(); vibrate(20); el.classList.remove('nope'); void el.offsetWidth; el.classList.add('nope'); return; }
    // Retrait : l'arsenal s'ouvre pour choisir le feu, puis removeFeu() termine.
    if (ch.kind === 'retrait') { openArsenal({ choice: i }); return; }
    R.takeChoice(st, ch, Math.random);
    afterTake(i);
  }

  function afterTake(i) {
    const v = packView, rw = v.rw, ch = rw.choices[i];
    if (ch.kind === 'perks') M.record('perk', ch.id);
    takeSucces(ch);
    rw.taken.push(i);
    A.cash(true);
    vibrate(30);
    v.els[i].classList.remove('sel');
    v.els[i].classList.add('taken');
    v.sel = -1;
    renderOwned();
    updateHud();
    refreshOpenPack();
    if (packLeft(rw) <= 0) { closePack(550); return; }
    updatePackSub();
    renderPackInfo();
    saveRun(packWhere(rw));
  }

  // Les cartes qui restent repartent vers le bas, puis on revient à la boutique.
  function closePack(delay) {
    const v = packView;
    if (!v) return;
    v.busy = true;
    clearTimeout(v.timer);
    const where = packWhere(v.rw);
    st.reward = null;
    saveRun(where);
    setTimeout(() => { for (const el of v.els) if (!el.classList.contains('taken')) el.classList.add('gone'); }, delay);
    setTimeout(() => {
      if (packView !== v) return;
      packView = null;
      $('pack').classList.add('hidden');
      if (where === 'shop') renderShop();
      else updateHud();
    }, delay + 380);
  }
  $('pack-skip').addEventListener('click', () => { if (!packView || packView.busy && packView.burst) return; A.click(); closePack(0); });

  function packStep(dt, now) {
    if (!packView) return;
    if (now > packView.next) { packView.next = now + 1400 + Math.random() * 1600; launch(packSky, { high: true }); }
    skyStep(packSky, dt);
  }

  let skipArmed = false;
  function renderSkip() {
    const btn = $('btn-skip'), s = st.shop, n = st.round + 1;
    const ok = s && s.skip && R.canSkip(st, n);
    btn.classList.toggle('hidden', !ok);
    btn.classList.toggle('armed', skipArmed);
    if (!ok) return;
    const reward = T('skip.' + s.skip.id, { money: L.money(s.skip.money) });
    btn.innerHTML = skipArmed ? T('skip.confirm', { n: n + 1, reward })
      : `${T('skip.label', { n: n + 1 })}<small>${T('skip.desc', { n: n + 2, reward })}</small>`;
  }

  $('btn-skip').addEventListener('click', () => {
    if (!skipArmed) { skipArmed = true; A.click(); renderSkip(); return; }
    skipArmed = false;
    const s = st.shop.skip;
    if (s.id === 'outil' && R.toolRoom(st)) st.tools.push(R.randomTool(st, Math.random));
    else st.money += s.money;
    M.record('skips');
    A.cash(true);
    vibrate(30);
    st.round += 2;
    startRound();
  });

  // Un article de la boutique : une carte de l'étal (list 'cards') ou un paquet (list 'packs').
  function itemPrice(it) { return price(it.list === 'cards' ? R.cardPrice(it.src) : R.packPrice(it.src)); }
  function itemFull(it) { return it.list === 'cards' ? !R.choiceOk(st, it.src) : !R.packOk(st, it.src); }
  function itemInfo(it) {
    if (it.list === 'cards') return cardInfo(it.src);
    const pk = it.src;
    return { cls: 'paquet', label: pk.size === 'mega' ? T('pack.mega') : T('shop.packLabel'), name: L.entry('packs', pk.id).name, desc: `${L.entry('packs', pk.id).desc} ${T('pack.size.' + pk.size)}` };
  }

  function packEl(pk) {
    const el = document.createElement('div');
    el.className = 'pack ' + pk.size;
    el.style.setProperty('--pk', PACK_LOOK[pk.id].color);
    const art = document.createElement('div');
    art.className = 'pack-art';
    art.appendChild(packArt(pk.id, pk.size));
    el.appendChild(art);
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = T('pack.badge.' + pk.size);
    art.appendChild(badge);
    const nm = document.createElement('b');
    nm.className = 'nm';
    nm.textContent = L.entry('packs', pk.id).name;
    el.appendChild(nm);
    return el;
  }

  function renderShop() {
    shopRows = [];
    shopSel = null;
    let k = 0;
    for (const list of ['cards', 'packs']) {
      const box = $('shop-' + list);
      box.innerHTML = '';
      if (!st.shop[list].length) {
        const e = document.createElement('div');
        e.className = 'shop-empty';
        e.textContent = T('shop.empty');
        box.appendChild(e);
      }
      for (const src of st.shop[list]) {
        const it = { list, src };
        const el = list === 'cards' ? makeCard(src) : packEl(src);
        el.classList.add('ware');
        el.style.animationDelay = (k * 0.08) + 's';
        if (list === 'cards' && (st.shop.fresh || []).includes(src.id)) tagNew(el.querySelector('.face'));
        const tag = document.createElement('i');
        tag.className = 'price';
        el.appendChild(tag);
        const row = { el, it, price: tag };
        el.addEventListener('click', () => selectWare(row));
        box.appendChild(el);
        shopRows.push(row);
        setTimeout(() => A.card(), 150 + k * 80);
        k++;
      }
    }
    refreshShop();
  }

  // Premier toucher : on voit l'article dans la fiche ; second toucher : on l'achète.
  function selectWare(row) {
    if (row.el.classList.contains('picked')) return;
    if (shopSel === row) { buy(row); return; }
    shopSel = row;
    A.card();
    vibrate(10);
    refreshShop();
  }

  function refreshShop() {
    for (const r of shopRows) {
      const full = itemFull(r.it), cost = itemPrice(r.it);
      r.price.textContent = full ? T('shop.full') : L.money(cost);
      r.price.classList.toggle('full', full);
      r.el.classList.toggle('cant', full || cost > st.money);
      r.el.classList.toggle('sel', r === shopSel);
    }
    const box = $('shop-info');
    if (!shopSel) infoHint(box, T('shop.hint'));
    else {
      const it = shopSel.it, full = itemFull(it), cost = itemPrice(it);
      const text = full ? T('shop.full') : cost > st.money ? T('shop.poor') : T(it.list === 'packs' ? 'shop.open' : 'shop.buy', { price: L.money(cost) });
      const row = shopSel;
      renderInfo(box, itemInfo(it), text, !full && cost <= st.money, () => buy(row));
    }
    renderSkip();
    $('purse').textContent = L.money(st.money);
    const cost = R.rerollPrice(st, st.rerolls);
    $('btn-reroll').textContent = T('reroll', { price: L.money(cost) });
    $('btn-reroll').disabled = cost > st.money;
    updateHud();
  }

  function buy(row) {
    const { it, el } = row;
    if (el.classList.contains('picked')) return;
    if (el.classList.contains('cant')) {
      A.click();
      el.classList.remove('nope'); void el.offsetWidth; el.classList.add('nope');
      vibrate(20);
      return;
    }
    st.money -= itemPrice(it);
    if (it.list === 'packs') {
      const choices = R.openPack(st, it.src, Math.random);
      st.reward = { from: 'pack', pack: it.src.id, size: it.src.size, keep: R.PACK_SIZES[it.src.size].keep, choices, taken: [], fresh: freshIds(choices) };
      setTimeout(() => openPackScreen(true), 380);
      M.record('packs');
      if (it.src.size === 'mega') M.record('megas');
    } else {
      R.takeChoice(st, it.src, Math.random);
      if (it.src.kind === 'perks') M.record('perk', it.src.id);
      M.record('buys');
      takeSucces(it.src);
    }
    st.shop[it.list] = st.shop[it.list].filter(x => x !== it.src);
    shopRows = shopRows.filter(r => r !== row);
    if (shopSel === row) shopSel = null;
    A.cash(false);
    vibrate(25);
    el.classList.add('picked');
    juice($('purse'), 0.35);
    setTimeout(() => el.remove(), 400);
    refreshShop();
    saveRun('shop');
  }

  // La relance reremplie l'étal et les colis, et remplace ce qui était encore en vente.
  $('btn-reroll').addEventListener('click', () => {
    const cost = R.rerollPrice(st, st.rerolls);
    if (cost > st.money) return;
    st.money -= cost;
    st.rerolls++;
    M.best('bestRerolls', st.rerolls);
    A.click();
    st.shop = R.rerollShop(st, st.shop, Math.random);
    markFresh();
    renderShop();
    showUnlocks(M.check({ type: 'reroll', rerolls: st.rerolls }));
    saveRun('shop');
  });
  $('btn-next').addEventListener('click', () => { A.click(); st.round++; startRound(); });

  // ---------- Arsenal : tes feux et tes bonus permanents ----------
  let arsenalFromGame = false, picking = null;

  function renderArsenal() {
    $('arsenal-title').textContent = T(picking ? 'arsenal.pick' : 'arsenal.title');
    $('arsenal').classList.toggle('picking', !!picking);
    const feux = $('arsenal-feux');
    feux.innerHTML = '';
    const total = Object.values(st.bag).reduce((m, v) => m + v, 0);
    for (const id of Object.keys(TYPES).filter(k => st.bag[k])) {
      const el = document.createElement('div');
      el.className = 'feu-row';
      if (picking) {
        el.addEventListener('click', () => removeFeu(id));
        const tag = document.createElement('em');
        tag.className = 'remove';
        tag.textContent = T('arsenal.remove');
        el.appendChild(tag);
      }
      el.appendChild(copyCanvas(SPR[id]));
      const txt = document.createElement('div');
      txt.className = 'txt';
      const lv = R.levelOf(id, st);
      txt.innerHTML = `<b>${typeName(id)}<i>${T('arsenal.level', { n: lv })} · ${R.ptsOf(id, { levels: st.levels })} pts</i></b>${cap(typeDesc(id))}.`;
      el.appendChild(txt);
      const share = document.createElement('span');
      share.className = 'share';
      share.textContent = T('arsenal.share', { n: Math.round((100 * st.bag[id]) / total) });
      el.appendChild(share);
      feux.appendChild(el);
    }
    const perks = $('arsenal-perks');
    perks.innerHTML = '';
    const owned = R.PERKS.filter(p => st.owned[p.id]);
    $('arsenal-slots').textContent = `${owned.length}/${R.slotsOf(st)}`;
    if (!owned.length) perks.innerHTML = `<div class="arsenal-none">${T('arsenal.none')}</div>`;
    for (const p of owned) {
      const e = L.entry('perks', p.id);
      const el = perks.appendChild(offerRow(perkCard(p), p.rarity, L.rarity(p.rarity), e.name, e.desc));
      if (picking) continue;
      // Revendre : un premier toucher affiche le prix, un second confirme.
      const tag = document.createElement('em');
      tag.className = 'sell';
      el.appendChild(tag);
      const label = () => { tag.textContent = selling === p.id ? T('arsenal.sellConfirm', { price: L.money(R.sellPrice(p)) }) : T('arsenal.sell'); };
      label();
      el.classList.toggle('armed', selling === p.id);
      el.addEventListener('click', () => {
        A.click();
        if (selling !== p.id) { selling = p.id; renderArsenal(); return; }
        selling = null;
        R.sellPerk(st, p.id);
        st.money += R.sellPrice(p);
        M.record('sold');
        A.cash(false);
        vibrate(25);
        renderArsenal();
        refreshOpenPack();
        if (visible('shop-screen')) { refreshShop(); saveRun('shop'); }
        else {
          updateHud();
          if (packView) saveRun(packWhere(packView.rw));
          else if (st.phase === 'aim') saveRun('aim');
        }
      });
    }
    const tools = $('arsenal-tools');
    tools.innerHTML = st.tools.length ? '' : `<div class="arsenal-none">${T('arsenal.noTools', { n: R.toolSlots(st) })}</div>`;
    for (const id of st.tools) {
      const e = L.entry('tools', id);
      tools.appendChild(offerRow(iconCard('g:' + id, 'tool'), 'tool', T('shop.toolLabel'), e.name, e.desc));
    }
  }
  let selling = null;

  // pick : { choice } quand on prend la carte « Épurer ton ciel » d'un paquet ; l'arsenal sert alors à choisir le feu à retirer.
  function openArsenal(pick) {
    if (!st.bag) return;
    A.init();
    A.click();
    picking = pick && 'choice' in pick ? pick : null;
    selling = null;
    arsenalFromGame = visible('shop-screen') ? false : true;
    if (arsenalFromGame) st.paused = true;
    renderArsenal();
    $('arsenal').classList.remove('hidden');
    $('arsenal').querySelector('.arsenal-body').scrollTop = 0;
  }
  $('btn-arsenal').addEventListener('click', () => openArsenal());
  for (const el of document.querySelectorAll('.js-arsenal')) el.addEventListener('click', () => openArsenal());

  // Carte « Épurer ton ciel » d'un paquet : le feu touché dans l'arsenal disparaît du ciel.
  function removeFeu(id) {
    const pk = picking;
    if (!pk || !packView || !R.canRemove(st)) return;
    picking = null;
    packView.rw.choices[pk.choice].type = id;
    R.takeChoice(st, packView.rw.choices[pk.choice], Math.random);
    M.record('retraits');
    st.shop.cards = st.shop.cards.filter(c => (c.kind !== 'perks' || !R.perkById(c.id).type || st.bag[R.perkById(c.id).type]) && (c.kind !== 'astres' || st.bag[c.id]));
    A.boom(2, 3);
    $('arsenal').classList.add('hidden');
    afterTake(pk.choice);
  }

  // ---------- Interface en jeu ----------
  // On ne réécrit le bandeau du bas que si le texte change, sinon son défilement repartirait à chaque mise à jour.
  let hintHtml = '';
  function setHint(html) {
    const h = $('hint');
    if (html === hintHtml && h.clientHeight) return;
    hintHtml = html;
    h.innerHTML = html;
    const span = h.firstElementChild, dy = span.scrollHeight - h.clientHeight;
    h.classList.toggle('scroll', dy > 1);
    if (dy <= 1) return;
    // 1,2 s d'attente en haut, environ 11 px par seconde (1,5 s par ligne), 1,5 s d'attente en bas, puis on recommence.
    const wait = 1200, move = dy / 11 * 1000, end = 1500, total = wait + move + end;
    const at = y => `translateY(${y}px)`;
    span.animate([
      { transform: at(0), offset: 0 }, { transform: at(0), offset: wait / total },
      { transform: at(-dy), offset: (wait + move) / total }, { transform: at(-dy), offset: 1 },
    ], { duration: total, iterations: Infinity });
  }
  // Dernière allumette : la musique se serre dès qu'on la vise, et pendant le coup qui la dépense.
  // Pas pendant la chaîne qui vient juste de nous y amener, ni quand la soirée est déjà gagnée avec une allumette en poche.
  function nightUrgent() {
    if (st.phase === 'menu' || st.shots > 1) return false;
    if (st.shots === 1 && st.phase === 'chain') return false;
    if (st.shots === 1 && st.score >= target()) return false;
    return true;
  }
  function updateHud() {
    if (!st.grid) return;
    const boss = bossId();
    $('round').textContent = st.endless ? `${st.round + 1}∞` : `${st.round + 1}/${R.TARGETS.length}`;
    $('target').textContent = fmtNum(target());
    $('boss').innerHTML = boss ? T('hud.boss', bossText(boss)) : '';
    $('boss').classList.toggle('hidden', !boss);
    $('shots').textContent = st.shots;
    $('shots').parentElement.classList.toggle('low', st.shots <= 1);
    $('money').textContent = L.money(st.money);
    M.best('bestMoney', st.money);
    const sel = st.sel && st.grid[st.sel.y][st.sel.x];
    const extra = sel ? (sel.ed ? ' ' + L.entry('editions', sel.ed).desc : '') + (sel.wet ? T('hint.wet') : '') + (sel.lit ? T('hint.lit') : '')
      + (sel.alone ? T('hint.alone') : '') + (sel.type === 'double' ? T('hint.charges', { n: R.chargesOf(sel) }) : '') : '';
    const tool = st.tool && `<b>${L.entry('tools', st.tool.id).name}</b> · ${T('tool.hint.' + st.tool.id, { step: st.tool.picks.length || (st.tool.aim ? 1 : 0) })}`;
    const nudging = st.nudge && (st.nudge.from ? T('nudge.place') : T('nudge.pick', { n: st.nudges }));
    setHint(`<span>${st.phase !== 'aim' ? '&nbsp;'
      : nudging ? nudging
      : tool ? tool
      : sel ? T('hint.fire', { name: typeName(sel.type), pts: R.ptsOf(sel.type, mods()), desc: typeDesc(sel.type), wet: extra })
      : T(R.foggy(mods()) ? 'hint.fog' : 'hint.idle')}</span>`);
    const count = R.perkCount(st);
    $('arsenal-count').textContent = count;
    $('arsenal-count').classList.toggle('zero', !count);
    renderTools();
    renderNudge();
    if (st.phase !== 'menu') A.setUrgent(nightUrgent());
  }

  // ---------- Dessin ----------
  function resize() {
    const r = canvas.getBoundingClientRect();
    view.dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * view.dpr);
    canvas.height = Math.round(r.height * view.dpr);
    view.scale = Math.min(r.width / W, r.height / H);
    // Sur un écran plus haut que le monde, la place en trop va à la foule : le monde s'allonge vers le bas (HH) au lieu de laisser une marge.
    const rows = Math.max(H / PIX, Math.floor(r.height / view.scale / PIX));
    if (rows !== buf.height || !crowd.length) {
      buf.height = trail.height = rows;
      b.imageSmoothingEnabled = false;
      HH = rows * PIX;
      layoutCrowd();
    }
    view.ox = (r.width - W * view.scale) / 2;
    view.oy = Math.max(0, r.height - HH * view.scale);
    // Le monde n'atteint pas les bords de l'écran (tablette, ordinateur) : la foule s'estompe sur les côtés.
    view.edge = r.left + view.ox > 1 || window.innerWidth - r.right + view.ox > 1;
    document.body.style.setProperty('--ground-h', Math.max(0, Math.ceil(window.innerHeight - r.bottom)) + 'px');
  }
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);

  function pixLine(x1, y1, x2, y2) {
    const ax = art(x1), ay = art(y1), bx = art(x2), by = art(y2);
    const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay), 1);
    for (let i = 0; i <= n; i++) b.fillRect(Math.round(ax + (bx - ax) * i / n), Math.round(ay + (by - ay) * i / n), 1, 1);
  }

  // Petit parachute crème rayé d'or au-dessus d'une coque (top : haut de la coque, en pixels du tampon).
  function drawChute(cx, top) {
    const row = (y, w, color) => { b.fillStyle = color; b.fillRect(cx - w, top + y, w * 2 + 1, 1); };
    row(-15, 4, OUTLINE); row(-14, 6, OUTLINE); row(-13, 7, OUTLINE); row(-12, 7, OUTLINE); row(-11, 7, OUTLINE);
    row(-14, 4, '#f2ead8'); row(-13, 5, '#f2ead8'); row(-12, 6, '#f2ead8'); row(-11, 6, GOLD);
    b.fillStyle = OUTLINE;
    for (const x of [-4, 0, 4]) b.fillRect(cx + x, top - 13, 1, 2);
    b.fillStyle = '#f2ead8';
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) b.fillRect(cx + s * (6 - i), top - 10 + i * 2, 1, 2);
  }

  function blit(img, lx, ly, ox, oy) {
    b.drawImage(img, art(lx) - (img.width >> 1) + (ox || 0), art(ly) - (img.height >> 1) + (oy || 0));
  }
  // Même chose en étiré : sx, sy autour du centre, ou posé sur le bas (foot) pour l'écrasement à l'arrivée.
  function blitScaled(img, lx, ly, ox, oy, sx, sy, foot) {
    const w = Math.round(img.width * sx), h = Math.round(img.height * sy);
    const top = foot ? art(ly) + (img.height >> 1) - h : art(ly) - (h >> 1);
    b.drawImage(img, art(lx) - (w >> 1) + (ox || 0), top + (oy || 0), w, h);
  }

  // Renfort, Vent, Éteignoir et outils à feux spéciaux : la zone qui va changer, avant le second toucher.
  function drawToolAim(t) {
    const a = st.tool.aim;
    if (!a) return;
    b.fillStyle = GOLD;
    b.globalAlpha = 0.22 + 0.1 * (Math.floor(t * 4) % 2);
    const shade = (x, y) => b.fillRect(art(GX + x * CELL) + 2, art(GY + y * CELL) + 2, art(CELL) - 4, art(CELL) - 4);
    if (st.tool.id === 'renfort') {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = a.x + dx, y = a.y + dy;
        if (x >= 0 && y >= 0 && x < COLS && y < ROWS && !st.grid[y][x].type) shade(x, y);
      }
    } else if (R.toolById(st.tool.id).ed) {
      for (const q of R.decoArea(a.x, a.y)) if (st.grid[q.y][q.x].type) shade(q.x, q.y);
    } else if (st.tool.id === 'eteignoir') {
      b.fillStyle = '#9aa0aa';
      shade(a.x, a.y);
    } else {
      for (let x = 0; x < COLS; x++) shade(x, a.y);
      b.globalAlpha = 1;
      const y0 = art(GY + a.y * CELL + CELL / 2), x0 = art(GX) + 4 + (Math.floor(t * 8) % 4);
      for (let i = 0; i < art(COLS * CELL) - 14; i += 14) { b.fillRect(x0 + i, y0, 6, 1); b.fillRect(x0 + i + 4, y0 - 1, 1, 3); }
    }
    b.globalAlpha = 1;
  }

  // Cases que le feu sélectionné va allumer. Un miroir qu'on touche soi-même fait comme un pétard.
  function preview(x, y, m) {
    const c = st.grid[y][x];
    let list = R.targets(c.type === 'miroir' ? 'petard' : c.type, x, y, m, st.grid);
    if (m.coeur) list = list.concat(R.targets('soleil', x, y, m, st.grid));
    return list;
  }

  // La foule sous la grille, vue de dos et en contre-jour : des silhouettes noires sur une lueur chaude qui prend la couleur
  // de chaque explosion, comme le haut des têtes et des épaules. Le bas de l'écran est rempli par les corps, sans marge.
  function drawCrowd(t) {
    const bot = buf.height, s = crowdS, n = buf.width;
    const filming = st.phase === 'chain' || fx.cheer > 0.2, cheer = fx.cheer > 0.2, nLit = lighters();
    const boom = calm ? 0 : Math.min(1, fx.tintA + fx.flash * 0.5);
    const glow = !calm && fx.tintA > 0.02 ? css(mix(rgb('#ff8a3d'), rgb(fx.tint), Math.min(1, fx.tintA))) : '#ff8a3d';
    const fTop = Math.max(art(BAND_Y) + 2, bot - Math.round(14 * s)), bTop = fTop - Math.round(3.5 * s);

    b.fillStyle = glow;
    const peak = fTop + 5 * s, reach = 12 * s;
    for (let y = Math.max(0, Math.floor(peak - reach)); y < bot; y++) {
      const k = 1 - Math.abs(y - peak) / reach;
      if (k <= 0) continue;
      b.globalAlpha = k * k * (0.5 + 0.4 * boom);
      b.fillRect(0, y, n, 1);
    }
    b.globalAlpha = 1;

    // top[x] : le pixel le plus haut de la rangée en cours dans chaque colonne, pour poser le liseré de lumière.
    const top = new Int16Array(n);
    const span = (xa, xb, y) => {
      const x0 = Math.max(0, Math.round(xa)), x1 = Math.min(n - 1, Math.round(xb) - 1);
      y = Math.round(y);
      if (x1 < x0 || y >= bot) return;
      b.fillRect(x0, y, x1 - x0 + 1, 1);
      for (let x = x0; x <= x1; x++) if (y < top[x]) top[x] = y;
    };
    const disc = (cx, cy, r) => {
      for (let y = Math.floor(cy - r); y < cy + r; y++) {
        const dy = y + 0.5 - cy;
        if (Math.abs(dy) <= r) { const w = Math.sqrt(r * r - dy * dy); span(cx - w, cx + w, y); }
      }
    };
    const box = (x, y, w, h) => { for (let j = 0; j < h; j++) span(x, x + w, y + j); };
    const line = (x0, y0, x1, y1, th) => {
      const k = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
      for (let i = 0; i <= k; i++) box(x0 + (x1 - x0) * i / k - th / 2, y0 + (y1 - y0) * i / k, th, 1);
    };
    const rim = (alpha, color) => {
      b.fillStyle = color;
      for (let x = 0; x < n; x++) {
        if (top[x] >= bot) continue;
        b.globalAlpha = alpha;
        b.fillRect(x, top[x], 1, 1);
        if (s >= 1.8) { b.globalAlpha = alpha * 0.35; b.fillRect(x, top[x] + 1, 1, 1); }
      }
      b.globalAlpha = 1;
    };

    const lights = [], flames = [];
    const person = (c, back) => {
      const z = back ? s * 0.65 : s;
      const hr = 2.15 * z * (c.slim ? 0.92 : 1), sw = z * (c.slim ? 4 : 4.8), th = Math.max(1, Math.round(0.8 * z));
      const hop = Math.round(Math.abs(Math.sin(t * 9 + c.p)) * fx.cheer * 3 * z);
      const idle = Math.round(Math.sin(t * 1.3 + c.p * 3) * 0.6);
      const y = (back ? bTop : fTop) + c.h * Math.round(z * 0.7) - hop - idle + Math.round((1 - c.vis) * (bot - fTop + 6 * s));
      const cx = c.x + 0.5, sy = y + 2 * hr + Math.max(1, Math.round(0.5 * z));
      disc(cx, y + hr, hr);
      box(cx - hr * 0.45, y + hr * 1.5, hr * 0.9, sy - y - hr * 1.5 + 1);
      for (let yy = Math.round(sy); yy < bot; yy++) span(cx - sw * Math.min(1, 0.55 + 0.45 * Math.sqrt((yy - sy + 1) / (2.4 * z))), cx + sw * Math.min(1, 0.55 + 0.45 * Math.sqrt((yy - sy + 1) / (2.4 * z))), yy);
      if (back) {
        if (cheer && c.arms) { line(cx - sw * 0.7, sy + z, cx - sw * 1.2, y - z, th); line(cx + sw * 0.7, sy + z, cx + sw * 1.2, y - z, th); }
        return;
      }
      if (c.look === 'hat') { box(cx - hr * 0.8, y - hr * 0.6, hr * 1.6, hr * 1.2); box(cx - hr * 1.6, y + hr * 0.55, hr * 3.2, th); }
      else if (c.look === 'cap') box(cx - hr * 0.2, y + hr * 0.7, hr * 2.1, th);
      else if (c.look === 'bun') disc(cx, y + hr * 0.05, hr * 0.55);
      else if (c.look === 'tail') { box(cx + hr * 0.6, y + hr * 0.5, hr * 0.9, th); box(cx + hr * 1.3, y + hr * 0.5, th, hr * 1.4); }
      else if (c.look === 'long') box(cx - hr * 1.05, y + hr, hr * 2.1, sy - y - hr + 1.5 * z);
      else if (c.look === 'kid') {
        // Un enfant sur les épaules.
        const kr = hr * 0.72, ky = y - hr * 1.4;
        box(cx - hr * 0.95, ky, hr * 1.9, hr * 1.6);
        disc(cx, ky - kr * 0.9, kr);
        if (cheer) { line(cx - hr * 0.9, ky + hr * 0.3, cx - hr * 1.7, ky - hr * 1.4, th); line(cx + hr * 0.9, ky + hr * 0.3, cx + hr * 1.7, ky - hr * 1.4, th); }
      }
      const phone = c.look === 'phone' && filming;
      if (phone) {
        const ax = cx + sw * 0.75, ay = y - z * 1.2, pw = Math.max(2, Math.round(1.7 * z)), ph = Math.max(3, Math.round(2.6 * z));
        line(cx + sw * 0.55, sy + z, ax, ay, th);
        box(ax - pw / 2, ay - ph, pw, ph);
        lights.push([Math.round(ax - pw / 2) + (pw > 2 ? 1 : 0), Math.round(ay - ph) + 1, Math.max(1, pw - 2), Math.max(1, ph - 2), c.p]);
      }
      if (c.order < nLit) {
        // Le briquet est tenu à bout de bras levé, sur le côté de la tête, et se balance doucement.
        const side = phone ? -1 : 1, sway = Math.sin(t * 1.6 + c.p) * 0.8 * z;
        const ax = cx + side * sw * 0.85 + sway, ay = y - z * (c.look === 'kid' ? 4 : 1.5);
        line(cx + side * sw * 0.6, sy + z, ax, ay, th);
        flames.push([Math.round(ax), Math.round(ay) - 1, c.p]);
      } else if (cheer && c.arms && !phone && c.look !== 'kid') {
        line(cx - sw * 0.6, sy + z, cx - sw * 1.15, y - z * 1.5, th);
        line(cx + sw * 0.6, sy + z, cx + sw * 1.15, y - z * 1.5, th);
      }
    };

    top.fill(32767);
    b.fillStyle = '#1a1028';
    for (const c of crowd) if (c.back && c.vis > 0.02) person(c, true);
    rim(0.35, glow);

    // L'esplanade : un sol sombre au bord ondulé, des buissons et deux réverbères, pour que la bande reste un lieu même sans public.
    const gy0 = fTop + Math.round(7 * s), th = Math.max(1, Math.round(0.6 * s));
    const ground = x => gy0 + Math.round(Math.sin(x * 0.07 / s) * 1.2 * s + Math.sin(x * 0.19 / s + 1) * 0.6 * s);
    top.fill(32767);
    b.fillStyle = '#05030a';
    for (let x = 0; x < n; x++) { const g = ground(x); b.fillRect(x, g, 1, bot - g); top[x] = g; }
    for (const k of [0.07, 0.43, 0.94]) disc(Math.round(n * k), ground(Math.round(n * k)) + s * 0.6, 2.4 * s);
    const lamps = [];
    for (const k of [0.22, 0.76]) {
      const x = Math.round(n * k), ly = gy0 - Math.round(11 * s), arm = Math.round(2.6 * s);
      box(x, ly, th, ground(x) - ly + 1);
      box(x, ly, arm, th);
      box(x + arm - s * 0.7, ly + th, s * 1.4, Math.max(1, Math.round(0.8 * s)));
      lamps.push([Math.round(x + arm - 0.5), ly + th + Math.max(1, Math.round(0.8 * s))]);
    }
    rim(0.45, glow);
    // Le réverbère éclaire un petit cône sous lui.
    b.fillStyle = '#ffd27a';
    for (const [x, y] of lamps) {
      const len = Math.round(4 * s);
      for (let i = 0; i < len; i++) {
        const w = 1 + Math.round(i * 0.6);
        b.globalAlpha = 0.14 * (1 - i / len);
        b.fillRect(x - w, y + i, 2 * w + 1, 1);
      }
      b.globalAlpha = 1;
      b.fillRect(x, y - 1, 1, 1);
    }

    top.fill(32767);
    b.fillStyle = '#05030a';
    for (const c of crowd) if (!c.back && c.vis > 0.02) person(c, false);
    rim(0.6 + 0.3 * boom, glow);
    if (!calm && fx.flash > 0.05) rim(Math.min(0.8, fx.flash), '#ffdca0');

    for (const [x, y, w, h, p] of lights) {
      b.globalAlpha = 0.75 + 0.25 * Math.sin(t * 7 + p);
      b.fillStyle = '#cfe6ff';
      b.fillRect(x, y, w, h);
    }
    const fw = s >= 1.6 ? 2 : 1;
    for (const [x, y, p] of flames) {
      const x0 = x - (fw >> 1);
      b.globalAlpha = 0.22;
      b.fillStyle = GOLD;
      b.fillRect(x0 - 1, y - fw - 1, fw + 2, fw + 3);
      b.globalAlpha = 1;
      b.fillStyle = Math.sin(t * 11 + p * 5) > 0.3 ? '#fff3c4' : GOLD;
      b.fillRect(x0, y - fw, fw, fw);
      b.fillStyle = '#ff7a1a';
      b.fillRect(x0, y, fw, 1);
    }
    if (view.edge) {
      const fade = 16, y0 = Math.max(art(GY + ROWS * CELL), Math.floor(peak - reach));
      b.globalCompositeOperation = 'destination-out';
      b.fillStyle = '#000';
      for (let d = 0; d < fade; d++) {
        b.globalAlpha = 1 - d / fade;
        b.fillRect(d, y0, 1, bot - y0);
        b.fillRect(n - 1 - d, y0, 1, bot - y0);
      }
      b.globalCompositeOperation = 'source-over';
    }
    b.globalAlpha = 1;
  }

  function drawWorld(t) {
    b.clearRect(0, 0, buf.width, buf.height);
    // Pas de cadre autour de la grille (Dario n'en veut pas) : l'éclair et la lueur des explosions baignent tout l'écran.
    if (fx.flash > 0 && !calm) {
      b.fillStyle = `rgba(255, 240, 200, ${fx.flash * 0.16})`;
      b.fillRect(0, 0, buf.width, buf.height);
    }
    if (fx.tintA > 0 && !calm) {
      b.globalAlpha = fx.tintA * 0.13;
      b.fillStyle = fx.tint;
      b.fillRect(0, 0, buf.width, buf.height);
      b.globalAlpha = 1;
    }

    const m = st.grid ? mods() : {};
    if (st.grid && R.wetChance(m) > 0 && st.phase !== 'menu') {
      b.fillStyle = 'rgba(170, 200, 255, .35)';
      for (const d of rain) b.fillRect(art(d.x), art(d.y), 1, 4);
    }
    if (fx.rockets.length || fx.sky.length) {
      b.globalCompositeOperation = 'lighter';
      b.fillStyle = '#fff3c4';
      for (const r of fx.rockets) if (r.wait <= 0) b.fillRect(art(r.x), art(r.y), 1, 2);
      for (const s of fx.sky) {
        b.globalAlpha = Math.max(0, 1 - s.life / s.max) * (Math.random() < 0.08 ? 0.25 : 0.8);
        b.fillStyle = s.color;
        const sz = s.burst && s.life < s.max * 0.3 ? 2 : 1;
        b.fillRect(art(s.x), art(s.y), sz, sz);
      }
      b.globalAlpha = 1;
      b.globalCompositeOperation = 'source-over';
    }
    const fog = st.grid && R.foggy(m);

    const sel = st.sel && st.grid && st.grid[st.sel.y][st.sel.x];
    const shade = (x, y) => b.fillRect(art(GX + x * CELL) + 2, art(GY + y * CELL) + 2, art(CELL) - 4, art(CELL) - 4);
    if (sel && st.phase === 'aim') {
      b.fillStyle = TYPES[sel.type].color;
      b.globalAlpha = 0.28 + 0.12 * (Math.floor(t * 4) % 2);
      for (const [x, y] of preview(st.sel.x, st.sel.y, m)) if (!st.grid[y][x].wet) shade(x, y);
      b.globalAlpha = 1;
    }
    // Briquet : ce qu'allume le premier feu choisi.
    if (st.tool && st.tool.id === 'briquet' && st.phase === 'aim') {
      for (const q of st.tool.picks) {
        b.fillStyle = TYPES[st.grid[q.y][q.x].type].color;
        b.globalAlpha = 0.28 + 0.12 * (Math.floor(t * 4) % 2);
        for (const [x, y] of preview(q.x, q.y, m)) if (!st.grid[y][x].wet) shade(x, y);
      }
      b.globalAlpha = 1;
    }

    // Anticipation : les feux de la prochaine vague tremblent et blanchissent juste avant d'éclater.
    let next = null, nextK = 0;
    if (st.phase === 'chain' && st.anim && st.anim.res.waves[st.anim.i]) {
      next = new Set(st.anim.res.waves[st.anim.i].map(f => f.y * COLS + f.x));
      nextK = Math.max(0, Math.min(1, (st.anim.t - (st.anim.i - 1) * WAVE_MS) / WAVE_MS));
    }
    if (st.grid) {
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        const c = st.grid[y][x];
        const p = cellCenter(x, y - c.dy);
        if (p.y < -CELL) continue;
        if (!c.type || c.burnt) {
          b.fillStyle = 'rgba(255, 255, 255, .14)';
          b.fillRect(art(p.x), art(p.y), 1, 1);
          continue;
        }
        const isSel = st.sel && st.sel.x === x && st.sel.y === y;
        const bob = Math.round(Math.sin(t * 2.2 + c.id) * 1.1);
        const lift = isSel ? -3 + (Math.floor(t * 10) % 2) : 0;
        const jit = isSel ? (Math.floor(t * 14) % 2) : 0;
        const hidden = fog && !c.seen;
        // Une mèche lente qui couve tremble et crache des braises.
        const quiver = c.lit ? Math.floor(t * 12 + c.id) % 2 : 0;
        blit(SHADOW, p.x, p.y, 2, 3);
        if (c.chute && c.dy > 0) drawChute(art(p.x), art(p.y) - 6 + bob);
        // Un feu seul fume : coquille ternie et volute grise qui monte.
        const smoking = c.alone && st.phase === 'aim' && !hidden;
        if (smoking) b.globalAlpha = 0.55;
        const shell = hidden ? FOG : c.wet ? SPR_WET[c.type] : SPR[c.type];
        const soon = next && next.has(y * COLS + x) && !calm;
        const shiver = soon ? (Math.floor(t * 50 + c.id) % 2 ? 1 : -1) : 0;
        if (c.land && !calm) blitScaled(shell, p.x, p.y, jit + quiver, bob + lift, 1 + 0.24 * c.land, 1 - 0.2 * c.land, true);
        else if (soon) blitScaled(shell, p.x, p.y, shiver, bob, 1 + 0.12 * nextK, 1 + 0.12 * nextK);
        else blit(shell, p.x, p.y, jit + quiver, bob + lift);
        if (soon) {
          b.globalAlpha = 0.55 * nextK;
          blitScaled(WHITE_DISC, p.x, p.y, shiver, bob, 1 + 0.12 * nextK, 1 + 0.12 * nextK);
        }
        b.globalAlpha = 1;
        if (!hidden && c.ed) {
          if (c.ed === 'dore') blit(HALO_GOLD, p.x, p.y, jit, bob + lift);
          if (c.ed === 'brillant') {
            const k = Math.floor(t * 6 + c.id) % 4, a = [[-9, -9], [9, -8], [8, 9], [-8, 8]][k];
            b.fillStyle = '#ffffff';
            b.fillRect(art(p.x) + a[0], art(p.y) + a[1] + bob - 1, 1, 3);
            b.fillRect(art(p.x) + a[0] - 1, art(p.y) + a[1] + bob, 3, 1);
          }
          b.drawImage(EDGLYPH[c.ed], art(p.x) + (c.ed === 'geant' ? 3 : 5) + jit, art(p.y) - 13 + bob + lift);
        }
        if (smoking) {
          for (let i = 0; i < 5; i++) {
            const k = (t * 0.55 + i / 5 + c.id * 0.13) % 1, s = 2 + Math.floor(k * 3);
            b.globalAlpha = 0.9 * (1 - k * k);
            b.fillStyle = i % 2 ? '#d6dae2' : '#9aa0aa';
            b.fillRect(art(p.x) - (s >> 1) + Math.round(Math.sin(k * 5 + i + c.id) * 3), art(p.y) - 8 - Math.round(k * 16), s, s);
          }
          b.globalAlpha = 1;
        }
        if (!hidden && c.type === 'double' && c.charges === 1) blit(CRACK, p.x, p.y, jit, bob + lift);
        if (c.lit) {
          const f = Math.floor(t * 9 + c.id);
          for (let i = 0; i < 3; i++) {
            b.fillStyle = (f + i) % 2 ? '#ffd23f' : '#ff7a1a';
            b.fillRect(art(p.x) - 3 + i * 3, art(p.y) - 12 + bob - ((f + i * 2) % 3), 1, 1);
          }
        }
        if (isSel) blit(RING, p.x, p.y, jit, bob + lift);
        if (st.tool && st.tool.picks.some(q => q.x === x && q.y === y)) blit(RING_TOOL, p.x, p.y, 0, bob);
        if (st.nudge && st.nudge.from && st.nudge.from.x === x && st.nudge.from.y === y) blit(RING_TOOL, p.x, p.y, 0, bob);
      }
      if (st.tool && st.phase === 'aim') drawToolAim(t);
      if (st.nudge && st.nudge.from && st.phase === 'aim') {
        const f = st.nudge.from;
        b.fillStyle = GOLD;
        b.globalAlpha = 0.22 + 0.1 * (Math.floor(t * 4) % 2);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const x = f.x + dx, y = f.y + dy;
          if (x >= 0 && y >= 0 && x < COLS && y < ROWS && !st.grid[y][x].type) shade(x, y);
        }
        b.globalAlpha = 1;
      }
    }
    // La coque gonfle et blanchit pendant qu'elle éclate.
    for (const q of fx.pops) {
      const k = q.life / q.max, s = 1 + 0.5 * k;
      b.globalAlpha = 1 - k;
      blitScaled(q.wet ? SPR_WET[q.type] : SPR[q.type], q.x, q.y, 0, 0, s, s);
      b.globalAlpha = (1 - k) * 0.9;
      blitScaled(WHITE_DISC, q.x, q.y, 0, 0, s, s);
    }
    b.globalAlpha = 1;

    b.globalCompositeOperation = 'lighter';
    for (const r of fx.rings) {
      const k = r.life / r.max, e = 1 - (1 - k) * (1 - k);
      const rad = art(r.r0 + (r.r1 - r.r0) * e), cx = art(r.x), cy = art(r.y);
      b.globalAlpha = (1 - k) * 0.85;
      b.fillStyle = r.color;
      const n = Math.max(16, Math.round(rad * 6.3));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        b.fillRect(Math.round(cx + Math.cos(a) * rad), Math.round(cy + Math.sin(a) * rad), 1, 1);
      }
    }
    b.globalAlpha = 1;
    for (const m of fx.meteors) {
      const p = cellCenter(m.x, m.y);
      const k = m.life / m.max;
      const hx = p.x + (1 - k) * 120, hy = p.y - (1 - k) * 220;
      b.fillStyle = '#a782d1';
      pixLine(hx + 40, hy - 70, hx, hy);
      b.fillStyle = '#ffffff';
      b.fillRect(art(hx) - 1, art(hy) - 1, 3, 3);
    }
    for (const l of fx.links) {
      b.globalAlpha = 1 - l.life / l.max;
      b.fillStyle = l.color;
      pixLine(l.x1, l.y1, l.x2, l.y2);
    }
    tg.globalCompositeOperation = 'destination-out';
    tg.fillStyle = 'rgba(0, 0, 0, .2)';
    tg.fillRect(0, 0, trail.width, trail.height);
    tg.globalCompositeOperation = 'lighter';
    for (const p of fx.particles) {
      tg.globalAlpha = (1 - p.life / p.max) * 0.45;
      tg.fillStyle = p.color;
      tg.fillRect(art(p.x), art(p.y), 1, 1);
    }
    tg.globalAlpha = 1;
    // Le fondu ne descend jamais tout à fait à zéro : on efface pour de bon quand plus rien ne bouge.
    trailIdle = fx.particles.length ? 0 : trailIdle + 1;
    if (trailIdle > 40) tg.clearRect(0, 0, trail.width, trail.height);
    b.drawImage(trail, 0, 0);
    for (const p of fx.particles) {
      b.globalAlpha = 1 - p.life / p.max;
      b.fillStyle = p.color;
      b.fillRect(art(p.x), art(p.y), p.size, p.size);
    }
    b.globalAlpha = 1;
    b.globalCompositeOperation = 'source-over';

    drawCrowd(t);
    // Une longue chaîne embrase les bords de l'écran, de l'or au rose.
    if (st.phase === 'chain' && st.anim && st.anim.count >= 8 && !calm) {
      const k = Math.min(1, (st.anim.count - 8) / 20), pulse = 0.6 + 0.4 * Math.sin(t * 14);
      b.globalCompositeOperation = 'lighter';
      b.fillStyle = k > 0.6 ? MULT : GOLD;
      for (let d = 0; d < 4; d++) {
        b.globalAlpha = (0.32 - d * 0.07) * (0.4 + k * 0.6) * pulse;
        b.fillRect(d, 0, 1, buf.height);
        b.fillRect(buf.width - 1 - d, 0, 1, buf.height);
        b.fillRect(0, d, buf.width, 1);
      }
      b.globalAlpha = 1;
      b.globalCompositeOperation = 'source-over';
    }
  }

  function text(str, x, y, size, color, scale) {
    ctx.save();
    ctx.translate(x, y);
    if (scale && scale !== 1) ctx.scale(scale, scale);
    ctx.font = `${Math.round(size * 1.3)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(4, size * 0.22);
    ctx.strokeStyle = '#000';
    ctx.strokeText(str, 0, 3);
    ctx.strokeText(str, 0, 0);
    ctx.fillStyle = color;
    ctx.fillText(str, 0, 0);
    ctx.restore();
  }

  function draw(now) {
    const t = now / 1000;
    drawWorld(t);
    const { dpr, scale, ox, oy } = view;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const k = dpr * scale;
    const shake = calm ? 0 : cam.shake;
    const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;
    ctx.setTransform(k, 0, 0, k, dpr * ox, dpr * oy);
    if (!calm) {
      ctx.translate(W / 2 + sx, H / 2 + sy);
      ctx.rotate(cam.rot);
      ctx.scale(1 + cam.zoom, 1 + cam.zoom);
      ctx.translate(-W / 2, -H / 2);
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(buf, 0, 0, W, HH);
    if (st.grid) {
      crowdIcon = crowdIcon || glyph('foule');
      const label = fmtNum(st.crowd || 0);
      ctx.font = `18px ${FONT}`;
      const tw = ctx.measureText(label).width;
      ctx.drawImage(crowdIcon, W - 18 - tw - 20, HH - 25, 16, 16);
      text(label, W - 14 - tw / 2, HH - 10, 14, GOLD);
    }

    for (const tx of fx.texts) {
      ctx.globalAlpha = Math.min(1, 2 * (1 - tx.life / tx.max));
      const pop = tx.life < 0.12 ? 1.7 - tx.life / 0.12 * 0.7 : 1;
      if (tx.glow) { ctx.shadowColor = '#ff9a00'; ctx.shadowBlur = 18; }
      text(tx.text, tx.x, tx.y - (tx.still ? 0 : tx.life * 30), tx.size, tx.color, pop * (tx.glow ? 1 + Math.sin(t * 30) * 0.03 : 1));
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
    if (fx.wave && fx.wave.t < WAVE_HOLD) {
      const w = fx.wave, pop = w.t < 0.15 ? 1.5 - w.t / 0.15 * 0.5 : 1;
      ctx.globalAlpha = Math.min(1, 3 * (1 - w.t / WAVE_HOLD));
      const color = w.n >= 8 ? MULT : w.n >= 5 ? GOLD : '#ffffff';
      const label = T('chain.wave', { n: w.n }) + (w.mult ? ` · ${T('chain.elan')} ×${L.dec(w.mult)}` : '');
      text(label, W / 2, TEXT_TOP, 16 + Math.min(10, w.n), color, pop);
      ctx.globalAlpha = 1;
    }
    if (fx.cheer > 0 && fx.cheerText) {
      ctx.globalAlpha = Math.min(1, fx.cheer * 2);
      text(fx.cheerText, W / 2, BAND_Y - 6 - (1 - fx.cheer) * 16, 26, GOLD, 1 + Math.sin(t * 20) * 0.04);
      ctx.globalAlpha = 1;
    }
  }

  function step(dt) {
    if (st.paused) return;
    if (st.phase === 'chain' && st.anim) updateChain(dt);
    if (st.grid) {
      let moving = false, landed = 0;
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        const c = st.grid[y][x];
        if (c.land) c.land = Math.max(0, c.land - dt * 7);
        if (c.dy > 0) {
          c.dy = Math.max(0, c.dy - FALL_SPEED * dt * (c.chute ? 0.22 : 1 + c.dy * 0.15));
          moving = true;
          if (c.dy === 0) c.chute = 0;
          // À l'arrivée, la coque s'écrase un instant et soulève un peu de poussière.
          if (c.dy === 0 && c.type && !c.burnt) {
            c.land = 1;
            landed++;
            if (landed <= 10) {
              const p = cellCenter(x, y);
              for (const s of [-1, 1]) fx.particles.push({ x: p.x + s * 16, y: p.y + 18, vx: s * (20 + Math.random() * 20), vy: -6 - Math.random() * 8, life: 0, max: 0.35, color: '#8a7fa8', size: 1, smoke: true });
            }
          }
        }
      }
      if (landed && st.phase !== 'menu') A.land(landed);
      if (st.phase === 'fall' && !moving) afterFall();
    }
    for (const p of fx.particles) { p.life += dt; p.vy += (p.smoke ? -8 : p.ember ? 14 : 70) * dt; p.vx *= 0.985; p.vy *= 0.985; p.x += p.vx * dt; p.y += p.vy * dt; }
    for (const r of fx.rings) r.life += dt;
    fx.rings = fx.rings.filter(r => r.life < r.max);
    for (const p of fx.pops) p.life += dt;
    fx.pops = fx.pops.filter(p => p.life < p.max);
    fx.tintA = Math.max(0, fx.tintA - dt * 2.5);
    fx.particles = fx.particles.filter(p => p.life < p.max);
    for (const m of fx.meteors) {
      m.life += dt;
      if (m.life >= m.max) {
        const p = cellCenter(m.x, m.y);
        for (let i = 0; i < 20; i++) {
          const a = Math.random() * Math.PI * 2, v = 40 + Math.random() * 80;
          fx.particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.5, color: '#a782d1', size: 2 });
        }
        fx.texts.push({ x: p.x, y: p.y - 24, text: T('fx.meteor'), color: '#a782d1', life: 0, max: 1.1, size: 16 });
        cam.shake = Math.min(10, cam.shake + 3);
        A.boom(1, 2);
      }
    }
    fx.meteors = fx.meteors.filter(m => m.life < m.max);
    for (const r of fx.rockets) {
      if (r.wait > 0) { r.wait -= dt; continue; }
      r.y += r.vy * dt;
      if (Math.random() < 0.6) fx.sky.push({ x: r.x, y: r.y + 4, vx: (Math.random() - 0.5) * 12, vy: 20, life: 0, max: 0.35, color: '#ffd9a0' });
      if (r.y <= r.top) {
        r.done = true;
        A.sky(r.big);
        const n = (r.big ? 46 : 28) + Math.floor(Math.random() * 12), sp = (r.big ? 120 : 75) + Math.random() * 40;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2, v = sp * (0.6 + Math.random() * 0.5);
          fx.sky.push({ x: r.x, y: r.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.9 + Math.random() * 0.7, color: Math.random() < 0.15 ? '#ffffff' : r.color, burst: true });
        }
      }
    }
    fx.rockets = fx.rockets.filter(r => !r.done);
    for (const s of fx.sky) { s.life += dt; s.vy += 36 * dt; s.vx *= 0.98; s.vy *= 0.98; s.x += s.vx * dt; s.y += s.vy * dt; }
    fx.sky = fx.sky.filter(s => s.life < s.max);
    if (st.grid && R.wetChance(mods()) > 0) for (const d of rain) { d.y += d.v * dt; d.x -= d.v * dt * 0.25; if (d.y > BAND_Y) { d.y = -12; d.x = Math.random() * (W + 40); } }
    for (const l of fx.links) l.life += dt;
    fx.links = fx.links.filter(l => l.life < l.max);
    for (const tx of fx.texts) tx.life += dt;
    fx.texts = fx.texts.filter(tx => tx.life < tx.max);
    fx.flash = Math.max(0, fx.flash - dt * 1.6);
    fx.cheer = Math.max(0, fx.cheer - dt * 0.6);
    const shown = crowdShown();
    for (const c of crowd) c.vis += ((c.order < shown ? 1 : 0) - c.vis) * Math.min(1, dt * (1.5 + c.p * 0.5));
    if (fx.wave) { fx.wave.t += dt; if (fx.wave.t >= WAVE_HOLD) fx.wave = null; }
    cam.shake = Math.max(0, cam.shake - dt * 18);
    cam.zoom -= cam.zoom * Math.min(1, dt * 5);
    cam.rot -= cam.rot * Math.min(1, dt * 4);
    const before = st.shown;
    st.shown += (st.score - st.shown) * Math.min(1, dt * 6);
    if (Math.abs(st.score - st.shown) < 1) st.shown = st.score;
    // Le score qui défile fait de petits tics, de plus en plus aigus.
    if (st.shown !== before && st.score > before) {
      scoreTick.t -= dt;
      if (scoreTick.t <= 0) { scoreTick.t = 0.05; A.tick(scoreTick.k++); }
    } else scoreTick.k = 0;
    if (st.grid) {
      $('score').textContent = fmtNum(st.shown);
      $('bar-fill').style.width = Math.min(100, (st.shown / target()) * 100) + '%';
      $('bar-fill').classList.toggle('done', st.shown >= target());
    }
  }

  // ---------- Ciels de fusées : l'accueil, et le bouquet plein écran ----------
  const SKY_COLORS = Object.values(TYPES).map(t => t.color).concat([GOLD, '#fff3c4']);
  const pickColor = () => SKY_COLORS[Math.floor(Math.random() * SKY_COLORS.length)];
  function makeSky(canvas, k, more) {
    return Object.assign({ canvas, g: canvas.getContext('2d'), k, w: 1, h: 1, rockets: [], sparks: [], glows: [], next: 0, scale: 1, topMin: 0.12, topSpan: 0.4 }, more);
  }

  // x, top : point visé (pixels du ciel), sinon au hasard. kind : forme de l'éclatement (pivoine par défaut).
  function launch(sky, opts) {
    const o = opts || {};
    const x0 = o.x != null ? o.x + (Math.random() - 0.5) * sky.w * 0.15 : sky.w * (0.1 + Math.random() * 0.8);
    const vy = -(sky.h * (0.75 + Math.random() * 0.35));
    const top = o.top != null ? o.top : sky.h * (sky.topMin + Math.random() * (o.high ? sky.topSpan * 0.75 : sky.topSpan));
    const kinds = sky.kinds || ['peony'];
    sky.rockets.push({
      x: x0, y: sky.h + 2, vy, vx: o.x != null ? (o.x - x0) / ((sky.h + 2 - top) / -vy) : 0,
      top, wait: o.wait || 0, big: !!o.big, loud: !!o.loud,
      kind: o.kind || kinds[Math.floor(Math.random() * kinds.length)], color: pickColor(), color2: pickColor(),
    });
  }

  function skyBurst(sky, r) {
    const S = sky.scale, rnd = Math.random;
    const spark = (a, v, max, color, more) => sky.sparks.push(Object.assign({ x: r.x, y: r.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max, color }, more));
    const white = c => (rnd() < 0.15 ? '#ffffff' : c);
    if (r.kind === 'ring') {
      const n = r.big ? 56 : 40, v = (r.big ? 80 : 58) * S;
      for (let i = 0; i < n; i++) spark((i / n) * Math.PI * 2, v * (0.97 + rnd() * 0.06), 0.9 + rnd() * 0.3, white(r.color));
      spark(0, 0, 0.5, '#ffffff');
    } else if (r.kind === 'willow') {
      const n = r.big ? 60 : 44;
      for (let i = 0; i < n; i++) spark((i / n) * Math.PI * 2, (28 + rnd() * 34) * S, 1.9 + rnd() * 0.8, rnd() < 0.2 ? '#fff3c4' : '#ffc95a', { drag: 0.965, grav: 9, trail: true });
    } else {
      const n = (r.big ? 60 : 34) + Math.floor(rnd() * 24), sp = ((r.big ? 70 : 40) + rnd() * 45) * S;
      const more = r.kind === 'crackle' ? { pop: true } : null;
      for (let i = 0; i < n; i++) spark((i / n) * Math.PI * 2, sp * (0.6 + rnd() * 0.5), 1 + rnd() * 0.8, white(r.color), more);
      if (r.kind === 'duo') for (let i = 0; i < 22; i++) spark((i / 22) * Math.PI * 2, sp * 0.4 * (0.8 + rnd() * 0.3), 0.8 + rnd() * 0.4, r.color2);
    }
  }

  // Disque en pixels (pas de dégradé lisse).
  function pixDisc(g, cx, cy, r) {
    for (let dy = -r; dy <= r; dy++) {
      const hw = Math.floor(Math.sqrt(r * r - dy * dy));
      g.fillRect(Math.round(cx) - hw, Math.round(cy) + dy, hw * 2 + 1, 1);
    }
  }

  function skyStep(sky, dt) {
    const c = sky.canvas;
    const w = Math.ceil(c.clientWidth / sky.k), h = Math.ceil(c.clientHeight / sky.k);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    sky.w = w; sky.h = h;
    for (const r of sky.rockets) {
      if (r.wait > 0) { r.wait -= dt; continue; }
      r.y += r.vy * dt;
      r.x += r.vx * dt;
      if (Math.random() < 0.7) sky.sparks.push({ x: r.x, y: r.y + 2, vx: (Math.random() - 0.5) * 6, vy: 10, life: 0, max: 0.4, color: '#ffd9a0' });
      if (r.y <= r.top) {
        r.done = true;
        skyBurst(sky, r);
        if (sky.onBurst) sky.onBurst(r);
        else if (r.big) A.boom(4, 6);
      }
    }
    sky.rockets = sky.rockets.filter(r => !r.done);
    const born = [];
    for (const s of sky.sparks) {
      s.life += dt; s.vy += (s.grav || 18) * dt; s.vx *= s.drag || 0.98;
      if (s.drag) s.vy *= s.drag;
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.trail && Math.random() < 0.3) born.push({ x: s.x, y: s.y, vx: 0, vy: 3, life: 0, max: 0.5, color: s.color, dim: true });
      if (s.pop && s.life >= s.max) for (let i = 0; i < 3; i++) born.push({ x: s.x, y: s.y, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30, life: 0, max: 0.1 + Math.random() * 0.15, color: '#ffffff' });
    }
    sky.sparks = sky.sparks.filter(s => s.life < s.max).concat(born);
    for (const gl of sky.glows) gl.life += dt;
    sky.glows = sky.glows.filter(gl => gl.life < gl.max);
    const g = sky.g;
    g.clearRect(0, 0, w, h);
    g.globalCompositeOperation = 'lighter';
    for (const gl of sky.glows) {
      g.fillStyle = gl.color;
      const f = 1 - gl.life / gl.max;
      g.globalAlpha = 0.045 * f;
      for (const k of [1, 0.72, 0.45]) pixDisc(g, gl.x, gl.y, Math.round(gl.r * k));
    }
    g.globalAlpha = 1;
    for (const r of sky.rockets) if (r.wait <= 0) { g.fillStyle = '#fff3c4'; g.fillRect(Math.round(r.x), Math.round(r.y), 1, 2); }
    for (const s of sky.sparks) {
      g.globalAlpha = Math.max(0, 1 - s.life / s.max) * (Math.random() < 0.08 ? 0.3 : 1) * (s.dim ? 0.5 : 1);
      g.fillStyle = s.color;
      const sz = !s.dim && s.life < s.max * 0.4 ? 2 : 1;
      g.fillRect(Math.round(s.x), Math.round(s.y), sz, sz);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    return sky.rockets.length + sky.sparks.length > 0;
  }

  // ---------- Accueil : fusées, titre qui prend la couleur des explosions, village au loin, mèche d'ouverture ----------
  const home = makeSky($('home-fx'), 2, {
    scale: 1.4, topMin: 0.05, topSpan: 0.3, kinds: ['peony', 'peony', 'ring', 'willow', 'crackle', 'duo'], lit: 0, litColor: GOLD,
    onBurst(r) {
      if (!calm) home.glows.push({ x: r.x, y: r.y, color: r.color, r: Math.round((r.big ? 60 : 44) * home.scale), life: 0, max: 0.5 });
      if (r.loud) A.sky(r.big);
      home.lit = Math.min(1, home.lit + (r.big ? 1 : 0.7));
      home.litColor = r.kind === 'willow' ? '#ffc95a' : r.color;
      tintTitle(r.x * home.k, r.y * home.k, home.litColor, r.big);
    },
  });

  const titleLetters = () => $('title').querySelectorAll('i');
  const tints = [];
  function tintTitle(cx, cy, color, big) {
    if (intro) return;
    const reach = big ? 240 : 180;
    titleLetters().forEach((el, i) => {
      const b = el.getBoundingClientRect();
      const t = 1 - Math.hypot(b.left + b.width / 2 - cx, b.top + b.height / 2 - cy) / reach;
      if (t > 0 && (!tints[i] || tints[i].t < t)) tints[i] = { t, color: rgb(color) };
    });
  }
  function titleStep(dt) {
    const els = titleLetters();
    tints.forEach((c, i) => {
      if (!c) return;
      c.t -= dt * 1.3;
      if (c.t <= 0) { tints[i] = null; if (els[i]) els[i].style.color = ''; return; }
      if (els[i]) els[i].style.color = css(mix(rgb(GOLD), c.color, Math.min(1, c.t * 1.4)));
    });
  }

  // Village en contre-jour au bas de l'accueil : une colline au loin avec un château, des maisons, des arbres et un clocher devant.
  // Le haut des toits prend la couleur de la dernière explosion. Tiré d'une graine fixe : le même village à chaque fois.
  const TOWN_H = 96;
  let town = null;
  function seeded(seed) {
    return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function buildTown(w) {
    const rnd = seeded(17), back = [], front = new Array(w).fill(5), wins = [];
    for (let x = 0; x < w; x++) back[x] = Math.round(34 + 9 * Math.sin(x * 0.04 + 1.3) + 5 * Math.sin(x * 0.1 + 0.4));
    const raise = (arr, x, hgt) => { if (x >= 0 && x < w) arr[x] = Math.max(arr[x], hgt); };
    const cx = Math.round(w * 0.8);
    for (let i = -7; i <= 7; i++) raise(back, cx + i, back[cx] + 18 + (Math.abs(i) >= 5 ? 4 : 0) + (Math.abs(i) >= 5 && i % 2 ? 2 : 0));
    for (let i = -3; i <= 3; i++) raise(back, cx - 12 + i, back[cx] + 28 + (i % 2 ? 0 : 2));
    const churchAt = Math.round(w * (0.3 + rnd() * 0.15));
    let x = -Math.floor(rnd() * 10), church = false;
    while (x < w) {
      const r = rnd();
      if (!church && x + 10 >= churchAt) {
        church = true;
        for (let i = 0; i < 9; i++) raise(front, x + i, 40);
        [[1, 45], [2, 50], [3, 55], [4, 61]].forEach(([d, hgt]) => { for (let i = d; i < 9 - d; i++) raise(front, x + i, hgt); });
        wins.push({ x: x + 4, y: 29, w: 1, h: 4, on: true });
        x += 10;
      } else if (r < 0.55) {
        const bw = 12 + Math.floor(rnd() * 10), wall = 14 + Math.floor(rnd() * 12);
        for (let i = 0; i < bw; i++) raise(front, x + i, wall + Math.min(i, bw - 1 - i) + 1);
        if (rnd() < 0.55) { const c0 = x + 2 + Math.floor(rnd() * (bw - 6)); for (let i = 0; i < 2; i++) raise(front, c0 + i, front[Math.max(0, Math.min(w - 1, c0))] + 4); }
        for (let k = 0, n = bw > 16 ? 2 : 1; k < n; k++) wins.push({ x: x + Math.round(((k + 1) * bw) / (n + 1)) - 1, y: wall - 9, w: 2, h: 3, on: rnd() < 0.65 });
        x += bw + Math.floor(rnd() * 2);
      } else if (r < 0.85) {
        const rad = 5 + Math.floor(rnd() * 5);
        for (let i = -rad; i <= rad; i++) raise(front, x + rad + i, 3 + rad + Math.round(Math.sqrt(rad * rad - i * i)));
        x += rad * 2 + 1;
      } else x += 3 + Math.floor(rnd() * 4);
    }
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = TOWN_H;
    const g = cv.getContext('2d');
    g.fillStyle = '#1c0f2e';
    for (let i = 0; i < w; i++) g.fillRect(i, TOWN_H - back[i], 1, back[i]);
    g.fillStyle = '#08040f';
    for (let i = 0; i < w; i++) g.fillRect(i, TOWN_H - front[i], 1, front[i]);
    return { w, cv, back, front, wins: wins.filter(o => o.x >= 0 && o.x < w) };
  }
  function drawTown(sky, dt) {
    if (!town || town.w !== sky.w) town = buildTown(sky.w);
    const g = sky.g, y0 = sky.h - TOWN_H;
    g.drawImage(town.cv, 0, y0);
    for (const o of town.wins) {
      if (Math.random() < dt * 0.04) o.on = !o.on;
      if (!o.on) continue;
      g.fillStyle = '#ffb347';
      g.globalAlpha = 0.75 + Math.random() * 0.1;
      g.fillRect(o.x, y0 + TOWN_H - o.y - o.h, o.w, o.h);
    }
    sky.lit = Math.max(0, sky.lit - dt * 1.4);
    if (sky.lit > 0.02) {
      g.fillStyle = sky.litColor;
      g.globalAlpha = sky.lit * 0.35;
      for (let i = 0; i < town.w; i++) if (town.back[i] > town.front[i]) g.fillRect(i, y0 + TOWN_H - town.back[i], 1, 1);
      g.globalAlpha = sky.lit * 0.9;
      for (let i = 0; i < town.w; i++) g.fillRect(i, y0 + TOWN_H - town.front[i], 1, 1);
    }
    g.globalAlpha = 1;
  }

  // Au lancement de l'appli : une mèche court sous le titre et l'allume lettre par lettre, puis un petit bouquet. Un toucher la passe.
  const FUSE_T = 1.2;
  let intro = null;
  function startIntro() {
    if (calm) return;
    intro = { t: -0.35, lit: 0, ready: !document.fonts, sound: false };
    if (document.fonts) document.fonts.ready.then(() => { if (intro) intro.ready = true; });
    $('home').classList.add('intro');
    $('title').classList.add('unlit');
  }
  function lightLetter(el, i, quiet) {
    el.classList.add('lit');
    if (quiet) return;
    A.chip(i);
    const b = el.getBoundingClientRect(), k = home.k;
    for (let n = 0; n < 12; n++) {
      const a = Math.random() * Math.PI * 2, v = 20 + Math.random() * 40;
      home.sparks.push({ x: (b.left + b.width / 2) / k, y: (b.top + b.height * 0.6) / k, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 15, life: 0, max: 0.4 + Math.random() * 0.3, color: Math.random() < 0.4 ? '#ffffff' : GOLD });
    }
  }
  function endIntro() {
    if (!intro) return;
    titleLetters().forEach((el, i) => { if (i >= intro.lit) lightLetter(el, i, true); });
    intro = null;
    $('home').classList.remove('intro');
    $('title').classList.remove('unlit');
    const b = $('title').getBoundingClientRect(), k = home.k;
    for (let i = 0; i < 3; i++) launch(home, { x: (b.left + b.width * (0.2 + i * 0.3)) / k, top: Math.max(8, b.top / k - 10 - Math.random() * 25), wait: i * 0.14, big: i === 1, loud: i !== 2 });
  }
  function introStep(dt) {
    if (!intro || !intro.ready) return;
    intro.t += dt;
    const g = home.g, k = home.k, b = $('title').getBoundingClientRect();
    const x0 = Math.round(b.left / k) - 3, x1 = Math.round(b.right / k) + 3, y = Math.round(b.bottom / k) + 2;
    const p = Math.max(0, Math.min(1, intro.t / FUSE_T)), hx = Math.round(x0 + (x1 - x0) * p);
    if (intro.t >= 0 && !intro.sound) { intro.sound = true; A.fuse(FUSE_T); }
    for (let x = hx; x < x1; x++) {
      g.fillStyle = x % 3 ? '#d9b26a' : '#7a5230'; g.fillRect(x, y, 1, 1);
      g.fillStyle = 'rgba(0, 0, 0, .5)'; g.fillRect(x, y + 1, 1, 1);
    }
    if (intro.t >= 0) {
      g.fillStyle = Math.random() < 0.5 ? '#ffffff' : '#fff3c4';
      g.fillRect(hx - 1, y - 1, 2, 2);
      for (let n = 0; n < 3; n++) home.sparks.push({ x: hx, y, vx: (Math.random() - 0.5) * 40, vy: -Math.random() * 35, life: 0, max: 0.25 + Math.random() * 0.25, color: Math.random() < 0.5 ? '#ffd27a' : '#ffffff' });
    }
    const els = titleLetters();
    while (intro.lit < els.length) {
      const lb = els[intro.lit].getBoundingClientRect();
      if (hx * k < lb.left + lb.width / 2) break;
      lightLetter(els[intro.lit], intro.lit);
      intro.lit++;
    }
    if (p >= 1) endIntro();
  }

  $('home').addEventListener('pointerdown', (ev) => {
    if (intro) { endIntro(); return; }
    if (ev.target.closest('button, a, .pick, .lang')) return;
    A.init();
    if (home.rockets.length >= 6) return;
    launch(home, { x: ev.clientX / home.k, top: Math.min(home.h * 0.7, ev.clientY / home.k), loud: true, big: Math.random() < 0.3 });
  });

  function homeStep(dt, now) {
    if (!intro && now > home.next) {
      home.next = now + 600 + Math.random() * 900;
      launch(home, { big: Math.random() < 0.25 });
      if (Math.random() < 0.2) launch(home, { wait: 0.18 });
    }
    skyStep(home, dt);
    drawTown(home, dt);
    introStep(dt);
    titleStep(dt);
  }

  // La première allumette fait tout l'objectif : bouquet sur tout l'écran.
  const party = makeSky($('party-fx'), 2);
  let partyOn = false;
  function celebrate() {
    $('party').classList.remove('hidden');
    const txt = $('party-text');
    txt.textContent = T('fx.oneshot');
    txt.style.animation = 'none'; void txt.offsetWidth; txt.style.animation = '';
    partyOn = true;
    skyStep(party, 0);
    for (let i = 0; i < 14; i++) launch(party, { wait: i * 0.13, big: i % 3 === 0, high: true });
    vibrate([80, 40, 80, 40, 160]);
    A.win();
  }
  function partyStep(dt) {
    if (!partyOn) return;
    if (!skyStep(party, dt)) { partyOn = false; $('party').classList.add('hidden'); }
  }

  // Bandeau « Débloqué ! » en haut de l'écran, un déblocage après l'autre.
  const unlockQueue = [];
  let unlockBusy = false;
  function unlockIcon(u) {
    return u.kind === 'feu' ? iconCard('t:' + u.id, 'feu') : u.kind === 'sac' ? sacCard(u.id) : u.kind === 'tool' ? iconCard('g:' + u.id, 'tool') : perkCard(R.perkById(u.id));
  }
  function unlockName(u) {
    return u.kind === 'feu' ? typeName(u.id) : u.kind === 'sac' ? sacText(u.id).name : u.kind === 'tool' ? L.entry('tools', u.id).name : L.entry('perks', u.id).name;
  }
  const UNLOCK_LABEL = { feu: 'unlock.feu', perk: 'unlock.perk', sac: 'unlock.sac', tool: 'unlock.tool' };
  const sacCard = id => iconCard('b:' + id, 'sac');
  function showUnlocks(list) {
    unlockQueue.push(...list);
    if (!unlockBusy) nextUnlock();
  }
  function nextUnlock() {
    const u = unlockQueue.shift();
    const el = $('unlock');
    if (!u) { unlockBusy = false; el.classList.add('hidden'); return; }
    unlockBusy = true;
    el.innerHTML = '';
    if (u.calibre) {
      el.innerHTML = `<div class="txt"><em>${T('unlock.title')}</em><b>${T('unlock.calibre', { n: u.calibre, sac: u.sac })}</b><span>${T('calibre.desc', { n: u.calibre })}</span></div>`;
    } else if (u.succes) {
      const a = M.SUCCES.find(x => x.id === u.succes), e = L.entry('succes', a.id, { n: a.goal });
      el.appendChild(succesCard(a, false));
      el.insertAdjacentHTML('beforeend', `<div class="txt"><em>${T('succes.got')}</em><b>${e.name}</b><span>${e.desc}</span></div>`);
    } else {
      el.appendChild(unlockIcon(u));
      const txt = document.createElement('div');
      txt.className = 'txt';
      txt.innerHTML = u.queued ? `<em>${T('unlock.queued')}</em><b>${unlockName(u)}</b><span>${T('unlock.queuedDesc')}</span>`
        : `<em>${T('unlock.title')}</em><b>${unlockName(u)}</b><span>${T(UNLOCK_LABEL[u.kind])}</span>`;
      el.appendChild(txt);
    }
    el.classList.remove('hidden');
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    A.win();
    vibrate([30, 30, 60]);
    setTimeout(nextUnlock, 2600);
  }

  function renderRecord() {
    const best = loadBest();
    const endless = M.stats.bestEndless;
    $('record').innerHTML = [
      best ? T('home.best', { n: best.night, chain: best.chain }) : T('home.none'),
      endless && T('home.endless', { n: endless }),
    ].filter(Boolean).join('<br>');
    $('btn-defis').querySelector('em').textContent = `${M.count()}/${M.UNLOCKS.length}`;
    const fresh = M.fresh;
    $('btn-defis').querySelector('i').textContent = fresh ? '+' + fresh : '';
    $('btn-succes').querySelector('em').textContent = `${M.succesCount()}/${M.SUCCES.length}`;
    const got = M.succesFresh;
    $('btn-succes').querySelector('i').textContent = got ? '+' + got : '';
    const saved = loadRun();
    $('btn-resume').classList.toggle('hidden', !saved);
    if (saved) $('btn-resume').textContent = T('home.resume', { n: saved.round + (saved.where === 'shop' ? 2 : 1) });
    $('btn-play').classList.toggle('big', !saved);
    renderCalibre();
    renderSac();
  }

  // Les calibres gagnés avec un sac, en petites médailles.
  function medals(sac) {
    const won = M.winsWith(sac);
    let html = '<span class="medals">';
    for (let n = 1; n <= R.CALIBRES; n++) html += `<i class="${n <= won ? 'on' : ''}">${n}</i>`;
    return html + '</span>';
  }

  // Accueil : le sac retenu ; le toucher ouvre la liste des sacs.
  function renderSac() {
    $('sac-open').classList.toggle('hidden', M.sacs().length <= 1);
    const icon = $('sac-icon');
    icon.innerHTML = '';
    icon.appendChild(copyCanvas(bagOf(M.sac)));
    const e = sacText(M.sac);
    $('sac-name').textContent = e.name;
    $('sac-desc').textContent = e.desc;
  }
  // Une ligne par sac ; toucher un sac débloqué le choisit pour la prochaine run.
  function sacRows(box, onPick) {
    for (const s of R.SACS) {
      const open = M.isOpen(s.id), e = sacText(s.id), picked = open && s.id === M.sac;
      const won = M.winsWith(s.id);
      const desc = open ? `${e.desc}<br><small>${T(won ? 'coll.sacWins' : 'coll.sacNone')}</small>${won ? medals(s.id) : ''}` : '';
      const label = picked ? T('coll.sacPick') : lockOf(s.id) ? T('defis.done') : T('coll.start');
      const el = box.appendChild(collRow(open, sacCard(s.id), picked ? 'done' : 'sac', label, e.name, desc, s.id));
      if (open && !picked) {
        el.classList.add('pick');
        el.addEventListener('click', () => { A.click(); M.sac = s.id; renderSac(); renderCalibre(); onPick(); });
      }
    }
  }
  function renderSacs() {
    const box = $('sacs-list');
    box.innerHTML = '';
    sacRows(box, () => { renderSacs(); juice($('sac-icon'), 0.3); });
  }
  $('sac-open').addEventListener('click', () => {
    A.init();
    A.click();
    renderSacs();
    $('sacs').classList.remove('hidden');
    $('sacs-list').scrollTop = 0;
  });

  // Calibre : 5 tas de poudre de plus en plus gros ; celui choisi flambe, les verrouillés sont éteints.
  function renderCalibre() {
    const c = M.calibre;
    $('calibre').classList.toggle('hidden', M.bestCalibre <= 1);
    $('cal-name').textContent = T('calibre', { n: c });
    $('cal-desc').textContent = T('calibre.desc', { n: c });
    const row = $('cal-shells');
    row.innerHTML = '';
    for (let n = 1; n <= R.CALIBRES; n++) {
      const b = document.createElement('button');
      b.className = 'cal-shell' + (n === c ? ' on' : n > M.maxCalibre ? ' locked' : ' open');
      b.setAttribute('aria-label', T('calibre', { n }));
      b.appendChild(copyCanvas(n === c ? CAL_ON[n] : CAL_OFF[n]));
      if (n <= M.maxCalibre && n !== c) b.addEventListener('click', () => setCalibre(n));
      row.appendChild(b);
    }
  }
  function setCalibre(n) {
    A.init(); A.click();
    M.calibre = n;
    renderCalibre();
    juice($('cal-shells').children[n - 1], 0.3);
  }

  // ---------- Collection : tout le contenu du jeu, débloqué ou pas ----------
  let collTab = 'feux';

  function lockOf(id) { return M.UNLOCKS.find(u => u.id === id) || null; }
  function collTabs() {
    const feux = Object.keys(TYPES);
    const open = M.isOpen;
    return [
      ['feux', feux.filter(open).length, feux.length],
      ['perks', R.PERKS.filter(p => open(p.id)).length, R.PERKS.length],
      ['outils', R.TOOLS.filter(o => open(o.id)).length + R.EDITIONS.length, R.TOOLS.length + R.EDITIONS.length],
      ['sacs', R.SACS.filter(s => open(s.id)).length, R.SACS.length],
      ['boss', R.BOSSES.length, R.BOSSES.length],
      ['calibres', M.maxCalibre, R.CALIBRES],
    ];
  }

  // Un contenu verrouillé : son défi, ou « ??? » tant que son palier est fermé.
  function lockDesc(id) {
    const u = lockOf(id);
    if (M.isQueued(id)) return T('coll.queuedDesc');
    if (!M.tierOpen(u.tier)) return T('tier.closed', { n: u.tier, need: M.TIERS[u.tier - 1], have: M.count() });
    return `${L.unlock(id)}${u.cal ? T('coll.cal', { n: u.cal }) : ''}<br><small>${T('tier.head', { n: u.tier, name: T('tier.names')[u.tier - 1] })}</small>`;
  }
  function collRow(open, card, cls, label, name, desc, id) {
    if (open) return offerRow(card, cls, label, name, desc);
    if (!id || !lockOf(id)) return offerRow(iconCard('g:cadenas', 'locked'), 'locked', T('coll.locked'), name, desc);
    const hidden = !M.tierOpen(lockOf(id).tier);
    return offerRow(iconCard(hidden ? 'g:mystere' : 'g:cadenas', 'locked'), 'locked', T(M.isQueued(id) ? 'coll.queued' : 'coll.locked'),
      hidden ? T('tier.mystery') : name, lockDesc(id));
  }
  function tierLine() {
    let t = 1;
    while (t < 4 && M.tierOpen(t + 1)) t++;
    return t < 4 ? T('tier.next', { n: t, need: M.TIERS[t], have: M.count() }) : T('tier.all');
  }

  function renderCollection() {
    const tabs = collTabs();
    const done = tabs.reduce((m, t) => m + t[1], 0), total = tabs.reduce((m, t) => m + t[2], 0);
    $('coll-count').innerHTML = `${T('defis.count', { n: done, total })}<br><small>${tierLine()}</small>`;
    const bar = $('coll-tabs');
    bar.innerHTML = '';
    for (const [id, n, max] of tabs) {
      const b = document.createElement('button');
      b.className = id === collTab ? 'on' : '';
      b.innerHTML = `${T('coll.tab.' + id)}<small>${n}/${max}</small>`;
      b.addEventListener('click', () => { A.click(); collTab = id; renderCollection(); $('coll-list').scrollTop = 0; });
      bar.appendChild(b);
    }
    const box = $('coll-list');
    box.innerHTML = '';
    const add = el => box.appendChild(el);
    const head = txt => { const h = document.createElement('h3'); h.textContent = txt; add(h); };

    if (collTab === 'feux') {
      for (const id of Object.keys(TYPES)) {
        const u = lockOf(id), open = !u || M.isUnlocked(id);
        const label = R.START_BAG[id] ? T('coll.start') : u ? T('defis.done') : T('coll.shop');
        const desc = open ? `${cap(typeDesc(id))}. ${T('coll.pts', { n: R.ptsOf(id, { levels: {} }) })}` : '';
        add(collRow(open, iconCard('t:' + id, 'feu'), 'feu', label, typeName(id), desc, id));
      }
    } else if (collTab === 'perks') {
      for (const rarity of Object.keys(R.RARITIES)) {
        head(rarity === 'maudit' ? T('coll.curse') : `${L.rarity(rarity)} · ${L.money(R.RARITIES[rarity].price)}`);
        for (const p of R.PERKS.filter(q => q.rarity === rarity)) {
          const u = lockOf(p.id), open = !u || M.isUnlocked(p.id);
          const e = L.entry('perks', p.id);
          const desc = open ? e.desc + (p.type ? ` ${T('coll.needs', { name: typeName(p.type) })}` : '') : '';
          add(collRow(open, perkCard(p), p.rarity, u ? T('defis.done') : L.rarity(p.rarity), e.name, desc, p.id));
        }
      }
    } else if (collTab === 'outils') {
      head(T('shop.tools'));
      for (const o of R.TOOLS) {
        const e = L.entry('tools', o.id), open = M.isOpen(o.id);
        add(collRow(open, iconCard('g:' + o.id, 'tool'), 'tool', lockOf(o.id) ? T('defis.done') : L.money(o.price), e.name, e.desc, o.id));
      }
      head(T('coll.editions'));
      for (const id of R.EDITIONS) {
        const e = L.entry('editions', id), tool = R.TOOLS.find(o => o.ed === id);
        const vars = { name: L.entry('perks', R.EDITION_PERK[id]).name, tool: L.entry('tools', tool.id).name };
        add(collRow(true, iconCard('g:' + id, 'tool'), 'tool', T('coll.edition', vars), e.name, e.desc));
      }
    } else if (collTab === 'sacs') {
      sacRows(box, renderCollection);
    } else if (collTab === 'boss') {
      for (const b of R.BOSSES) {
        const e = bossText(b.id);
        add(collRow(true, iconCard(BOSS_ICON[b.id], 'boss'), b.final ? 'boss final' : 'boss', T(b.final ? 'coll.final' : 'coll.bossNights'), e.name, e.desc));
      }
    } else {
      head(T('coll.calSac', { sac: sacText(M.sac).name }));
      for (let n = 1; n <= R.CALIBRES; n++) {
        const open = n <= M.maxCalibre;
        const desc = T('calibre.desc', { n }) + (open ? '' : `. ${T('coll.calHint', { n: n - 1 })}`);
        add(collRow(open, iconCard('c:' + n, 'calibre'), n === M.calibre ? 'done' : 'calibre', T(n === M.calibre ? 'coll.current' : 'defis.done'), T('calibre', { n }), desc));
      }
    }
  }
  $('btn-defis').addEventListener('click', () => {
    A.init();
    A.click();
    renderCollection();
    $('collection').classList.remove('hidden');
    $('coll-list').scrollTop = 0;
    M.markSeen();
    renderRecord();
  });

  // ---------- Succès : des trophées, des plus faciles aux secrets ----------
  M.onSucces = ids => { showUnlocks(ids.map(id => ({ succes: id }))); if (atHome()) renderRecord(); };

  // Un succès secret pas encore obtenu ne montre qu'un point d'interrogation.
  function succesCard(a, hide) {
    const el = hide ? iconCard('g:mystere', 'succ') : a.icon.startsWith('s:') ? sacCard(a.icon.slice(2)) : iconCard(a.icon, 'succ');
    el.className = 'pcard succ';
    return el;
  }

  function succesRow(a) {
    const got = M.hasSucces(a.id), hide = a.tier === 5 && !got;
    const e = hide ? { name: T('succes.secret'), desc: T('succes.secretDesc') } : L.entry('succes', a.id, { n: a.goal });
    const v = M.succesVal(a), pct = Math.round((100 * v) / a.goal);
    const count = hide || a.goal === 1 ? '' : `<small>${fmtNum(v)}/${fmtNum(a.goal)}</small>`;
    const el = document.createElement('div');
    el.className = 'offer succ' + (got ? ' got' : '');
    el.appendChild(succesCard(a, hide));
    const txt = document.createElement('div');
    txt.className = 'txt';
    txt.innerHTML = `${got ? `<em>${T('succes.done')}</em>` : ''}<b>${e.name}</b><span>${e.desc}</span>`
      + `<div class="prog"><div class="bar"><i style="width:${pct}%"></i></div>${count}</div>`;
    el.appendChild(txt);
    if (M.isSuccesNew(a.id)) tagNew(el.querySelector('.pcard'));
    return el;
  }

  function renderSucces() {
    $('succes-count').textContent = T('succes.count', { n: M.succesCount(), total: M.SUCCES.length });
    const box = $('succes-list');
    box.innerHTML = '';
    for (let tier = 1; tier <= 5; tier++) {
      const list = M.SUCCES.filter(a => a.tier === tier);
      const h = document.createElement('h3');
      h.innerHTML = `${T('succes.tier' + tier)}<small>${list.filter(a => M.hasSucces(a.id)).length}/${list.length}</small>`;
      box.appendChild(h);
      for (const a of list) box.appendChild(succesRow(a));
    }
  }
  $('btn-succes').addEventListener('click', () => {
    A.init();
    A.click();
    renderSucces();
    $('succes').classList.remove('hidden');
    $('succes-list').scrollTop = 0;
    M.markSuccesSeen();
    renderRecord();
  });

  // ---------- Statistiques ----------
  function renderStats() {
    const s = M.stats, box = $('stats-list');
    box.innerHTML = '';
    const head = txt => { const h = document.createElement('h3'); h.textContent = txt; box.appendChild(h); };
    const row = (lbl, val, small) => { const el = line(lbl, small || '', val, 'gold'); el.classList.add('in'); box.appendChild(el); };
    const fav = o => Object.entries(o).sort((a, b) => b[1] - a[1])[0] || null;
    row(T('stats.runs'), fmtNum(s.runs));
    row(T('stats.wins'), fmtNum(s.wins));
    row(T('stats.nights'), fmtNum(s.nights));
    row(T('stats.shots'), fmtNum(s.shots));
    row(T('stats.feux'), fmtNum(s.feux));
    row(T('stats.fizzled'), fmtNum(s.fizzled || 0));
    row(T('stats.bestChain'), T('run.feux', { n: s.bestChain }));
    row(T('stats.bestShot'), fmtNum(s.bestShot));
    row(T('stats.bestNight'), s.bestNight ? `${Math.min(s.bestNight, R.TARGETS.length)}/${R.TARGETS.length}` : T('stats.none'));
    if (s.bestEndless) row(T('stats.bestEndless'), `${s.bestEndless} ∞`);
    const perk = fav(s.perks), sac = fav(s.sacs);
    row(T('stats.favPerk'), perk ? L.entry('perks', perk[0]).name : T('stats.none'), perk ? T('stats.times', { n: perk[1] }) : '');
    row(T('stats.favSac'), sac ? sacText(sac[0]).name : T('stats.none'), sac ? T('stats.times', { n: sac[1] }) : '');
    head(T('stats.winsCal'));
    for (let n = 1; n <= M.bestCalibre; n++) row(T('calibre', { n }), fmtNum(s.winsCal[n] || 0));
  }
  $('btn-stats').addEventListener('click', () => {
    A.init();
    A.click();
    renderStats();
    $('stats').classList.remove('hidden');
    $('stats-list').scrollTop = 0;
  });

  // ---------- Didacticiel : le jeu expliqué en chapitres illustrés ----------
  // Familles de bonus : chaque bonus dans une seule. Un bonus ajouté sans famille rejoint « ciel » (ou « maudit »).
  const PERK_FAMILY = {
    pts: ['veteran', 'eclairante', 'constellation', 'paillettes', 'follet'],
    feux: ['rafale', 'nitro', 'collection', 'roulement', 'braise', 'colosse'],
    mult: ['ouverture', 'final', 'grand', 'crescendo', 'arcenciel', 'monochrome', 'specialiste', 'ligne', 'solaire', 'sacre', 'boule', 'trophee', 'souffle', 'claque'],
    portee: ['meche', 'croise', 'etages', 'boomerang', 'tonnerre', 'eclipse', 'pluiedor', 'coeur', 'joie'],
    allumettes: ['allumette', 'etincelle', 'reflexe', 'bis', 'reserve'],
    argent: ['tirelire', 'pourboire', 'cendres', 'doree', 'orfevre', 'basdelaine', 'econome', 'billetterie'],
    ciel: ['ciel', 'meteore', 'chef'],
    maudit: ['pacte', 'gregeois', 'usurier', 'poudre'],
  };
  {
    const placed = new Set(Object.values(PERK_FAMILY).flat());
    for (const p of R.PERKS) if (!placed.has(p.id)) PERK_FAMILY[p.rarity === 'maudit' ? 'maudit' : 'ciel'].push(p.id);
  }

  // La démo : le bas d'un ciel, allumé par le pétard en bas à gauche (8 vagues, 11 feux, un feu reste).
  const DEMO_ROWS = ['.P..P.', '.F..CP', '.P..P.', 'PPPPP.'];
  const DEMO_KEY = { P: 'petard', F: 'fusee', C: 'chandelle' };
  const DEMO_Y = ROWS - DEMO_ROWS.length, DEMO_CELL = 24;
  const DEMO_AIM = 0.9, DEMO_FIRE = 2.8, DEMO_WAVE = 0.32, DEMO_HOLD = 3;
  const FINGER = glyph('doigt');
  let demo = null, demoChain = null;
  function demoGrid() {
    const g = [];
    for (let y = 0; y < ROWS; y++) {
      const row = [];
      for (let x = 0; x < COLS; x++) row.push({ type: y >= DEMO_Y ? DEMO_KEY[DEMO_ROWS[y - DEMO_Y][x]] || null : null, wet: false, ed: null });
      g.push(row);
    }
    return g;
  }
  const getDemoChain = () => demoChain || (demoChain = R.chain(demoGrid(), 0, ROWS - 1, { levels: {} }, false));

  function makeDemo(box) {
    const res = getDemoChain(), start = res.waves[0][0];
    const cv = box.appendChild(document.createElement('canvas'));
    cv.className = 'tuto-demo';
    cv.width = COLS * DEMO_CELL;
    cv.height = DEMO_ROWS.length * DEMO_CELL;
    const cap = para(box, '', 'tuto-cap');
    const wave = {};
    res.waves.forEach((w, i) => { for (const f of w) wave[f.y * COLS + f.x] = i; });
    const grid = demoGrid();
    const aim = R.targets(start.type, start.x, start.y, {}, null).filter(([x, y]) => grid[y][x].type).map(([x, y]) => ({ x, y: y - DEMO_Y }));
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    demo = { cv, g, cap, res, wave, start, aim, grid, t: 0, parts: [], text: null };
    demoStep(0);
  }

  function demoStep(dt) {
    const d = demo;
    if (!d || !visible('howto')) return;
    const n = d.res.waves.length, end = DEMO_FIRE + n * DEMO_WAVE, was = d.t;
    d.t += dt;
    if (d.t > end + DEMO_HOLD) { d.t = 0; d.parts.length = 0; }
    d.res.waves.forEach((w, i) => {
      const at = DEMO_FIRE + i * DEMO_WAVE;
      if (!calm && was < at && d.t >= at) for (const f of w) demoBurst(d, f);
    });
    for (const p of d.parts) { p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 90 * dt; }
    d.parts = d.parts.filter(p => p.life < p.max);
    let text;
    if (d.t < DEMO_FIRE) text = T('tuto.demo.aim');
    else if (d.t < end) {
      const w = Math.min(n, Math.floor((d.t - DEMO_FIRE) / DEMO_WAVE) + 1);
      text = T('tuto.demo.fire', { n: d.res.waves.slice(0, w).reduce((m, x) => m + x.length, 0), w });
    } else text = T('tuto.demo.score', { pts: fmtNum(d.res.base), n: d.res.count, elan: L.dec(d.res.mult), score: fmtNum(d.res.score) });
    if (text !== d.text) { d.text = text; d.cap.innerHTML = text; }
    drawDemo(d);
  }

  function demoBurst(d, f) {
    const cx = (f.x + 0.5) * DEMO_CELL, cy = (f.y - DEMO_Y + 0.5) * DEMO_CELL, color = TYPES[f.type].color;
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2, v = 25 + Math.random() * 45;
      d.parts.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, life: 0, max: 0.4 + Math.random() * 0.4, color: Math.random() < 0.3 ? '#ffffff' : color });
    }
  }

  function drawDemo(d) {
    const g = d.g, t = d.t, C = DEMO_CELL;
    g.clearRect(0, 0, d.cv.width, d.cv.height);
    for (let y = 0; y < DEMO_ROWS.length; y++) for (let x = 0; x < COLS; x++) {
      g.fillStyle = '#21173a';
      g.fillRect(x * C + 3, y * C + 3, C - 6, C - 6);
      const c = d.grid[y + DEMO_Y][x];
      if (!c.type) continue;
      const wi = d.wave[(y + DEMO_Y) * COLS + x], at = wi === undefined ? Infinity : DEMO_FIRE + wi * DEMO_WAVE;
      if (t >= at + 0.1) continue;
      const px = x * C + 1, py = y * C + 1;
      // Les coques réapparaissent en gonflant à chaque tour, et tremblent juste avant d'exploser.
      const s = Math.min(1, t / 0.3);
      if (s < 1) {
        const w = Math.max(2, Math.round(22 * s)), o = Math.round((22 - w) / 2);
        g.drawImage(SPR[c.type], px + o, py + o, w, w);
        continue;
      }
      const j = !calm && t > at - 0.12 && t < at ? (Math.random() < 0.5 ? -1 : 1) : 0;
      g.drawImage(SPR[c.type], px + j, py);
      if (t >= at && !calm) g.drawImage(WHITE_DISC, px, py);
    }
    const sx = d.start.x * C, sy = (d.start.y - DEMO_Y) * C;
    if (t >= DEMO_AIM && t < DEMO_FIRE + 0.05) {
      g.drawImage(RING_TOOL, sx - 3, sy - 3);
      if (calm || Math.floor(t * 4) % 2 === 0) for (const p of d.aim) g.drawImage(RING, p.x * C - 3, p.y * C - 3);
    }
    const near = at => t >= at - 0.45 && t < at + 0.35;
    if (near(DEMO_AIM) || near(DEMO_FIRE)) {
      const press = Math.abs(t - DEMO_AIM) < 0.12 || Math.abs(t - DEMO_FIRE) < 0.12;
      g.drawImage(FINGER, sx + 13, sy + (press ? 12 : 15));
    }
    for (const p of d.parts) {
      g.globalAlpha = 1 - p.life / p.max;
      g.fillStyle = p.color;
      g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
    }
    g.globalAlpha = 1;
  }

  // Ce qu'allume un feu, sur un petit ciel de 6 × 8 : le feu en blanc, ce qu'il allume de sa couleur.
  const REACH_AT = { fusee: [2, 6], cascade: [2, 1], ricochet: [2, 7] };
  function reachMap(type) {
    const [fx, fy] = REACH_AT[type] || [2, 4];
    const lit = new Set(R.targets(type === 'miroir' ? 'petard' : type, fx, fy, {}, null).map(([x, y]) => y * COLS + x));
    const c = document.createElement('canvas');
    c.className = 'reach';
    c.width = COLS * 4 + 1;
    c.height = ROWS * 4 + 1;
    const g = c.getContext('2d');
    g.fillStyle = '#170f28';
    g.fillRect(0, 0, c.width, c.height);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      g.fillStyle = x === fx && y === fy ? '#ffffff' : lit.has(y * COLS + x) ? TYPES[type].color : '#2e2448';
      g.fillRect(1 + x * 4, 1 + y * 4, 3, 3);
    }
    return c;
  }

  function para(box, html, cls) {
    const el = box.appendChild(document.createElement('p'));
    el.innerHTML = html;
    if (cls) el.className = cls;
    return el;
  }
  function heading(box, txt) { box.appendChild(document.createElement('h3')).textContent = txt; }
  function tutoRow(box, card, name, desc, cls) {
    const el = document.createElement('div');
    el.className = 'offer tuto-row ' + (cls || '');
    el.appendChild(card);
    const txt = el.appendChild(document.createElement('div'));
    txt.className = 'txt';
    txt.innerHTML = `<b>${name}</b><span>${desc}</span>`;
    return box.appendChild(el);
  }
  // Un contenu encore verrouillé montre son défi (ou « ??? » si son palier est fermé), comme dans la Collection.
  function tutoItem(id, card, name, desc) {
    if (M.isOpen(id)) return { card, name, desc };
    const hidden = !M.tierOpen(lockOf(id).tier);
    return { card: iconCard(hidden ? 'g:mystere' : 'g:cadenas', 'locked'), name: hidden ? T('tier.mystery') : name, desc: lockDesc(id) };
  }
  function perkItem(p) {
    const e = L.entry('perks', p.id);
    return tutoItem(p.id, perkCard(p), e.name, e.desc + (p.type ? ` ${T('coll.needs', { name: typeName(p.type) })}` : ''));
  }
  // Une rangée d'icônes : un toucher en affiche le nom et la description dans l'encart du bas.
  function tutoGrid(box, items) {
    const grid = box.appendChild(document.createElement('div'));
    grid.className = 'tuto-grid';
    const read = $('tuto-read');
    read.classList.remove('hidden');
    for (const it of items) {
      const b = grid.appendChild(document.createElement('button'));
      b.type = 'button';
      b.appendChild(it.card);
      b.addEventListener('click', () => {
        A.card();
        const on = $('tuto-page').querySelector('.tuto-grid .on');
        if (on) on.classList.remove('on');
        b.classList.add('on');
        read.classList.add('on');
        read.innerHTML = `<b>${it.name}</b> ${it.desc}`;
        juice(b, 0.2);
      });
    }
  }

  // Les chapitres, dans l'ordre. p(i) : le paragraphe i du chapitre (tuto.<id> dans i18n.js, 0 = titre).
  const TUTO = {
    but(p, box) {
      p(1);
      const strip = box.appendChild(document.createElement('div'));
      strip.className = 'tuto-strip';
      ['g:lune', 'g:allumette', 'g:coupe'].forEach((icon, i) => {
        const it = strip.appendChild(document.createElement('div'));
        it.appendChild(iconCard(icon, ''));
        it.appendChild(document.createElement('small')).textContent = T('tuto.strip')[i];
      });
      p(2);
      p(3);
    },
    allumer(p, box) {
      p(1);
      makeDemo(box);
      p(2);
      p(3);
    },
    score(p, box) {
      const r = getDemoChain(), lbl = T('tuto.calc');
      p(1);
      const calc = box.appendChild(document.createElement('div'));
      calc.className = 'calc tuto-calc';
      calc.innerHTML = `<div class="chips"><b>${fmtNum(r.base)}</b><small>${lbl[0]}</small></div><span class="times">×</span>`
        + `<div class="mult"><b>${r.count}</b><small>${lbl[1]}</small></div><span class="times">×</span>`
        + `<div class="mult"><b>${L.dec(r.mult)}</b><small>${lbl[2]}</small></div>`;
      para(box, `= <b>${fmtNum(r.score)}</b>`, 'tuto-eq');
      p(2);
      p(3);
    },
    feux(p, box) {
      p(1);
      for (const id of Object.keys(TYPES)) {
        if (!M.isOpen(id)) {
          const it = tutoItem(id, null, typeName(id), '');
          tutoRow(box, it.card, it.name, it.desc, 'locked');
          continue;
        }
        const el = tutoRow(box, iconCard('t:' + id, 'feu'), typeName(id), `${cap(typeDesc(id))}. ${T('coll.pts', { n: R.ptsOf(id, { levels: {} }) })}`, 'feu');
        el.insertBefore(reachMap(id), el.querySelector('.txt'));
      }
      p(2);
    },
    ciel(p, box) {
      p(1);
      const alone = T('tuto.alone'), nudge = T('tuto.nudge'), ars = T('tuto.arsenal');
      tutoRow(box, iconCard('g:cendres', ''), alone[0], alone[1]);
      const nd = document.createElement('div');
      nd.className = 'pcard';
      nd.innerHTML = `<span class="tuto-nudge">${R.NUDGES}</span>`;
      tutoRow(box, nd, nudge[0], nudge[1]);
      tutoRow(box, iconCard('g:arsenal', 'ars'), ars[0], ars[1]);
    },
    boutique(p, box) {
      p(1);
      p(2);
      heading(box, T('shop.packs'));
      for (const pk of R.PACKS) {
        const card = document.createElement('div');
        card.className = 'pcard tuto-pack';
        card.appendChild(packArt(pk.id, 'normal'));
        const e = L.entry('packs', pk.id);
        tutoRow(box, card, e.name, e.desc);
      }
      para(box, T('tuto.sizes'), 'tuto-note');
      p(3);
    },
    pouvoirs(p, box) {
      p(1);
      const rows = [['feu', 't:fusee'], ['sel', 'j:petard'], ['perk', 'g:etincelle'], ['tool', 'g:briquet'], ['ed', 'g:dore'], ['affiche', 'g:affiche'], ['comete', 'g:meteore']];
      for (const [k, icon] of rows) {
        const e = T('tuto.pw.' + k);
        tutoRow(box, iconCard(icon, ''), e[0], e[1]);
      }
      heading(box, T('tuto.rarity'));
      for (const r of Object.keys(R.RARITIES)) {
        const ex = R.PERKS.find(q => q.rarity === r && M.isOpen(q.id));
        const name = r === 'maudit' ? L.rarity(r) : `${L.rarity(r)} · ${L.money(R.RARITIES[r].price)}`;
        tutoRow(box, ex ? perkCard(ex) : iconCard('g:mystere', r), name, T('tuto.rar.' + r), r);
      }
    },
    bonus(p, box) {
      p(1);
      for (const fam of Object.keys(PERK_FAMILY)) {
        const e = T('tuto.fam.' + fam);
        heading(box, e[0]);
        para(box, e[1], 'tuto-note');
        tutoGrid(box, PERK_FAMILY[fam].map(id => perkItem(R.perkById(id))));
      }
      p(2);
    },
    boss(p, box) {
      p(1);
      for (const final of [false, true]) {
        heading(box, T(final ? 'coll.final' : 'coll.bossNights'));
        tutoGrid(box, R.BOSSES.filter(b => !!b.final === final).map(b => {
          const e = bossText(b.id);
          return { card: iconCard(BOSS_ICON[b.id], 'boss'), name: e.name, desc: e.desc };
        }));
      }
      p(2);
      p(3);
    },
    public(p, box) {
      p(1);
      p(2);
      p(3);
      tutoGrid(box, [perkItem(R.perkById('claque')), perkItem(R.perkById('billetterie')), { card: iconCard('g:affiche', ''), ...L.entry('packs', 'affiches') }]);
    },
    argent(p, box) {
      p(1);
      const lines = box.appendChild(document.createElement('div'));
      lines.className = 'lines';
      const add = (lbl, small, val) => { const el = line(lbl, small, '+' + L.money(val), 'gold'); el.classList.add('in'); lines.appendChild(el); };
      add(T('income.round'), T('tuto.m.round', { money: L.money(R.calib(3).pay) }), R.calib(1).pay);
      add(T('income.boss'), '', 3);
      add(T('tuto.m.excessName'), T('tuto.m.excess'), 2);
      add(T('tuto.m.shots'), T('tuto.m.shotsDesc'), 1);
      add(T('income.interest'), T('tuto.m.interest', { step: L.money(5), money: L.money(5) }), 1);
      p(2);
    },
    progression(p, box, txt) {
      p(1);
      heading(box, T('sacs.title'));
      p(2);
      tutoGrid(box, R.SACS.map(s => { const e = sacText(s.id); return tutoItem(s.id, sacCard(s.id), e.name, e.desc); }));
      heading(box, T('coll.tab.calibres'));
      p(3);
      const cal = box.appendChild(document.createElement('div'));
      cal.className = 'tuto-cal';
      for (let n = 1; n <= R.CALIBRES; n++) {
        const cv = cal.appendChild(copyCanvas((n === M.calibre ? CAL_ON : CAL_OFF)[n]));
        if (n > M.maxCalibre) cv.className = 'off';
      }
      p(4);
      para(box, txt[5], 'tuto-bye');
    },
  };
  const TUTO_PAGES = Object.keys(TUTO);
  // tutoThen : ce qui suit la fermeture (la toute première partie passe par le didacticiel).
  let tutoPage = 0, tutoThen = null;

  function renderTuto() {
    const id = TUTO_PAGES[tutoPage], txt = T('tuto.' + id), box = $('tuto-page'), last = tutoPage === TUTO_PAGES.length - 1;
    demo = null;
    $('tuto-step').textContent = T('tuto.step', { n: tutoPage + 1, total: TUTO_PAGES.length });
    $('tuto-title').textContent = txt[0];
    const read = $('tuto-read');
    read.classList.add('hidden');
    read.classList.remove('on');
    read.textContent = T('tuto.tap');
    box.innerHTML = '';
    TUTO[id](i => para(box, txt[i]), box, txt);
    box.scrollTop = 0;
    const dots = $('tuto-dots');
    dots.innerHTML = '';
    TUTO_PAGES.forEach((_, i) => {
      const b = dots.appendChild(document.createElement('button'));
      b.type = 'button';
      b.className = i === tutoPage ? 'on' : '';
      b.setAttribute('aria-label', T('tuto.step', { n: i + 1, total: TUTO_PAGES.length }));
      b.addEventListener('click', () => tutoGo(i));
    });
    $('tuto-prev').disabled = tutoPage === 0;
    $('tuto-next').textContent = T(last ? (tutoThen ? 'tuto.play' : 'tuto.done') : 'tuto.next');
    $('tuto-back').textContent = T(tutoThen ? 'tuto.skip' : 'back');
  }
  function tutoGo(i) {
    if (i < 0 || i >= TUTO_PAGES.length || i === tutoPage) return;
    A.click();
    tutoPage = i;
    renderTuto();
  }
  function openTuto(then) {
    A.init();
    A.click();
    tutoThen = then || null;
    if (then) tutoPage = 0;
    localStorage.setItem('bf-tuto', '1');
    renderTuto();
    $('howto').classList.remove('hidden');
  }
  function leaveTuto() {
    demo = null;
    const then = tutoThen;
    tutoThen = null;
    if (then) then();
  }
  $('tuto-prev').addEventListener('click', () => tutoGo(tutoPage - 1));
  $('tuto-next').addEventListener('click', () => {
    if (tutoPage < TUTO_PAGES.length - 1) { tutoGo(tutoPage + 1); return; }
    A.click();
    $('howto').classList.add('hidden');
    leaveTuto();
  });
  $('tuto-back').addEventListener('click', leaveTuto);
  // Glisser le doigt à gauche ou à droite change de chapitre.
  {
    const page = $('tuto-page');
    let from = null;
    page.addEventListener('pointerdown', e => { from = { x: e.clientX, y: e.clientY }; });
    page.addEventListener('pointercancel', () => { from = null; });
    page.addEventListener('pointerup', e => {
      if (!from) return;
      const dx = e.clientX - from.x, dy = e.clientY - from.y;
      from = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) tutoGo(tutoPage + (dx < 0 ? 1 : -1));
    });
  }

  function showHome() {
    st.token++;
    st.anim = null;
    st.phase = 'menu';
    st.paused = false;
    reveal = null;
    hideScreens();
    menu.classList.add('hidden');
    document.body.classList.add('at-home');
    BG.setMode('menu');
    BG.setPalette('normal');
    A.setMood('normal');
    A.setBoss(null);
    A.setUrgent(false);
    A.setScene('menu');
    renderRecord();
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    BG.setHome(atHome());
    if (atHome()) homeStep(dt, now);
    else if (hitstop > 0) { hitstop -= dt; draw(now); }
    else { step(dt); draw(now); }
    partyStep(dt);
    packStep(dt, now);
    demoStep(dt);
    requestAnimationFrame(frame);
  }

  // ---------- Toucher ----------
  canvas.addEventListener('pointerdown', (ev) => {
    A.init();
    if (st.phase !== 'aim' || st.paused) return;
    const r = canvas.getBoundingClientRect();
    const px = (ev.clientX - r.left - view.ox) / view.scale;
    const py = (ev.clientY - r.top - view.oy) / view.scale;
    const x = Math.floor((px - GX) / CELL), y = Math.floor((py - GY) / CELL);
    const out = x < 0 || y < 0 || x >= COLS || y >= ROWS;
    if (st.tool) { if (!out) toolTap(x, y); return; }
    if (st.nudge) { if (!out) nudgeTap(x, y); else { st.nudge.from = null; updateHud(); } return; }
    if (out || !st.grid[y][x].type) { st.sel = null; updateHud(); return; }
    if (st.sel && st.sel.x === x && st.sel.y === y) fire(x, y);
    else {
      st.sel = { x, y }; st.grid[y][x].seen = true; A.card(); cam.zoom = Math.min(0.08, cam.zoom + 0.01);
      const p = cellCenter(x, y);
      shock(p.x, p.y, TYPES[st.grid[y][x].type].color, 22, 34, 0.25);
      updateHud();
    }
  });

  // ---------- Outils ----------
  // On touche un outil, puis la ou les cases qu'il vise ; toucher l'outil à nouveau annule.
  function renderNudge() {
    const b = $('btn-nudge');
    if (!b) return;
    b.classList.toggle('hidden', !st.help);
    b.textContent = st.nudges || 0;
    b.disabled = st.phase !== 'aim' || !st.nudges;
    b.classList.toggle('on', !!st.nudge);
    b.setAttribute('aria-label', T('nudge.aria'));
  }
  function useNudge() {
    if (st.phase !== 'aim' || st.paused || !st.nudges) return;
    A.click();
    st.sel = null;
    if (st.nudge) st.nudge = null;
    else { st.tool = null; st.nudge = { from: null }; }
    updateHud();
  }
  function nudgeTap(x, y) {
    const n = st.nudge, c = st.grid[y][x];
    const nope = () => { A.click(); vibrate(10); };
    if (!n.from) {
      if (!c.type) return nope();
      n.from = { x, y };
      c.seen = true;
      A.card();
    } else if (n.from.x === x && n.from.y === y) n.from = null;
    else if (!R.nudge(st.grid, n.from, { x, y })) return nope();
    else {
      puff(x, y); puff(n.from.x, n.from.y);
      A.card();
      st.nudges--;
      st.nudge = st.nudges ? { from: null } : null;
      R.markAlone(st.grid, mods());
      saveRun('aim');
    }
    updateHud();
  }
  $('btn-nudge').addEventListener('click', useNudge);

  function useTool(i) {
    const id = st.tools[i];
    if (!id || st.phase !== 'aim' || st.paused) return;
    A.init();
    A.click();
    if (st.tool && st.tool.i === i) { st.tool = null; updateHud(); return; }
    st.nudge = null;
    st.sel = null;
    if (id === 'secours') {
      st.tools.splice(i, 1);
      st.tool = null;
      st.shots++;
      toolUsed();
      fx.texts.push({ x: W / 2, y: H * 0.4, text: T('tool.done.secours'), color: CHIPS, life: 0, max: 1.3, size: 17, still: true });
      juice($('shots').parentElement, 0.45);
      A.cash(false);
      vibrate(25);
      saveRun('aim');
      updateHud();
      return;
    }
    if (id === 'lanterne' || id === 'sablier') {
      st.tools.splice(i, 1);
      st.tool = null;
      let text;
      if (id === 'lanterne') {
        st.lantern = true;
        R.dry(st.grid);
        for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (st.grid[y][x].type) puff(x, y, GOLD);
        text = T('tool.done.lanterne');
      } else {
        const lit = R.hourglass(st.grid);
        for (const q of lit) puff(q.x, q.y, '#ff7a1a');
        text = T('tool.done.sablier', { n: lit.length });
      }
      toolUsed();
      fx.texts.push({ x: W / 2, y: H * 0.4, text, color: GOLD, life: 0, max: 1.3, size: 17, still: true });
      A.bonus(2, false);
      vibrate(25);
      R.markAlone(st.grid, mods());
      saveRun('aim');
      updateHud();
      return;
    }
    st.tool = { i, id, picks: [], aim: null };
    updateHud();
  }

  function puff(x, y, color) {
    const p = cellCenter(x, y);
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2, v = 30 + Math.random() * 50;
      fx.particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.45, color: color || '#dfe6f0', size: 2 });
    }
  }

  function toolUsed() {
    M.record('tools');
    showUnlocks(M.check({ type: 'tool' }));
  }

  // L'outil a changé le ciel : on laisse retomber, puis on revient à la visée (sans météore ni extinction en plus).
  function toolDone() {
    toolUsed();
    st.tools.splice(st.tool.i, 1);
    st.tool = null;
    st.skipMeteor = true;
    st.burnChecked = true;
    st.phase = 'fall';
    vibrate(20);
    updateHud();
  }

  function toolTap(x, y) {
    const t = st.tool, c = st.grid[y][x];
    const same = q => q && q.x === x && q.y === y;
    const nope = () => { A.click(); vibrate(10); };
    if (t.id === 'briquet') {
      if (!c.type) return nope();
      if (same(t.picks[0])) t.picks = [];
      else {
        t.picks.push({ x, y });
        c.seen = true;
        A.card();
        if (t.picks.length === 2) {
          const [p, q] = t.picks;
          st.tools.splice(t.i, 1);
          toolUsed();
          fire(p.x, p.y, [[q.x, q.y]]);
          return;
        }
      }
    } else if (t.id === 'pince') {
      if (!t.picks.length) { if (!c.type) return nope(); t.picks.push({ x, y }); c.seen = true; A.card(); }
      else if (same(t.picks[0])) t.picks = [];
      else {
        const p = t.picks[0];
        R.swapCells(st.grid, p, { x, y });
        puff(x, y); puff(p.x, p.y);
        A.card();
        toolDone();
        return;
      }
    } else if (!same(t.aim)) { t.aim = { x, y }; A.card(); }
    else if (t.id === 'renfort') {
      const fresh = R.reinforce(st.grid, x, y, st.bag, mods(), st.sky);
      if (!fresh.length) return nope();
      for (const q of fresh) { st.grid[q.y][q.x].dy = 1.5; puff(q.x, q.y, GOLD); }
      A.boom(1, 2);
      toolDone();
      return;
    } else if (t.id === 'eteignoir') {
      const gone = R.snuff(st.grid, x, y);
      if (!gone.length) return nope();
      for (let i = 0; i < 2; i++) puff(x, y, '#9aa0aa');
      A.fizzle();
      refill({ gone });
      toolDone();
      return;
    } else if (R.toolById(t.id).ed) {
      const ed = R.toolById(t.id).ed, done = R.decorate(st.grid, x, y, ed);
      if (!done.length) return nope();
      const color = ed === 'dore' ? GOLD : ed === 'geant' ? '#ff7ad9' : '#9ad0ff';
      for (const q of done) { puff(q.x, q.y, color); puff(q.x, q.y, '#ffffff'); }
      A.bonus(3, ed === 'geant');
      toolDone();
      return;
    } else {
      R.wind(st.grid, y);
      for (let cx = 0; cx < COLS; cx++) if (st.grid[y][cx].type) puff(cx, y);
      A.fizzle();
      toolDone();
      return;
    }
    updateHud();
  }

  let toolsKey = '';
  function renderTools() {
    const key = st.tools.join() + '|' + (st.tool ? st.tool.i : '') + '|' + (st.phase === 'aim') + '|' + R.toolSlots(st);
    if (key === toolsKey) return;
    toolsKey = key;
    const box = $('tools');
    box.innerHTML = '';
    for (let i = 0; i < R.toolSlots(st); i++) {
      const id = st.tools[i];
      const btn = document.createElement('button');
      btn.className = 'tool' + (id ? '' : ' empty') + (st.tool && st.tool.i === i ? ' on' : '');
      btn.disabled = !id || st.phase !== 'aim';
      if (id) {
        btn.appendChild(copyCanvas(glyph(id)));
        btn.setAttribute('aria-label', L.entry('tools', id).name);
        btn.addEventListener('click', () => useTool(i));
      }
      box.appendChild(btn);
    }
  }

  function play() {
    // Toute première partie : le didacticiel d'abord (« Passer » ou « Jouer ! » lancent la run).
    if (!M.stats.runs && !localStorage.getItem('bf-tuto')) { openTuto(play); return; }
    A.init(); A.startMusic(); A.click();
    startRun();
  }
  $('btn-play').addEventListener('click', play);
  $('btn-resume').addEventListener('click', resumeRun);
  $('btn-again').addEventListener('click', play);
  $('btn-recap-home').addEventListener('click', () => { A.click(); showHome(); });
  $('btn-howto').addEventListener('click', () => openTuto());
  for (const el of document.querySelectorAll('.js-back')) {
    el.addEventListener('click', () => {
      A.click();
      const screen = el.closest('.overlay');
      screen.classList.add('hidden');
      if (screen.id === 'arsenal') picking = null;
      if (screen.id === 'arsenal' && arsenalFromGame && menu.classList.contains('hidden')) st.paused = false;
    });
  }

  // ---------- Menu burger / options ----------
  const menu = $('menu');
  function syncToggles() {
    const set = (id, on) => { $(id).classList.toggle('off', !on); $(id).querySelector('span').textContent = T(on ? 'on' : 'off'); };
    set('m-music', A.musicOn);
    set('m-sfx', A.sfxOn);
    set('m-vib', vibOn);
    $('m-vib').classList.toggle('hidden', !canVibrate);
    $('m-fx').classList.toggle('off', calm);
    $('m-fx').querySelector('span').textContent = T(calm ? 'fx.calm' : 'fx.full');
    set('m-cb', cbOn);
  }
  function openMenu() {
    if (!menu.classList.contains('hidden')) return;
    A.init();
    A.click();
    st.paused = true;
    syncToggles();
    resetConfirm();
    const inRun = !atHome();
    $('menu-title').textContent = T(inRun ? 'menu.pause' : 'menu.options');
    $('m-resume').textContent = T(inRun ? 'menu.resume' : 'back');
    $('m-rules').classList.toggle('hidden', !inRun);
    $('m-credits').classList.toggle('hidden', inRun);
    $('m-restart').classList.toggle('hidden', !inRun);
    $('m-home').classList.toggle('hidden', !inRun);
    menu.classList.remove('hidden');
  }
  function closeMenu() {
    menu.classList.add('hidden');
    if (!visible('arsenal')) st.paused = false;
  }

  // Recommencer et Menu principal demandent un deuxième toucher pour ne pas perdre la run par erreur.
  let confirmBtn = null, confirmTimer = 0;
  const LABELS = { 'm-restart': 'menu.restart', 'm-home': 'menu.home' };
  function resetConfirm() {
    clearTimeout(confirmTimer);
    for (const id in LABELS) $(id).textContent = T(LABELS[id]);
    confirmBtn = null;
  }
  function confirmed(id) {
    if (confirmBtn === id) { resetConfirm(); return true; }
    resetConfirm();
    confirmBtn = id;
    $(id).textContent = T('sure');
    juice($(id), 0.15);
    confirmTimer = setTimeout(resetConfirm, 2500);
    return false;
  }

  $('btn-menu').addEventListener('click', openMenu);
  $('btn-options').addEventListener('click', openMenu);
  $('m-resume').addEventListener('click', () => { A.click(); closeMenu(); });
  $('m-music').addEventListener('click', () => { A.startMusic(); A.setMusic(!A.musicOn); A.click(); syncToggles(); });
  $('m-sfx').addEventListener('click', () => { A.setSfx(!A.sfxOn); A.click(); syncToggles(); });
  $('m-vib').addEventListener('click', () => {
    vibOn = !vibOn;
    localStorage.setItem('bf-vib', vibOn ? '1' : '0');
    A.click();
    vibrate(40);
    syncToggles();
  });
  $('m-fx').addEventListener('click', () => {
    calm = !calm;
    localStorage.setItem('bf-calm', calm ? '1' : '0');
    document.body.classList.toggle('calm', calm);
    A.click();
    syncToggles();
  });
  $('m-cb').addEventListener('click', () => {
    cbOn = !cbOn;
    localStorage.setItem('bf-cb', cbOn ? '1' : '0');
    buildShells();
    A.click();
    syncToggles();
  });
  $('m-rules').addEventListener('click', () => openTuto());
  $('m-feedback').addEventListener('click', () => A.click());
  $('btn-demo').href = SITE_URL;
  $('btn-demo').addEventListener('click', () => A.click());
  $('demo-tag').classList.toggle('hidden', !DEMO);
  $('btn-tip').href = TIP_URL;
  $('btn-tip').classList.toggle('hidden', !TIP_URL);
  $('btn-tip').addEventListener('click', () => A.click());
  $('m-credits').addEventListener('click', () => { A.click(); $('credits').classList.remove('hidden'); $('credits').querySelector('.credits').scrollTop = 0; });
  $('m-restart').addEventListener('click', () => {
    A.click();
    if (!confirmed('m-restart')) return;
    closeMenu();
    hideScreens();
    play();
  });
  $('m-home').addEventListener('click', () => {
    A.click();
    if (!confirmed('m-home')) return;
    showHome();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !atHome() && st.phase !== 'menu') openMenu();
  });

  // ---------- Langue ----------
  function applyLang() {
    for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = T(el.dataset.i18n);
    for (const el of document.querySelectorAll('.lang button')) el.classList.toggle('on', el.dataset.lang === L.lang);
    if (DEMO) $('demo-tag').textContent = T('demo.tag', { n: DEMO });
    $('title').innerHTML = [...T('title')].map((ch, i) => `<span style="animation-delay:${-i * 0.12}s"><i${intro && i < intro.lit ? ' class="lit"' : ''}>${ch}</i></span>`).join('');
    $('credits-version').textContent = window.Native.version ? T('credits.version', { v: window.Native.version }) : '';
    const fv = { v: window.Native.version || 'web', ua: (navigator.userAgent.match(/\(([^)]*)\)/) || ['', navigator.userAgent])[1] };
    $('m-feedback').href = `mailto:dario.olibet@gmail.com?subject=${encodeURIComponent(T('feedback.subject', fv))}&body=${encodeURIComponent(T('feedback.body', fv))}`;
    syncToggles();
    resetConfirm();
    if (!menu.classList.contains('hidden')) {
      const inRun = !atHome();
      $('menu-title').textContent = T(inRun ? 'menu.pause' : 'menu.options');
      $('m-resume').textContent = T(inRun ? 'menu.resume' : 'back');
    }
    renderRecord();
    if (visible('arsenal')) renderArsenal();
    if (visible('collection')) renderCollection();
    if (visible('succes')) renderSucces();
    if (visible('stats')) renderStats();
    if (visible('howto')) renderTuto();
    if (visible('shop-screen')) renderShop();
    if (packView && !packView.busy) { updatePackSub(); renderPackInfo(); }
    updateHud();
  }
  for (const el of document.querySelectorAll('.lang button')) {
    el.addEventListener('click', () => { A.init(); A.click(); L.set(el.dataset.lang); juice(el, 0.3); });
  }
  L.onChange(applyLang);
  applyLang();

  resize();
  showHome();
  startIntro();
  requestAnimationFrame(frame);
  window.__game = { st, R, M, mods, showRecap, openShop, loadRun, resumeRun, updateHud };

  // Bouton retour d'Android : ferme l'écran ouvert, sinon met la partie en pause. false : l'appli passe en arrière-plan.
  window.__androidBack = () => {
    // Le didacticiel et les crédits s'ouvrent par-dessus le menu : on les ferme d'abord.
    for (const id of ['howto', 'credits']) if (visible(id)) { $(id).querySelector('.js-back').click(); return true; }
    if (visible('menu')) { A.click(); closeMenu(); return true; }
    if (visible('arsenal')) { $('arsenal').querySelector('.js-back').click(); return true; }
    if (visible('pack') || !$('unlock').classList.contains('hidden')) return true;
    for (const id of ['collection', 'succes', 'sacs', 'stats']) {
      if (visible(id)) { $(id).querySelector('.js-back').click(); return true; }
    }
    if (atHome()) return false;
    openMenu();
    return true;
  };
  window.__androidPause = on => A.pause(on);

  // Appli installable : le cache hors ligne (sw.js) ne s'enregistre qu'en https ou sur localhost. L'appli Android embarque ses fichiers.
  if (!window.Native.on && 'serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { /* pas de cache hors ligne */ }));
  }
})();
