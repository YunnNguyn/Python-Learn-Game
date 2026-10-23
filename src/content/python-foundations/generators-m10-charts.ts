import type { JsonValue } from "../../core/domain";
import type { MissionGenerator } from "../../core/generators";
import type { FunctionCase, PyValue } from "../../core/grading";

import {
  asJson,
  compareText,
  exampleCase,
  figure,
  frame,
  hiddenCase,
  range,
  returns,
  sumOf,
} from "./generators-m10-support";

/**
 * Generators of the M10 Matplotlib missions PF-23 and PF-24 (PHASE-08).
 *
 * The learner returns a Matplotlib Axes; the grader compares the properties of the chart
 * the learner controls - title, axis labels, legend, and each series' kind, x, y and label -
 * through the typed `$figure` value. It never looks at pixels: a chart that is drawn
 * differently but carries the same data and text passes.
 */

const TREND_LABELS = { revenue: "Doanh thu", cost: "Chi phí" } as const;
const PROFIT_LABEL = "Lợi nhuận";

const SHOPS = ["Cửa hàng An Phát", "Quán Hoa Mai", "Tiệm Sách Nắng", "Xưởng Gốm Việt"] as const;
const TOPICS = ["Bánh ngọt", "Cà phê", "Trà sữa", "Sách", "Hoa tươi", "Đồ gốm", "Nến thơm", "Tranh vẽ"] as const;
const REGIONS = ["Bắc", "Trung", "Nam", "Tây"] as const;

const halves = (values: readonly number[]): number[] => values.map((value) => value / 2);

// ---------------------------------------------------------------------------------------
// PF-23 (M10-08) - build a meaningful chart
// ---------------------------------------------------------------------------------------

export const pf23Generator: MissionGenerator = {
  generate({ rng }) {
    const shop = rng.pick(SHOPS);
    const k = rng.nextInt(5, 7);
    const months = range(1, k + 1);
    const revenue = halves(Array.from({ length: k }, () => rng.nextInt(60, 161)));
    const cost = halves(Array.from({ length: k }, () => rng.nextInt(30, 111)));
    const categoryCount = rng.nextInt(4, 6);
    const categories = rng.shuffle(TOPICS).slice(0, categoryCount);
    // Distinct values in an order that is NOT already sorted.
    let values: number[] = [];
    for (let attempt = 0; attempt < 100; attempt += 1) {
      values = halves(Array.from({ length: categoryCount }, () => rng.nextInt(20, 120)));
      const sortedDescending = [...values].sort((a, b) => b - a);
      if (new Set(values).size === values.length && values.some((value, index) => value !== sortedDescending[index])) break;
    }

    const trendTitle = `Doanh thu và chi phí — ${shop}`;
    const rankTitle = `Doanh thu theo sản phẩm — ${shop}`;
    const data = {
      months,
      revenue,
      cost,
      categories,
      values,
      trend_title: trendTitle,
      x_label: "Tháng",
      y_label: "Triệu đồng",
      rank_title: rankTitle,
      rank_ylabel: "Doanh thu (triệu đồng)",
    };

    const trendFigure = (m: readonly number[], r: readonly number[], c: readonly number[], title: string, xlabel: string, ylabel: string): PyValue =>
      figure({
        title,
        xlabel,
        ylabel,
        legend: [TREND_LABELS.revenue, TREND_LABELS.cost],
        series: [
          { kind: "line", x: m, y: r, label: TREND_LABELS.revenue },
          { kind: "line", x: m, y: c, label: TREND_LABELS.cost },
        ],
      });
    const rankingOf = (names: readonly string[], amounts: readonly number[]) => {
      const order = names.map((_, index) => index).sort((a, b) => amounts[b]! - amounts[a]! || compareText(names[a]!, names[b]!));
      return { names: order.map((index) => names[index]!), amounts: order.map((index) => amounts[index]!) };
    };
    const rankFigure = (names: readonly string[], amounts: readonly number[], title: string, ylabel: string): PyValue => {
      const ranked = rankingOf(names, amounts);
      return figure({ title, ylabel, series: [{ kind: "bar", x: ranked.names, y: ranked.amounts }] });
    };

    const trendCase = (id: string, label: string, m: number[], r: number[], c: number[], title: string, xlabel: string, ylabel: string): FunctionCase =>
      hiddenCase(id, label, [m, r, c, title, xlabel, ylabel], returns(trendFigure(m, r, c, title, xlabel, ylabel), "Axes"));
    const rankCase = (id: string, label: string, names: string[], amounts: number[], title: string, ylabel: string): FunctionCase =>
      hiddenCase(id, label, [names, amounts, title, ylabel], returns(rankFigure(names, amounts, title, ylabel), "Axes"));

    const trendCases: FunctionCase[] = [
      exampleCase("trend-example", "Ví dụ trong đề", [months, revenue, cost, trendTitle, "Tháng", "Triệu đồng"], returns(trendFigure(months, revenue, cost, trendTitle, "Tháng", "Triệu đồng"), "Axes")),
      trendCase("trend-three", "Ba tháng, tiêu đề và nhãn khác", [1, 2, 3], [10, 20.5, 15], [8, 9, 30], "Biểu đồ thử", "Tháng thử", "Đơn vị thử"),
      trendCase("trend-flat", "Chi phí vượt doanh thu", [3, 4, 5, 6], [5, 5, 5, 5], [7, 6, 9, 12.5], "Lỗ liên tục", "Kỳ", "Tiền"),
    ];
    const rankCases: FunctionCase[] = [
      exampleCase("rank-example", "Ví dụ trong đề", [categories, values, rankTitle, "Doanh thu (triệu đồng)"], returns(rankFigure(categories, values, rankTitle, "Doanh thu (triệu đồng)"), "Axes")),
      rankCase("rank-ascending", "Dữ liệu đã xếp tăng dần phải được xếp lại giảm dần", ["a", "b", "c"], [1, 2, 3], "Thử", "Số lượng"),
      rankCase("rank-tie", "Hai mục bằng nhau: giữ thứ tự tên tăng dần", ["tra", "banh", "ca phe"], [5, 7.5, 7.5], "Thử hòa", "Đơn vị"),
    ];

    return {
      learner: {
        objective: "Dựng hai biểu đồ có ý nghĩa bằng Matplotlib: một biểu đồ đường so sánh hai chuỗi và một biểu đồ cột xếp hạng.",
        context:
          "Đoạn mã đã `import matplotlib.pyplot as plt`. Viết hai hàm, mỗi hàm tự tạo một biểu đồ bằng `plt.subplots()` và TRẢ VỀ đối tượng Axes (không gọi `plt.show()` trong hàm): " +
          "`plot_trend(months, revenue, cost, title, xlabel, ylabel)` vẽ HAI đường theo `months`: đường doanh thu có nhãn \"Doanh thu\" vẽ TRƯỚC, đường chi phí có nhãn \"Chi phí\" vẽ sau; đặt tiêu đề, nhãn trục x, nhãn trục y bằng các tham số và hiện chú giải (legend). " +
          "`plot_ranking(categories, values, title, ylabel)` vẽ biểu đồ CỘT với các mục xếp theo giá trị GIẢM DẦN (hai mục bằng nhau thì xếp theo tên tăng dần), đặt tiêu đề và nhãn trục y. " +
          "Cuối cùng gán `ax_trend` và `ax_rank` là Axes trả về khi gọi hai hàm với dữ liệu trong tab Dữ liệu. Biểu đồ bạn vẽ sẽ hiện ra trong phần kết quả sau khi chạy.",
        data,
      },
      runtime: { setupData: data },
      grading: {
        data: {
          axTrend: trendFigure(months, revenue, cost, trendTitle, "Tháng", "Triệu đồng"),
          axRank: rankFigure(categories, values, rankTitle, "Doanh thu (triệu đồng)"),
          trendCases: asJson(trendCases),
          rankCases: asJson(rankCases),
        },
      },
    };
  },
};

