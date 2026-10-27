/** Learner-facing text and public file links of a challenge. Contains no solution data. */
export interface ChallengePresentation {
  readonly id: string;
  readonly shortDescription: string;
  readonly problem: readonly string[];
  readonly columns: readonly { readonly name: string; readonly description: string; readonly where: string }[];
  readonly files: readonly { readonly filename: string; readonly url: string; readonly description: string }[];
  readonly sampleSubmissionUrl: string;
  readonly submissionExample: string;
  readonly hints: readonly string[];
}
