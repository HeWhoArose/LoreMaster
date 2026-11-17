import React from 'react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  /** Pass a key-like prop that, when it changes, auto-clears the error */
  resetKey?: string | null;
}

interface State {
  hasError: boolean;
  error: Error | null;
  prevResetKey?: string | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null, prevResetKey: undefined };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    // Auto-reset when the resetKey changes (e.g. user switches games)
    if (props.resetKey !== undefined && props.resetKey !== state.prevResetKey) {
      return { hasError: false, error: null, prevResetKey: props.resetKey };
    }
    return null;
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] Caught error:', error, '\nComponent stack:', info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="flex-1 flex items-center justify-center bg-bg p-8">
            <div className="card p-6 max-w-md text-center">
              <div className="text-2xl mb-2">⚠️</div>
              <h2 className="text-lg font-semibold text-text-primary mb-2">Something went wrong</h2>
              <p className="text-sm text-text-muted mb-4">{this.state.error?.message}</p>
              <button
                className="btn btn-primary"
                onClick={() => this.setState({ hasError: false, error: null })}
              >
                Try again
              </button>
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
