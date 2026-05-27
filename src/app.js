// City Pulse — Application State & Event Binding

var App = window.App = (() => {
  const $ = Render.$;

  // ===== STATE =====
  const state = {
    step: 1,
    industry: null,
    systemPref: 'both',
    persona: null,
    province: null,
    questionIndex: 0,
    answers: {},
    mobility: null,
    cities: [],
    ranked: [],
    sortMode: 'match',
    activeCity: null,
    compare: [],
  };

  // ===== INIT =====
  function init() {
    if (!DataAccess.init()) {
      Render.toast('数据加载失败，请确认 city-pulse-data.js');
      return;
    }
    state.cities = DataAccess.getCities();
    if (!state.cities.length) {
      Render.toast('数据加载失败');
      return;
    }
    Render.renderStepBar();
    Render.renderSystemPrefs(state.systemPref);
    Render.renderIndustries(null);
    Render.renderPersonas(null);
    Render.renderProvinces(null);
    Render.renderQuestion(0, state.answers);
    Render.renderMobility(null);
    bindEvents();
    initTheme();
    Render.setStep(1);
  }

  // ===== EVENT DELEGATION =====
  function bindEvents() {
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') Render.closeDetail(); });
    window.addEventListener('resize', () => Radar.resize());
  }

  function handleClick(e) {
    const target = e.target;

    // System pref
    const syspref = target.closest('[data-syspref]');
    if (syspref) { selectSystemPref(syspref.getAttribute('data-syspref')); return; }

    // Industry
    const industry = target.closest('[data-industry]');
    if (industry) { selectIndustry(+industry.getAttribute('data-industry')); return; }

    // Persona
    const persona = target.closest('[data-persona]');
    if (persona) { selectPersona(persona.getAttribute('data-persona')); return; }

    // Province
    const province = target.closest('[data-province]');
    if (province && !province.disabled) { selectProvince(province.getAttribute('data-province')); return; }

    // Answer
    const answer = target.closest('[data-answer]');
    if (answer) { answerQuestion(answer.getAttribute('data-answer')); return; }

    // Mobility
    const mobility = target.closest('[data-mobility]');
    if (mobility) { selectMobility(mobility.getAttribute('data-mobility')); return; }

    // Navigation buttons
    if (target.id === 'industryNext') { setStep(2); return; }
    if (target.id === 'personaNext') { setStep(3); return; }
    if (target.id === 'provinceNext') { setStep(4); return; }
    if (target.id === 'questionNext') { nextQuestion(); return; }
    if (target.id === 'questionBack') { backQuestion(); return; }
    if (target.id === 'matchBtn') { goMatch(); return; }
    if (target.id === 'modifyBtn' || target.id === 'mobileModify') { returnAssessment(); return; }
    if (target.id === 'sortMatch') { setSortMode('match'); return; }
    if (target.id === 'sortGdp') { setSortMode('gdp'); return; }

    // Back buttons
    const back = target.closest('[data-back]');
    if (back) { setStep(+back.getAttribute('data-back')); return; }

    // City row click (not on buttons)
    const row = target.closest('.city-card-row');
    if (row && !target.closest('.compare-btn') && !target.closest('.detail-btn') && !target.closest('.rank-no')) {
      selectCity(row.getAttribute('data-name'));
      return;
    }
    const rankNo = target.closest('.rank-no');
    if (rankNo) {
      selectCity(rankNo.closest('.city-card-row').getAttribute('data-name'));
      return;
    }

    // Compare button
    const compareBtn = target.closest('[data-compare]');
    if (compareBtn) { toggleCompare(compareBtn.getAttribute('data-compare')); return; }

    // Detail button
    const detailBtn = target.closest('[data-detail]');
    if (detailBtn) { openDetailByName(detailBtn.getAttribute('data-detail')); return; }

    // Rank list item
    const rankRow = target.closest('.rank-row');
    if (rankRow) { selectCity(rankRow.getAttribute('data-name')); return; }
  }

  // ===== NAVIGATION =====
  function scrollToAssessment() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setStep(s) {
    state.step = s;
    Render.setStep(s);
    scrollToAssessment();
  }

  // ===== SELECTIONS =====
  function selectSystemPref(key) {
    state.systemPref = key;
    Render.renderSystemPrefs(key);
  }

  function selectIndustry(id) {
    state.industry = INDUSTRIES.find(i => i.id === id);
    $('industryNext').disabled = false;
    $('industryHint').textContent = '已选择：' + state.industry.name;
    Render.renderIndustries(id);
  }

  function selectPersona(key) {
    state.persona = key;
    $('personaNext').disabled = false;
    Render.renderPersonas(key);
  }

  function selectProvince(key) {
    state.province = key;
    $('provinceNext').disabled = false;
    Render.renderProvinces(key);
  }

  function answerQuestion(key) {
    state.answers[QUESTIONS[state.questionIndex].id] = key;
    Render.renderQuestion(state.questionIndex, state.answers);
  }

  function nextQuestion() {
    if (!state.answers[QUESTIONS[state.questionIndex].id]) return;
    if (state.questionIndex < QUESTIONS.length - 1) {
      state.questionIndex++;
      Render.renderQuestion(state.questionIndex, state.answers);
      scrollToAssessment();
    } else {
      setStep(5);
    }
  }

  function backQuestion() {
    if (state.questionIndex > 0) {
      state.questionIndex--;
      Render.renderQuestion(state.questionIndex, state.answers);
      scrollToAssessment();
    } else {
      setStep(3);
    }
  }

  function selectMobility(key) {
    state.mobility = key;
    $('matchBtn').classList.remove('hidden');
    Render.renderMobility(key);
  }

  // ===== MATCH =====
  function goMatch() {
    if (!state.cities.length) { Render.toast('数据加载失败'); return; }
    if (!state.industry || !state.persona || !state.mobility) { Render.toast('请先完成测评'); return; }
    try {
      state.ranked = Scoring.prepareRanking(state.cities, state);
      state.activeCity = state.ranked[0] ? state.ranked[0].name : null;
      state.compare = [];
      $('assessment').classList.add('hidden');
      $('results').classList.remove('hidden');
      renderResults();
      setTimeout(() => {
        Radar.init($('radarChart'));
        renderRadar();
      }, 50);
    } catch (e) {
      console.error(e);
      Render.toast('匹配计算失败');
    }
  }

  function renderResults() {
    Render.renderSummary(state);
    renderLists();
    renderRadar();
  }

  function renderLists() {
    Render.renderRankList(state.ranked, state.activeCity);
    Render.renderCityCards(state.ranked, state.activeCity, state.compare, state.sortMode);
    $('rankList').querySelectorAll('.rank-row').forEach(row => {
      row.onclick = () => selectCity(row.getAttribute('data-name'));
    });
  }

  function selectCity(name) {
    state.activeCity = name;
    state.compare = [];
    renderLists();
    renderRadar();
    if ($('resultsGrid').classList.contains('detail-open')) {
      Render.openDetail(name, state.ranked, state.persona);
      $('detailInner').scrollTop = 0;
    }
  }

  function toggleCompare(name) {
    const i = state.compare.indexOf(name);
    if (i >= 0) state.compare.splice(i, 1);
    else {
      if (state.compare.length >= 4) { Render.toast('最多对比4座城市'); return; }
      state.compare.push(name);
    }
    state.activeCity = name;
    renderLists();
    renderRadar();
  }

  function setSortMode(mode) {
    if (state.sortMode === mode) return;
    state.sortMode = mode;
    $('sortMatch').classList.toggle('is-active', mode === 'match');
    $('sortGdp').classList.toggle('is-active', mode === 'gdp');
    Scoring.sortRanked(state.ranked, mode);
    renderLists();
    $('rankList').scrollTop = 0;
    $('cityCards').scrollTop = 0;
  }

  function openDetailByName(name) {
    state.activeCity = name;
    renderLists();
    Render.openDetail(name, state.ranked, state.persona);
    $('detailInner').scrollTop = 0;
    renderRadar();
  }

  function closeDetail() {
    Render.closeDetail();
  }

  function returnAssessment() {
    closeDetail();
    $('results').classList.add('hidden');
    $('assessment').classList.remove('hidden');
    setStep(1);
    setTimeout(() => $('assessment').scrollIntoView({ behavior: 'smooth', block: 'start' }), 20);
  }

  function renderRadar() {
    const names = state.compare.length ? state.compare : (state.activeCity ? [state.activeCity] : []);
    const items = names.map(n => state.ranked.find(x => x.name === n)).filter(Boolean);
    Radar.render(items);
  }

  // ===== TEMPERAMENT HELPERS =====
  function temperamentTags() {
    const scores = {};
    for (let i = 0; i < QUESTIONS.length; i++) {
      const q = QUESTIONS[i];
      const k = state.answers[q.id];
      scores[q.dim] = k === 'A' ? 100 : k === 'B' ? 0 : 50;
    }
    return QUESTIONS.map(q => {
      const s = scores[q.dim];
      const label = s >= 50 ? q.a : q.b;
      return { label: label, text: label, score: s, diff: Math.abs(s - 50) };
    }).filter(t => t.score !== 50).sort((a, b) => b.diff - a.diff).slice(0, 3);
  }

  // ===== THEME =====
  function initTheme() {
    const saved = localStorage.getItem('city-pulse-theme');
    if (saved) {
      setTheme(saved);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
    }
    $('themeBtn').onclick = () => {
      const current = document.documentElement.getAttribute('data-theme');
      setTheme(current === 'dark' ? 'light' : 'dark');
    };
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
      if (!localStorage.getItem('city-pulse-theme')) {
        setTheme(e.matches ? 'dark' : 'light');
      }
    });
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('city-pulse-theme', theme);
    if (state.ranked.length) renderRadar();
  }

  return { init, state, temperamentTags, closeDetail, selectCity };
})();

// ===== BOOT =====
document.addEventListener('DOMContentLoaded', () => {
  App.init();
  Radar.loadECharts().then(() => {
    if (App.state.ranked.length) {
      Radar.init(document.getElementById('radarChart'));
    }
  }).catch(() => {});
});
