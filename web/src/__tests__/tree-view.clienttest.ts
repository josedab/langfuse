/**
 * @jest-environment jsdom
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { TreeView, TreeNode, type TreeItem } from "@/src/components/ui/tree-view";

describe("TreeView Component", () => {
  const sampleItems: TreeItem[] = [
    {
      id: "item-1",
      label: "Item 1",
      children: [
        { id: "item-1-1", label: "Child 1" },
        { id: "item-1-2", label: "Child 2" },
      ],
    },
    {
      id: "item-2",
      label: "Item 2",
    },
    {
      id: "item-3",
      label: "Item 3",
      disabled: true,
    },
  ];

  describe("Rendering", () => {
    it("renders all top-level items", () => {
      render(<TreeView items={sampleItems} />);

      expect(screen.getByText("Item 1")).toBeInTheDocument();
      expect(screen.getByText("Item 2")).toBeInTheDocument();
      expect(screen.getByText("Item 3")).toBeInTheDocument();
    });

    it("does not render children by default", () => {
      render(<TreeView items={sampleItems} />);

      expect(screen.queryByText("Child 1")).not.toBeInTheDocument();
      expect(screen.queryByText("Child 2")).not.toBeInTheDocument();
    });

    it("renders children when expanded by default", () => {
      render(<TreeView items={sampleItems} defaultExpandedIds={["item-1"]} />);

      expect(screen.getByText("Child 1")).toBeInTheDocument();
      expect(screen.getByText("Child 2")).toBeInTheDocument();
    });

    it("applies custom className", () => {
      const { container } = render(
        <TreeView items={sampleItems} className="custom-class" />,
      );

      expect(container.firstChild).toHaveClass("custom-class");
    });
  });

  describe("Selection", () => {
    it("calls onSelect when an item is clicked", () => {
      const onSelect = jest.fn();
      render(<TreeView items={sampleItems} onSelect={onSelect} />);

      fireEvent.click(screen.getByText("Item 2"));

      expect(onSelect).toHaveBeenCalledWith("item-2");
    });

    it("does not call onSelect for disabled items", () => {
      const onSelect = jest.fn();
      render(<TreeView items={sampleItems} onSelect={onSelect} />);

      fireEvent.click(screen.getByText("Item 3"));

      expect(onSelect).not.toHaveBeenCalled();
    });

    it("highlights selected item", () => {
      render(<TreeView items={sampleItems} selectedId="item-2" />);

      const item = screen.getByText("Item 2").closest('[role="treeitem"]');
      expect(item?.querySelector(".bg-accent")).toBeInTheDocument();
    });
  });

  describe("Expansion", () => {
    it("expands item when expand button is clicked", () => {
      render(<TreeView items={sampleItems} />);

      // Find and click the expand button for Item 1
      const expandButton = screen
        .getByText("Item 1")
        .closest("div")
        ?.querySelector("button");
      expect(expandButton).toBeInTheDocument();

      fireEvent.click(expandButton!);

      expect(screen.getByText("Child 1")).toBeInTheDocument();
      expect(screen.getByText("Child 2")).toBeInTheDocument();
    });

    it("collapses expanded item when expand button is clicked again", () => {
      render(<TreeView items={sampleItems} defaultExpandedIds={["item-1"]} />);

      expect(screen.getByText("Child 1")).toBeInTheDocument();

      const expandButton = screen
        .getByText("Item 1")
        .closest("div")
        ?.querySelector("button");
      fireEvent.click(expandButton!);

      expect(screen.queryByText("Child 1")).not.toBeInTheDocument();
    });

    it("calls onExpandedChange when expansion changes", () => {
      const onExpandedChange = jest.fn();
      render(
        <TreeView
          items={sampleItems}
          expandedIds={[]}
          onExpandedChange={onExpandedChange}
        />,
      );

      const expandButton = screen
        .getByText("Item 1")
        .closest("div")
        ?.querySelector("button");
      fireEvent.click(expandButton!);

      expect(onExpandedChange).toHaveBeenCalledWith(["item-1"]);
    });
  });

  describe("Keyboard Navigation", () => {
    it("selects item on Enter key", () => {
      const onSelect = jest.fn();
      render(<TreeView items={sampleItems} onSelect={onSelect} />);

      const item = screen.getByText("Item 2").closest("[tabindex]");
      fireEvent.keyDown(item!, { key: "Enter" });

      expect(onSelect).toHaveBeenCalledWith("item-2");
    });

    it("selects item on Space key", () => {
      const onSelect = jest.fn();
      render(<TreeView items={sampleItems} onSelect={onSelect} />);

      const item = screen.getByText("Item 2").closest("[tabindex]");
      fireEvent.keyDown(item!, { key: " " });

      expect(onSelect).toHaveBeenCalledWith("item-2");
    });

    it("expands item on ArrowRight key", () => {
      render(<TreeView items={sampleItems} />);

      const item = screen.getByText("Item 1").closest("[tabindex]");
      fireEvent.keyDown(item!, { key: "ArrowRight" });

      expect(screen.getByText("Child 1")).toBeInTheDocument();
    });

    it("collapses item on ArrowLeft key", () => {
      render(<TreeView items={sampleItems} defaultExpandedIds={["item-1"]} />);

      const item = screen.getByText("Item 1").closest("[tabindex]");
      fireEvent.keyDown(item!, { key: "ArrowLeft" });

      expect(screen.queryByText("Child 1")).not.toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("has correct tree role", () => {
      render(<TreeView items={sampleItems} />);

      expect(screen.getByRole("tree")).toBeInTheDocument();
    });

    it("has correct treeitem roles", () => {
      render(<TreeView items={sampleItems} />);

      const treeItems = screen.getAllByRole("treeitem");
      expect(treeItems).toHaveLength(3);
    });

    it("sets aria-expanded correctly for items with children", () => {
      render(<TreeView items={sampleItems} defaultExpandedIds={["item-1"]} />);

      const expandedItem = screen
        .getByText("Item 1")
        .closest('[role="treeitem"]');
      expect(expandedItem).toHaveAttribute("aria-expanded", "true");
    });

    it("sets aria-disabled for disabled items", () => {
      render(<TreeView items={sampleItems} />);

      const disabledItem = screen
        .getByText("Item 3")
        .closest("[aria-disabled]");
      expect(disabledItem).toHaveAttribute("aria-disabled", "true");
    });
  });

  describe("Controlled vs Uncontrolled", () => {
    it("works in uncontrolled mode with defaultExpandedIds", () => {
      render(<TreeView items={sampleItems} defaultExpandedIds={["item-1"]} />);

      expect(screen.getByText("Child 1")).toBeInTheDocument();

      const expandButton = screen
        .getByText("Item 1")
        .closest("div")
        ?.querySelector("button");
      fireEvent.click(expandButton!);

      expect(screen.queryByText("Child 1")).not.toBeInTheDocument();
    });

    it("works in controlled mode with expandedIds", () => {
      const { rerender } = render(
        <TreeView items={sampleItems} expandedIds={[]} />,
      );

      expect(screen.queryByText("Child 1")).not.toBeInTheDocument();

      rerender(<TreeView items={sampleItems} expandedIds={["item-1"]} />);

      expect(screen.getByText("Child 1")).toBeInTheDocument();
    });
  });
});

describe("TreeNode Component", () => {
  it("renders with custom indentation", () => {
    const item: TreeItem = { id: "test", label: "Test Item" };
    const { container } = render(
      <TreeNode
        item={item}
        level={2}
        expandedIds={[]}
        onToggleExpand={jest.fn()}
        indentation={24}
      />,
    );

    const nodeContent = container.querySelector("[tabindex]");
    expect(nodeContent).toHaveStyle({ paddingLeft: "56px" }); // 2 * 24 + 8
  });
});
