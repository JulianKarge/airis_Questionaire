import { db } from './firebase-config.js';
import { collection, getDocs, orderBy, query } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// ── i18n ──────────────────────────────────────────────────────────────────────
const T = {
  en: {
    langToggle: 'Deutsch',
    title: 'Study Results',
    loading: 'Loading responses…',
    noData: 'No responses found yet.',
    exportCSV: '⬇ Export CSV',
    susOverview: 'SUS Score Overview',
    susComp: 'SUS — Per Question Comparison (A vs B)',
    ueqOverview: 'UEQ — Mean Scores per Item (A vs B)',
    ueqScales: 'UEQ Scale Scores (A vs B)',
    participants: 'All Participants',
    susALabel: 'Prototype A — SUS Score Distribution',
    susBLabel: 'Prototype B — SUS Score Distribution',
    ueqNote: 'Scale 1–7. Mean response per item across all participants.',
    mean: 'Mean', median: 'Median', min: 'Min', max: 'Max',
    participantsBadge: (n) => `${n} participant${n !== 1 ? 's' : ''}`,
    tableHeaders: ['#','Name','Occupation','Experience','Language','Started With','SUS A','Grade A','SUS B','Grade B','Comp Q1','Comp Q2','Comp Q3','Date'],
    susGrades: { excellent:'Excellent', good:'Good', ok:'OK', poor:'Poor' },
    expLabels: { none:'None', beginner:'Beginner', intermediate:'Intermediate', advanced:'Advanced', expert:'Expert' },
    filterAll: 'All Languages',
    allExp: 'All Experience',
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
    ueqScaleNames: ['Attractiveness','Perspicuity','Efficiency','Dependability','Stimulation','Novelty']
  },
  de: {
    langToggle: 'English',
    title: 'Studienergebnisse',
    loading: 'Antworten werden geladen…',
    noData: 'Noch keine Antworten vorhanden.',
    exportCSV: '⬇ CSV exportieren',
    susOverview: 'SUS-Score Übersicht',
    susComp: 'SUS — Vergleich je Frage (A vs B)',
    ueqOverview: 'UEQ — Mittelwerte je Item (A vs B)',
    ueqScales: 'UEQ-Skalenwerte (A vs B)',
    participants: 'Alle Teilnehmer',
    susALabel: 'Prototyp A — SUS-Score Verteilung',
    susBLabel: 'Prototyp B — SUS-Score Verteilung',
    ueqNote: 'Skala 1–7. Mittelwert pro Item über alle Teilnehmer.',
    mean: 'Mittelwert', median: 'Median', min: 'Min', max: 'Max',
    participantsBadge: (n) => `${n} Teilnehmer${n !== 1 ? '' : ''}`,
    tableHeaders: ['#','Name','Beruf','Erfahrung','Sprache','Begonnen mit','SUS A','Note A','SUS B','Note B','Vgl. F1','Vgl. F2','Vgl. F3','Datum'],
    susGrades: { excellent:'Ausgezeichnet', good:'Gut', ok:'OK', poor:'Schlecht' },
    expLabels: { none:'Keine', beginner:'Anfänger', intermediate:'Mittel', advanced:'Fortgeschritten', expert:'Experte' },
    filterAll: 'Alle Sprachen',
    allExp: 'Alle Erfahrungen',
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
    ueqScaleNames: ['Attraktivität','Durchschaubarkeit','Effizienz','Verlässlichkeit','Stimulation','Originalität']
  }
};

// UEQ scale item indices (0-based) for the 6 UEQ scales
// Based on standard UEQ item mapping
const UEQ_SCALES = {
  Attractiveness:  [0,11,13,15,23,24],   // items 1,12,14,16,24,25
  Perspicuity:     [1,3,12,20],           // items 2,4,13,21
  Efficiency:      [8,19,21,22],          // items 9,20,22,23
  Dependability:   [7,10,16,18],          // items 8,11,17,19
  Stimulation:     [5,6,14,25],           // items 6,7,15,26
  Novelty:         [2,9,14,25]            // items 3,10,15,26
};

// ── State ─────────────────────────────────────────────────────────────────────
let lang = 'en';
let allData = [];
let charts = {};

const $ = id => document.getElementById(id);
const t = () => T[lang];

