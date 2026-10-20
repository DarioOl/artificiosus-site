// Règles partagées entre le navigateur (game.js) et Node (sim.js).
// « mods » = les améliorations du joueur + le boss de la soirée (mods.boss) + les règles de la run (mods.run : le sac).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Rules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const COLS = 6, ROWS = 8;
  const BASE_SHOTS = 4;
  const BASE_DENSITY = 0.45;
  const MIN_FIREWORKS = 10;
  const START_BAG = { petard: 3, fusee: 1 };

  // Les noms et descriptions sont dans i18n.js, rangés par id.
  // pts : points au niveau 1 ; up : points gagnés à chaque niveau acheté en boutique.
  const TYPES = {
    petard:    { color: '#ff4d5e', pts: 10, up: 4 },
    fusee:     { color: '#4db8ff', pts: 8,  up: 4 },
    chandelle: { color: '#5be37d', pts: 8,  up: 4 },
    soleil:    { color: '#ffd23f', pts: 12, up: 5 },
    bombe:     { color: '#c08bff', pts: 15, up: 6 },
    etoile:    { color: '#ff7ad9', pts: 10, up: 4 },
    bengale:   { color: '#ff9a2e', pts: 40, up: 12 },
    // Lance deux étincelles en diagonale vers le haut, qui rebondissent sur les bords.
    ricochet:  { color: '#3fe0d0', pts: 9,  up: 4 },
    // Fait comme le feu qui l'allume (comme un pétard si on le touche soi-même).
    miroir:    { color: '#dfe6f0', pts: 8,  up: 4 },
    // Atteinte par une chaîne, elle couve et n'explose qu'à l'allumette suivante, très fort.
    lente:     { color: '#c98a4b', pts: 18, up: 6 },
    // Explose une première fois, reste dans le ciel, et réexplose si on la rallume.
    double:    { color: '#b6f03a', pts: 6, up: 3 },
    // Allume en croix à 2 cases, par-dessus ses voisins (et par-dessus les trous).
    sauteur:   { color: '#6a5cff', pts: 10, up: 4 },
    // Comme une fusée, mais vers le bas.
    cascade:   { color: '#ffe9b0', pts: 8, up: 4 },
  };
  const DOUBLE_CHARGES = 2;

  let nextId = 1;
  function cell(type) { return { id: nextId++, type: type || null, dy: 0, wet: false, ed: null }; }

  // Feux spéciaux : dorés (+1 € en explosant), géants (comptent pour 2 feux) ou brillants (+15 points).
  // Il n'en tombe que si on a acheté le bonus correspondant : 1 feu neuf sur 8 de cette sorte.
  const EDITIONS = ['dore', 'geant', 'brillant'];
  const EDITION_PERK = { dore: 'orfevre', geant: 'colosse', brillant: 'paillettes' };
  const EDITION_CHANCE = 0.125;
  function rollEdition(mods, rand) {
    const on = EDITIONS.filter(e => mods && mods[EDITION_PERK[e]]);
    if (!on.length) return null;
    const r = rand();
    return r < EDITION_CHANCE * on.length ? on[Math.floor(r / EDITION_CHANCE)] : null;
  }
  function spawn(c, bag, mods, rand) {
    c.type = pickWeighted(bag, rand);
    c.wet = rand() < wetChance(mods);
    c.ed = rollEdition(mods, rand);
    c.charges = 0;
  }

  function pickWeighted(bag, rand) {
    let total = 0;
    for (const k in bag) total += bag[k];
    let r = rand() * total;
    for (const k in bag) { r -= bag[k]; if (r < 0) return k; }
    return Object.keys(bag)[0];
  }

  // ---------- Boss ----------
  // rules : wet (part de feux mouillés), shots (allumettes en plus/moins), grumpy (taille mini d'une chaîne qui compte),
  // half (type qui ne vaut que moitié), fog (on ne voit pas les feux), sparse (ciel plus vide), noMult (les bonus × comptent pour moitié, pas l'élan),
  // waves (la chaîne s'arrête après n vagues), tax (chaque allumette coûte des €), firebreak (les traînées s'arrêtent aux trous).
  const BOSSES = [
    { id: 'pluie', rules: { wet: 0.1 } },
    { id: 'couvrefeu', rules: { shots: -1 } },
    { id: 'voisin', rules: { grumpy: 12 } },
    { id: 'humides', rules: { half: 'petard' } },
    { id: 'brouillard', rules: { fog: true } },
    { id: 'penurie', rules: { sparse: 0.05 } },
    { id: 'critique', rules: { noMult: true } },
    { id: 'courte', rules: { waves: 5 } },
    { id: 'taxe', rules: { tax: 1 } },
    { id: 'coupefeu', rules: { firebreak: true } },
    // Boss finaux : uniquement à la soirée 8.
    { id: 'orage', final: true, rules: { wet: 0.08, shots: -1 } },
    { id: 'jury', final: true, rules: { grumpy: 18 } },
    { id: 'nuitnoire', final: true, rules: { fog: true, sparse: 0.04 } },
  ];
  const NO_RULES = {};
  function bossById(id) { return BOSSES.find(b => b.id === id) || null; }
  function bossRules(mods) { const b = mods && bossById(mods.boss); return b ? b.rules : NO_RULES; }
  const runOf = mods => (mods && mods.run) || NO_RULES;

  // lantern : l'outil Lanterne, allumé pour la soirée.
  function wetChance(mods) { return mods && mods.lantern ? 0 : (bossRules(mods).wet || 0) + (mods && mods.gregeois ? GREGEOIS_WET : 0); }
  function density(mods) { return BASE_DENSITY + (mods.ciel ? 0.12 : 0) - (bossRules(mods).sparse || 0); }
  function foggy(mods) { return !mods.lantern && (!!bossRules(mods).fog || !!runOf(mods).fog); }

  // Toujours le même nombre de feux au départ que celui que gravity() maintient ensuite.
  function newGrid(bag, mods, rand) {
    const g = [];
    for (let y = 0; y < ROWS; y++) {
      const row = [];
      for (let x = 0; x < COLS; x++) row.push(cell(null));
      g.push(row);
    }
    const spots = shuffle(g.flat(), rand).slice(0, Math.max(MIN_FIREWORKS, skyCount(mods)));
    for (const c of spots) spawn(c, bag, mods, rand);
    return g;
  }

  function inside(x, y) { return x >= 0 && y >= 0 && x < COLS && y < ROWS; }

  // Élan : chaque vague après la première ajoute ×elan. Même quand tout le ciel saute,
  // l'endroit où l'on allume compte : une chaîne qui part d'un bout dure plus longtemps.
  const config = { elan: 0.2 };

  // Cases qu'un feu allume directement quand il explose. grid : avec le boss Coupe-feu,
  // les traînées (pétard, fusée, cascade, chandelle, étoile, ricochet) s'arrêtent au premier trou ; soleil, bombe et sauteur passent.
  function targets(type, x, y, mods, grid) {
    const out = [];
    const add = (cx, cy) => { if (inside(cx, cy) && !(cx === x && cy === y)) out.push([cx, cy]); };
    const stop = grid && bossRules(mods).firebreak;
    const hole = (cx, cy) => stop && !grid[cy][cx].type;
    const ray = (dx, dy, max) => {
      for (let d = 1, cx = x + dx, cy = y + dy; d <= max && inside(cx, cy) && !hole(cx, cy); d++, cx += dx, cy += dy) add(cx, cy);
    };
    if (type === 'petard') {
      const r = mods.meche ? 2 : 1;
      ray(1, 0, r); ray(-1, 0, r); ray(0, 1, r); ray(0, -1, r);
      if (mods.croise) for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) add(x + dx, y + dy);
    } else if (type === 'double') {
      add(x + 1, y); add(x - 1, y); add(x, y + 1); add(x, y - 1);
    } else if (type === 'fusee') {
      ray(0, -1, ROWS);
      if (mods.etages) ray(0, 1, ROWS);
      if (mods.boomerang) {
        const nx = x + 1 < COLS ? x + 1 : x - 1;
        for (let cy = 0; cy < ROWS && !hole(nx, cy); cy++) add(nx, cy);
      }
    } else if (type === 'chandelle') {
      ray(1, 0, COLS); ray(-1, 0, COLS);
    } else if (type === 'soleil') {
      const r = mods.eclipse ? 2 : 1;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) add(x + dx, y + dy);
    } else if (type === 'bombe' || type === 'lente') {
      const r = type === 'bombe' && mods.tonnerre ? 3 : 2;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.abs(dx) + Math.abs(dy) <= r) add(x + dx, y + dy);
    } else if (type === 'sauteur') {
      add(x + 2, y); add(x - 2, y); add(x, y + 2); add(x, y - 2);
    } else if (type === 'cascade') {
      ray(0, 1, ROWS);
    } else if (type === 'bengale') {
      if (mods.pluiedor) { add(x + 1, y); add(x - 1, y); add(x, y + 1); add(x, y - 1); }
    } else if (type === 'etoile') {
      for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) ray(dx, dy, COLS);
    } else if (type === 'ricochet') {
      for (const dir of [1, -1]) {
        let cx = x, dx = dir;
        for (let cy = y - 1; cy >= 0; cy--) {
          if (cx + dx < 0 || cx + dx >= COLS) dx = -dx;
          cx += dx;
          if (hole(cx, cy)) break;
          add(cx, cy);
        }
      }
    }
    return out;
  }

  function levelOf(type, mods) { return (mods.levels && mods.levels[type]) || 1; }

  function ptsOf(type, mods) {
    const pts = (TYPES[type].pts + (levelOf(type, mods) - 1) * TYPES[type].up) * (mods.poudre ? POUDRE_PTS : 1);
    return bossRules(mods).half === type ? Math.round(pts / 2) : pts;
  }

  function chargesOf(c) { return c.type === 'double' ? (c.charges || DOUBLE_CHARGES) : 1; }

  // Réaction en chaîne, vague par vague. lastShot : dernière allumette de la soirée ; mods.first : première.
  // also : autres feux allumés en même temps (Briquet), [[x, y], …].
  // Un feu mouillé ne s'allume que si on le touche soi-même. Ne modifie pas la grille : settle() applique la suite.
  function chain(grid, x, y, mods, lastShot, also) {
    const start = grid[y][x];
    if (!start || !start.type) return null;
    const rules = bossRules(mods);
    const hits = new Map();
    const colors = new Set();
    const entry = (c, cx, cy, from) => {
      colors.add(c.type);
      const as = c.type === 'miroir' ? (from ? from.as : 'petard') : c.type;
      const e = { x: cx, y: cy, type: c.type, as, pts: ptsOf(c.type, mods), ed: c.ed || null };
      if (from) { e.fx = from.x; e.fy = from.y; }
      return e;
    };
    const first = [];
    const light = (cx, cy) => {
      const k = cy * COLS + cx;
      if (hits.has(k)) return;
      hits.set(k, 1);
      first.push(entry(grid[cy][cx], cx, cy, null));
    };
    light(x, y);
    first[0].start = true;
    for (const [ax, ay] of also || []) if (grid[ay][ax].type) light(ax, ay);
    // Les mèches lentes qui couvaient partent avec cette allumette.
    for (let cy = 0; cy < ROWS; cy++) for (let cx = 0; cx < COLS; cx++) if (grid[cy][cx].lit && grid[cy][cx].type) light(cx, cy);
    // Feu de joie : la dernière allumette allume aussi tous les feux du même type.
    if (mods.joie && lastShot) {
      for (let cy = 0; cy < ROWS; cy++) for (let cx = 0; cx < COLS; cx++) {
        const c = grid[cy][cx];
        if (c.type === start.type && !c.wet) light(cx, cy);
      }
    }
    const waves = [first];
    const smolder = [];
    const smoldering = new Set();
    for (;;) {
      if (rules.waves && waves.length >= rules.waves) break;
      const next = [];
      const inWave = new Set();
      for (const f of waves[waves.length - 1]) {
        let list = targets(f.as, f.x, f.y, mods, grid);
        if (f.start && mods.coeur) list = list.concat(targets('soleil', f.x, f.y, mods, grid));
        for (const [tx, ty] of list) {
          const k = ty * COLS + tx;
          const c = grid[ty][tx];
          if (!c.type || c.wet || inWave.has(k)) continue;
          if (c.type === 'lente' && !c.lit) {
            if (!smoldering.has(k)) { smoldering.add(k); smolder.push([tx, ty]); }
            continue;
          }
          const h = hits.get(k) || 0;
          if (h >= chargesOf(c)) continue;
          hits.set(k, h + 1);
          inWave.add(k);
          next.push(entry(c, tx, ty, f));
        }
      }
      if (!next.length) break;
      waves.push(next);
    }
    // Ce qui disparaît (gone) et les doubles qui restent avec moins de charges (worn).
    const gone = [], worn = [];
    for (const [k, h] of hits) {
      const cx = k % COLS, cy = (k - cx) / COLS, c = grid[cy][cx];
      if (c.type === 'double' && h < chargesOf(c)) worn.push([cx, cy, chargesOf(c) - h]);
      else gone.push(k);
    }
    let eclats = 0, count = 0;
    const byType = {}, byEd = {};
    for (const w of waves) for (const f of w) {
      eclats += f.pts; count++; byType[f.type] = (byType[f.type] || 0) + 1;
      if (f.ed) byEd[f.ed] = (byEd[f.ed] || 0) + 1;
    }
    const n = t => byType[t] || 0;
    // bonus : dans l'ordre où l'interface les montre, d'abord les points et les feux en plus, puis les multiplicateurs.
    const bonus = [];
    let pts = 0, feux = 0, mult = 1, cash = 0;
    const add = (id, kind, v) => {
      if (!v || (kind === 'mult' && v === 1)) return;
      // Le critique affaiblit les bonus × (moitié) sans toucher à l'élan : une longue chaîne reste la parade.
      // La poudre noire coupe tout, élan compris.
      if (kind === 'mult' && mods.poudre) return;
      if (kind === 'mult' && rules.noMult && id !== 'elan') {
        v = Math.round((1 + (v - 1) / 2) * 10) / 10;
        if (v === 1) return;
      }
      bonus.push({ id, [kind]: v });
      if (kind === 'pts') pts += v;
      else if (kind === 'feux') feux += v;
      else if (kind === 'mult') mult *= v;
      else cash += v;
    };
    const elan = config.elan + (mods.souffle || 0);
    if (elan) add('elan', 'mult', Math.round((1 + elan * (waves.length - 1)) * 10) / 10);
    add('public', 'pts', mods.crowd || 0);
    if (mods.veteran) add('veteran', 'pts', mods.veteran);
    if (mods.follet) { add('follet', 'pts', mods.folletPts || 0); add('follet', 'feux', mods.folletN || 0); }
    if (mods.braise) add('braise', 'feux', mods.braise);
    if (mods.roulement) add('roulement', 'feux', waves.length);
    if (mods.gregeois) add('gregeois', 'feux', count);
    if (mods.boule) add('boule', 'mult', mods.boule);
    add('ed:brillant', 'pts', 15 * (byEd.brillant || 0));
    add('ed:geant', 'feux', byEd.geant || 0);
    add('ed:dore', 'cash', byEd.dore || 0);
    if (mods.eclairante) add('eclairante', 'pts', 8 * n('fusee'));
    if (mods.constellation && count >= 12) add('constellation', 'pts', 50 * n('etoile'));
    if (mods.rafale) add('rafale', 'feux', Math.floor(n('petard') / 2));
    if (mods.nitro) add('nitro', 'feux', 3 * n('bombe'));
    if (mods.collection) add('collection', 'feux', 2 * (mods.kinds || 0));
    if (mods.doree) add('doree', 'cash', n('bengale'));
    if (mods.grand && count >= 15) add('grand', 'mult', 2);
    if (mods.final && lastShot) add('final', 'mult', 3);
    if (mods.arcenciel && colors.size >= 3) add('arcenciel', 'mult', 3);
    if (mods.ligne && n('chandelle') >= 2) add('ligne', 'mult', 2);
    if (mods.solaire && n('soleil')) add('solaire', 'mult', Math.round(Math.pow(1.3, n('soleil')) * 10) / 10);
    if (mods.monochrome && colors.size === 1 && count >= 6) add('monochrome', 'mult', 3);
    if (mods.specialiste && mods.kinds && mods.kinds <= 3) add('specialiste', 'mult', 2);
    if (mods.claque) add('claque', 'mult', claqueMult(mods.crowd));
    if (mods.sacre) add('sacre', 'mult', mods.sacre);
    if (mods.trophee) add('trophee', 'mult', mods.trophee);
    if (mods.crescendo) add('crescendo', 'mult', 1 + CRESCENDO_STEP * (mods.shotNo || 0));
    if (mods.ouverture && mods.first) add('ouverture', 'mult', 2);
    if (mods.pacte) add('pacte', 'mult', PACTE_MULT);
    const total = eclats + pts, feuxTotal = count + feux;
    let score = Math.round(total * feuxTotal * mult);
    const grumpy = !!rules.grumpy && count < rules.grumpy;
    if (grumpy) score = 0;
    return {
      waves, count, base: eclats, eclats: total, feux: feuxTotal, mult, bonus, score, cash, grumpy,
      colors: colors.size, byType, gone, worn, smolder,
    };
  }

  // Après une chaîne : les mèches touchées se mettent à couver, les doubles perdent une charge.
  function settle(grid, res) {
    for (const [x, y] of res.smolder) grid[y][x].lit = true;
    for (const [x, y, left] of res.worn) { grid[y][x].charges = left; grid[y][x].burnt = false; }
    // idle : allumettes depuis lesquelles le feu attend sans avoir explosé.
    for (const row of grid) for (const c of row) if (c.type) c.idle = (c.idle || 0) + 1;
    for (const w of res.waves) for (const f of w) grid[f.y][f.x].idle = 0;
  }

  // Un feu est seul quand son groupe (les feux qu'il allume ou qui l'allument, de proche en proche) compte au plus
  // LONELY_MAX feux : il ne pourra jamais faire une vraie chaîne. Il se met à fumer ; s'il est encore seul
  // à l'allumette suivante, il s'éteint et laisse la place. Une mèche qui couve ne s'éteint pas.
  // Renvoie les clés (y * COLS + x) des feux seuls.
  const LONELY_MAX = +((typeof process !== 'undefined' && process.env && process.env.SOLO) || 2);
  function lonely(grid, mods) {
    const root = [];
    const find = k => { while (root[k] !== k) k = root[k] = root[root[k]]; return k; };
    for (let k = 0; k < ROWS * COLS; k++) root[k] = k;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const c = grid[y][x];
      if (!c.type) continue;
      for (const [tx, ty] of targets(c.type === 'miroir' ? 'petard' : c.type, x, y, mods, grid)) {
        const t = grid[ty][tx];
        if (t.type && !t.wet) root[find(y * COLS + x)] = find(ty * COLS + tx);
      }
    }
    const size = {};
    for (let k = 0; k < ROWS * COLS; k++) if (grid[Math.floor(k / COLS)][k % COLS].type) size[find(k)] = (size[find(k)] || 0) + 1;
    const out = new Set();
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const c = grid[y][x], k = y * COLS + x;
      if (c.type && !c.lit && size[find(k)] <= LONELY_MAX) out.add(k);
    }
    return out;
  }
  // Les feux qui fumaient déjà et sont toujours seuls : à retirer (comme res.gone) avant de viser.
  function burnout(grid, mods) {
    const alone = lonely(grid, mods);
    return [...alone].filter(k => grid[Math.floor(k / COLS)][k % COLS].alone);
  }
  function markAlone(grid, mods) {
    const alone = lonely(grid, mods);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) grid[y][x].alone = alone.has(y * COLS + x);
  }

  // Nombre de feux vers lequel le ciel se recharge après chaque allumette (comme une main de cartes).
  function skyCount(mods) { return Math.round(density(mods) * COLS * ROWS); }

  // Les feux explosés disparaissent, ceux du dessus tombent, de nouveaux arrivent par le haut
  // jusqu'à ce que le ciel retrouve son nombre de feux. Un sur NEAR_FORGOTTEN se pose à côté d'un feu
  // qui attend depuis l'allumette d'avant : sans ça, le bas du ciel se remplit de petits groupes jamais allumés.
  // Renvoie les positions des feux posés au milieu du ciel (pas en haut d'une colonne).
  const NEAR_FORGOTTEN = 0.5;
  const NEXT = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  function nearForgotten(grid) {
    const out = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (grid[y][x].type) continue;
      if (NEXT.some(([dx, dy]) => inside(x + dx, y + dy) && grid[y + dy][x + dx].type && grid[y + dy][x + dx].idle >= 1)) out.push(grid[y][x]);
    }
    return out;
  }
  function gravity(grid, res, bag, mods, rand) {
    const gone = new Set(res.gone);
    const fresh = [];
    for (let x = 0; x < COLS; x++) {
      const kept = [];
      for (let y = ROWS - 1; y >= 0; y--) if (!gone.has(y * COLS + x)) kept.push({ c: grid[y][x], from: y });
      let y = ROWS - 1;
      for (const k of kept) { k.c.dy += y - k.from; grid[y][x] = k.c; y--; }
      const drop = y + 1;
      for (; y >= 0; y--) { const c = cell(null); c.dy = drop; grid[y][x] = c; fresh.push(c); }
    }
    let count = 0;
    const holes = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) grid[y][x].type ? count++ : holes.push(grid[y][x]);
    const need = Math.max(MIN_FIREWORKS, skyCount(mods)) - count;
    const pool = shuffle(fresh, rand).concat(shuffle(holes.filter(c => !fresh.includes(c)), rand));
    const placed = new Set();
    for (let i = 0; i < need && pool.length; i++) {
      let c = pool[0];
      if (rand() < NEAR_FORGOTTEN) {
        const near = nearForgotten(grid);
        if (near.length) c = near[Math.floor(rand() * near.length)];
      }
      pool.splice(pool.indexOf(c), 1);
      spawn(c, bag, mods, rand);
      if (!fresh.includes(c)) placed.add(c);
    }
    const out = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (placed.has(grid[y][x])) out.push({ x, y });
    return out;
  }

  // Change n feux au hasard (pas déjà de ce type) en feux de ce type. Renvoie leurs positions.
  function morph(grid, type, n, rand) {
    const pool = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const c = grid[y][x];
      if (c.type && c.type !== type && !c.lit) pool.push({ x, y });
    }
    const out = [];
    while (out.length < n && pool.length) {
      const p = pool.splice(Math.floor(rand() * pool.length), 1)[0];
      const c = grid[p.y][p.x];
      c.type = type;
      c.wet = false;
      c.charges = 0;
      out.push(p);
    }
    return out;
  }

  // Météore : un feu au hasard devient une bombe.
  function meteor(grid, rand) { return morph(grid, 'bombe', 1, rand)[0] || null; }

  function allShots(grid, mods, lastShot) {
    const all = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const r = chain(grid, x, y, mods, lastShot);
      if (r) all.push({ x, y, r });
    }
    return all.sort((a, b) => b.r.score - a.r.score || b.r.count - a.r.count);
  }

  function bestShot(grid, mods, lastShot) { return allShots(grid, mods, lastShot)[0] || null; }

  // Relevés d'environ 25 % dès la soirée 3 pour compenser le public (points, Claque, Affiches).
  const TARGETS = [3800, 10500, 19500, 42500, 75000, 106000, 194000, 238000];
  const BOSS_ROUNDS = [2, 5, 7];
  const MAX_REFUNDS = 3;
  // Mode infini : chaque soirée au-delà de la 8e demande ENDLESS_GROWTH fois plus que la précédente.
  const ENDLESS_GROWTH = 1.45;

  // Tire les boss d'une run, tous différents : { indexSoirée: idBoss }. La dernière soirée a un boss final.
  function drawBosses(rand) {
    const pool = BOSSES.filter(b => !b.final).map(b => b.id);
    const finals = BOSSES.filter(b => b.final).map(b => b.id);
    const out = {};
    for (const r of BOSS_ROUNDS) {
      if (r === TARGETS.length - 1) out[r] = finals[Math.floor(rand() * finals.length)];
      else out[r] = pool.splice(Math.floor(rand() * pool.length), 1)[0];
    }
    return out;
  }
  // En mode infini, une soirée sur deux est un boss (un boss normal tiré au hasard).
  function endlessBoss(round, rand) {
    if ((round - TARGETS.length) % 2 === 0) return null;
    const pool = BOSSES.filter(b => !b.final);
    return pool[Math.floor(rand() * pool.length)].id;
  }

  // Les bonus les plus fous sont rares à chaque run, même une fois débloqués (comme les légendaires de Balatro) :
  // un légendaire sort 1 fois sur 14 ; un maudit (weight 0) ne se vend jamais, il ne sort que d'une comète ou d'un boss.
  const RARITIES = {
    commun:     { weight: 62, price: 5 },
    rare:       { weight: 31, price: 7 },
    legendaire: { weight: 7, price: 10 },
    maudit:     { weight: 0, price: 6 },
  };
  // Chance qu'une comète (ou la récompense d'un boss) cache un bonus maudit.
  const CURSE_CHANCE = 0.12;
  const PACTE_MULT = 4, POUDRE_PTS = 3, GREGEOIS_WET = 0.125, CRESCENDO_STEP = 0.5, INTEREST_MAX = 5, BAS_DE_LAINE_MAX = 8;
  // Bis ! : une chaîne d'au moins BIS_COUNT feux rend l'allumette, une fois par soirée.
  const BIS_COUNT = 25;

  // ---------- Le public ----------
  // Il retient le plus beau coup de la soirée : une allumette qui fait à elle seule la moitié de l'objectif
  // attire CROWD_HALF spectateurs, l'objectif entier CROWD_FULL (au plus CROWD_FULL par soirée). Boss vaincu : CROWD_BOSS.
  // Chaque spectateur donne +1 point à chaque chaîne. Le compteur (s.crowd) dure toute la run.
  const CROWD_HALF = 5, CROWD_FULL = 10, CROWD_BOSS = 5;
  const CLAQUE_STEP = 5, BILLET_STEP = 5, BILLET_MAX = 4;
  function crowdTier(score, target) { return score >= target ? CROWD_FULL : score >= target / 2 ? CROWD_HALF : 0; }
  // night : spectateurs déjà gagnés par les coups de cette soirée.
  function crowdGain(score, target, night) { return Math.max(0, crowdTier(score, target) - (night || 0)); }
  function claqueMult(crowd) { return Math.round((1 + 0.1 * Math.floor((crowd || 0) / CLAQUE_STEP)) * 10) / 10; }
  function billetPay(crowd) { return Math.min(BILLET_MAX, Math.floor((crowd || 0) / BILLET_STEP)); }
  // Cartes du paquet Affiches, prises tout de suite (sans place). min : public nécessaire ; once : une fois par run.
  const TETE_ADD = 15, BOUCHE_MAX = 25, QUETE_RATE = 2, QUETE_MAX = 20, RAPPEL_COST = 15;
  const AFFICHES = [
    { id: 'tete', min: 0 },
    { id: 'bouche', min: 5 },
    { id: 'quete', min: 10 },
    { id: 'rappel', min: RAPPEL_COST, once: true },
  ];
  const queteMoney = crowd => Math.min(QUETE_MAX, Math.floor((crowd || 0) / QUETE_RATE));
  function afficheOk(s, a) { return (s.crowd || 0) >= a.min && !(a.once && s.posted && s.posted[a.id]); }
  // Le rappel : l'allumette en plus attend la prochaine soirée jouée (comme la Réserve).
  function takeAffiche(s, id) {
    const n = s.crowd || 0;
    if (id === 'tete') s.crowd = n + TETE_ADD;
    else if (id === 'bouche') s.crowd = n + Math.min(BOUCHE_MAX, n);
    else if (id === 'quete') { s.money += queteMoney(n); s.crowd = 0; }
    else if (id === 'rappel') { s.crowd = n - RAPPEL_COST; s.carry = (s.carry || 0) + 1; }
    const a = AFFICHES.find(x => x.id === id);
    if (a && a.once) s.posted = { ...(s.posted || {}), [id]: true };
  }

  // Bonus permanents : chacun change une seule règle, pour toute la run.
  // type : le bonus ne sert qu'avec ce feu, il n'est proposé que si le feu est dans le ciel.
  const PERKS = [
    { id: 'ouverture', rarity: 'commun' },
    { id: 'tirelire', rarity: 'commun' },
    { id: 'pourboire', rarity: 'commun' },
    { id: 'cendres', rarity: 'commun' },
    { id: 'orfevre', rarity: 'commun' },
    // Ceux-là grandissent pendant la run (voir onRoundWon, afterChain, onBurnout).
    { id: 'braise', rarity: 'commun', value: 0 },
    { id: 'veteran', rarity: 'commun', value: 10 },
    { id: 'boule', rarity: 'rare', value: 1 },
    { id: 'souffle', rarity: 'rare', value: 0.05 },
    { id: 'paillettes', rarity: 'commun' },
    { id: 'basdelaine', rarity: 'commun' },
    { id: 'roulement', rarity: 'commun' },
    { id: 'rafale', rarity: 'commun', type: 'petard' },
    { id: 'eclairante', rarity: 'commun', type: 'fusee' },
    { id: 'doree', rarity: 'commun', type: 'bengale' },
    { id: 'pluiedor', rarity: 'commun', type: 'bengale' },
    { id: 'ciel', rarity: 'rare' },
    { id: 'meche', rarity: 'rare', type: 'petard' },
    { id: 'croise', rarity: 'rare', type: 'petard' },
    { id: 'etages', rarity: 'rare', type: 'fusee' },
    { id: 'boomerang', rarity: 'rare', type: 'fusee' },
    { id: 'allumette', rarity: 'rare' },
    { id: 'grand', rarity: 'rare' },
    { id: 'etincelle', rarity: 'rare' },
    { id: 'reflexe', rarity: 'rare' },
    { id: 'reserve', rarity: 'rare' },
    { id: 'econome', rarity: 'rare' },
    { id: 'ligne', rarity: 'rare', type: 'chandelle' },
    { id: 'solaire', rarity: 'rare', type: 'soleil' },
    { id: 'nitro', rarity: 'rare', type: 'bombe' },
    { id: 'constellation', rarity: 'rare', type: 'etoile' },
    { id: 'monochrome', rarity: 'rare' },
    { id: 'collection', rarity: 'rare' },
    { id: 'meteore', rarity: 'rare' },
    { id: 'colosse', rarity: 'rare' },
    { id: 'crescendo', rarity: 'rare' },
    { id: 'tonnerre', rarity: 'rare', type: 'bombe' },
    { id: 'eclipse', rarity: 'rare', type: 'soleil' },
    { id: 'trophee', rarity: 'rare', value: 1 },
    { id: 'claque', rarity: 'rare' },
    { id: 'billetterie', rarity: 'commun' },
    { id: 'final', rarity: 'legendaire' },
    { id: 'arcenciel', rarity: 'legendaire' },
    { id: 'sacre', rarity: 'legendaire', value: 1.5 },
    { id: 'specialiste', rarity: 'legendaire' },
    { id: 'joie', rarity: 'legendaire' },
    { id: 'coeur', rarity: 'legendaire' },
    { id: 'chef', rarity: 'legendaire' },
    { id: 'bis', rarity: 'legendaire' },
    { id: 'follet', rarity: 'legendaire' },
    // Maudits : très forts, avec un vrai défaut.
    { id: 'pacte', rarity: 'maudit' },
    { id: 'gregeois', rarity: 'maudit' },
    { id: 'usurier', rarity: 'maudit' },
    { id: 'poudre', rarity: 'maudit' },
  ];
  for (const p of PERKS) p.apply = s => { s.perks[p.id] = 'value' in p ? p.value : 1; };
  const perkById = id => PERKS.find(p => p.id === id);
  // On garde au plus PERK_SLOTS bonus ; on peut en revendre un pour la moitié de son prix.
  const PERK_SLOTS = 5;
  const perkCount = s => Object.keys(s.owned).length;
  const sellPrice = p => Math.max(1, Math.floor(RARITIES[p.rarity].price / 2));
  function sellPerk(s, id) { delete s.owned[id]; delete s.perks[id]; }

  // Outils : à usage unique, achetés en boutique, utilisés pendant la soirée. picks : cases à toucher.
  // briquet : la prochaine allumette allume 2 feux ; pince : déplace un feu (ou en échange deux) ;
  // renfort : remplit de feux les cases vides autour d'une case ; vent : décale une ligne d'une case vers la droite ;
  // secours : +1 allumette ce soir ; ed : le feu touché et ses voisins de ligne deviennent spéciaux ;
  // eteignoir : retire un feu du ciel ; lanterne : ni brouillard ni feux mouillés jusqu'à la fin de la soirée ;
  // sablier : toutes les mèches lentes du ciel se mettent à couver. type : proposé seulement si ce feu est dans le ciel.
  const TOOLS = [
    { id: 'briquet', price: 4, picks: 2 },
    { id: 'pince', price: 3, picks: 2 },
    { id: 'renfort', price: 3, picks: 1 },
    { id: 'vent', price: 2, picks: 1 },
    { id: 'secours', price: 6, picks: 0 },
    { id: 'dorure', price: 3, picks: 1, ed: 'dore' },
    { id: 'gonfleur', price: 4, picks: 1, ed: 'geant' },
    { id: 'strass', price: 3, picks: 1, ed: 'brillant' },
    { id: 'eteignoir', price: 2, picks: 1 },
    { id: 'lanterne', price: 3, picks: 0 },
    { id: 'sablier', price: 3, picks: 0, type: 'lente' },
  ];
  // Les outils qui peuvent sortir dans cette run (débloqués, et utiles avec ce ciel).
  function toolPool(s) {
    const locked = (s && s.locked) || {};
    return TOOLS.filter(t => !locked[t.id] && (!t.type || (s && s.bag && s.bag[t.type])));
  }
  function randomTool(s, rand) { const pool = toolPool(s); return pool[Math.floor(rand() * pool.length)].id; }
  function snuff(grid, x, y) { return grid[y][x].type ? [y * COLS + x] : []; }
  function dry(grid) { for (const row of grid) for (const c of row) c.wet = false; }
  function hourglass(grid) {
    const out = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (grid[y][x].type === 'lente' && !grid[y][x].lit) { grid[y][x].lit = true; out.push({ x, y }); }
    return out;
  }
  // Cases que touche un outil à feux spéciaux : la case visée et ses deux voisines de ligne.
  function decoArea(x, y) { return [-1, 0, 1].map(dx => ({ x: x + dx, y })).filter(p => inside(p.x, p.y)); }
  function decorate(grid, x, y, ed) {
    const out = decoArea(x, y).filter(p => grid[p.y][p.x].type && grid[p.y][p.x].ed !== ed);
    for (const p of out) grid[p.y][p.x].ed = ed;
    return out;
  }
  const TOOL_SLOTS = 2;
  const toolSlots = s => TOOL_SLOTS + (s && s.perks && s.perks.chef ? 1 : 0);
  const toolById = id => TOOLS.find(t => t.id === id) || null;
  function swapCells(grid, a, b) { const t = grid[a.y][a.x]; grid[a.y][a.x] = grid[b.y][b.x]; grid[b.y][b.x] = t; }
  // Trois par série de soirées, rendus après un boss. Une case, dans un trou à côté : pas en diagonale, pas sur un feu.
  const NUDGES = 3;
  function nudge(grid, a, b) {
    if (!inside(a.x, a.y) || !inside(b.x, b.y)) return false;
    if (!grid[a.y][a.x].type || grid[b.y][b.x].type) return false;
    if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) !== 1) return false;
    swapCells(grid, a, b);
    return true;
  }
  function wind(grid, y) { grid[y].unshift(grid[y].pop()); }
  function reinforce(grid, x, y, bag, mods, rand) {
    const out = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cx = x + dx, cy = y + dy;
      if (!inside(cx, cy) || grid[cy][cx].type) continue;
      spawn(grid[cy][cx], bag, mods, rand);
      grid[cy][cx].wet = false;
      out.push({ x: cx, y: cy });
    }
    return out;
  }

  // Sauter une soirée (jamais un boss) : on passe directement à la suivante, sans sa paie ni sa boutique,
  // contre une récompense tirée en boutique. outil : un outil au hasard (ou de l'argent si les 2 places sont prises).
  const SKIPS = [{ id: 'argent', money: 8 }, { id: 'outil', money: 4 }];
  function canSkip(s, round) { return round > 0 && !(s.bosses && s.bosses[round]); }
  // Réflexe : une chaîne d'au moins REFLEX_KINDS types de feux rend l'allumette, une fois par soirée.
  const REFLEX_KINDS = 3;
  // Réserve : jusqu'à RESERVE_MAX allumettes en rab passent à la soirée suivante (au lieu de rapporter 1 €).
  const RESERVE_MAX = 2;

  // Nouveaux feux : chaque achat en ajoute dans le ciel (on peut racheter le même).
  const FEUX = [
    { id: 'fusee', price: 3, add: 2 },
    { id: 'chandelle', price: 4, add: 2 },
    { id: 'soleil', price: 5, add: 2 },
    { id: 'etoile', price: 5, add: 2 },
    { id: 'bengale', price: 4, add: 1 },
    { id: 'bombe', price: 7, add: 1 },
    { id: 'ricochet', price: 4, add: 2 },
    { id: 'miroir', price: 5, add: 2 },
    { id: 'lente', price: 5, add: 2 },
    { id: 'double', price: 4, add: 2 },
    { id: 'sauteur', price: 4, add: 2 },
    { id: 'cascade', price: 3, add: 2 },
  ];
  // Un nouveau type de feu arrive au niveau moyen du ciel (arrondi en dessous) : sinon chaque nouveau type
  // dilue les sels déjà achetés et un ciel varié rapporte bien moins qu'un ciel de spécialiste.
  function arrivalLevel(s, type) {
    const own = levelOf(type, s);
    if (s.bag[type]) return own;
    const lv = Object.keys(s.bag).map(t => levelOf(t, s));
    return lv.length ? Math.max(own, Math.floor(lv.reduce((a, b) => a + b, 0) / lv.length)) : own;
  }
  function buyFeu(s, f) {
    const lv = arrivalLevel(s, f.id);
    if (lv > 1) s.levels[f.id] = lv;
    s.bag[f.id] = (s.bag[f.id] || 0) + f.add;
  }

  // Puissance : +1 niveau pour un type de feu (cartes du ciel).
  function buyLevel(s, type) { s.levels[type] = levelOf(type, s) + 1; }

  // Retrait : un type de feu ne tombe plus du tout. Il en reste toujours au moins 2.
  function canRemove(s) { return Object.keys(s.bag).length > 2; }
  function removeType(s, type) { delete s.bag[type]; }

  const START_MONEY = 4;
  const REROLL_PRICE = 2;
  function rerollPrice(s, rerolls) { return s.perks && s.perks.econome && rerolls === 0 ? 0 : REROLL_PRICE + rerolls; }

  // ---------- Sacs de départ ----------
  // Un sac : feux de départ et petite règle pour toute la run. shots : allumettes en plus, target : × objectifs,
  // pay : € en plus/moins par soirée réussie, money : argent de départ, perks : bonus offerts,
  // fog : brouillard toute la run, slots : places de bonus en plus, legend : un bonus légendaire offert, au choix (heirChoices).
  const SACS = [
    { id: 'classique', bag: { petard: 3, fusee: 1 } },
    { id: 'petardier', bag: { petard: 5 }, perks: ['rafale'], target: 1.35 },
    { id: 'prudent', bag: { petard: 3, fusee: 1 }, shots: 1, target: 1.15 },
    { id: 'mecene', bag: { petard: 3, fusee: 1 }, money: 13, pay: -2 },
    // Pas de malus : ses feux de départ ne valent guère plus que ceux du classique.
    { id: 'bariole', bag: { petard: 2, fusee: 1, chandelle: 1, soleil: 1 } },
    { id: 'chimiste', bag: { double: 2, miroir: 1, petard: 1 }, target: 1.2 },
    { id: 'noctambule', bag: { petard: 3, fusee: 1 }, fog: true, slots: 1 },
    { id: 'heritier', bag: { petard: 3, fusee: 1 }, legend: true, target: 1.35 },
  ];
  const sacById = id => SACS.find(s => s.id === id) || null;
  // Les règles d'une run, tirées de son sac.
  function runMod(sacId) {
    const sac = sacById(sacId) || SACS[0];
    return {
      sac: sac.id, bag: { ...sac.bag }, perks: (sac.perks || []).slice(), money: sac.money !== undefined ? sac.money : START_MONEY,
      shots: sac.shots || 0, target: sac.target || 1, pay: sac.pay || 0, fog: !!sac.fog, slots: sac.slots || 0, legend: !!sac.legend,
    };
  }

  // Une run neuve. Les champs de la partie en cours (grille, score…) sont gérés par l'appelant.
  function newRun(mod, calibre, locked, rand) {
    const s = { bag: { ...mod.bag }, perks: {}, owned: {}, levels: {}, money: mod.money, mod, calibre: calibre || 1, carry: 0, tools: [], slots: mod.slots || 0, crowd: 0, posted: {}, nudges: NUDGES, locked };
    for (const id of mod.perks || []) { s.owned[id] = 1; perkById(id).apply(s); }
    return s;
  }
  // Sac de l'héritier : le joueur choisit son légendaire parmi HEIR_CHOICES, avant la première soirée.
  // Tiré au hasard, un légendaire faible (place d'outil, feu follet) rendait la run presque perdue d'avance.
  const HEIR_CHOICES = 3;
  function heirChoices(s, rand) {
    const locked = s.locked || {};
    const pool = PERKS.filter(p => p.rarity === 'legendaire' && !locked[p.id] && (!p.type || s.bag[p.type]));
    return shuffle(pool, rand).slice(0, HEIR_CHOICES).map(p => ({ kind: 'perks', id: p.id }));
  }

  // Calibres : la difficulté qu'on débloque en gagnant une run. Chaque calibre garde les règles des précédents.
  const CALIBRES = 5;
  function calib(c) {
    c = c || 1;
    return { target: c >= 5 ? 1.4 : c >= 4 ? 1.2 : c >= 2 ? 1.1 : 1, pay: c >= 3 ? 3 : 4, extra: 0 };
  }
  function baseTarget(round) {
    const last = TARGETS.length - 1;
    return round <= last ? TARGETS[round] : TARGETS[last] * Math.pow(ENDLESS_GROWTH, round - last);
  }
  // mod : règles de la run (sac), facultatif.
  function targetFor(round, c, mod) {
    const v = baseTarget(round) * calib(c).target * ((mod && mod.target) || 1);
    const step = v >= 200000 ? 5000 : 500;
    return Math.round(v / step) * step;
  }
  function priceOf(base, s) { return Math.max(1, base + calib(s.calibre).extra); }

  // Allumettes en rab gardées pour la soirée suivante (bonus Réserve).
  function carryOf(s, shotsLeft) { return s.perks.reserve ? Math.min(RESERVE_MAX, shotsLeft) : 0; }

  // Ce que rapporte une soirée réussie : [[id, €, n], …]. À appeler avant de verser l'argent.
  // ratio : score / objectif. Chaque objectif entier de plus que le premier rapporte EXCESS_PAY €.
  const EXCESS_PAY = 2, EXCESS_MAX = 3;
  // Intérêts : 1 € par tranche de 5 €, plafonnés (Bas de laine monte le plafond, l'Usurier l'enlève).
  const interestMax = s => (s.perks.usurier ? Infinity : s.perks.basdelaine ? BAS_DE_LAINE_MAX : INTEREST_MAX);
  function income(s, round, shotsLeft, ratio) {
    const mod = s.mod || NO_RULES;
    const lines = s.perks.usurier ? [] : [['round', Math.max(1, calib(s.calibre).pay + (mod.pay || 0))]];
    const boss = s.bosses ? !!s.bosses[round] : BOSS_ROUNDS.includes(round);
    if (boss) lines.push(['boss', 3]);
    const extra = Math.min(EXCESS_MAX, Math.floor(ratio || 0) - 1);
    if (extra > 0) lines.push(['excess', extra * EXCESS_PAY, extra + 1]);
    const paid = shotsLeft - carryOf(s, shotsLeft);
    if (paid > 0) lines.push(['shots', paid, paid]);
    const interest = Math.min(interestMax(s), Math.floor(s.money / 5));
    if (interest > 0) lines.push(['interest', interest]);
    if (s.perks.tirelire) lines.push(['tirelire', 2]);
    if (s.perks.billetterie && billetPay(s.crowd)) lines.push(['billetterie', billetPay(s.crowd)]);
    return lines;
  }

  function shuffle(list, rand) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // ---------- Boutique façon Balatro : un étal de cartes, et des paquets qu'on ouvre ----------
  // Une carte (à l'étal ou dans un paquet) : { kind, id?, add?, value? }. kind :
  // perks (bonus permanent), astres (sel de couleur : +1 niveau au feu id), tools, feux (add feux id dans le ciel),
  // retrait (un type de feu en moins), levels (mélange arc-en-ciel : +1 niveau à tous les feux), supernova (double dose : +2 niveaux au feu id),
  // slot (+1 place de bonus), toolbox (remplit les outils), money (+value €).
  const STALL_SIZE = 2;
  const STALL_KINDS = { perks: 5, astres: 3, tools: 2 };
  const ASTRE_PRICE = 3;
  // caisse : feux ; astres : coffret de sels de couleur ; artificier : bonus permanents ; atelier : outils ; comete : trouvailles rares.
  const PACKS = [
    { id: 'caisse', weight: 4, price: 4 },
    { id: 'astres', weight: 4, price: 4 },
    { id: 'artificier', weight: 4, price: 5 },
    { id: 'atelier', weight: 3, price: 3 },
    { id: 'comete', weight: 1, price: 6 },
    { id: 'affiches', weight: 3, price: 3 },
  ];
  // Paquets qui n'existent qu'en taille normale (trop peu de cartes possibles).
  const SMALL_PACKS = ['affiches'];
  // show : cartes dans le paquet ; keep : combien on en garde ; extra : € en plus du prix du paquet.
  const PACK_SIZES = {
    normal: { show: 3, keep: 1, weight: 6, extra: 0 },
    grand: { show: 5, keep: 1, weight: 3, extra: 2 },
    mega: { show: 5, keep: 2, weight: 1, extra: 4 },
  };
  const packById = id => PACKS.find(p => p.id === id) || null;
  const packPrice = pk => packById(pk.id).price + PACK_SIZES[pk.size].extra;
  const weightsOf = (list, skip) => { const w = {}; for (const p of list) if (p.id !== skip) w[p.id] = p.weight; return w; };
  // avoid : colis encore en vente, qu'on ne veut pas ressortir tels quels (même type et même taille).
  function drawPack(rand, skip, avoid) {
    const sizes = {};
    for (const k in PACK_SIZES) sizes[k] = PACK_SIZES[k].weight;
    let last = null;
    for (let n = 0; n < 12; n++) {
      const id = pickWeighted(weightsOf(PACKS, skip), rand);
      const size = SMALL_PACKS.includes(id) ? 'normal' : pickWeighted(sizes, rand);
      last = { id, size };
      if (!avoid || !avoid.some(a => a.id === id && a.size === size)) return last;
    }
    return last;
  }
  function cardPrice(c) {
    if (c.kind === 'perks') return RARITIES[perkById(c.id).rarity].price;
    if (c.kind === 'tools') return toolById(c.id).price;
    return ASTRE_PRICE;
  }

  function stallOnce(s, rand) {
    const perks = offers(s, rand, STALL_SIZE);
    const types = shuffle(Object.keys(s.bag), rand);
    const tools = shuffle(toolPool(s), rand);
    const out = [];
    let spins = 0;
    while (out.length < STALL_SIZE && spins++ < 40) {
      const k = pickWeighted(STALL_KINDS, rand);
      if (k === 'perks' && perks.length) out.push({ kind: 'perks', id: perks.shift().id });
      else if (k === 'astres' && types.length) out.push({ kind: 'astres', id: types.shift() });
      else if (tools.length) out.push({ kind: 'tools', id: tools.shift().id });
      else if (!perks.length && !types.length && !tools.length) break;
    }
    return out;
  }

  // L'étal : quelques cartes achetées telles quelles.
  // avoid : trouvailles encore en vente. On en tire d'autres tant que le sac le permet.
  function stall(s, rand, avoid) {
    const banned = avoid || [];
    if (!banned.length) return stallOnce(s, rand);
    const hits = out => out.filter(c => banned.some(b => b.kind === c.kind && b.id === c.id)).length;
    let best = null, bestHits = Infinity;
    for (let n = 0; n < 40; n++) {
      const out = stallOnce(s, rand);
      const h = hits(out);
      if (h < bestHits) { best = out; bestHits = h; }
      if (h === 0) return out;
    }
    return best;
  }

  // Deux colis de types différents. avoid : ceux encore en vente, à ne pas recopier.
  function twoPacks(rand, avoid) {
    let a = drawPack(rand, null, avoid);
    let b = drawPack(rand, a.id, avoid);
    for (let n = 0; n < 8 && avoid && avoid.some(p => (p.id === a.id && p.size === a.size) || (p.id === b.id && p.size === b.size)); n++) {
      a = drawPack(rand, null, avoid);
      b = drawPack(rand, a.id, avoid);
    }
    return [a, b];
  }

  // Une boutique : l'étal, deux paquets différents, et la récompense pour sauter la soirée.
  function shop(s, rand) {
    return { cards: stall(s, rand), packs: twoPacks(rand), skip: SKIPS[Math.floor(rand() * SKIPS.length)] };
  }

  // Relance : on reremplie l'étal et les colis (les places achetées reviennent),
  // et ce qui était encore là change de trouvaille, de type de colis ou de taille.
  // La récompense pour sauter la soirée reste.
  function rerollShop(s, shop, rand) {
    return { cards: stall(s, rand, shop.cards), packs: twoPacks(rand, shop.packs), skip: shop.skip };
  }

  // Les bonus qui peuvent encore sortir dans cette run.
  function perkPool(s) {
    const locked = s.locked || {};
    return PERKS.filter(p => !s.owned[p.id] && !locked[p.id] && (!p.type || s.bag[p.type]));
  }
  function offers(s, rand, n) {
    const pool = perkPool(s).filter(p => RARITIES[p.rarity].weight > 0);
    const out = [];
    while (out.length < (n || 3) && pool.length) {
      const avail = Object.keys(RARITIES).filter(r => pool.some(p => p.rarity === r));
      let total = 0;
      for (const r of avail) total += RARITIES[r].weight;
      let roll = rand() * total, rarity = avail[0];
      for (const r of avail) { roll -= RARITIES[r].weight; if (roll < 0) { rarity = r; break; } }
      const same = pool.filter(p => p.rarity === rarity);
      const pick = same[Math.floor(rand() * same.length)];
      pool.splice(pool.indexOf(pick), 1);
      out.push(pick);
    }
    return out;
  }

  // ---------- Ouvrir un paquet : on voit ses cartes, on en garde une (deux dans un méga) ----------
  const slotsOf = s => PERK_SLOTS + (s.slots || 0);
  const perkRoom = s => perkCount(s) < slotsOf(s);
  const toolRoom = s => (s.tools || []).length < toolSlots(s);
  // Ce que peut montrer le paquet Affiches : les bonus du public et les cartes dont le public permet l'achat.
  function afficheCards(s) {
    const locked = s.locked || {};
    const perks = perkRoom(s) ? ['claque', 'billetterie'].filter(id => !s.owned[id] && !locked[id]).map(id => ({ kind: 'perks', id })) : [];
    return perks.concat(AFFICHES.filter(a => afficheOk(s, a)).map(a => ({ kind: 'affiche', id: a.id })));
  }
  function packOk(s, pk) {
    if (pk.id === 'affiches') return afficheCards(s).length >= PACK_SIZES[pk.size].show;
    return pk.id === 'artificier' ? perkRoom(s) : pk.id === 'atelier' ? toolRoom(s) : true;
  }
  // Une carte qu'on ne peut pas prendre maintenant (plus de place, plus rien à retirer).
  function choiceOk(s, ch) {
    if (ch.kind === 'affiche') return afficheOk(s, AFFICHES.find(a => a.id === ch.id));
    if (ch.kind === 'perks') return perkRoom(s);
    if (ch.kind === 'tools' || ch.kind === 'toolbox') return toolRoom(s);
    if (ch.kind === 'retrait') return canRemove(s);
    return true;
  }
  // Le type de feu le plus présent dans le ciel (pour la double dose).
  const topType = s => Object.keys(s.bag).sort((a, b) => s.bag[b] - s.bag[a])[0];
  function openPack(s, pk, rand) {
    const n = PACK_SIZES[pk.size].show, locked = s.locked || {};
    if (pk.id === 'caisse') {
      const feux = shuffle(FEUX.filter(f => !locked[f.id]), rand);
      const out = feux.slice(0, n).map(f => ({ kind: 'feux', id: f.id, add: f.add }));
      // Peu de feux débloqués : on complète avec des lots doubles.
      for (let i = 0; out.length < n && i < feux.length; i++) out.push({ kind: 'feux', id: feux[i].id, add: feux[i].add * 2 });
      if (canRemove(s) && rand() < 0.4) out[out.length - 1] = { kind: 'retrait' };
      return shuffle(out, rand);
    }
    if (pk.id === 'astres') {
      // D'abord les feux de ton ciel, toujours avec le plus présent, puis les autres ; parfois le mélange arc-en-ciel (+1 niveau à tout).
      const others = Object.keys(TYPES).filter(t => !s.bag[t] && !locked[t]);
      const out = shuffle(Object.keys(s.bag), rand).concat(shuffle(others, rand)).slice(0, n).map(id => ({ kind: 'astres', id }));
      const top = topType(s);
      if (top && !out.some(c => c.id === top)) out[0] = { kind: 'astres', id: top };
      if (out.length < n || rand() < 0.2) out[Math.min(out.length, n - 1)] = { kind: 'levels' };
      return shuffle(out, rand);
    }
    if (pk.id === 'atelier') return shuffle(toolPool(s), rand).slice(0, n).map(t => ({ kind: 'tools', id: t.id }));
    if (pk.id === 'artificier') return offers(s, rand, n).map(p => ({ kind: 'perks', id: p.id }));
    if (pk.id === 'affiches') return shuffle(afficheCards(s), rand).slice(0, n);
    return cometCards(s, rand, n);
  }
  // Cartes rares de la comète, et récompense d'un boss vaincu : seulement celles qui servent à quelque chose.
  // Parfois (CURSE_CHANCE), une des cartes est un bonus maudit.
  function cometCards(s, rand, n) {
    const pool = perkPool(s);
    const legends = pool.filter(p => p.rarity === 'legendaire');
    const curses = pool.filter(p => p.rarity === 'maudit');
    const all = [
      perkRoom(s) && legends.length && { kind: 'perks', id: legends[Math.floor(rand() * legends.length)].id },
      { kind: 'slot' },
      toolRoom(s) && { kind: 'toolbox' },
      { kind: 'money', value: 10 },
      { kind: 'levels' },
      { kind: 'supernova', id: topType(s) },
    ].filter(Boolean);
    const out = shuffle(all, rand).slice(0, n);
    if (curses.length && perkRoom(s) && rand() < CURSE_CHANCE) out[Math.floor(rand() * out.length)] = { kind: 'perks', id: curses[Math.floor(rand() * curses.length)].id };
    return out;
  }
  const bossRewards = (s, rand) => cometCards(s, rand, 3);
  // Retrait : ch.type est le feu choisi par le joueur.
  function takeChoice(s, ch, rand) {
    if (ch.kind === 'feux') buyFeu(s, ch);
    else if (ch.kind === 'tools') { if (toolRoom(s)) s.tools.push(ch.id); }
    else if (ch.kind === 'perks') { s.owned[ch.id] = 1; perkById(ch.id).apply(s); }
    else if (ch.kind === 'astres') buyLevel(s, ch.id);
    else if (ch.kind === 'supernova') { buyLevel(s, ch.id); buyLevel(s, ch.id); }
    else if (ch.kind === 'retrait') removeType(s, ch.type);
    else if (ch.kind === 'slot') s.slots = (s.slots || 0) + 1;
    else if (ch.kind === 'money') s.money += ch.value;
    else if (ch.kind === 'levels') for (const type of Object.keys(s.bag)) buyLevel(s, type);
    else if (ch.kind === 'toolbox') while (toolRoom(s)) s.tools.push(randomTool(s, rand));
    else if (ch.kind === 'affiche') takeAffiche(s, ch.id);
  }

  // À appeler après chaque soirée réussie.
  // Bonus qui grandissent : leur valeur courante est dans s.perks[id].
  // boss : la soirée était un boss (pour le Trophée).
  function onRoundWon(s, boss) {
    if (s.perks.sacre) s.perks.sacre += 0.5;
    if (s.perks.veteran) s.perks.veteran += 10;
    if (s.perks.trophee && boss) s.perks.trophee += 0.5;
    if (boss) { s.crowd = (s.crowd || 0) + CROWD_BOSS; if (s.help) s.nudges = NUDGES; }
  }
  // Renvoie les ids des bonus qui viennent de grandir.
  function afterChain(s, r) {
    const up = [];
    if (s.perks.boule && r.count >= 15) { s.perks.boule = Math.round((s.perks.boule + 0.1) * 10) / 10; up.push('boule'); }
    if (s.perks.souffle && r.waves.length >= 8) { s.perks.souffle = Math.round((s.perks.souffle + 0.05) * 100) / 100; up.push('souffle'); }
    return up;
  }
  function onBurnout(s, n) { if ('braise' in s.perks) s.perks.braise += n; }

  function shotsFor(mods) {
    return Math.max(1, BASE_SHOTS + (mods.allumette ? 1 : 0) - (mods.pacte ? 1 : 0) + (bossRules(mods).shots || 0) + (runOf(mods).shots || 0));
  }

  return {
    COLS, ROWS, BASE_SHOTS, START_BAG, TYPES, TARGETS, BOSS_ROUNDS, BOSSES, RARITIES, MAX_REFUNDS, PERKS,
    FEUX, START_MONEY, REROLL_PRICE, CALIBRES, SACS, REFLEX_KINDS, RESERVE_MAX, DOUBLE_CHARGES,
    config, afterChain, onBurnout, PACKS, PACK_SIZES, STALL_SIZE, packById, packPrice, cardPrice, stall, drawPack, slotsOf, packOk, choiceOk, openPack,
    cometCards, bossRewards, takeChoice, EDITIONS, EDITION_PERK, PERK_SLOTS, TOOLS, TOOL_SLOTS, SKIPS, perkCount, sellPrice, sellPerk, toolById,
    swapCells, nudge, NUDGES, wind, reinforce, decoArea, decorate, canSkip, toolSlots, toolPool, randomTool, toolRoom, snuff, dry, hourglass,
    BIS_COUNT, CURSE_CHANCE, interestMax,
    CROWD_HALF, CROWD_FULL, CROWD_BOSS, AFFICHES, TETE_ADD, BOUCHE_MAX, RAPPEL_COST, crowdTier, crowdGain, claqueMult, billetPay, queteMoney, afficheOk,
    cell, newGrid, targets, ptsOf, levelOf, chain, settle, gravity, burnout, markAlone, lonely, meteor, morph, allShots, bestShot, pickWeighted, offers,
    shop, rerollShop, buyFeu, arrivalLevel, buyLevel, canRemove, removeType, income, drawBosses, endlessBoss, bossById, bossRules, foggy,
    wetChance, onRoundWon, shotsFor, calib, targetFor, priceOf, rerollPrice, carryOf, runMod, newRun, sacById, perkById,
    chargesOf, HEIR_CHOICES, heirChoices,
  };
});
