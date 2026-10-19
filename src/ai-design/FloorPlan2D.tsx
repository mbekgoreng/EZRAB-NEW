import React, { useState, useCallback } from 'react';
import type { HouseSpec, RoomSpec } from './specEngine';

interface FloorPlan2DProps {
  spec: HouseSpec;
  onRoomUpdate?: (roomId: string, updates: Partial<RoomSpec>) => void;
  onRoomSelect?: (roomId: string | null) => void;
  selectedRoomId?: string | null;
}

const ROOM_COLORS: Record<string, string> = {
  bedroom: '#DBEAFE',
  bathroom: '#E0E7FF',
  living: '#FEF3C7',
  kitchen: '#FCE7F3',
  dining: '#F3E8FF',
  carport: '#E5E7EB',
  terrace: '#D1FAE5',
  storage: '#F3F4F6',
  other: '#F9FAFB',
};

const ROOM_STROKE: Record<string, string> = {
  bedroom: '#3B82F6',
  bathroom: '#6366F1',
  living: '#F59E0B',
  kitchen: '#EC4899',
  dining: '#8B5CF6',
  carport: '#6B7280',
  terrace: '#10B981',
  storage: '#9CA3AF',
  other: '#D1D5DB',
};

/**
 * Denah 2D berbasis SVG — terhubung ke HouseSpec.
 * Klik ruang untuk memilih, drag untuk memindahkan (dalam batas bangunan).
 */
export const FloorPlan2D: React.FC<FloorPlan2DProps> = ({
  spec, onRoomUpdate, onRoomSelect, selectedRoomId,
}) => {
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Skala: 40px per meter, dengan padding
  const SCALE = 40;
  const PAD = 50;
  const svgW = spec.buildingWidthM * SCALE + PAD * 2;
  const svgH = spec.buildingLengthM * SCALE + PAD * 2;

  const toPx = (m: number) => PAD + m * SCALE;

  const handleMouseDown = useCallback((e: React.MouseEvent, room: RoomSpec) => {
    const svg = (e.currentTarget as SVGElement).ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (svgW / rect.width);
    const my = (e.clientY - rect.top) * (svgH / rect.height);
    setDragging(room.id);
    setDragOffset({ x: mx - toPx(room.x), y: my - toPx(room.y) });
    onRoomSelect?.(room.id);
  }, [svgW, svgH, onRoomSelect]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging || !onRoomUpdate) return;
    const svg = e.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (svgW / rect.width);
    const my = (e.clientY - rect.top) * (svgH / rect.height);
    const room = spec.rooms.find(r => r.id === dragging);
    if (!room) return;
    // Konversi ke meter, batasi dalam bangunan
    let nx = (mx - dragOffset.x - PAD) / SCALE;
    let ny = (my - dragOffset.y - PAD) / SCALE;
    nx = Math.max(0, Math.min(nx, spec.buildingWidthM - room.widthM));
    ny = Math.max(0, Math.min(ny, spec.buildingLengthM - room.lengthM));
    onRoomUpdate(dragging, { x: Math.round(nx * 100) / 100, y: Math.round(ny * 100) / 100 });
  }, [dragging, dragOffset, spec, svgW, svgH, onRoomUpdate]);

  const handleMouseUp = useCallback(() => setDragging(null), []);

  return (
    <div className="ai-design-floorplan">
      <svg
        width="100%"
        viewBox={`0 0 ${svgW} ${svgH}`}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ background: '#F8FAFC', borderRadius: 12, cursor: dragging ? 'grabbing' : 'default' }}
        role="img"
        aria-label={`Denah ${spec.buildingType} ${spec.buildingWidthM}×${spec.buildingLengthM} meter`}
      >
        {/* Grid */}
        <defs>
          <pattern id="aidesign-grid" width={SCALE} height={SCALE} patternUnits="userSpaceOnUse">
            <path d={`M ${SCALE} 0 L 0 0 0 ${SCALE}`} fill="none" stroke="#E2E8F0" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect x={PAD} y={PAD} width={spec.buildingWidthM * SCALE} height={spec.buildingLengthM * SCALE} fill="url(#aidesign-grid)" />

        {/* Batas bangunan */}
        <rect
          x={PAD} y={PAD}
          width={spec.buildingWidthM * SCALE}
          height={spec.buildingLengthM * SCALE}
          fill="none" stroke="#1E3A5F" strokeWidth="3"
        />

        {/* Dimensi */}
        <text x={PAD + spec.buildingWidthM * SCALE / 2} y={PAD - 12} textAnchor="middle" fontSize="13" fill="#1E3A5F" fontWeight="600">
          {spec.buildingWidthM} m
        </text>
        <text x={PAD - 12} y={PAD + spec.buildingLengthM * SCALE / 2} textAnchor="middle" fontSize="13" fill="#1E3A5F" fontWeight="600"
          transform={`rotate(-90, ${PAD - 12}, ${PAD + spec.buildingLengthM * SCALE / 2})`}>
          {spec.buildingLengthM} m
        </text>

        {/* Ruang */}
        {spec.rooms.map(room => {
          const isSelected = selectedRoomId === room.id;
          return (
            <g key={room.id}
               onMouseDown={(e) => handleMouseDown(e, room)}
               style={{ cursor: 'grab' }}>
              <rect
                x={toPx(room.x)} y={toPx(room.y)}
                width={room.widthM * SCALE} height={room.lengthM * SCALE}
                fill={ROOM_COLORS[room.type] || ROOM_COLORS.other}
                stroke={isSelected ? '#EF4444' : (ROOM_STROKE[room.type] || ROOM_STROKE.other)}
                strokeWidth={isSelected ? 3 : 1.5}
              />
              <text
                x={toPx(room.x) + room.widthM * SCALE / 2}
                y={toPx(room.y) + room.lengthM * SCALE / 2 - 4}
                textAnchor="middle" fontSize="12" fontWeight="600" fill="#1E293B"
                pointerEvents="none"
              >
                {room.name}
              </text>
              <text
                x={toPx(room.x) + room.widthM * SCALE / 2}
                y={toPx(room.y) + room.lengthM * SCALE / 2 + 12}
                textAnchor="middle" fontSize="11" fill="#64748B"
                pointerEvents="none"
              >
                {room.widthM}×{room.lengthM} m · {room.areaM2.toFixed(1)} m²
              </text>
              {room.isAssumed && (
                <text
                  x={toPx(room.x) + 4} y={toPx(room.y) + 14}
                  fontSize="10" fill="#F59E0B" fontWeight="600"
                  pointerEvents="none"
                >
                  ⚠ asumsi
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div style={{ marginTop: 8, fontSize: 12, color: '#64748B' }}>
        Klik ruang untuk memilih · Drag untuk memindahkan · Total: {spec.totalRoomAreaM2.toFixed(1)} m² dari {spec.buildingAreaM2.toFixed(1)} m²
      </div>
    </div>
  );
};

export default FloorPlan2D;
