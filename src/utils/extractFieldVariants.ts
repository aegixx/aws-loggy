/**
 * Extracts a field value from a JSON object, checking multiple casing variants
 * and nested metadata locations.
 *
 * Checks in order:
 * 1. json[fieldName] - original casing
 * 2. json[FieldName] - PascalCase variant
 * 3. json.metadata[fieldName] - original casing in metadata
 * 4. json.metadata[FieldName] - PascalCase variant in metadata
 *
 * @param json - The parsed JSON object to search
 * @param fieldName - The base field name (e.g., "requestId", "traceId")
 * @returns The field value as a string, or null if not found
 */
export function extractFieldVariants(
  json: Record<string, unknown> | null | undefined,
  fieldName: string,
): string | null {
  if (!json) return null;

  // Try lowercase/original casing at top level
  const topLevelValue = json[fieldName];
  if (typeof topLevelValue === "string") return topLevelValue;

  // Try PascalCase at top level (e.g., RequestId)
  const pascalCaseField =
    fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
  const topLevelPascalValue = json[pascalCaseField];
  if (typeof topLevelPascalValue === "string") return topLevelPascalValue;

  // Check metadata object
  const metadata = json.metadata as Record<string, unknown> | undefined;
  if (!metadata) return null;

  // Try lowercase/original casing in metadata
  const metadataValue = metadata[fieldName];
  if (typeof metadataValue === "string") return metadataValue;

  // Try PascalCase in metadata
  const metadataPascalValue = metadata[pascalCaseField];
  if (typeof metadataPascalValue === "string") return metadataPascalValue;

  return null;
}

/**
 * Extract multiple field variants at once.
 * Useful when you need several fields from the same JSON object.
 *
 * @param json - The parsed JSON object to search
 * @param fieldNames - Array of base field names to extract
 * @returns Object with field names as keys and extracted values (or null)
 */
export function extractMultipleFields(
  json: Record<string, unknown> | null | undefined,
  fieldNames: string[],
): Record<string, string | null> {
  const result: Record<string, string | null> = {};
  for (const fieldName of fieldNames) {
    result[fieldName] = extractFieldVariants(json, fieldName);
  }
  return result;
}
