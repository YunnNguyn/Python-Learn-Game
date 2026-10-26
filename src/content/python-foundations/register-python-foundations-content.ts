import type { ContentRegistry } from "../../core/content";
import { PYTHON_FOUNDATIONS_CONTENT } from "./content";

/** Registers the Python Foundations course next to whatever else the registry holds. */
export function registerPythonFoundationsContent(registry: ContentRegistry): void {
  for (const pack of PYTHON_FOUNDATIONS_CONTENT.packs) registry.registerPack(pack);
  for (const concept of PYTHON_FOUNDATIONS_CONTENT.concepts) registry.registerConcept(concept);
  for (const course of PYTHON_FOUNDATIONS_CONTENT.courses) registry.registerCourse(course);
  for (const world of PYTHON_FOUNDATIONS_CONTENT.worlds) registry.registerWorld(world);
  for (const lesson of PYTHON_FOUNDATIONS_CONTENT.lessons) registry.registerLesson(lesson);
  for (const activity of PYTHON_FOUNDATIONS_CONTENT.activities) registry.registerActivity(activity);
  for (const template of PYTHON_FOUNDATIONS_CONTENT.missionTemplates) {
    registry.registerMissionTemplate(template);
  }
}
