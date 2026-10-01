import {
  LearningStage,
  type ConceptId,
  type LearningActivityId,
  type LearningStage as LearningStageValue,
} from "../../core/domain";

import { CS116_VERTICAL_SLICE_CONCEPTS } from "./vertical-slice-concepts";

export interface VerticalSliceActivitySkeleton {
  readonly id: LearningActivityId;
  readonly title: string;
  readonly stage: LearningStageValue;
  readonly sourceStageLabel?: string;
  readonly conceptIds: readonly ConceptId[];
}

const [
  numpyArray,
  numpyShape,
  numpyNdim,
  numpyIndexColumn,
  numpyCompare,
  numpyBooleanMask,
  numpyLogicalAnd,
] = CS116_VERTICAL_SLICE_CONCEPTS;

function skeletonId(id: string): LearningActivityId {
  return id as LearningActivityId;
}

export const CS116_VERTICAL_SLICE_ACTIVITY_SKELETONS: readonly VerticalSliceActivitySkeleton[] =
  [
    {
      id: skeletonId("cs116.numpy.vs01"),
      title: "VS-01 — Boot Sensor Grid",
      stage: LearningStage.GUIDED,
      sourceStageLabel: "Discover / Guided",
      conceptIds: [numpyArray!.id, numpyShape!.id, numpyNdim!.id],
    },
    {
      id: skeletonId("cs116.numpy.vs02"),
      title: "VS-02 — Diagnose Telemetry",
      stage: LearningStage.INDEPENDENT,
      conceptIds: [numpyShape!.id, numpyNdim!.id],
    },
    {
      id: skeletonId("cs116.numpy.vs03"),
      title: "VS-03 — Extract Threat Channel",
      stage: LearningStage.INDEPENDENT,
      conceptIds: [numpyIndexColumn!.id, numpyShape!.id],
    },
    {
      id: skeletonId("cs116.numpy.vs04"),
      title: "VS-04 — Radar Filter",
      stage: LearningStage.GUIDED,
      conceptIds: [numpyCompare!.id, numpyBooleanMask!.id],
    },
    {
      id: skeletonId("cs116.numpy.vs05"),
      title: "VS-05 — Radar Filter Variant",
      stage: LearningStage.INDEPENDENT,
      conceptIds: [numpyCompare!.id, numpyBooleanMask!.id],
    },
    {
      id: skeletonId("cs116.numpy.vs06"),
      title: "VS-06 — Hostile Contact",
      stage: LearningStage.TRANSFER,
      conceptIds: [
        numpyIndexColumn!.id,
        numpyCompare!.id,
        numpyBooleanMask!.id,
        numpyLogicalAnd!.id,
      ],
    },
    {
      id: skeletonId("cs116.numpy.vs07"),
      title: "VS-07 — Recall Packet",
      stage: LearningStage.REVIEW,
      sourceStageLabel: "Mixed Review / retention preparation",
      conceptIds: CS116_VERTICAL_SLICE_CONCEPTS.map((concept) => concept.id),
    },
  ];
