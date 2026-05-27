// City Pulse — Scoring Configuration
// All tunable parameters extracted from inline magic numbers

var SCORING_CONFIG = window.SCORING_CONFIG = {
  // 气质偏移量：dim index → delta value
  temperament: {
    energy:  { high: { 2: +4, 5: -4 }, low: { 5: +4, 2: -4 } },
    risk:    { high: { 0: +5, 1: -5 }, low: { 1: +5, 0: -5 } },
    time:    { high: { 0: +5, 2: -5 }, low: { 2: +5, 0: -5 } },
    social:  { high: { 2: +3, 7: -3 } },
    space:   { high: { 6: +3, 5: -3 }, low: { 5: +5, 6: -3, 0: -2 } },
    meaning: { high: { 7: +5, 4: -5 }, low: { 4: +5, 7: -5 } },
  },
  // 流动性偏移
  mobility: {
    L1: { 1: +5 },
    L3: { 0: +3 },
  },
  // 地理加分（在总分上叠加，不影响维度评分）
  geo: {
    sameProvince: 12,   // 同省加分
    sameRegion: 6,      // 同区域（不同省）加分
  },
  // 权重安全区
  weightFloor: 3,
  weightCeil: 40,
  // 气质判定阈值
  temperamentHigh: 65,
  temperamentLow: 35,
  // 归一化方法选择: 'percentile' | 'minmax'
  normalization: 'percentile',
};
