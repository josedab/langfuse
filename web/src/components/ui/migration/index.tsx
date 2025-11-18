"use client";

/**
 * Migration wrappers for deprecated UI components.
 *
 * These wrappers provide backwards compatibility while emitting deprecation warnings.
 * They should be used temporarily during the migration period.
 *
 * Migration mapping:
 * - MUI TreeView -> @/components/ui/tree-view
 * - Tremor BarChart -> @/components/ui/charts (MetricsBarChart)
 * - Tremor AreaChart -> @/components/ui/charts (MetricsAreaChart)
 * - Tremor LineChart -> @/components/ui/charts (MetricsLineChart)
 * - Tremor BarList -> @/components/ui/charts (MetricsBarList)
 * - Headless UI Switch -> @/components/ui/switch
 */

import * as React from "react";
import {
  TreeView as NewTreeView,
  type TreeItem,
  type TreeViewProps as NewTreeViewProps,
} from "@/src/components/ui/tree-view";
import {
  MetricsBarChart,
  MetricsAreaChart,
  MetricsLineChart,
  MetricsBarList,
  type MetricsBarChartProps,
  type MetricsAreaChartProps,
  type MetricsLineChartProps,
  type MetricsBarListProps,
  type BarListItem,
} from "@/src/components/ui/charts";

// Deprecation warning helper
const warnOnce = (() => {
  const warned = new Set<string>();
  return (component: string, replacement: string) => {
    if (!warned.has(component)) {
      warned.add(component);
      console.warn(
        `[Deprecation Warning] ${component} is deprecated. Please migrate to ${replacement}. ` +
          `See web/src/components/ui/migration/README.md for migration guide.`,
      );
    }
  };
})();

// TreeView Migration Wrapper
export interface LegacyTreeViewProps {
  items: Array<{
    id: string;
    label: string;
    children?: LegacyTreeViewProps["items"];
  }>;
  onSelect?: (id: string) => void;
  selectedId?: string | null;
  expandedIds?: string[];
  onExpandedChange?: (ids: string[]) => void;
  defaultExpandedIds?: string[];
  className?: string;
}

/**
 * @deprecated Use TreeView from @/components/ui/tree-view instead.
 */
export function LegacyTreeViewWrapper({
  items,
  onSelect,
  selectedId,
  expandedIds,
  onExpandedChange,
  defaultExpandedIds,
  className,
}: LegacyTreeViewProps) {
  React.useEffect(() => {
    warnOnce("LegacyTreeViewWrapper", "@/components/ui/tree-view");
  }, []);

  // Transform legacy items to new format
  const transformItems = (
    legacyItems: LegacyTreeViewProps["items"],
  ): TreeItem[] => {
    return legacyItems.map((item) => ({
      id: item.id,
      label: item.label,
      children: item.children ? transformItems(item.children) : undefined,
    }));
  };

  return (
    <NewTreeView
      items={transformItems(items)}
      onSelect={onSelect}
      selectedId={selectedId}
      expandedIds={expandedIds}
      onExpandedChange={onExpandedChange}
      defaultExpandedIds={defaultExpandedIds}
      className={className}
    />
  );
}

// BarChart Migration Wrapper
export interface LegacyBarChartProps {
  data: Array<Record<string, string | number>>;
  index: string;
  categories: string[];
  colors?: string[];
  valueFormatter?: (value: number) => string;
  showLegend?: boolean;
  showAnimation?: boolean;
  className?: string;
  stack?: boolean;
  layout?: "horizontal" | "vertical";
}

/**
 * @deprecated Use MetricsBarChart from @/components/ui/charts instead.
 */
