import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Short description of what failed, e.g. the chart title. */
  label?: string;
}

/** A failing chart or tab shows a visible message instead of a blank page. */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="empty" role="alert">
          ⚠️ Impossible d’afficher {this.props.label ? `« ${this.props.label} »` : 'cette section'} avec ces données.
        </div>
      );
    }
    return this.props.children;
  }
}
