/**
 * Redis Streams replies encode fields as a flat alternating list:
 * `[field, value, field, value]`.  Some test doubles return tuples instead,
 * so accept both shapes at this boundary and keep consumers format-agnostic.
 */
export type RedisStreamFields = string[] | [string, string][];

export type RedisStreamEntry = [string, RedisStreamFields];

export type RedisStreamReadResponse = [string, RedisStreamEntry[]][];

export type RedisAutoClaimResponse = [string, RedisStreamEntry[], string[]];

export function streamField(
  entry: RedisStreamEntry | undefined,
  expectedField: string,
): string | undefined {
  const fields = entry?.[1];
  if (!fields?.length) return undefined;

  const first = fields[0];
  if (Array.isArray(first)) {
    for (const pair of fields as [string, string][]) {
      if (pair[0] === expectedField) return pair[1];
    }
    return undefined;
  }

  for (let index = 0; index + 1 < fields.length; index += 2) {
    if (fields[index] === expectedField) return fields[index + 1] as string;
  }
  return undefined;
}
