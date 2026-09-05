(() => {
  'use strict';

  const STORAGE_KEY = 'flitsvis-settings-v1';
  const CALIBRATION_KEY = 'flitsvis-marbotic-v1';
  const SESSION_ROUNDS = 15;
  const LEVELS = [3, 4, 6, 8, 9];

  const $ = (id) => document.getElementById(id);
  const ui = {
    startScreen: $('startScreen'), gameScreen: $('gameScreen'), finishScreen: $('finishScreen'),
    startButton: $('startButton'), againButton: $('againButton'), resultsButton: $('resultsButton'),
    teacherButton: $('teacherButton'), teacherDialog: $('teacherDialog'), teacherForm: $('teacherForm'),
    saveSettingsButton: $('saveSettingsButton'), speechToggle: $('speechToggle'), marboticToggle: $('marboticToggle'),
    marboticPanel: $('marboticPanel'), calibrationDigits: $('calibrationDigits'), calibrationBadge: $('calibrationBadge'),
    calibrationInstruction: $('calibrationInstruction'), resetCalibrationButton: $('resetCalibrationButton'), closeTeacherButton: $('closeTeacherButton'),
    resultsPanel: $('resultsPanel'), summaryCards: $('summaryCards'), amountResults: $('amountResults'), teacherAdvice: $('teacherAdvice'),
    progressShells: $('progressShells'), levelPill: $('levelPill'), promptText: $('promptText'), marboticHint: $('marboticHint'),
    flashBoard: $('flashBoard'), curtain: $('curtain'), answerArea: $('answerArea'), numberButtons: $('numberButtons'),
    feedbackFish: $('feedbackFish'), touchStatus: $('touchStatus'), finishMessage: $('finishMessage'), childStars: $('childStars'), finishFish: $('finishFish'),
    bubbleField: $('bubbleField')
  };

  const defaultSettings = { startLevel: 3, maxLevel: 8, speech: true, marbotic: false };
  let settings = loadJSON(STORAGE_KEY, defaultSettings);
  let calibration = loadJSON(CALIBRATION_KEY, {});
  let state = createEmptyState();
  let calibrationTarget = null;
  let calibrationSamples = [];
  let touchLocked = false;
  let audioCtx = null;

  function createEmptyState() {
    return {
      running: false, round: 0, currentMax: Number(settings.startLevel || 3), currentAmount: null,
      firstAttempt: true, answered: false, roundShownAt: 0, history: [], levelHistory: [],
      lastAmount: null, sessionStartedAt: 0, supportAttempts: 0
    };
  }

  function loadJSON(key, fallback) {
    try { return { ...fallback, ...JSON.parse(localStorage.getItem(key) || '{}') }; }
    catch { return { ...fallback }; }
  }
  function saveJSON(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} }

  function showScreen(target) {
    [ui.startScreen, ui.gameScreen, ui.finishScreen].forEach(el => el.classList.remove('screen-active'));
    target.classList.add('screen-active');
  }

  function init() {
    applySettingsToUI();
    buildProgress();
    buildCalibrationButtons();
    createBackgroundBubbles();
    drawDecorativeFish(ui.finishFish);
    registerEvents();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  function registerEvents() {
    ui.startButton.addEventListener('click', () => { unlockAudio(); startGame(); });
    ui.againButton.addEventListener('click', () => { unlockAudio(); startGame(); });
    ui.teacherButton.addEventListener('click', openTeacherDialog);
    ui.resultsButton.addEventListener('click', () => { openTeacherDialog(true); });
    ui.marboticToggle.addEventListener('change', () => ui.marboticPanel.classList.toggle('hidden', !ui.marboticToggle.checked));
    ui.resetCalibrationButton.addEventListener('click', resetCalibration);
    ui.closeTeacherButton.addEventListener('click', () => ui.teacherDialog.close());
    ui.teacherForm.addEventListener('submit', saveSettingsFromUI);
    document.addEventListener('touchstart', handlePhysicalTouchStart, { passive: false });
    document.addEventListener('touchend', handlePhysicalTouchEnd, { passive: true });
    document.addEventListener('touchcancel', handlePhysicalTouchEnd, { passive: true });
  }

  function applySettingsToUI() {
    const start = document.querySelector(`input[name="startLevel"][value="${settings.startLevel}"]`);
    const max = document.querySelector(`input[name="maxLevel"][value="${settings.maxLevel}"]`);
    if (start) start.checked = true;
    if (max) max.checked = true;
    ui.speechToggle.checked = settings.speech !== false;
    ui.marboticToggle.checked = settings.marbotic === true;
    ui.marboticPanel.classList.toggle('hidden', !ui.marboticToggle.checked);
  }

  function saveSettingsFromUI(event) {
    event.preventDefault();
    const fd = new FormData(ui.teacherForm);
    settings = {
      startLevel: Number(fd.get('startLevel') || 3), maxLevel: Number(fd.get('maxLevel') || 8),
      speech: ui.speechToggle.checked, marbotic: ui.marboticToggle.checked
    };
    if (settings.startLevel > settings.maxLevel) settings.startLevel = Math.min(6, settings.maxLevel);
    saveJSON(STORAGE_KEY, settings);
    ui.teacherDialog.close();
    if (!state.running) state.currentMax = settings.startLevel;
  }

  function openTeacherDialog(showResults = false) {
    applySettingsToUI();
    updateCalibrationUI();
    ui.resultsPanel.classList.toggle('hidden', !showResults || state.history.length === 0);
    if (state.history.length) renderResults();
    if (!ui.teacherDialog.open) ui.teacherDialog.showModal();
  }

  function buildProgress() {
    ui.progressShells.innerHTML = '';
    for (let i = 0; i < SESSION_ROUNDS; i++) {
      const shell = document.createElement('span'); shell.className = 'progress-shell'; ui.progressShells.appendChild(shell);
    }
  }
  function updateProgress() { [...ui.progressShells.children].forEach((el, idx) => el.classList.toggle('done', idx < state.round)); }

  function startGame() {
    state = createEmptyState();
    state.running = true;
    state.sessionStartedAt = performance.now();
    state.currentMax = Math.min(settings.startLevel, settings.maxLevel);
    ui.resultsPanel.classList.add('hidden');
    ui.childStars.innerHTML = '';
    buildProgress();
    showScreen(ui.gameScreen);
    updateLevelUI();
    setTimeout(nextRound, 450);
  }

  function nextRound() {
    if (!state.running) return;
    if (state.round >= SESSION_ROUNDS) return finishGame();
    state.round += 1;
    state.firstAttempt = true;
    state.supportAttempts = 0;
    state.answered = false;
    state.currentAmount = chooseAmount();
    state.lastAmount = state.currentAmount;
    updateProgress();
    updateLevelUI();
    ui.answerArea.classList.add('hidden');
    ui.marboticHint.classList.add('hidden');
    ui.feedbackFish.classList.add('hidden');
    ui.curtain.classList.add('curtain-hidden');
    ui.curtain.classList.remove('curtain-visible');
    ui.promptText.textContent = 'Kijk goed…';
    renderFlash(state.currentAmount, false);
    const displayMs = displayDurationFor(state.currentMax);
    tone('ready');
    setTimeout(() => { hideFlash(); setTimeout(() => askAnswer(), 270); }, displayMs);
  }

  function chooseAmount() {
    const max = state.currentMax;
    const recent = state.history.slice(-5).map(x => x.amount);
    let pool = [];
    for (let n = 1; n <= max; n++) {
      const weight = n >= Math.max(2, max - 2) ? 4 : 2;
      for (let i = 0; i < weight; i++) pool.push(n);
    }
    if (max >= 6) pool.push(max, max, max - 1);
    let chosen = pool[Math.floor(Math.random() * pool.length)];
    let guard = 0;
    while ((chosen === state.lastAmount || recent.filter(x => x === chosen).length >= 2) && guard < 12) {
      chosen = pool[Math.floor(Math.random() * pool.length)]; guard++;
    }
    return chosen;
  }

  function displayDurationFor(max) {
    if (max <= 3) return 1350;
    if (max <= 4) return 1150;
    if (max <= 6) return 950;
    return 900;
  }

  const layoutSets = {
    1: [[[50,50]]],
    2: [[[38,40],[62,60]], [[36,50],[64,50]]],
    3: [[[35,37],[50,55],[65,37]], [[38,38],[62,38],[50,64]]],
    4: [[[36,36],[64,36],[36,64],[64,64]], [[33,50],[47,37],[61,50],[47,63]]],
    5: [[[34,34],[66,34],[50,50],[34,66],[66,66]], [[31,42],[46,32],[64,42],[40,65],[59,65]]],
    6: [[[34,31],[34,50],[34,69],[66,31],[66,50],[66,69]], [[29,38],[48,30],[68,38],[31,65],[50,72],[69,64]]],
    7: [[[30,29],[50,29],[70,29],[30,51],[50,51],[70,51],[50,72]]],
    8: [[[31,29],[50,29],[69,29],[31,51],[50,51],[69,51],[40,72],[60,72]]],
    9: [[[30,29],[50,29],[70,29],[30,50],[50,50],[70,50],[30,71],[50,71],[70,71]]]
  };

  function renderFlash(amount, grouped) {
    ui.flashBoard.innerHTML = '';
    ui.flashBoard.classList.toggle('grouped', grouped);
    const variants = layoutSets[amount] || layoutSets[9];
    const points = variants[Math.floor(Math.random() * variants.length)];
    const palette = grouped && amount > 4 ? ['#2e9ac7', '#2e9ac7', '#2e9ac7', '#2e9ac7', '#8c74dc'] : ['#2e9ac7'];
    points.forEach((pt, idx) => {
      const item = document.createElement('div');
      item.className = 'flash-item';
      const driftX = grouped ? 0 : (Math.random() * 2.8 - 1.4);
      const driftY = grouped ? 0 : (Math.random() * 2.4 - 1.2);
      item.style.left = `${pt[0] + driftX}%`; item.style.top = `${pt[1] + driftY}%`; item.style.animationDelay = `${idx * 22}ms`;
      const color = palette[Math.min(idx, palette.length - 1)];
      item.innerHTML = miniFishSvg(color, idx % 2 === 0);
      ui.flashBoard.appendChild(item);
    });
  }

  function miniFishSvg(color, flip) {
    return `<svg viewBox="0 0 100 72" aria-hidden="true" style="transform:${flip ? 'scaleX(-1)' : 'none'}">
      <path d="M24 36C8 24 7 15 9 8c14 2 25 8 33 17 8-7 18-11 31-10 16 1 26 10 28 21-3 14-14 23-30 23-13 0-23-4-31-12-8 7-18 11-30 13-2-9 3-17 14-24Z" fill="${color}"/>
      <circle cx="73" cy="31" r="4.4" fill="#fff"/><circle cx="74" cy="31" r="2" fill="#173b55"/>
      <path d="M79 42c4 2 7 2 11 0" fill="none" stroke="#173b55" stroke-width="2" stroke-linecap="round"/>
      <circle cx="47" cy="31" r="7" fill="rgba(255,255,255,.34)"/><circle cx="58" cy="42" r="7" fill="rgba(255,255,255,.30)"/>
    </svg>`;
  }

  function hideFlash() { ui.curtain.classList.remove('curtain-hidden'); ui.curtain.classList.add('curtain-visible'); }

  function askAnswer() {
    state.roundShownAt = performance.now();
    ui.promptText.textContent = 'Hoeveel zag je?';
    speak('Hoeveel zag je?');
    buildAnswerButtons();
    ui.answerArea.classList.remove('hidden');
    if (settings.marbotic && hasCalibrationThrough(state.currentMax)) ui.marboticHint.classList.remove('hidden');
  }

  function buildAnswerButtons() {
    ui.numberButtons.innerHTML = '';
    for (let n = 1; n <= state.currentMax; n++) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'number-button'; button.textContent = String(n); button.setAttribute('aria-label', String(n));
      button.addEventListener('click', () => submitAnswer(n, 'screen', button));
      ui.numberButtons.appendChild(button);
    }
  }

  function submitAnswer(answer, source = 'screen', button = null) {
    if (!state.running || state.answered) return;
    state.answered = true;
    const correct = answer === state.currentAmount;
    const responseMs = Math.max(0, performance.now() - state.roundShownAt);
    const first = state.firstAttempt;
    if (first) {
      state.history.push({ round: state.round, amount: state.currentAmount, answer, correct, source, responseMs, max: state.currentMax });
      state.levelHistory.push({ correct, amount: state.currentAmount, max: state.currentMax });
      adaptDifficulty();
    }
    if (correct) {
      tone('correct');
      ui.promptText.textContent = first ? 'Goed gezien!' : 'Ja, dat zijn er ' + state.currentAmount + '!';
      speak(first ? 'Goed gezien!' : `Ja, dat zijn er ${state.currentAmount}.`);
      showCorrectFeedback();
      setTimeout(() => { ui.feedbackFish.classList.add('hidden'); nextRound(); }, 900);
    } else {
      if (button) button.classList.add('wrong');
      tone('softWrong');
      if (!first) { revealCorrectAnswer(); return; }
      ui.promptText.textContent = 'Kijk nog eens…';
      speak('Kijk nog eens.');
      state.firstAttempt = false;
      state.supportAttempts = 1;
      setTimeout(() => replayWithSupport(), 450);
    }
  }

  function revealCorrectAnswer() {
    ui.answerArea.classList.add('hidden'); ui.marboticHint.classList.add('hidden');
    ui.curtain.classList.remove('curtain-visible'); ui.curtain.classList.add('curtain-hidden');
    renderFlash(state.currentAmount, true);
    ui.promptText.textContent = `Het waren er ${state.currentAmount}.`;
    speak(`Het waren er ${state.currentAmount}.`);
    setTimeout(() => nextRound(), 1850);
  }

  function replayWithSupport() {
    ui.answerArea.classList.add('hidden'); ui.marboticHint.classList.add('hidden');
    ui.curtain.classList.remove('curtain-visible'); ui.curtain.classList.add('curtain-hidden');
    renderFlash(state.currentAmount, true);
    setTimeout(() => {
      hideFlash();
      setTimeout(() => {
        state.answered = false; state.roundShownAt = performance.now(); ui.promptText.textContent = 'Hoeveel zijn het?';
        buildAnswerButtons(); ui.answerArea.classList.remove('hidden');
        if (settings.marbotic && hasCalibrationThrough(state.currentMax)) ui.marboticHint.classList.remove('hidden');
      }, 250);
    }, 1900);
  }

  function showCorrectFeedback() { ui.feedbackFish.innerHTML = `<div class="feedback-badge">✨</div>`; ui.feedbackFish.classList.remove('hidden'); }

  function adaptDifficulty() {
    const current = state.currentMax;
    const maxAllowed = Number(settings.maxLevel);
    const currentRecords = state.history.filter(r => r.max === current);
    const needed = current <= 4 ? 4 : 5;
    const recent = currentRecords.slice(-needed);
    if (recent.length < needed) return;
    const accuracy = recent.filter(r => r.correct).length / recent.length;
    const upperHits = recent.filter(r => r.amount >= Math.max(2, current - 1));
    const upperAccuracy = upperHits.length ? upperHits.filter(r => r.correct).length / upperHits.length : 0;
    const avgResponse = average(recent.filter(r => r.correct).map(r => r.responseMs));
    const requiredAccuracy = current <= 4 ? .75 : .8;
    const latestCorrect = currentRecords[currentRecords.length - 1]?.correct === true;
    if (latestCorrect && accuracy >= requiredAccuracy && upperHits.length >= 2 && upperAccuracy >= .75 && avgResponse <= 5500) {
      const next = LEVELS.find(l => l > current && l <= maxAllowed);
      if (next) { state.currentMax = next; state.levelHistory = []; updateLevelUI(); return; }
    }
    const last5 = currentRecords.slice(-5);
    if (last5.length === 5 && last5.filter(r => r.correct).length <= 2) {
      const previous = [...LEVELS].reverse().find(l => l < current && l >= Number(settings.startLevel));
      if (previous) { state.currentMax = previous; state.levelHistory = []; updateLevelUI(); }
    }
  }

  function updateLevelUI() { ui.levelPill.textContent = `1–${state.currentMax}`; }

  function finishGame() {
    state.running = false;
    ui.answerArea.classList.add('hidden'); ui.marboticHint.classList.add('hidden');
    const correct = state.history.filter(x => x.correct).length;
    const pct = state.history.length ? correct / state.history.length : 0;
    const maxMastered = estimateMasteredRange();
    ui.finishMessage.textContent = maxMastered >= 6 ? `Je herkende al hoeveelheden tot ${maxMastered}.` : 'Je hebt geoefend met kijken zonder te tellen.';
    renderChildStars(pct); showScreen(ui.finishScreen); renderResults(); tone('finish');
  }

  function estimateMasteredRange() {
    let mastered = Math.min(settings.startLevel, 3);
    for (const max of LEVELS) {
      const records = state.history.filter(r => r.amount <= max && r.max <= max);
      const upper = state.history.filter(r => r.amount >= Math.max(1, max - 1) && r.amount <= max);
      if (records.length >= 4 && upper.length >= 2 && records.filter(r => r.correct).length / records.length >= .75 && upper.filter(r => r.correct).length / upper.length >= .67) mastered = max;
    }
    return Math.min(mastered, settings.maxLevel);
  }

  function renderChildStars(pct) {
    ui.childStars.innerHTML = '';
    const count = pct >= .83 ? 5 : pct >= .67 ? 4 : pct >= .5 ? 3 : 2;
    for (let i = 0; i < count; i++) {
      const star = document.createElement('span'); star.textContent = i % 2 ? '✦' : '✨'; star.style.animationDelay = `${i * 90}ms`; ui.childStars.appendChild(star);
    }
  }

  function renderResults() {
    if (!state.history.length) return;
    const correct = state.history.filter(r => r.correct).length;
    const pct = Math.round(correct / state.history.length * 100);
    const correctTimes = state.history.filter(r => r.correct).map(r => r.responseMs);
    const avgSeconds = correctTimes.length ? (average(correctTimes) / 1000).toFixed(1) : '–';
    const maxReached = Math.max(...state.history.map(r => r.max));
    ui.summaryCards.innerHTML = `<div class="summary-card"><strong>${pct}%</strong><span>eerste keer goed</span></div><div class="summary-card"><strong>${avgSeconds}s</strong><span>gem. antwoordtijd</span></div><div class="summary-card"><strong>1–${maxReached}</strong><span>hoogste bereik</span></div>`;
    ui.amountResults.innerHTML = '';
    const maxAmount = Math.max(...state.history.map(r => r.amount));
    for (let n = 1; n <= maxAmount; n++) {
      const rows = state.history.filter(r => r.amount === n);
      if (!rows.length) continue;
      const row = document.createElement('div'); row.className = 'amount-row'; row.innerHTML = `<span>${n}</span><span>${rows.filter(r => r.correct).length}/${rows.length}</span>`; ui.amountResults.appendChild(row);
    }
    ui.teacherAdvice.textContent = buildTeacherAdvice();
  }

  function buildTeacherAdvice() {
    const sixRows = state.history.filter(r => r.amount >= 5 && r.amount <= 6);
    const lowRows = state.history.filter(r => r.amount <= 4);
    if (sixRows.length >= 3 && sixRows.filter(r => r.correct).length / sixRows.length >= .8) {
      return settings.maxLevel > 6 ? 'Advies: hoeveelheden 5–6 worden op eerste poging vaak goed herkend. De plusuitdaging 7–9 kan zinvol zijn, maar blijf daarbij werken met zichtbare groepjes.' : 'Advies: 5–6 lijken stevig genoeg om vaker gemengd aan te bieden. Verhoog het maximum alleen als je ook de plusuitdaging wilt oefenen.';
    }
    if (lowRows.length >= 4 && lowRows.filter(r => r.correct).length / lowRows.length < .7) return 'Advies: blijf voorlopig bij 1–3 of 1–4. Geef vooral korte flitsen met vaste, overzichtelijke patronen en laat na een fout de hoeveelheid gegroepeerd terugzien.';
    return 'Advies: nog geen sterke reden om het bereik te verhogen. Laat het kind eerst meerdere sessies vlot en betrouwbaar antwoorden op het huidige niveau.';
  }

  function average(values) { return values.length ? values.reduce((a,b) => a+b, 0) / values.length : Infinity; }

  function buildCalibrationButtons() {
    ui.calibrationDigits.innerHTML = '';
    for (let n = 1; n <= 9; n++) {
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'calibration-digit'; btn.textContent = String(n); btn.dataset.digit = String(n); btn.addEventListener('click', () => beginCalibration(n)); ui.calibrationDigits.appendChild(btn);
    }
    updateCalibrationUI();
  }

  function beginCalibration(digit) {
    calibrationTarget = digit; calibrationSamples = []; updateCalibrationUI();
    ui.calibrationInstruction.textContent = `Cijfer ${digit}: zet het houten cijfer 3 keer rustig op het scherm. Poging 1 van 3.`;
  }

  function resetCalibration() {
    calibration = {}; calibrationTarget = null; calibrationSamples = []; saveJSON(CALIBRATION_KEY, calibration); updateCalibrationUI();
    ui.calibrationInstruction.textContent = 'Kalibratie gewist. Tik op een cijfer om opnieuw te beginnen.';
  }

  function updateCalibrationUI() {
    const complete = calibratedDigits(); ui.calibrationBadge.textContent = `${complete.length}/9`;
    [...ui.calibrationDigits.children].forEach(btn => {
      const d = Number(btn.dataset.digit); btn.classList.toggle('complete', !!calibration[d]); btn.classList.toggle('active', calibrationTarget === d);
    });
  }

  function calibratedDigits() { return Object.keys(calibration).map(Number).filter(n => calibration[n] && Array.isArray(calibration[n].signature)); }
  function hasCalibrationThrough(max) { for (let n = 1; n <= max; n++) if (!calibration[n] || !Array.isArray(calibration[n].signature)) return false; return true; }

  function handlePhysicalTouchStart(event) {
    if (event.touches.length < 3 || touchLocked) return;
    event.preventDefault(); touchLocked = true;
    const points = Array.from(event.touches).slice(0, 3).map(t => ({ x: t.clientX, y: t.clientY }));
    const signature = triangleSignature(points);
    if (!signature) return;
    if (ui.teacherDialog.open && calibrationTarget) { captureCalibration(signature); return; }
    if (ui.teacherDialog.open) return;
    if (state.running && settings.marbotic && !state.answered && !ui.answerArea.classList.contains('hidden')) {
      const match = matchCalibration(signature);
      if (match) { flashTouchStatus(`Cijfer ${match.digit} herkend`); submitAnswer(match.digit, 'marbotic'); }
      else { flashTouchStatus('Cijfer niet herkend – probeer opnieuw'); tone('softWrong'); }
    }
  }

  function handlePhysicalTouchEnd(event) { if (event.touches.length < 3) touchLocked = false; }

  function triangleSignature(points) {
    if (!points || points.length < 3) return null;
    const d = [dist(points[0], points[1]), dist(points[1], points[2]), dist(points[2], points[0])].sort((a,b) => a-b);
    if (d[0] < 8) return null;
    const area = Math.abs(points[0].x * (points[1].y - points[2].y) + points[1].x * (points[2].y - points[0].y) + points[2].x * (points[0].y - points[1].y)) / 2;
    return [round4(d[1] / d[0]), round4(d[2] / d[0]), round4(area / (d[0] * d[0]))];
  }

  function captureCalibration(signature) {
    calibrationSamples.push(signature); tone('calibrate');
    if (calibrationSamples.length < 3) {
      ui.calibrationInstruction.textContent = `Cijfer ${calibrationTarget}: goed. Til op en plaats opnieuw. Poging ${calibrationSamples.length + 1} van 3.`; return;
    }
    const center = [0,1,2].map(i => median(calibrationSamples.map(s => s[i])));
    const spread = Math.max(...calibrationSamples.map(s => vectorDistance(s, center)));
    calibration[calibrationTarget] = { signature: center, spread: round4(spread), samples: calibrationSamples };
    saveJSON(CALIBRATION_KEY, calibration);
    ui.calibrationInstruction.textContent = `Cijfer ${calibrationTarget} opgeslagen. Kies het volgende cijfer.`;
    calibrationTarget = null; calibrationSamples = []; updateCalibrationUI();
  }

  function matchCalibration(signature) {
    const entries = calibratedDigits().map(digit => {
      const rec = calibration[digit]; return { digit, distance: vectorDistance(signature, rec.signature), spread: Number(rec.spread || 0) };
    }).sort((a,b) => a.distance - b.distance);
    if (!entries.length) return null;
    const best = entries[0], second = entries[1];
    const threshold = Math.max(.075, best.spread * 2.8 + .025);
    const margin = second ? second.distance - best.distance : .2;
    return best.distance <= threshold && margin >= .012 ? best : null;
  }

  function dist(a,b) { return Math.hypot(a.x-b.x, a.y-b.y); }
  function vectorDistance(a,b) { return Math.sqrt(a.reduce((sum, v, i) => sum + Math.pow(v - b[i], 2), 0)); }
  function median(values) { const s=[...values].sort((a,b)=>a-b); return s[Math.floor(s.length/2)]; }
  function round4(n) { return Math.round(n * 10000) / 10000; }

  function flashTouchStatus(text) {
    ui.touchStatus.textContent = text; ui.touchStatus.classList.remove('hidden'); clearTimeout(flashTouchStatus.timer);
    flashTouchStatus.timer = setTimeout(() => ui.touchStatus.classList.add('hidden'), 1300);
  }

  function unlockAudio() {
    try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); } catch (_) {}
  }

  function tone(type) {
    if (!audioCtx) return;
    const map = { ready: [[520,.05,.055]], correct: [[620,.05,.08],[780,.11,.09],[980,.19,.12]], softWrong: [[330,.03,.08],[290,.12,.07]], calibrate: [[700,.04,.07],[860,.1,.08]], finish: [[520,.04,.08],[660,.12,.08],[820,.2,.1],[1040,.3,.12]] };
    const notes = map[type] || [], start = audioCtx.currentTime + .01;
    notes.forEach(([freq, delay, dur]) => {
      const osc = audioCtx.createOscillator(), gain = audioCtx.createGain(); osc.type = 'sine'; osc.frequency.value = freq;
      gain.gain.setValueAtTime(.0001, start + delay); gain.gain.exponentialRampToValueAtTime(.08, start + delay + .015); gain.gain.exponentialRampToValueAtTime(.0001, start + delay + dur);
      osc.connect(gain); gain.connect(audioCtx.destination); osc.start(start + delay); osc.stop(start + delay + dur + .03);
    });
  }

  function speak(text) {
    if (!settings.speech || !('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel(); const utter = new SpeechSynthesisUtterance(text); utter.lang = 'nl-NL'; utter.rate = .93; utter.pitch = 1.08;
      const dutch = speechSynthesis.getVoices().find(v => /^nl(-|_)/i.test(v.lang)); if (dutch) utter.voice = dutch; speechSynthesis.speak(utter);
    } catch (_) {}
  }

  function createBackgroundBubbles() {
    ui.bubbleField.innerHTML = '';
    for (let i = 0; i < 18; i++) {
      const b = document.createElement('span'); b.className = 'bg-bubble'; const size = 10 + Math.random() * 42;
      b.style.width = `${size}px`; b.style.height = `${size}px`; b.style.left = `${Math.random() * 100}%`;
      b.style.setProperty('--dur', `${10 + Math.random() * 16}s`); b.style.setProperty('--delay', `${-Math.random() * 20}s`); b.style.setProperty('--drift', `${-50 + Math.random() * 100}px`); b.style.opacity = (.15 + Math.random() * .35).toFixed(2);
      ui.bubbleField.appendChild(b);
    }
  }

  function drawDecorativeFish(container) {
    container.innerHTML = `<svg viewBox="0 0 300 180" width="100%" height="100%" aria-hidden="true"><defs><linearGradient id="finishGradient" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#5bd9ff"/><stop offset=".28" stop-color="#56dfb6"/><stop offset=".55" stop-color="#ffe069"/><stop offset=".8" stop-color="#ff91bd"/><stop offset="1" stop-color="#9579ec"/></linearGradient></defs><path d="M66 93C36 69 26 46 30 24c29 5 50 17 65 34 25-22 56-33 91-30 42 4 70 29 75 62-7 38-38 62-81 64-34 1-62-10-84-31-17 17-39 28-66 32-3-22 9-43 36-62Z" fill="url(#finishGradient)"/><ellipse cx="197" cy="77" rx="11" ry="13" fill="#fff"/><circle cx="200" cy="78" r="5" fill="#17364d"/><path d="M219 104c12 7 20 7 29 0" fill="none" stroke="#17364d" stroke-width="5" stroke-linecap="round"/><g fill="#fff" stroke="#fff8" stroke-width="2"><circle cx="109" cy="80" r="12"/><circle cx="137" cy="68" r="12"/><circle cx="140" cy="97" r="12"/><circle cx="168" cy="83" r="12"/><circle cx="113" cy="111" r="12"/><circle cx="170" cy="113" r="12"/></g></svg>`;
  }

  init();
})();
