import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary caught an error]:', error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: '24px',
            margin: '16px auto',
            maxWidth: '640px',
            background: '#FEF2F2',
            border: '1.5px solid #FECACA',
            borderRadius: '12px',
            textAlign: 'center',
            boxShadow: '0 4px 12px rgba(239, 68, 68, 0.08)',
          }}
        >
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: '#FEE2E2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px',
              color: '#DC2626',
            }}
          >
            <AlertTriangle size={24} />
          </div>
          <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#991B1B', margin: '0 0 6px 0' }}>
            {this.props.fallbackTitle || 'Terjadi Kendala pada Tampilan Komponen'}
          </h3>
          <p style={{ fontSize: '12px', color: '#B91C1C', margin: '0 0 14px 0', lineHeight: 1.5 }}>
            {this.state.error?.message || 'Terjadi kesalahan sistem yang tidak terduga.'}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
            <button
              onClick={this.handleReset}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '6px',
                border: 'none',
                background: '#DC2626',
                color: '#FFFFFF',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={14} />
              <span>Muat Ulang Komponen</span>
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                background: '#FFFFFF',
                color: '#475569',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Segarkan Halaman
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
