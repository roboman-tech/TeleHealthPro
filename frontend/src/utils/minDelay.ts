export async function minDelay<T>(p: Promise<T>, ms: number): Promise<T> {
  const [v] = await Promise.all([p, new Promise<void>((r) => window.setTimeout(r, ms))])
  return v
}

