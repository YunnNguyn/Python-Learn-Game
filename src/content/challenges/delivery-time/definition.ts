/*
 * "Dự đoán thời gian giao hàng" - challenge definition (version 1).
 *
 * Versioning rule (M13.2): a changed solution, dataset or metric MUST ship as a new
 * `version`, with new public files under a new `.../v<N>/` folder.
 */
export const DELIVERY_TIME_DEFINITION = {
  id: "delivery-time",
  version: "1",
  title: "Dự đoán thời gian giao hàng",
  metric: "mae",
  idColumn: "order_id",
  targetColumn: "delivery_minutes",
  targetType: "numeric",
  limits: { maxSubmissionBytes: 64 * 1024, maxRows: 200 },
} as const;
