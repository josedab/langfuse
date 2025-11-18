"use client";

import * as React from "react";
import {
  BarChart as RechartsBarChart,
  Bar,
  AreaChart as RechartsAreaChart,
  Area,
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  type TooltipProps,
} from "recharts";
import { cn } from "@/src/utils/tailwind";

// Common types
export interface ChartDataPoint {
  [key: string]: string | number | undefined;
}

export interface BaseChartProps {
  data: ChartDataPoint[];
  className?: string;
  height?: number;
  showGrid?: boolean;
  showLegend?: boolean;
  showAnimation?: boolean;
  valueFormatter?: (value: number) => string;
  xAxisKey?: string;
  colors?: string[];
}

// Default colors using CSS variables for theme support
const DEFAULT_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2, 173 58% 39%))",
  "hsl(var(--chart-3, 197 37% 24%))",
  "hsl(var(--chart-4, 43 74% 66%))",
  "hsl(var(--chart-5, 27 87% 67%))",
];

// Custom tooltip component
function CustomTooltip({
  active,
  payload,
  label,
  formatter,
}: TooltipProps<number, string> & {
  formatter?: (value: number) => string;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 shadow-md">
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-2 text-sm">
          <div
            className="h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium">
            {formatter && typeof entry.value === "number"
              ? formatter(entry.value)
              : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// Bar Chart Component
export interface MetricsBarChartProps extends BaseChartProps {
  categories: string[];
  stacked?: boolean;
  layout?: "horizontal" | "vertical";
}

export function MetricsBarChart({
  data,
  categories,
  className,
  height = 300,
  showGrid = true,
  showLegend = false,
  showAnimation = true,
  valueFormatter,
  xAxisKey = "name",
  colors = DEFAULT_COLORS,
  stacked = false,
  layout = "horizontal",
}: MetricsBarChartProps) {
  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsBarChart
          data={data}
          layout={layout}
          margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
        >
          {showGrid && (
            <CartesianGrid
              strokeDasharray="3 3"
              className="stroke-border/50"
              vertical={false}
            />
          )}
          <XAxis
            dataKey={layout === "horizontal" ? xAxisKey : undefined}
            type={layout === "horizontal" ? "category" : "number"}
            className="text-xs text-muted-foreground"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            dataKey={layout === "vertical" ? xAxisKey : undefined}
            type={layout === "vertical" ? "category" : "number"}
            className="text-xs text-muted-foreground"
            tickLine={false}
            axisLine={false}
            tickFormatter={
              layout === "horizontal" && valueFormatter
                ? valueFormatter
                : undefined
            }
          />
          <Tooltip
            content={<CustomTooltip formatter={valueFormatter} />}
            cursor={{ fill: "hsl(var(--muted))" }}
          />
          {showLegend && (
            <Legend
              wrapperStyle={{ paddingTop: "20px" }}
              iconType="square"
              iconSize={8}
            />
          )}
          {categories.map((category, index) => (
            <Bar
              key={category}
              dataKey={category}
              fill={colors[index % colors.length]}
              radius={[4, 4, 0, 0]}
              isAnimationActive={showAnimation}
              stackId={stacked ? "stack" : undefined}
            />
          ))}
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Area Chart Component
export interface MetricsAreaChartProps extends BaseChartProps {
  categories: string[];
  connectNulls?: boolean;
  stacked?: boolean;
  curveType?: "linear" | "monotone" | "step";
}

export function MetricsAreaChart({
  data,
  categories,
  className,
  height = 300,
  showGrid = true,
  showLegend = false,
  showAnimation = true,
  valueFormatter,
  xAxisKey = "timestamp",
  colors = DEFAULT_COLORS,
  connectNulls = false,
  stacked = false,
  curveType = "monotone",
}: MetricsAreaChartProps) {
  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsAreaChart
          data={data}
          margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
        >
          {showGrid && (
            <CartesianGrid
              strokeDasharray="3 3"
              className="stroke-border/50"
              vertical={false}
            />
          )}
          <XAxis
            dataKey={xAxisKey}
            className="text-xs text-muted-foreground"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            className="text-xs text-muted-foreground"
            tickLine={false}
            axisLine={false}
            tickFormatter={valueFormatter}
          />
          <Tooltip content={<CustomTooltip formatter={valueFormatter} />} />
          {showLegend && (
            <Legend
              wrapperStyle={{ paddingTop: "20px" }}
              iconType="square"
              iconSize={8}
            />
          )}
          {categories.map((category, index) => (
            <Area
              key={category}
              type={curveType}
              dataKey={category}
              stroke={colors[index % colors.length]}
              fill={colors[index % colors.length]}
              fillOpacity={0.3}
              strokeWidth={2}
              isAnimationActive={showAnimation}
              connectNulls={connectNulls}
              stackId={stacked ? "stack" : undefined}
            />
          ))}
        </RechartsAreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// Line Chart Component
export interface MetricsLineChartProps extends BaseChartProps {
  categories: string[];
  connectNulls?: boolean;
  curveType?: "linear" | "monotone" | "step";
  showDots?: boolean;
}

export function MetricsLineChart({
  data,
  categories,
  className,
  height = 300,
  showGrid = true,
  showLegend = false,
  showAnimation = true,
  valueFormatter,
  xAxisKey = "timestamp",
  colors = DEFAULT_COLORS,
  connectNulls = false,
  curveType = "monotone",
  showDots = false,
}: MetricsLineChartProps) {
  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsLineChart
          data={data}
          margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
        >
          {showGrid && (
            <CartesianGrid
              strokeDasharray="3 3"
              className="stroke-border/50"
              vertical={false}
            />
          )}
          <XAxis
            dataKey={xAxisKey}
            className="text-xs text-muted-foreground"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            className="text-xs text-muted-foreground"
            tickLine={false}
            axisLine={false}
            tickFormatter={valueFormatter}
          />
          <Tooltip content={<CustomTooltip formatter={valueFormatter} />} />
          {showLegend && (
            <Legend
              wrapperStyle={{ paddingTop: "20px" }}
              iconType="line"
              iconSize={8}
            />
          )}
          {categories.map((category, index) => (
            <Line
              key={category}
              type={curveType}
              dataKey={category}
              stroke={colors[index % colors.length]}
              strokeWidth={2}
              dot={showDots}
              isAnimationActive={showAnimation}
              connectNulls={connectNulls}
            />
          ))}
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  );
}

// Bar List Component (replacement for Tremor BarList)
export interface BarListItem {
  name: string;
  value: number;
  href?: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export interface MetricsBarListProps {
  data: BarListItem[];
  className?: string;
  valueFormatter?: (value: number) => string;
  showAnimation?: boolean;
  color?: string;
  onItemClick?: (item: BarListItem) => void;
}

export function MetricsBarList({
  data,
  className,
  valueFormatter = (value) => value.toLocaleString(),
  showAnimation = true,
  color = "hsl(var(--primary))",
  onItemClick,
}: MetricsBarListProps) {
  const maxValue = React.useMemo(
    () => Math.max(...data.map((item) => item.value), 0),
    [data],
  );

  return (
    <div className={cn("space-y-2", className)}>
      {data.map((item, index) => {
        const percentage = maxValue > 0 ? (item.value / maxValue) * 100 : 0;
        const ItemWrapper = item.href ? "a" : "div";

        return (
          <div
            key={item.name}
            className={cn(
              "group relative",
              (item.href || onItemClick) && "cursor-pointer",
            )}
            onClick={() => onItemClick?.(item)}
          >
            <ItemWrapper
              {...(item.href ? { href: item.href } : {})}
              className="block"
            >
              <div className="relative flex items-center justify-between py-1">
                {/* Background bar */}
                <div
                  className={cn(
                    "absolute left-0 h-full rounded-sm opacity-20",
                    showAnimation && "transition-all duration-500 ease-out",
                  )}
                  style={{
                    width: `${percentage}%`,
                    backgroundColor: color,
                    animationDelay: showAnimation ? `${index * 50}ms` : "0ms",
                  }}
                />

                {/* Content */}
                <div className="relative z-10 flex items-center gap-2">
                  {item.icon && (
                    <item.icon className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span
                    className={cn(
                      "text-sm text-muted-foreground",
                      (item.href || onItemClick) && "group-hover:text-foreground",
                    )}
                  >
                    {item.name}
                  </span>
                </div>

                {/* Value */}
                <span className="relative z-10 text-sm font-medium text-muted-foreground">
                  {valueFormatter(item.value)}
                </span>
              </div>
            </ItemWrapper>
          </div>
        );
      })}
    </div>
  );
}

MetricsBarChart.displayName = "MetricsBarChart";
MetricsAreaChart.displayName = "MetricsAreaChart";
MetricsLineChart.displayName = "MetricsLineChart";
MetricsBarList.displayName = "MetricsBarList";
