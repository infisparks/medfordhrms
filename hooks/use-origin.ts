"use client"

import { useEffect, useState } from "react"

export const useOrigin = () => {
  const [isMounted, setIsMounted] = useState(false)
  const [origin, setOrigin] = useState("")

  useEffect(() => {
    setIsMounted(true)
    setOrigin(window.location.origin)
  }, [])

  if (!isMounted) {
    return null
  }

  return origin
}
