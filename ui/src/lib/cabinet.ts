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

export const EMPTY_CABINET: ICabinet = {
  intake: 'device',
  clinic: '',
  room: '',
  device: '',
  software: '',
}

export function readCabinet(): ICabinet {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return EMPTY_CABINET
    return { ...EMPTY_CABINET, ...(JSON.parse(raw) as Partial<ICabinet>) }
  } catch {
    return EMPTY_CABINET
  }
}

export function writeCabinet(cabinet: ICabinet) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cabinet))
  } catch {
    /* a blocked storage must not break the station */
  }
}

/* Until the room is filled in, the header says so instead of showing the name
   of somebody else's clinic. */
export const isConfigured = (cabinet: ICabinet) => !!cabinet.clinic.trim()
