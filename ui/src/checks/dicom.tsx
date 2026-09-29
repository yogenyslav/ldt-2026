/* Проверяем передачу тегов DICOM в группировку и экраны без браузера. */
import './storage'

import assert from 'node:assert/strict'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { renderToStaticMarkup } from 'react-dom/server'
import { ToastProvider } from '@/components/ui/toast'
import StudyWidget from '@/components/widgets/StudyWidget'
import QueueWidget from '@/components/widgets/QueueWidget'
import PostWidget from '@/components/widgets/PostWidget'
import CabinetProvider from '@/context/CabinetContext'
import StationProvider from '@/context/StationContext'
import { DEFAULT_CABINET, writeCabinet } from '@/lib/cabinet'
import { newSession, writeSession } from '@/lib/station'
import { enrichJob } from '@/lib/dicom'
import { groupByStudy } from '@/lib/verdict'
import type { IDicomInfo, IJobInfo } from '@/types'

const job: IJobInfo = {
  id: 'analysis-job-id',
  dicom_id: 'orthanc-instance-id',
  status: 'completed',
  study_id: 'orthanc-study-id',
  created_at: new Date().toISOString(),
}
const dicom: IDicomInfo = {
  id: job.dicom_id,
  study_id: 'orthanc-study-id',
  dicom_study_uid: '1.2.840.10008.12345',
  patient_id: 'PATIENT-12345',
}

const enriched = enrichJob(job, dicom)
assert.equal(enriched.patient_ref, dicom.patient_id)
assert.equal(enriched.dicom_study_uid, dicom.dicom_study_uid)
assert.equal(enriched.study_id, dicom.study_id)
assert.equal(job.patient_ref, undefined, 'Исходная задача не изменяется')

const second = enrichJob({ ...job, id: 'second-job' }, { ...dicom, study_id: 'other-orthanc-id' })
const studies = groupByStudy([enriched, second])
assert.equal(studies.length, 1, 'Один StudyInstanceUID объединяет снимки')
assert.equal(studies[0].study_id, dicom.dicom_study_uid)
assert.equal(studies[0].jobs.length, 2)
assert.equal(groupByStudy([enriched, { ...second, dicom_study_uid: 'different-study' }]).length, 2)
assert.equal(groupByStudy([{ ...enriched, patient_ref: '' }, second])[0].patient_ref, dicom.patient_id)

const fallback = enrichJob({ ...job, metadata: { patient_ref: 'known-patient' } }, { ...dicom, patient_id: '  ' })
assert.equal(fallback.patient_ref, 'known-patient', 'Пустой тег не затирает известного пациента')

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
client.setQueryData(['job', job.id], job)
client.setQueryData(['jobs', 50, 0, {}], [job])
client.setQueryData(['jobs', 'latest', ['clinic']], [job])
client.setQueryData(['dicom-info', job.dicom_id], dicom)

const draw = (node: ReactNode) => renderToStaticMarkup(
  <QueryClientProvider client={client}>
    <MemoryRouter>
      <ToastProvider>{node}</ToastProvider>
    </MemoryRouter>
  </QueryClientProvider>,
)

const studyHtml = draw(<StudyWidget jobId={job.id} />)
assert.ok(studyHtml.includes(dicom.patient_id!))
assert.ok(studyHtml.includes(dicom.dicom_study_uid!))
assert.ok(!studyHtml.includes(job.id), 'В карточке не показывается идентификатор задачи вместо исследования')

const queueHtml = draw(<QueueWidget />)
assert.ok(queueHtml.includes(dicom.patient_id!))
assert.ok(queueHtml.includes(dicom.dicom_study_uid!))

writeCabinet({ ...DEFAULT_CABINET, intake: 'upload' })
writeSession(newSession(job.id))

const station = (node: ReactNode) => (
  <CabinetProvider>
    <StationProvider>{node}</StationProvider>
  </CabinetProvider>
)
assert.ok(draw(station(<PostWidget />)).includes(dicom.patient_id!), 'Пациент виден после ручной загрузки')

client.setQueryData(['dicom-info', job.dicom_id], { ...dicom, patient_id: '' })
assert.ok(draw(station(<PostWidget />)).includes('Пациент —'), 'Исследование не подменяет отсутствующего пациента')

client.clear()
writeSession(null)
console.log('Проверки тегов DICOM, очереди, карточки и рабочего места лаборанта пройдены')
