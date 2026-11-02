// Read every page before creating editing defaults. A denied page is never empty data.
export async function workflowRows<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<{ data: T[]; error: { message: string } | null }> {
  const rows: T[] = [];
  try {
    for (let offset = 0; ; ) {
      const result = await read(offset, offset + 499);
      if (result.error) return { data: [], error: result.error };
      if (!result.data?.length) return { data: rows, error: null };
      rows.push(...result.data); offset += result.data.length;
    }
  } catch (error) { return { data: [], error: { message: String(error) } }; }
}
