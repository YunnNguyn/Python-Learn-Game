import {
  ContentDefinitionKind,
  type ContentDefinitionSet,
} from "./duplicate-id-validator";

export interface ContentSchemaSupport {
  readonly supportedSchemaVersions: readonly number[];
}

export const UnsupportedSchemaVersionIssueCode = {
  UNSUPPORTED_SCHEMA_VERSION: "UNSUPPORTED_SCHEMA_VERSION",
} as const;

export interface UnsupportedSchemaVersionIssue {
  readonly code: typeof UnsupportedSchemaVersionIssueCode.UNSUPPORTED_SCHEMA_VERSION;
  readonly sourceKind: typeof ContentDefinitionKind.PACK;
  readonly sourceId: string;
  /** Zero-based position within the packs input. */
  readonly sourceIndex: number;
  readonly schemaVersion: number;
  readonly supportedSchemaVersions: readonly number[];
  readonly message: string;
}

function formatSupportedSchemaVersions(
  supportedSchemaVersions: readonly number[],
): string {
  return supportedSchemaVersions.length === 0
    ? "none"
    : supportedSchemaVersions.join(", ");
}

export function validateSchemaVersions(
  definitions: ContentDefinitionSet,
  support: ContentSchemaSupport,
): readonly UnsupportedSchemaVersionIssue[] {
  const supportedSchemaVersions = new Set(support.supportedSchemaVersions);
  const issues: UnsupportedSchemaVersionIssue[] = [];

  (definitions.packs ?? []).forEach((pack, sourceIndex) => {
    if (supportedSchemaVersions.has(pack.schemaVersion)) {
      return;
    }

    const supportedSnapshot = [...support.supportedSchemaVersions];

    issues.push({
      code: UnsupportedSchemaVersionIssueCode.UNSUPPORTED_SCHEMA_VERSION,
      sourceKind: ContentDefinitionKind.PACK,
      sourceId: pack.id,
      sourceIndex,
      schemaVersion: pack.schemaVersion,
      supportedSchemaVersions: supportedSnapshot,
      message: `Unsupported content schema version ${pack.schemaVersion} for PACK "${pack.id}"; supported schema versions: ${formatSupportedSchemaVersions(supportedSnapshot)}.`,
    });
  });

  return issues;
}
