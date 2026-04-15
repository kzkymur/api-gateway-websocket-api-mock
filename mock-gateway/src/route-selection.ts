const ROUTE_SELECTION_PREFIX = '$request.body.';

const fallbackSegments = ['action'];

const pickFromObject = (value: unknown, pathSegments: string[]): unknown => {
  let current: unknown = value;

  for (const segment of pathSegments) {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
};

export const parseRouteSelectionExpression = (expression: string): string[] | null => {
  if (!expression.startsWith(ROUTE_SELECTION_PREFIX)) {
    return null;
  }

  const rawPath = expression.slice(ROUTE_SELECTION_PREFIX.length).trim();
  if (!rawPath) {
    return null;
  }

  const segments = rawPath.split('.').filter(Boolean);
  return segments.length > 0 ? segments : null;
};

export const resolveRouteKeyFromText = (messageText: string, expression: string): string => {
  try {
    const parsed = JSON.parse(messageText) as unknown;
    const configuredPath = parseRouteSelectionExpression(expression) ?? fallbackSegments;
    const configuredValue = pickFromObject(parsed, configuredPath);

    if (typeof configuredValue === 'string' && configuredValue.length > 0) {
      return configuredValue;
    }

    const fallbackValue = pickFromObject(parsed, fallbackSegments);
    if (typeof fallbackValue === 'string' && fallbackValue.length > 0) {
      return fallbackValue;
    }

    return '$default';
  } catch {
    return '$default';
  }
};
