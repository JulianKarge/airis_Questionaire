import { db } from './firebase-config.js';
import {
  collection, addDoc, serverTimestamp,
  getDocs, query, orderBy, limit
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// ── State ─────────────────────────────────────────────────────────────────────
// Steps: 0=lang, 1=details, 2=introFirst, 3=tasksFirst, 4=susFirst, 5=ueqFirst,
//        6=introSecond, 7=tasksSecond, 8=susSecond, 9=ueqSecond, 10=comparative, 11=thanks
const state = {
  lang: 'en',
  step: 0,
  order: ['A', 'B'],
  startedWith: 'A',
  participant: { name: '', occupation: '', experience: '' },
  responses: {
    A: { sus: new Array(10).fill(null), ueq: new Array(26).fill(null) },
    B: { sus: new Array(10).fill(null), ueq: new Array(26).fill(null) },
    comparative: [null, null, null]
  },
  tasks: {
    A: new Array(8).fill(false),
    B: new Array(8).fill(false)
  },
  timers: {
    A: { startMs: null, stopMs: null, durationMs: null, pausedMs: 0, pauseStartMs: null },
    B: { startMs: null, stopMs: null, durationMs: null, pausedMs: 0, pauseStartMs: null }
  },
  submittedId: null
};

const TOTAL_CONTENT_STEPS = 10;
let orderPromise = Promise.resolve();
let timerInterval = null;

// ── i18n ──────────────────────────────────────────────────────────────────────
const T = {
  en: {
    langToggle: 'Deutsch',
    next: 'Next →', back: '← Back', submit: 'Submit Responses',
    required: 'Please complete all questions before continuing.',

    langTitle: 'Welcome to the AIRIS UX Study',
    langSub: 'Please select your preferred language.',

    detailsTitle: 'Participant Details',
    detailsSub: 'Please provide some information about yourself before we begin.',
    nameLabel: 'Full Name *', namePh: 'Your full name',
    occLabel: 'Occupation / Role *', occPh: 'e.g. Software Engineer, UX Designer, Student',
    expLabel: 'UX / Design Experience *',
    expOpts: [
      ['','Select your experience level'],['none','No experience'],
      ['beginner','Beginner (< 1 year)'],['intermediate','Intermediate (1–3 years)'],
      ['advanced','Advanced (3–5 years)'],['expert','Expert (5+ years)']
    ],

    protoNames: { A: 'Prototype A – Simple Chat UI', B: 'Prototype B – Hybrid Chat UI' },
    protoShort: { A: 'Simple Chat UI', B: 'Hybrid Chat UI' },

    // Prototype intro (instructions before tasks)
    protoIntroTitle: (name) => `You will now test: ${name}`,
    protoIntroSub: 'Before you begin interacting with the prototype, please read through the process below.',
    protoIntroSteps: [
      'Read through all the tasks on the next page carefully.',
      'Click <strong>Start Timer</strong> when you are ready to begin interacting with the prototype.',
      'Work through the tasks — you can check them off as you complete them.',
      'When you are finished, click <strong>Stop Timer</strong> and then proceed to the questionnaire.'
    ],
    protoIntroNote: 'The timer measures how long you interact with the prototype. Please start it only when you are ready to begin.',
    understood: 'I understand — Show me the tasks',
    secondPrefix: 'Well done! Now please do the same with the second prototype.',

    // Task page
    tasksTitle: 'Tasks',
    tasksSub: 'Start the timer, complete the tasks in the prototype, then stop the timer when you are done.',
    tasksLabel: 'Task List',
    timerReady: 'Timer ready',
    timerRunning: 'Timer running…',
    timerStopped: 'Timer stopped',
    startTimer: 'Start Timer',
    pauseTimer: '⏸ Pause',
    resumeTimer: '▶ Resume',
    stopTimer: 'Stop Timer',
    timerPaused: 'Timer paused',
    continueToQ: 'Continue to Questionnaire →',
    timerWarning: 'Please stop the timer before continuing.',
    tasks: {
      B: [
        'Build a server configuration: 50 total cores, 1 CPU, 256 GB RAM, 1 server, PUE 1.3',
        'Tell the model: "I want to adjust PUE and RAM." Then increase the RAM to 512 GB and PUE to 1.6',
        'Ask the model what the average PUE value is',
        'Ask the model to change the PUE to that average value',
        'Ask: What is the difference between ARM and x86?',
        'Ask: Tell me about RAID levels',
        'Click the Parameter button, then click "Build with Solution Agent". Build any configuration you like',
        'Ask for the average emission settings for Germany'
      ],
      A: [
        'Build a server configuration: 128 cores per socket, 2 sockets, 512 GB RAM, 3 servers, PUE 1.5',
        'Adjust cores to 64 per socket and delivery time to 60 days',
        'Ask the model what typical electricity costs are for the US',
        'Ask the model to apply those values',
        'Ask: What does ECC memory mean?',
        'Ask: Explain the difference between NVMe and SAS storage',
        'Start a new configuration and ask the model for help',
        'Ask for the average emission settings for Nordic countries'
      ]
    },

    susTitle: 'System Usability Scale',
    susSub: 'Please rate your agreement with the following statements about this prototype.',
    susScaleLabels: ['Strongly\nDisagree','Disagree','Neutral','Agree','Strongly\nAgree'],
    susFootLeft: 'Strongly Disagree', susFootRight: 'Strongly Agree',
    susQuestions: [
      'I think that I would like to use this system frequently.',
      'I found the system unnecessarily complex.',
      'I thought the system was easy to use.',
      'I think that I would need the support of a technical person to be able to use this system.',
      'I found the various functions in this system were well integrated.',
      'I thought there was too much inconsistency in this system.',
      'I would imagine that most people would learn to use this system very quickly.',
      'I found the system very cumbersome to use.',
      'I felt very confident using the system.',
      'I needed to learn a lot of things before I could get going with this system.'
    ],

    ueqTitle: 'User Experience Questionnaire',
    ueqSub: 'For each word pair, select the value (1–7) that best reflects your experience. 1 = most like the left word, 7 = most like the right word.',
    ueqPairs: [
      ['annoying','enjoyable'],['not understandable','understandable'],
      ['creative','dull'],['easy to learn','difficult to learn'],
      ['valuable','inferior'],['boring','exciting'],
      ['not interesting','interesting'],['unpredictable','predictable'],
      ['fast','slow'],['inventive','conventional'],
      ['obstructive','supportive'],['good','bad'],
      ['complicated','easy'],['unlikable','pleasing'],
      ['usual','leading edge'],['unpleasant','pleasant'],
      ['secure','not secure'],['motivating','demotivating'],
      ['meets expectations','does not meet expectations'],['inefficient','efficient'],
      ['clear','confusing'],['impractical','practical'],
      ['organized','cluttered'],['attractive','unattractive'],
      ['friendly','unfriendly'],['conservative','innovative']
    ],

    compTitle: 'Comparative Evaluation',
    compSub: 'Having tested both prototypes, please answer these final comparison questions.',
    compLabel: 'Comparative — 3 items (scale 1–7)',
    compQuestions: [
      { text: 'Which interface would you prefer for your daily server configuration work?',
        leftLabel: 'Strongly prefer\nSimple Chat UI', midLabel: 'No preference',
        rightLabel: 'Strongly prefer\nHybrid Chat UI' },
      { text: 'Which interface made the configuration task feel more efficient?',
        leftLabel: 'Strongly prefer\nSimple Chat UI', midLabel: 'No preference',
        rightLabel: 'Strongly prefer\nHybrid Chat UI' },
      { text: 'I would integrate the interactive version into my OCA server configuration workflow.',
        leftLabel: 'Strongly\ndisagree', midLabel: null, rightLabel: 'Strongly\nagree' }
    ],

    thanksTitle: 'Thank You!',
    thanksSub: 'Your responses have been saved. Thank you for participating in this study.',
    downloadBtn: '⬇ Download My Results (CSV)',
    stepOf: 'Step', of: 'of'
  },

  de: {
    langToggle: 'English',
    next: 'Weiter →', back: '← Zurück', submit: 'Antworten absenden',
    required: 'Bitte beantworten Sie alle Fragen, bevor Sie fortfahren.',

    langTitle: 'Willkommen zur AIRIS UX Studie',
    langSub: 'Bitte wählen Sie Ihre bevorzugte Sprache.',

    detailsTitle: 'Angaben zur Person',
    detailsSub: 'Bitte machen Sie vor Beginn einige Angaben zu Ihrer Person.',
    nameLabel: 'Vollständiger Name *', namePh: 'Ihr vollständiger Name',
    occLabel: 'Beruf / Rolle *', occPh: 'z. B. Software-Ingenieur, UX-Designer, Student',
    expLabel: 'UX / Design Erfahrung *',
    expOpts: [
      ['','Erfahrungsniveau auswählen'],['none','Keine Erfahrung'],
      ['beginner','Anfänger (< 1 Jahr)'],['intermediate','Mittel (1–3 Jahre)'],
      ['advanced','Fortgeschritten (3–5 Jahre)'],['expert','Experte (5+ Jahre)']
    ],

    protoNames: { A: 'Prototyp A – Simple Chat UI', B: 'Prototyp B – Hybrid Chat UI' },
    protoShort: { A: 'Simple Chat UI', B: 'Hybrid Chat UI' },

    protoIntroTitle: (name) => `Sie testen jetzt: ${name}`,
    protoIntroSub: 'Bevor Sie mit dem Prototypen interagieren, lesen Sie bitte den folgenden Ablauf durch.',
    protoIntroSteps: [
      'Lesen Sie alle Aufgaben auf der nächsten Seite sorgfältig durch.',
      'Klicken Sie auf <strong>Timer starten</strong>, wenn Sie bereit sind, mit dem Prototypen zu interagieren.',
      'Bearbeiten Sie die Aufgaben — Sie können sie abhaken, sobald Sie sie erledigt haben.',
      'Wenn Sie fertig sind, klicken Sie auf <strong>Timer stoppen</strong> und fahren Sie dann mit dem Fragebogen fort.'
    ],
    protoIntroNote: 'Der Timer misst, wie lange Sie mit dem Prototypen interagieren. Starten Sie ihn erst, wenn Sie bereit sind zu beginnen.',
    understood: 'Verstanden — Aufgaben anzeigen',
    secondPrefix: 'Gut gemacht! Bitte führen Sie dasselbe nun mit dem zweiten Prototypen durch.',

    tasksTitle: 'Aufgaben',
    tasksSub: 'Starten Sie den Timer, bearbeiten Sie die Aufgaben im Prototypen und stoppen Sie den Timer, wenn Sie fertig sind.',
    tasksLabel: 'Aufgabenliste',
    timerReady: 'Timer bereit',
    timerRunning: 'Timer läuft…',
    timerStopped: 'Timer gestoppt',
    startTimer: 'Timer starten',
    pauseTimer: '⏸ Pausieren',
    resumeTimer: '▶ Fortführen',
    stopTimer: 'Timer stoppen',
    timerPaused: 'Timer pausiert',
    continueToQ: 'Weiter zum Fragebogen →',
    timerWarning: 'Bitte stoppen Sie den Timer, bevor Sie fortfahren.',
    tasks: {
      B: [
        'Erstellen Sie eine Serverkonfiguration: 50 Kerne gesamt, 1 CPU, 256 GB RAM, 1 Server, PUE 1.3',
        'Sage dem Modell: „Ich möchte PUE und RAM anpassen." Erhöhe dann den RAM auf 512 GB und den PUE auf 1.6',
        'Fragen Sie das Modell nach dem durchschnittlichen PUE-Wert',
        'Bitten Sie das Modell, den PUE auf diesen Durchschnittswert zu ändern',
        'Fragen Sie: Was ist der Unterschied zwischen ARM und x86?',
        'Fragen Sie: Erkläre mir RAID-Level',
        'Klicke auf den Parameter-Button und dann auf „Build with Solution Agent". Baue damit eine beliebige Konfiguration',
        'Fragen Sie nach den durchschnittlichen Emissionswerten für Deutschland'
      ],
      A: [
        'Erstellen Sie eine Serverkonfiguration: 128 Kerne pro Socket, 2 Sockets, 512 GB RAM, 3 Server, PUE 1.5',
        'Passen Sie die Kerne auf 64 pro Socket und die Lieferzeit auf 60 Tage an',
        'Fragen Sie das Modell nach typischen Stromkosten für die USA',
        'Bitten Sie das Modell, diese Werte zu übernehmen',
        'Fragen Sie: Was bedeutet ECC-Speicher?',
        'Fragen Sie: Erkläre den Unterschied zwischen NVMe und SAS-Speicher',
        'Starten Sie eine neue Konfiguration und bitten Sie das Modell um Hilfe',
        'Fragen Sie nach den durchschnittlichen Emissionswerten für nordische Länder'
      ]
    },

    susTitle: 'System Usability Scale',
    susSub: 'Bitte bewerten Sie Ihre Zustimmung zu den folgenden Aussagen über diesen Prototypen.',
    susScaleLabels: ['Stimme überhaupt\nnicht zu','Stimme\nnicht zu','Neutral','Stimme\nzu','Stimme\nvöllig zu'],
    susFootLeft: 'Stimme überhaupt nicht zu', susFootRight: 'Stimme völlig zu',
    susQuestions: [
      'Ich denke, dass ich dieses System gerne häufig benutzen würde.',
      'Ich fand das System unnötig komplex.',
      'Ich fand das System einfach zu benutzen.',
      'Ich denke, dass ich die Unterstützung durch eine technische Person benötigen würde, um dieses System benutzen zu können.',
      'Ich fand, dass die verschiedenen Funktionen in diesem System gut integriert waren.',
      'Ich fand, dass es in diesem System zu viele Inkonsistenzen gab.',
      'Ich kann mir vorstellen, dass die meisten Menschen den Umgang mit diesem System sehr schnell lernen würden.',
      'Ich fand das System sehr umständlich zu benutzen.',
      'Ich fühlte mich im Umgang mit dem System sehr sicher.',
      'Ich musste viele Dinge lernen, bevor ich mit diesem System loslegen konnte.'
    ],

    ueqTitle: 'User Experience Questionnaire',
    ueqSub: 'Wählen Sie für jedes Wortpaar den Wert (1–7), der Ihre Erfahrung am besten beschreibt.',
    ueqPairs: [
      ['unerquicklich','angenehm'],['unverständlich','verständlich'],
      ['kreativ','langweilig'],['leicht zu lernen','schwer zu lernen'],
      ['wertvoll','minderwertig'],['langweilig','spannend'],
      ['nicht interessant','interessant'],['unvorhersehbar','vorhersehbar'],
      ['schnell','langsam'],['erfinderisch','konventionell'],
      ['behindernd','unterstützend'],['gut','schlecht'],
      ['kompliziert','einfach'],['unsympathisch','angenehm'],
      ['gewöhnlich','innovativ'],['unangenehm','angenehm'],
      ['sicher','nicht sicher'],['motivierend','demotivierend'],
      ['entspricht den Erwartungen','entspricht nicht den Erwartungen'],
      ['ineffizient','effizient'],['klar','verwirrend'],
      ['unpraktisch','praktisch'],['übersichtlich','unübersichtlich'],
      ['attraktiv','unattraktiv'],['freundlich','unfreundlich'],
      ['konservativ','innovativ']
    ],

    compTitle: 'Vergleichende Bewertung',
    compSub: 'Nachdem Sie beide Prototypen getestet haben, beantworten Sie bitte diese abschließenden Vergleichsfragen.',
    compLabel: 'Vergleich — 3 Items (Skala 1–7)',
    compQuestions: [
      { text: 'Welche Oberfläche würden Sie für Ihre tägliche Serverkonfigurationsarbeit bevorzugen?',
        leftLabel: 'Starke Präferenz\nSimple Chat UI', midLabel: 'Keine Präferenz',
        rightLabel: 'Starke Präferenz\nHybrid Chat UI' },
      { text: 'Mit welcher Oberfläche fühlte sich die Konfigurationsaufgabe effizienter an?',
        leftLabel: 'Starke Präferenz\nSimple Chat UI', midLabel: 'Keine Präferenz',
        rightLabel: 'Starke Präferenz\nHybrid Chat UI' },
      { text: 'Ich würde die interaktive Version in meinen OCA-Serverkonfigurations-Workflow integrieren.',
        leftLabel: 'Stimme überhaupt\nnicht zu', midLabel: null, rightLabel: 'Stimme\nvöllig zu' }
    ],

    thanksTitle: 'Vielen Dank!',
    thanksSub: 'Ihre Antworten wurden erfolgreich gespeichert. Vielen Dank für Ihre Teilnahme.',
    downloadBtn: '⬇ Meine Ergebnisse herunterladen (CSV)',
    stepOf: 'Schritt', of: 'von'
  }
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const t = () => T[state.lang];

function showToast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), 3200);
}

