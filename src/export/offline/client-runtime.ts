/** Browser runtime injected into offline HTML. No fetch / no network. */
export function clientRuntimeSource(): string {
  return `(() => {
  const vm = window.__OFFLINE_VM__;
  if (!vm || typeof echarts === 'undefined') return;
  const state = { days: 7, charts: new Map() };

  function $(sel, root){ return (root||document).querySelector(sel); }
  function $all(sel, root){ return Array.from((root||document).querySelectorAll(sel)); }

  const TZ = (vm && vm.timezone) || 'Asia/Shanghai';

  function partsInTz(ms){
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    });
    const map = {};
    for (const p of fmt.formatToParts(new Date(ms))) {
      if (p.type !== 'literal') map[p.type] = p.value;
    }
    return map;
  }

  function formatAxisLabel(ms, days){
    const p = partsInTz(ms);
    // Always show down to hour; day/hour layout depends on window width.
    if (days <= 1) return p.hour + ':' + p.minute;
    return p.month + '-' + p.day + '\\n' + p.hour + ':' + p.minute;
  }

  function formatTooltipTime(ms){
    const p = partsInTz(ms);
    return p.year + '-' + p.month + '-' + p.day + ' ' + p.hour + ':' + p.minute + ':' + p.second;
  }

  function latestPointMs(series){
    let max = 0;
    for (const item of series || []) {
      for (const point of item.points || []) {
        const t = new Date(point[0]).getTime();
        if (Number.isFinite(t) && t > max) max = t;
      }
    }
    return max || Date.now();
  }

  function cutoffMs(days, series){
    return latestPointMs(series) - days * 86400000;
  }

  function preparePoints(series, days){
    const cut = cutoffMs(days, series);
    return series.map(item => {
      let points = (item.points||[]).filter(p => new Date(p[0]).getTime() >= cut);
      if (item.dailyReset) {
        const out = [];
        for (let i=0;i<points.length;i++){
          const point = points[i];
          if (i>0){
            const prev = points[i-1];
            const curDay = partsInTz(new Date(point[0]).getTime());
            const prevDay = partsInTz(new Date(prev[0]).getTime());
            const sameDay = curDay.year === prevDay.year && curDay.month === prevDay.month && curDay.day === prevDay.day;
            if (!sameDay && point[1] !== null && prev[1] !== null && point[1] < prev[1]) {
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

  function unitAxisName(unit){
    if (unit === 'W') return '功率 (W)';
    if (unit === 'V') return '电压 (V)';
    if (unit === 'Hz') return '频率 (Hz)';
    if (unit === '°C') return '温度 (°C)';
    if (unit === 'kWh') return '电量 (kWh)';
    if (unit === 'h') return '时长 (h)';
    return unit || '';
  }

  function buildAxisPlan(visible){
    const units = Array.from(new Set(visible.map(function(item){ return item.unit; }).filter(Boolean)));
    const hasV = units.indexOf('V') >= 0;
    const hasHz = units.indexOf('Hz') >= 0;
    if (hasV && hasHz) {
      return {
        dual: true,
        yAxis: [
          { type:'value', name:'电压 (V)', nameLocation:'middle', nameGap:48, nameTextStyle:{ color:'#2563eb', fontWeight:700 }, axisLabel:{ color:'#7a8799' }, splitLine:{ lineStyle:{ color:'#e8edf4' } } },
          { type:'value', name:'频率 (Hz)', nameLocation:'middle', nameGap:42, nameTextStyle:{ color:'#9333ea', fontWeight:700 }, axisLabel:{ color:'#7a8799' }, splitLine:{ show:false } }
        ],
        gridRight: 56
      };
    }
    const name = unitAxisName(units[0] || '');
    return {
      dual: false,
      yAxis: [{ type:'value', name:name, nameLocation:'middle', nameGap:52, nameTextStyle:{ color:'#43516a', fontWeight:700 }, axisLabel:{ color:'#7a8799' }, splitLine:{ lineStyle:{ color:'#e8edf4' } } }],
      gridRight: 28
    };
  }

  function yAxisIndexFor(item, dual){
    if (!dual) return 0;
    if (item.unit === 'Hz') return 1;
    return 0;
  }

  var BEIJING_LAT = 39.9042;
  var BEIJING_LON = 116.4074;
  var BEIJING_TZ = 8;
  var DAY_COLOR = 'rgba(255, 236, 179, 0.38)';
  var NIGHT_COLOR = 'rgba(148, 163, 184, 0.32)';

  function rad(d){ return d * Math.PI / 180; }
  function deg(r){ return r * 180 / Math.PI; }

  function beijingParts(ms){
    var fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year:'numeric', month:'2-digit', day:'2-digit' });
    var map = {};
    fmt.formatToParts(new Date(ms)).forEach(function(p){ if (p.type !== 'literal') map[p.type] = p.value; });
    return { year: Number(map.year), month: Number(map.month), day: Number(map.day) };
  }

  function beijingSunriseSunsetMs(year, month, day){
    var lat = BEIJING_LAT, lng = BEIJING_LON, timezone = BEIJING_TZ;
    var n1 = Math.floor((275 * month) / 9);
    var n2 = Math.floor((month + 9) / 12);
    var n3 = 1 + Math.floor((year - 4 * Math.floor(year / 4) + 2) / 3);
    var n = n1 - n2 * n3 + day - 30;
    var lngHour = lng / 15;
    function calc(isSunrise){
      var t = isSunrise ? n + (6 - lngHour) / 24 : n + (18 - lngHour) / 24;
      var mAnom = 0.9856 * t - 3.289;
      var L = mAnom + 1.916 * Math.sin(rad(mAnom)) + 0.02 * Math.sin(rad(2 * mAnom)) + 282.634;
      L = ((L % 360) + 360) % 360;
      var ra = deg(Math.atan(0.91764 * Math.tan(rad(L))));
      ra = ((ra % 360) + 360) % 360;
      var lQuad = Math.floor(L / 90) * 90;
      var raQuad = Math.floor(ra / 90) * 90;
      ra = (ra + (lQuad - raQuad)) / 15;
      var sinDec = 0.39782 * Math.sin(rad(L));
      var cosDec = Math.cos(Math.asin(sinDec));
      var cosH = (Math.cos(rad(90.833)) - sinDec * Math.sin(rad(lat))) / (cosDec * Math.cos(rad(lat)));
      if (cosH > 1 || cosH < -1) return null;
      var H = isSunrise ? (360 - deg(Math.acos(cosH))) / 15 : deg(Math.acos(cosH)) / 15;
      var T = H + ra - 0.06571 * t - 6.622;
      var ut = ((T - lngHour) % 24 + 24) % 24;
      var local = ut + timezone;
      var dayOffset = 0;
      if (local >= 24) { local -= 24; dayOffset = 1; }
      else if (local < 0) { local += 24; dayOffset = -1; }
      var hours = Math.floor(local);
      var minutesFloat = (local - hours) * 60;
      var minutes = Math.floor(minutesFloat);
      var seconds = Math.round((minutesFloat - minutes) * 60);
      return Date.UTC(year, month - 1, day + dayOffset, hours - timezone, minutes, seconds);
    }
    var sunriseMs = calc(true);
    var sunsetMs = calc(false);
    if (sunriseMs === null || sunsetMs === null) return null;
    return { sunriseMs: sunriseMs, sunsetMs: sunsetMs };
  }

  function clipBand(a, b, start, end){
    var left = Math.max(a, start);
    var right = Math.min(b, end);
    if (!(right > left)) return null;
    return [left, right];
  }

  function buildBeijingDayNightBands(rangeStartMs, rangeEndMs){
    var markAreaData = [];
    var sunriseLines = [];
    var sunsetLines = [];
    if (!(rangeEndMs > rangeStartMs)) return { markAreaData: markAreaData, sunriseLines: sunriseLines, sunsetLines: sunsetLines };
    var first = beijingParts(rangeStartMs - 86400000);
    var last = beijingParts(rangeEndMs + 86400000);
    var cursor = Date.UTC(first.year, first.month - 1, first.day, 12 - BEIJING_TZ);
    var endCursor = Date.UTC(last.year, last.month - 1, last.day, 12 - BEIJING_TZ);
    var previousSunset = null;
    while (cursor <= endCursor) {
      var parts = beijingParts(cursor);
      var sun = beijingSunriseSunsetMs(parts.year, parts.month, parts.day);
      if (!sun) { cursor += 86400000; continue; }
      if (previousSunset !== null) {
        var nightA = clipBand(previousSunset, sun.sunriseMs, rangeStartMs, rangeEndMs);
        if (nightA) markAreaData.push([{ xAxis: nightA[0], itemStyle: { color: NIGHT_COLOR } }, { xAxis: nightA[1] }]);
      } else {
        var nightB = clipBand(rangeStartMs, sun.sunriseMs, rangeStartMs, rangeEndMs);
        if (nightB) markAreaData.push([{ xAxis: nightB[0], itemStyle: { color: NIGHT_COLOR } }, { xAxis: nightB[1] }]);
      }
      var day = clipBand(sun.sunriseMs, sun.sunsetMs, rangeStartMs, rangeEndMs);
      if (day) markAreaData.push([{ xAxis: day[0], itemStyle: { color: DAY_COLOR } }, { xAxis: day[1] }]);
      if (sun.sunriseMs >= rangeStartMs && sun.sunriseMs <= rangeEndMs) sunriseLines.push({ xAxis: sun.sunriseMs, name: '日出' });
      if (sun.sunsetMs >= rangeStartMs && sun.sunsetMs <= rangeEndMs) sunsetLines.push({ xAxis: sun.sunsetMs, name: '日落' });
      previousSunset = sun.sunsetMs;
      cursor += 86400000;
    }
    if (previousSunset !== null) {
      var nightC = clipBand(previousSunset, rangeEndMs, rangeStartMs, rangeEndMs);
      if (nightC) markAreaData.push([{ xAxis: nightC[0], itemStyle: { color: NIGHT_COLOR } }, { xAxis: nightC[1] }]);
    }
    return { markAreaData: markAreaData, sunriseLines: sunriseLines, sunsetLines: sunsetLines };
  }

  function visibleSeriesTimeRange(visible){
    var min = Infinity, max = -Infinity;
    visible.forEach(function(item){
      (item.points || []).forEach(function(point){
        var t = new Date(point[0]).getTime();
        if (!Number.isFinite(t)) return;
        if (t < min) min = t;
        if (t > max) max = t;
      });
    });
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    return { startMs: min, endMs: max };
  }

  function renderChart(el, series, opts){
    opts = opts || {};
    const days = opts.days || state.days;
    const selected = opts.selected || new Set(series.filter(s => (opts.initialKeys ? opts.initialKeys.includes(s.key) : true)).map(s => s.key));
    const visible = preparePoints(series.filter(s => selected.has(s.key)), days);
    const axisPlan = buildAxisPlan(visible);
    const unitByName = {};
    visible.forEach(function(item){ unitByName[item.label] = item.unit || ''; });
    const enableDayNight = opts.dayNightBands != null ? opts.dayNightBands : visible.some(function(item){ return item.unit === 'W' || item.unit === 'kWh' || item.unit === '°C'; });
    const range = visibleSeriesTimeRange(visible);
    const bands = enableDayNight && range ? buildBeijingDayNightBands(range.startMs, range.endMs) : null;
    const dayNightSeries = (bands && bands.markAreaData.length) ? [{
      name: '昼夜背景', type:'line', data:[], silent:true, tooltip:{ show:false },
      markArea: { silent:true, data: bands.markAreaData },
      markLine: days <= 1 ? {
        silent:true, symbol:'none',
        label:{ show:true, formatter:'{b}', color:'#8a6a1a', fontSize:10, position:'insideEndTop' },
        lineStyle:{ color:'#d4a017', type:'dashed', width:1, opacity:0.85 },
        data: bands.sunriseLines.map(function(item){ return { xAxis:item.xAxis, name:item.name }; })
          .concat(bands.sunsetLines.map(function(item){ return { xAxis:item.xAxis, name:item.name, lineStyle:{ color:'#6b7280' } }; }))
      } : undefined
    }] : [];
    let chart = state.charts.get(el);
    if (!chart) {
      chart = echarts.init(el);
      state.charts.set(el, chart);
      el.addEventListener('dblclick', () => chart.dispatchAction({ type:'dataZoom', start:0, end:100 }));
    }
    chart.setOption({
      animationDuration: 280,
      color: visible.map(item => item.markNegative ? '#4b5563' : item.color),
      grid: { left: 68, right: axisPlan.gridRight, top: 42, bottom: days <= 1 ? 84 : 98 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#17233a',
        borderWidth: 0,
        textStyle: { color: '#fff' },
        formatter: function(params){
          if (!params || !params.length) return '';
          const head = '时间 ' + formatTooltipTime(params[0].value[0]);
          const lines = params.filter(function(p){ return p.seriesType === 'line' && p.seriesName !== '昼夜背景'; }).map(function(p){
            const v = Array.isArray(p.value) ? p.value[1] : p.value;
            const text = (v === null || v === undefined) ? '—' : Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
            const unit = unitByName[p.seriesName] || '';
            return p.marker + p.seriesName + ': ' + text + (unit ? (' ' + unit) : '');
          });
          return [head].concat(lines).join('<br/>');
        }
      },
      legend: { top: 7, type: 'scroll', data: visible.map(function(item){ return item.label; }) },
      xAxis: {
        type: 'time',
        name: '时间',
        nameLocation: 'middle',
        nameGap: days <= 1 ? 28 : 36,
        nameTextStyle: { color:'#43516a', fontWeight:700 },
        boundaryGap: false,
        axisLabel: {
          hideOverlap: true,
          color: '#7a8799',
          formatter: function(value){ return formatAxisLabel(value, days); }
        }
      },
      yAxis: axisPlan.yAxis,
      dataZoom: [
        { type:'inside', xAxisIndex:0, zoomOnMouseWheel:true, moveOnMouseMove:true, moveOnMouseWheel:true },
        { type:'slider', xAxisIndex:0, height:24, bottom:16, labelFormatter: function(value){ return formatAxisLabel(value, days); } }
      ],
      series: dayNightSeries.concat(visible.flatMap(item => {
        const yIndex = yAxisIndexFor(item, axisPlan.dual);
        const line = {
          name: item.label, type:'line', showSymbol:false, symbol:'none', smooth:0.12, connectNulls:false, sampling: null,
          yAxisIndex: yIndex,
          lineStyle:{ width:2.25, color: item.markNegative ? '#4b5563' : item.color },
          data: item.points,
          markLine: item.markNegative ? { silent:true, symbol:'none', lineStyle:{ color:'#c92828', type:'dashed' }, label:{ formatter:'0 W 基准线', color:'#c92828' }, data:[{ yAxis:0 }] } : undefined
        };
        const negatives = item.markNegative ? item.points.filter(p => typeof p[1] === 'number' && p[1] < 0) : [];
        const scatter = negatives.length ? [{ name: item.label + ' 负值点', type:'scatter', yAxisIndex: yIndex, data:negatives, symbolSize:7, itemStyle:{ color:'#c92828' }, tooltip:{ show:false }, silent:true }] : [];
        return [line, ...scatter];
      }))
    }, { notMerge:true });
    return { chart, selected, days, enableDayNight };
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
    function paint(){
      const result = renderChart(host, series, { days, selected, initialKeys });
      const legend = $('.day-night-legend', panel);
      if (legend) legend.hidden = !result.enableDayNight;
    }
    if (dayBox) {
      dayBox.addEventListener('change', (e) => {
        const t = e.target;
        if (t && t.type === 'radio') { days = Number(t.value)||7; paint(); }
      });
    }
    if (seriesBox) {
      seriesBox.innerHTML = series.map(s => {
        const adv = advancedKeys.includes(s.key) ? ' data-advanced="1"' : '';
        const unit = s.unit ? (' (' + s.unit + ')') : '';
        return '<label'+adv+'><input type="checkbox" value="'+s.key+'" '+(selected.has(s.key)?'checked':'')+'/><i style="background:'+s.color+'"></i>'+s.label+unit+'</label>';
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

  function bindDeviceSwitcher(){
    const form = $('[data-device-switcher]');
    if (!form) return;
    const select = $('[data-device-select]', form);
    if (!select) return;
    select.addEventListener('change', function(){
      const opt = select.options[select.selectedIndex];
      const href = opt && opt.getAttribute('data-href');
      if (href) window.location.href = href;
    });
    form.addEventListener('submit', function(event){ event.preventDefault(); });
  }

  bindDeviceSwitcher();
  window.addEventListener('resize', () => { state.charts.forEach(chart => chart.resize()); });
})();`
}
