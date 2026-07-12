export function resolveApiUrl(apiBase, path) {
  if (path.startsWith('/api') && apiBase) {
    return `${apiBase}${path}`
  }
  return path
}

export function createApiClient(apiBase) {
  return {
    apiBase,
    async fetch(path, init) {
      return fetch(resolveApiUrl(apiBase, path), init)
    },
  }
}
