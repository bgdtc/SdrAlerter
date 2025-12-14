import axios from 'axios'

// Détecter automatiquement l'URL de l'API
// Si VITE_API_URL est défini, l'utiliser, sinon utiliser le même hostname que la page actuelle
function getApiBaseUrl(): string {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL
  }
  
  // Utiliser le même hostname que la page actuelle, avec le port 3000 pour l'API
  const hostname = window.location.hostname
  const protocol = window.location.protocol
  return `${protocol}//${hostname}:3000`
}

export const API_BASE_URL = getApiBaseUrl()

export function getApiUrl(path: string): string {
  // S'assurer que le path commence par /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE_URL}${normalizedPath}`
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

// Instance axios configurée avec la bonne URL de base
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
})

