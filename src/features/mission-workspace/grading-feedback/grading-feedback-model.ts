import {
  DeclarativeGraderCheckType,
  GraderFailureCategory,
  type GraderCheckResult,
  type GraderResult,
} from "../../../core/grading";

export type GradingFeedbackItemKind =
  | "runtime"
  | "missing-variable"
  | "type"
  | "shape"
  | "value"
  | "general";

export interface GradingFeedbackItem {
  readonly kind: GradingFeedbackItemKind;
  readonly title: string;
  readonly detail?: string;
  readonly expected?: string;
  readonly actual?: string;
}

export interface GradingFeedbackModel {
  readonly passed: boolean;
  readonly summary: string;
  readonly items: readonly GradingFeedbackItem[];
}

const PASS_SUMMARY = "Bài làm đạt yêu cầu.";
const FAIL_SUMMARY = "Bài làm chưa đạt yêu cầu.";
const GENERIC_FAILURE = "Kết quả chưa đạt một yêu cầu của bài.";
const MAX_EXCEPTION_MESSAGE_LENGTH = 320;

export function toGradingFeedbackModel(
  result: GraderResult,
): GradingFeedbackModel {
  if (result.passed) {
    return {
      passed: true,
      summary: PASS_SUMMARY,
      items: [],
    };
  }

  const items = result.checks
    .filter((check) => !check.passed)
    .map((check) => toFeedbackItem(check, result));

  return {
    passed: false,
    summary: FAIL_SUMMARY,
    items:
      items.length > 0
        ? items
        : [{ kind: "general", title: GENERIC_FAILURE }],
  };
}

function toFeedbackItem(
  check: GraderCheckResult,
  result: GraderResult,
): GradingFeedbackItem {
  switch (check.category as string | undefined) {
    case GraderFailureCategory.RUNTIME_ERROR:
      return runtimeFeedback(result);
    case GraderFailureCategory.MISSING_VARIABLE:
      return {
        kind: "missing-variable",
        title: check.variable
          ? `Chưa tìm thấy biến “${check.variable}”.`
          : "Chưa tìm thấy biến kết quả cần kiểm tra.",
      };
    case GraderFailureCategory.TYPE_ERROR:
      return typeFeedback(check);
    case GraderFailureCategory.SHAPE_ERROR:
      return shapeFeedback(check);
    case GraderFailureCategory.VALUE_ERROR:
      return {
        kind: "value",
        title: check.variable
          ? `Biến “${check.variable}” có giá trị chưa khớp yêu cầu.`
          : "Giá trị kết quả chưa khớp yêu cầu.",
      };
    default:
      return {
        kind: "general",
        title: GENERIC_FAILURE,
      };
  }
}

function runtimeFeedback(result: GraderResult): GradingFeedbackItem {
  const runtimeError = result.runtimeError;
  const type = runtimeError?.type?.trim();

  if (type && type.toUpperCase().includes("TIMEOUT")) {
    return {
      kind: "runtime",
      title: "Mã chạy quá thời gian cho phép.",
    };
  }

  if (type && isLearnerPythonExceptionType(type)) {
    const message = sanitizeExceptionMessage(runtimeError?.message);
    return {
      kind: "runtime",
      title: "Mã Python gặp lỗi khi chạy.",
      ...(message ? { detail: `${type}: ${message}` } : { detail: type }),
    };
  }

  return {
    kind: "runtime",
    title: "Môi trường chạy Python gặp sự cố.",
  };
}

function typeFeedback(check: GraderCheckResult): GradingFeedbackItem {
  if (check.type === DeclarativeGraderCheckType.NDARRAY_TYPE) {
    return {
      kind: "type",
      title: check.variable
        ? `Biến “${check.variable}” cần là một NumPy ndarray.`
        : "Kết quả cần là một NumPy ndarray.",
    };
  }

  const expected =
    typeof check.expected === "string" ? check.expected : undefined;
  const actual = typeof check.actual === "string" ? check.actual : undefined;

  return {
    kind: "type",
    title: check.variable
      ? `Kiểu dữ liệu của biến “${check.variable}” chưa đúng.`
      : "Kiểu dữ liệu của kết quả chưa đúng.",
    ...(expected === undefined ? {} : { expected }),
    ...(actual === undefined ? {} : { actual }),
  };
}

function shapeFeedback(check: GraderCheckResult): GradingFeedbackItem {
  const expected = formatShape(check.expected);
  const actual = formatShape(check.actual);

  return {
    kind: "shape",
    title: check.variable
      ? `Kích thước của biến “${check.variable}” chưa đúng.`
      : "Kích thước kết quả chưa đúng.",
    ...(expected === undefined ? {} : { expected }),
    ...(actual === undefined ? {} : { actual }),
    ...(actual === undefined
      ? { detail: "Chưa đọc được kích thước hiện tại." }
      : {}),
  };
}

function formatShape(value: GraderCheckResult["expected"]): string | undefined {
  if (
    !Array.isArray(value) ||
    !value.every(
      (dimension) =>
        typeof dimension === "number" &&
        Number.isSafeInteger(dimension) &&
        dimension >= 0,
    )
  ) {
    return undefined;
  }

  return `[${value.join(", ")}]`;
}

function isLearnerPythonExceptionType(type: string): boolean {
  return (
    /^[A-Za-z_][A-Za-z0-9_.]*$/.test(type) &&
    (type.endsWith("Error") || type.endsWith("Exception"))
  );
}

function sanitizeExceptionMessage(message: string | undefined): string | undefined {
  const firstLine = message
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine) {
    return undefined;
  }

  return firstLine.length <= MAX_EXCEPTION_MESSAGE_LENGTH
    ? firstLine
    : `${firstLine.slice(0, MAX_EXCEPTION_MESSAGE_LENGTH - 1)}…`;
}
