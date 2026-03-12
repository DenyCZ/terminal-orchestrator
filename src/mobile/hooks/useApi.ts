import { useCallback } from 'react'

const getToken = () => localStorage.getItem('authToken') || ''

export function useApi() {
  const request = useCallback(async (endpoint: string, options: RequestInit = {}) => {
    const token = getToken()
    
    const response = await fetch(`${window.location.origin}/api${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      },
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Request failed' }))
      throw new Error(errorData.message || `HTTP ${response.status}`)
    }
    
    // Handle 204 No Content
    if (response.status === 204) {
      return
    }
    
    return response.json()
  }, [])
  
  const authenticate = useCallback(async (pin: string) => {
    const response = await fetch(`${window.location.origin}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Authentication failed' }))
      throw new Error(errorData.message || 'Authentication failed')
    }
    
    return response.json()
  }, [])
  
  const getProjects = useCallback(() => request('/projects'), [request])
  
  const startTerminal = useCallback((projectId: string, terminalId: string) => 
    request(`/terminals/${terminalId}/start`, {
      method: 'POST',
      body: JSON.stringify({ projectId })
    }), [request])
  
  const stopTerminal = useCallback((projectId: string, terminalId: string) =>
    request(`/terminals/${terminalId}/stop`, {
      method: 'POST',
      body: JSON.stringify({ projectId })
    }), [request])
  
  const createTerminal = useCallback((
    projectId: string,
    name: string,
    shellType: string,
    workingDirectory: string,
    startupCommand?: string
  ) => request(`/projects/${projectId}/terminals`, {
    method: 'POST',
    body: JSON.stringify({ name, shellType, workingDirectory, startupCommand })
  }), [request])
  
  const deleteTerminal = useCallback((projectId: string, terminalId: string) =>
    request(`/terminals/${terminalId}`, {
      method: 'DELETE',
      body: JSON.stringify({ projectId })
    }), [request])
  
  const getAvailableShells = useCallback(() => request('/shells'), [request])
  
  return {
    authenticate,
    getProjects,
    startTerminal,
    stopTerminal,
    createTerminal,
    deleteTerminal,
    getAvailableShells,
  }
}
