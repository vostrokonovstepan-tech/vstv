import { useCallback, useRef, useState } from 'react'

export type RecorderState = 'idle' | 'recording' | 'processing'

/** Первый поддерживаемый браузером формат — Whisper-совместимые эндпоинты принимают все три. */
function pickMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
  for (const type of candidates) {
    if (window.MediaRecorder?.isTypeSupported?.(type)) return type
  }
  return ''
}

/**
 * Запись голоса через MediaRecorder. Внутри Telegram WebView доступ к микрофону
 * зависит от версии клиента и платформы — если getUserMedia откажет, об этом
 * сообщается через onError, а не падением.
 */
export function useVoiceRecorder(onDone: (blob: Blob, mimeType: string) => void, onError: (message: string) => void) {
  const [state, setState] = useState<RecorderState>('idle')
  const [seconds, setSeconds] = useState(0)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const cleanup = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    recorderRef.current = null
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    setSeconds(0)
  }, [])

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      onError('Браузер не поддерживает запись звука')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = pickMimeType()
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)

      streamRef.current = stream
      recorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        cleanup()
        if (blob.size < 500) {
          setState('idle')
          onError('Запись слишком короткая')
          return
        }
        setState('processing')
        onDone(blob, recorder.mimeType || 'audio/webm')
      }

      recorder.start()
      setState('recording')
      setSeconds(0)
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
    } catch {
      // NotAllowedError (запрет доступа), NotFoundError (нет микрофона) и т.п. —
      // причина пользователю не важна, важно, что делать дальше.
      onError('Нет доступа к микрофону — разреши его в настройках Telegram')
    }
  }, [cleanup, onDone, onError])

  const stop = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }, [])

  const cancel = useCallback(() => {
    if (recorderRef.current) {
      recorderRef.current.onstop = null
      if (recorderRef.current.state === 'recording') recorderRef.current.stop()
    }
    cleanup()
    setState('idle')
  }, [cleanup])

  const finish = useCallback(() => setState('idle'), [])

  return { state, seconds, start, stop, cancel, finish }
}
