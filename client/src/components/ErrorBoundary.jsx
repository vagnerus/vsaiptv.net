import React from 'react';
import { AlertCircle, RotateCcw, Home } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary capturou erro:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '280px',
          padding: '32px 20px',
          margin: '20px auto',
          maxWidth: '520px',
          background: 'rgba(14, 19, 31, 0.85)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: 'var(--radius-lg, 16px)',
          textAlign: 'center',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6)',
        }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'rgba(239, 68, 68, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px',
          }}>
            <AlertCircle size={30} color="#f87171" />
          </div>

          <h3 style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: '1.25rem',
            fontWeight: '800',
            color: '#fff',
            marginBottom: '8px',
          }}>
            Algo deu errado nesta área
          </h3>

          <p style={{
            fontSize: '0.88rem',
            color: 'var(--text-muted, #94a3b8)',
            lineHeight: 1.5,
            marginBottom: '20px',
            maxWidth: '380px',
          }}>
            Ocorreu uma falha inesperada ao renderizar este conteúdo. Você pode tentar novamente ou retornar à tela inicial.
          </p>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={this.handleReset}
              className="btn btn-primary"
              style={{ padding: '8px 20px', fontSize: '0.86rem', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <RotateCcw size={15} /> Tentar novamente
            </button>
            <button
              onClick={() => window.location.href = '/'}
              className="btn btn-secondary"
              style={{ padding: '8px 18px', fontSize: '0.86rem', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Home size={15} /> Ir para o Início
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
