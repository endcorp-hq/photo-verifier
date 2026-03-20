import { useCallback, useEffect, useRef, useState } from 'react'
import { Animated } from 'react-native'

type NoticeLevel = 'success' | 'error' | 'info'
type NoticeState = {
  level: NoticeLevel
  title: string
  message: string
}

export function useNoticeBanner() {
  const [notice, setNotice] = useState<NoticeState | null>(null)
  const noticeSlideX = useRef(new Animated.Value(360)).current
  const noticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const noticeAnimationRef = useRef<Animated.CompositeAnimation | null>(null)

  const clearNoticeTimer = useCallback(() => {
    if (!noticeTimeoutRef.current) return
    clearTimeout(noticeTimeoutRef.current)
    noticeTimeoutRef.current = null
  }, [])

  const stopNoticeAnimation = useCallback(() => {
    noticeAnimationRef.current?.stop()
    noticeAnimationRef.current = null
  }, [])

  const hideNoticeImmediately = useCallback(() => {
    clearNoticeTimer()
    stopNoticeAnimation()
    noticeSlideX.setValue(360)
    setNotice(null)
  }, [clearNoticeTimer, noticeSlideX, stopNoticeAnimation])

  const dismissNotice = useCallback(() => {
    clearNoticeTimer()
    stopNoticeAnimation()
    const animation = Animated.timing(noticeSlideX, {
      toValue: 360,
      duration: 180,
      useNativeDriver: false,
    })
    noticeAnimationRef.current = animation
    animation.start(({ finished }) => {
      noticeAnimationRef.current = null
      if (finished) setNotice(null)
    })
  }, [clearNoticeTimer, noticeSlideX, stopNoticeAnimation])

  const showNotice = useCallback(
    (payload: NoticeState, autoHideMs = 3400) => {
      clearNoticeTimer()
      stopNoticeAnimation()
      setNotice(payload)
      noticeSlideX.setValue(360)
      const animation = Animated.timing(noticeSlideX, {
        toValue: 0,
        duration: 220,
        useNativeDriver: false,
      })
      noticeAnimationRef.current = animation
      animation.start(() => {
        noticeAnimationRef.current = null
      })
      if (autoHideMs > 0) {
        noticeTimeoutRef.current = setTimeout(() => {
          dismissNotice()
        }, autoHideMs)
      }
    },
    [clearNoticeTimer, dismissNotice, noticeSlideX, stopNoticeAnimation],
  )

  useEffect(() => {
    return () => {
      hideNoticeImmediately()
    }
  }, [hideNoticeImmediately])

  return {
    notice,
    noticeSlideX,
    showNotice,
    dismissNotice,
    hideNoticeImmediately,
  }
}
