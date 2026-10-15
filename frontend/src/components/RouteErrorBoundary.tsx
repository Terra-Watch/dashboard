import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State { return { error }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('TerraWatch route failed', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <section className="shell-page" role="alert"><span className="eyebrow">Page unavailable</span><h1>This page could not be displayed.</h1><p className="muted">Something went wrong. The rest of TerraWatch may still be available. Return to the map or try again later.</p><button onClick={() => { this.setState({ error: null }); history.pushState({}, '', '/app/map'); window.dispatchEvent(new PopStateEvent('popstate')); }}>Return to map</button></section>;
  }
}