function setProgress(step) {
  const pct = step <= 1 ? 0 : Math.round(((step - 1) / TOTAL_CONTENT_STEPS) * 100);
  $('progressFill').style.width = pct + '%';
  const info = $('stepInfo');
  if (step >= 2 && step <= 10) {
    info.style.display = 'block';
    info.innerHTML = `${t().stepOf} <strong>${step - 1}</strong> ${t().of} ${TOTAL_CONTENT_STEPS}`;
  } else {
    info.style.display = 'none';
  }
}

function calculateSUS(arr) {
  let sum = 0;
  arr.forEach((v, i) => {
    if (v === null) return;
    sum += (i % 2 === 0) ? (v - 1) : (5 - v);
  });
  return +(sum * 2.5).toFixed(1);
}

function formatTime(ms) {
  if (!ms && ms !== 0) return '00:00';
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60).toString().padStart(2, '0');
  const secs = (totalSecs % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

// ── Counterbalancing ──────────────────────────────────────────────────────────
async function determineOrder() {
  try {
    const q = query(collection(db, 'responses'), orderBy('timestamp', 'desc'), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) {
      state.order = ['A', 'B'];
    } else {
      const lastStarted = snap.docs[0].data().startedWith || 'A';
      state.order = lastStarted === 'A' ? ['B', 'A'] : ['A', 'B'];
    }
    state.startedWith = state.order[0];
  } catch (err) {
    console.warn('Could not determine order, defaulting to A→B:', err);
    state.order = ['A', 'B'];
    state.startedWith = 'A';
  }
}

// ── Timer ─────────────────────────────────────────────────────────────────────
function clearTimerInterval() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

function getEffectiveElapsed(proto) {
  const tm = state.timers[proto];
  if (!tm.startMs) return 0;
  const base = (tm.stopMs || Date.now()) - tm.startMs;
  const paused = tm.pausedMs + (tm.pauseStartMs ? Date.now() - tm.pauseStartMs : 0);
  return Math.max(0, base - paused);
}

function startLiveUpdate(proto) {
  clearTimerInterval();
  timerInterval = setInterval(() => {
    const el = $('timerDisplay');
    if (!el) { clearTimerInterval(); return; }
    el.textContent = formatTime(getEffectiveElapsed(proto));
  }, 500);
}

window.startTimer = function(proto) {
  if (state.timers[proto].startMs) return;
  state.timers[proto].startMs = Date.now();
  state.timers[proto].pausedMs = 0;
  state.timers[proto].pauseStartMs = null;

  $('startTimerBtn').disabled = true;
  $('pauseTimerBtn').disabled = false;
  $('stopTimerBtn').disabled = false;
  $('timerStatus').textContent = t().timerRunning;
  $('timerStatus').className = 'timer-status running';
  startLiveUpdate(proto);
};

window.pauseTimer = function(proto) {
  const tm = state.timers[proto];
  if (!tm.startMs || tm.stopMs || tm.pauseStartMs) return;
  clearTimerInterval();
  tm.pauseStartMs = Date.now();

  const el = $('timerDisplay');
  if (el) el.textContent = formatTime(getEffectiveElapsed(proto));

  $('pauseTimerBtn').textContent = t().resumeTimer;
  $('pauseTimerBtn').className = 'btn-timer btn-resume-timer';
  $('pauseTimerBtn').onclick = () => window.resumeTimer(proto);
  $('timerStatus').textContent = t().timerPaused;
  $('timerStatus').className = 'timer-status paused';
};

window.resumeTimer = function(proto) {
  const tm = state.timers[proto];
  if (!tm.pauseStartMs) return;
  tm.pausedMs += Date.now() - tm.pauseStartMs;
  tm.pauseStartMs = null;

  $('pauseTimerBtn').textContent = t().pauseTimer;
  $('pauseTimerBtn').className = 'btn-timer btn-pause-timer';
  $('pauseTimerBtn').onclick = () => window.pauseTimer(proto);
  $('timerStatus').textContent = t().timerRunning;
  $('timerStatus').className = 'timer-status running';
  startLiveUpdate(proto);
};

window.stopTimer = function(proto) {
  const tm = state.timers[proto];
  if (!tm.startMs || tm.stopMs) return;
  // Settle any active pause before stopping
  if (tm.pauseStartMs) {
    tm.pausedMs += Date.now() - tm.pauseStartMs;
    tm.pauseStartMs = null;
  }
  clearTimerInterval();
  tm.stopMs = Date.now();
  tm.durationMs = getEffectiveElapsed(proto);

  const el = $('timerDisplay');
  if (el) el.textContent = formatTime(tm.durationMs);

  $('pauseTimerBtn').disabled = true;
  $('stopTimerBtn').disabled = true;
  $('timerStatus').textContent = t().timerStopped;
  $('timerStatus').className = 'timer-status stopped';
  $('continueBtn').disabled = false;
};

window.toggleTask = function(proto, idx, checked) {
  state.tasks[proto][idx] = checked;
  const item = document.getElementById(`taskItem${proto}${idx}`);
  if (item) item.classList.toggle('done', checked);
};

// ── Renderers ─────────────────────────────────────────────────────────────────
function renderLangSelect() {
  $('langToggleBtn').style.display = 'none';
  return `
    <div class="lang-screen">
      <div class="card" style="max-width:480px;width:100%;text-align:center">
        <div style="width:52px;height:52px;background:#01A982;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:20px;margin:0 auto 16px">AI</div>
        <h1 style="font-size:24px;color:#263040;margin-bottom:8px">Welcome / Willkommen</h1>
        <p style="color:#6B7280;margin-bottom:28px">AIRIS UX Study<br><small>Please select your language / Bitte wählen Sie Ihre Sprache</small></p>
        <div class="lang-btns">
          <button class="lang-btn-lg" onclick="selectLang('en')">🇬🇧 English</button>
          <button class="lang-btn-lg" onclick="selectLang('de')">🇩🇪 Deutsch</button>
        </div>
      </div>
    </div>`;
}

function renderDetails() {
  const l = t(), p = state.participant;
  return `
    <div class="card">
      <div class="card-header"><h2>${l.detailsTitle}</h2><p>${l.detailsSub}</p></div>
      <div class="form-group">
        <label>${l.nameLabel}</label>
        <input id="f-name" type="text" placeholder="${l.namePh}" value="${p.name}" />
      </div>
      <div class="form-group">
        <label>${l.occLabel}</label>
        <input id="f-occ" type="text" placeholder="${l.occPh}" value="${p.occupation}" />
      </div>
      <div class="form-group">
        <label>${l.expLabel}</label>
        <select id="f-exp">
          ${l.expOpts.map(([v,lbl]) =>
            `<option value="${v}"${p.experience===v?' selected':''}>${lbl}</option>`
          ).join('')}
        </select>
      </div>
      <div class="nav-row nav-row-right">
        <button class="btn btn-primary btn-lg" onclick="nextStep()">${l.next}</button>
      </div>
    </div>`;
}

function renderProtoIntro(proto, isSecond) {
  const l = t();
  const name = l.protoNames[proto];
  const steps = l.protoIntroSteps.map((s, i) =>
    `<div class="intro-step"><div class="intro-step-num">${i+1}</div><div>${s}</div></div>`
  ).join('');
  return `
    <div class="card">
      ${isSecond ? `<p class="second-prefix">${l.secondPrefix}</p>` : ''}
      <div class="proto-badge" style="display:inline-block;margin-bottom:12px">${name}</div>
      <h2 style="font-size:20px;color:#263040;margin-bottom:8px">${l.protoIntroTitle(name)}</h2>
      <p style="color:#6B7280;margin-bottom:24px">${l.protoIntroSub}</p>
      <div class="intro-steps">${steps}</div>
      <div class="intro-note">ℹ ${l.protoIntroNote}</div>
      <div class="nav-row" style="${isSecond ? '' : 'justify-content:flex-end'}">
        ${isSecond ? `<button class="btn btn-secondary" onclick="prevStep()">${l.back}</button>` : ''}
        <button class="btn btn-primary btn-lg" onclick="nextStep()">${l.understood}</button>
      </div>
    </div>`;
}

function renderTasks(proto) {
  const l = t();
  const timer = state.timers[proto];
  const stopped = timer.durationMs !== null;
  const started = timer.startMs !== null;
  const timeDisplay = stopped
    ? formatTime(timer.durationMs)
    : (started ? formatTime(Date.now() - timer.startMs) : '00:00');
  const paused = timer.pauseStartMs !== null;
  const statusText = stopped ? l.timerStopped : (paused ? l.timerPaused : (started ? l.timerRunning : l.timerReady));
  const statusClass = stopped ? 'stopped' : (paused ? 'paused' : (started ? 'running' : ''));

  const taskItems = l.tasks[proto].map((task, i) => {
    const checked = state.tasks[proto][i];
    return `<div class="task-item${checked?' done':''}" id="taskItem${proto}${i}">
      <input type="checkbox" id="task${proto}${i}" ${checked?'checked':''}
        onchange="toggleTask('${proto}',${i},this.checked)" />
      <label for="task${proto}${i}">${i+1}. ${task}</label>
    </div>`;
  }).join('');

  return `
    <div class="card">
      <div class="card-header">
        <div class="proto-badge" style="display:inline-block;margin-bottom:10px">${l.protoNames[proto]}</div>
        <h2>${l.tasksTitle}</h2>
        <p>${l.tasksSub}</p>
      </div>

      <div class="timer-panel">
        <div class="timer-left">
          <div class="timer-display" id="timerDisplay">${timeDisplay}</div>
          <div class="timer-status ${statusClass}" id="timerStatus">${statusText}</div>
        </div>
        <div class="timer-buttons">
          <button class="btn-timer btn-start-timer" id="startTimerBtn"
            ${started ? 'disabled' : ''} onclick="startTimer('${proto}')">
            ▶ ${l.startTimer}
          </button>
          <button class="btn-timer ${paused ? 'btn-resume-timer' : 'btn-pause-timer'}" id="pauseTimerBtn"
            ${!started || stopped ? 'disabled' : ''}
            onclick="${paused ? `resumeTimer('${proto}')` : `pauseTimer('${proto}')`}">
            ${paused ? l.resumeTimer : l.pauseTimer}
          </button>
          <button class="btn-timer btn-stop-timer" id="stopTimerBtn"
            ${!started || stopped ? 'disabled' : ''} onclick="stopTimer('${proto}')">
            ■ ${l.stopTimer}
          </button>
        </div>
      </div>

      <div class="notepad">
        <div class="notepad-title">${l.tasksLabel}</div>
        ${taskItems}
      </div>

      <div class="nav-row">
        <button class="btn btn-secondary" onclick="prevStep()">${l.back}</button>
        <button class="btn btn-primary" id="continueBtn"
          ${!stopped ? 'disabled' : ''} onclick="nextStep()">
          ${l.continueToQ}
        </button>
      </div>
    </div>`;
}

function renderSUS(proto) {
  const l = t();
  const saved = state.responses[proto].sus;
  const rows = l.susQuestions.map((q, i) => {
    const radios = [1,2,3,4,5].map(v => {
      const checked = saved[i] === v ? 'checked' : '';
      return `<label class="likert-cell">
        <span>${l.susScaleLabels[v-1].replace('\n','<br>')}</span>
        <input type="radio" name="sus${proto}${i}" value="${v}" ${checked}
          onchange="saveSUS('${proto}',${i},${v})" />
      </label>`;
    }).join('');
    return `<div class="sus-item">
      <p class="q-text"><span class="q-num">${i+1}.</span>${q}</p>
      <div class="likert-row">${radios}</div>
    </div>`;
  }).join('');
  return `
    <div class="card">
      <div class="card-header">
        <div class="proto-badge" style="display:inline-block;margin-bottom:10px">${l.protoNames[proto]}</div>
        <h2>${l.susTitle}</h2><p>${l.susSub}</p>
      </div>
      <div class="section-label">SUS — 10 items</div>
      ${rows}
      <div class="nav-row">
        <button class="btn btn-secondary" onclick="prevStep()">${l.back}</button>
        <button class="btn btn-primary" onclick="nextStep()">${l.next}</button>
      </div>
    </div>`;
}

function renderUEQ(proto) {
  const l = t();
  const saved = state.responses[proto].ueq;
  const rows = l.ueqPairs.map(([left, right], i) => {
    const radios = [1,2,3,4,5,6,7].map(v => {
      const checked = saved[i] === v ? 'checked' : '';
      return `<label>
        <input type="radio" name="ueq${proto}${i}" value="${v}" ${checked}
          onchange="saveUEQ('${proto}',${i},${v})" />
        <span>${v}</span>
      </label>`;
    }).join('');
    return `<div class="ueq-item">
      <div class="ueq-left">${left}</div>
      <div class="ueq-scale">${radios}</div>
      <div class="ueq-right">${right}</div>
    </div>`;
  }).join('');
  return `
    <div class="card">
      <div class="card-header">
        <div class="proto-badge" style="display:inline-block;margin-bottom:10px">${l.protoNames[proto]}</div>
        <h2>${l.ueqTitle}</h2><p>${l.ueqSub}</p>
      </div>
      <div class="section-label">UEQ — 26 items</div>
      ${rows}
      <div class="nav-row">
        <button class="btn btn-secondary" onclick="prevStep()">${l.back}</button>
        <button class="btn btn-primary" onclick="nextStep()">${l.next}</button>
      </div>
    </div>`;
}

function renderComparative() {
  const l = t();
  const saved = state.responses.comparative;
  const items = l.compQuestions.map((q, i) => {
    const radios = [1,2,3,4,5,6,7].map(v => {
      const checked = saved[i] === v ? 'checked' : '';
      return `<label class="comp-radio">
        <input type="radio" name="comp${i}" value="${v}" ${checked}
          onchange="saveComp(${i},${v})" />
        <span>${v}</span>
      </label>`;
    }).join('');
    return `<div class="comp-item">
      <p class="q-text"><span class="q-num">${i+1}.</span>${q.text}</p>
      <div class="comp-scale">
        <div class="comp-radios">${radios}</div>
        <div class="comp-anchors">
          <span class="anchor-left">${q.leftLabel.replace('\n','<br>')}</span>
          ${q.midLabel ? `<span class="anchor-mid">${q.midLabel}</span>` : '<span></span>'}
          <span class="anchor-right">${q.rightLabel.replace('\n','<br>')}</span>
        </div>
      </div>
    </div>`;
  }).join('');
  return `
    <div class="card">
      <div class="card-header"><h2>${l.compTitle}</h2><p>${l.compSub}</p></div>
      <div class="section-label">${l.compLabel}</div>
      ${items}
      <div class="nav-row">
        <button class="btn btn-secondary" onclick="prevStep()">${l.back}</button>
        <button class="btn btn-primary btn-lg" onclick="submitResponses()">${l.submit}</button>
      </div>
    </div>`;
}

function renderThanks() {
  const l = t();
  const tA = state.timers.A.durationMs;
  const tB = state.timers.B.durationMs;
  return `
    <div class="card">
      <div class="thanks-screen">
        <div class="check-icon">✓</div>
        <h2>${l.thanksTitle}</h2>
        <p>${l.thanksSub}</p>
        ${tA || tB ? `
        <div class="time-summary">
          <div class="time-chip"><span>${l.protoNames[state.order[0]]}</span><strong>${formatTime(tA || tB)}</strong></div>
          <div class="time-chip"><span>${l.protoNames[state.order[1]]}</span><strong>${formatTime(tB || tA)}</strong></div>
        </div>` : ''}
        <button class="btn btn-primary btn-lg" onclick="downloadCSV()">${l.downloadBtn}</button>
      </div>
    </div>`;
}

// ── Render dispatcher ─────────────────────────────────────────────────────────
function render() {
  const { step, order } = state;
  setProgress(step);
  $('langToggleBtn').textContent = t().langToggle;
  $('langToggleBtn').style.display = step === 0 ? 'none' : '';

  let html = '';
  switch (step) {
    case 0:  html = renderLangSelect(); break;
    case 1:  html = renderDetails(); break;
    case 2:  html = renderProtoIntro(order[0], false); break;
    case 3:  html = renderTasks(order[0]); break;
    case 4:  html = renderSUS(order[0]); break;
    case 5:  html = renderUEQ(order[0]); break;
    case 6:  html = renderProtoIntro(order[1], true); break;
    case 7:  html = renderTasks(order[1]); break;
    case 8:  html = renderSUS(order[1]); break;
    case 9:  html = renderUEQ(order[1]); break;
    case 10: html = renderComparative(); break;
    case 11: html = renderThanks(); break;
  }
  $('app').innerHTML = html;
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Restart live timer if returning to a task page mid-session
  const { order: o } = state;
  if (step === 3) resumeLiveTimer(o[0]);
  if (step === 7) resumeLiveTimer(o[1]);
}

function resumeLiveTimer(proto) {
  const timer = state.timers[proto];
  // Restart live update only if running (not paused, not stopped)
  if (timer.startMs && !timer.stopMs && !timer.pauseStartMs) {
    startLiveUpdate(proto);
  }
}

// ── Navigation ────────────────────────────────────────────────────────────────
window.selectLang = function(lang) {
  state.lang = lang;
  document.getElementById('htmlRoot').lang = lang;
  orderPromise = determineOrder();
  state.step = 1;
  render();
};

window.toggleLang = function() {
  state.lang = state.lang === 'en' ? 'de' : 'en';
  document.getElementById('htmlRoot').lang = state.lang;
  render();
};

window.prevStep = function() {
  clearTimerInterval();
  if (state.step > 1) { state.step--; render(); }
};

window.nextStep = async function() {
  if (!validateStep()) return;
  clearTimerInterval();
  if (state.step === 1) {
    $('app').innerHTML = '<div style="text-align:center;padding:48px"><div class="spinner"></div></div>';
    await orderPromise;
  }
  if (state.step < 11) { state.step++; render(); }
};

// ── Validation ────────────────────────────────────────────────────────────────
function validateStep() {
  const { step, order } = state;
  if (step === 1) {
    const name = $('f-name').value.trim();
    const occ  = $('f-occ').value.trim();
    const exp  = $('f-exp').value;
    if (!name || !occ || !exp) { showToast(t().required); return false; }
    state.participant = { name, occupation: occ, experience: exp };
    return true;
  }
  if (step === 3) {
    if (!state.timers[order[0]].durationMs) { showToast(t().timerWarning); return false; }
    return true;
  }
  if (step === 4)  return validateSUS(order[0]);
  if (step === 5)  return validateUEQ(order[0]);
  if (step === 7) {
    if (!state.timers[order[1]].durationMs) { showToast(t().timerWarning); return false; }
    return true;
  }
  if (step === 8)  return validateSUS(order[1]);
  if (step === 9)  return validateUEQ(order[1]);
  if (step === 10) return validateComparative();
  return true;
}

function validateSUS(proto) {
  if (state.responses[proto].sus.some(v => v === null)) { showToast(t().required); return false; }
  return true;
}
function validateUEQ(proto) {
  if (state.responses[proto].ueq.some(v => v === null)) { showToast(t().required); return false; }
  return true;
}
function validateComparative() {
  if (state.responses.comparative.some(v => v === null)) { showToast(t().required); return false; }
  return true;
}

// ── Response savers ───────────────────────────────────────────────────────────
window.saveSUS  = (proto, idx, val) => { state.responses[proto].sus[idx] = val; };
window.saveUEQ  = (proto, idx, val) => { state.responses[proto].ueq[idx] = val; };
window.saveComp = (idx, val) => { state.responses.comparative[idx] = val; };

// ── Submit ────────────────────────────────────────────────────────────────────
window.submitResponses = async function() {
  if (!validateComparative()) return;

  const payload = {
    timestamp: serverTimestamp(),
    lang: state.lang,
    startedWith: state.startedWith,
    order: state.order,
    participant: { ...state.participant },
    prototypeA: {
      sus: [...state.responses.A.sus],
      ueq: [...state.responses.A.ueq],
      susScore: calculateSUS(state.responses.A.sus)
    },
    prototypeB: {
      sus: [...state.responses.B.sus],
      ueq: [...state.responses.B.ueq],
      susScore: calculateSUS(state.responses.B.sus)
    },
    comparative: [...state.responses.comparative],
    timings: {
      A: { durationMs: state.timers.A.durationMs, formatted: formatTime(state.timers.A.durationMs) },
      B: { durationMs: state.timers.B.durationMs, formatted: formatTime(state.timers.B.durationMs) }
    }
  };

  try {
    const docRef = await addDoc(collection(db, 'responses'), payload);
    state.submittedId = docRef.id;
    state.step = 11;
    render();
  } catch (err) {
    console.error('Firebase error:', err);
    showToast('Submission failed. Please check your connection and try again.');
  }
};

// ── CSV Export ────────────────────────────────────────────────────────────────
window.downloadCSV = function() {
  const p = state.participant;
  const rA = state.responses.A, rB = state.responses.B, rc = state.responses.comparative;
  const headers = [
    'Timestamp','Language','StartedWith','Name','Occupation','Experience',
    ...Array.from({length:10},(_,i)=>`SUS_A_Q${i+1}`), 'SUS_Score_A',
    ...Array.from({length:26},(_,i)=>`UEQ_A_Q${i+1}`),
    ...Array.from({length:10},(_,i)=>`SUS_B_Q${i+1}`), 'SUS_Score_B',
    ...Array.from({length:26},(_,i)=>`UEQ_B_Q${i+1}`),
    'Comp_Q1','Comp_Q2','Comp_Q3',
    'Time_A_ms','Time_A_formatted','Time_B_ms','Time_B_formatted'
  ].join(',');

  const row = [
    new Date().toISOString(), state.lang, state.startedWith,
    `"${p.name}"`, `"${p.occupation}"`, p.experience,
    ...rA.sus, calculateSUS(rA.sus), ...rA.ueq,
    ...rB.sus, calculateSUS(rB.sus), ...rB.ueq,
    ...rc,
    state.timers.A.durationMs ?? '', formatTime(state.timers.A.durationMs),
    state.timers.B.durationMs ?? '', formatTime(state.timers.B.durationMs)
  ].join(',');

  const csv = headers + '\n' + row;
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `airis-ux-study-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

// ── Init ──────────────────────────────────────────────────────────────────────
$('langToggleBtn').addEventListener('click', window.toggleLang);
render();
