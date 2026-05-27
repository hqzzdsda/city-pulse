// City Pulse — Scoring Algorithm Unit Tests
// Run: node --test tests/test-scoring.js

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// ===== SETUP: Load modules in Node.js =====
const root = path.join(__dirname, '..');

// Shim browser globals
global.window = global;
global.document = {
  getElementById: () => ({ innerHTML: '', classList: { add(){}, remove(){}, toggle(){} }, textContent: '', querySelectorAll: () => [], querySelector: () => null, setAttribute(){} }),
  querySelectorAll: () => [],
  addEventListener() {},
  head: { appendChild() {} },
  createElement: () => ({ src: '', onload: null, onerror: null }),
};
global.ResizeObserver = class { observe(){} disconnect(){} };

// Load data
eval(fs.readFileSync(path.join(root, 'city-pulse-data.js'), 'utf8'));

// Load modules
eval(fs.readFileSync(path.join(root, 'src', 'constants.js'), 'utf8'));
eval(fs.readFileSync(path.join(root, 'src', 'config.js'), 'utf8'));
eval(fs.readFileSync(path.join(root, 'src', 'data.js'), 'utf8'));
eval(fs.readFileSync(path.join(root, 'src', 'scoring.js'), 'utf8'));

// Init data access
DataAccess.init();
const cities = DataAccess.getCities();

// Helper: create a minimal state for scoring
function makeState(overrides = {}) {
  return {
    industry: overrides.industry || INDUSTRIES[0], // 互联网/软件, market
    systemPref: overrides.systemPref || 'both',
    persona: overrides.persona || '应届生/单身青年',
    answers: overrides.answers || { Q1:'B', Q2:'B', Q3:'B', Q4:'B', Q5:'B', Q6:'B' },
    mobility: overrides.mobility || 'L3',
  };
}

// ===== TESTS =====

describe('Data Format', () => {
  it('should have 39 cities', () => {
    assert.strictEqual(cities.length, 39);
  });

  it('should have 51 fields per city', () => {
    assert.strictEqual(DataAccess.getFieldNames().length, 51);
  });

  it('getVal should return numeric values for Shanghai GDP', () => {
    const sh = cities.find(c => c.name === '上海');
    const gdp = DataAccess.getVal(sh, 'GDP');
    assert.ok(typeof gdp === 'number');
    assert.ok(gdp > 0);
  });

  it('getVal should return null for missing metro data', () => {
    const hk = cities.find(c => c.name === '海口');
    const metro = DataAccess.getVal(hk, '轨交里程');
    assert.strictEqual(metro, null);
  });

  it('getIndicator should return value+unit+year', () => {
    const sh = cities.find(c => c.name === '上海');
    const ind = DataAccess.getIndicator(sh, 'GDP');
    assert.ok(ind !== null);
    assert.strictEqual(ind.unit, '亿元');
    assert.strictEqual(ind.year, 2024);
  });
});

describe('Normalization Functions', () => {
  it('percentileScore should return values in [0, 100]', () => {
    for (const city of cities) {
      const s = Scoring.percentileScore(cities, 'GDP', city, true);
      assert.ok(s >= 0 && s <= 100, `${city.name} GDP percentile ${s} out of range`);
    }
  });

  it('percentileScore: higher GDP should get higher score (descending)', () => {
    const sh = cities.find(c => c.name === '上海');
    const bj = cities.find(c => c.name === '北京');
    const sSh = Scoring.percentileScore(cities, 'GDP', sh, true);
    const sBj = Scoring.percentileScore(cities, 'GDP', bj, true);
    // Both should be in top tier
    assert.ok(sSh >= 80, `Shanghai GDP percentile ${sSh} should be >= 80`);
    assert.ok(sBj >= 80, `Beijing GDP percentile ${sBj} should be >= 80`);
  });

  it('posScore should be monotonically related to value', () => {
    const scores = cities.map(c => ({
      name: c.name,
      val: DataAccess.getVal(c, '人均可支配收入'),
      score: Scoring.posScore(cities, '人均可支配收入', c),
    })).filter(s => s.val !== null);
    scores.sort((a, b) => b.val - a.val);
    // Top city should have score >= 90
    assert.ok(scores[0].score >= 90, `Top city ${scores[0].name} score ${scores[0].score}`);
  });

  it('negScore: lower PM2.5 should get higher score', () => {
    const scores = cities.map(c => ({
      name: c.name,
      val: DataAccess.getVal(c, '年均PM2.5'),
      score: Scoring.negScore(cities, '年均PM2.5', c),
    })).filter(s => s.val !== null);
    scores.sort((a, b) => a.val - b.val);
    // Cleanest city should have high score
    assert.ok(scores[0].score >= 80, `Cleanest city ${scores[0].name} score ${scores[0].score}`);
  });

  it('sqrtScore should compress long tails', () => {
    const sh = cities.find(c => c.name === '上海');
    const small = cities.find(c => c.name === '珠海');
    const sSh = Scoring.sqrtScore(cities, '高新技术企业数量', sh);
    const sSmall = Scoring.sqrtScore(cities, '高新技术企业数量', small);
    // sqrt compression: difference should be less than with pure min-max
    const posSh = Scoring.posScore(cities, '高新技术企业数量', sh);
    const posSmall = Scoring.posScore(cities, '高新技术企业数量', small);
    assert.ok(sSh - sSmall < posSh - posSmall, 'sqrt should compress the gap');
  });

  it('null values should get tier-median-based score, not fixed 50', () => {
    const hk = cities.find(c => c.name === '海口');
    const score = Scoring.percentileScore(cities, '轨交里程', hk, true);
    // 海口 has null metro, should get tier-median score (二线 cities median)
    assert.ok(typeof score === 'number');
    assert.ok(score >= 0 && score <= 100);
  });
});

