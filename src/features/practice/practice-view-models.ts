import type {
  InstallPracticePackOutcome,
  PracticeDifficulty,
  PracticeReadError,
} from "../../app/services";
import type { ExercisePack, ExercisePackIssue } from "../../core/exercise-packs";
import { utf8ByteLength } from "../../core/exercise-packs";

/** Plain-text view models for the practice screens: no React, no I/O, easy to test. */

export type NoticeTone = "success" | "info" | "error";

export interface PracticeNotice {
  readonly tone: NoticeTone;
  readonly title: string;
  readonly detail: string;
}

export function difficultyLabel(difficulty: PracticeDifficulty): string {
  switch (difficulty) {
    case "easy":
      return "Dễ";
    case "hard":
      return "Khó";
    default:
      return "Vừa";
  }
}

export function kindLabel(kind: "code" | "debug"): string {
  return kind === "debug" ? "Sửa lỗi" : "Viết mã";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

export function describeInstallOutcome(outcome: InstallPracticePackOutcome): PracticeNotice {
  switch (outcome.status) {
    case "installed":
      return {
        tone: "success",
        title: `Đã cài đặt "${outcome.pack.title}"`,
        detail:
          "Pack đã được lưu bền vững trong IndexedDB của trình duyệt trên thiết bị này. Bạn có thể tải lại trang và pack vẫn còn.",
      };
    case "already-installed":
      return {
        tone: "info",
        title: `"${outcome.pack.title}" đã được cài đặt`,
        detail: "Nội dung pack giống hệt bản đã cài nên không có gì thay đổi.",
      };
    case "rejected":
      return {
        tone: "error",
        title: "Pack không hợp lệ",
        detail: "Không có gì được lưu. Hãy sửa các lỗi bên dưới rồi thử lại.",
      };
    case "conflict":
      return { tone: "error", title: "Mã pack đã tồn tại", detail: outcome.message };
    case "limit-reached":
      return { tone: "error", title: "Đã đạt giới hạn số pack", detail: outcome.message };
    case "storage-unavailable":
      return { tone: "error", title: "Không lưu được pack", detail: outcome.message };
    case "upgrade-blocked":
      return { tone: "error", title: "Kho lưu trữ đang bị chặn", detail: outcome.message };
    case "retired":
      return { tone: "error", title: "Phiên đã đóng", detail: outcome.message };
  }
}

export function describeReadError(error: PracticeReadError): PracticeNotice {
  switch (error.code) {
    case "NOT_FOUND":
      return { tone: "error", title: "Không tìm thấy", detail: error.message };
    case "CORRUPT":
      return { tone: "error", title: "Pack bị hỏng", detail: error.message };
    case "UPGRADE_BLOCKED":
      return { tone: "error", title: "Kho lưu trữ đang bị chặn", detail: error.message };
    case "RETIRED":
      return { tone: "error", title: "Phiên đã đóng", detail: error.message };
    default:
      return { tone: "error", title: "Không đọc được dữ liệu luyện tập", detail: error.message };
  }
}

export interface PackPreviewExercise {
  readonly id: string;
  readonly title: string;
  readonly kind: "code" | "debug";
  readonly difficulty: PracticeDifficulty;
}

/** What the learner is shown to review before installing. */
export interface PackPreview {
  readonly packId: string;
  readonly version: string;
  readonly title: string;
  readonly description: string;
  readonly topic: string;
  readonly author?: string;
  readonly exercises: readonly PackPreviewExercise[];
  readonly packages: readonly string[];
  readonly datasetCount: number;
  readonly datasetBytes: number;
  readonly warnings: readonly ExercisePackIssue[];
}

export function previewPack(pack: ExercisePack, warnings: readonly ExercisePackIssue[]): PackPreview {
  const packages = new Set<string>();
  let datasetCount = 0;
  let datasetBytes = 0;
  for (const exercise of pack.exercises) {
    for (const name of exercise.allowedPackages ?? []) packages.add(name);
    for (const dataset of exercise.datasets ?? []) {
      datasetCount += 1;
      datasetBytes += utf8ByteLength(dataset.content);
    }
  }
  return {
    packId: pack.pack.id,
    version: pack.pack.version,
    title: pack.pack.title,
    description: pack.pack.description,
    topic: pack.pack.topic,
    ...(pack.pack.authoring?.author !== undefined ? { author: pack.pack.authoring.author } : {}),
    exercises: pack.exercises.map((exercise) => ({
      id: exercise.id,
      title: exercise.title,
      kind: exercise.kind,
      difficulty: exercise.difficulty as PracticeDifficulty,
    })),
    packages: [...packages].sort(),
    datasetCount,
    datasetBytes,
    warnings,
  };
}
