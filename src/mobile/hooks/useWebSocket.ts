import { useEffect, useRef, useCallback, useState } from 'react'

export function useWebSocket(isAuthenticated: boolean) {
  const wsRef = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const messageHandlers = useRef<Set<(data: any) => void>>(new Set())
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  const connect = useCallback(() => {
    const token = localStorage.getItem('authToken')
    
    if (!token || !isAuthenticated) return
    
    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close()
    }
    
    const wsUrl = window.location.origin.replace('http', 'ws') + `/ws/terminal?token=${token}`
    
    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws
      
      ws.onopen = () => {
        console.log('WebSocket connected')
        setConnected(true)
      }
      
      ws.onclose = () => {
        console.log('WebSocket disconnected')
        setConnected(false)
        
        // Attempt to reconnect after 3 seconds
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current)
        }
        reconnectTimeoutRef.current = setTimeout(() => {
          if (isAuthenticated) {
            connect()
          }
        }, 3000)
      }
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          messageHandlers.current.forEach(handler => handler(data))
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
      }
    } catch (error) {
      console.error('Failed to create WebSocket:', error)
    }
  }, [isAuthenticated])
  
  useEffect(() => {
    if (isAuthenticated) {
      connect()
    }
    
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [isAuthenticated, connect])
  
  const subscribe = useCallback((terminalId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'subscribe',
        terminalId
      }))
    }
  }, [])
  
  const unsubscribe = useCallback((terminalId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'unsubscribe',
        terminalId
      }))
    }
  }, [])
  
  const sendInput = useCallback((terminalId: string, data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'input',
        terminalId,
        data
      }))
    }
  }, [])
  
  const sendResize = useCallback((terminalId: string, cols: number, rows: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'resize',
        terminalId,
        cols,
        rows
      }))
    }
  }, [])
  
  const onMessage = useCallback((handler: (data: any) => void) => {
    messageHandlers.current.add(handler)
  }, [])
  
  const offMessage = useCallback((handler: (data: any) => void) => {
    messageHandlers.current.delete(handler)
  }, [])
  
  return {
    connected,
    subscribe,
    unsubscribe,
    sendInput,
    sendResize,
    onMessage,
    offMessage,
  }
}
