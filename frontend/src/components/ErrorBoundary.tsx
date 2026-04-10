import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/** Catches render errors so one bad screen does not blank the whole app without context. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[TeleHealthPro]', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="th-page th-error-boundary">
          <h1>Something went wrong</h1>
          <p className="th-muted">{this.state.error.message}</p>
          <button
            type="button"
            className="th-error-boundary-retry"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
