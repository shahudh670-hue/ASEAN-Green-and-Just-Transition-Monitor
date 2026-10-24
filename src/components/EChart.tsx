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
    chart.current?.setOption(option, { notMerge: true, lazyUpdate: true });
  }, [option]);

  return <div ref={el} role="img" aria-label={ariaLabel} style={{ width: '100%', height }} />;
}