// ── Boot ──────────────────────────────────────────────────────────────────────
async function boot() {
  updateUIText();
  $('langToggleBtn').addEventListener('click', () => {
    lang = lang === 'en' ? 'de' : 'en';
    document.getElementById('htmlRoot').lang = lang;
    updateUIText();
    applyFilters();
  });

  $('filterLang').addEventListener('change', applyFilters);
  $('filterExp').addEventListener('change', applyFilters);
  $('exportAllBtn').addEventListener('click', exportAll);

  try {
    const q = query(collection(db, 'responses'), orderBy('timestamp', 'desc'));
    const snap = await getDocs(q);
    allData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    $('loadingState').style.display = 'none';

    if (allData.length === 0) {
      $('loadingState').style.display = 'block';
      $('loadingState').querySelector('p').textContent = t().noData;
      return;
    }

    $('resultsContent').style.display = 'block';
    applyFilters();
  } catch (err) {
    console.error(err);
    $('loadingState').querySelector('p').textContent = 'Error loading data. Check Firebase config.';
  }
}

function updateUIText() {
  const l = t();
  $('langToggleBtn').textContent = l.langToggle;
  $('resultsTitle').textContent = l.title;
  $('loadingText').textContent = l.loading;
  $('exportAllBtn').textContent = l.exportCSV;
  $('susOverviewLabel').textContent = l.susOverview;
  $('susCompLabel').textContent = l.susComp;
  $('ueqOverviewLabel').textContent = l.ueqOverview;
  $('ueqScalesLabel').textContent = l.ueqScales;
  $('participantsLabel').textContent = l.participants;
  $('susALabel').textContent = l.susALabel;
  $('susBLabel').textContent = l.susBLabel;
  $('ueqNote').textContent = l.ueqNote;
}

// ── Filter & render ───────────────────────────────────────────────────────────
function applyFilters() {
  const filterLang = $('filterLang').value;
  const filterExp  = $('filterExp').value;

  let filtered = allData;
  if (filterLang !== 'all') filtered = filtered.filter(d => d.lang === filterLang);
  if (filterExp  !== 'all') filtered = filtered.filter(d => d.participant?.experience === filterExp);

  $('participantCount').textContent = t().participantsBadge(filtered.length);
  renderCharts(filtered);
  renderTable(filtered);
}

// ── Charts ────────────────────────────────────────────────────────────────────
const GREEN = '#01A982';
const NAVY  = '#263040';
const BLUE  = '#00739D';
const LIGHT_GREEN = 'rgba(1,169,130,0.15)';
const LIGHT_BLUE  = 'rgba(0,115,157,0.15)';

function destroyChart(key) {
  if (charts[key]) { charts[key].destroy(); delete charts[key]; }
}

