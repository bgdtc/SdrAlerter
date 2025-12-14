const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export function getApiUrl(path: string): string {
  return `${API_BASE_URL}${path}`
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = getApiUrl(path)
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Erreur inconnue' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }

  return response.json()
}

