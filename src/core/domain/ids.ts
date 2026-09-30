declare const domainIdBrand: unique symbol;

type DomainId<TBrand extends string> = string & {
  readonly [domainIdBrand]: TBrand;
};

export type ConceptId = DomainId<"ConceptId">;
export type CourseId = DomainId<"CourseId">;
export type WorldId = DomainId<"WorldId">;
export type LessonId = DomainId<"LessonId">;
export type LearningActivityId = DomainId<"LearningActivityId">;

export type MissionTemplateId = DomainId<"MissionTemplateId">;
export type MissionInstanceId = DomainId<"MissionInstanceId">;

export type ContentPackId = DomainId<"ContentPackId">;

export type MissionGeneratorId = DomainId<"MissionGeneratorId">;
export type GraderId = DomainId<"GraderId">;

export type RuntimeId = DomainId<"RuntimeId">;
export type HintSetId = DomainId<"HintSetId">;
export type VisualizationModuleId = DomainId<"VisualizationModuleId">;

export type AttemptRecordId = DomainId<"AttemptRecordId">;
