'use client';

import { useEffect, useState, type ReactNode } from 'react';

import { TelemetryChart, type ClientChartSeries } from '@/src/components/telemetry-chart';

type Props = {
  label: string;
  value?: string;
  title?: string;
  subtitle?: string;
  detail?: string;
  series: ClientChartSeries[];
  className?: string;
  children?: ReactNode;
};

export function MetricHistoryDialog({ label, value = '', title = label, subtitle, detail, series, className = '', children }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return <>
    <button type="button" className={`metric-history-trigger ${className}`.trim()} aria-label={`查看${label}历史曲线`} onClick={() => setOpen(true)}>
      {children ?? <><span>{label}</span><strong>{value}</strong><small>{detail ?? '点击查看最近 7 天曲线'}</small></>}
    </button>
    {open ? <div className="metric-dialog-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
      <section className="metric-dialog" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <header className="metric-dialog-header"><div><p className="eyebrow">历史遥测</p><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div><button type="button" className="dialog-close" aria-label="关闭历史曲线" onClick={() => setOpen(false)}>关闭</button></header>
        <TelemetryChart title="" series={series} height={440} />
      </section>
    </div> : null}
  </>;
}
