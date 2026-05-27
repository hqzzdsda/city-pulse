// City Pulse — Scoring Engine
// Normalization functions + D1~D8 dimension scores + weight computation
// Uses percentile rank as primary normalization method

var Scoring = window.Scoring = (() => {
  const getVal = DataAccess.getVal;

  // ===== UTILITY =====
  function clamp(n) { return Math.max(0, Math.min(100, Number.isFinite(n) ? n : 50)); }
  function round(n) { return Math.round(clamp(n)); }
  function wAvg(parts) {
    let t = 0, w = 0;
    for (const p of parts) { t += p.score * p.weight; w += p.weight; }
    return w ? clamp(t / w) : 50;
  }

  // ===== NORMALIZATION =====

  // Percentile rank: rank-based, robust to extreme values
  // descending=true means higher value → higher score
  function percentileScore(cities, field, city, descending) {
    if (descending === undefined) descending = true;
    const vals = [];
    for (const c of cities) {
      const v = getVal(c, field);
      if (v !== null && Number.isFinite(v)) vals.push(v);
    }
    if (vals.length === 0) return 50;
    const sorted = vals.slice().sort((a, b) => descending ? b - a : a - b);
    const v = getVal(city, field);
    if (v === null) return tierMedianScore(cities, field, city, descending);
    // Find rank (first occurrence for ties)
    const rank = sorted.indexOf(v);
    if (rank === -1) return 50;
    return clamp((sorted.length - 1 - rank) / Math.max(1, sorted.length - 1) * 100);
  }

  // Positive min-max: higher value → higher score
  function posScore(cities, field, city) {
    const v = getVal(city, field);
    if (v === null) return tierMedianScore(cities, field, city, true);
    const ext = extremes(cities, field);
    if (ext.max === ext.min) return 50;
    return clamp((v - ext.min) / (ext.max - ext.min) * 100);
  }

  // Negative min-max: lower value → higher score
  function negScore(cities, field, city) {
    const v = getVal(city, field);
    if (v === null) return tierMedianScore(cities, field, city, false);
    const ext = extremes(cities, field);
    if (ext.max === ext.min) return 50;
    return clamp((ext.max - v) / (ext.max - ext.min) * 100);
  }

  // Square-root min-max: compresses long tails (used for education scale indicators)
  function sqrtScore(cities, field, city) {
    const v = getVal(city, field);
    if (v === null || v === undefined) return tierMedianScore(cities, field, city, true);
    const all = [];
    for (const c of cities) {
      const x = getVal(c, field);
      if (x !== null && Number.isFinite(x) && x >= 0) all.push(x);
    }
    const mxSqrt = all.length ? Math.sqrt(Math.max(...all)) : 0;
    if (mxSqrt === 0) return 50;
    return clamp(Math.sqrt(Math.max(0, v)) / mxSqrt * 100);
  }

  // Rank score: position-based (kept for backward compat, but percentile preferred)
  function rankScore(cities, field, city, desc) {
    if (desc === undefined) desc = true;
    const pairs = [];
    for (const c of cities) {
      const v = getVal(c, field);
      if (v !== null && Number.isFinite(v)) pairs.push({ name: c.name, v });
    }
    if (desc) pairs.sort((a, b) => b.v - a.v);
    else pairs.sort((a, b) => a.v - b.v);
    const cv = getVal(city, field);
    const fi = pairs.findIndex(x => x.v === cv);
    if (fi === -1) return 50;
    return clamp(100 - (fi / Math.max(1, pairs.length - 1)) * 100);
  }

  // Per-capita score: value / population, then min-max
  function perCapitaScore(cities, field, city) {
    const v = getVal(city, field);
    const pop = getVal(city, '常住人口');
    if (v === null || !pop || pop === 0) return 50;
    const per = v / pop;
    const all = [];
    for (const c of cities) {
      const a = getVal(c, field);
      const p = getVal(c, '常住人口');
      if (a !== null && p && p > 0) all.push(a / p);
    }
    if (!all.length) return 50;
    const mn = Math.min(...all), mx = Math.max(...all);
    if (mx === mn) return 50;
    return clamp((per - mn) / (mx - mn) * 100);
  }

  // Blended: 40% rank + 60% per-capita
  function blendedScore(cities, field, city) {
    return clamp(0.40 * rankScore(cities, field, city, true) + 0.60 * perCapitaScore(cities, field, city));
  }

  // Signed null-safe: for indicators that can be negative (e.g., net migration)
  function nvlSigned(cities, field, city) {
    const v = getVal(city, field);
    if (v === null) return 50;
    const vals = [];
    for (const c of cities) {
      const n = getVal(c, field);
      if (n !== null) vals.push(n);
    }
    const mxP = Math.max(...vals, 0);
    const mnN = Math.min(...vals, 0);
    if (v >= 0) return clamp(50 + (mxP ? v / mxP * 50 : 0));
    return clamp(50 - (mnN ? Math.abs(v) / Math.abs(mnN) * 50 : 0));
  }

  // Hospital reputation score (sqrt-based, range [sqrt(20), sqrt(1400)])
  function hospRepScore(cities, city) {
    const raw = getVal(city, '复旦百强加权分') || 0;
    if (raw <= 0) return 0;
    return clamp((Math.sqrt(raw) - Math.sqrt(20)) / (Math.sqrt(1400) - Math.sqrt(20)) * 100);
  }

  // ===== HELPERS =====

  function extremes(cities, field) {
    let min = Infinity, max = -Infinity;
    for (const c of cities) {
      const v = getVal(c, field);
      if (v !== null && Number.isFinite(v)) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    return { min: isFinite(min) ? min : 0, max: isFinite(max) ? max : 1 };
  }

  // Tier-based median score for null values
  function tierMedianScore(cities, field, city, descending) {
    const level = city.level || '二线';
    const tierCities = cities.filter(c => (c.level || '二线') === level);
    const tierVals = [];
    for (const c of tierCities) {
      const v = getVal(c, field);
      if (v !== null && Number.isFinite(v)) tierVals.push(v);
    }
    if (tierVals.length === 0) return 50;
    tierVals.sort((a, b) => descending ? b - a : a - b);
    const median = tierVals[Math.floor(tierVals.length / 2)];
    // Score this median against all cities
    const allVals = [];
    for (const c of cities) {
      const v = getVal(c, field);
      if (v !== null && Number.isFinite(v)) allVals.push(v);
    }
    allVals.sort((a, b) => descending ? b - a : a - b);
    const rank = allVals.indexOf(median);
    if (rank === -1) return 50;
    return clamp((allVals.length - 1 - rank) / Math.max(1, allVals.length - 1) * 100);
  }

  // ===== DIMENSION SCORES =====

  // D1 经济活力 (dual-track: market + state, blended by industry track & system pref)
  function d1_market(cities, city) {
    return wAvg([
      { score: posScore(cities, '人均可支配收入', city), weight: 0.40 },
      { score: posScore(cities, '人均GDP', city), weight: 0.25 },
      { score: percentileScore(cities, 'GDP增长率', city, true), weight: 0.15 },
      { score: sqrtScore(cities, '高新技术企业数量', city), weight: 0.10 },
      { score: nvlSigned(cities, '高新企业净迁入', city), weight: 0.10 },
    ]);
  }

  function d1_state(cities, city) {
    return wAvg([
      { score: posScore(cities, '财政自给率', city), weight: 0.30 },
      { score: sqrtScore(cities, '人均预算支出', city), weight: 0.25 },
      { score: posScore(cities, '城市行政层级', city), weight: 0.25 },
      { score: percentileScore(cities, '非私营单位平均工资', city, true), weight: 0.20 },
    ]);
  }

  function d1Score(cities, city, state) {
    const ind = state.industry || INDUSTRIES[0];
    const mkt = d1_market(cities, city);
    const stt = d1_state(cities, city);
    const pref = state.systemPref || 'both';

    if (ind.track === 'mixed') {
      const w = ind.mixed_w || { state: 0.5, market: 0.5 };
      const base = stt * w.state + mkt * w.market;
      if (pref === 'state') return clamp(base * 0.80 + stt * 0.20);
      if (pref === 'market') return clamp(base * 0.80 + mkt * 0.20);
      return clamp(base);
    }

    const blend = TRACK_PREF_BLEND[ind.track];
    if (!blend) return clamp(mkt);
    const sw = blend[pref] || blend['both'];
    return clamp(stt * sw[0] + mkt * sw[1]);
  }

  // D2 住房可负担性 (percentile rank for uniform distribution)
  function d2Score(cities, city) {
    return wAvg([
      { score: percentileScore(cities, '房价收入比', city, false), weight: 0.45 },
      { score: percentileScore(cities, '新房均价', city, false), weight: 0.30 },
      { score: percentileScore(cities, '房租', city, false), weight: 0.25 },
    ]);
  }

  // D3 生活便利与活力
  function d3Score(cities, city) {
    return wAvg([
      { score: blendedScore(cities, '咖啡馆数量', city), weight: 0.20 },
      { score: blendedScore(cities, '电影院数量', city), weight: 0.15 },
      { score: blendedScore(cities, '运动场馆数量', city), weight: 0.15 },
      { score: blendedScore(cities, '酒吧数量', city), weight: 0.10 },
      { score: blendedScore(cities, '购物中心数量', city), weight: 0.15 },
      { score: blendedScore(cities, '超市便利店数量', city), weight: 0.15 },
      { score: blendedScore(cities, '餐饮门店数量', city), weight: 0.10 },
    ]);
  }

  // D4 医疗健康 (hospital reputation data may be unavailable)
  function d4Score(cities, city) {
    const hospRep = hospRepScore(cities, city);
    if (hospRep > 0) {
      return wAvg([
        { score: hospRep, weight: 0.40 },
        { score: percentileScore(cities, '三甲医院数量', city, true), weight: 0.35 },
        { score: posScore(cities, '每千人医疗卫生机构床位数', city), weight: 0.15 },
        { score: percentileScore(cities, '每十万人三甲医院数', city, true), weight: 0.10 },
      ]);
    }
    // No hospital reputation data: redistribute weight proportionally
    return wAvg([
      { score: percentileScore(cities, '三甲医院数量', city, true), weight: 0.50 },
      { score: posScore(cities, '每千人医疗卫生机构床位数', city), weight: 0.30 },
      { score: percentileScore(cities, '每十万人三甲医院数', city, true), weight: 0.20 },
    ]);
  }

  // D5 教育 (persona-aware internal formula switching)
  function d5_k12Scale(cities, city) {
    const ms = getVal(city, '普通中学数量'), ps = getVal(city, '普通小学数量');
    if (ms === null || ps === null) return 50;
    const avg = (ms + ps) / 2;
    const all = [];
    for (const c of cities) {
      const a = getVal(c, '普通中学数量'), b = getVal(c, '普通小学数量');
      if (a !== null && b !== null) all.push((a + b) / 2);
    }
    const maxSqrt = all.length ? Math.sqrt(Math.max(...all)) : 0;
    return maxSqrt === 0 ? 50 : clamp(Math.sqrt(Math.max(0, avg)) / maxSqrt * 100);
  }

  function d5_k12Teacher(cities, city) {
    const m = getVal(city, '中学生师比'), p = getVal(city, '小学生师比');
    if (m === null || p === null) return 50;
    const v = 2 / ((m + p) / 2);
    const all = [];
    for (const c of cities) {
      const a = getVal(c, '中学生师比'), b = getVal(c, '小学生师比');
      if (a !== null && b !== null) all.push(2 / ((a + b) / 2));
    }
    const mn = Math.min(...all), mx = Math.max(...all);
    return mx === mn ? 50 : clamp((v - mn) / (mx - mn) * 100);
  }

  function d5_voc(cities, city) { return sqrtScore(cities, '中职学校数', city); }

  function d5Score(cities, city, state) {
    const p = state.persona || '应届生/单身青年';
    const K12 = wAvg([
      { score: d5_k12Scale(cities, city), weight: 0.30 },
      { score: d5_k12Teacher(cities, city), weight: 0.70 },
    ]);
    const VOC = d5_voc(cities, city);

    if (p === '应届生/单身青年') {
      const HE = wAvg([
        { score: sqrtScore(cities, '双一流高校数量', city), weight: 0.80 },
        { score: sqrtScore(cities, '高校在校生', city), weight: 0.20 },
      ]);
      return wAvg([{ score: HE, weight: 0.70 }, { score: K12, weight: 0.25 }, { score: VOC, weight: 0.05 }]);
    } else if (p === '年轻家庭') {
      const HE = wAvg([
        { score: sqrtScore(cities, '双一流高校数量', city), weight: 0.60 },
        { score: sqrtScore(cities, '高校在校生', city), weight: 0.40 },
      ]);
      const K12fam = wAvg([
        { score: d5_k12Scale(cities, city), weight: 0.40 },
        { score: d5_k12Teacher(cities, city), weight: 0.60 },
      ]);
      return wAvg([{ score: HE, weight: 0.35 }, { score: K12fam, weight: 0.60 }, { score: VOC, weight: 0.05 }]);
    } else {
      const HE = wAvg([
        { score: sqrtScore(cities, '双一流高校数量', city), weight: 0.70 },
        { score: sqrtScore(cities, '高校在校生', city), weight: 0.30 },
      ]);
      return wAvg([{ score: HE, weight: 0.55 }, { score: K12, weight: 0.35 }, { score: VOC, weight: 0.10 }]);
    }
  }

  // D6 环境与气候
  function d6Score(cities, city) {
    return wAvg([
      { score: negScore(cities, '年均PM2.5', city), weight: 0.40 },
      { score: posScore(cities, '人均公园绿地面积', city), weight: 0.20 },
      { score: posScore(cities, '建成区绿化覆盖率', city), weight: 0.15 },
      { score: negScore(cities, '极端高温天数', city), weight: 0.15 },
      { score: negScore(cities, '极端低温天数', city), weight: 0.10 },
    ]);
  }

  // D7 交通与通勤
  function d7Score(cities, city) {
    return wAvg([
      { score: negScore(cities, '通勤时耗', city), weight: 0.35 },
      { score: perCapitaScore(cities, '轨交里程', city), weight: 0.25 },
      { score: posScore(cities, '建成区路网密度', city), weight: 0.15 },
      { score: posScore(cities, '机场数量', city), weight: 0.10 },
      { score: percentileScore(cities, '高铁可直达城市数', city, true), weight: 0.15 },
    ]);
  }

  // D8 治理与经济基础
  function d8Score(cities, city) {
    return wAvg([
      { score: posScore(cities, '财政自给率', city), weight: 0.50 },
      { score: percentileScore(cities, '人均预算支出', city, true), weight: 0.30 },
      { score: posScore(cities, '城市行政层级', city), weight: 0.20 },
    ]);
  }

  // ===== 8-DIMENSION CALCULATION =====
  function calcEightDim(cities, city, state) {
    return {
      d1: d1Score(cities, city, state),
      d2: d2Score(cities, city),
      d3: d3Score(cities, city),
      d4: d4Score(cities, city),
      d5: d5Score(cities, city, state),
      d6: d6Score(cities, city),
      d7: d7Score(cities, city),
      d8: d8Score(cities, city),
    };
  }

  // ===== WEIGHT COMPUTATION (3-layer) =====

  function temperamentScores(answers) {
    const r = {};
    for (let i = 0; i < QUESTIONS.length; i++) {
      const q = QUESTIONS[i];
      const k = answers[q.id];
      r[q.dim] = k === 'A' ? 100 : k === 'B' ? 0 : 50;
    }
    return r;
  }

  function temperamentDelta(answers) {
    const s = temperamentScores(answers);
    const d = [0, 0, 0, 0, 0, 0, 0, 0];
    const { temperamentHigh: HI, temperamentLow: LO } = SCORING_CONFIG;
    for (const [dim, cfg] of Object.entries(SCORING_CONFIG.temperament)) {
      const val = s[dim];
      if (val === undefined) continue;
      if (val >= HI && cfg.high) {
        for (const [idx, delta] of Object.entries(cfg.high)) d[+idx] += delta;
      } else if (val <= LO && cfg.low) {
        for (const [idx, delta] of Object.entries(cfg.low)) d[+idx] += delta;
      }
    }
    return d;
  }

  function mobilityDelta(mobility) {
    const d = [0, 0, 0, 0, 0, 0, 0, 0];
    const cfg = SCORING_CONFIG.mobility[mobility];
    if (cfg) {
      for (const [idx, delta] of Object.entries(cfg)) d[+idx] += delta;
    }
    return d;
  }

  function computeWeights(persona, answers, mobility) {
    const w = (PERSONA_WEIGHTS[persona] || PERSONA_WEIGHTS['应届生/单身青年']).slice();
    const td = temperamentDelta(answers);
    const md = mobilityDelta(mobility);
    const { weightFloor, weightCeil } = SCORING_CONFIG;
    for (let i = 0; i < 8; i++) {
      w[i] = Math.max(weightFloor, Math.min(weightCeil, w[i] + td[i] + md[i]));
    }
    const sum = w.reduce((a, b) => a + b, 0);
    return w.map(x => x / sum * 100);
  }

  function calcMatch(dim, weights) {
    const keys = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8'];
    let t = 0, s = 0;
    for (let i = 0; i < 8; i++) { t += dim[keys[i]] * weights[i]; s += weights[i]; }
    return clamp(t / s);
  }

  // ===== RANKING =====
  function findRegion(province) {
    for (const [region, provs] of Object.entries(REGIONS)) {
      if (provs.includes(province)) return region;
    }
    return null;
  }

  function geoBonus(cityName, province, mobility) {
    if (!province || mobility === 'L3') return 0;
    const { sameProvince, sameRegion } = SCORING_CONFIG.geo;
    const cityProv = CITY_PROVINCE[cityName];
    if (cityProv === province) return sameProvince;
    // Check if province has any cities in the dataset
    const provinceHasCities = Object.values(CITY_PROVINCE).some(p => p === province);
    if (mobility === 'L1' && provinceHasCities) return 0;
    // Same region bonus (L2 always, L1 only when province has no cities)
    const userRegion = findRegion(province);
    const cityRegion = findRegion(cityProv);
    if (userRegion && cityRegion && userRegion === cityRegion) return sameRegion;
    return 0;
  }

  function prepareRanking(cities, state) {
    const weights = computeWeights(state.persona, state.answers, state.mobility);
    const ranked = cities.map(city => {
      const dim = calcEightDim(cities, city, state);
      return {
        city,
        name: city.name,
        level: city.level || '二线',
        dims: dim,
        rawMatch: calcMatch(dim, weights),
        gdp: getVal(city, 'GDP') || 0,
        weights,
      };
    });
    // Apply geographic bonus
    for (const r of ranked) {
      r.geoBonus = geoBonus(r.name, state.province, state.mobility);
      r.rawMatch += r.geoBonus;
    }
    ranked.sort((a, b) => b.rawMatch - a.rawMatch);
    // Rescale raw scores to full 0–100 range for meaningful differentiation
    const rawScores = ranked.map(r => r.rawMatch);
    const rawMin = Math.min(...rawScores), rawMax = Math.max(...rawScores);
    const rawRange = rawMax - rawMin || 1;
    for (const r of ranked) {
      r.match = clamp((r.rawMatch - rawMin) / rawRange * 90 + 5);
    }
    return ranked;
  }

  function sortRanked(ranked, sortMode) {
    if (sortMode === 'gdp') ranked.sort((a, b) => b.gdp - a.gdp);
    else ranked.sort((a, b) => b.match - a.match);
  }

  // ===== PUBLIC API =====
  return {
    clamp, round, wAvg,
    percentileScore, posScore, negScore, sqrtScore, rankScore,
    perCapitaScore, blendedScore, nvlSigned, hospRepScore,
    d1Score, d2Score, d3Score, d4Score, d5Score, d6Score, d7Score, d8Score,
    calcEightDim, temperamentScores, temperamentDelta, mobilityDelta,
    computeWeights, calcMatch, prepareRanking, sortRanked,
    extremes,
  };
})();
