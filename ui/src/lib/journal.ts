/* Log of faults and wishes kept by the technologist.

   The backend has no endpoint for this: the eleven handlers of dicom-manager are
   about scans, jobs, reports and users. So the log lives in the browser of the
   station and is exported as a file to be sent to the processing centre. When an
   endpoint appears, only the three functions below have to change.

   A complaint about one particular scan has a real channel already — the comment
   on the decision, which does reach the server. This log is for everything else:
   the device stopped sending, the service is slow, a button is missing. */

const KEY = 'dxa_qc_journal'

export type EntryKind = 'fault' | 'wish'

export interface IJournalEntry {
  id: string
  created_at: string
  kind: EntryKind
  text: string
  /* optional reference to a scan, kept as a label as well, so that an exported
     file stays readable outside the interface */
  job_id?: string
  job_label?: string
  author?: string
}

export const KIND_LABEL: Record<EntryKind, string> = {
  fault: 'Сбой',
  wish: 'Пожелание',
}

const stamp = () => {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  )
}

export function readJournal(): IJournalEntry[] {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return []
    return JSON.parse(raw) as IJournalEntry[]
  } catch {
    return []
  }
}

function writeJournal(entries: IJournalEntry[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries))
  } catch {
    /* a blocked storage must not break the station */
  }
}

export function addEntry(entry: Omit<IJournalEntry, 'id' | 'created_at'>) {
  const entries = [
    { ...entry, id: Math.random().toString(16).slice(2, 10), created_at: stamp() },
    ...readJournal(),
  ]
  writeJournal(entries)
  return entries
}

export function removeEntry(id: string) {
  const entries = readJournal().filter((entry) => entry.id !== id)
  writeJournal(entries)
  return entries
}

/* Plain text, so that it can be pasted into a letter or a messenger as is. */
export function journalText(entries: IJournalEntry[], room: string) {
  const head = `Журнал сбоев и пожеланий${room ? `, ${room}` : ''}`
  const lines = entries.map((entry) => {
    const when = entry.created_at.replace('T', ' ')
    const scan = entry.job_label ? ` (снимок: ${entry.job_label}, задача ${entry.job_id})` : ''
    const who = entry.author ? `, ${entry.author}` : ''
    return `${when}${who} — ${KIND_LABEL[entry.kind]}: ${entry.text}${scan}`
  })
  return [head, '', ...lines, ''].join('\r\n')
}
