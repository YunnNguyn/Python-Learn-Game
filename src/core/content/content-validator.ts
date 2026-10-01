import type { ContentDefinitionSet, DuplicateIdIssue } from "./duplicate-id-validator";
import {
  validateDuplicateIds,
} from "./duplicate-id-validator";
import type {
  ExtensionCapabilitySet,
  MissingExtensionIssue,
} from "./extension-id-validator";
import { validateExtensionIds } from "./extension-id-validator";
import type { MissingReferenceIssue } from "./reference-validator";
import { validateReferences } from "./reference-validator";
import type {
  ContentSchemaSupport,
  UnsupportedSchemaVersionIssue,
} from "./schema-version-validator";
import { validateSchemaVersions } from "./schema-version-validator";

export interface ContentValidationContext {
  readonly extensionCapabilities: ExtensionCapabilitySet;
  readonly schemaSupport: ContentSchemaSupport;
}

export type ContentValidationIssue =
  | DuplicateIdIssue
  | MissingReferenceIssue
  | MissingExtensionIssue
  | UnsupportedSchemaVersionIssue;

export interface ContentValidationReport {
  readonly valid: boolean;
  readonly issues: readonly ContentValidationIssue[];
}

export function validateContent(
  definitions: ContentDefinitionSet,
  context: ContentValidationContext,
): ContentValidationReport {
  const issues: ContentValidationIssue[] = [
    ...validateDuplicateIds(definitions),
    ...validateReferences(definitions),
    ...validateExtensionIds(definitions, context.extensionCapabilities),
    ...validateSchemaVersions(definitions, context.schemaSupport),
  ];

  return {
    valid: issues.length === 0,
    issues,
  };
}
