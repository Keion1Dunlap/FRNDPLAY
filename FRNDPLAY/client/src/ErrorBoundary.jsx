// client/src/ErrorBoundary.jsx
import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Also log to console so it's captured
    // eslint-disable-next-line no-console
    console.error("ErrorBoundary caught:", error, info);
    this.setState({ error, info });
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
          <h2 style={{ marginTop: 0 }}>App crashed</h2>
          <div style={{ marginBottom: 12, opacity: 0.8 }}>
            This is the real error (copy/paste it to me):
          </div>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              background: "#111",
              color: "#fff",
              padding: 12,
              borderRadius: 8,
              overflow: "auto",
            }}
          >
            {String(this.state.error?.stack || this.state.error)}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}
