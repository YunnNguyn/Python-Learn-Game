import {
  CS116_PRODUCTION_CONTENT,
  registerCs116Generators,
  registerCs116ProductionContent,
} from "../../content/cs116";
import { ContentRegistry, validateContent } from "../../core/content";
import {
  Difficulty,
  LearningActivityType,
  type LearningActivityId,
} from "../../core/domain";
import { GeneratorRegistry } from "../../core/generators";
import { GraderRegistry, registerCoreGraders } from "../../core/grading";
import { MissionAttemptSession } from "../../core/learning";
import { generateMissionInstance, MissionEngine } from "../../core/missions";
import { CORE_RUNTIME_ID, type RuntimeSystemError } from "../../core/runtime";
import { createPyodideRuntimeManager } from "../../core/runtime/pyodide";

export interface PlayableMissionSession {
  readonly session: MissionAttemptSession;
}

export type CreateMissionSessionResult =
  | { readonly ok: true; readonly value: PlayableMissionSession }
  | { readonly ok: false; readonly error: RuntimeSystemError };

export interface ApplicationServices {
  readonly content: ContentRegistry;
  readonly generators: GeneratorRegistry;
  readonly graders: GraderRegistry;
  createMissionSession(activityId: string): Promise<CreateMissionSessionResult>;
}

export function createApplicationServices(): ApplicationServices {
  const content = new ContentRegistry();
  const generators = new GeneratorRegistry();
  const graders = new GraderRegistry();

  registerCs116Generators(generators);
  registerCoreGraders(graders);

  const validation = validateContent(CS116_PRODUCTION_CONTENT, {
    extensionCapabilities: {
      generatorIds: generators.getGeneratorIds(),
      graderIds: graders.getGraderIds(),
      runtimeIds: [CORE_RUNTIME_ID.PYODIDE],
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

  return {
    content,
    generators,
    graders,
    async createMissionSession(activityId) {
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

      let instance;
      try {
        instance = generateMissionInstance({
          template,
          generatorRegistry: generators,
          baseSeed: `first-play:${activity.id}:v${template.version}`,
          difficulty: Difficulty.EASY,
        }).instance;
      } catch (error) {
        return failure(
          "MISSION_GENERATION_FAILED",
          getErrorMessage(error, "Không thể tạo dữ liệu cho nhiệm vụ."),
        );
      }

      const runtime = createPyodideRuntimeManager();
      const engine = new MissionEngine(runtime, graders);
      const loaded = await engine.loadMission(template, instance);
      if (!loaded.ok) {
        engine.dispose();
        return { ok: false, error: loaded.error };
      }

      return {
        ok: true,
        value: {
          session: new MissionAttemptSession(activity, template, instance, engine),
        },
      };
    },
  };
}

function failure(code: string, message: string): CreateMissionSessionResult {
  return { ok: false, error: { code, message } };
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : fallback;
}
