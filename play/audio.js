// Musique d'ambiance et bruitages, tout est synthétisé (aucun fichier son).
// Morceaux en sections de 8 mesures : accueil, soirée, dernière allumette,
// trois thèmes de boss, trois airs de boutique, défaite, bouquet final.
// Le morceau change à la mesure suivante ; la dernière allumette, dès le pas suivant.
(function () {
  const LOOKAHEAD = 0.15;
  // Pas = double croche ; tempo et swing changent avec le morceau (setTempo).
  let STEP = 60 / 96 / 4, SWING = STEP * 0.14;

  // Chaque morceau : tempo, swing (part d'un pas), sections enchaînées tous les 8 mesures,
  // 8 accords d'une mesure (root = basse), mélodie sur 8 mesures [pas, note, durée en pas].
  const TRACKS = {
    // Accueil : ballade de nuit en ré majeur, boîte à musique et cloches.
    menu: {
      bpm: 76, swing: 0.1, sections: ['a', 'b'],
      chords: [
        { root: 38, notes: [50, 54, 57, 61] },
        { root: 35, notes: [50, 54, 57, 59] },
        { root: 43, notes: [50, 54, 55, 59] },
        { root: 45, notes: [52, 54, 57, 61] },
        { root: 42, notes: [49, 52, 54, 57] },
        { root: 35, notes: [50, 54, 57, 59] },
        { root: 40, notes: [50, 52, 55, 59] },
        { root: 45, notes: [49, 52, 55, 57] },
      ],
      melody: [
        [0, 78, 8], [8, 76, 4], [12, 73, 4], [16, 74, 12], [28, 73, 4],
        [32, 71, 8], [40, 74, 4], [44, 78, 4], [48, 76, 16],
        [64, 73, 8], [72, 76, 4], [76, 78, 4], [80, 81, 8], [88, 78, 8],
        [96, 79, 8], [104, 78, 4], [108, 76, 4], [112, 73, 12], [124, 69, 4],
      ],
    },
    // Soirée : La m7 - Fa maj7 - Ré m7 - Mi 7 - La m7 - Do maj7 - Fa maj7 - Mi 7.
    jeu: {
      bpm: 96, swing: 0.14, sections: ['intro', 'groove', 'groove2', 'pont'],
      chords: [
        { root: 45, notes: [57, 60, 64, 67] },
        { root: 41, notes: [53, 57, 60, 64] },
        { root: 38, notes: [50, 53, 57, 60] },
        { root: 40, notes: [52, 56, 59, 62] },
        { root: 45, notes: [57, 60, 64, 67] },
        { root: 36, notes: [55, 59, 60, 64] },
        { root: 41, notes: [53, 57, 60, 64] },
        { root: 40, notes: [52, 56, 59, 62] },
      ],
      melody: [
        [0, 76, 6], [6, 74, 2], [8, 72, 4], [12, 69, 4],
        [16, 72, 6], [22, 74, 2], [24, 76, 8],
        [32, 77, 6], [38, 76, 2], [40, 74, 4], [44, 72, 4],
        [48, 71, 6], [54, 68, 2], [56, 71, 4], [60, 74, 4],
        [64, 81, 6], [70, 79, 2], [72, 76, 4], [76, 72, 4],
        [80, 79, 6], [86, 76, 2], [88, 72, 4], [92, 74, 4],
        [96, 77, 6], [102, 76, 2], [104, 72, 4], [108, 69, 4],
        [112, 71, 8], [120, 68, 4], [124, 64, 4],
      ],
    },
    // Boss « jugement » : ré mineur, basse au galop, glas et lead menaçant (Ré m - Ré m - Mi♭ - Ré m - Si♭ - Do - La - La♭9).
    boss: {
      bpm: 108, swing: 0, sections: ['a', 'b', 'c'],
      chords: [
        { root: 38, notes: [50, 53, 57, 62] },
        { root: 38, notes: [50, 53, 57, 62] },
        { root: 39, notes: [51, 55, 58, 63] },
        { root: 38, notes: [50, 53, 57, 62] },
        { root: 34, notes: [50, 53, 58, 62] },
        { root: 36, notes: [52, 55, 60, 64] },
        { root: 33, notes: [49, 52, 57, 61] },
        { root: 33, notes: [49, 52, 58, 61] },
      ],
      melody: [
        [0, 74, 4], [4, 77, 4], [8, 76, 4], [12, 74, 4], [16, 73, 8], [24, 74, 8],
        [32, 75, 4], [36, 79, 4], [40, 77, 4], [44, 75, 4], [48, 74, 16],
        [64, 77, 4], [68, 74, 4], [72, 70, 8], [80, 79, 4], [84, 76, 4], [88, 72, 8],
        [96, 76, 8], [104, 73, 8], [112, 70, 4], [116, 73, 4], [120, 76, 4], [124, 81, 4],
      ],
    },
    // Boutique, air 1 : petit jazz swing, basse qui marche, piano électrique et vibraphone (Do - La m - Ré m - Sol 7 - Mi m - La 7 - Ré m - Sol 7).
    boutique: {
      bpm: 112, swing: 0, sections: ['a', 'b', 'c'],
      chords: [
        { root: 36, third: 4, notes: [52, 55, 59, 62] },
        { root: 45, third: 3, notes: [55, 60, 64, 69] },
        { root: 38, third: 3, notes: [53, 57, 60, 64] },
        { root: 43, third: 4, notes: [53, 59, 62, 64] },
        { root: 40, third: 3, notes: [50, 55, 59, 62] },
        { root: 45, third: 4, notes: [55, 61, 64, 67] },
        { root: 38, third: 3, notes: [53, 57, 60, 64] },
        { root: 43, third: 4, notes: [53, 59, 62, 64] },
      ],
      melody: [
        [0, 76, 3], [3, 79, 3], [6, 83, 4], [12, 81, 4], [16, 79, 6], [22, 76, 2], [24, 72, 8],
        [32, 74, 3], [35, 77, 3], [38, 81, 4], [44, 79, 4], [48, 77, 6], [54, 74, 2], [56, 71, 8],
        [64, 71, 3], [67, 74, 3], [70, 79, 6], [76, 76, 4], [80, 79, 4], [84, 76, 4], [88, 73, 8],
        [96, 74, 4], [100, 77, 4], [104, 81, 8], [112, 79, 4], [116, 77, 4], [120, 74, 4], [124, 71, 4],
      ],
    },
    // Boutique, air 2 : comptoir, lent et chaud, en si bémol (Si♭ - Sol m - Mi♭ - Fa - Si♭ - Do m - Mi♭ - Fa).
    comptoir: {
      bpm: 84, swing: 0.08, sections: ['a', 'b'],
      chords: [
        { root: 46, notes: [58, 62, 65, 69] },
        { root: 43, notes: [58, 62, 65, 67] },
        { root: 39, notes: [51, 55, 58, 62] },
        { root: 41, notes: [53, 57, 60, 63] },
        { root: 46, notes: [58, 62, 65, 69] },
        { root: 36, notes: [60, 63, 67, 70] },
        { root: 39, notes: [51, 55, 58, 62] },
        { root: 41, notes: [53, 57, 60, 63] },
      ],
      melody: [
        [0, 70, 8], [8, 74, 4], [12, 72, 4], [16, 70, 8], [24, 67, 8],
        [32, 65, 8], [40, 70, 4], [44, 72, 4], [48, 74, 16],
        [64, 77, 8], [72, 74, 4], [76, 72, 4], [80, 70, 8], [88, 67, 8],
        [96, 70, 8], [104, 74, 4], [108, 77, 4], [112, 79, 8], [120, 77, 4], [124, 74, 4],
      ],
    },
    // Boutique, air 3 : foire, sautillant, en sol majeur (Sol - Sol - Do - Ré - Mi m - Do - Sol - Ré).
    foire: {
      bpm: 124, swing: 0, sections: ['a', 'b'],
      chords: [
        { root: 43, notes: [59, 62, 67, 71] },
        { root: 43, notes: [59, 62, 67, 74] },
        { root: 48, notes: [60, 64, 67, 72] },
        { root: 50, notes: [62, 66, 69, 74] },
        { root: 40, notes: [64, 67, 71, 76] },
        { root: 48, notes: [60, 64, 67, 72] },
        { root: 43, notes: [59, 62, 67, 71] },
        { root: 50, notes: [54, 62, 66, 69] },
      ],
      melody: [
        [0, 79, 2], [2, 83, 2], [4, 86, 4], [8, 83, 2], [10, 79, 2], [12, 78, 4],
        [16, 74, 2], [18, 78, 2], [20, 79, 4], [24, 83, 8],
        [32, 86, 2], [34, 83, 2], [36, 79, 4], [40, 78, 2], [42, 74, 2], [44, 71, 4],
        [48, 74, 4], [52, 78, 4], [56, 79, 8],
        [64, 81, 2], [66, 83, 2], [68, 86, 4], [72, 83, 4], [76, 79, 4],
        [80, 78, 4], [84, 79, 4], [88, 83, 8],
        [96, 79, 2], [98, 76, 2], [100, 74, 4], [104, 71, 4], [108, 67, 4],
        [112, 71, 2], [114, 74, 2], [116, 78, 4], [120, 79, 4], [124, 83, 4],
      ],
    },
    // Défaite : la foule rentre, ré mineur, lent et presque vide (Ré m - Si♭ - Fa - Do - Ré m - Sol m - Si♭ - La).
    defaite: {
      bpm: 72, swing: 0, sections: ['a', 'b'],
      chords: [
        { root: 38, notes: [50, 53, 57, 62] },
        { root: 34, notes: [46, 50, 53, 58] },
        { root: 41, notes: [53, 57, 60, 65] },
        { root: 36, notes: [48, 52, 55, 60] },
        { root: 38, notes: [50, 53, 57, 62] },
        { root: 43, notes: [50, 55, 58, 62] },
        { root: 34, notes: [46, 50, 53, 58] },
        { root: 45, notes: [49, 52, 57, 61] },
      ],
      melody: [
        [0, 74, 8], [8, 72, 4], [12, 70, 4], [16, 69, 8], [24, 67, 8],
        [32, 65, 8], [40, 64, 4], [44, 62, 4], [48, 60, 16],
        [64, 70, 8], [72, 67, 4], [76, 65, 4], [80, 62, 8], [88, 60, 8],
        [96, 67, 8], [104, 65, 8], [112, 62, 4], [116, 61, 4], [120, 62, 8],
      ],
    },
    // Bouquet final : la run est gagnée, ré majeur, clair et large (Ré - Sol - La - Ré - Si m - Sol - La - Ré).
    victoire: {
      bpm: 100, swing: 0, sections: ['a', 'b'],
      chords: [
        { root: 38, notes: [54, 57, 62, 66] },
        { root: 43, notes: [55, 59, 62, 67] },
        { root: 45, notes: [52, 57, 61, 64] },
        { root: 38, notes: [54, 57, 62, 66] },
        { root: 47, notes: [54, 59, 62, 66] },
        { root: 43, notes: [55, 59, 62, 67] },
        { root: 45, notes: [52, 57, 61, 64] },
        { root: 38, notes: [54, 57, 62, 66] },
      ],
      melody: [
        [0, 74, 4], [4, 78, 4], [8, 81, 8], [16, 83, 4], [20, 81, 4], [24, 78, 8],
        [32, 74, 4], [36, 78, 4], [40, 81, 4], [44, 86, 4], [48, 85, 8], [56, 81, 8],
        [64, 78, 4], [68, 81, 4], [72, 83, 8], [80, 86, 4], [84, 85, 4], [88, 81, 8],
        [96, 86, 4], [100, 85, 4], [104, 81, 4], [108, 78, 4], [112, 81, 8], [120, 86, 8],
      ],
    },
    // Dernière allumette : la mineur qui frotte (seconde mineure), mèche et cœur.
    stress: {
      bpm: 132, swing: 0, sections: ['a', 'b'],
      chords: [
        { root: 45, notes: [57, 60, 64, 70] },
        { root: 45, notes: [57, 60, 64, 67] },
        { root: 38, notes: [50, 53, 57, 62] },
        { root: 40, notes: [56, 59, 62, 65] },
        { root: 45, notes: [57, 60, 64, 70] },
        { root: 41, notes: [57, 60, 65, 69] },
        { root: 46, notes: [58, 62, 65, 70] },
        { root: 40, notes: [56, 59, 62, 64] },
      ],
      melody: [
        [0, 81, 2], [4, 82, 2], [8, 81, 4],
        [16, 76, 2], [20, 77, 2], [24, 76, 4], [28, 72, 4],
        [32, 82, 2], [36, 81, 2], [40, 76, 4], [48, 72, 8],
        [64, 69, 2], [68, 72, 2], [72, 76, 4], [80, 82, 2], [84, 81, 4],
        [96, 77, 4], [104, 76, 4], [112, 72, 4], [120, 69, 4], [124, 64, 4],
      ],
    },
    // Boss « orage » : plus lent, glas et gouttes (Ré m - Ré m - Do - Si♭ - Fa m - Do 7 - Sol m - La 7).
    orage: {
      bpm: 96, swing: 0, sections: ['a', 'b', 'c'],
      chords: [
        { root: 38, notes: [57, 62, 65, 69] },
        { root: 38, notes: [57, 62, 65, 69] },
        { root: 36, notes: [60, 64, 67, 71] },
        { root: 34, notes: [58, 62, 65, 70] },
        { root: 41, notes: [53, 56, 60, 65] },
        { root: 36, notes: [60, 64, 67, 70] },
        { root: 43, notes: [55, 58, 62, 67] },
        { root: 45, notes: [57, 61, 64, 67] },
      ],
      melody: [
        [0, 62, 8], [8, 65, 4], [12, 69, 4], [16, 70, 8], [24, 67, 8],
        [32, 65, 8], [40, 62, 8], [48, 60, 8], [56, 62, 8],
        [64, 65, 4], [68, 69, 4], [72, 72, 8], [80, 70, 8], [88, 67, 8],
        [96, 69, 8], [104, 65, 4], [108, 62, 4], [112, 61, 4], [116, 62, 4], [120, 65, 8],
      ],
    },
    // Boss « pénurie » : sec et pressé, en mi mineur avec un triton (Mi m - Mi m - Si♭ - Mi m - Do - La m - Si 7 - Mi m).
    serre: {
      bpm: 120, swing: 0, sections: ['a', 'b', 'c'],
      chords: [
        { root: 40, notes: [64, 67, 71, 74] },
        { root: 40, notes: [64, 67, 71, 74] },
        { root: 34, notes: [58, 62, 65, 68] },
        { root: 40, notes: [64, 67, 71, 74] },
        { root: 36, notes: [60, 64, 67, 72] },
        { root: 45, notes: [57, 60, 64, 67] },
        { root: 47, notes: [59, 63, 66, 69] },
        { root: 40, notes: [64, 67, 71, 77] },
      ],
      melody: [
        [0, 76, 2], [4, 79, 2], [8, 76, 2], [12, 74, 2],
        [16, 71, 2], [20, 72, 2], [24, 76, 6],
        [32, 79, 2], [36, 76, 2], [40, 83, 2], [44, 79, 2], [48, 76, 6],
        [64, 72, 2], [68, 71, 2], [72, 74, 4], [80, 76, 2], [84, 79, 2], [88, 83, 4], [96, 79, 6],
        [104, 76, 2], [108, 74, 2], [112, 71, 2], [116, 68, 2], [120, 64, 4], [124, 60, 4],
      ],
    },
  };
  const JEU_BASS = [[0, 0, 3], [3, 0, 2], [6, 12, 2], [8, 7, 3], [11, 0, 2], [12, 12, 2], [14, 10, 2]];
  const JEU_ARP = [0, 1, 2, 3, 4, 3, 2, 1, 0, 2, 1, 3, 2, 4, 3, 1];

  let ac = null, master, musicBus, musicFilter, sfxBus, wobble, noise;
  let revIn, sfxRevIn, dlyIn, dlyL, dlyR, padBus, padFilter;
  let musicOn = localStorage.getItem('bf-music') !== '0';
  let sfxOn = localStorage.getItem('bf-sfx') !== '0';
  let playing = false, step = 0, nextTime = 0, timer = 0;
  let scene = 'menu', mood = 'normal', urgent = false, bossName = null, shopIx = 0;
  let track = null, sceneBar = 0, surgeUntil = 0, lastLand = 0;
  // Même boss, même thème, pour qu'on le reconnaisse.
  const BOSS_TRACK = {
    voisin: 'boss', critique: 'boss', jury: 'boss', courte: 'boss',
    pluie: 'orage', brouillard: 'orage', orage: 'orage', nuitnoire: 'orage',
    couvrefeu: 'serre', humides: 'serre', penurie: 'serre', taxe: 'serre', coupefeu: 'serre',
  };
  const SHOPS = ['boutique', 'comptoir', 'foire'];

  const hz = m => 440 * Math.pow(2, (m - 69) / 12);

  // Réverbération : un écho de salle fabriqué avec du bruit qui s'éteint.
  function impulse(len, decay) {
    const n = Math.floor(ac.sampleRate * len), b = ac.createBuffer(2, n, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
    }
    return b;
  }
  function panner(p) {
    if (!ac.createStereoPanner) return ac.createGain();
    const s = ac.createStereoPanner();
    s.pan.value = p;
    return s;
  }

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; return; }
    master = ac.createDynamicsCompressor();
    master.threshold.value = -14;
    master.ratio.value = 4;
    master.connect(ac.destination);
    musicFilter = ac.createBiquadFilter();
    musicFilter.type = 'lowpass';
    musicFilter.frequency.value = 2600;
    musicBus = ac.createGain();
    musicBus.gain.value = musicOn ? 0.55 : 0;
    musicBus.connect(musicFilter).connect(master);
    sfxBus = ac.createGain();
    sfxBus.gain.value = sfxOn ? 0.9 : 0;
    sfxBus.connect(master);

    const rev = ac.createConvolver();
    rev.buffer = impulse(2.6, 2.6);
    revIn = ac.createGain();
    const revOut = ac.createGain();
    revOut.gain.value = 0.42;
    revIn.connect(rev).connect(revOut).connect(musicBus);
    // Les explosions ont leur propre écho, qui reste quand la musique est coupée.
    const sfxRev = ac.createConvolver();
    sfxRev.buffer = impulse(1.8, 3);
    sfxRevIn = ac.createGain();
    const sfxRevOut = ac.createGain();
    sfxRevOut.gain.value = 0.35;
    sfxRevIn.connect(sfxRev).connect(sfxRevOut).connect(sfxBus);

    // Écho ping-pong à la croche pointée, de gauche à droite.
    dlyIn = ac.createGain();
    dlyL = ac.createDelay(1);
    dlyR = ac.createDelay(1);
    dlyL.delayTime.value = dlyR.delayTime.value = STEP * 3;
    const fl = ac.createGain(), fr = ac.createGain();
    fl.gain.value = fr.gain.value = 0.36;
    const damp = ac.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 2400;
    dlyIn.connect(dlyL);
    dlyL.connect(panner(-0.7)).connect(musicBus);
    dlyL.connect(fl).connect(damp).connect(dlyR);
    dlyR.connect(panner(0.7)).connect(musicBus);
    dlyR.connect(fr).connect(dlyL);

    // Les nappes passent par un filtre qui s'ouvre et se referme lentement.
    padFilter = ac.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 1300;
    padFilter.Q.value = 2;
    const sweep = ac.createOscillator(), depth = ac.createGain();
    sweep.frequency.value = 0.05;
    depth.gain.value = 650;
    sweep.connect(depth).connect(padFilter.frequency);
    sweep.start();
    padBus = ac.createGain();
    padBus.connect(padFilter).connect(musicBus);
    const padRev = ac.createGain();
    padRev.gain.value = 0.6;
    padFilter.connect(padRev).connect(revIn);

    // Léger « pleurage » de bande sur les nappes et la mélodie.
    const lfo = ac.createOscillator();
    lfo.frequency.value = 0.35;
    wobble = ac.createGain();
    wobble.gain.value = 9;
    lfo.connect(wobble);
    lfo.start();
    noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  // Sortie d'une voix : panoramique, puis envois vers la réverbération et l'écho.
  function out(dest, opts) {
    const o = opts || {};
    const g = ac.createGain();
    const p = o.pan ? panner(o.pan) : null;
    if (p) g.connect(p).connect(dest); else g.connect(dest);
    const music = dest === musicBus || dest === padBus;
    if (o.rev) { const s = ac.createGain(); s.gain.value = o.rev; g.connect(s).connect(music ? revIn : sfxRevIn); }
    if (o.dly && music) { const s = ac.createGain(); s.gain.value = o.dly; g.connect(s).connect(dlyIn); }
    return g;
  }

  function tone(dest, type, freq, t, len, vol, opts) {
    const o = ac.createOscillator();
    const env = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (opts && opts.slide) o.frequency.exponentialRampToValueAtTime(opts.slide, t + len);
    if (opts && opts.detune) o.detune.value = opts.detune;
    if (opts && opts.wob) {
      wobble.connect(o.detune);
      o.onended = () => wobble.disconnect(o.detune);
    }
    const a = (opts && opts.attack) || 0.005;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(vol, t + a);
    let end = t + len;
    if (opts && opts.hold) {
      // Nappe : on tient la note puis on la relâche par-dessus la suivante.
      env.gain.setValueAtTime(vol, t + len * 0.8);
      end = t + len + opts.hold;
    }
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    o.connect(env).connect(out(dest, opts));
    o.start(t);
    o.stop(end + 0.05);
  }

  function hiss(dest, t, len, vol, type, freq, q, opts) {
    const s = ac.createBufferSource();
    s.buffer = noise;
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q || 0.7;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(f).connect(g).connect(out(dest, opts));
    s.start(t, Math.random() * 0.5);
    s.stop(t + len + 0.05);
  }

  // ---------- Batterie ----------
  function kick(t, v) {
    tone(musicBus, 'sine', 150, t, 0.3, 0.55 * v, { slide: 42 });
    hiss(musicBus, t, 0.015, 0.12 * v, 'highpass', 3000);
  }
  function snare(t, v) {
    hiss(musicBus, t, 0.18, 0.11 * v, 'bandpass', 1900, 0.8, { rev: 0.35 });
    tone(musicBus, 'triangle', 210, t, 0.09, 0.08 * v, { slide: 150 });
  }
  function clap(t, v) {
    for (let i = 0; i < 3; i++) hiss(musicBus, t + i * 0.011, i === 2 ? 0.16 : 0.03, 0.07 * v, 'bandpass', 1300, 1.2, { rev: 0.4, pan: 0.15 });
  }
  function hat(t, v, open) {
    hiss(musicBus, t, open ? 0.24 : 0.035, (open ? 0.04 : 0.032) * v, 'highpass', open ? 6500 : 8000, 0.7, { pan: (Math.random() - 0.5) * 0.5 });
  }
  function crash(t) {
    hiss(musicBus, t, 1.8, 0.055, 'highpass', 4200, 0.6, { rev: 0.6, pan: -0.2 });
    hiss(musicBus, t, 1.4, 0.035, 'bandpass', 9000, 0.6, { pan: 0.3 });
  }
  function tom(t, f, v) { tone(musicBus, 'sine', f, t, 0.22, 0.3 * v, { slide: f * 0.45, rev: 0.3 }); }
  // Cymbale ride de jazz et petit coup de baguette sur le bord de la caisse.
  function ride(t, v) { hiss(musicBus, t, 0.3, 0.022 * v, 'highpass', 7000, 0.8, { pan: 0.3, rev: 0.2 }); tone(musicBus, 'square', 5200, t, 0.02, 0.004 * v, { pan: 0.3 }); }
  function rim(t, v) { tone(musicBus, 'square', 1700, t, 0.018, 0.03 * v, { pan: -0.15 }); hiss(musicBus, t, 0.03, 0.05 * v, 'bandpass', 2200, 2, { pan: -0.15, rev: 0.2 }); }
  // Glas grave, partiels inharmoniques d'une cloche.
  function gong(t) {
    [1, 2.76, 5.4, 8.9].forEach((r, i) => tone(musicBus, 'sine', 55 * r, t, 2.6 - i * 0.5, [0.12, 0.05, 0.025, 0.012][i], { rev: 0.7, pan: (i % 2 ? 0.2 : -0.2) }));
  }

  // ---------- Instruments ----------
  const rnd = () => 0.8 + Math.random() * 0.4;
  // Nappe : deux scies désaccordées par note, l'une à gauche, l'autre à droite.
  function pad(ch, t, v) {
    ch.notes.forEach((m, i) => {
      tone(padBus, 'sawtooth', hz(m), t, STEP * 16, v, { attack: 0.6, hold: 0.9, detune: -9, pan: -0.45 + i * 0.05, wob: true });
      tone(padBus, 'sawtooth', hz(m), t, STEP * 16, v, { attack: 0.6, hold: 0.9, detune: 9, pan: 0.45 - i * 0.05, wob: true });
      if (i === 0) tone(padBus, 'triangle', hz(m + 12), t, STEP * 16, v * 1.4, { attack: 1, hold: 0.9 });
    });
  }
  // Piano électrique : sinus doux et une octave de triangle qui s'éteint plus vite.
  function epiano(notes, t, len, v) {
    notes.forEach((m, i) => {
      tone(musicBus, 'sine', hz(m), t, len, v, { attack: 0.006, rev: 0.25, pan: -0.25 + i * 0.15, wob: true });
      tone(musicBus, 'triangle', hz(m + 12), t, len * 0.4, v * 0.22, { pan: -0.25 + i * 0.15 });
    });
  }
  function bell(m, t, len, v, opts) {
    tone(musicBus, 'sine', hz(m), t, len, v, Object.assign({ rev: 0.6, dly: 0.35 }, opts));
    tone(musicBus, 'triangle', hz(m + 12), t, len * 0.4, v * 0.25, { rev: 0.6 });
  }
  const notesAt = (tr, mel) => tr.melody.filter(x => x[0] === mel);

  // Tic de mèche : une note courte qui passe encore le filtre étouffé des boss.
  function tickFuse(t, strong) {
    tone(musicBus, 'square', strong ? 1560 : 1040, t, 0.016, strong ? 0.026 : 0.012, { pan: strong ? -0.35 : 0.35 });
    hiss(musicBus, t, 0.012, strong ? 0.02 : 0.01, 'highpass', 6000, 0.8, { pan: strong ? -0.35 : 0.35 });
  }
  // Dernière allumette, tout de suite : la mèche tic-taque, le cœur cogne, une seconde mineure frotte.
  function menace(c) {
    if (!c.urgent) return;
    const { s, t, ch } = c;
    if (s % 2 === 0) tickFuse(t, s % 4 === 0);
    if (s === 0 || s === 8) tone(musicBus, 'sine', hz(ch.root + 13), t, STEP * 6, 0.012, { attack: 0.04, rev: 0.35 });
    if (s === 3 || s === 11) kick(t, 0.42);
  }

  // ---------- Partitions ----------
  const PLAY = {
    menu(c) {
      const { s, t, ts, sec, ch, mel } = c;
      if (s === 0) {
        pad(ch, t, 0.012);
        tone(musicBus, 'sine', hz(ch.root - 12), t, STEP * 15, 0.07, { attack: 0.1 });
        tone(musicBus, 'triangle', hz(ch.root), t, STEP * 9, 0.12, { attack: 0.02 });
      }
      if (s === 10) tone(musicBus, 'triangle', hz(ch.root + 7), t, STEP * 6, 0.08, { attack: 0.02 });
      // Boîte à musique en croches, qui rebondit dans l'écho.
      if (s % 2 === 0) {
        const k = [0, 2, 1, 3, 2, 1, 3, 2][s / 2];
        tone(musicBus, 'sine', hz(ch.notes[k] + (s >= 8 ? 24 : 12)), ts, STEP * 2.5, 0.02 * rnd(), { pan: s % 4 ? 0.4 : -0.4, dly: 0.4, rev: 0.4 });
      }
      // Cloches : la moitié de la mélodie, puis toute.
      for (const [, m, len] of notesAt(c.tr, mel)) {
        if (sec === 'b' || mel < 64) bell(m + (sec === 'a' ? 12 : 0), t, Math.max(0.7, STEP * len), sec === 'a' ? 0.03 : 0.045, { pan: mel % 16 < 8 ? -0.2 : 0.2 });
      }
      if (sec === 'b') {
        if (s === 0) kick(t, 0.4);
        if (s === 10) kick(t, 0.25);
        if (s === 4 || s === 12) hiss(musicBus, t, 0.14, 0.035, 'bandpass', 2600, 0.9, { rev: 0.5 });
        if (s % 2 === 1) hiss(musicBus, ts, 0.04, 0.014 * rnd(), 'highpass', 7500, 0.7, { pan: 0.3 });
      }
      // Craquements de vieux disque.
      if (Math.random() < 0.18) hiss(musicBus, t + Math.random() * STEP, 0.006, 0.015 + Math.random() * 0.03, 'highpass', 2500, 0.7, { pan: (Math.random() - 0.5) * 0.8 });
    },

    jeu(c) {
      const { s, t, ts, sec, b8, last, ch, mel, surge } = c;
      if (s === 0) pad(ch, t, sec === 'intro' ? 0.014 : 0.017);
      // Arpège en doubles croches, qui rebondit dans l'écho.
      if (sec !== 'intro' || b8 >= 4) {
        const k = JEU_ARP[s], m = k === 4 ? ch.notes[0] + 12 : ch.notes[k];
        tone(musicBus, 'triangle', hz(m + 12), ts, STEP * 1.6, (sec === 'pont' ? 0.032 : 0.022) * rnd(), { pan: s % 4 < 2 ? -0.35 : 0.35, dly: 0.35, rev: 0.25 });
      }
      // Basse et sous-basse.
      if (sec !== 'pont') {
        const v = sec === 'intro' ? 0.14 : 0.22;
        for (const [at, off, len] of JEU_BASS) if (at === s) tone(musicBus, 'triangle', hz(ch.root + off), t, STEP * len, v);
      }
      if (s === 0 && sec !== 'intro') tone(musicBus, 'sine', hz(ch.root - 12), t, STEP * 15, 0.13, { attack: 0.08 });
      // Mélodie : la moitié au premier groove, entière au second, en clochettes dans le pont.
      for (const [, m, len] of notesAt(c.tr, mel)) {
        if (sec === 'groove2' || (sec === 'groove' && mel < 64)) {
          tone(musicBus, 'square', hz(m), t, STEP * len, 0.03, { attack: 0.02, wob: true, rev: 0.3, dly: 0.22, pan: 0.08 });
          tone(musicBus, 'sine', hz(m + 12), t, STEP * len, 0.018, { attack: 0.03, rev: 0.4 });
        } else if (sec === 'pont' && mel % 8 === 0) {
          tone(musicBus, 'sine', hz(m + 12), t, 0.9, 0.04, { rev: 0.6, dly: 0.4, pan: (mel % 16 ? 0.4 : -0.4) });
          tone(musicBus, 'triangle', hz(m + 24), t, 0.4, 0.012, { rev: 0.6 });
        }
      }
      // Batterie.
      if (sec === 'groove' || sec === 'groove2') {
        if (s === 0 && b8 === 0) crash(t);
        if (s === 0 || s === 8 || s === 10 || (s === 14 && b8 % 2 === 1)) kick(t, 1);
        if (s === 4 || s === 12) { snare(t, 1); if (sec === 'groove2') clap(t, 0.8); }
        if (last && s >= 12) snare(t, 0.4 + (s - 12) * 0.2);
        if (s % 2 === 1) hat(ts, (s % 4 === 3 ? 1 : 0.6) * rnd());
        if (s === 6 || s === 14) hat(ts, 0.8, true);
        if (surge && s % 2 === 0) hat(t, 0.7);
      } else if (sec === 'intro') {
        if (s === 0 || (b8 >= 4 && s === 8)) kick(t, 0.7);
        if (b8 >= 2 && s % 4 === 2) hat(ts, 0.7 * rnd());
        if (last && s >= 8 && s % 2 === 0) snare(t, 0.3 + (s - 8) * 0.08);
      } else {
        if (s === 0) kick(t, 0.5);
        if (s % 4 === 2) hat(ts, 0.5 * rnd());
        if (s === 12) clap(t, 0.5);
        if (last && s >= 8) snare(t, 0.25 + (s - 8) * 0.1);
      }
    },

    boss(c) {
      const { s, t, sec, b8, last, ch, mel, surge } = c;
      const big = sec === 'c' || c.final;
      if (s === 0) {
        pad(ch, t, big ? 0.016 : 0.012);
        // Bourdon grave qui gronde sous tout le reste.
        tone(musicBus, 'sawtooth', hz(ch.root - 12), t, STEP * 16, 0.035, { attack: 0.5, hold: 0.5, detune: -12 });
        if (b8 % 4 === 0) gong(t);
      }
      // Basse au galop : croche, deux doubles.
      if (s % 4 !== 1) {
        const off = s === 14 ? 12 : s === 15 ? 7 : 0;
        tone(musicBus, 'sawtooth', hz(ch.root + off), t, STEP * 0.9, (s % 4 === 0 ? 0.07 : 0.05) * rnd());
        tone(musicBus, 'triangle', hz(ch.root + off), t, STEP * 0.9, 0.12);
      }
      // Arpège serré qui tourne en boucle sur l'accord. Une octave de plus dans la troisième partie.
      if (sec !== 'a' || b8 >= 4) {
        const k = [0, 1, 2, 3, 2, 1][s % 6];
        tone(musicBus, 'triangle', hz(ch.notes[k] + (big ? 24 : 12)), t, STEP * 1.2, 0.016 * rnd(), { pan: s % 2 ? 0.35 : -0.35, dly: 0.25 });
      }
      // Lead à la scie, une octave dessous en renfort. Le boss final l'a dès le début.
      if (sec !== 'a' || c.final) {
        for (const [, m, len] of notesAt(c.tr, mel)) {
          tone(musicBus, 'square', hz(m), t, STEP * len, big ? 0.034 : 0.028, { attack: 0.02, wob: true, rev: 0.35, dly: 0.25 });
          tone(musicBus, 'sawtooth', hz(m - 12), t, STEP * len, 0.014, { attack: 0.03, detune: 8, rev: 0.3 });
          if (big) tone(musicBus, 'sine', hz(m + 12), t, STEP * len * 0.5, 0.012, { rev: 0.4 });
        }
      }
      // Batterie lourde, roulement de toms à la dernière mesure, et plus serrée dans la troisième partie.
      if (s === 0 && (b8 === 0 || c.final)) crash(t);
      if (s === 0 || s === 3 || s === 8 || s === 10 || (sec !== 'a' && s === 14)) kick(t, s === 3 ? 0.6 : 1);
      if (s === 4 || s === 12) { snare(t, 1.1); clap(t, 0.6); }
      if (s % 2 === 0) hat(t, (s % 4 === 2 ? 0.9 : 0.5) * rnd());
      if (big && s % 2 === 1) hat(t, 0.45);
      if (surge && s % 2 === 1) hat(t, 0.6);
      if (last && s >= 8 && s % 2 === 0) tom(t, 210 - (s - 8) * 18, 1);
      if (sec === 'c' && s % 4 === 2) tom(t, 140 + (s % 8) * 20, 0.45);
      menace(c);
    },

    orage(c) {
      const { s, t, sec, b8, last, ch, mel, surge } = c;
      const big = sec === 'c' || c.final;
      if (s === 0) {
        pad(ch, t, big ? 0.016 : 0.01);
        tone(musicBus, 'sine', hz(ch.root - 12), t, STEP * 16, 0.1, { attack: 0.3 });
        if (b8 % 4 === 0) gong(t);
      }
      // Basse lente : la fondamentale, puis la quinte.
      if (s === 0) tone(musicBus, 'sawtooth', hz(ch.root), t, STEP * 7, 0.05, { attack: 0.02 });
      if (s === 8) tone(musicBus, 'triangle', hz(ch.root + 7), t, STEP * 6, 0.14);
      // Gouttes, au hasard, dans l'aigu.
      if (s % 4 === 2 && Math.random() < 0.75) {
        tone(musicBus, 'sine', hz(ch.notes[s % 3] + 24), t, 0.18, 0.012, { rev: 0.55, pan: (Math.random() - 0.5) * 0.8 });
      }
      if (sec !== 'a' || b8 >= 4 || c.final) {
        for (const [, m, len] of notesAt(c.tr, mel)) {
          tone(musicBus, 'triangle', hz(m), t, STEP * len, 0.04, { attack: 0.05, rev: 0.4, wob: true });
          if (big) tone(musicBus, 'square', hz(m + 12), t, STEP * len, 0.016, { attack: 0.04, rev: 0.35 });
        }
      }
      if (s === 0 || s === 8) kick(t, sec === 'a' ? 0.65 : 1);
      if (s === 10 && sec !== 'a') kick(t, 0.5);
      if (s === 4 || s === 12) snare(t, big ? 1 : 0.7);
      if (sec !== 'a' && s % 2 === 0) hat(t, 0.4 * rnd());
      if (big && s % 4 === 2) hat(t, 0.55, true);
      if (surge && s % 2 === 0) hat(t, 0.55);
      if (last && s >= 8 && s % 2 === 0) tom(t, 160 - (s - 8) * 10, 0.85);
      menace(c);
    },

    serre(c) {
      const { s, t, sec, b8, last, ch, mel, surge } = c;
      const big = sec === 'c' || c.final;
      if (s === 0) {
        tone(musicBus, 'sawtooth', hz(ch.root - 12), t, STEP * 8, 0.03, { attack: 0.04, detune: 7 });
        if (sec !== 'a') pad(ch, t, 0.006);
        if (b8 === 0 && sec !== 'a') crash(t);
      }
      // Basse piquée, en croches.
      if (s % 4 === 0) {
        const off = s === 12 ? 7 : 0;
        tone(musicBus, 'square', hz(ch.root + off), t, STEP * 0.8, 0.045);
        tone(musicBus, 'triangle', hz(ch.root + off), t, STEP * 1.2, 0.1);
      }
      // Accords secs, sur les 2 et 4.
      if ((s === 4 || s === 12) && sec !== 'a') {
        ch.notes.forEach((m, i) => tone(musicBus, 'square', hz(m), t, STEP * 0.7, 0.012, { pan: -0.3 + i * 0.18 }));
      }
      if (sec !== 'a' || c.final) {
        for (const [, m, len] of notesAt(c.tr, mel)) {
          tone(musicBus, 'square', hz(m), t, STEP * Math.min(len, 3), 0.024, { attack: 0.005, rev: 0.15, wob: true });
          // Le triton en dessous, dans la troisième partie : ça serre.
          if (big) tone(musicBus, 'sawtooth', hz(m - 6), t, STEP * 0.8, 0.01, { rev: 0.2 });
        }
      }
      if (s === 0 || s === 8 || (big && s === 10)) kick(t, 0.9);
      if (s === 4 || s === 12) { rim(t, 1); if (sec !== 'a') snare(t, 0.55); }
      if (sec !== 'a' && s % 2 === 1) hat(t, 0.5 * rnd());
      if (big && s % 2 === 0) hat(t, 0.32);
      if (last && s >= 10) snare(t, 0.35);
      if (surge && s % 2 === 0) hat(t, 0.6);
      menace(c);
    },

    stress(c) {
      const { s, t, sec, b8, ch, mel } = c;
      if (s === 0) {
        tone(musicBus, 'sawtooth', hz(ch.root - 12), t, STEP * 16, 0.04, { attack: 0.15, hold: 0.25, detune: -8 });
        tone(musicBus, 'sine', hz(ch.root + 13), t, STEP * 14, 0.014, { attack: 0.3, rev: 0.4 });
      }
      if (s % 2 === 0) tickFuse(t, s % 4 === 0);
      if (s === 0 || s === 8) kick(t, s === 0 ? 0.9 : 0.6);
      if (s === 3 || s === 11) kick(t, 0.38);
      if (s % 8 === 0) tone(musicBus, 'triangle', hz(ch.root), t, STEP * 2, 0.16);
      if (sec !== 'a') {
        if (s === 4 || s === 12) snare(t, 0.75);
        if (s % 2 === 1) hat(t, 0.4 * rnd());
        for (const [, m, len] of notesAt(c.tr, mel)) {
          tone(musicBus, 'square', hz(m), t, STEP * Math.min(len, 4), 0.022, { attack: 0.01, wob: true, rev: 0.2 });
        }
      }
      if (sec === 'b' && b8 === 7 && s >= 8 && s % 2 === 0) tom(t, 180 - (s - 8) * 12, 0.7);
    },

    boutique(c) {
      const { s, t, sec, b8, bar, ch, mel, tr } = c;
      // Swing de jazz : la croche du contretemps arrive en retard.
      const ts = t + (s % 4 === 2 ? STEP * 0.34 : 0);
      if (s === 0) pad(ch, t, 0.006);
      // Basse qui marche : fondamentale, tierce, quinte, puis un demi-ton pour amener l'accord suivant.
      if (s % 4 === 0) {
        const next = tr.chords[(bar + 1) % 8].root;
        const off = [0, ch.third, 7][s / 4];
        const m = s === 12 ? (Math.abs(next - 1 - ch.root - 7) < Math.abs(next + 1 - ch.root - 7) ? next - 1 : next + 1) : ch.root + off;
        tone(musicBus, 'triangle', hz(m), t, STEP * 3.4, 0.2, { attack: 0.01 });
        tone(musicBus, 'sine', hz(m - 12), t, STEP * 3, 0.07);
      }
      // Accords du piano : sur le temps et sur le contretemps du 2.
      if (s === 0) epiano(ch.notes, t, STEP * 3, 0.022);
      if (s === 6) epiano(ch.notes, ts, STEP * 1.6, 0.018);
      if (s === 14 && b8 % 2 === 1) epiano(ch.notes, ts, STEP * 1.6, 0.016);
      // Vibraphone : la mélodie, des arpèges dans la seconde partie, les deux dans la troisième.
      if (sec === 'a' || sec === 'c') {
        for (const [, m, len] of notesAt(tr, mel)) {
          const at = mel % 4 === 2 ? ts : t;
          tone(musicBus, 'sine', hz(m + (sec === 'c' ? 12 : 0)), at, Math.max(0.35, STEP * len), sec === 'c' ? 0.03 : 0.042, { rev: 0.35, dly: 0.12, wob: true, pan: 0.15 });
          tone(musicBus, 'sine', hz(m + 12), at, 0.2, 0.01, { rev: 0.3 });
        }
      }
      if (sec !== 'a' && s % 2 === 0) {
        const k = [0, 1, 2, 3, 2, 3, 1, 2][s / 2];
        tone(musicBus, 'sine', hz(ch.notes[k] + 12), s % 4 === 2 ? ts : t, STEP * 2, 0.022 * rnd(), { rev: 0.35, pan: s % 8 < 4 ? -0.3 : 0.3 });
      }
      // Batterie aux balais : ride « ding, ding-da », charleston au pied, coups de bord.
      if (s === 0 || s === 4 || s === 8 || s === 12) ride(t, s % 8 ? 1 : 0.8);
      if (s === 6 || s === 14) ride(ts, 0.6);
      if (s === 4 || s === 12) hiss(musicBus, t, 0.04, 0.03, 'highpass', 6000, 0.7, { pan: -0.3 });
      if (s === 0) kick(t, 0.3);
      if (s === 8 && b8 % 2 === 0) kick(t, 0.2);
      if (sec !== 'a' && (s === 4 || s === 12)) rim(t, 1);
      if (b8 === 7 && s === 14) rim(ts, 0.8);
    },

    comptoir(c) {
      const { s, t, ts, sec, ch, mel } = c;
      if (s === 0) {
        pad(ch, t, 0.01);
        epiano(ch.notes, t, STEP * 6, 0.02);
        tone(musicBus, 'sine', hz(ch.root - 12), t, STEP * 14, 0.06, { attack: 0.08 });
      }
      if (s === 8 && sec === 'b') epiano(ch.notes, ts, STEP * 3, 0.014);
      // Basse posée : fondamentale, puis quinte. Dans la seconde partie elle marche en noires.
      if (sec === 'a') {
        if (s === 0) tone(musicBus, 'triangle', hz(ch.root), t, STEP * 6, 0.16, { attack: 0.02 });
        if (s === 8) tone(musicBus, 'triangle', hz(ch.root + 7), t, STEP * 6, 0.12, { attack: 0.02 });
      } else if (s % 4 === 0) {
        const off = [0, ch.notes[0] - ch.root, 7, 10][s / 4];
        tone(musicBus, 'triangle', hz(ch.root + off), t, STEP * 3.2, 0.15, { attack: 0.015 });
      }
      for (const [, m, len] of notesAt(c.tr, mel)) {
        bell(m, t, Math.max(0.6, STEP * len), sec === 'b' ? 0.04 : 0.032, { pan: mel % 16 < 8 ? -0.15 : 0.2 });
      }
      if (s === 0) kick(t, 0.35);
      if (s === 8) kick(t, 0.22);
      if (s % 4 === 2) hiss(musicBus, ts, 0.05, 0.012, 'highpass', 7000, 0.7, { pan: 0.25 });
      if (sec === 'b' && (s === 4 || s === 12)) rim(t, 0.6);
    },

    foire(c) {
      const { s, t, sec, b8, ch, mel } = c;
      if (s === 0 && sec === 'b') pad(ch, t, 0.005);
      // Oom-pah : basse sur le temps, accord piqué sur le contretemps.
      if (s === 0 || s === 8) tone(musicBus, 'triangle', hz(ch.root), t, STEP * 2, 0.18);
      if (s === 4 || s === 12) {
        ch.notes.forEach((m, i) => tone(musicBus, 'triangle', hz(m), t, STEP * 1.1, 0.028, { pan: -0.25 + i * 0.14, rev: 0.15 }));
      }
      for (const [, m, len] of notesAt(c.tr, mel)) {
        bell(m, t, Math.max(0.28, STEP * len), 0.034, { pan: 0.1, dly: 0.15 });
        if (sec === 'b') bell(m - 12, t, Math.max(0.22, STEP * len), 0.016, { pan: -0.25 });
      }
      if (s === 0 && b8 === 0) crash(t);
      if (s === 0 || s === 8) kick(t, 0.55);
      if (s === 4 || s === 12) snare(t, sec === 'b' ? 0.7 : 0.45);
      if (sec === 'b' && s % 2 === 1) hat(t, 0.45 * rnd());
      if (s === 14 && b8 % 2 === 1) rim(t, 0.7);
    },

    defaite(c) {
      const { s, t, sec, b8, ch, mel } = c;
      if (s === 0) {
        pad(ch, t, 0.008);
        tone(musicBus, 'sine', hz(ch.root - 12), t, STEP * 16, 0.07, { attack: 0.4 });
        tone(musicBus, 'triangle', hz(ch.root), t, STEP * 10, 0.08, { attack: 0.05 });
      }
      for (const [, m, len] of notesAt(c.tr, mel)) {
        bell(m, t, Math.max(0.9, STEP * len), sec === 'b' ? 0.04 : 0.03, { pan: -0.1, dly: 0.35 });
        if (sec === 'b') bell(m - 12, t, Math.max(0.7, STEP * len), 0.016, { pan: 0.25, dly: 0.2 });
      }
      if (sec === 'b' && s === 0) kick(t, 0.28);
      if (b8 % 2 === 0 && s === 8) tone(musicBus, 'sine', hz(ch.notes[0] + 12), t, 1.2, 0.012, { rev: 0.6, pan: 0.3 });
      if (Math.random() < 0.1) hiss(musicBus, t + Math.random() * STEP, 0.006, 0.012, 'highpass', 2500, 0.7, { pan: (Math.random() - 0.5) * 0.6 });
    },

    victoire(c) {
      const { s, t, sec, b8, ch, mel } = c;
      if (s === 0) {
        pad(ch, t, sec === 'b' ? 0.016 : 0.012);
        tone(musicBus, 'sine', hz(ch.root - 12), t, STEP * 15, 0.09, { attack: 0.08 });
        if (b8 === 0) crash(t);
      }
      if (s === 0) tone(musicBus, 'triangle', hz(ch.root), t, STEP * 6, 0.16, { attack: 0.02 });
      if (s === 8) tone(musicBus, 'triangle', hz(ch.root + 7), t, STEP * 6, 0.12, { attack: 0.02 });
      if (sec === 'b' && (s === 4 || s === 12)) {
        ch.notes.forEach((m, i) => tone(musicBus, 'triangle', hz(m), t, STEP * 2, 0.02, { pan: -0.2 + i * 0.12, rev: 0.25 }));
      }
      for (const [, m, len] of notesAt(c.tr, mel)) {
        bell(m, t, Math.max(0.45, STEP * len), 0.042, { pan: 0.12, dly: 0.28 });
        if (sec === 'b') bell(m - 12, t, Math.max(0.35, STEP * len), 0.018, { pan: -0.2 });
      }
      if (s === 0 || s === 8) kick(t, s === 0 ? 0.6 : 0.4);
      if (s === 4 || s === 12) snare(t, sec === 'b' ? 0.55 : 0.3);
      if (sec === 'b' && s % 2 === 1) hat(t, 0.4 * rnd());
    },
  };

  function setTempo(t) {
    const tr = TRACKS[track];
    STEP = 60 / tr.bpm / 4;
    SWING = STEP * tr.swing;
    dlyL.delayTime.setValueAtTime(STEP * 3, t);
    dlyR.delayTime.setValueAtTime(STEP * 3, t);
  }

  function wantedTrack() {
    if (scene === 'boutique') return SHOPS[shopIx];
    if (scene === 'jeu' && mood !== 'normal') return BOSS_TRACK[bossName] || 'boss';
    if (scene === 'jeu' && urgent) return 'stress';
    return scene;
  }

  // Le morceau change à la mesure, et repart du début. La dernière allumette entre dès le pas suivant.
  function scheduleStep(n, t) {
    let s = n % 16;
    const want = wantedTrack();
    // La dernière allumette, la défaite et le bouquet final entrent tout de suite.
    const cut = want === 'stress' || want === 'defaite' || want === 'victoire' || track === 'stress' || track === 'defaite' || track === 'victoire';
    if (!track || (want !== track && (s === 0 || cut))) {
      const jumped = s !== 0 && !!track;
      track = want;
      sceneBar = 0;
      setTempo(t);
      if (jumped) { step -= s; s = 0; }
    } else if (s === 0) sceneBar++;
    if (!track || !PLAY[track]) return;
    const tr = TRACKS[track], bar = sceneBar, b8 = bar % 8;
    PLAY[track]({
      s, t, ts: t + (s % 2 ? SWING : 0), bar, b8, last: b8 === 7, tr, ch: tr.chords[b8],
      sec: tr.sections[Math.floor(bar / 8) % tr.sections.length], mel: b8 * 16 + s, surge: t < surgeUntil,
      urgent, final: mood === 'final',
    });
  }

  function tick() {
    while (nextTime < ac.currentTime + LOOKAHEAD) {
      scheduleStep(step, nextTime);
      step++;
      nextTime += STEP;
    }
  }

  function startMusic() {
    init();
    if (!ac || playing) return;
    playing = true;
    step = 0;
    track = null;
    nextTime = ac.currentTime + 0.05;
    timer = setInterval(tick, 30);
  }

  function setMusic(on) {
    musicOn = on;
    localStorage.setItem('bf-music', on ? '1' : '0');
    if (ac) musicBus.gain.setTargetAtTime(on ? 0.55 : 0, ac.currentTime, 0.1);
  }

  function setSfx(on) {
    sfxOn = on;
    localStorage.setItem('bf-sfx', on ? '1' : '0');
    if (ac) sfxBus.gain.setTargetAtTime(on ? 0.9 : 0, ac.currentTime, 0.05);
  }

  // Sur téléphone, couper le son quand on quitte l'appli.
  function pause(on) {
    if (!ac) return;
    if (on) ac.suspend(); else ac.resume();
  }
  document.addEventListener('visibilitychange', () => pause(document.hidden));

  // Ambiance : 'normal', 'boss' (thème du boss, un peu étouffé) ou 'final' (le même, grand ouvert, avec une voix de plus).
  function setMood(m) {
    mood = m;
    if (!ac) return;
    const f = m === 'boss' ? 1700 : m === 'final' ? 4000 : 2600;
    musicFilter.frequency.setTargetAtTime(f, ac.currentTime, 0.4);
  }

  // Quel boss : choisit son thème (jugement, orage ou pénurie).
  function setBoss(id) { bossName = id || null; }

  // Dernière allumette en main. En soirée normale, l'air serré ; sur un boss, le thème se charge.
  function setUrgent(on) { urgent = !!on; }

  // 'menu', 'jeu' ou 'boutique'. n : numéro de soirée, pour alterner les airs de boutique.
  function setScene(name, n) {
    scene = name;
    if (name === 'boutique' && n != null) shopIx = ((n % SHOPS.length) + SHOPS.length) % SHOPS.length;
  }

  const now = () => ac.currentTime;

  window.Sfx = {
    init, startMusic, setMusic, setSfx, setMood, setBoss, setUrgent, setScene, pause,
    get musicOn() { return musicOn; },
    get sfxOn() { return sfxOn; },
    get track() { return track; },
    // Grosse chaîne : la musique s'ouvre un instant, charleston doublé.
    surge(sec) {
      if (!ac) return;
      surgeUntil = now() + (sec || 4);
      const f = musicFilter.frequency.value;
      musicFilter.frequency.cancelScheduledValues(now());
      musicFilter.frequency.setValueAtTime(f, now());
      musicFilter.frequency.linearRampToValueAtTime(Math.min(6000, f * 2), now() + 0.3);
      musicFilter.frequency.setTargetAtTime(f, now() + (sec || 4), 0.8);
    },
    boom(stepN, size) {
      if (!ac) return;
      const t = now(), pan = (Math.random() - 0.5) * 0.6;
      hiss(sfxBus, t, 0.5, Math.min(0.8, 0.3 + size * 0.05), 'bandpass', 220 + stepN * 90, 0.8, { rev: 0.5, pan });
      tone(sfxBus, 'sine', 90, t, 0.25, 0.35, { slide: 40 });
      hiss(sfxBus, t + 0.02, 0.12, 0.08, 'highpass', 6000, 0.7, { pan: -pan });
    },
    // Une fusée qui éclate au loin, dans le ciel derrière la grille : sourde, puis des crépitements.
    sky(big) {
      if (!ac) return;
      const t = now() + 0.04, pan = (Math.random() - 0.5) * 0.9;
      hiss(sfxBus, t, big ? 0.7 : 0.4, big ? 0.2 : 0.11, 'lowpass', 520, 0.7, { rev: 0.7, pan });
      tone(sfxBus, 'sine', 75, t, 0.3, big ? 0.13 : 0.07, { slide: 38, pan });
      for (let k = 0; k < (big ? 10 : 5); k++) hiss(sfxBus, t + 0.2 + Math.random() * 0.6, 0.02, 0.04, 'highpass', 4000 + Math.random() * 3000, 0.7, { pan: pan + (Math.random() - 0.5) * 0.4 });
    },
    // Un « tink » par feu allumé, qui grimpe la gamme pentatonique : la chaîne devient une mélodie.
    chip(i, delay) {
      if (!ac) return;
      const k = Math.min(i, 19);
      const m = 69 + [0, 2, 4, 7, 9][k % 5] + 12 * Math.floor(k / 5);
      const t = now() + (delay || 0);
      tone(sfxBus, 'triangle', hz(m), t, 0.14, 0.11, { rev: 0.3, pan: ((k % 5) - 2) * 0.15 });
      if (k >= 10) tone(sfxBus, 'sine', hz(m + 12), t, 0.2, 0.04, { rev: 0.4 });
    },
    // Un bonus qui tombe sur le calcul : clochette, plus grave et plus large pour un multiplicateur.
    bonus(i, isMult) {
      if (!ac) return;
      const t = now();
      const m = 76 + [0, 2, 4, 7, 9, 12][Math.min(i, 5)];
      tone(sfxBus, 'square', hz(m), t, 0.22, 0.07, { rev: 0.3 });
      tone(sfxBus, 'sine', hz(m + 12), t, 0.3, 0.06, { rev: 0.4 });
      if (isMult) { tone(sfxBus, 'square', 160, t, 0.25, 0.1, { slide: 480 }); tone(sfxBus, 'sine', 90, t, 0.3, 0.25, { slide: 45 }); }
    },
    // La mèche qui grésille d'un bout à l'autre.
    fuse(len) {
      if (!ac) return;
      const t = now();
      for (let k = 0; k < 9; k++) hiss(sfxBus, t + (k / 9) * len, 0.05, 0.12 + Math.random() * 0.08, 'bandpass', 3000 + Math.random() * 3000, 2, { pan: -0.6 + (k / 9) * 1.2 });
      hiss(sfxBus, t, len, 0.08, 'highpass', 5000);
    },
    // Le total qui explose au bout de la mèche.
    blast(big) {
      if (!ac) return;
      const t = now();
      hiss(sfxBus, t, big ? 1.1 : 0.6, big ? 0.9 : 0.6, 'lowpass', big ? 900 : 1400, 0.7, { rev: 0.6 });
      tone(sfxBus, 'sine', big ? 70 : 110, t, big ? 0.7 : 0.4, 0.6, { slide: 30 });
      if (big) {
        tone(sfxBus, 'sine', 45, t + 0.02, 1, 0.35, { slide: 28 });
        hiss(sfxBus, t + 0.05, 1.6, 0.12, 'highpass', 5000, 0.7, { rev: 0.7 });
      }
    },
    mult() {
      if (!ac) return;
      const t = now();
      tone(sfxBus, 'square', 180, t, 0.25, 0.12, { slide: 520 });
      tone(sfxBus, 'sine', 90, t, 0.3, 0.3, { slide: 45 });
    },
    cash(big) {
      if (!ac) return;
      const t = now();
      hiss(sfxBus, t, 0.35, 0.18, 'highpass', 3000);
      [72, 76, 79, 84].forEach((m, i) => tone(sfxBus, 'square', hz(m + (big ? 5 : 0)), t + i * 0.055, 0.18, 0.07, { rev: 0.35, pan: -0.3 + i * 0.2 }));
    },
    // Le compteur qui défile : un petit tic qui monte avec la valeur.
    tick(k) {
      if (!ac) return;
      tone(sfxBus, 'square', 600 + Math.min(k, 40) * 25, now(), 0.03, 0.025);
    },
    // Un feu qui s'éteint : souffle étouffé qui retombe.
    fizzle() {
      if (!ac) return;
      const t = now();
      hiss(sfxBus, t, 0.45, 0.16, 'lowpass', 700);
      tone(sfxBus, 'triangle', 320, t, 0.3, 0.06, { slide: 120 });
    },
    // Les feux qui retombent dans la grille.
    land(n) {
      if (!ac || now() - lastLand < 0.07) return;
      const t = lastLand = now();
      tone(sfxBus, 'sine', 180, t, 0.08, Math.min(0.12, 0.03 + n * 0.006), { slide: 90 });
      hiss(sfxBus, t, 0.05, 0.04, 'lowpass', 900);
    },
    click() { if (ac) tone(sfxBus, 'square', 880, now(), 0.05, 0.05); },
    card() { if (ac) hiss(sfxBus, now(), 0.07, 0.12, 'bandpass', 2500, 1.5); },
    win() {
      if (!ac) return;
      const t = now();
      [69, 72, 76, 81, 84].forEach((m, i) => tone(sfxBus, 'square', hz(m), t + i * 0.09, 0.3, 0.08, { rev: 0.4, pan: -0.4 + i * 0.2 }));
      tone(sfxBus, 'sine', hz(93), t + 0.45, 1.2, 0.05, { rev: 0.6 });
    },
    lose() {
      if (!ac) return;
      const t = now();
      [64, 60, 57, 52].forEach((m, i) => tone(sfxBus, 'triangle', hz(m), t + i * 0.16, 0.4, 0.18, { rev: 0.4 }));
    },
  };
})();