function renderCharts(data) {
  if (data.length === 0) return;

  const susA = data.map(d => d.prototypeA?.susScore ?? 0);
  const susB = data.map(d => d.prototypeB?.susScore ?? 0);

  // SUS Distribution A
  destroyChart('susA');
  charts.susA = new Chart($('chartSUSA'), {
    type: 'bar',
    data: {
      labels: data.map(d => d.participant?.name || d.id.slice(0,6)),
      datasets: [{
        label: 'SUS Score A',
        data: susA,
        backgroundColor: susA.map(v => v >= 80 ? GREEN : v >= 68 ? BLUE : '#F59E0B'),
        borderRadius: 4
      }]
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100 } } }
  });
  renderScoreSummary('susSummaryA', susA);

  // SUS Distribution B
  destroyChart('susB');
  charts.susB = new Chart($('chartSUSB'), {
    type: 'bar',
    data: {
      labels: data.map(d => d.participant?.name || d.id.slice(0,6)),
      datasets: [{
        label: 'SUS Score B',
        data: susB,
        backgroundColor: susB.map(v => v >= 80 ? GREEN : v >= 68 ? BLUE : '#F59E0B'),
        borderRadius: 4
      }]
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100 } } }
  });
  renderScoreSummary('susSummaryB', susB);

  // SUS Per Question Comparison
  const susAQMeans = Array.from({length:10}, (_,i) => mean(data.map(d => d.prototypeA?.sus?.[i] ?? 0)));
  const susBQMeans = Array.from({length:10}, (_,i) => mean(data.map(d => d.prototypeB?.sus?.[i] ?? 0)));
  destroyChart('susComp');
  charts.susComp = new Chart($('chartSUSComp'), {
    type: 'bar',
    data: {
      labels: Array.from({length:10}, (_,i) => `Q${i+1}`),
      datasets: [
        { label: 'Prototype A', data: susAQMeans, backgroundColor: LIGHT_GREEN, borderColor: GREEN, borderWidth: 2, borderRadius: 3 },
        { label: 'Prototype B', data: susBQMeans, backgroundColor: LIGHT_BLUE,  borderColor: BLUE,  borderWidth: 2, borderRadius: 3 }
      ]
    },
    options: { scales: { y: { min: 1, max: 5, title: { display: true, text: '1–5' } } } }
  });

  // UEQ Item Means
  const ueqAMeans = Array.from({length:26}, (_,i) => mean(data.map(d => d.prototypeA?.ueq?.[i] ?? 0)));
  const ueqBMeans = Array.from({length:26}, (_,i) => mean(data.map(d => d.prototypeB?.ueq?.[i] ?? 0)));
  const ueqLabels = t().ueqPairs.map(([l,r]) => `${l} / ${r}`);
  destroyChart('ueq');
  charts.ueq = new Chart($('chartUEQ'), {
    type: 'bar',
    data: {
      labels: ueqLabels,
      datasets: [
        { label: 'Prototype A', data: ueqAMeans, backgroundColor: LIGHT_GREEN, borderColor: GREEN, borderWidth: 2, borderRadius: 3 },
        { label: 'Prototype B', data: ueqBMeans, backgroundColor: LIGHT_BLUE,  borderColor: BLUE,  borderWidth: 2, borderRadius: 3 }
      ]
    },
    options: {
      indexAxis: 'y',
      scales: { x: { min: 1, max: 7, title: { display: true, text: '1–7' } } },
      plugins: { legend: { position: 'top' } }
    }
  });

  // UEQ Scale Scores
  const scaleNames = t().ueqScaleNames;
  const scaleKeys = Object.keys(UEQ_SCALES);
  const scaleAMeans = scaleKeys.map(k => mean(UEQ_SCALES[k].flatMap(idx => data.map(d => d.prototypeA?.ueq?.[idx] ?? 4))));
  const scaleBMeans = scaleKeys.map(k => mean(UEQ_SCALES[k].flatMap(idx => data.map(d => d.prototypeB?.ueq?.[idx] ?? 4))));
  destroyChart('ueqScales');
  charts.ueqScales = new Chart($('chartUEQScales'), {
    type: 'radar',
    data: {
      labels: scaleNames,
      datasets: [
        { label: 'Prototype A', data: scaleAMeans, backgroundColor: LIGHT_GREEN, borderColor: GREEN, borderWidth: 2, pointBackgroundColor: GREEN },
        { label: 'Prototype B', data: scaleBMeans, backgroundColor: LIGHT_BLUE,  borderColor: BLUE,  borderWidth: 2, pointBackgroundColor: BLUE }
      ]
    },
    options: { scales: { r: { min: 1, max: 7, ticks: { stepSize: 1 } } } }
  });
}

function renderScoreSummary(elId, scores) {
  const l = t();
  const sorted = [...scores].sort((a,b)=>a-b);
  const avg = mean(scores).toFixed(1);
  const med = median(sorted).toFixed(1);
  const mi  = sorted[0]?.toFixed(1) ?? '–';
  const mx  = sorted[sorted.length-1]?.toFixed(1) ?? '–';
  $(elId).innerHTML = `
    <div class="score-chip">${l.mean}: <strong>${avg}</strong></div>
    <div class="score-chip">${l.median}: <strong>${med}</strong></div>
    <div class="score-chip">${l.min}: <strong>${mi}</strong></div>
    <div class="score-chip">${l.max}: <strong>${mx}</strong></div>
  `;
}

