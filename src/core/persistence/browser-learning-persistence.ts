import { IndexedDbLearningPersistence } from "./indexeddb-learning-persistence";
import { MemoryLearningPersistence } from "./memory-learning-persistence";
import { ResilientLearningPersistence } from "./resilient-learning-persistence";
import type { LearningPersistence } from "./learning-persistence";

export function createBrowserLearningPersistence(): LearningPersistence {
  if (typeof indexedDB === "undefined") {
    return new MemoryLearningPersistence();
  }

  return new ResilientLearningPersistence(new IndexedDbLearningPersistence(indexedDB));
}
