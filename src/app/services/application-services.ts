import {
  CS116_PRODUCTION_CONTENT,
  getCs116MissionInstanceValidator,
  registerCs116Generators,
  registerCs116Hints,
  registerCs116ProductionContent,
} from "../../content/cs116";
import { ContentRegistry, validateContent } from "../../core/content";
import {
  Difficulty,
  LearningActivityType,
  type HintLevel,
  type LearningActivityId,
} from "../../core/domain";
import { GeneratorRegistry } from "../../core/generators";
import { GraderRegistry, registerCoreGraders } from "../../core/grading";
import { HintEngine, HintRegistry } from "../../core/hints";
import { LearningEngine, MissionAttemptSession } from "../../core/learning";
import {
  createBrowserMetaProgressionPersistence,
  MetaProgressionEngine,
} from "../../core/meta-progression";
import { generateMissionInstance, MissionEngine } from "../../core/missions";
import {
  createBrowserLearningPersistence,
  type LearningPersistence,
} from "../../core/persistence";
import { CORE_RUNTIME_ID, type RuntimeSystemError } from "../../core/runtime";
import { createPyodideRuntimeManager } from "../../core/runtime/pyodide";

export interface PlayableMissionSession {
  readonly session: MissionAttemptSession;
  readonly initialCode: string;
  readonly variantIndex: number;
  readonly resumedDraft: boolean;
}

export interface CreateMissionSessionOptions {
  readonly seed?: string;
  readonly variantIndex?: number;
  readonly resumeDraft?: boolean;
  readonly resetCode?: boolean;
}

export type CreateMissionSessionResult =
  | { readonly ok: true; readonly value: PlayableMissionSession }
  | { readonly ok: false; readonly error: RuntimeSystemError };

export interface ApplicationServices {
  readonly content: ContentRegistry;
  readonly generators: GeneratorRegistry;
  readonly graders: GraderRegistry;
  readonly hints: HintRegistry;
  readonly learning: LearningEngine;
  readonly metaProgression: MetaProgressionEngine;
  initialize(): Promise<void>;
  createMissionSession(
    activityId: string,
    options?: CreateMissionSessionOptions,
  ): Promise<CreateMissionSessionResult>;
  saveMissionDraft(input: {
    readonly activityId: LearningActivityId;
    readonly seed: string;
    readonly variantIndex: number;
    readonly code: string;
    readonly hintsUsed: readonly HintLevel[];
  }): Promise<void>;
  deleteMissionDraft(activityId: LearningActivityId): Promise<void>;
  clearLearningData(): Promise<void>;
  getPersistenceKind(): "indexeddb" | "memory";
  getMetaProgressionPersistenceKind(): "indexeddb" | "memory";
}