export function LegacyBarChartWrapper({
  data,
  index,
  categories,
  colors,
  valueFormatter,
  showLegend,
  showAnimation,
  className,
  stack,
  layout,
}: LegacyBarChartProps) {
  React.useEffect(() => {
    warnOnce("LegacyBarChartWrapper", "@/components/ui/charts (MetricsBarChart)");
  }, []);

  return (
    <MetricsBarChart
      data={data}
      xAxisKey={index}
      categories={categories}
      colors={colors}
      valueFormatter={valueFormatter}
      showLegend={showLegend}
      showAnimation={showAnimation}
      className={className}
      stacked={stack}
      layout={layout}
    />
  );
}

// AreaChart Migration Wrapper
export interface LegacyAreaChartProps {
  data: Array<Record<string, string | number>>;
  index: string;
  categories: string[];
  colors?: string[];
  valueFormatter?: (value: number) => string;
  showLegend?: boolean;
  showAnimation?: boolean;
  className?: string;
  connectNulls?: boolean;
  stack?: boolean;
}

/**
 * @deprecated Use MetricsAreaChart from @/components/ui/charts instead.
 */
export function LegacyAreaChartWrapper({
  data,
  index,
  categories,
  colors,
  valueFormatter,
  showLegend,
  showAnimation,
  className,
  connectNulls,
  stack,
}: LegacyAreaChartProps) {
  React.useEffect(() => {
    warnOnce(
      "LegacyAreaChartWrapper",
      "@/components/ui/charts (MetricsAreaChart)",
    );
  }, []);

  return (
    <MetricsAreaChart
      data={data}
      xAxisKey={index}
      categories={categories}
      colors={colors}
      valueFormatter={valueFormatter}
      showLegend={showLegend}
      showAnimation={showAnimation}
      className={className}
      connectNulls={connectNulls}
      stacked={stack}
    />
  );
}

// LineChart Migration Wrapper
export interface LegacyLineChartProps {
  data: Array<Record<string, string | number>>;
  index: string;
  categories: string[];
  colors?: string[];
  valueFormatter?: (value: number) => string;
  showLegend?: boolean;
  showAnimation?: boolean;
  className?: string;
  connectNulls?: boolean;
}

/**
 * @deprecated Use MetricsLineChart from @/components/ui/charts instead.
 */
export function LegacyLineChartWrapper({
  data,
  index,
  categories,
  colors,
  valueFormatter,
  showLegend,
  showAnimation,
  className,
  connectNulls,
}: LegacyLineChartProps) {
  React.useEffect(() => {
    warnOnce(
      "LegacyLineChartWrapper",
      "@/components/ui/charts (MetricsLineChart)",
    );
  }, []);

  return (
    <MetricsLineChart
      data={data}
      xAxisKey={index}
      categories={categories}
      colors={colors}
      valueFormatter={valueFormatter}
      showLegend={showLegend}
      showAnimation={showAnimation}
      className={className}
      connectNulls={connectNulls}
    />
  );
}

// BarList Migration Wrapper
export interface LegacyBarListProps {
  data: Array<{
    name: string;
    value: number;
    href?: string;
    icon?: React.ComponentType<{ className?: string }>;
  }>;
  valueFormatter?: (value: number) => string;
  showAnimation?: boolean;
  className?: string;
  color?: string;
}

/**
 * @deprecated Use MetricsBarList from @/components/ui/charts instead.
 */
export function LegacyBarListWrapper({
  data,
  valueFormatter,
  showAnimation,
  className,
  color,
}: LegacyBarListProps) {
  React.useEffect(() => {
    warnOnce("LegacyBarListWrapper", "@/components/ui/charts (MetricsBarList)");
  }, []);

  return (
    <MetricsBarList
      data={data}
      valueFormatter={valueFormatter}
      showAnimation={showAnimation}
      className={className}
      color={color}
    />
  );
}

// Re-export types for convenience
export type {
  TreeItem,
  NewTreeViewProps as TreeViewProps,
  MetricsBarChartProps,
  MetricsAreaChartProps,
  MetricsLineChartProps,
  MetricsBarListProps,
  BarListItem,
};
