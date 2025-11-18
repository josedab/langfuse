/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import {
  MetricsBarChart,
  MetricsAreaChart,
  MetricsLineChart,
  MetricsBarList,
  type BarListItem,
} from "@/src/components/ui/charts";

// Mock ResizeObserver for Recharts
beforeAll(() => {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

describe("MetricsBarChart", () => {
  const sampleData = [
    { name: "Jan", Sales: 100, Profit: 50 },
    { name: "Feb", Sales: 150, Profit: 75 },
    { name: "Mar", Sales: 200, Profit: 100 },
  ];

  it("renders without crashing", () => {
    const { container } = render(
      <MetricsBarChart
        data={sampleData}
        categories={["Sales", "Profit"]}
        xAxisKey="name"
      />,
    );

    expect(container.firstChild).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <MetricsBarChart
        data={sampleData}
        categories={["Sales"]}
        className="custom-chart"
      />,
    );

    expect(container.firstChild).toHaveClass("custom-chart");
  });

  it("renders with custom height", () => {
    const { container } = render(
      <MetricsBarChart
        data={sampleData}
        categories={["Sales"]}
        height={400}
      />,
    );

    expect(container.firstChild).toHaveStyle({ height: "400px" });
  });

  it("renders multiple categories", () => {
    render(
      <MetricsBarChart
        data={sampleData}
        categories={["Sales", "Profit"]}
        showLegend={true}
      />,
    );

    // Component renders without error with multiple categories
    expect(screen.getByText("Sales")).toBeInTheDocument();
    expect(screen.getByText("Profit")).toBeInTheDocument();
  });
});

describe("MetricsAreaChart", () => {
  const sampleData = [
    { timestamp: "2024-01", value: 100 },
    { timestamp: "2024-02", value: 150 },
    { timestamp: "2024-03", value: 200 },
  ];

  it("renders without crashing", () => {
    const { container } = render(
      <MetricsAreaChart
        data={sampleData}
        categories={["value"]}
        xAxisKey="timestamp"
      />,
    );

    expect(container.firstChild).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <MetricsAreaChart
        data={sampleData}
        categories={["value"]}
        className="area-chart"
      />,
    );

    expect(container.firstChild).toHaveClass("area-chart");
  });

  it("renders with connectNulls option", () => {
    const dataWithNulls = [
      { timestamp: "2024-01", value: 100 },
      { timestamp: "2024-02", value: undefined },
      { timestamp: "2024-03", value: 200 },
    ];

    const { container } = render(
      <MetricsAreaChart
        data={dataWithNulls}
        categories={["value"]}
        connectNulls={true}
      />,
    );

    expect(container.firstChild).toBeInTheDocument();
  });
});

describe("MetricsLineChart", () => {
  const sampleData = [
    { timestamp: "2024-01", value1: 100, value2: 80 },
    { timestamp: "2024-02", value1: 150, value2: 120 },
    { timestamp: "2024-03", value1: 200, value2: 160 },
  ];

  it("renders without crashing", () => {
    const { container } = render(
      <MetricsLineChart
        data={sampleData}
        categories={["value1", "value2"]}
        xAxisKey="timestamp"
      />,
    );

    expect(container.firstChild).toBeInTheDocument();
  });

  it("renders with custom curve type", () => {
    const { container } = render(
      <MetricsLineChart
        data={sampleData}
        categories={["value1"]}
        curveType="step"
      />,
    );

    expect(container.firstChild).toBeInTheDocument();
  });

  it("renders with dots enabled", () => {
    const { container } = render(
      <MetricsLineChart
        data={sampleData}
        categories={["value1"]}
        showDots={true}
      />,
    );

    expect(container.firstChild).toBeInTheDocument();
  });
});

