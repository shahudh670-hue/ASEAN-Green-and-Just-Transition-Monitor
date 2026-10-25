import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, HeatmapChart, LineChart, MapChart, ScatterChart } from 'echarts/charts';
import {
  AriaComponent,
  DataZoomComponent,
  GeoComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  BarChart,
  HeatmapChart,
  LineChart,
  MapChart,
  ScatterChart,
  AriaComponent,
  DataZoomComponent,
  GeoComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

export { echarts };

type Handler = (params: any) => void;

/**
 * House style applied to every chart: transparent canvas, no vertical
 * gridlines, faint horizontal gridlines, square bar ends, 11px axis text.
 */
const GRID = '#E1EDF2';
const arr = (x: any) => (x === undefined ? [] : Array.isArray(x) ? x : [x]);
function editorial(option: any) {
  if (!option || !Object.keys(option).length) return option;
  const o = { ...option, backgroundColor: 'transparent' };
  const dark = document.documentElement.getAttribute('data-theme') === 'dark' || (!document.documentElement.getAttribute('data-theme') && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  const grid = dark ? '#26323b' : GRID;
  const fix = (ax: any, vertical: boolean) => ({
    ...ax,
    splitLine: vertical ? { show: false } : { ...(ax.splitLine ?? {}), show: ax.splitLine?.show ?? ax.type === 'value', lineStyle: { color: grid, width: 1 } },
    axisLabel: { ...(ax.axisLabel ?? {}), fontSize: Math.min(ax.axisLabel?.fontSize ?? 11, 12) },
  });
  if (o.xAxis) o.xAxis = Array.isArray(o.xAxis) ? o.xAxis.map((a: any) => fix(a, true)) : fix(o.xAxis, true);
  if (o.yAxis) o.yAxis = Array.isArray(o.yAxis) ? o.yAxis.map((a: any) => fix(a, false)) : fix(o.yAxis, false);
  if (o.legend) o.legend = arr(o.legend).map((l: any) => ({ ...l, left: 0, top: 0, textStyle: { ...(l.textStyle ?? {}), fontSize: 11 } }));
  if (o.series)
    o.series = arr(o.series).map((s: any) => {
      if (s.type !== 'bar') return s;
      const sq = (st: any) => (st ? { ...st, borderRadius: 0 } : st);
      return { ...s, itemStyle: sq(s.itemStyle) ?? { borderRadius: 0 }, data: Array.isArray(s.data) ? s.data.map((d: any) => (d && typeof d === 'object' && d.itemStyle ? { ...d, itemStyle: sq(d.itemStyle) } : d)) : s.data };
    });
  return o;
}

interface Props {
  option: echarts.EChartsCoreOption;
  height: number | string;
  onClick?: Handler;
  onHover?: Handler;
  onOut?: Handler;
  ariaLabel: string;
  instanceRef?: (c: echarts.ECharts | null) => void;
}

export default function EChart({ option, height, onClick, onHover, onOut, ariaLabel, instanceRef }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const handlers = useRef({ onClick, onHover, onOut });
  handlers.current = { onClick, onHover, onOut };

  useEffect(() => {
    if (!el.current) return;
    const c = echarts.init(el.current, undefined, { renderer: 'canvas' });
    chart.current = c;
    instanceRef?.(c);
    c.on('click', (p) => handlers.current.onClick?.(p));
    c.on('mouseover', (p) => handlers.current.onHover?.(p));
    c.on('mouseout', (p) => handlers.current.onOut?.(p));
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      instanceRef?.(null);
      c.dispose();
      chart.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chart.current?.setOption(editorial(option), { notMerge: true, lazyUpdate: true });
  }, [option]);

  return <div ref={el} role="img" aria-label={ariaLabel} style={{ width: '100%', height }} />;
}
