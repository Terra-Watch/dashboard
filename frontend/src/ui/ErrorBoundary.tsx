import { Component, type ErrorInfo, type ReactNode } from 'react';

/** A screen that crashes shows what to do instead of a blank page. The failure itself is only logged to the console. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('screen crashed', error, info.componentStack); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="mx-auto max-w-xl space-y-3 p-6">
        <h1 className="text-2xl">Something went wrong on this screen</h1>
        <p>Your reports are safe. Reload the page, or go back to your reports. If anyone is in danger, call the emergency number.</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => window.location.reload()} className="min-h-11 rounded-rq bg-action px-4 font-bold text-on-action">Reload</button>
          <a href="/" className="inline-flex min-h-11 items-center font-semibold underline">Home</a>
        </div>
      </div>
    );
  }
}
