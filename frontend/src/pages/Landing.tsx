import { Link } from 'react-router-dom'
import { Button, Card } from '../components/ui'

function MedicalCross({ size = 18 }: { size?: number }) {
  const arm = size * 0.28
  const center = size / 2
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden focusable="false">
      <rect x={center - arm / 2} y={1} width={arm} height={size - 2} rx={arm * 0.4} fill="var(--medical-red)" />
      <rect x={1} y={center - arm / 2} width={size - 2} height={arm} rx={arm * 0.4} fill="var(--medical-red)" />
    </svg>
  )
}

export function Landing() {
  return (
    <div className="th-landing">
      <div className="th-aurora" aria-hidden />
      <header className="th-landing-head">
        <div className="th-brand-inline">
          <span className="th-brand-mark" aria-hidden><MedicalCross size={20} /></span>
          <span>TeleHealthPro</span>
        </div>
        <div className="th-landing-actions">
          <Link to="/login">
            <Button variant="ghost">Sign in</Button>
          </Link>
          <Link to="/register">
            <Button>Create account</Button>
          </Link>
        </div>
      </header>

      <section className="th-hero">
        <h1>
          Care that meets you <em>where you are</em>
        </h1>
        <p className="th-hero-lead">
          Secure patient records, intelligent scheduling, and HD telehealth — all orchestrated through one
          HIPAA-minded FastAPI platform.
        </p>
        <div className="th-hero-grid">
          <Card glow>
            <h3>Patients</h3>
            <p>Book visits, review labs, and join encrypted sessions with one tap.</p>
          </Card>
          <Card glow>
            <h3>Providers</h3>
            <p>Clinical context, FHIR-ready data, and session tools in a single pane.</p>
          </Card>
          <Card glow>
            <h3>Operations</h3>
            <p>Live metrics, user governance, and audit hooks for compliance teams.</p>
          </Card>
        </div>
      </section>
    </div>
  )
}
