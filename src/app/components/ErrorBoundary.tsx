import { Component, type ErrorInfo, type ReactNode } from 'react';

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Unexpected application error.',
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Keep console telemetry for debugging in web and Android logcat.
    console.error('NET360 UI runtime error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
          <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
            <h1 className="mb-2 text-xl text-rose-700">Something went wrong</h1>
            <p className="mb-4 text-sm text-slate-600">
              The app hit an unexpected issue. Please retry. If this keeps happening, contact support.
            </p>
            <p className="mb-5 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">{this.state.message}</p>
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex h-10 items-center justify-center rounded-md bg-indigo-600 px-4 text-sm text-white hover:bg-indigo-500"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