// ---------------------------------------------------------------------------------------
// PF-24 (M10-09) - debug misleading visualizations
// ---------------------------------------------------------------------------------------

interface FinanceRow {
  readonly month: number;
  readonly region: string;
  readonly revenue: number;
  readonly cost: number;
}

const FINANCE_DTYPES = { month: "int64", region: "str", revenue: "float64", cost: "float64" } as const;

const financeFrame = (rows: readonly FinanceRow[]): PyValue =>
  frame(["month", "region", "revenue", "cost"], rows.map((row) => [row.month, row.region, row.revenue, row.cost]), {
    dtypes: FINANCE_DTYPES,
  });

function profitByMonth(rows: readonly FinanceRow[]): { months: number[]; profit: number[] } {
  const months = [...new Set(rows.map((row) => row.month))].sort((a, b) => a - b);
  return {
    months,
    profit: months.map((month) => sumOf(rows.filter((row) => row.month === month).map((row) => row.revenue - row.cost))),
  };
}

function revenueByRegion(rows: readonly FinanceRow[]): { regions: string[]; revenue: number[] } {
  const regions = [...new Set(rows.map((row) => row.region))].sort(compareText);
  return {
    regions,
    revenue: regions.map((region) => sumOf(rows.filter((row) => row.region === region).map((row) => row.revenue))),
  };
}

