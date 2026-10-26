import {
  DeclarativeGraderCheckType,
  GraderFailureCategory,
  FunctionCaseOutcome,
  type GraderCheckResult,
  type GraderFunctionCaseResult,
  type GraderResult,
} from "../../../core/grading";

export type GradingFeedbackItemKind =
  | "runtime"
  | "missing-variable"
  | "type"
  | "shape"
  | "value"
  | "function"
  | "general";

export interface GradingFeedbackItem {
  readonly kind: GradingFeedbackItemKind;
  readonly title: string;
  readonly detail?: string;
  readonly expected?: string;
  readonly actual?: string;
  /** Function checks: one row per case (label + whether it passed), never the expectations. */
  readonly cases?: readonly { readonly label: string; readonly passed: boolean }[];
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

  const failedChecks = result.checks.filter((check) => !check.passed);
  const runtimeFailure = failedChecks.find(
    (check) =>
      check.category === GraderFailureCategory.RUNTIME_ERROR &&
      check.type === DeclarativeGraderCheckType.NO_EXCEPTION,
  );

  // A runtime exception prevents downstream learner variables from being
  // produced reliably. Showing the resulting missing/type/shape/value
  // cascades is noisy and can mislead the learner, so runtime feedback owns
  // the response when present.
  const items = runtimeFailure
    ? [runtimeFeedback(result)]
    : deduplicateFeedbackItems(
        failedChecks.map((check) => toFeedbackItem(check, result)),
      );

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
  if (check.type === DeclarativeGraderCheckType.FUNCTION_CASES) {
    return functionFeedback(check, result);
  }
  if (check.type === DeclarativeGraderCheckType.TYPED_VALUE) {
    return typedValueFeedback(check, result);
  }

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

const MAX_CASE_ROWS = 12;

function functionFeedback(
  check: GraderCheckResult,
  result: GraderResult,
): GradingFeedbackItem {
  const name = check.function ?? "";
  const quoted = name ? `“${name}”` : "cần kiểm tra";

  if (check.cases === undefined) {
    // The function could not be exercised at all.
    if (check.category === GraderFailureCategory.MISSING_VARIABLE) {
      return { kind: "missing-variable", title: `Chưa định nghĩa hàm ${quoted}.` };
    }
    if (check.category === GraderFailureCategory.TYPE_ERROR) {
      return { kind: "type", title: `${quoted} cần là một hàm (def).` };
    }
    return runtimeFeedback(result);
  }

  const total = check.cases.length;
  const passedCount = check.cases.filter((item) => item.passed).length;
  const first = check.cases.find((item) => !item.passed);
  const rows = check.cases
    .slice(0, MAX_CASE_ROWS)
    .map((item) => ({ label: item.label, passed: item.passed }));
  const hidden = total - rows.length;

  return {
    kind: "function",
    title: `Hàm ${quoted} đạt ${passedCount}/${total} ca kiểm tra.`,
    ...(first !== undefined ? { detail: functionCaseDetail(first) } : {}),
    ...(first?.expectedText !== undefined ? { expected: first.expectedText } : {}),
    ...(first?.actualText !== undefined ? { actual: first.actualText } : {}),
    cases:
      hidden > 0
        ? [...rows, { label: `… và ${hidden} ca khác`, passed: true }]
        : rows,
  };
}

/**
 * M10: a TYPED_VALUE check (a DataFrame, Series, ndarray or figure held by a variable).
 * The message comes from the comparison and never contains expected row values.
 */
function typedValueFeedback(
  check: GraderCheckResult,
  result: GraderResult,
): GradingFeedbackItem {
  const name = check.variable ?? "";
  const quoted = name ? `“${name}”` : "cần kiểm tra";
  const first = check.cases?.find((item) => !item.passed);

  if (first === undefined) {
    if (check.category === GraderFailureCategory.MISSING_VARIABLE) {
      return { kind: "missing-variable", title: `Chưa tìm thấy biến ${quoted}.` };
    }
    return runtimeFeedback(result);
  }

  const kind: GradingFeedbackItemKind =
    first.category === GraderFailureCategory.TYPE_ERROR
      ? "type"
      : first.category === GraderFailureCategory.SHAPE_ERROR
        ? "shape"
        : "value";
  return {
    kind,
    title: `Biến ${quoted} chưa khớp yêu cầu.`,
    detail: functionCaseDetail(first, false),
    ...(first.expectedText !== undefined ? { expected: first.expectedText } : {}),
    ...(first.actualText !== undefined ? { actual: first.actualText } : {}),
  };
}

function functionCaseDetail(item: GraderFunctionCaseResult, withCaseLabel = true): string {
  const where = withCaseLabel ? `Ca “${item.label}”${item.call ? ` — ${item.call}` : ""}. ` : "";
  const note = item.message ? ` ${item.message}` : "";
  switch (item.outcome) {
    case FunctionCaseOutcome.RAISED: {
      const message = item.message ? `: ${item.message}` : "";
      return `${where}Hàm gặp lỗi ${item.exceptionType ?? "Exception"}${message}.`;
    }
    case FunctionCaseOutcome.WRONG_VALUE:
      return `${where}${withCaseLabel ? "Hàm trả về" : "Giá trị là"} kết quả chưa khớp yêu cầu.${note}`;
    case FunctionCaseOutcome.WRONG_COLUMNS:
      return `${where}Tên hoặc thứ tự cột chưa đúng.${note}`;
    case FunctionCaseOutcome.WRONG_INDEX:
      return `${where}Chỉ số hàng (index) chưa đúng.${note}`;
    case FunctionCaseOutcome.WRONG_DTYPE:
      return `${where}Kiểu dữ liệu (dtype) chưa đúng.${note}`;
    case FunctionCaseOutcome.WRONG_FIGURE:
      return `${where}Biểu đồ chưa đúng yêu cầu.${note}`;
    case FunctionCaseOutcome.WRONG_TYPE:
      return `${where}Kiểu dữ liệu trả về chưa đúng${
        item.actualType ? ` (nhận được ${item.actualType}${item.message ? `, ${item.message}` : ""})` : ""
      }.`;
    case FunctionCaseOutcome.WRONG_SHAPE:
      return `${where}Kích thước của kết quả chưa đúng.${note}`;
    case FunctionCaseOutcome.NO_EXCEPTION_RAISED:
      return `${where}Hàm cần báo lỗi nhưng đã trả về một giá trị.`;
    case FunctionCaseOutcome.WRONG_EXCEPTION:
      return `${where}Hàm báo lỗi sai loại${item.exceptionType ? ` (${item.exceptionType})` : ""}.`;
    case FunctionCaseOutcome.UNSUPPORTED_RESULT:
      return `${where}Kết quả trả về không kiểm tra được${item.message ? `: ${item.message}` : ""}.`;
    case FunctionCaseOutcome.ARGS_MUTATED:
      return `${where}Hàm đã sửa đổi dữ liệu đầu vào; hãy tạo bản sao thay vì sửa trực tiếp.`;
    default:
      return where.trim();
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
    const message = sanitizeExceptionMessage(runtimeError?.message, type);
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

function sanitizeExceptionMessage(
  message: string | undefined,
  exceptionType: string,
): string | undefined {
  const lines = message
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (!lines || lines.length === 0) {
    return undefined;
  }

  const typePrefix = `${exceptionType}:`;
  const terminalExceptionLine = [...lines]
    .reverse()
    .find((line) => line.startsWith(typePrefix));

  let safeMessage = terminalExceptionLine
    ? terminalExceptionLine.slice(typePrefix.length).trim()
    : isSafeStandaloneExceptionLine(lines[0])
      ? lines[0]
      : undefined;

  if (safeMessage?.startsWith(typePrefix)) {
    safeMessage = safeMessage.slice(typePrefix.length).trim();
  }

  if (!safeMessage) {
    return undefined;
  }

  return safeMessage.length <= MAX_EXCEPTION_MESSAGE_LENGTH
    ? safeMessage
    : `${safeMessage.slice(0, MAX_EXCEPTION_MESSAGE_LENGTH - 1)}…`;
}


function isSafeStandaloneExceptionLine(line: string | undefined): line is string {
  if (!line) {
    return false;
  }

  const normalized = line.trim();
  if (!normalized) {
    return false;
  }

  return !(
    normalized.startsWith("Traceback") ||
    normalized.startsWith("File ") ||
    normalized.startsWith("at ") ||
    normalized.includes("_pyodide/_base.py") ||
    normalized.includes("pyodide-runtime.worker")
  );
}

function deduplicateFeedbackItems(
  items: readonly GradingFeedbackItem[],
): GradingFeedbackItem[] {
  const seen = new Set<string>();
  const unique: GradingFeedbackItem[] = [];

  for (const item of items) {
    const key = JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  return unique;
}
