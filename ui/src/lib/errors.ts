import { AxiosError } from 'axios'

/* What to put on the screen when a call did not go through.

   The reason the server gives is shown as it is, because it is written for
   people. What is never shown is the machinery behind it — a status code, a
   route, whether the handler exists yet. That lives in the code and in
   context/backend_requests.md, not in front of a doctor. */
/* An upload the server turned down. The same scan cannot be sent twice: the
   answer is 403 (or 409 by the contract), and the doctor should hear why. */
export function uploadErrorText(error: unknown, fallback: string): string {
  if (error instanceof AxiosError && (error.response?.status === 403 || error.response?.status === 409)) {
    return 'Извините, повторно загружать такой же снимок нельзя.'
  }
  return errorText(error, fallback)
}

export function errorText(error: unknown, fallback: string): string {
  if (error instanceof AxiosError) {
    const message = (error.response?.data as { message?: string } | undefined)?.message
    if (message && !/^\s*$/.test(message)) return message
    if (!error.response) return 'Сервис не отвечает. Проверьте соединение и попробуйте ещё раз.'
  }
  return fallback
}
