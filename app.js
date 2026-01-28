// =====================
//  CONFIG SUPABASE
// =====================
const SUPABASE_URL = "https://dglucwqrviuzftagbwbn.supabase.co";
const SUPABASE_KEY = "sb_publishable_ZBZwBNng-jCbTQCvv4zf2w_ARQdjAtb";

// Magasin depuis l’URL ?store=xxx
const params = new URLSearchParams(window.location.search);
const storeId = params.get("store") || "magasin-1";

// =====================
//  DOM (Screens / UI)
// =====================
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const elLevel = document.getElementById("level");
must("level", elLevel);

const hud = document.getElementById("hud");
const elScore = document.getElementById("score");
const elLives = document.getElementById("lives");
const elMisses = document.getElementById("misses");

const screenHome = document.getElementById("screenHome");
const screenReady = document.getElementById("screenReady");
const screenGameOver = document.getElementById("screenGameOver");
const screenSave = document.getElementById("screenSave");

const btnPlay = document.getElementById("btnPlay");
const btnStartRound = document.getElementById("btnStartRound");
const btnReplay = document.getElementById("btnReplay");
const btnGoSave = document.getElementById("btnGoSave");
const btnBackToOver = document.getElementById("btnBackToOver");

const finalScoreEl = document.getElementById("finalScore");
const saveScoreEl = document.getElementById("saveScore");

const goMsg = document.getElementById("goMsg");
const saveMsg = document.getElementById("saveMsg");

const submitForm = document.getElementById("submitForm");

// Sécurité
function must(id, el) {
  if (!el) throw new Error(`Élément HTML manquant: #${id}`);
  return el;
}
must("game", canvas);
must("hud", hud);
must("score", elScore);
must("lives", elLives);
must("misses", elMisses);
must("screenHome", screenHome);
must("screenReady", screenReady);
must("screenGameOver", screenGameOver);
must("screenSave", screenSave);
must("btnPlay", btnPlay);
must("btnStartRound", btnStartRound);
must("btnReplay", btnReplay);
must("btnGoSave", btnGoSave);
must("btnBackToOver", btnBackToOver);
must("finalScore", finalScoreEl);
must("saveScore", saveScoreEl);
must("goMsg", goMsg);
must("saveMsg", saveMsg);
must("submitForm", submitForm);

// =====================
//  ASSETS
// =====================
// IMPORTANT: chemins relatifs (GitHub Pages / Netlify)
// => PAS de "/" devant
const ASSET_BAG = "assets/glasses.png";
const ASSET_OBJECTS = Array.from({ length: 13 }, (_, i) => `assets/object${i + 1}.png`);

const EFFECTS = {
  "assets/object3.png": { scoreDelta: -50, sfx: "malus" },
  "assets/object7.png": { scoreDelta: +50, sfx: "bonus" },
  "assets/object12.png":  { lifeDelta: -1,  sfx: "lifeDown" },
  "assets/object13.png":  { lifeDelta: +1,  sfx: "lifeUp" }
};

// =====================
//  SETTINGS
// =====================
const START_LIVES = 3;
const MAX_MISSES = 200;

// +2 objets max à l’écran tous les 100 points
const START_MAX_ONSCREEN = 2;
const ADD_ONSCREEN_EVERY = 100;
const ADD_ONSCREEN_BY = 2;
const MAX_ONSCREEN_CAP = 18;

// difficulté vitesse (augmente tous les 200 points)
const BASE = {
  spawnChance: 0.045,
  speedMin: 165,
  speedMax: 255,
  rotMin: -1.4,
  rotMax: 1.4
};

// Rareté object13/object3 : max 1 de chaque / 500 points
const SPECIAL_BUCKET_POINTS = 500;

// sac: peut sortir à 50% => centre clamp [0..W]
const INPUT_SMOOTHING = 0.0;

// ouverture du sac
const OPENING = {
  widthRatio: 0.62,
  heightRatio: 0.16,
  yOffsetRatio: 0.18
};

// pause après perte de vie
const LIFE_PAUSE_MS = 900;

// =====================
//  HELPERS
// =====================
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function rand(min, max) { return Math.random() * (max - min) + min; }

function difficultyLevel(currentScore) {
  return Math.floor(currentScore / 200);
}

