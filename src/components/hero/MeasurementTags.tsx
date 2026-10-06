import React from 'react';

export const MeasurementTags: React.FC = () => {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3 }}>
      {/* Height Dimension Tag */}
      <div
        style={{
          position: 'absolute',
          top: '38%',
          left: '12%',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 8px',
          borderRadius: '6px',
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(8px)',
          color: '#38bdf8',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '11px',
          fontWeight: 600,
          border: '1px solid rgba(56, 189, 248, 0.3)',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        }}
      >
        <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#38bdf8' }} />
        H: 8.40m (+0.00 to +8.40)
      </div>

      {/* Structural Volume Tag */}
      <div
        style={{
          position: 'absolute',
          top: '68%',
          right: '8%',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 8px',
          borderRadius: '6px',
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(8px)',
          color: '#4ade80',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '11px',
          fontWeight: 600,
          border: '1px solid rgba(74, 222, 128, 0.3)',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        }}
      >
        <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#4ade80' }} />
        Vol Beton: 184.0 m³ (K-300)
      </div>
    </div>
  );
};