// ── Table ─────────────────────────────────────────────────────────────────────
function renderTable(data) {
  const l = t();
  const head = $('tableHead');
  head.innerHTML = l.tableHeaders.map(h => `<th>${h}</th>`).join('');

  const body = $('tableBody');
  if (data.length === 0) {
    body.innerHTML = `<tr><td colspan="${l.tableHeaders.length}" style="text-align:center;color:#6B7280;padding:24px">${l.noData}</td></tr>`;
    return;
  }
  body.innerHTML = data.map((d, idx) => {
    const sA = d.prototypeA?.susScore ?? '–';
    const sB = d.prototypeB?.susScore ?? '–';
    const gradeA = susGrade(sA, l);
    const gradeB = susGrade(sB, l);
    const exp = l.expLabels[d.participant?.experience] || d.participant?.experience || '–';
    const date = d.timestamp?.toDate ? d.timestamp.toDate().toLocaleDateString() : '–';
    const comp = d.comparative || [];
    const started = d.startedWith ? `<span class="sus-grade good">${d.startedWith}</span>` : '–';
    return `<tr>
      <td>${idx+1}</td>
      <td>${d.participant?.name || '–'}</td>
      <td>${d.participant?.occupation || '–'}</td>
      <td>${exp}</td>
      <td>${(d.lang || '–').toUpperCase()}</td>
      <td>${started}</td>
      <td class="sus-score">${sA}</td>
      <td>${gradeA}</td>
      <td class="sus-score">${sB}</td>
      <td>${gradeB}</td>
      <td>${comp[0] ?? '–'}</td>
      <td>${comp[1] ?? '–'}</td>
      <td>${comp[2] ?? '–'}</td>
      <td>${date}</td>
    </tr>`;
  }).join('');
}

function susGrade(score, l) {
  const g = l.susGrades;
  if (score >= 85) return `<span class="sus-grade excellent">${g.excellent}</span>`;
  if (score >= 71) return `<span class="sus-grade good">${g.good}</span>`;
  if (score >= 51) return `<span class="sus-grade ok">${g.ok}</span>`;
  return `<span class="sus-grade poor">${g.poor}</span>`;
}

// ── Export ────────────────────────────────────────────────────────────────────
function exportAll() {
  const filterLang = $('filterLang').value;
  const filterExp  = $('filterExp').value;
  let data = allData;
  if (filterLang !== 'all') data = data.filter(d => d.lang === filterLang);
  if (filterExp  !== 'all') data = data.filter(d => d.participant?.experience === filterExp);

  const susHeaders = Array.from({length:10}, (_,i) => `SUS_A_Q${i+1}`).concat(
    Array.from({length:10}, (_,i) => `SUS_B_Q${i+1}`)
  );
  const ueqHeaders = Array.from({length:26}, (_,i) => `UEQ_A_Q${i+1}`).concat(
    Array.from({length:26}, (_,i) => `UEQ_B_Q${i+1}`)
  );
  const headers = ['ID','Timestamp','Language','StartedWith','Name','Occupation','Experience',
    ...susHeaders, 'SUS_Score_A', ...ueqHeaders, 'SUS_Score_B',
    'Comp_Q1','Comp_Q2','Comp_Q3'].join(',');

  const rows = data.map(d => {
    const ts = d.timestamp?.toDate ? d.timestamp.toDate().toISOString() : '';
    const comp = d.comparative || [null, null, null];
    return [
      d.id, ts, d.lang, d.startedWith || '',
      `"${d.participant?.name || ''}"`,
      `"${d.participant?.occupation || ''}"`,
      d.participant?.experience || '',
      ...(d.prototypeA?.sus || new Array(10).fill('')),
      d.prototypeA?.susScore ?? '',
      ...(d.prototypeA?.ueq || new Array(26).fill('')),
      ...(d.prototypeB?.sus || new Array(10).fill('')),
      d.prototypeB?.susScore ?? '',
      ...(d.prototypeB?.ueq || new Array(26).fill('')),
      comp[0] ?? '', comp[1] ?? '', comp[2] ?? ''
    ].join(',');
  });

  const csv = [headers, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `airis-results-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── PNG Download ──────────────────────────────────────────────────────────────
window.downloadChart = function(canvasId, filename) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = filename;
  a.click();
};

// ── Math helpers ──────────────────────────────────────────────────────────────
const mean = arr => arr.length ? arr.reduce((a,b) => a+b, 0) / arr.length : 0;
const median = sorted => {
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[m] : (sorted[m-1] + sorted[m]) / 2;
};

// ── Init ──────────────────────────────────────────────────────────────────────
boot();
