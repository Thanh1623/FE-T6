/** Stub — worker không có cookie request Next. */

export async function cookies(): Promise<{ getAll: () => []; set: () => void }> {
  return {
    getAll: () => [],
    set: () => undefined,
  };
}