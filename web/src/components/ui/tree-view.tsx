"use client";

import * as React from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/src/utils/tailwind";

export interface TreeItem {
  id: string;
  label: React.ReactNode;
  children?: TreeItem[];
  disabled?: boolean;
}

export interface TreeViewProps {
  items: TreeItem[];
  onSelect?: (id: string) => void;
  selectedId?: string | null;
  expandedIds?: string[];
  onExpandedChange?: (ids: string[]) => void;
  defaultExpandedIds?: string[];
  className?: string;
  indentation?: number;
}

export interface TreeNodeProps {
  item: TreeItem;
  level?: number;
  onSelect?: (id: string) => void;
  selectedId?: string | null;
  expandedIds: string[];
  onToggleExpand: (id: string) => void;
  indentation?: number;
}

export function TreeView({
  items,
  onSelect,
  selectedId,
  expandedIds: controlledExpandedIds,
  onExpandedChange,
  defaultExpandedIds = [],
  className,
  indentation = 16,
}: TreeViewProps) {
  const [internalExpandedIds, setInternalExpandedIds] =
    React.useState<string[]>(defaultExpandedIds);

  const isControlled = controlledExpandedIds !== undefined;
  const expandedIds = isControlled ? controlledExpandedIds : internalExpandedIds;

  const handleToggleExpand = React.useCallback(
    (id: string) => {
      const newExpandedIds = expandedIds.includes(id)
        ? expandedIds.filter((expandedId) => expandedId !== id)
        : [...expandedIds, id];

      if (isControlled) {
        onExpandedChange?.(newExpandedIds);
      } else {
        setInternalExpandedIds(newExpandedIds);
      }
    },
    [expandedIds, isControlled, onExpandedChange],
  );

  return (
    <div
      role="tree"
      aria-multiselectable="false"
      className={cn("space-y-0.5", className)}
    >
      {items.map((item) => (
        <TreeNode
          key={item.id}
          item={item}
          onSelect={onSelect}
          selectedId={selectedId}
          expandedIds={expandedIds}
          onToggleExpand={handleToggleExpand}
          indentation={indentation}
        />
      ))}
    </div>
  );
}

export function TreeNode({
  item,
  level = 0,
  onSelect,
  selectedId,
  expandedIds,
  onToggleExpand,
  indentation = 16,
}: TreeNodeProps) {
  const hasChildren = item.children && item.children.length > 0;
  const isExpanded = expandedIds.includes(item.id);
  const isSelected = selectedId === item.id;

  const handleClick = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!item.disabled) {
        onSelect?.(item.id);
      }
    },
    [item.id, item.disabled, onSelect],
  );

  const handleExpandClick = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (hasChildren) {
        onToggleExpand(item.id);
      }
    },
    [hasChildren, item.id, onToggleExpand],
  );

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "Enter":
        case " ":
          e.preventDefault();
          if (!item.disabled) {
            onSelect?.(item.id);
          }
          break;
        case "ArrowRight":
          e.preventDefault();
          if (hasChildren && !isExpanded) {
            onToggleExpand(item.id);
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (hasChildren && isExpanded) {
            onToggleExpand(item.id);
          }
          break;
      }
    },
    [item.id, item.disabled, hasChildren, isExpanded, onSelect, onToggleExpand],
  );

  return (
    <div role="treeitem" aria-expanded={hasChildren ? isExpanded : undefined}>
      <div
        className={cn(
          "flex items-center gap-1 rounded-md px-2 py-1 hover:bg-accent",
          "cursor-pointer select-none transition-colors",
          isSelected && "bg-accent",
          item.disabled && "cursor-not-allowed opacity-50",
        )}
        style={{ paddingLeft: `${level * indentation + 8}px` }}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        tabIndex={item.disabled ? -1 : 0}
        aria-selected={isSelected}
        aria-disabled={item.disabled}
      >
        {hasChildren ? (
          <button
            type="button"
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-muted"
            onClick={handleExpandClick}
            tabIndex={-1}
            aria-label={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate text-sm">{item.label}</span>
      </div>
      {isExpanded && hasChildren && (
        <div role="group">
          {item.children!.map((child) => (
            <TreeNode
              key={child.id}
              item={child}
              level={level + 1}
              onSelect={onSelect}
              selectedId={selectedId}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              indentation={indentation}
            />
          ))}
        </div>
      )}
    </div>
  );
}

TreeView.displayName = "TreeView";
TreeNode.displayName = "TreeNode";