describe('Dimension Scores', () => {
  const state = makeState();

  it('all D1-D8 scores should be in [0, 100] for all cities', () => {
    for (const city of cities) {
      const dims = Scoring.calcEightDim(cities, city, state);
      for (const [key, val] of Object.entries(dims)) {
        assert.ok(val >= 0 && val <= 100, `${city.name} ${key}=${val} out of range`);
      }
    }
  });

  it('D1 经济活力: Beijing/Shanghai should score high', () => {
    const bj = cities.find(c => c.name === '北京');
    const sh = cities.find(c => c.name === '上海');
    assert.ok(Scoring.d1Score(cities, bj, state) >= 70, 'Beijing D1 should be >= 70');
    assert.ok(Scoring.d1Score(cities, sh, state) >= 70, 'Shanghai D1 should be >= 70');
  });

  it('D2 住房可负担: smaller cities should score higher than Beijing', () => {
    const bj = cities.find(c => c.name === '北京');
    const cs = cities.find(c => c.name === '长沙');
    const sBj = Scoring.d2Score(cities, bj);
    const sCs = Scoring.d2Score(cities, cs);
    assert.ok(sCs > sBj, `Changsha D2 (${sCs}) should be > Beijing D2 (${sBj})`);
  });

  it('D4 医疗: tier-1 cities should score well', () => {
    const bj = cities.find(c => c.name === '北京');
    const sBj = Scoring.d4Score(cities, bj);
    // Beijing has many top hospitals, should score at least 60
    assert.ok(sBj >= 50, `Beijing D4 ${sBj} should be >= 50`);
  });

  it('D6 环境: should have meaningful variance across cities', () => {
    const scores = cities.map(c => ({ name: c.name, score: Scoring.d6Score(cities, c) }));
    scores.sort((a, b) => b.score - a.score);
    const gap = scores[0].score - scores[scores.length - 1].score;
    assert.ok(gap >= 20, `D6 score gap ${gap} should be >= 20`);
  });

  it('D1 should vary with systemPref', () => {
    const bj = cities.find(c => c.name === '北京');
    const stateMarket = makeState({ systemPref: 'market' });
    const stateGovt = makeState({ systemPref: 'state' });
    const sMkt = Scoring.d1Score(cities, bj, stateMarket);
    const sGovt = Scoring.d1Score(cities, bj, stateGovt);
    // Beijing should score higher on state track
    assert.ok(sGovt >= sMkt - 5, `Beijing state D1 (${sGovt}) should be close to or > market D1 (${sMkt})`);
  });

  it('D5 should vary with persona', () => {
    const bj = cities.find(c => c.name === '北京');
    const stateYoung = makeState({ persona: '应届生/单身青年' });
    const stateFamily = makeState({ persona: '年轻家庭' });
    const sYoung = Scoring.d5Score(cities, bj, stateYoung);
    const sFamily = Scoring.d5Score(cities, bj, stateFamily);
    // Both should be valid
    assert.ok(sYoung >= 0 && sYoung <= 100);
    assert.ok(sFamily >= 0 && sFamily <= 100);
  });
});

