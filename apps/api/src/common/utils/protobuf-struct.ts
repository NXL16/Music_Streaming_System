interface ProtobufValueWire {
  nullValue?: number;
  stringValue?: string;
  numberValue?: number;
  boolValue?: boolean;
  structValue?: Record<string, ProtobufValueWire>;
  listValue?: { values?: ProtobufValueWire[] };
}

export function wrapStructInput(
  value: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!value) return undefined;
  if (
    typeof value.fields === 'object' &&
    value.fields !== null &&
    !Array.isArray(value.fields)
  ) {
    return value;
  }
  return {
    fields: Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, wrapStructValue(item)]),
    ),
  };
}

export function wrapStructInputs(
  values: Array<Record<string, unknown>> | undefined,
): Array<Record<string, unknown>> {
  return (values ?? []).map((value) => wrapStructInput(value) ?? {});
}

function wrapStructValue(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return { nullValue: 0 };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') return { numberValue: value };
  if (typeof value === 'boolean') return { boolValue: value };
  if (Array.isArray(value)) {
    return {
      listValue: {
        values: value.map((item: unknown) => wrapStructValue(item)),
      },
    };
  }
  if (typeof value === 'object') {
    return {
      structValue: wrapStructInput(value as Record<string, unknown>),
    };
  }
  return { nullValue: 0 };
}

export function unwrapStructOutput(
  value: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!value) return undefined;
  const fields = value['fields'];
  if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(fields as Record<string, ProtobufValueWire>).map(
      ([key, item]) => [key, unwrapStructValue(item)],
    ),
  );
}

function unwrapStructValue(value: ProtobufValueWire): unknown {
  if ('stringValue' in value) return value.stringValue;
  if ('numberValue' in value) return value.numberValue;
  if ('boolValue' in value) return value.boolValue;
  if ('structValue' in value) {
    return unwrapStructOutput(value.structValue);
  }
  if ('listValue' in value) {
    return (value.listValue?.values ?? []).map((entry) =>
      unwrapStructValue(entry),
    );
  }
  return null;
}
