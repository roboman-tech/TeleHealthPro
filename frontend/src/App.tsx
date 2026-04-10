import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { RequireAuth } from './components/RequireAuth'
import { AdminDashboard } from './pages/admin/Dashboard'
import { AdminLogs } from './pages/admin/Logs'
import { AdminUsers } from './pages/admin/Users'
import { Landing } from './pages/Landing'
import { NotificationsPage } from './pages/NotificationsPage'
import { Login } from './pages/Login'
import { PatientAppointments } from './pages/patient/Appointments'
import { PatientDashboard } from './pages/patient/Dashboard'
import { PatientRecords } from './pages/patient/Records'
import { PatientTelehealth } from './pages/patient/Telehealth'
import { ProviderAvailabilityPage } from './pages/provider/Availability'
import { ProviderAppointments } from './pages/provider/Appointments'
import { ProviderTelehealth } from './pages/provider/Telehealth'
import { ProviderDashboard } from './pages/provider/Dashboard'
import { FhirExplorer } from './pages/provider/FhirExplorer'
import { ProviderWorkspace } from './pages/provider/Workspace'
import { Register } from './pages/Register'
import { SessionJoin } from './pages/SessionJoin'
import { TelehealthMeeting } from './pages/TelehealthMeeting'

const patientNav = [
  { to: '/patient', label: 'Overview', icon: '◆', end: true },
  { to: '/patient/records', label: 'Records', icon: '▤' },
  { to: '/patient/appointments', label: 'Schedule', icon: '◷' },
  { to: '/patient/telehealth', label: 'Telehealth', icon: '◎' },
  { to: '/patient/notifications', label: 'Inbox', icon: '✉', badge: 'unread-notifications' as const },
]

const providerNav = [
  { to: '/provider', label: 'Overview', icon: '◆', end: true },
  { to: '/provider/appointments', label: 'Appointments', icon: '◷' },
  { to: '/provider/availability', label: 'Hours', icon: '◐' },
  { to: '/provider/telehealth', label: 'Telehealth', icon: '◎' },
  { to: '/provider/patients', label: 'Patients', icon: '☰' },
  { to: '/provider/fhir', label: 'FHIR', icon: '⎘' },
  { to: '/provider/notifications', label: 'Inbox', icon: '✉', badge: 'unread-notifications' as const },
]

const adminNav = [
  { to: '/admin', label: 'Overview', icon: '◆', end: true },
  { to: '/admin/users', label: 'Users', icon: '👥' },
  { to: '/admin/logs', label: 'Logs', icon: '≋' },
  { to: '/admin/notifications', label: 'Inbox', icon: '✉', badge: 'unread-notifications' as const },
]

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/session" element={<SessionJoin />} />

      <Route element={<RequireAuth roles={['patient', 'provider', 'admin']} />}>
        <Route path="/meeting" element={<TelehealthMeeting />} />
      </Route>

      <Route element={<RequireAuth roles={['patient']} />}>
        <Route path="/patient" element={<AppShell nav={patientNav} kicker="Patient portal" />}>
          <Route index element={<PatientDashboard />} />
          <Route path="records" element={<PatientRecords />} />
          <Route path="appointments" element={<PatientAppointments />} />
          <Route path="telehealth" element={<PatientTelehealth />} />
          <Route path="notifications" element={<NotificationsPage />} />
        </Route>
      </Route>

      <Route element={<RequireAuth roles={['provider']} />}>
        <Route path="/provider" element={<AppShell nav={providerNav} kicker="Clinical workspace" />}>
          <Route index element={<ProviderDashboard />} />
          <Route path="appointments" element={<ProviderAppointments />} />
          <Route path="availability" element={<ProviderAvailabilityPage />} />
          <Route path="telehealth" element={<ProviderTelehealth />} />
          <Route path="patients" element={<ProviderWorkspace />} />
          <Route path="fhir" element={<FhirExplorer />} />
          <Route path="notifications" element={<NotificationsPage />} />
        </Route>
      </Route>

      <Route element={<RequireAuth roles={['admin']} />}>
        <Route path="/admin" element={<AppShell nav={adminNav} kicker="Administration" />}>
          <Route index element={<AdminDashboard />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="logs" element={<AdminLogs />} />
          <Route path="notifications" element={<NotificationsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
