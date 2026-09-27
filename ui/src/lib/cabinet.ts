/* Settings of one workstation: which way scans arrive and what room this is.

   They live in the browser of the workstation, not on the server and not in a
   config file next to the bundle: the mode describes a particular densitometer
   in a particular room, not a user account — the shift changes, the room does
   not. The technologist switches it in the interface, without reinstalling
   anything. The backend has no endpoint for settings at all.

   Once the backend starts sending metadata.device, the device name will come
   from the scan itself and stop being a field to fill in. */

const KEY = 'dxa_qc_cabinet'

export type Intake = 'device' | 'upload'

export interface ICabinet {
  /* device — the densitometer sends scans to the PACS itself;
     upload — the technologist uploads a file from the station. */
  intake: Intake
  clinic: string
  room: string
  device: string
  software: string
}

/* Filled in at installation: the organisation of the account and the one
   densitometer the service works with. Only the room number is left for the
   technologist — that is the single field nobody can know in advance. */
export const DEFAULT_CABINET: ICabinet = {
  intake: 'device',
  clinic: 'Городская поликлиника № 218',
  room: '',
  device: 'GE Lunar Prodigy Advance',
  software: 'enCORE 18.41.005',
}

const TEXT_FIELDS = ['clinic', 'room', 'device', 'software'] as const

/* An empty stored string means "never filled in", not "deliberately blank", so
   it does not shadow the installation value. Without this an early version of
   the card, which saved on every keystroke, could leave the station with four
   empty fields for good. */
function merge(saved: Partial<ICabinet>): ICabinet {
  const cabinet = { ...DEFAULT_CABINET }

  if (saved.intake === 'device' || saved.intake === 'upload') cabinet.intake = saved.intake

  for (const field of TEXT_FIELDS) {
    const value = saved[field]
    if (typeof value === 'string' && value.trim()) cabinet[field] = value
  }

  return cabinet
}

export function readCabinet(): ICabinet {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return DEFAULT_CABINET
    return merge(JSON.parse(raw) as Partial<ICabinet>)
  } catch {
    return DEFAULT_CABINET
  }
}

export function writeCabinet(cabinet: ICabinet) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cabinet))
  } catch {
    /* a blocked storage must not break the station */
  }
}

/* Until the room is named, the header asks for it instead of pretending the
   station is set up. */
export const isConfigured = (cabinet: ICabinet) => !!cabinet.room.trim()
