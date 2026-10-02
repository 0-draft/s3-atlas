import { Component, type ReactNode } from 'react';

type Props = { children: ReactNode; message: string; action: string };

export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="wrap page-head" role="alert">
        <p>{this.props.message}</p>
        <p style={{ marginTop: 20 }}>
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            {this.props.action}
          </button>
        </p>
      </div>
    );
  }
}
