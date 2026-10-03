import type { ContentRegistry } from "../../core/content";
import { CS116_PRODUCTION_CONTENT } from "./production-content";

export function registerCs116ProductionContent(registry: ContentRegistry): void {
  for (const pack of CS116_PRODUCTION_CONTENT.packs) registry.registerPack(pack);
  for (const concept of CS116_PRODUCTION_CONTENT.concepts)
    registry.registerConcept(concept);
  for (const course of CS116_PRODUCTION_CONTENT.courses)
    registry.registerCourse(course);
  for (const world of CS116_PRODUCTION_CONTENT.worlds) registry.registerWorld(world);
  for (const lesson of CS116_PRODUCTION_CONTENT.lessons)
    registry.registerLesson(lesson);
  for (const activity of CS116_PRODUCTION_CONTENT.activities)
    registry.registerActivity(activity);
  for (const template of CS116_PRODUCTION_CONTENT.missionTemplates)
    registry.registerMissionTemplate(template);
}
