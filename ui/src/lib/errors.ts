import { AxiosError } from 'axios'

/* What to put on the screen when a call did not go through.

   The reason the server gives is shown as it is, because it is written for
   people. What is never shown is the machinery behind it — a status code, a
   route, whether the handler exists yet. That lives in the code and in
   context/backend_requests.md, not in front of a doctor. */
export function errorText(error: unknown, fallback: string): string {
  if (error instanceof AxiosError) {
    const message = (error.response?.data as { message?: string } | undefined)?.message
    if (message && !/^\s*$/.test(message)) return message
    if (!error.response) return 'Сервис не отвечает. Проверьте соединение и попробуйте ещё раз.'
  }
  return fallback
}
