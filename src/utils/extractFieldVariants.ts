/**
 * Converts camelCase to snake_case
 * e.g., "requestId" -> "request_id", "clientIP" -> "client_ip"
 */
function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Extracts a field value from a JSON object, checking multiple casing variants
 * and nested metadata locations.
 *
 * Checks in order (for both top-level and metadata):
 * 1. json[fieldName] - original casing (camelCase)
 * 2. json[FieldName] - PascalCase variant
 * 3. json[field_name] - snake_case variant
 *
 * @param json - The parsed JSON object to search
 * @param fieldName - The base field name in camelCase (e.g., "requestId", "traceId")
 * @returns The field value as a string, or null if not found
 */
export function extractFieldVariants(
  json: Record<string, unknown> | null | undefined,
  fieldName: string,
): string | null {
  if (!json) return null;

  // Generate casing variants
  const pascalCaseField =
    fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
  const snakeCaseField = toSnakeCase(fieldName);

  // Helper to check all casing variants in an object
  const tryExtract = (obj: Record<string, unknown>): string | null => {
    // Try original casing (camelCase)
    const camelValue = obj[fieldName];
    if (typeof camelValue === "string") return camelValue;

    // Try PascalCase (e.g., RequestId)
    const pascalValue = obj[pascalCaseField];
    if (typeof pascalValue === "string") return pascalValue;

    // Try snake_case (e.g., request_id)
    const snakeValue = obj[snakeCaseField];
    if (typeof snakeValue === "string") return snakeValue;

    return null;
  };

  // Try top-level
  const topLevelResult = tryExtract(json);
  if (topLevelResult !== null) return topLevelResult;

  // Try nested in metadata
  const metadata = json.metadata as Record<string, unknown> | undefined;
  if (metadata) {
    const metadataResult = tryExtract(metadata);
    if (metadataResult !== null) return metadataResult;
  }

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
