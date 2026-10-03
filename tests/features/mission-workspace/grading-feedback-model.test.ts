import { describe, expect, it } from "vitest";

import {
  DeclarativeGraderCheckType,
  GraderFailureCategory,
  type GraderResult,
} from "../../../src/core/grading";
import { toGradingFeedbackModel } from "../../../src/features/mission-workspace/grading-feedback";

function serializedFeedback(result: GraderResult): string {
  return JSON.stringify(toGradingFeedbackModel(result));
}

describe("toGradingFeedbackModel", () => {
  it("renders a concise pass state without exposing passed-check expectations", () => {
    const result: GraderResult = {
      passed: true,
      checks: [
        {
          type: DeclarativeGraderCheckType.EXACT_VALUES,
          passed: true,
          variable: "result",
          expected: { secret: "PASSED_SECRET_83921" },
          actual: { secret: "PASSED_SECRET_83921" },
        },
      ],
    };

    const model = toGradingFeedbackModel(result);

    expect(model).toEqual({
      passed: true,
      summary: "Bài làm đạt yêu cầu.",
      items: [],
    });
    expect(JSON.stringify(model)).not.toContain("PASSED_SECRET_83921");
  });

  it("renders structured Python exception type/message without traceback-like trailing lines", () => {
    const result: GraderResult = {
      passed: false,
      checks: [
        {
          type: DeclarativeGraderCheckType.NO_EXCEPTION,
          passed: false,
          category: GraderFailureCategory.RUNTIME_ERROR,
          message: "RAW_CHECK_MESSAGE_MUST_NOT_RENDER",
        },
      ],
      runtimeError: {
        type: "ValueError",
        message: "boom\nTraceback: INTERNAL_TRACE_MUST_NOT_RENDER",
      },
    };

    const text = serializedFeedback(result);

    expect(text).toContain("Mã Python gặp lỗi khi chạy.");
    expect(text).toContain("ValueError: boom");
    expect(text).not.toContain("INTERNAL_TRACE_MUST_NOT_RENDER");
    expect(text).not.toContain("RAW_CHECK_MESSAGE_MUST_NOT_RENDER");
  });

  it("uses safe timeout copy without exposing recovery codes or messages", () => {
    const result: GraderResult = {
      passed: false,
      checks: [
        {
          type: DeclarativeGraderCheckType.NO_EXCEPTION,
          passed: false,
          category: GraderFailureCategory.RUNTIME_ERROR,
        },
      ],
      runtimeError: {
        type: "EXECUTION_TIMEOUT_RECOVERY_FAILED",
        message: "INTERNAL_RECOVERY_DETAIL",
      },
    };

    const text = serializedFeedback(result);

    expect(text).toContain("Mã chạy quá thời gian cho phép.");
    expect(text).not.toContain("EXECUTION_TIMEOUT_RECOVERY_FAILED");
    expect(text).not.toContain("INTERNAL_RECOVERY_DETAIL");
  });

  it("names a missing variable without exposing an expected answer", () => {
    const result: GraderResult = {
      passed: false,
      checks: [
        {
          type: DeclarativeGraderCheckType.EXACT_VALUES,
          passed: false,
          variable: "result",
          category: GraderFailureCategory.MISSING_VARIABLE,
          expected: { secret: "MISSING_SECRET" },
        },
      ],
    };

    const text = serializedFeedback(result);

    expect(text).toContain("result");
    expect(text).not.toContain("MISSING_SECRET");
  });

  it("shows safe expected/actual Python type strings", () => {
    const result: GraderResult = {
      passed: false,
      checks: [
        {
          type: DeclarativeGraderCheckType.PYTHON_TYPE,
          passed: false,
          variable: "result",
          category: GraderFailureCategory.TYPE_ERROR,
          expected: "ndarray",
          actual: "list",
        },
      ],
    };

    const model = toGradingFeedbackModel(result);

    expect(model.items[0]).toMatchObject({
      kind: "type",
      expected: "ndarray",
      actual: "list",
    });
  });

  it("uses dedicated ndarray copy without rendering boolean internals", () => {
    const result: GraderResult = {
      passed: false,
      checks: [
        {
          type: DeclarativeGraderCheckType.NDARRAY_TYPE,
          passed: false,
          variable: "result",
          category: GraderFailureCategory.TYPE_ERROR,
          expected: true,
          actual: false,
        },
      ],
    };

    const model = toGradingFeedbackModel(result);

    expect(model.items[0]).toEqual({
      kind: "type",
      title: "Biến “result” cần là một NumPy ndarray.",
    });
  });

  it("formats expected/actual shapes because shape metadata is safe", () => {
    const result: GraderResult = {
      passed: false,
      checks: [
        {
          type: DeclarativeGraderCheckType.SHAPE,
          passed: false,
          variable: "result",
          category: GraderFailureCategory.SHAPE_ERROR,
          expected: [4, 1],
          actual: [4],
        },
      ],
    };

    expect(toGradingFeedbackModel(result).items[0]).toMatchObject({
      kind: "shape",
      expected: "[4, 1]",
      actual: "[4]",
    });
  });

  it("hides VALUE_ERROR expected, actual, and raw message payloads", () => {
    const result: GraderResult = {
      passed: false,
      checks: [
        {
          type: DeclarativeGraderCheckType.EXACT_VALUES,
          passed: false,
          variable: "result",
          category: GraderFailureCategory.VALUE_ERROR,
          expected: [1, 2, 3, 4],
          actual: [1, 2, 3, 9],
          message: "Expected secret answer DO_NOT_LEAK_MESSAGE",
        },
      ],
    };

    const text = serializedFeedback(result);

    expect(text).toContain("Biến “result” có giá trị chưa khớp yêu cầu.");
    expect(text).not.toContain("[1,2,3,4]");
    expect(text).not.toContain("[1,2,3,9]");
    expect(text).not.toContain("DO_NOT_LEAK_MESSAGE");
  });

  it("does not leak hidden object payloads", () => {
    const result: GraderResult = {
      passed: false,
      checks: [
        {
          type: DeclarativeGraderCheckType.EXACT_VALUES,
          passed: false,
          variable: "answer",
          category: GraderFailureCategory.VALUE_ERROR,
          expected: { secret: "DO_NOT_LEAK_83921" },
          actual: { secret: "learner-value" },
        },
      ],
    };

    const text = serializedFeedback(result);

    expect(text).not.toContain("DO_NOT_LEAK_83921");
    expect(text).not.toContain("learner-value");
  });

  it("preserves authored failed-check order and omits successful checks", () => {
    const result: GraderResult = {
      passed: false,
      checks: [
        {
          type: DeclarativeGraderCheckType.VARIABLE_EXISTS,
          passed: true,
          variable: "result",
        },
        {
          type: DeclarativeGraderCheckType.PYTHON_TYPE,
          passed: false,
          variable: "result",
          category: GraderFailureCategory.TYPE_ERROR,
          expected: "ndarray",
          actual: "list",
        },
        {
          type: DeclarativeGraderCheckType.SHAPE,
          passed: false,
          variable: "result",
          category: GraderFailureCategory.SHAPE_ERROR,
          expected: [4, 1],
          actual: [4],
        },
        {
          type: DeclarativeGraderCheckType.EXACT_VALUES,
          passed: false,
          variable: "result",
          category: GraderFailureCategory.VALUE_ERROR,
          expected: [1, 2],
          actual: [1, 9],
        },
      ],
    };

    expect(
      toGradingFeedbackModel(result).items.map((item) => item.kind),
    ).toEqual(["type", "shape", "value"]);
  });

  it("ignores conceptualGuidance and semanticResult arbitrary JSON", () => {
    const result: GraderResult = {
      passed: false,
      checks: [
        {
          type: DeclarativeGraderCheckType.VARIABLE_EXISTS,
          passed: false,
          variable: "result",
          category: GraderFailureCategory.MISSING_VARIABLE,
        },
      ],
      conceptualGuidance: { messages: ["GUIDANCE_SECRET_NOT_RENDERED"] },
      semanticResult: { secret: "SEMANTIC_SECRET_NOT_RENDERED" },
    };

    const text = serializedFeedback(result);

    expect(text).not.toContain("GUIDANCE_SECRET_NOT_RENDERED");
    expect(text).not.toContain("SEMANTIC_SECRET_NOT_RENDERED");
  });

  it("falls back safely for a future failure category at a loose runtime boundary", () => {
    const result = {
      passed: false,
      checks: [
        {
          type: DeclarativeGraderCheckType.VARIABLE_EXISTS,
          passed: false,
          category: "FUTURE_ERROR",
          message: "FUTURE_INTERNAL_DETAIL",
        },
      ],
    } as unknown as GraderResult;

    const text = serializedFeedback(result);

    expect(text).toContain("Kết quả chưa đạt một yêu cầu của bài.");
    expect(text).not.toContain("FUTURE_INTERNAL_DETAIL");
  });
  it("extracts the terminal Python exception from a real traceback and hides cascade failures", () => {
    const result: GraderResult = {
      passed: false,
      checks: [
        {
          type: DeclarativeGraderCheckType.NO_EXCEPTION,
          passed: false,
          category: GraderFailureCategory.RUNTIME_ERROR,
        },
        {
          type: DeclarativeGraderCheckType.VARIABLE_EXISTS,
          passed: false,
          variable: "shape_result",
          category: GraderFailureCategory.MISSING_VARIABLE,
        },
        {
          type: DeclarativeGraderCheckType.SHAPE,
          passed: false,
          variable: "result",
          category: GraderFailureCategory.SHAPE_ERROR,
          expected: [4, 1],
        },
      ],
      runtimeError: {
        type: "AttributeError",
        message:
          `Traceback (most recent call last):\n  File "/lib/python314.zip/_pyodide/_base.py", line 619, in eval_code_async\nAttributeError: 'list' object has no attribute 'shape'`,
      },
    };

    const model = toGradingFeedbackModel(result);
    const text = JSON.stringify(model);

    expect(model.items).toEqual([
      {
        kind: "runtime",
        title: "Mã Python gặp lỗi khi chạy.",
        detail: "AttributeError: 'list' object has no attribute 'shape'",
      },
    ]);
    expect(text).not.toContain("Traceback");
    expect(text).not.toContain("/lib/python314.zip");
    expect(text).not.toContain("shape_result");
    expect(text).not.toContain("[4, 1]");
  });

  it("deduplicates identical learner feedback while preserving first-authored order", () => {
    const result: GraderResult = {
      passed: false,
      checks: [
        {
          type: DeclarativeGraderCheckType.VARIABLE_EXISTS,
          passed: false,
          variable: "result",
          category: GraderFailureCategory.MISSING_VARIABLE,
        },
        {
          type: DeclarativeGraderCheckType.PYTHON_TYPE,
          passed: false,
          variable: "result",
          category: GraderFailureCategory.MISSING_VARIABLE,
        },
        {
          type: DeclarativeGraderCheckType.VARIABLE_EXISTS,
          passed: false,
          variable: "shape_result",
          category: GraderFailureCategory.MISSING_VARIABLE,
        },
      ],
    };

    expect(toGradingFeedbackModel(result).items).toEqual([
      { kind: "missing-variable", title: "Chưa tìm thấy biến “result”." },
      { kind: "missing-variable", title: "Chưa tìm thấy biến “shape_result”." },
    ]);
  });

});