function currentDifficulty(score) {
  const lvl = difficultyLevel(score);
  return {
    lvl,
    spawnChance: clamp(BASE.spawnChance + lvl * 0.006, 0.03, 0.12),
    speedMin: BASE.speedMin + lvl * 14,
    speedMax: BASE.speedMax + lvl * 18
  };
}

function maxOnScreenForScore(currentScore) {
  const steps = Math.floor(currentScore / ADD_ONSCREEN_EVERY);
  return clamp(
    START_MAX_ONSCREEN + steps * ADD_ONSCREEN_BY,
    START_MAX_ONSCREEN,
    MAX_ONSCREEN_CAP
  );
}

// Evitement d’un malus (score<0 ou vie<0) => pas raté
function countsAsMiss(itemSrc) {
  const fx = EFFECTS[itemSrc];
  if (!fx) return true;
  if (typeof fx.scoreDelta === "number" && fx.scoreDelta < 0) return false;
  if (typeof fx.lifeDelta === "number" && fx.lifeDelta < 0) return false;
  return true;
}

function livesLabel(n) {
  return n <= 1 ? "vie" : "vies";
}

// =====================
//  AUDIO
// =====================
let audioCtx = null;

function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
}

function beep({ freq = 440, duration = 0.08, type = "sine", gain = 0.06 }) {
  if (!audioCtx) return;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();

  o.type = type;
  o.frequency.value = freq;

  g.gain.value = 0.0001;
  g.gain.exponentialRampToValueAtTime(gain, audioCtx.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);

  o.connect(g);
  g.connect(audioCtx.destination);

  o.start();
  o.stop(audioCtx.currentTime + duration + 0.02);
}

function sfx(kind) {
  ensureAudio();
  switch (kind) {
    case "catch":    beep({ freq: 520, duration: 0.06, type: "triangle", gain: 0.05 }); break;
    case "bonus":    beep({ freq: 740, duration: 0.09, type: "sine", gain: 0.06 }); beep({ freq: 980, duration: 0.08, type: "sine", gain: 0.05 }); break;
    case "malus":    beep({ freq: 220, duration: 0.11, type: "sawtooth", gain: 0.04 }); break;
    case "lifeUp":   beep({ freq: 660, duration: 0.08, type: "square", gain: 0.045 }); break;
    case "lifeDown": beep({ freq: 180, duration: 0.12, type: "sawtooth", gain: 0.045 }); break;
    case "gameover": beep({ freq: 160, duration: 0.18, type: "sawtooth", gain: 0.05 }); beep({ freq: 120, duration: 0.18, type: "sawtooth", gain: 0.045 }); break;
    case "miss":     beep({ freq: 300, duration: 0.06, type: "sine", gain: 0.03 }); break;
    default: break;
  }
}

