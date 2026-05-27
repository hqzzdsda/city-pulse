// City Pulse — ECharts Radar Chart

var Radar = window.Radar = (() => {
  let chart = null;
  let resizeObserver = null;

  function loadECharts() {
    return new Promise((resolve, reject) => {
      if (window.echarts) { resolve(); return; }
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js';
      s.onload = resolve;
      s.onerror = () => { console.warn('ECharts CDN load failed'); reject(); };
      document.head.appendChild(s);
    });
  }

  function init(container) {
    if (!window.echarts) return;
    if (!chart) {
      chart = echarts.init(container);
      if (window.ResizeObserver) {
        resizeObserver = new ResizeObserver(() => { if (chart) chart.resize(); });
        resizeObserver.observe(container);
      }
    }
  }

  function isDark() {
    return document.documentElement.getAttribute('data-theme') === 'dark';
  }

  function render(items) {
    if (!chart) return;
    const colors = ['#ff385c', '#00a699', '#ff8c42', '#428bff'];
    const dark = isDark();
    const text = dark ? '#e0e0e0' : '#222';
    const line = dark ? '#444' : '#ddd';
    const splitLine = dark ? '#3a3a3a' : '#ebebeb';
    const area = dark ? ['#1a1a1a', '#2a2a2a'] : ['#fff', '#f7f7f7'];
    const option = {
      color: colors,
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item' },
      legend: { show: items.length > 1, bottom: 0, textStyle: { color: text, fontSize: 12 } },
      radar: {
        center: ['50%', '47%'], radius: '62%', splitNumber: 4,
        indicator: DIMENSIONS.map(d => ({ name: d.label, max: 100 })),
        axisName: { color: text, fontSize: 12 },
        axisLine: { lineStyle: { color: line } },
        splitLine: { lineStyle: { color: splitLine } },
        splitArea: { areaStyle: { color: area } },
      },
      series: [{
        type: 'radar', symbol: 'circle', symbolSize: 4,
        animationDuration: 300, animationEasing: 'cubicOut',
        data: items.map((item, idx) => ({
          name: item.name,
          value: DIMENSIONS.map(d => Scoring.round(item.dims[d.key])),
          areaStyle: { opacity: dark ? 0.2 : 0.12 },
          lineStyle: { width: 2, color: colors[idx % colors.length] },
          itemStyle: { color: colors[idx % colors.length] },
        })),
      }],
    };
    chart.setOption(option, true);
  }

  function resize() {
    if (chart) chart.resize();
  }

  function dispose() {
    if (resizeObserver) resizeObserver.disconnect();
    if (chart) chart.dispose();
    chart = null;
  }

  return { loadECharts, init, render, resize, dispose };
})();