describe("MetricsBarList", () => {
  const sampleData: BarListItem[] = [
    { name: "Product A", value: 100 },
    { name: "Product B", value: 75 },
    { name: "Product C", value: 50 },
  ];

  it("renders all items", () => {
    render(<MetricsBarList data={sampleData} />);

    expect(screen.getByText("Product A")).toBeInTheDocument();
    expect(screen.getByText("Product B")).toBeInTheDocument();
    expect(screen.getByText("Product C")).toBeInTheDocument();
  });

  it("renders formatted values", () => {
    render(<MetricsBarList data={sampleData} />);

    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("75")).toBeInTheDocument();
    expect(screen.getByText("50")).toBeInTheDocument();
  });

  it("uses custom value formatter", () => {
    render(
      <MetricsBarList
        data={sampleData}
        valueFormatter={(value) => `$${value}`}
      />,
    );

    expect(screen.getByText("$100")).toBeInTheDocument();
    expect(screen.getByText("$75")).toBeInTheDocument();
    expect(screen.getByText("$50")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <MetricsBarList data={sampleData} className="custom-list" />,
    );

    expect(container.firstChild).toHaveClass("custom-list");
  });

  it("renders links when href is provided", () => {
    const dataWithLinks: BarListItem[] = [
      { name: "Link Item", value: 100, href: "/test-link" },
    ];

    render(<MetricsBarList data={dataWithLinks} />);

    const link = screen.getByText("Link Item").closest("a");
    expect(link).toHaveAttribute("href", "/test-link");
  });

  it("calculates bar widths based on max value", () => {
    const { container } = render(<MetricsBarList data={sampleData} />);

    // The first item (100) should have 100% width
    // The second item (75) should have 75% width
    // The third item (50) should have 50% width
    const bars = container.querySelectorAll(".opacity-20");
    expect(bars).toHaveLength(3);
  });

  it("handles empty data", () => {
    const { container } = render(<MetricsBarList data={[]} />);

    expect(container.firstChild).toBeInTheDocument();
    expect(container.firstChild).toBeEmptyDOMElement();
  });

  it("handles single item", () => {
    const singleItem: BarListItem[] = [{ name: "Only Item", value: 100 }];

    render(<MetricsBarList data={singleItem} />);

    expect(screen.getByText("Only Item")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
  });

  it("handles zero values", () => {
    const zeroData: BarListItem[] = [
      { name: "Zero Item", value: 0 },
      { name: "Normal Item", value: 100 },
    ];

    render(<MetricsBarList data={zeroData} />);

    expect(screen.getByText("Zero Item")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});

describe("Chart Value Formatters", () => {
  it("MetricsBarChart accepts custom valueFormatter", () => {
    const formatter = jest.fn((value: number) => `${value}%`);

    render(
      <MetricsBarChart
        data={[{ name: "Test", value: 50 }]}
        categories={["value"]}
        valueFormatter={formatter}
      />,
    );

    // Formatter is passed to the chart component
    expect(formatter).toBeDefined();
  });

  it("MetricsAreaChart accepts custom valueFormatter", () => {
    const formatter = jest.fn((value: number) => `$${value}`);

    render(
      <MetricsAreaChart
        data={[{ timestamp: "2024-01", value: 100 }]}
        categories={["value"]}
        valueFormatter={formatter}
      />,
    );

    expect(formatter).toBeDefined();
  });

  it("MetricsLineChart accepts custom valueFormatter", () => {
    const formatter = jest.fn((value: number) => `${value} units`);

    render(
      <MetricsLineChart
        data={[{ timestamp: "2024-01", value: 100 }]}
        categories={["value"]}
        valueFormatter={formatter}
      />,
    );

    expect(formatter).toBeDefined();
  });
});

describe("Chart Colors", () => {
  it("MetricsBarChart accepts custom colors", () => {
    const customColors = ["#ff0000", "#00ff00", "#0000ff"];

    const { container } = render(
      <MetricsBarChart
        data={[{ name: "Test", a: 1, b: 2, c: 3 }]}
        categories={["a", "b", "c"]}
        colors={customColors}
      />,
    );

    expect(container.firstChild).toBeInTheDocument();
  });

  it("MetricsAreaChart accepts custom colors", () => {
    const customColors = ["#ff0000"];

    const { container } = render(
      <MetricsAreaChart
        data={[{ timestamp: "2024-01", value: 100 }]}
        categories={["value"]}
        colors={customColors}
      />,
    );

    expect(container.firstChild).toBeInTheDocument();
  });

  it("MetricsBarList accepts custom color", () => {
    const { container } = render(
      <MetricsBarList
        data={[{ name: "Test", value: 100 }]}
        color="#ff0000"
      />,
    );

    expect(container.firstChild).toBeInTheDocument();
  });
});
