# RFC-0005: UI Component Library Consolidation

**Status:** Draft
**Author:** Claude Code Analysis
**Created:** November 18, 2025
**Priority:** P2
**Effort:** >1 month

---

## Summary

Consolidate the multiple UI component libraries (Material UI, Radix UI, Headless UI, Tremor) into a single, consistent system based on shadcn/ui and Radix primitives to reduce bundle size, improve consistency, and simplify maintenance.

---

## Motivation

### Problem Statement

The codebase currently uses multiple UI libraries:

1. **@mui/material** (v7.3.1) + **@mui/x-tree-view** (v8.17.0)
2. **@radix-ui/** (15+ packages)
3. **@headlessui/react** (v2.2.7)
4. **@tremor/react** (v4.0.0-beta)
5. **shadcn/ui** components (custom implementations)

### Impact

- **Bundle Size**: Each library adds 50-200KB
- **Inconsistent UX**: Different interaction patterns
- **Maintenance Burden**: Multiple styling approaches
- **Learning Curve**: Developers must know multiple APIs
- **Styling Conflicts**: Different CSS methodologies clash

### Current Usage Analysis

| Library | Usage Areas | Components Used |
|---------|-------------|-----------------|
| MUI | Tree views, some forms | TreeView, TextField |
| Radix | Dialogs, menus, tooltips | Dialog, DropdownMenu, Tooltip |
| Headless UI | Comboboxes, transitions | Combobox, Transition |
| Tremor | Charts, metrics | BarChart, AreaChart, Card |
| shadcn/ui | Buttons, inputs, tables | Button, Input, Table, Form |

---

## Detailed Design

### Target Architecture

Standardize on:
- **Radix UI primitives** for behavior
- **shadcn/ui** for styled components
- **Tailwind CSS** for styling
- **Recharts** for data visualization (already used)

### Migration Plan

#### Phase 1: Audit and Plan (Week 1-2)

1. Inventory all component usages
2. Map each to shadcn/ui equivalent
3. Identify components needing custom implementation
4. Create migration priority list

#### Phase 2: Create Replacement Components (Week 3-6)

##### Replace MUI TreeView

```typescript
// New: components/ui/tree-view.tsx
import * as React from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface TreeItem {
  id: string;
  label: string;
  children?: TreeItem[];
}

export function TreeView({ items, onSelect }: TreeViewProps) {
  return (
    <div role="tree" className="space-y-1">
      {items.map((item) => (
        <TreeNode key={item.id} item={item} onSelect={onSelect} />
      ))}
    </div>
  );
}

function TreeNode({ item, level = 0, onSelect }: TreeNodeProps) {
  const [expanded, setExpanded] = React.useState(false);
  const hasChildren = item.children && item.children.length > 0;

  return (
    <div>
      <div
        role="treeitem"
        className={cn(
          "flex items-center gap-2 rounded-md px-2 py-1 hover:bg-accent",
          "cursor-pointer select-none"
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => {
          if (hasChildren) setExpanded(!expanded);
          onSelect?.(item.id);
        }}
      >
        {hasChildren ? (
          expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
        ) : (
          <span className="w-4" />
        )}
        <span className="text-sm">{item.label}</span>
      </div>
      {expanded && hasChildren && (
        <div>
          {item.children!.map((child) => (
            <TreeNode key={child.id} item={child} level={level + 1} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}
```

##### Replace Headless UI Combobox

Use shadcn/ui Command component (already available):

```typescript
// Already available in components/ui/command.tsx
import { Command, CommandInput, CommandList, CommandItem } from "@/components/ui/command";

// Usage
<Command>
  <CommandInput placeholder="Search..." />
  <CommandList>
    {items.map((item) => (
      <CommandItem key={item.id} onSelect={() => handleSelect(item)}>
        {item.label}
      </CommandItem>
    ))}
  </CommandList>
</Command>
```

##### Replace Tremor Charts

```typescript
// Replace Tremor BarChart with Recharts
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export function MetricsBarChart({ data }: { data: MetricData[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <XAxis dataKey="name" />
        <YAxis />
        <Tooltip />
        <Bar dataKey="value" fill="hsl(var(--primary))" />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

#### Phase 3: Migration (Week 7-10)

For each component:

1. Create shadcn/ui equivalent
2. Add deprecation warning to old component
3. Update usages in features
4. Remove old component
5. Update tests

```typescript
// Step 1: Deprecation wrapper
import { TreeView as NewTreeView } from "@/components/ui/tree-view";

/** @deprecated Use @/components/ui/tree-view instead */
export function MuiTreeViewWrapper(props: LegacyProps) {
  console.warn("MuiTreeViewWrapper is deprecated. Migrate to TreeView.");

  // Transform props to new format
  const newProps = transformProps(props);
  return <NewTreeView {...newProps} />;
}
```

#### Phase 4: Cleanup (Week 11-12)

1. Remove unused dependencies
2. Update package.json
3. Run bundle analysis
4. Update documentation

```json
// Remove from package.json
{
  "dependencies": {
    "@mui/material": "remove",
    "@mui/x-tree-view": "remove",
    "@headlessui/react": "remove",
    "@tremor/react": "remove"
  }
}
```

### Component Mapping

| Current | Replacement |
|---------|-------------|
| MUI TreeView | Custom TreeView (Radix-based) |
| MUI TextField | shadcn/ui Input |
| Headless Combobox | shadcn/ui Command |
| Headless Transition | Tailwind CSS transitions |
| Tremor Card | shadcn/ui Card |
| Tremor BarChart | Recharts BarChart |
| Tremor AreaChart | Recharts AreaChart |

---

## Example Usage

### Before

```typescript
// Mixed library usage
import { TreeView } from "@mui/x-tree-view";
import { Card, BarChart } from "@tremor/react";
import { Combobox } from "@headlessui/react";
import { Button } from "@/components/ui/button";

