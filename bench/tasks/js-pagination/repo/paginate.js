export function paginate(items, options = {}) {
  const limit = options.limit ?? 10
  const offset = options.offset ?? 0

  return {
    data: items.slice(offset, offset + limit),
    total: items.length,
    limit,
    offset,
  }
}
