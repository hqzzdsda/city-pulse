// City Pulse — DOM Rendering

var Render = window.Render = (() => {
  const { esc, round, scoreClass } = {
    esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); },
    round(n) { return Math.round(Scoring.clamp(n)); },
    scoreClass(s) { return s >= 80 ? 'good' : s >= 60 ? 'mid' : 'low'; },
  };

  function $(id) { return document.getElementById(id); }

  // ===== DIMENSION INTERPRETATION =====
  // Returns { text, icon } for a dimension score, using actual indicator values for context
  function dimInterp(dimKey, score, city) {
    const getVal = DataAccess.getVal;
    const s = round(score);
    switch (dimKey) {
      case 'd1': {
        const inc = getVal(city, '人均可支配收入');
        if (s >= 80) return { text: '经济强劲，收入水平领先', icon: '▲' };
        if (s >= 60) return { text: '经济活跃，发展态势良好', icon: '●' };
        if (s >= 40) return { text: '经济体量中等', icon: '●' };
        return { text: '经济基础较薄弱', icon: '▼' };
      }
      case 'd2': {
        const pir = getVal(city, '房价收入比');
        const pirText = pir !== null ? '房价收入比' + pir.toFixed(1) + '倍' : '';
        if (s >= 80) return { text: '住房非常可负担' + (pirText ? '，' + pirText : ''), icon: '▲' };
        if (s >= 60) return { text: '房价适中，压力可控' + (pirText ? '，' + pirText : ''), icon: '●' };
        if (s >= 40) return { text: '房价偏高，有一定压力' + (pirText ? '，' + pirText : ''), icon: '▼' };
        if (s >= 20) return { text: '房价较高，置业压力大' + (pirText ? '，' + pirText : ''), icon: '▼' };
        return { text: '房价极高，置业非常困难' + (pirText ? '，' + pirText : ''), icon: '▼' };
      }
      case 'd3': {
        if (s >= 70) return { text: '商业配套丰富，生活便利度高', icon: '▲' };
        if (s >= 50) return { text: '配套较完善，日常需求可满足', icon: '●' };
        if (s >= 30) return { text: '商业配套一般', icon: '●' };
        return { text: '商业配套较少，便利度有限', icon: '▼' };
      }
      case 'd4': {
        const beds = getVal(city, '每千人医疗卫生机构床位数');
        if (s >= 70) return { text: '医疗资源优质丰富' + (beds ? '，每千人' + beds.toFixed(1) + '张床位' : ''), icon: '▲' };
        if (s >= 50) return { text: '医疗条件较好' + (beds ? '，每千人' + beds.toFixed(1) + '张床位' : ''), icon: '●' };
        if (s >= 30) return { text: '医疗资源一般' + (beds ? '，每千人' + beds.toFixed(1) + '张床位' : ''), icon: '●' };
        return { text: '医疗资源相对不足' + (beds ? '，每千人' + beds.toFixed(1) + '张床位' : ''), icon: '▼' };
      }
      case 'd5': {
        if (s >= 70) return { text: '教育资源优质，高校/基础教育突出', icon: '▲' };
        if (s >= 50) return { text: '教育水平中上', icon: '●' };
        if (s >= 30) return { text: '教育资源一般', icon: '●' };
        return { text: '教育资源相对匮乏', icon: '▼' };
      }
      case 'd6': {
        const pm = getVal(city, '年均PM2.5');
        if (s >= 70) return { text: '环境优良' + (pm ? '，PM2.5仅' + pm + 'μg/m³' : ''), icon: '▲' };
        if (s >= 50) return { text: '环境尚可' + (pm ? '，PM2.5为' + pm + 'μg/m³' : ''), icon: '●' };
        if (s >= 30) return { text: '环境一般' + (pm ? '，PM2.5达' + pm + 'μg/m³' : ''), icon: '▼' };
        return { text: '环境较差' + (pm ? '，PM2.5达' + pm + 'μg/m³' : ''), icon: '▼' };
      }
      case 'd7': {
        const commute = getVal(city, '通勤时耗');
        if (s >= 60) return { text: '交通便利，通勤体验好' + (commute ? '，平均' + commute.toFixed(0) + '分钟' : ''), icon: '▲' };
        if (s >= 45) return { text: '交通条件中等' + (commute ? '，平均' + commute.toFixed(0) + '分钟' : ''), icon: '●' };
        return { text: '通勤压力较大' + (commute ? '，平均' + commute.toFixed(0) + '分钟' : ''), icon: '▼' };
      }
      case 'd8': {
        if (s >= 70) return { text: '财政充裕，公共服务保障好', icon: '▲' };
        if (s >= 50) return { text: '治理基础尚可', icon: '●' };
        if (s >= 30) return { text: '财政压力中等', icon: '●' };
        return { text: '财政压力较大，公共服务受限', icon: '▼' };
      }
      default: return { text: '', icon: '' };
    }
  }

  // Get top strengths and weaknesses for a city
  function cityTags(dims) {
    const keys = ['d1','d2','d3','d4','d5','d6','d7','d8'];
    const labels = { d1:'经济',d2:'住房',d3:'生活',d4:'医疗',d5:'教育',d6:'环境',d7:'交通',d8:'治理' };
    const entries = keys.map(k => ({ key: k, label: labels[k], score: dims[k] }));
    entries.sort((a, b) => b.score - a.score);
    const strengths = entries.slice(0, 2).filter(e => e.score >= 55);
    const weaknesses = entries.slice(-2).filter(e => e.score < 40);
    return { strengths, weaknesses };
  }

  // ===== STEP BAR =====
  function renderStepBar() {
    const labels = ['选择行业', '选择身份', '选择省份', '气质测试', '流动性'];
    $('stepBar').innerHTML = labels.map((l, i) =>
      `<div class="step-item" data-step="${i + 1}"><span class="step-num">${i + 1}</span><span>${l}</span></div>`
    ).join('');
  }

  function setStep(s) {
    for (let i = 1; i <= 5; i++) $('panel' + i).classList.toggle('is-active', i === s);
    document.querySelectorAll('.step-item').forEach(item => {
      const n = +item.getAttribute('data-step');
      item.classList.toggle('is-active', n === s);
      item.classList.toggle('is-done', n < s);
    });
  }

  // ===== PANEL 1: SYSTEM PREF + INDUSTRY =====
  function renderSystemPrefs(systemPref) {
    $('systemPrefGroup').innerHTML = SYSTEM_PREFS.map(sp =>
      `<button class="pref-option ${systemPref === sp.key ? 'is-selected' : ''}" data-syspref="${sp.key}">
        <span class="pref-label">${esc(sp.label)}</span>
        <span class="pref-desc">${esc(sp.desc)}</span>
      </button>`
    ).join('');
  }

  function renderIndustries(selectedId) {
    $('industryGrid').innerHTML = INDUSTRIES.map(ind =>
      `<button class="choice-card ${selectedId === ind.id ? 'is-selected' : ''}" data-industry="${ind.id}">
        <div class="choice-title"><span>${esc(ind.name)}</span></div>
      </button>`
    ).join('');
  }

  // ===== PANEL 2: PERSONA =====
  function renderPersonas(selected) {
    $('personaGrid').innerHTML = PERSONAS.map(p =>
      `<button class="choice-card persona-card ${selected === p.key ? 'is-selected' : ''}" data-persona="${esc(p.key)}">
        <span class="persona-icon">${p.icon}</span>
        <div class="choice-title"><span>${esc(p.key)}</span></div>
        <div class="choice-meta">${esc(p.text)}</div>
      </button>`
    ).join('');
  }

  // ===== PANEL 3: QUESTIONS =====
  function renderQuestion(qi, answers) {
    const q = QUESTIONS[qi];
    const sel = answers[q.id];
    $('questionHost').innerHTML = `
      <div class="question-card">
        <div class="question-top">
          <span class="eyebrow">${esc(q.id)} · ${esc(q.name)}</span>
          <span class="question-progress">${qi + 1}/${QUESTIONS.length}</span>
        </div>
        <div class="progress-track"><div class="progress-fill" style="width:${(qi + 1) / QUESTIONS.length * 100}%"></div></div>
        <div class="question-text">${esc(q.q)}</div>
        <div class="answer-list">
          ${['A', 'B', 'C'].map(k =>
            `<button class="answer-card ${sel === k ? 'is-selected' : ''}" data-answer="${k}">
              <span class="answer-key">${k}</span><span>${esc(q.answers[k])}</span>
            </button>`
          ).join('')}
        </div>
      </div>`;
    $('questionNext').disabled = !sel;
    $('questionNext').textContent = qi === QUESTIONS.length - 1 ? '完成' : '下一题';
  }

  // ===== PANEL 3: PROVINCE =====
  function renderProvinces(selected) {
    const cityProvs = new Set(Object.values(CITY_PROVINCE));
    const html = Object.entries(REGIONS).map(([region, provs]) => {
      const items = provs.filter(p => PROVINCES.includes(p)).map(p => {
        const sel = selected === p;
        return `<button class="prov-btn ${sel ? 'is-selected' : ''}" data-province="${esc(p)}">${esc(p)}</button>`;
      }).join('');
      return `<div class="prov-region"><div class="prov-region-label">${esc(region)}</div><div class="prov-row">${items}</div></div>`;
    }).join('');
    $('provinceGrid').innerHTML = html;
    if (selected && !cityProvs.has(selected)) {
      $('provinceHint').innerHTML = '<span class="prov-hint-text">所选省份暂无覆盖城市，将以同区域城市为你匹配。后续版本将加入更多城市。</span>';
    } else {
      $('provinceHint').innerHTML = '';
    }
  }
  function renderMobility(selected) {
    $('mobilityGrid').innerHTML = MOBILITY.map(m =>
      `<button class="choice-card ${selected === m.key ? 'is-selected' : ''}" data-mobility="${m.key}">
        <div class="choice-title"><span>${esc(m.name)}</span></div>
        <div class="choice-meta">${esc(m.desc)}</div>
      </button>`
    ).join('');
  }

  // ===== RESULTS SUMMARY =====
  function renderSummary(state) {
    const tags = App.temperamentTags();
    $('resultLead').textContent = state.persona + ' · ' + state.industry.name + ' · ' + (state.province || '') + ' · ' + state.mobility;
    const chips = [
      `<span class="chip primary">${esc(state.persona)}</span>`,
      `<span class="chip">${esc(state.industry.name)}</span>`,
    ].concat(tags.map(t => `<span class="chip">${esc(t.text)}</span>`)).join('');
    $('summaryChips').innerHTML = chips;
    $('mobileTags').innerHTML = `<span class="chip primary">${esc(state.persona)}</span><span class="chip">${esc(state.industry.name)}</span>`;
  }

  // ===== RANK LIST (sidebar) =====
  function renderRankList(ranked, activeCity) {
    $('rankList').innerHTML = ranked.map(item =>
      `<button class="rank-row ${item.name === activeCity ? 'is-active' : ''}" data-name="${esc(item.name)}">
        <span class="level-dot level-${esc(item.level)}"></span>
        <span class="rank-city">${esc(item.name)}</span>
        <span class="score ${scoreClass(item.match)}">${round(item.match)}</span>
      </button>`
    ).join('');
  }

  // ===== CITY CARDS =====
  function dimMini(item) {
    return DIMENSIONS.map(d =>
      `<span class="mini-bar" style="height:${Math.max(5, round(item.dims[d.key]) * 0.32)}px"></span>`
    ).join('');
  }

  function renderCityCards(ranked, activeCity, compare, sortMode) {
    $('cityCards').innerHTML = ranked.map((item, idx) => {
      const sel = compare.indexOf(item.name) >= 0;
      const tags = cityTags(item.dims);
      const tagLine = tags.strengths.map(t => `<span class="tag-good">${esc(t.label)}</span>`).join('')
        + tags.weaknesses.map(t => `<span class="tag-weak">${esc(t.label)}</span>`).join('');
      return `<article class="city-card-row ${item.name === activeCity ? 'is-active' : ''}" data-name="${esc(item.name)}">
        <button class="rank-no">${idx + 1}</button>
        <div>
          <div class="city-main-name"><span class="level-dot level-${esc(item.level)}"></span><span>${esc(item.name)}</span></div>
          <div class="city-sub">${esc(item.level)} · ${sortMode === 'gdp' ? 'GDP ' + Math.round(item.gdp) + '亿' : '匹配度 ' + round(item.match)}${tagLine ? ' · ' + tagLine : ''}</div>
        </div>
        <div class="score ${scoreClass(item.match)}">${round(item.match)}</div>
        <div class="mini-dims">${dimMini(item)}</div>
        <div class="row-actions">
          <button class="small-btn compare-btn ${sel ? 'is-selected' : ''}" data-compare="${esc(item.name)}">${sel ? '已对比' : '对比'}</button>
          <button class="small-btn detail-btn" data-detail="${esc(item.name)}">详情</button>
        </div>
      </article>`;
    }).join('');
  }

  // ===== DETAIL PANEL =====
  function formatField(city, field) {
    const ind = DataAccess.getIndicator(city, field);
    if (!ind) return '<span class="field-value empty">暂无数据</span>';
    const v = ind.value;
    const unit = ind.unit || '';
    const year = ind.year ? `<span class="yr">${esc(ind.year)}</span>` : '';
    return `<span class="field-value">${esc(Number.isInteger(v) ? v : v.toFixed(2))} ${esc(unit)}${year}</span>`;
  }

  function renderDetail(item, persona) {
    const bars = DIMENSIONS.map(d => {
      const s = round(item.dims[d.key]);
      const cls = s >= 80 ? 'green' : s >= 60 ? 'yellow' : 'red';
      const interp = dimInterp(d.key, item.dims[d.key], item.city);
      return `<div class="dim-row"><span class="dim-label">${esc(d.label)}</span><span class="dim-track"><span class="dim-fill ${cls}" style="width:${s}%"></span></span><span class="score ${scoreClass(s)}">${s}</span></div><div class="dim-interp"><span class="dim-interp-icon ${s >= 60 ? 'good' : s >= 40 ? 'mid' : 'low'}">${interp.icon}</span>${esc(interp.text)}</div>`;
    }).join('');

    const priority = PRIORITIES[persona] || [];
    const fields = DETAIL_FIELDS.slice().sort((a, b) => {
      let ai = priority.indexOf(a), bi = priority.indexOf(b);
      ai = ai < 0 ? 99 : ai; bi = bi < 0 ? 99 : bi;
      return ai - bi;
    }).map(field => {
      const desc = FIELD_LABELS[field] || '城市公开指标';
      return `<div class="field-item"><div class="field-top"><span class="field-name">${esc(field)}</span>${formatField(item.city, field)}</div><div class="field-desc">${esc(desc)}</div></div>`;
    }).join('');

    const temp = App.temperamentTags().map(t => `<span class="chip">${esc(t.text)}</span>`).join('');

    $('detailInner').innerHTML = `
      <div class="detail-head">
        <div>
          <div class="detail-title">${esc(item.name)}</div>
          <div class="detail-score score ${scoreClass(item.match)}">${round(item.match)}</div>
          <div class="chips"><span class="chip primary">${esc(item.level)}</span>${temp}</div>
        </div>
        <button class="close-btn">&times;</button>
      </div>
      <div class="detail-section"><h3>8 维得分</h3>${bars}</div>
      <div class="detail-section"><h3>全部指标</h3><div class="field-list">${fields}</div></div>`;
    $('detailInner').querySelector('.close-btn').onclick = () => App.closeDetail();
  }

  function openDetail(name, ranked, persona) {
    const item = ranked.find(r => r.name === name);
    if (!item) return;
    renderDetail(item, persona);
    $('resultsGrid').classList.add('detail-open');
    $('detailPanel').setAttribute('aria-hidden', 'false');
  }

  function closeDetail() {
    $('resultsGrid').classList.remove('detail-open');
    $('detailPanel').setAttribute('aria-hidden', 'true');
  }

  // ===== TOAST =====
  let toastTimer = null;
  function toast(m) {
    const el = $('toast');
    el.textContent = m;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  return {
    $, esc, scoreClass, toast, dimInterp, cityTags,
    renderStepBar, setStep, renderSystemPrefs, renderIndustries,
    renderPersonas, renderProvinces, renderQuestion, renderMobility,
    renderSummary, renderRankList, renderCityCards,
    renderDetail, openDetail, closeDetail,
  };
})();