export function Dashboard() {
  return (
    <div>
      <Card>
        <BarChart data={data} />
      </Card>
      <TreeView items={treeData} />
      <Combobox value={selected} onChange={setSelected}>
        {/* ... */}
      </Combobox>
      <Button>Action</Button>
    </div>
  );
}
```

### After

```typescript
// Unified shadcn/ui
import { Card } from "@/components/ui/card";
import { MetricsBarChart } from "@/components/ui/charts";
import { TreeView } from "@/components/ui/tree-view";
import { Command, CommandInput, CommandList, CommandItem } from "@/components/ui/command";
import { Button } from "@/components/ui/button";

export function Dashboard() {
  return (
    <div>
      <Card>
        <MetricsBarChart data={data} />
      </Card>
      <TreeView items={treeData} />
      <Command>
        <CommandInput placeholder="Select..." />
        <CommandList>
          {options.map((option) => (
            <CommandItem key={option.id}>{option.label}</CommandItem>
          ))}
        </CommandList>
      </Command>
      <Button>Action</Button>
    </div>
  );
}
```

---

## Implementation Plan

### Month 1: Foundation

| Week | Task | Owner |
|------|------|-------|
| 1 | Complete component audit | Frontend team |
| 2 | Create migration plan | Frontend team |
| 3-4 | Build replacement components | Frontend team |

### Month 2: Migration

| Week | Task | Owner |
|------|------|-------|
| 5-6 | Migrate high-usage components | Frontend team |
| 7-8 | Migrate remaining components | Frontend team |

### Month 3: Cleanup

| Week | Task | Owner |
|------|------|-------|
| 9-10 | Remove old dependencies | Frontend team |
| 11 | Bundle optimization | Frontend team |
| 12 | Documentation and training | Frontend team |

### Milestones

- [ ] Week 2: Complete audit and plan
- [ ] Week 4: Core replacement components built
- [ ] Week 8: All components migrated
- [ ] Week 12: Old libraries removed

---

## Backwards Compatibility

### Breaking Changes

- Component API changes during migration
- Some styling differences
- Event handler signatures may change

### Migration Steps

1. Create new components alongside old
2. Add deprecation warnings
3. Migrate feature by feature
4. Remove old components after validation

### Feature Flags

```typescript
// Optional: Feature flag for gradual rollout
const useNewComponents = env.LANGFUSE_NEW_UI_COMPONENTS;

export function TreeViewWrapper(props) {
  if (useNewComponents) {
    return <NewTreeView {...props} />;
  }
  return <LegacyTreeView {...props} />;
}
```

---

## Alternatives Considered

### 1. Keep All Libraries

Continue with current mix.

**Rejected:**
- Bundle size continues growing
- Inconsistent UX
- Maintenance burden

### 2. Migrate to MUI Only

Standardize on Material UI.

**Rejected:**
- Larger bundle than Radix
- Less customizable
- Doesn't match current design system

### 3. Build Custom Library

Create entirely custom components.

**Rejected:**
- Significant effort
- Accessibility challenges
- Reinventing the wheel

---

## Open Questions

1. **Q:** How to handle Tremor-specific features (sparklines, delta indicators)?
   **A:** Build custom implementations using Recharts primitives.

2. **Q:** Should we maintain backwards compatibility for external consumers?
   **A:** No external component API, internal only.

3. **Q:** How to handle design system documentation?
   **A:** Add Storybook for component documentation.

---

## Success Criteria

- [ ] Bundle size reduced by 30%+
- [ ] Single consistent component API
- [ ] All components follow same patterns
- [ ] No visual regressions
- [ ] Developer satisfaction improved

### Metrics to Track

```typescript
// Bundle analysis
"bundle.size.total"
"bundle.size.ui-components"

// Developer experience
"component.migration.completed" // Count
"component.deprecation.warnings" // Should decrease
```

---

## Effort Estimation

- **Audit and planning:** 5 days
- **Component development:** 15 days
- **Migration:** 20 days
- **Testing:** 10 days
- **Documentation:** 5 days
- **Total:** ~55 dev-days (11 weeks)

---

## Rollback Strategy

1. Components developed in parallel, old not removed until validated
2. Feature flags for gradual rollout
3. Can revert individual component migrations
4. Full rollback: restore package.json dependencies

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Visual regressions | Medium | High | Comprehensive visual testing |
| Accessibility issues | Medium | High | Accessibility audit each component |
| Timeline slip | High | Medium | Prioritize high-value migrations |
| Developer resistance | Low | Medium | Clear documentation and training |
