# UI Component Migration Guide

This guide documents the migration from multiple UI libraries (MUI, Tremor, Headless UI) to a unified component system based on shadcn/ui and Recharts.

## Migration Status

| Original Component | Replacement | Status |
|-------------------|-------------|--------|
| MUI TreeView | `@/components/ui/tree-view` | ✅ Available |
| Tremor BarChart | `@/components/ui/charts` (MetricsBarChart) | ✅ Available |
| Tremor AreaChart | `@/components/ui/charts` (MetricsAreaChart) | ✅ Available |
| Tremor LineChart | `@/components/ui/charts` (MetricsLineChart) | ✅ Available |
| Tremor BarList | `@/components/ui/charts` (MetricsBarList) | ✅ Available |
| Headless UI Switch | `@/components/ui/switch` | ✅ Already exists |
| Headless UI Combobox | `@/components/ui/command` | ✅ Already exists |

## Migration Examples

### TreeView (MUI → Custom)

**Before:**
```typescript
import { SimpleTreeView, TreeItem } from "@mui/x-tree-view";

<SimpleTreeView
  expandedItems={expandedItems}
  onExpandedItemsChange={(_, itemIds) => setExpandedItems(itemIds)}
>
  <TreeItem itemId="item-1" label="Item 1">
    <TreeItem itemId="item-1-1" label="Child 1" />
  </TreeItem>
</SimpleTreeView>
```

**After:**
```typescript
import { TreeView, type TreeItem } from "@/src/components/ui/tree-view";

const items: TreeItem[] = [
  {
    id: "item-1",
    label: "Item 1",
    children: [
      { id: "item-1-1", label: "Child 1" }
    ]
  }
];

<TreeView
  items={items}
  expandedIds={expandedIds}
  onExpandedChange={setExpandedIds}
  onSelect={(id) => console.log("Selected:", id)}
  selectedId={selectedId}
/>
```

### BarChart (Tremor → Recharts)

**Before:**
```typescript
import { BarChart } from "@tremor/react";

<BarChart
  data={data}
  index="month"
  categories={["Sales", "Profit"]}
  colors={["indigo", "cyan"]}
  valueFormatter={(value) => `$${value}`}
  showLegend={true}
/>
```

**After:**
```typescript
import { MetricsBarChart } from "@/src/components/ui/charts";

<MetricsBarChart
  data={data}
  xAxisKey="month"
  categories={["Sales", "Profit"]}
  colors={["hsl(var(--primary))", "hsl(var(--chart-2))"]}
  valueFormatter={(value) => `$${value}`}
  showLegend={true}
/>
```

### AreaChart (Tremor → Recharts)

**Before:**
```typescript
import { AreaChart } from "@tremor/react";

<AreaChart
  data={data}
  index="timestamp"
  categories={["value"]}
  colors={["indigo"]}
  showLegend={false}
  connectNulls={true}
/>
```

**After:**
```typescript
import { MetricsAreaChart } from "@/src/components/ui/charts";

<MetricsAreaChart
  data={data}
  xAxisKey="timestamp"
  categories={["value"]}
  connectNulls={true}
  showLegend={false}
/>
```

### LineChart (Tremor → Recharts)

**Before:**
```typescript
import { LineChart } from "@tremor/react";

<LineChart
  data={data}
  index="timestamp"
  categories={["value1", "value2"]}
  colors={["indigo", "cyan"]}
/>
```

**After:**
```typescript
import { MetricsLineChart } from "@/src/components/ui/charts";

<MetricsLineChart
  data={data}
  xAxisKey="timestamp"
  categories={["value1", "value2"]}
/>
```

### BarList (Tremor → Custom)

**Before:**
```typescript
import { BarList } from "@tremor/react";

<BarList
  data={[
    { name: "Item 1", value: 100 },
    { name: "Item 2", value: 75 },
  ]}
  valueFormatter={(value) => value.toLocaleString()}
  color="indigo"
/>
```

**After:**
```typescript
import { MetricsBarList } from "@/src/components/ui/charts";

<MetricsBarList
  data={[
    { name: "Item 1", value: 100 },
    { name: "Item 2", value: 75 },
  ]}
  valueFormatter={(value) => value.toLocaleString()}
  color="hsl(var(--primary))"
/>
```

### Switch (Headless UI → shadcn/ui)

**Before:**
```typescript
import { Switch } from "@headlessui/react";

<Switch
  checked={enabled}
  onChange={setEnabled}
  className={cn(
    enabled ? "bg-primary" : "bg-muted",
    "relative inline-flex h-6 w-11 items-center rounded-full"
  )}
>
  <span className="sr-only">Enable</span>
  <span
    className={cn(
      enabled ? "translate-x-6" : "translate-x-1",
      "inline-block h-4 w-4 transform rounded-full bg-white"
    )}
  />
</Switch>
```

**After:**
```typescript
import { Switch } from "@/src/components/ui/switch";

<Switch
  checked={enabled}
  onCheckedChange={setEnabled}
/>
```

## Using Migration Wrappers

During the migration period, you can use the legacy wrappers to maintain backwards compatibility while receiving deprecation warnings:

```typescript
import {
  LegacyTreeViewWrapper,
  LegacyBarChartWrapper,
  LegacyAreaChartWrapper,
  LegacyLineChartWrapper,
  LegacyBarListWrapper,
} from "@/src/components/ui/migration";

// These will work with the old API but emit console warnings
<LegacyBarChartWrapper
  data={data}
  index="month"
  categories={["Sales"]}
/>
```

## Color Mapping

Tremor colors should be replaced with CSS variables:

| Tremor Color | CSS Variable |
|-------------|--------------|
| indigo | `hsl(var(--primary))` |
| cyan | `hsl(var(--chart-2))` |
| emerald | `hsl(var(--chart-3))` |
| amber | `hsl(var(--chart-4))` |
| rose | `hsl(var(--chart-5))` |

## API Differences

### TreeView
- `expandedItems` → `expandedIds`
- `onExpandedItemsChange` → `onExpandedChange`
- Declarative `<TreeItem>` children → `items` prop array
- `itemId` → `id` in item objects

### Charts
- `index` → `xAxisKey`
- `stack` → `stacked`
- Color strings → CSS variables
- `customTooltip` → Built-in tooltip (customizable via props)

### BarList
- Colors are now CSS values, not Tremor color names

## Testing Your Migration

1. Replace imports one component at a time
2. Check for visual regressions
3. Verify accessibility (keyboard navigation, ARIA attributes)
4. Test dark mode compatibility
5. Confirm animations work correctly

## Bundle Size Impact

After full migration, you can remove these dependencies:
- `@mui/material`
- `@mui/x-tree-view`
- `@tremor/react`
- `@headlessui/react`

Expected bundle size reduction: 150-300KB (gzipped)

## Questions?

For questions about the migration, please refer to RFC-0005 or contact the frontend team.
