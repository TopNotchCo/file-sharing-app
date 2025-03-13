import { useState, useEffect, useCallback } from "react"
import debounce from "lodash/debounce"

const MOBILE_BREAKPOINT = 768
const DEBOUNCE_DELAY = 100

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth < MOBILE_BREAKPOINT
  })

  const handleResize = useCallback(
    debounce(() => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }, DEBOUNCE_DELAY),
    []
  )

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    handleResize()
    mql.addEventListener("change", handleResize)
    return () => {
      mql.removeEventListener("change", handleResize)
      handleResize.cancel()
    }
  }, [handleResize])

  return isMobile
}