export const pf24Generator: MissionGenerator = {
  generate({ rng }) {
    const shop = rng.pick(SHOPS);
    const monthCount = rng.nextInt(4, 7);
    const regions = rng.shuffle(REGIONS).slice(0, rng.nextInt(2, 4));
    const rows: FinanceRow[] = [];
    // Rows are interleaved (not grouped by month) so a missing groupby is visible in the chart.
    for (const region of regions) {
      for (const month of range(1, monthCount + 1)) {
        rows.push({ month, region, revenue: rng.nextInt(40, 121) / 2, cost: rng.nextInt(10, 60) / 2 });
      }
    }
    const shuffled = rng.shuffle(rows);

    const profitTitle = `Lợi nhuận theo tháng — ${shop}`;
    const regionTitle = `Doanh thu theo vùng — ${shop}`;
    const data = {
      finance: {
        month: shuffled.map((row) => row.month),
        region: shuffled.map((row) => row.region),
        revenue: shuffled.map((row) => row.revenue),
        cost: shuffled.map((row) => row.cost),
      } as { [key: string]: JsonValue },
      profit_title: profitTitle,
      x_label: "Tháng",
      y_label: "Lợi nhuận (triệu đồng)",
      region_title: regionTitle,
    };

    const profitFigure = (source: readonly FinanceRow[], title: string, xlabel: string, ylabel: string): PyValue => {
      const grouped = profitByMonth(source);
      return figure({
        title,
        xlabel,
        ylabel,
        legend: [PROFIT_LABEL],
        series: [{ kind: "line", x: grouped.months, y: grouped.profit, label: PROFIT_LABEL }],
      });
    };
    const regionFigure = (source: readonly FinanceRow[], title: string): PyValue => {
      const grouped = revenueByRegion(source);
      return figure({ title, ylabel: "Doanh thu", series: [{ kind: "bar", x: grouped.regions, y: grouped.revenue }] });
    };

    const tiny: FinanceRow[] = [
      { month: 2, region: "Nam", revenue: 20, cost: 5 },
      { month: 1, region: "Bắc", revenue: 10, cost: 12 },
      { month: 2, region: "Bắc", revenue: 15.5, cost: 4.5 },
      { month: 1, region: "Nam", revenue: 6, cost: 1 },
    ];
    const oneMonth: FinanceRow[] = [
      { month: 3, region: "Tây", revenue: 8, cost: 2 },
      { month: 3, region: "Trung", revenue: 9, cost: 20 },
    ];

    const profitCases: FunctionCase[] = [
      exampleCase("profit-example", "Ví dụ trong đề", [financeFrame(shuffled), profitTitle, "Tháng", "Lợi nhuận (triệu đồng)"], returns(profitFigure(shuffled, profitTitle, "Tháng", "Lợi nhuận (triệu đồng)"), "Axes")),
      hiddenCase("profit-tiny", "Bảng nhỏ, tiêu đề và nhãn khác, tháng không theo thứ tự", [financeFrame(tiny), "Thử", "Kỳ", "Lãi"], returns(profitFigure(tiny, "Thử", "Kỳ", "Lãi"), "Axes")),
      hiddenCase("profit-one-month", "Chỉ có một tháng, có vùng lỗ", [financeFrame(oneMonth), "Một tháng", "Tháng", "Lãi"], returns(profitFigure(oneMonth, "Một tháng", "Tháng", "Lãi"), "Axes")),
    ];
    const regionCases: FunctionCase[] = [
      exampleCase("region-example", "Ví dụ trong đề", [financeFrame(shuffled), regionTitle], returns(regionFigure(shuffled, regionTitle), "Axes")),
      hiddenCase("region-tiny", "Bảng nhỏ, tiêu đề khác", [financeFrame(tiny), "Thử vùng"], returns(regionFigure(tiny, "Thử vùng"), "Axes")),
      hiddenCase("region-one", "Mỗi vùng chỉ có một dòng", [financeFrame(oneMonth), "Một dòng mỗi vùng"], returns(regionFigure(oneMonth, "Một dòng mỗi vùng"), "Axes")),
    ];

    return {
      learner: {
        objective: "Tìm và sửa các lỗi khiến hai biểu đồ gây hiểu lầm: sai phép tổng hợp, sai trục, sai nhãn và thiếu chú giải.",
        context:
          "`finance` là bảng doanh thu và chi phí theo tháng và theo vùng (mỗi cặp tháng-vùng một dòng, thứ tự dòng bị xáo trộn). Hai hàm vẽ bên dưới chạy được nhưng cho biểu đồ SAI. Hãy sửa chúng, đừng viết lại từ đầu. " +
          "`plot_monthly_profit(df, title, xlabel, ylabel)` phải vẽ MỘT đường: trục x là các tháng theo thứ tự tăng dần, trục y là LỢI NHUẬN của tháng đó = tổng (doanh thu − chi phí) của mọi vùng; đường có nhãn \"Lợi nhuận\", có chú giải, và tiêu đề / nhãn trục lấy từ các tham số. " +
          "`plot_region_revenue(df, title)` phải vẽ biểu đồ CỘT: mỗi vùng đúng một cột, các vùng xếp theo tên tăng dần, chiều cao là TỔNG doanh thu của vùng, tiêu đề lấy từ tham số và nhãn trục y là \"Doanh thu\". " +
          "Cả hai hàm trả về Axes. Gán `ax_profit` và `ax_region` là kết quả khi gọi với `df` dựng từ `finance`. Đối chiếu biểu đồ hiện ra với các bảng số bạn tự tính để thấy chúng sai ở đâu.",
        data,
      },
      runtime: { setupData: data },
      grading: {
        data: {
          axProfit: profitFigure(shuffled, profitTitle, "Tháng", "Lợi nhuận (triệu đồng)"),
          axRegion: regionFigure(shuffled, regionTitle),
          profitCases: asJson(profitCases),
          regionCases: asJson(regionCases),
        },
      },
    };
  },
};
