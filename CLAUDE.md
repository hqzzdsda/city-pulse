# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

City Pulse (城市脉搏) is a city comparison and analysis tool that uses OSINT data to generate "health check reports" for 39 Chinese cities. It helps users make settlement/career decisions based on verifiable city indicators. Tagline: "Your city matcher (not a ranking)."

## Tech Stack

- **Frontend**: Modular vanilla JS under `src/` (no framework, no npm). Also produces a single-file bundled `dist/index.html` for deployment.
- **Charts**: ECharts v5.5.0 (CDN, with load failure fallback)
- **Design system**: Airbnb-inspired — primary `#ff385c`, pill-shaped buttons (radius 9999px), 14px card radius, Airbnb Cereal VF / PingFang SC / Microsoft YaHei fonts
- **Data**: Compact array format with `window.CITY_DATA_HEADER` (field definitions) + `window.CITY_DATA` (values). ~34KB for 39 cities × 51 fields.
- **Data build**: Python + openpyxl reads from `39城市数据合并总表.xlsx` (relative path) and generates `city-pulse-data.js`
- **Testing**: Node.js native `node:test` runner, no external dependencies

## Commands

```bash
# Rebuild city data from Excel source
python build_data.py

# Build single-file bundled HTML (dist/index.html)
python build_bundle.py

# Run unit tests
node --test tests/test-scoring.js

# Run the app (development) — open src/index.html in browser
# Run the app (production) — open dist/index.html in browser
```

## Architecture

### Scoring System (8 dimensions, each 0–100)

| Dim | Name | Key indicators |
|-----|------|---------------|
| D1 | 经济活力 | Dual-track: market (income, GDP, high-tech) vs. state (fiscal, admin level) |
| D2 | 住房可负担 | Housing price-to-income ratio, avg price, rent (soft floor transformation) |
| D3 | 生活便利 | Blended 40% rank + 60% per-capita: cafes, cinemas, malls, etc. |
| D4 | 医疗健康 | Hospital count, beds per capita (hospital reputation optional) |
| D5 | 教育资源 | Persona-aware: K12 scale/teacher ratio, higher ed, vocational |
| D6 | 环境气候 | PM2.5, green space, extreme temperatures |
| D7 | 交通通勤 | Commute time, metro per capita, road density, airports, HSR |
| D8 | 治理基础 | Fiscal self-sufficiency, budget per capita, admin level |

**Normalization**: Primarily percentile rank (robust to extreme values). sqrtScore for education scale indicators. posScore/negScore for linear indicators.

**Weight computation**: 3-layer system — Persona anchor weights → temperament delta (Q1–Q6) → mobility delta (L1–L4). Each weight clamped to [3, 40] then normalized to sum=100.

### Four-layer Funnel (product flow)

1. **Matching** — user identity + industry + mobility → Top 30
2. **Comparison** — narrow to Top 10, compare up to 4 cities
3. **Settlement Calculator** — deep analysis of one city
4. **Alert Subscription** — indicator anomaly notifications

### Source Modules (`src/`)

| File | Purpose |
|------|---------|
| `index.html` | HTML structure, loads all scripts |
| `style.css` | All CSS (Airbnb design system) |
| `constants.js` | INDUSTRIES, PERSONAS, QUESTIONS, WEIGHTS, DIMENSIONS |
| `config.js` | SCORING_CONFIG — all tunable parameters (temperament deltas, weight bounds, D2 alpha) |
| `data.js` | DataAccess adapter — `getVal(city, field)` over compact array format |
| `scoring.js` | Normalization + D1–D8 + weight computation + ranking |
| `render.js` | DOM rendering (event-delegation-based) |
| `radar.js` | ECharts radar chart (with CDN fallback) |
| `app.js` | State management + event binding + init |

## Data Format

`city-pulse-data.js` uses a compact array format:

```js
window.CITY_DATA_HEADER = { fields: [...], units: [...], years: [...] };
window.CITY_DATA = [
  { name: "上海", level: "一线", v: [88366, 56708.71, ...] },
  ...
];
```

Access via `DataAccess.getVal(city, 'GDP')` or `DataAccess.getIndicator(city, 'GDP')` (returns `{value, unit, year}`).

## Key Files

| File | Purpose |
|------|---------|
| `src/` | Modular source code |
| `dist/index.html` | Bundled single-file (deployment) |
| `city-pulse-data.js` | Auto-generated data — do not edit manually |
| `build_data.py` | Data pipeline: Excel → JS (relative paths) |
| `build_bundle.py` | Bundle src/ → dist/index.html |
| `tests/test-scoring.js` | Unit tests for scoring algorithm |
| `39城市数据合并总表.xlsx` | Source data (39 cities, 2024) |
| `product/` | PRDs, architecture specs |
| `archive/` | Old HTML prototypes and ad-hoc scripts |

## Data Notes

- 39 cities: 4 first-tier, 21 new first-tier, 14 second-tier (2024 data)
- City tier classification is hardcoded in `build_data.py` (`CITY_LEVEL` dict)
- Missing values: commute time uses same-tier mean; metro uses null (not 0) for cities without rail; null indicators get tier-median score in normalization
- `复旦百强加权分` (hospital reputation) not in Excel — D4 redistributes weight to other indicators when absent
