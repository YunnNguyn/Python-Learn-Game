import type { GraderId } from "../domain";

import type { Grader } from "./grader";

export class GraderRegistry {
  private readonly graders = new Map<GraderId, Grader>();

  registerGrader(id: GraderId, grader: Grader): void {
    if (this.graders.has(id)) {
      throw new Error(`Grader ID already registered: ${id}`);
    }

    this.graders.set(id, grader);
  }

  getGrader(id: GraderId): Grader | undefined {
    return this.graders.get(id);
  }

  getGraderIds(): readonly GraderId[] {
    return [...this.graders.keys()];
  }
}
