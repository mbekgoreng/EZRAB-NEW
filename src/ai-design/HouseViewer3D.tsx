import React, { useEffect, useRef, useState } from 'react';
import type { HouseSpec } from './specEngine';
import type * as THREE from 'three';

interface HouseViewer3DProps {
  spec: HouseSpec;
  selectedRoomId?: string | null;
  onRoomSelect?: (roomId: string | null) => void;
}

const WALL_HEIGHT = 3.2;

/**
 * Viewer 3D standalone untuk desain rumah AI.
 * Menggunakan Three.js langsung (lazy loaded) — tidak bergantung pada ParametricViewer3D.
 * Model konsep prosedural, bukan gambar kerja.
 */
export const HouseViewer3D: React.FC<HouseViewer3DProps> = ({
  spec, selectedRoomId, onRoomSelect,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let renderer: { dispose: () => void; domElement: HTMLElement } | null = null;
    let rafId = 0;
    let cancelled = false;

    (async () => {
      try {
        const THREE = await import('three');
        if (cancelled || !containerRef.current) return;

        const container = containerRef.current;
        const w = container.clientWidth || 800;
        const h = 440;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color('#0B132B');

        const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
        const maxDim = Math.max(spec.buildingWidthM, spec.buildingLengthM);
        camera.position.set(maxDim * 1.2, maxDim * 0.9, maxDim * 1.2);
        camera.lookAt(spec.buildingWidthM / 2, 1, spec.buildingLengthM / 2);

        const rendererInst = new THREE.WebGLRenderer({ antialias: true });
        rendererInst.setSize(w, h);
        container.appendChild(rendererInst.domElement);
        renderer = rendererInst;

        // Lights
        scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const dir = new THREE.DirectionalLight(0xffffff, 0.8);
        dir.position.set(10, 20, 10);
        scene.add(dir);

        // Lantai
        const floorGeo = new THREE.BoxGeometry(spec.buildingWidthM, 0.12, spec.buildingLengthM);
        const floorMat = new THREE.MeshLambertMaterial({ color: 0x94A3B8 });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.position.set(spec.buildingWidthM / 2, -0.06, spec.buildingLengthM / 2);
        scene.add(floor);

        // Dinding perimeter
        const wallMat = new THREE.MeshLambertMaterial({ color: 0xE2E8F0 });
        const t = spec.wallThicknessM;
        const walls: Array<[number, number, number, number]> = [
          [spec.buildingWidthM, t, spec.buildingWidthM / 2, t / 2],
          [spec.buildingWidthM, t, spec.buildingWidthM / 2, spec.buildingLengthM - t / 2],
          [t, spec.buildingLengthM, t / 2, spec.buildingLengthM / 2],
          [t, spec.buildingLengthM, spec.buildingWidthM - t / 2, spec.buildingLengthM / 2],
        ];
        for (const [ww, dd, x, z] of walls) {
          const g = new THREE.BoxGeometry(ww, WALL_HEIGHT, dd);
          const m = new THREE.Mesh(g, wallMat);
          m.position.set(x, WALL_HEIGHT / 2, z);
          scene.add(m);
        }

        // Ruang (semi-transparan, bisa diklik)
        const roomMeshes: Array<{ mesh: THREE.Mesh; roomId: string }> = [];
        const colors = [0x3B82F6, 0x8B5CF6, 0xF59E0B, 0xEC4899, 0x10B981, 0x6366F1];
        spec.rooms.forEach((room, idx) => {
          const g = new THREE.BoxGeometry(room.widthM, WALL_HEIGHT * 0.85, room.lengthM);
          const m = new THREE.MeshLambertMaterial({
            color: colors[idx % colors.length], transparent: true, opacity: 0.55,
          });
          const mesh = new THREE.Mesh(g, m);
          mesh.position.set(room.x + room.widthM / 2, WALL_HEIGHT * 0.42, room.y + room.lengthM / 2);
          mesh.userData.roomId = room.id;
          mesh.userData.roomName = room.name;
          scene.add(mesh);
          roomMeshes.push({ mesh, roomId: room.id });
        });

        // Atap sederhana
        const roofGeo = new THREE.BoxGeometry(spec.buildingWidthM + 0.6, 0.15, spec.buildingLengthM + 0.6);
        const roofMat = new THREE.MeshLambertMaterial({ color: 0xB45309 });
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.position.set(spec.buildingWidthM / 2, WALL_HEIGHT + 0.8, spec.buildingLengthM / 2);
        roof.rotation.z = 0.08;
        scene.add(roof);

        // Raycaster untuk klik ruang
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        const onClick = (e: MouseEvent) => {
          const rect = rendererInst.domElement.getBoundingClientRect();
          mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(mouse, camera);
          const hits = raycaster.intersectObjects(roomMeshes.map(r => r.mesh));
          if (hits.length > 0) {
            const roomId = (hits[0].object as THREE.Mesh).userData.roomId as string;
            onRoomSelect?.(roomId);
          } else {
            onRoomSelect?.(null);
          }
        };
        rendererInst.domElement.addEventListener('click', onClick);

        // Orbit sederhana (drag)
        let dragging = false, px = 0, py = 0, theta = Math.PI / 4, phi = 1.0;
        const radius = maxDim * 1.8;
        const updateCam = () => {
          camera.position.set(
            spec.buildingWidthM / 2 + radius * Math.sin(phi) * Math.cos(theta),
            radius * Math.cos(phi),
            spec.buildingLengthM / 2 + radius * Math.sin(phi) * Math.sin(theta),
          );
          camera.lookAt(spec.buildingWidthM / 2, 1, spec.buildingLengthM / 2);
        };
        updateCam();
        const onDown = (e: MouseEvent) => { dragging = true; px = e.clientX; py = e.clientY; };
        const onMove = (e: MouseEvent) => {
          if (!dragging) return;
          theta -= (e.clientX - px) * 0.005;
          phi = Math.max(0.2, Math.min(1.4, phi - (e.clientY - py) * 0.005));
          px = e.clientX; py = e.clientY;
          updateCam();
        };
        const onUp = () => { dragging = false; };
        rendererInst.domElement.addEventListener('mousedown', onDown);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        // Zoom
        const onWheel = (e: WheelEvent) => {
          e.preventDefault();
          const s = e.deltaY > 0 ? 1.1 : 0.9;
          camera.position.multiplyScalar(s);
        };
        rendererInst.domElement.addEventListener('wheel', onWheel, { passive: false });

        const animate = () => {
          if (cancelled) return;
          rafId = requestAnimationFrame(animate);
          rendererInst.render(scene, camera);
        };
        animate();
        setLoaded(true);

        // Cleanup
        (renderer as { _cleanup?: () => void })._cleanup = () => {
          cancelAnimationFrame(rafId);
          rendererInst.domElement.removeEventListener('click', onClick);
          rendererInst.domElement.removeEventListener('mousedown', onDown);
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          rendererInst.domElement.removeEventListener('wheel', onWheel);
          scene.traverse(o => {
            const mesh = o as THREE.Mesh;
            if (mesh.geometry) mesh.geometry.dispose();
            const mat = mesh.material as THREE.Material | THREE.Material[];
            if (Array.isArray(mat)) mat.forEach(mm => mm.dispose());
            else if (mat) mat.dispose();
          });
          rendererInst.dispose();
          if (container.contains(rendererInst.domElement)) container.removeChild(rendererInst.domElement);
        };
      } catch (e) {
        if (!cancelled) setError('WebGL tidak tersedia: ' + (e as Error).message.slice(0, 80));
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      const r = renderer as unknown as { _cleanup?: () => void };
      if (r && r._cleanup) r._cleanup();
      else if (renderer) renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec.buildingWidthM, spec.buildingLengthM]);

  // Highlight ruang terpilih
  useEffect(() => {
    // Highlight via outline — disederhanakan: tampilkan label
  }, [selectedRoomId]);

  const selectedRoom = spec.rooms.find(r => r.id === selectedRoomId);

  if (error) {
    return (
      <div style={{ height: 440, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0B132B', color: '#F87171', borderRadius: 12 }}>
        {error} — <span style={{ color: '#94A3B8' }}>Gunakan denah 2D sebagai alternatif.</span>
      </div>
    );
  }

  return (
    <div>
      <div ref={containerRef} style={{ height: 440, borderRadius: 12, overflow: 'hidden', background: '#0B132B' }}>
        {!loaded && (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8' }}>
            Memuat 3D...
          </div>
        )}
      </div>
      <div style={{ padding: 8, fontSize: 12, color: '#64748B', background: '#F8FAFC', borderRadius: '0 0 12px 12px' }}>
        {selectedRoom
          ? `📍 ${selectedRoom.name} — ${selectedRoom.widthM}×${selectedRoom.lengthM} m (${selectedRoom.areaM2.toFixed(1)} m²)`
          : 'Drag untuk orbit · Scroll untuk zoom · Klik ruang untuk detail'}
        <div style={{ marginTop: 4 }}>⚠ Model konsep prosedural — bukan gambar kerja tersertifikasi.</div>
      </div>
    </div>
  );
};

export default HouseViewer3D;
