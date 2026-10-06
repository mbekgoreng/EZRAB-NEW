import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ViewerModel3D, ViewerElement3D, ViewerLayerType, RenderMode, CameraPreset } from '../types';

export interface ParametricViewer3DProps {
  model: ViewerModel3D | null;
  renderMode?: RenderMode;
  visibleLayers?: Record<ViewerLayerType, boolean>;
  selectedElement?: ViewerElement3D | null;
  onSelectElement?: (element: ViewerElement3D | null) => void;
  cameraPreset?: CameraPreset;
  onCameraPresetChange?: (preset: CameraPreset) => void;
  className?: string;
}

export const ParametricViewer3D: React.FC<ParametricViewer3DProps> = ({
  model,
  renderMode = 'SOLID',
  visibleLayers,
  selectedElement,
  onSelectElement,
  cameraPreset = 'ISOMETRIC',
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Three.js instances refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const meshesMapRef = useRef<Map<string, { mesh: THREE.Mesh; edges?: THREE.LineSegments; element: ViewerElement3D }>>(new Map());
  const selectedHighlightRef = useRef<THREE.BoxHelper | null>(null);
  const isDraggingRef = useRef(false);
  const isPanningRef = useRef(false);
  const previousMousePositionRef = useRef({ x: 0, y: 0 });

  // 1. Initialize Three.js Scene, Camera, and Renderer
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 500;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0B132B');
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(12, 10, 14);
    camera.lookAt(3, 2, 3);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight1.position.set(15, 25, 20);
    dirLight1.castShadow = true;
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x90cdf4, 0.4);
    dirLight2.position.set(-15, 10, -15);
    scene.add(dirLight2);

    // Ground Grid Helper
    const gridHelper = new THREE.GridHelper(30, 30, 0x38bdf8, 0x1e293b);
    gridHelper.position.y = -0.01;
    scene.add(gridHelper);

    // Axes Helper (RGB = XYZ)
    const axesHelper = new THREE.AxesHelper(3);
    axesHelper.position.set(-0.5, 0.05, -0.5);
    scene.add(axesHelper);

    // Animation Loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    // Resize Observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        if (w > 0 && h > 0 && cameraRef.current && rendererRef.current) {
          cameraRef.current.aspect = w / h;
          cameraRef.current.updateProjectionMatrix();
          rendererRef.current.setSize(w, h);
        }
      }
    });
    resizeObserver.observe(container);

    // Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      renderer.dispose();
      scene.clear();
    };
  }, []);

  // 2. Build 3D Meshes when model changes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Clear previous elements
    meshesMapRef.current.forEach(({ mesh, edges }) => {
      scene.remove(mesh);
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose());
      } else {
        mesh.material.dispose();
      }
      if (edges) {
        scene.remove(edges);
        edges.geometry.dispose();
        (edges.material as THREE.Material).dispose();
      }
    });
    meshesMapRef.current.clear();

    if (!model || !model.elements) return;

    model.elements.forEach((elem) => {
      const { width, height, depth } = elem.dimensions;
      const geom = new THREE.BoxGeometry(
        Math.max(0.02, width),
        Math.max(0.02, height),
        Math.max(0.02, depth)
      );

      // Material based on render mode & element
      const color = new THREE.Color(elem.colorHex || '#94A3B8');
      let mat: THREE.Material;

      if (renderMode === 'WIREFRAME') {
        mat = new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          wireframe: true,
          transparent: true,
          opacity: 0.85,
        });
      } else if (renderMode === 'TRANSPARENT') {
        mat = new THREE.MeshStandardMaterial({
          color,
          transparent: true,
          opacity: 0.35,
          roughness: 0.4,
          metalness: 0.1,
          depthWrite: false,
        });
      } else {
        // SOLID mode
        mat = new THREE.MeshStandardMaterial({
          color,
          roughness: 0.5,
          metalness: 0.1,
          opacity: elem.layer === 'OPENINGS' ? 0.6 : 1.0,
          transparent: elem.layer === 'OPENINGS',
        });
      }

      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(elem.position.x, elem.position.y, elem.position.z);
      mesh.rotation.set(elem.rotation.x, elem.rotation.y, elem.rotation.z);
      mesh.castShadow = renderMode === 'SOLID';
      mesh.receiveShadow = renderMode === 'SOLID';
      mesh.userData = { elementId: elem.elementId, stableId: elem.stableId };

      // Add crisp edges outline in SOLID/TRANSPARENT mode
      let edges: THREE.LineSegments | undefined;
      if (renderMode !== 'WIREFRAME') {
        const edgesGeom = new THREE.EdgesGeometry(geom, 15);
        const edgesMat = new THREE.LineBasicMaterial({
          color: 0x0f172a,
          linewidth: 1,
          transparent: true,
          opacity: 0.4,
        });
        edges = new THREE.LineSegments(edgesGeom, edgesMat);
        edges.position.copy(mesh.position);
        edges.rotation.copy(mesh.rotation);
        scene.add(edges);
      }

      scene.add(mesh);
      meshesMapRef.current.set(elem.elementId, { mesh, edges, element: elem });
    });

    // Fit camera to model center
    if (cameraRef.current && model.boundingBox) {
      const { center, size } = model.boundingBox;
      const maxDim = Math.max(size.width, size.height, size.depth, 6);
      cameraRef.current.position.set(center.x + maxDim * 1.5, center.y + maxDim * 1.2, center.z + maxDim * 1.5);
      cameraRef.current.lookAt(center.x, center.y, center.z);
    }
  }, [model, renderMode]);

  // 3. Layer Visibility Updates
  useEffect(() => {
    if (!visibleLayers) return;

    meshesMapRef.current.forEach(({ mesh, edges, element }) => {
      const isVisible = visibleLayers[element.layer] ?? true;
      mesh.visible = isVisible;
      if (edges) edges.visible = isVisible;
    });
  }, [visibleLayers]);

  // 4. Selected Element Highlight
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (selectedHighlightRef.current) {
      scene.remove(selectedHighlightRef.current);
      selectedHighlightRef.current.dispose();
      selectedHighlightRef.current = null;
    }

    if (selectedElement) {
      const entry = meshesMapRef.current.get(selectedElement.elementId);
      if (entry && entry.mesh) {
        const helper = new THREE.BoxHelper(entry.mesh, 0xf59e0b);
        (helper.material as THREE.LineBasicMaterial).linewidth = 3;
        scene.add(helper);
        selectedHighlightRef.current = helper;
      }
    }
  }, [selectedElement]);

  // 5. Camera Presets (Isometric, Top, Front, Right)
  useEffect(() => {
    const camera = cameraRef.current;
    if (!camera || !model?.boundingBox) return;

    const { center, size } = model.boundingBox;
    const maxDim = Math.max(size.width, size.height, size.depth, 6);

    switch (cameraPreset) {
      case 'TOP':
        camera.position.set(center.x, center.y + maxDim * 2.5, center.z + 0.001);
        camera.lookAt(center.x, center.y, center.z);
        break;
      case 'FRONT':
        camera.position.set(center.x, center.y + (size.height / 2), center.z + maxDim * 2.0);
        camera.lookAt(center.x, center.y, center.z);
        break;
      case 'RIGHT':
        camera.position.set(center.x + maxDim * 2.0, center.y + (size.height / 2), center.z);
        camera.lookAt(center.x, center.y, center.z);
        break;
      case 'ISOMETRIC':
      default:
        camera.position.set(center.x + maxDim * 1.5, center.y + maxDim * 1.2, center.z + maxDim * 1.5);
        camera.lookAt(center.x, center.y, center.z);
        break;
    }
  }, [cameraPreset, model]);

  // 6. Mouse Interaction: Orbit, Pan, and Zoom (Wheel & Drag)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      isDraggingRef.current = true;
    } else if (e.button === 2 || e.button === 1) {
      isPanningRef.current = true;
    }
    previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const deltaX = e.clientX - previousMousePositionRef.current.x;
    const deltaY = e.clientY - previousMousePositionRef.current.y;
    previousMousePositionRef.current = { x: e.clientX, y: e.clientY };

    const camera = cameraRef.current;
    const center = model?.boundingBox?.center || { x: 3, y: 1.5, z: 3 };
    if (!camera) return;

    if (isDraggingRef.current) {
      // Orbit rotation around center
      const target = new THREE.Vector3(center.x, center.y, center.z);
      const offset = camera.position.clone().sub(target);
      const radius = offset.length();

      let theta = Math.atan2(offset.x, offset.z) - deltaX * 0.008;
      let phi = Math.acos(Math.max(-1, Math.min(1, offset.y / radius))) - deltaY * 0.008;
      phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, phi)); // Don't go below ground

      camera.position.x = target.x + radius * Math.sin(phi) * Math.sin(theta);
      camera.position.y = target.y + radius * Math.cos(phi);
      camera.position.z = target.z + radius * Math.sin(phi) * Math.cos(theta);
      camera.lookAt(target);
    } else if (isPanningRef.current) {
      // Pan translation
      const panSpeed = 0.015;
      const right = new THREE.Vector3().crossVectors(camera.up, camera.getWorldDirection(new THREE.Vector3())).normalize();
      camera.position.addScaledVector(right, deltaX * panSpeed);
      camera.position.y += deltaY * panSpeed;
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    // Detect single click for Raycasting Element Selection
    if (isDraggingRef.current && Math.abs(e.clientX - previousMousePositionRef.current.x) < 3) {
      performRaycast(e);
    }
    isDraggingRef.current = false;
    isPanningRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const camera = cameraRef.current;
    const center = model?.boundingBox?.center || { x: 3, y: 1.5, z: 3 };
    if (!camera) return;

    const zoomFactor = e.deltaY > 0 ? 1.08 : 0.92;
    const target = new THREE.Vector3(center.x, center.y, center.z);
    camera.position.sub(target).multiplyScalar(zoomFactor).add(target);
  };

  const performRaycast = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    const camera = cameraRef.current;
    const scene = sceneRef.current;
    if (!canvas || !camera || !scene) return;

    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

    const meshes = Array.from(meshesMapRef.current.values())
      .map((entry) => entry.mesh)
      .filter((m) => m.visible);

    const intersects = raycaster.intersectObjects(meshes, false);

    if (intersects.length > 0) {
      const topHit = intersects[0];
      const elementId = topHit.object.userData.elementId;
      const entry = meshesMapRef.current.get(elementId);
      if (entry && onSelectElement) {
        onSelectElement(entry.element);
      }
    } else if (onSelectElement) {
      onSelectElement(null);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full min-h-[420px] bg-[#0B132B] rounded-xl overflow-hidden select-none ${className}`}
      onContextMenu={(e) => e.preventDefault()}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      style={{ cursor: isDraggingRef.current ? 'grabbing' : 'grab' }}
    >
      <canvas ref={canvasRef} className="w-full h-full block" />

      {/* Floating Coordinate Origin Badge */}
      <div className="absolute bottom-3 left-3 bg-[#0F172A]/80 backdrop-blur border border-white/10 px-2.5 py-1 rounded text-[11px] text-[#94A3B8] font-mono flex items-center gap-2">
        <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span>3D Parametric BIM Mode • Satuan (m)</span>
      </div>
    </div>
  );
};
