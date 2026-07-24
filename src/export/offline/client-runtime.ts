/** Browser runtime injected into offline HTML. No fetch / no network. */
export function clientRuntimeSource(): string {
  return `(() => {
  const vm = window.__OFFLINE_VM__;
  if (!vm || typeof echarts === 'undefined') return;
  const state = { days: 7, charts: new Map() };

  function $(sel, root){ return (root||document).querySelector(sel); }
  function $all(sel, root){ return Array.from((root||document).querySelectorAll(sel)); }

  function cutoffMs(days){ return Date.now() - days * 86400000; }

  function preparePoints(series, days){
    const cut = cutoffMs(days);
    return series.map(item => {
      let points = (item.points||[]).filter(p => new Date(p[0]).getTime() >= cut);
      if (item.dailyReset) {
        const out = [];
        for (let i=0;i<points.length;i++){
          const point = points[i];
          if (i>0){
            const prev = points[i-1];
            if (new Date(point[0]).getDate() !== new Date(prev[0]).getDate() && point[1] !== null && prev[1] !== null && point[1] < prev[1]) {
              out.push([point[0], null]);
            }
          }
          out.push(point);
        }
        points = out;
      }
      return Object.assign({}, item, { points });
    }).filter(item => item.points.some(p => p[1] !== null && p[1] !== undefined));
  }

  function renderChart(el, series, opts){
    opts = opts || {};
    const days = opts.days || state.days;
    const selected = opts.selected || new Set(series.filter(s => (opts.initialKeys ? opts.initialKeys.includes(s.key) : true)).map(s => s.key));
    const visible = preparePoints(series.filter(s => selected.has(s.key)), days);
    let chart = state.charts.get(el);
    if (!chart) {
      chart = echarts.init(el);
      state.charts.set(el, chart);
      el.addEventListener('dblclick', () => chart.dispatchAction({ type:'dataZoom', start:0, end:100 }));
    }
    chart.setOption({
      animationDuration: 280,
      color: visible.map(item => item.markNegative ? '#4b5563' : item.color),
      grid: { left: 62, right: 28, top: 42, bottom: 76 },
      tooltip: { trigger: 'axis' },
      legend: { top: 7, type: 'scroll' },
      xAxis: { type: 'time', boundaryGap: false },
      yAxis: { type: 'value' },
      dataZoom: [
        { type:'inside', xAxisIndex:0, zoomOnMouseWheel:true, moveOnMouseMove:true, moveOnMouseWheel:true },
        { type:'slider', xAxisIndex:0, height:24, bottom:16 }
      ],
      series: visible.flatMap(item => {
        const line = {
          name: item.label, type:'line', showSymbol:false, smooth:0.16, connectNulls:false,
          lineStyle:{ width:2.25, color: item.markNegative ? '#4b5563' : item.color },
          data: item.points,
          markLine: item.markNegative ? { silent:true, symbol:'none', lineStyle:{ color:'#c92828', type:'dashed' }, label:{ formatter:'0 W 基准线', color:'#c92828' }, data:[{ yAxis:0 }] } : undefined
        };
        const negatives = item.markNegative ? item.points.filter(p => typeof p[1] === 'number' && p[1] < 0) : [];
        const scatter = negatives.length ? [{ name: item.label + ' 负值点', type:'scatter', data:negatives, symbolSize:7, itemStyle:{ color:'#c92828' }, tooltip:{ show:false }, silent:true }] : [];
        return [line, ...scatter];
      })
    }, { notMerge:true });
    return { chart, selected, days };
  }

  function bindChartPanel(panel){
    const host = $('.chart-host', panel);
    if (!host) return;
    const key = panel.getAttribute('data-series-key');
    const series = (key && vm[key]) || (panel.__series) || [];
    const initialKeys = (panel.getAttribute('data-initial-keys')||'').split(',').filter(Boolean);
    const advancedKeys = (panel.getAttribute('data-advanced-keys')||'').split(',').filter(Boolean);
    let selected = new Set(initialKeys.length ? initialKeys : series.map(s => s.key));
    let days = state.days;
    const dayBox = $('.day-controls', panel);
    const seriesBox = $('.series-toggles', panel);
    const resetBtn = $('.chart-reset', panel);
    function paint(){ renderChart(host, series, { days, selected, initialKeys }); }
    if (dayBox) {
      dayBox.addEventListener('change', (e) => {
        const t = e.target;
        if (t && t.type === 'radio') { days = Number(t.value)||7; paint(); }
      });
    }
    if (seriesBox) {
      seriesBox.innerHTML = series.map(s => {
        const adv = advancedKeys.includes(s.key) ? ' data-advanced="1"' : '';
        return '<label'+adv+'><input type="checkbox" value="'+s.key+'" '+(selected.has(s.key)?'checked':'')+'/><i style="background:'+s.color+'"></i>'+s.label+'</label>';
      }).join('');
      seriesBox.addEventListener('change', (e) => {
        const t = e.target;
        if (!t || t.type !== 'checkbox') return;
        if (t.checked) selected.add(t.value); else selected.delete(t.value);
        paint();
      });
    }
    if (resetBtn) resetBtn.addEventListener('click', () => {
      const chart = state.charts.get(host);
      if (chart) chart.dispatchAction({ type:'dataZoom', start:0, end:100 });
    });
    paint();
  }

  function openDialog(title, series){
    const backdrop = document.createElement('div');
    backdrop.className = 'dialog-backdrop';
    backdrop.innerHTML = '<section class="dialog"><header class="dialog-header"><div><p class="eyebrow">历史遥测</p><h2></h2></div><button type="button" class="dialog-close">关闭</button></header><div class="chart-controls day-controls"><label><input type="radio" name="dlg-days" value="1"/> 1 天</label><label><input type="radio" name="dlg-days" value="3"/> 3 天</label><label><input type="radio" name="dlg-days" value="7" checked/> 7 天</label><button type="button" class="chart-reset">复位</button></div><div class="chart-host" style="height:440px"></div></section>';
    backdrop.querySelector('h2').textContent = title;
    document.body.appendChild(backdrop);
    const host = $('.chart-host', backdrop);
    let days = 7;
    const paint = () => renderChart(host, series, { days, selected: new Set(series.map(s => s.key)) });
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop || e.target.classList.contains('dialog-close')) backdrop.remove(); });
    backdrop.querySelector('.day-controls').addEventListener('change', (e) => {
      const t = e.target; if (t && t.name === 'dlg-days') { days = Number(t.value)||7; paint(); }
    });
    backdrop.querySelector('.chart-reset').addEventListener('click', () => {
      const chart = state.charts.get(host); if (chart) chart.dispatchAction({ type:'dataZoom', start:0, end:100 });
    });
    paint();
  }

  $all('[data-chart-panel]').forEach(bindChartPanel);
  $all('[data-open-series]').forEach(btn => {
    btn.addEventListener('click', () => {
      const raw = btn.getAttribute('data-open-series');
      if (!raw) return;
      try {
        const series = JSON.parse(raw);
        openDialog(btn.getAttribute('data-dialog-title') || '历史曲线', series);
      } catch (_) {}
    });
  });
  window.addEventListener('resize', () => { state.charts.forEach(chart => chart.resize()); });
})();`
}
