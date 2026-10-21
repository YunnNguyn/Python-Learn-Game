import sampleText from "../../src/content/examples/ml-basics.linreg-numpy.pack.json?raw";

/** The exact text a learner would import: the trusted sample pack shipped with the repo. */
export const SAMPLE_PACK_TEXT: string = sampleText;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Loose = any;

/** A fresh, mutable copy of the sample pack as a plain object. */
export function makePack(): Loose {
  return JSON.parse(SAMPLE_PACK_TEXT);
}

/** A minimal valid pack with one tiny exercise (fast to mutate in tests). */
export function makeMinimalPack(): Loose {
  return {
    format: "python-learn-game.exercise-pack",
    schemaVersion: 1,
    pack: {
      id: "mini.pack",
      version: "1.0.0",
      title: "Mini",
      description: "Pack nhỏ",
      language: "python",
      topic: "Thử nghiệm",
    },
    exercises: [
      {
        id: "ex-one",
        revision: 1,
        kind: "code",
        title: "Bài một",
        difficulty: "easy",
        instructions: "Gán `answer = 3`.",
        starterCode: "answer = None\n",
        grading: {
          checks: [
            { type: "NO_EXCEPTION" },
            { type: "EXACT_VALUES", variable: "answer", expected: 3 },
          ],
        },
      },
    ],
  };
}