export function createApplicationServices(): ApplicationServices {
  const content = new ContentRegistry();
  const generators = new GeneratorRegistry();
  const graders = new GraderRegistry();
  const hints = new HintRegistry();
  const persistence = createBrowserLearningPersistence();
  const learning = new LearningEngine(persistence);
  const metaProgression = new MetaProgressionEngine(
    createBrowserMetaProgressionPersistence(),
  );
  let initializePromise: Promise<void> | null = null;

  registerCs116Generators(generators);
  registerCoreGraders(graders);
  registerCs116Hints(hints);

  const validation = validateContent(CS116_PRODUCTION_CONTENT, {
    extensionCapabilities: {
      generatorIds: generators.getGeneratorIds(),
      graderIds: graders.getGraderIds(),
      runtimeIds: [CORE_RUNTIME_ID.PYODIDE],
      hintSetIds: hints.getHintSetIds(),
    },
    schemaSupport: { supportedSchemaVersions: [1] },
  });

  if (!validation.valid) {
    throw new Error(
      `Built-in content validation failed: ${validation.issues
        .map((issue) => issue.message)
        .join(" | ")}`,
    );
  }

  registerCs116ProductionContent(content);

  function initialize(): Promise<void> {
    initializePromise ??= (async () => {
      await learning.initialize();
      await metaProgression.initialize();
      await metaProgression.reconcileAttempts(learning.getAttempts());
    })();
    return initializePromise;
  }

  void initialize();

  return {
    content,
    generators,
    graders,
    hints,
    learning,
    metaProgression,
    initialize,

    async createMissionSession(activityId, options = {}) {
      await initialize();
      const activity = content.getActivity(activityId as LearningActivityId);
      if (activity === undefined) {
        return failure(
          "ACTIVITY_NOT_FOUND",
          "Không tìm thấy hoạt động học cần mở.",
        );
      }

      if (
        activity.type !== LearningActivityType.CODE_MISSION &&
        activity.type !== LearningActivityType.DEBUG_MISSION &&
        activity.type !== LearningActivityType.BOSS_MISSION
      ) {
        return failure(
          "ACTIVITY_NOT_EXECUTABLE",
          "Hoạt động này chưa sử dụng không gian chạy mã Python.",
        );
      }

      const template = content.getMissionTemplate(activity.missionTemplateId);
      if (template === undefined) {
        return failure(
          "MISSION_TEMPLATE_NOT_FOUND",
          "Không tìm thấy cấu hình nhiệm vụ cho hoạt động này.",
        );
      }

      const draft =
        options.seed === undefined && options.resumeDraft !== false
          ? await persistence.getMissionDraft(activity.id)
          : null;
      const variantIndex = options.variantIndex ?? draft?.variantIndex ?? 0;
      const seed =
        options.seed ??
        draft?.seed ??
        deriveActivityVariantSeed(activity.id, template.version, variantIndex);

      let instance;
      try {
        instance = generateMissionInstance({
          template,
          generatorRegistry: generators,
          baseSeed: seed,
          difficulty: Difficulty.EASY,
          validator: getCs116MissionInstanceValidator(template.generator.id),
        }).instance;
      } catch (error) {
        return failure(
          "MISSION_GENERATION_FAILED",
          getErrorMessage(error, "Không thể tạo dữ liệu cho nhiệm vụ."),
        );
      }

      const hintSet = template.hintSetId
        ? hints.getHintSet(template.hintSetId)
        : undefined;
      if (template.hintSetId && !hintSet) {
        return failure(
          "HINT_SET_NOT_FOUND",
          "Không tìm thấy bộ gợi ý của nhiệm vụ.",
        );
      }

      const runtime = createPyodideRuntimeManager();
      const engine = new MissionEngine(runtime, graders);
      const loaded = await engine.loadMission(template, instance);
      if (!loaded.ok) {
        engine.dispose();
        return { ok: false, error: loaded.error };
      }

      const session = new MissionAttemptSession(activity, template, instance, engine, {
        hintEngine: new HintEngine(hintSet ?? null, resumedDraftHintLevels(draft, seed)),
        onAttemptRecord: async (record) => {
          await learning.recordAttempt(record);
          await metaProgression.recordAttempt(record);
        },
      });
      const starterCode =
        instance.learner.starterCode ?? template.starterCode ?? "# Viết mã Python tại đây\n";
      const resumedDraft =
        !options.resetCode && draft !== null && draft.seed === seed;

      return {
        ok: true,
        value: {
          session,
          initialCode: resumedDraft ? draft.code : starterCode,
          variantIndex,
          resumedDraft,
        },
      };
    },

    async saveMissionDraft(input) {
      await persistence.saveMissionDraft({
        ...input,
        updatedAt: new Date().toISOString(),
      });
    },

    deleteMissionDraft(activityId) {
      return persistence.deleteMissionDraft(activityId);
    },

    async clearLearningData() {
      await initialize();
      await learning.clearAttempts();
      await persistence.clearMissionDrafts();
      await metaProgression.clearAll();
    },

    getPersistenceKind() {
      return persistence.kind;
    },

    getMetaProgressionPersistenceKind() {
      return metaProgression.getPersistenceKind();
    },
  };
}

function resumedDraftHintLevels(
  draft: Awaited<ReturnType<LearningPersistence["getMissionDraft"]>>,
  seed: string,
) {
  return draft?.seed === seed ? draft.hintsUsed : [];
}

export function deriveActivityVariantSeed(
  activityId: LearningActivityId,
  templateVersion: number,
  variantIndex: number,
): string {
  if (!Number.isSafeInteger(variantIndex) || variantIndex < 0) {
    throw new RangeError("variantIndex must be a non-negative safe integer.");
  }

  return `play:${activityId}:v${templateVersion}:variant:${variantIndex}`;
}

function failure(code: string, message: string): CreateMissionSessionResult {
  return { ok: false, error: { code, message } };
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : fallback;
}
