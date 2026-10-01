import type {
  Concept,
  ConceptId,
  ContentPackId,
  ContentPackManifest,
  Course,
  CourseId,
  LearningActivity,
  LearningActivityId,
  Lesson,
  LessonId,
  MissionTemplate,
  MissionTemplateId,
  World,
  WorldId,
} from "../domain";

export class ContentRegistry {
  private readonly packs = new Map<ContentPackId, ContentPackManifest>();
  private readonly concepts = new Map<ConceptId, Concept>();
  private readonly courses = new Map<CourseId, Course>();
  private readonly worlds = new Map<WorldId, World>();
  private readonly lessons = new Map<LessonId, Lesson>();
  private readonly activities = new Map<LearningActivityId, LearningActivity>();
  private readonly missionTemplates = new Map<
    MissionTemplateId,
    MissionTemplate
  >();

  registerPack(pack: ContentPackManifest): void {
    this.registerUnique(this.packs, pack.id, pack, "ContentPackManifest");
  }

  registerConcept(concept: Concept): void {
    this.registerUnique(this.concepts, concept.id, concept, "Concept");
  }

  registerCourse(course: Course): void {
    this.registerUnique(this.courses, course.id, course, "Course");
  }

  registerWorld(world: World): void {
    this.registerUnique(this.worlds, world.id, world, "World");
  }

  registerLesson(lesson: Lesson): void {
    this.registerUnique(this.lessons, lesson.id, lesson, "Lesson");
  }

  registerActivity(activity: LearningActivity): void {
    this.registerUnique(
      this.activities,
      activity.id,
      activity,
      "LearningActivity",
    );
  }

  registerMissionTemplate(template: MissionTemplate): void {
    this.registerUnique(
      this.missionTemplates,
      template.id,
      template,
      "MissionTemplate",
    );
  }

  getPack(id: ContentPackId): ContentPackManifest | undefined {
    return this.packs.get(id);
  }

  getConcept(id: ConceptId): Concept | undefined {
    return this.concepts.get(id);
  }

  getCourse(id: CourseId): Course | undefined {
    return this.courses.get(id);
  }

  getWorld(id: WorldId): World | undefined {
    return this.worlds.get(id);
  }

  getLesson(id: LessonId): Lesson | undefined {
    return this.lessons.get(id);
  }

  getActivity(id: LearningActivityId): LearningActivity | undefined {
    return this.activities.get(id);
  }

  getMissionTemplate(id: MissionTemplateId): MissionTemplate | undefined {
    return this.missionTemplates.get(id);
  }

  getPacks(): ReadonlyArray<ContentPackManifest> {
    return [...this.packs.values()];
  }

  getConcepts(): ReadonlyArray<Concept> {
    return [...this.concepts.values()];
  }

  getCourses(): ReadonlyArray<Course> {
    return [...this.courses.values()];
  }

  getWorlds(): ReadonlyArray<World> {
    return [...this.worlds.values()];
  }

  getLessons(): ReadonlyArray<Lesson> {
    return [...this.lessons.values()];
  }

  getActivities(): ReadonlyArray<LearningActivity> {
    return [...this.activities.values()];
  }

  getMissionTemplates(): ReadonlyArray<MissionTemplate> {
    return [...this.missionTemplates.values()];
  }

  private registerUnique<TKey, TValue>(
    registry: Map<TKey, TValue>,
    id: TKey,
    value: TValue,
    category: string,
  ): void {
    if (registry.has(id)) {
      throw new Error(`${category} already registered: ${String(id)}`);
    }

    registry.set(id, value);
  }
}