// =====================
//  ASSET LOADING
// =====================
const SPRITES = { bag: null, objects: new Map() };
let assetsReady = false;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Image introuvable: ${src}`));
    img.src = src;
  });
}

async function loadSprites() {
  SPRITES.bag = await loadImage(ASSET_BAG);
  for (const src of ASSET_OBJECTS) {
    const img = await loadImage(src);
    SPRITES.objects.set(src, img);
  }
  assetsReady = true;
}

// =====================
//  GAME STATE
// =====================
const player = { x: 0, y: 0, w: 200, h: 140 };

// IMPORTANT: on garde TOUJOURS la même référence (pas de items = [])
const items = [];
const pops = [];

let running = false;
let paused = false;
let lastTs = 0;

let score = 0;
let lives = START_LIVES;
let misses = 0;

// contrôles sliceur
let dragging = false;
let grabOffsetX = 0;
let targetXInstant = 0;

// bucket spéciaux
let currentSpecialBucket = 0;
let spawnedThisBucket = { object3: false, object7: false };

// pause UI
let pauseText = "";
let pauseUntil = 0;

// =====================
//  SCREENS HELPERS
// =====================
function show(el) { el.classList.remove("hidden"); }
function hide(el) { el.classList.add("hidden"); }

function showHome() {
  canvas.style.display = "none";
  hud.style.display = "none";
  show(screenHome);
  hide(screenReady);
  hide(screenGameOver);
  hide(screenSave);
}

function showGameReady() {
  canvas.style.display = "block";
  hud.style.display = "block";
  hide(screenHome);
  show(screenReady);
  hide(screenGameOver);
  hide(screenSave);
}

function showGameOver() {
  finalScoreEl.textContent = String(score);
  goMsg.textContent = "";
  show(screenGameOver);
  hide(screenSave);
}

function showSaveForm() {
  saveScoreEl.textContent = String(score);
  saveMsg.textContent = "";
  hide(screenGameOver);
  show(screenSave);
}

// =====================
//  RESET
// =====================
function clearDynamic() {
  items.length = 0;
  pops.length = 0;
  dragging = false;
  paused = false;
  pauseText = "";
  pauseUntil = 0;
}

function resetAllHard() {
  running = false;
  lastTs = 0;

  score = 0;
  lives = START_LIVES;
  misses = 0;

  currentSpecialBucket = 0;
  spawnedThisBucket.object3 = false;
  spawnedThisBucket.object7 = false;

  player.w = 200;
  player.h = 140;

  elScore.textContent = String(score);
  elLives.textContent = String(lives);
  elMisses.textContent = String(misses);

  elLevel.textContent = "1";

  clearDynamic();
}

function resetRoundToReady() {
  resetAllHard();
}

// =====================
//  START ROUND
// =====================
function startRound() {
  ensureAudio();
  hide(screenReady);
  hide(screenGameOver);
  hide(screenSave);

  running = true;
  lastTs = 0;

  clearDynamic();
  requestAnimationFrame(step);
}

// =====================
//  SPECIAL BUCKET
// =====================
function updateSpecialBucketIfNeeded() {
  const bucket = Math.floor(score / SPECIAL_BUCKET_POINTS);
  if (bucket !== currentSpecialBucket) {
    currentSpecialBucket = bucket;
    spawnedThisBucket.object3 = false;
    spawnedThisBucket.object7 = false;
  }
}

function pickObjectSrc() {
  updateSpecialBucketIfNeeded();

  const allow13 = !spawnedThisBucket.object13;
  const allow7 = !spawnedThisBucket.object7;

  const pool = ASSET_OBJECTS.filter(src => src !== "assets/object3.png" && src !== "assets/object7.png");

  const roll = Math.random();
  if (allow3 && roll < 0.03) return "assets/object3.png";
  if (allow7 && roll >= 0.03 && roll < 0.06) return "assets/object7.png";

  return pool[Math.floor(Math.random() * pool.length)];
}

// =====================
//  SPAWN / COLLISION
// =====================
function spawn() {
  const maxOn = maxOnScreenForScore(score);
  if (items.length >= maxOn) return;

  const src = pickObjectSrc();
  const sprite = SPRITES.objects.get(src);
  if (!sprite) return;

  if (src === "assets/object3.png") spawnedThisBucket.object3 = true;
  if (src === "assets/object7.png") spawnedThisBucket.object7 = true;

  const { speedMin, speedMax } = currentDifficulty(score);
  const r = 16;

  items.push({
    x: rand(r + 10, canvas._w - r - 10),
    y: -60,
    r,
    vy: rand(speedMin, speedMax),
    ang: rand(0, Math.PI * 2),
    rot: rand(BASE.rotMin, BASE.rotMax),
    src,
    sprite
  });
}

function collideWithBagOpening(it) {
  const openingW = player.w * OPENING.widthRatio;
  const openingH = player.h * OPENING.heightRatio;

  const openingX = player.x - openingW / 2;
  const openingY = (player.y - player.h / 2) + player.h * OPENING.yOffsetRatio;

  return (
    it.x + it.r > openingX &&
    it.x - it.r < openingX + openingW &&
    it.y + it.r > openingY &&
    it.y - it.r < openingY + openingH
  );
}

function addPop(text) {
  pops.push({ x: player.x, y: player.y - player.h / 2 + 20, t: 0, text });
}

// Pause après perte de vie, sans reset score
function pauseAfterLifeLost(reasonText, nowTs) {
  paused = true;
  dragging = false;
  items.length = 0; // IMPORTANT: pas de items = []
  pauseText = reasonText;
  pauseUntil = nowTs + LIFE_PAUSE_MS;
}

function applyEffects(src, nowTs) {
  const fx = EFFECTS[src];

  let deltaScore = 10;
  let deltaLife = 0;
  let sound = "catch";

  if (fx?.scoreDelta != null) { deltaScore = fx.scoreDelta; sound = fx.sfx || sound; }
  if (fx?.lifeDelta != null) { deltaLife = fx.lifeDelta; sound = fx.sfx || sound; }

  score = Math.max(0, score + deltaScore);
  lives = clamp(lives + deltaLife, 0, 9);

  updateSpecialBucketIfNeeded();

  elScore.textContent = String(score);
  elLives.textContent = String(lives);

  if (src === "assets/object12.png") addPop("-50");
  else if (src === "assets/object13.png") addPop("+50");
  else if (src === "assets/object3.png") addPop("-1 vie");
  else if (src === "assets/object7.png") addPop("+1 vie");
  else addPop("+10");

  sfx(sound);

  // Perte vie directe (object3)
  if (deltaLife < 0) {
    if (lives <= 0) endGame();
    else pauseAfterLifeLost(`1 vie perdue — il te reste ${lives} ${livesLabel(lives)}`, nowTs);
    return true; // signal: stop processing this frame
  }
  return false;
}

function loseLifeFromMisses(nowTs) {
  lives = clamp(lives - 1, 0, 9);
  elLives.textContent = String(lives);

  misses = 0;
  elMisses.textContent = String(misses);

  if (lives <= 0) {
    endGame();
    return true;
  }

  pauseAfterLifeLost(`1 vie perdue — il te reste ${lives} ${livesLabel(lives)}`, nowTs);
  return true;
}

function endGame() {
  running = false;
  paused = false;
  dragging = false;
  pauseText = "";
  pauseUntil = 0;
  sfx("gameover");
  showGameOver();
}

// =====================
//  DRAW
// =====================
function drawBackground() {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas._w, canvas._h);
}

function drawBag() {
  if (!SPRITES.bag) return;

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 10;

  ctx.drawImage(
    SPRITES.bag,
    player.x - player.w / 2,
    player.y - player.h / 2,
    player.w,
    player.h
  );
  ctx.restore();
}

function drawItem(it) {
  // taille de référence (en CSS pixels)
  const baseSize = Math.round(Math.min(canvas._w, canvas._h) * 0.09);

  const img = it.sprite;
  const ratio = img.width / img.height;

  let w, h;

  if (ratio >= 1) {
    // image large (lunettes)
    w = baseSize;
    h = baseSize / ratio;
  } else {
    // image haute (spray, bouteille)
    h = baseSize;
    w = baseSize * ratio;
  }

  ctx.save();
  ctx.translate(it.x, it.y);
  ctx.rotate(it.ang);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}


function drawPops() {
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i];
    p.t += 1;

    const yy = p.y - p.t * 1.2;
    const a = Math.max(0, 1 - p.t / 45);

    ctx.globalAlpha = a;
    ctx.fillStyle = "#111";
    ctx.font = "16px system-ui";
    ctx.fillText(p.text, p.x - 14, yy);
    ctx.globalAlpha = 1;

    if (p.t > 45) pops.splice(i, 1);
  }
}

function drawPauseOverlay() {
  if (!paused || !pauseText) return;

  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillRect(0, 0, canvas._w, canvas._h);

  ctx.fillStyle = "#111";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "600 28px system-ui";
  ctx.fillText("1 vie perdue", canvas._w / 2, canvas._h / 2 - 18);

  ctx.font = "16px system-ui";
  ctx.fillText(pauseText.replace("1 vie perdue — ", ""), canvas._w / 2, canvas._h / 2 + 18);
  ctx.restore();
}

function draw() {
  if (!canvas._w || !canvas._h) return;
  drawBackground();
  for (const it of items) drawItem(it);
  drawBag();
  drawPops();
  drawPauseOverlay();
}

// =====================
//  RESIZE CANVAS
// =====================
function resizeCanvas() {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const cssW = window.innerWidth;
  const cssH = window.innerHeight;

  canvas.style.width = cssW + "px";
  canvas.style.height = cssH + "px";

  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);

  // on dessine en CSS pixels
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  canvas._w = cssW;
  canvas._h = cssH;

  player.y = canvas._h - 90;
  player.x = clamp(player.x || canvas._w / 2, 0, canvas._w);
  targetXInstant = player.x;
}
window.addEventListener("resize", resizeCanvas);

// =====================
//  LOOP
// =====================
function step(ts) {
  if (!running) { draw(); return; }
  if (!assetsReady) { requestAnimationFrame(step); return; }

  // auto reprise pause
  if (paused) {
    if (pauseUntil && ts >= pauseUntil) {
      paused = false;
      pauseText = "";
      pauseUntil = 0;
    }
    draw();
    requestAnimationFrame(step);
    return;
  }

  if (!lastTs) lastTs = ts;
  const dt = Math.min(0.033, (ts - lastTs) / 1000);
  lastTs = ts;

  const diff = currentDifficulty(score);
  if (Math.random() < diff.spawnChance) spawn();

  // update level (discret)
elLevel.textContent = String(diff.lvl + 1);

  // mouvement sliceur
  if (dragging) {
    if (INPUT_SMOOTHING === 0) player.x = targetXInstant;
    else player.x += (targetXInstant - player.x) * INPUT_SMOOTHING;
  }
  // sac centre clamp [0..W] => sort à 50%
  player.x = clamp(player.x, 0, canvas._w);

  // update items
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (!it) { items.splice(i, 1); continue; } // safety

    it.y += it.vy * dt;
    it.ang += it.rot * dt;

    if (collideWithBagOpening(it)) {
      const stopFrame = applyEffects(it.src, ts);
      items.splice(i, 1);

      // si perte de vie => on stop cette frame (sinon items peut bouger encore)
      if (!running || paused || stopFrame) break;
      continue;
    }

    if (it.y > canvas._h + 80) {
      const src = it.src;
      items.splice(i, 1);

      if (countsAsMiss(src)) {
        misses += 1;
        elMisses.textContent = String(misses);
        sfx("miss");

        if (misses >= MAX_MISSES) {
          const stopFrame = loseLifeFromMisses(ts);
          if (!running || paused || stopFrame) break;
        }
      }
    }
  }

  draw();
  requestAnimationFrame(step);
}

// =====================
//  CONTROLS
// =====================
function clientXToCanvasX(clientX) {
  const rect = canvas.getBoundingClientRect();
  return (clientX - rect.left);
}

canvas.addEventListener("pointerdown", (e) => {
  ensureAudio();
  e.preventDefault();
  if (!running) return;
  if (paused) return;

  dragging = true;
  canvas.setPointerCapture(e.pointerId);

  const touchX = clientXToCanvasX(e.clientX);
  grabOffsetX = player.x - touchX;

  targetXInstant = clamp(touchX + grabOffsetX, 0, canvas._w);
  player.x = targetXInstant;
});

canvas.addEventListener("pointermove", (e) => {
  if (!dragging || !running || paused) return;
  e.preventDefault();

  const touchX = clientXToCanvasX(e.clientX);
  targetXInstant = clamp(touchX + grabOffsetX, 0, canvas._w);
});

canvas.addEventListener("pointerup", (e) => {
  dragging = false;
  try { canvas.releasePointerCapture(e.pointerId); } catch {}
});
canvas.addEventListener("pointercancel", () => { dragging = false; });

// =====================
//  NAVIGATION FLOW
// =====================
btnPlay.onclick = () => {
  ensureAudio();
  resetAllHard();
  resizeCanvas();
  showGameReady();
};

btnStartRound.onclick = () => {
  startRound();
};

btnReplay.onclick = () => {
  resetRoundToReady();
  resizeCanvas();
  hide(screenGameOver);
  hide(screenSave);
  show(screenReady);
};

btnGoSave.onclick = () => {
  showSaveForm();
};

btnBackToOver.onclick = () => {
  showGameOver();
};

// =====================
//  SUPABASE: submit score
// =====================
async function submitScore(data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/submit_score`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`
    },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(await res.text());
}

submitForm.onsubmit = async (e) => {
  e.preventDefault();
  saveMsg.textContent = "";

  const data = {
    p_store_id: storeId,
    p_first_name: document.getElementById("firstName").value.trim(),
    p_last_name: document.getElementById("lastName").value.trim(),
    p_email: document.getElementById("email").value.trim(),
    p_phone: document.getElementById("phone").value.trim() || null,
    p_consent_marketing: document.getElementById("consent").checked,
    p_score: score
  };

  try {
    await submitScore(data);
    saveMsg.textContent = "Score enregistré ✅";
  } catch (err) {
    saveMsg.textContent = "Erreur : " + err.message;
  }
};

// =====================
//  INIT
// =====================
(async function init() {
  showHome();
  resizeCanvas();

  try {
    await loadSprites();
  } catch (e) {
    console.error(e);
  }

  draw();
})();


