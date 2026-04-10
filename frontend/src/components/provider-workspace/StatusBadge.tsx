import { Badge } from '../ui'
import type { AppointmentStatus } from '../../api/types'
import { statusLabel, statusTone } from './types'

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  return <Badge tone={statusTone(status)}>{statusLabel(status)}</Badge>
}

