/** Express 5 @types allow `string | string[]` on named params (wildcard parity). */
export function routeParam(value: string | string[]): string {
  return typeof value === 'string' ? value : (value[0] ?? '');
}
