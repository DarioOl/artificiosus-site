// Progression d'une run à l'autre : déblocages, calibres, sacs, statistiques.
// Tout reste dans le téléphone (localStorage).
(function () {
  const KEY = 'bf-meta';
  const R = window.Rules;

  // Verrouillé au début. test(e) reçoit un événement de partie :
  // { type: 'chain', r } après chaque allumette ;
  // { type: 'night', round, shots, used, kinds, money, boss, levels, scores, big, fizzled, streak } après une soirée réussie
  //   (scores : points de chaque allumette ; big : chaînes de 25 feux ou plus ; fizzled : feux éteints ce soir ;
  //   streak : soirées de suite avec les intérêts au plafond) ;
  // { type: 'run', win, round, calibre, sac, runs } à la fin d'une run ; { type: 'reroll', rerolls } dans la boutique ;
  // { type: 'tool' } quand on utilise un outil.
  // tier : palier (voir TIERS) ; cal : le défi ne compte qu'à partir de ce calibre.
  const nb = (e, t) => e.r.byType[t] || 0;
  const night = e => e.type === 'night';
  const chain = e => e.type === 'chain';
  const won = e => e.type === 'run' && e.win;
  const S = () => data.stats;
  const bossesBeaten = () => Object.values(S().bosses || {}).reduce((m, n) => m + n, 0);
  const rising = a => a.length >= 4 && a.every((v, i) => i === 0 || v > a[i - 1]);
  const UNLOCKS = [
    // Palier 1 : premières mèches.
    { id: 'bombe', kind: 'feu', tier: 1, test: e => night(e) && bossesBeaten() >= 3 },
    { id: 'bengale', kind: 'feu', tier: 1, test: e => night(e) && e.round >= 4 && e.shots >= 2 },
    { id: 'double', kind: 'feu', tier: 1, test: e => night(e) && e.money >= 30 },
    { id: 'ricochet', kind: 'feu', tier: 1, test: e => chain(e) && e.r.waves.length >= 10 },
    { id: 'etoile', kind: 'feu', tier: 1, test: e => chain(e) && e.r.count >= 25 },
    { id: 'cascade', kind: 'feu', tier: 1, test: e => chain(e) && nb(e, 'fusee') >= 8 },
    { id: 'petardier', kind: 'sac', tier: 1, test: e => chain(e) && nb(e, 'petard') >= 15 },
    { id: 'prudent', kind: 'sac', tier: 1, test: e => e.type === 'run' && !e.win && e.round === R.TARGETS.length - 1 },
    { id: 'econome', kind: 'perk', tier: 1, test: e => e.type === 'reroll' && e.rerolls >= 6 },
    { id: 'basdelaine', kind: 'perk', tier: 1, test: e => night(e) && e.streak >= 3 },
    { id: 'eteignoir', kind: 'tool', tier: 1, test: e => night(e) && (S().fizzled || 0) >= 30 },
    { id: 'lanterne', kind: 'tool', tier: 1, test: e => night(e) && e.boss === 'brouillard' },
    // Palier 2 : le bouquet.
    { id: 'lente', kind: 'feu', tier: 2, test: e => night(e) && !!e.boss && e.used === 1 },
    { id: 'miroir', kind: 'feu', tier: 2, test: e => chain(e) && e.r.colors >= 5 },
    { id: 'sauteur', kind: 'feu', tier: 2, test: e => night(e) && e.boss === 'coupefeu' },
    { id: 'monochrome', kind: 'perk', tier: 2, test: e => chain(e) && e.r.colors === 1 && e.r.count >= 14 },
    { id: 'solaire', kind: 'perk', tier: 2, test: e => chain(e) && nb(e, 'soleil') >= 6 },
    { id: 'nitro', kind: 'perk', tier: 2, test: e => chain(e) && nb(e, 'bombe') >= 5 },
    { id: 'boomerang', kind: 'perk', tier: 2, test: e => chain(e) && nb(e, 'fusee') >= 10 },
    { id: 'reserve', kind: 'perk', tier: 2, test: e => night(e) && !!e.boss && e.shots >= 3 },
    { id: 'roulement', kind: 'perk', tier: 2, test: e => chain(e) && e.r.waves.length >= 12 },
    { id: 'pluiedor', kind: 'perk', tier: 2, test: e => chain(e) && nb(e, 'bengale') >= 4 },
    { id: 'bariole', kind: 'sac', tier: 2, test: e => night(e) && e.kinds >= 6 },
    { id: 'mecene', kind: 'sac', tier: 2, test: e => night(e) && e.money >= 50 },
    { id: 'sablier', kind: 'tool', tier: 2, test: e => chain(e) && nb(e, 'lente') >= 2 },
    // Palier 3 : le grand final.
    { id: 'final', kind: 'perk', tier: 3, cal: 2, test: e => chain(e) && e.r.score >= 100000 },
    { id: 'reflexe', kind: 'perk', tier: 3, test: e => chain(e) && e.r.count >= 30 },
    { id: 'arcenciel', kind: 'perk', tier: 3, cal: 2, test: e => chain(e) && e.r.colors >= 5 && e.r.count >= 20 },
    { id: 'meteore', kind: 'perk', tier: 3, test: e => night(e) && e.round >= 6 },
    { id: 'specialiste', kind: 'perk', tier: 3, test: e => night(e) && e.round >= 5 && e.kinds <= 2 },
    { id: 'crescendo', kind: 'perk', tier: 3, test: e => night(e) && rising(e.scores || []) },
    { id: 'tonnerre', kind: 'perk', tier: 3, test: e => night(e) && ((e.levels || {}).bombe || 1) >= 5 },
    { id: 'eclipse', kind: 'perk', tier: 3, test: e => night(e) && ((e.levels || {}).soleil || 1) >= 5 },
    { id: 'trophee', kind: 'perk', tier: 3, test: e => night(e) && bossesBeaten() >= 10 },
    { id: 'chef', kind: 'perk', tier: 3, test: e => (e.type === 'tool' || night(e)) && (S().tools || 0) >= 20 },
    { id: 'sacre', kind: 'perk', tier: 3, test: e => won(e) && S().wins >= 2 },
    { id: 'croise', kind: 'perk', tier: 3, test: e => won(e) && e.sac === 'petardier' },
    { id: 'joie', kind: 'perk', tier: 3, test: e => won(e) && e.calibre >= 2 },
    { id: 'chimiste', kind: 'sac', tier: 3, test: e => won(e) && e.calibre >= 3 },
    { id: 'noctambule', kind: 'sac', tier: 3, test: e => night(e) && e.boss === 'nuitnoire' },
    // Palier 4 : la légende. Les contenus les plus fous.
    { id: 'coeur', kind: 'perk', tier: 4, cal: 3, test: e => night(e) && e.round >= 9 },
    { id: 'bis', kind: 'perk', tier: 4, cal: 3, test: e => night(e) && e.big >= 2 },
    { id: 'follet', kind: 'perk', tier: 4, test: e => night(e) && e.fizzled >= 10 },
    { id: 'heritier', kind: 'sac', tier: 4, test: e => won(e) && e.calibre >= 4 },
    { id: 'pacte', kind: 'perk', tier: 4, test: e => won(e) && e.calibre >= 5 },
    { id: 'gregeois', kind: 'perk', tier: 4, test: e => night(e) && e.boss === 'orage' },
    { id: 'usurier', kind: 'perk', tier: 4, test: e => night(e) && e.money >= 100 },
    { id: 'poudre', kind: 'perk', tier: 4, test: e => night(e) && e.boss === 'critique' && e.used === 1 },
  ];
  // Un palier s'ouvre quand on a débloqué assez de contenus (comme les paquets de Balatro qui s'ouvrent à la collection).
  const TIERS = [0, 8, 18, 30];

  const STATS0 = {
    runs: 0, wins: 0, nights: 0, shots: 0, feux: 0, bestChain: 0, bestShot: 0, bestNight: 0, bestEndless: 0, perks: {}, sacs: {}, winsCal: {},
    buys: 0, packs: 0, megas: 0, tools: 0, sold: 0, retraits: 0, skips: 0, bosses: {},
    bestMoney: 0, bestNightScore: 0, bestLevel: 1, bestPerks: 0, bestGold: 0, bestRerolls: 0, bestOneShots: 0,
  };
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  // queue : défis réussis qui attendent la run suivante (un seul déblocage par run) ; run : { cal, got } de la run en cours.
  const data = Object.assign({ unlocked: {}, calibre: 1, picked: 1, seen: 0, sac: 'classique', wins: {}, shopSeen: {}, succes: {}, succesSeen: 0, queue: [], run: null }, load());
  data.stats = Object.assign({}, STATS0, data.stats);
  const save = () => localStorage.setItem(KEY, JSON.stringify(data));
  const pad = n => String(n).padStart(2, '0');
  const isOpen = id => !UNLOCKS.some(u => u.id === id) || !!data.unlocked[id];
  const calOf = sac => Math.min(R.CALIBRES, (data.wins[sac] || 0) + 1);
  const unlockedCount = () => UNLOCKS.filter(u => data.unlocked[u.id]).length;
  const tierOpen = t => unlockedCount() >= TIERS[t - 1];
  function grantUnlock(u) {
    data.unlocked[u.id] = true;
    data.run = Object.assign({ cal: 1 }, data.run, { got: true });
  }
  const total = () => UNLOCKS.length + R.CALIBRES - 1;
  const done = () => UNLOCKS.filter(u => data.unlocked[u.id]).length + data.calibre - 1;

  // Succès : des trophées, sans récompense. tier : 1 facile … 4 très difficile, 5 secret.
  // val(s) : progression vers goal (s = statistiques). Sans val, le succès s'obtient d'un coup avec grant().
  const bossCount = final => Object.keys(data.stats.bosses).filter(id => R.BOSSES.some(b => b.id === id && !!b.final === final)).length;
  const bestCal = s => Math.max(0, ...Object.keys(s.winsCal).filter(c => s.winsCal[c] > 0).map(Number));
  const SUCCES = [
    { id: 'meche', tier: 1, icon: 'g:allumette', goal: 1, val: s => s.shots },
    { id: 'ooh', tier: 1, icon: 't:petard', goal: 10, val: s => s.bestChain },
    { id: 'soiree', tier: 1, icon: 'g:lune', goal: 1, val: s => s.nights },
    { id: 'client', tier: 1, icon: 'g:piece', goal: 1, val: s => s.buys },
    { id: 'deballage', tier: 1, icon: 'g:paquet', goal: 1, val: s => s.packs },
    { id: 'bricoleur', tier: 1, icon: 'g:pince', goal: 1, val: s => s.tools },
    { id: 'fumee', tier: 1, icon: 'g:cendres', goal: 1, val: s => s.fizzled || 0 },
    { id: 'chauffe', tier: 1, icon: 'g:medaille', goal: 5, val: s => s.runs },
    { id: 'tombeur', tier: 2, icon: 'g:voisin', goal: 1, val: s => Object.keys(s.bosses).length },
    { id: 'waouh', tier: 2, icon: 't:soleil', goal: 10000, val: s => s.bestShot },
    { id: 'ecart', tier: 2, icon: 'x:×2', goal: 1 },
    { id: 'arsenal', tier: 2, icon: 'g:cartes', goal: R.PERK_SLOTS, val: s => s.bestPerks },
    { id: 'sommet', tier: 2, icon: 'g:ciel', goal: 5, val: s => s.bestLevel },
    { id: 'brocanteur', tier: 2, icon: 'g:retour', goal: 1, val: s => s.sold },
    { id: 'menage', tier: 2, icon: 'g:croix', goal: 1, val: s => s.retraits },
    { id: 'saut', tier: 2, icon: 'g:vent', goal: 1, val: s => s.skips },
    { id: 'or', tier: 2, icon: 'g:dore', goal: 5, val: s => s.bestGold },
    { id: 'fil', tier: 2, icon: 'g:courte', goal: 1 },
    { id: 'mega', tier: 2, icon: 'g:geant', goal: 1, val: s => s.megas },
    { id: 'habitue', tier: 2, icon: 'x:100', goal: 100, val: s => s.shots },
    { id: 'champion', tier: 2, icon: 'g:coupe', goal: 1, val: s => s.wins },
    { id: 'bouquet', tier: 3, icon: 'g:etincelle', goal: 100000, val: s => s.bestShot },
    { id: 'rase', tier: 3, icon: 't:bombe', goal: 1 },
    { id: 'efficace', tier: 3, icon: 'g:reflexe', goal: 1 },
    { id: 'chasseur', tier: 3, icon: 'g:critique', goal: R.BOSSES.filter(b => !b.final).length, val: () => bossCount(false) },
    { id: 'juges', tier: 3, icon: 'g:jury', goal: R.BOSSES.filter(b => b.final).length, val: () => bossCount(true) },
    { id: 'sacs', tier: 3, icon: 'g:sac', goal: R.SACS.length, val: () => R.SACS.filter(s => data.wins[s.id]).length },
    { id: 'minimaliste', tier: 3, icon: 'g:penurie', goal: 1 },
    { id: 'picsou', tier: 3, icon: 'g:pieces', goal: 50, val: s => s.bestMoney },
    { id: 'calibre3', tier: 3, icon: 'x:3', goal: 3, val: bestCal },
    { id: 'maitre', tier: 3, icon: 'g:joie', goal: 3, val: s => s.bestOneShots },
    { id: 'fidele', tier: 3, icon: 's:classique', goal: 1 },
    { id: 'maree', tier: 3, icon: 'g:sacre', goal: 40, val: s => s.bestChain },
    { id: 'calibre5', tier: 4, icon: 'x:5', goal: R.CALIBRES, val: bestCal },
    { id: 'blanche', tier: 4, icon: 'g:infini', goal: 15, val: s => s.bestEndless },
    { id: 'million', tier: 4, icon: 'x:1M', goal: 1000000, val: s => s.bestNightScore },
    { id: 'collection', tier: 4, icon: 'g:cadenas', goal: UNLOCKS.length, val: () => UNLOCKS.filter(u => data.unlocked[u.id]).length },
    { id: 'mains', tier: 4, icon: 'g:main', goal: 1 },
    { id: 'artificiosus', tier: 4, icon: 'g:lettreA', goal: 0, val: () => SUCCES.filter(a => a.id !== 'artificiosus' && data.succes[a.id]).length },
    { id: 'noir', tier: 5, icon: 'g:nuitnoire', goal: 1 },
    { id: 'mouille', tier: 5, icon: 'w:petard', goal: 1 },
    { id: 'insomnie', tier: 5, icon: 'g:horloge', goal: 1 },
    { id: 'indecis', tier: 5, icon: 'g:eco', goal: 10, val: s => s.bestRerolls },
  ];
  SUCCES.find(a => a.id === 'artificiosus').goal = SUCCES.length - 1;
  let onSucces = null;
  function checkSucces() {
    const out = [];
    for (const a of SUCCES) if (a.val && a.id !== 'artificiosus' && !data.succes[a.id] && a.val(data.stats) >= a.goal) { data.succes[a.id] = Date.now(); out.push(a.id); }
    // Artificiosus vient en dernier : il dépend de tous les autres.
    const all = SUCCES.find(a => a.id === 'artificiosus');
    if (!data.succes[all.id] && all.val() >= all.goal) { data.succes[all.id] = Date.now(); out.push(all.id); }
    if (out.length) { save(); if (onSucces) onSucces(out); }
    return out;
  }
  checkSucces();

  window.Meta = {
    UNLOCKS,
    isUnlocked: id => !!data.unlocked[id],
    isOpen,
    count: unlockedCount,
    locked() {
      const out = {};
      for (const u of UNLOCKS) if (!data.unlocked[u.id]) out[u.id] = true;
      return out;
    },
    TIERS,
    tierOpen,
    tierOf: id => { const u = UNLOCKS.find(v => v.id === id); return u ? u.tier : 0; },
    isQueued: id => data.queue.includes(id),
    // Début d'une run : un défi en attente se débloque (et c'est le déblocage de cette run).
    startRun(cal) {
      data.run = { cal: cal || 1, got: false };
      const out = [];
      const id = data.queue.shift();
      const u = id && UNLOCKS.find(v => v.id === id);
      if (u && !data.unlocked[id]) { grantUnlock(u); out.push(u); }
      save();
      if (out.length) checkSucces();
      return out;
    },
    // Renvoie ce que cet événement vient de débloquer. Un seul déblocage par run :
    // les autres défis réussis attendent la run suivante ({ ...défi, queued: true }).
    check(e) {
      const run = data.run || { cal: 1, got: false };
      const hits = UNLOCKS.filter(u => !data.unlocked[u.id] && !data.queue.includes(u.id) && tierOpen(u.tier)
        && (!u.cal || run.cal >= u.cal) && u.test(e));
      const out = [];
      for (const u of hits) {
        if (!(data.run && data.run.got)) { grantUnlock(u); out.push(u); }
        else { data.queue.push(u.id); out.push(Object.assign({}, u, { queued: true })); }
      }
      if (out.length) { save(); checkSucces(); }
      return out;
    },
    // Déblocages pas encore vus dans la Collection.
    get fresh() { return Math.max(0, done() - (data.seen || 0)); },
    markSeen() { data.seen = done(); save(); },
    // Première fois qu'un contenu débloqué apparaît en boutique : on le signale.
    newInShop(id) {
      if (!UNLOCKS.some(u => u.id === id) || data.shopSeen[id]) return false;
      data.shopSeen[id] = 1;
      save();
      return true;
    },

    // Les calibres se débloquent sac par sac : le calibre N d'un sac demande d'avoir gagné le N - 1 avec ce sac.
    // data.calibre ne garde que le plus haut calibre ouvert, tous sacs confondus (compteur de la Collection, statistiques).
    maxFor: calOf,
    get maxCalibre() { return calOf(this.sac); },
    get bestCalibre() { return data.calibre; },
    get calibre() { return Math.min(data.picked, calOf(this.sac)); },
    set calibre(c) { data.picked = Math.max(1, Math.min(calOf(this.sac), c)); save(); },
    // Gagner une run au plus haut calibre du sac débloque le suivant pour ce sac. Renvoie le nouveau calibre, ou 0.
    winCalibre(c, sac) {
      const before = calOf(sac);
      data.wins[sac] = Math.max(data.wins[sac] || 0, c);
      data.calibre = Math.max(data.calibre, calOf(sac));
      save();
      checkSucces();
      if (c < before || c >= R.CALIBRES) return 0;
      data.picked = c + 1;
      save();
      return c + 1;
    },
    // Plus haut calibre gagné avec ce sac (0 : jamais gagné).
    winsWith: sac => data.wins[sac] || 0,

    sacs: () => R.SACS.filter(s => isOpen(s.id)).map(s => s.id),
    get sac() { return isOpen(data.sac) ? data.sac : 'classique'; },
    set sac(id) { data.sac = id; save(); },
    // Les décalages arrivent après la première run perdue. Vrai seulement la première fois.
    get nudgeHelp() { return !!data.nudgeHelp; },
    unlockNudge() {
      if (data.nudgeHelp) return false;
      data.nudgeHelp = true;
      save();
      return true;
    },

    // Statistiques : record(kind, …) les met à jour au fil des parties.
    get stats() { return data.stats; },
    record(kind, v) {
      const s = data.stats;
      if (kind === 'chain') { s.shots++; s.feux += v.count; s.bestChain = Math.max(s.bestChain, v.count); s.bestShot = Math.max(s.bestShot, v.score); }
      else if (kind === 'night') { s.nights++; s.bestNight = Math.max(s.bestNight, v.night); if (v.endless) s.bestEndless = Math.max(s.bestEndless, v.night); }
      else if (kind === 'perk') s.perks[v] = (s.perks[v] || 0) + 1;
      else if (kind === 'fizzle') s.fizzled = (s.fizzled || 0) + v;
      else if (kind === 'run') {
        s.runs++;
        s.sacs[v.sac] = (s.sacs[v.sac] || 0) + 1;
        if (v.win) { s.wins++; s.winsCal[v.calibre] = (s.winsCal[v.calibre] || 0) + 1; }
      }
      else if (kind === 'boss') s.bosses[v] = (s.bosses[v] || 0) + 1;
      else s[kind] = (s[kind] || 0) + 1;
      save();
      checkSucces();
    },
    // Un record (bestMoney, bestGold…) : on n'écrit que s'il est battu.
    best(kind, v) {
      if (!(v > (data.stats[kind] || 0))) return;
      data.stats[kind] = v;
      save();
      checkSucces();
    },

    SUCCES,
    set onSucces(fn) { onSucces = fn; },
    hasSucces: id => !!data.succes[id],
    grant(id) {
      if (data.succes[id] || !SUCCES.some(a => a.id === id)) return;
      data.succes[id] = Date.now();
      save();
      if (onSucces) onSucces([id]);
      checkSucces();
    },
    // Progression affichée, plafonnée à l'objectif.
    succesVal(a) { return data.succes[a.id] ? a.goal : a.val ? Math.max(0, Math.min(a.goal, a.val(data.stats))) : 0; },
    succesCount: () => SUCCES.filter(a => data.succes[a.id]).length,
    // Obtenu depuis la dernière visite de la page des succès (succesSeen : date de cette visite).
    isSuccesNew: id => (data.succes[id] || 0) > (data.succesSeen || 0),
    get succesFresh() { return SUCCES.filter(a => (data.succes[a.id] || 0) > (data.succesSeen || 0)).length; },
    markSuccesSeen() { data.succesSeen = Date.now(); save(); },
  };
})();