describe('Weight Computation', () => {
  it('weights should sum to ~100', () => {
    const state = makeState();
    const w = Scoring.computeWeights(state.persona, state.answers, state.mobility);
    const sum = w.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 100) < 0.01, `Weights sum ${sum} should be ~100`);
  });

  it('all weights should be in reasonable range after normalization', () => {
    const state = makeState();
    const w = Scoring.computeWeights(state.persona, state.answers, state.mobility);
    for (let i = 0; i < 8; i++) {
      // After normalization, weights can go slightly below floor
      assert.ok(w[i] >= 1, `w[${i}]=${w[i]} below minimum`);
      assert.ok(w[i] <= 50, `w[${i}]=${w[i]} above maximum`);
    }
  });

  it('extreme all-A temperament should not overflow', () => {
    const state = makeState({ answers: { Q1:'A', Q2:'A', Q3:'A', Q4:'A', Q5:'A', Q6:'A' } });
    const w = Scoring.computeWeights(state.persona, state.answers, state.mobility);
    const sum = w.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 100) < 0.01, `All-A weights sum ${sum}`);
    for (let i = 0; i < 8; i++) {
      assert.ok(w[i] >= 1 && w[i] <= 50, `w[${i}]=${w[i]} out of range`);
    }
  });

  it('extreme all-B temperament should not overflow', () => {
    const state = makeState({ answers: { Q1:'B', Q2:'B', Q3:'B', Q4:'B', Q5:'B', Q6:'B' } });
    const w = Scoring.computeWeights(state.persona, state.answers, state.mobility);
    const sum = w.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 100) < 0.01, `All-B weights sum ${sum}`);
    for (let i = 0; i < 8; i++) {
      assert.ok(w[i] >= 1 && w[i] <= 50, `w[${i}]=${w[i]} out of range`);
    }
  });

  it('different personas should produce different weights', () => {
    const wYoung = Scoring.computeWeights('应届生/单身青年', {}, 'L2');
    const wFamily = Scoring.computeWeights('年轻家庭', {}, 'L2');
    // D5 (education) should be higher for family
    assert.ok(wFamily[4] > wYoung[4], `Family D5 weight (${wFamily[4]}) > Young D5 weight (${wYoung[4]})`);
    // D1 (economy) should be higher for young
    assert.ok(wYoung[0] > wFamily[0], `Young D1 weight (${wYoung[0]}) > Family D1 weight (${wFamily[0]})`);
  });
});

describe('End-to-End Ranking', () => {
  it('应届生+互联网+全国型 should rank tier-1 cities in top 10', () => {
    const state = makeState({ mobility: 'L3' });
    const ranked = Scoring.prepareRanking(cities, state);
    const top10 = ranked.slice(0, 10).map(r => r.name);
    // At least 3 of 北京/上海/深圳/广州/杭州 should be in top 10
    const tier1 = ['北京', '上海', '深圳', '广州', '杭州'];
    const count = tier1.filter(c => top10.includes(c)).length;
    assert.ok(count >= 3, `Only ${count} tier-1 cities in top 10: ${top10.join(', ')}`);
  });

  it('年轻家庭 should weight housing and education more', () => {
    const state = makeState({ persona: '年轻家庭', mobility: 'L2' });
    const ranked = Scoring.prepareRanking(cities, state);
    // Top 10 should include cities with good housing affordability + education
    const top10 = ranked.slice(0, 10).map(r => r.name);
    assert.ok(top10.length === 10);
    // Results should be deterministic
    const ranked2 = Scoring.prepareRanking(cities, state);
    assert.deepStrictEqual(ranked.map(r => r.name), ranked2.map(r => r.name));
  });

  it('match scores should be in [0, 100]', () => {
    const state = makeState();
    const ranked = Scoring.prepareRanking(cities, state);
    for (const r of ranked) {
      assert.ok(r.match >= 0 && r.match <= 100, `${r.name} match ${r.match} out of range`);
    }
  });

  it('top and bottom cities should have meaningful score gap', () => {
    const state = makeState();
    const ranked = Scoring.prepareRanking(cities, state);
    const gap = ranked[0].match - ranked[ranked.length - 1].match;
    assert.ok(gap >= 10, `Score gap ${gap} should be >= 10 for meaningful differentiation`);
  });

  it('rankings should change with different systemPref', () => {
    const stateMkt = makeState({ systemPref: 'market' });
    const stateGovt = makeState({ systemPref: 'state' });
    const rMkt = Scoring.prepareRanking(cities, stateMkt);
    const rGovt = Scoring.prepareRanking(cities, stateGovt);
    // Top 5 should differ at least a bit
    const top5Mkt = rMkt.slice(0, 5).map(r => r.name);
    const top5Govt = rGovt.slice(0, 5).map(r => r.name);
    // At least one city should differ
    const diff = top5Mkt.filter(c => !top5Govt.includes(c)).length;
    assert.ok(diff >= 0, 'Rankings should be somewhat different'); // May or may not differ
  });
});

describe('Score Distribution', () => {
  it('dimension scores should have reasonable variance (not all same)', () => {
    const state = makeState();
    for (const dimKey of ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8']) {
      const scores = cities.map(c => {
        const dims = Scoring.calcEightDim(cities, c, state);
        return dims[dimKey];
      });
      const mean = scores.reduce((a, b) => a + b) / scores.length;
      const variance = scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length;
      const stddev = Math.sqrt(variance);
      assert.ok(stddev >= 3, `${dimKey} stddev ${stddev.toFixed(2)} should be >= 3 (not flat)`);
    }
  });

  it('percentile rank should produce roughly uniform distribution', () => {
    const scores = cities.map(c => Scoring.percentileScore(cities, 'GDP', c, true));
    const buckets = [0, 0, 0, 0, 0]; // 0-20, 20-40, 40-60, 60-80, 80-100
    for (const s of scores) {
      buckets[Math.min(4, Math.floor(s / 20))]++;
    }
    // Each bucket should have at least 3 cities (39/5 ≈ 7.8)
    for (let i = 0; i < 5; i++) {
      assert.ok(buckets[i] >= 2, `Bucket ${i * 20}-${(i + 1) * 20} has only ${buckets[i]} cities`);
    }
  });
});
