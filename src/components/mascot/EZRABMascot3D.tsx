import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MascotGlow } from './MascotGlow';
import { EZRABMascot } from './EZRABMascot';

import { MascotVariant } from './mascot.types';

export type MascotMode = 'dashboard' | 'chatbot' | 'magic-ai' | 'floating' | 'avatar' | 'compact';
export type MascotSizePreset = MascotMode | MascotVariant | 'magic' | 'hero' | number;

export interface EyeConfig {
  position: [number, number, number];
  scale: [number, number, number];
}

export interface ModeLightingConfig {
  keyLight: { color: string; intensity: number; position: [number, number, number] };
  fillLight: { color: string; intensity: number; position: [number, number, number] };
  rimLight: { color: string; intensity: number; position: [number, number, number] };
  ambientLight: { color: string; intensity: number };
}

export interface ModeConfig {
  yaw: number; // in radians
  pitch: number;
  roll: number;
  baseEyeYaw: number;
  baseEyePitch: number;
  eye: {
    left: EyeConfig;
    right: EyeConfig;
  };
  camera: {
    fov: number;
    distanceMultiplier: number;
    offsetY: number;
  };
  lighting: ModeLightingConfig;
  glow: {
    defaultSize: number;
    intensity: number;
  };
}

/**
 * =========================================================================
 * MASTER MASCOT CALIBRATION CONFIGURATION — CONTEXT-AWARE POSES
 * =========================================================================
 * Uses the SAME single master GLB asset (robot_head_with_hard_hat.glb):
 * - Raw GLB face opening is at azimuth +33.5° (+0.585 rad).
 * 
 * 1. 'chatbot' / 'magic-ai':
 *    - Yaw = -0.585 rad -> Exactly 0° 100% frontal facing camera.
 *    - Pitch = 0.0 rad, Roll = 0.0 rad.
 *    - Base eye look = 0.0 rad (direct forward eye contact with user).
 *    - Symmetrical balanced lighting, centered soft blue atmospheric glow.
 * 
 * 2. 'dashboard':
 *    - Yaw = -0.934 rad -> Exactly -20° horizontal rotation (~15°-25° sweet spot)
 *      turned smoothly toward screen left (dashboard content).
 *    - Pitch = -0.045 rad -> ~ -2.6° slight natural upward tilt.
 *    - Roll = +0.026 rad -> ~ +1.5° subtle dynamic organic tilt.
 *    - Base eye look = +0.28 rad (~ +16° counter-rotation) so the eyes gaze
 *      naturally back toward the camera/user despite the head's 3/4 turn.
 *    - Asymmetric dynamic studio lighting accentuating the 3/4 crest logo & helmet.
 *    - Wide soft atmospheric background glow.
 */
export const MASCOT_CONFIG: Record<string, ModeConfig> = {
  'chatbot': {
    yaw: 0.0, // 0° perfectly frontal facing camera
    pitch: 0.0,
    roll: 0.0,
    baseEyeYaw: 0.0,
    baseEyePitch: 0.0,
    eye: {
      left: {
        position: [-0.205, -0.045, 0.720],
        scale: [0.36, 0.36, 1.0],
      },
      right: {
        position: [0.205, -0.045, 0.720],
        scale: [0.36, 0.36, 1.0],
      },
    },
    camera: {
      fov: 28,
      distanceMultiplier: 1.25,
      offsetY: 0.02,
    },
    lighting: {
      keyLight: { color: '#FFFFFF', intensity: 2.7, position: [-2.6, 3.8, 3.6] },
      fillLight: { color: '#EFF6FF', intensity: 2.3, position: [2.6, 3.8, 3.6] },
      rimLight: { color: '#38BDF8', intensity: 2.0, position: [0.0, 4.0, -3.2] },
      ambientLight: { color: '#F8FAFC', intensity: 1.12 },
    },
    glow: {
      defaultSize: 350,
      intensity: 0.92,
    },
  },
  'magic-ai': {
    yaw: 0.0, // 0° frontal facing camera
    pitch: 0.0,
    roll: 0.0,
    baseEyeYaw: 0.0,
    baseEyePitch: 0.0,
    eye: {
      left: {
        position: [-0.205, -0.045, 0.720],
        scale: [0.36, 0.36, 1.0],
      },
      right: {
        position: [0.205, -0.045, 0.720],
        scale: [0.36, 0.36, 1.0],
      },
    },
    camera: {
      fov: 28,
      distanceMultiplier: 1.25,
      offsetY: 0.02,
    },
    lighting: {
      keyLight: { color: '#FFFFFF', intensity: 2.7, position: [-2.6, 3.8, 3.6] },
      fillLight: { color: '#EFF6FF', intensity: 2.3, position: [2.6, 3.8, 3.6] },
      rimLight: { color: '#38BDF8', intensity: 2.0, position: [0.0, 4.0, -3.2] },
      ambientLight: { color: '#F8FAFC', intensity: 1.12 },
    },
    glow: {
      defaultSize: 350,
      intensity: 0.92,
    },
  },
  'dashboard': {
    yaw: 0.0, // 0° perfectly frontal facing camera as strictly requested
    pitch: 0.0,
    roll: 0.0,
    baseEyeYaw: 0.0,
    baseEyePitch: 0.0,
    eye: {
      left: {
        position: [-0.205, -0.045, 0.720],
        scale: [0.36, 0.36, 1.0],
      },
      right: {
        position: [0.205, -0.045, 0.720],
        scale: [0.36, 0.36, 1.0],
      },
    },
    camera: {
      fov: 28,
      distanceMultiplier: 1.25,
      offsetY: 0.02,
    },
    lighting: {
      keyLight: { color: '#FFFFFF', intensity: 2.9, position: [-2.6, 3.8, 3.6] },
      fillLight: { color: '#EFF6FF', intensity: 2.3, position: [2.6, 3.8, 3.6] },
      rimLight: { color: '#38BDF8', intensity: 2.2, position: [0.0, 3.5, -3.0] },
      ambientLight: { color: '#F8FAFC', intensity: 1.12 },
    },
    glow: {
      defaultSize: 380,
      intensity: 0.85,
    },
  },
  'floating': {
    yaw: 0.0,
    pitch: 0.0,
    roll: 0.0,
    baseEyeYaw: 0.0,
    baseEyePitch: 0.0,
    eye: {
      left: {
        position: [-0.205, -0.045, 0.720],
        scale: [0.36, 0.36, 1.0],
      },
      right: {
        position: [0.205, -0.045, 0.720],
        scale: [0.36, 0.36, 1.0],
      },
    },
    camera: {
      fov: 28,
      distanceMultiplier: 1.25,
      offsetY: 0.02,
    },
    lighting: {
      keyLight: { color: '#FFFFFF', intensity: 2.8, position: [-2.6, 3.8, 3.6] },
      fillLight: { color: '#EFF6FF', intensity: 2.2, position: [2.6, 3.8, 3.6] },
      rimLight: { color: '#38BDF8', intensity: 2.0, position: [0.0, 4.0, -3.2] },
      ambientLight: { color: '#F8FAFC', intensity: 1.1 },
    },
    glow: {
      defaultSize: 320,
      intensity: 0.85,
    },
  },
  'avatar': {
    yaw: 0.0,
    pitch: 0.0,
    roll: 0.0,
    baseEyeYaw: 0.0,
    baseEyePitch: 0.0,
    eye: {
      left: {
        position: [-0.205, -0.045, 0.720],
        scale: [0.36, 0.36, 1.0],
      },
      right: {
        position: [0.205, -0.045, 0.720],
        scale: [0.36, 0.36, 1.0],
      },
    },
    camera: {
      fov: 28,
      distanceMultiplier: 1.25,
      offsetY: 0.02,
    },
    lighting: {
      keyLight: { color: '#FFFFFF', intensity: 2.8, position: [-2.6, 3.8, 3.6] },
      fillLight: { color: '#EFF6FF', intensity: 2.2, position: [2.6, 3.8, 3.6] },
      rimLight: { color: '#38BDF8', intensity: 2.0, position: [0.0, 4.0, -3.2] },
      ambientLight: { color: '#F8FAFC', intensity: 1.1 },
    },
    glow: {
      defaultSize: 60,
      intensity: 0.0,
    },
  },
};

export interface EZRABMascot3DProps {
  variant?: MascotVariant;
  mode?: MascotMode;
  size?: MascotSizePreset;
  width?: number | string;
  height?: number | string;
  className?: string;
  interactive?: boolean;
  enableEyeTracking?: boolean;
  enableFloat?: boolean;
  enableBlink?: boolean;
  enableGlow?: boolean;
  glowSize?: number;
  glowIntensity?: number;
  isThinking?: boolean;
  facing?: 'left' | 'front' | 'auto';
  expression?: 'idle' | 'thinking' | 'happy';
  state?: string;
  debug?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

/**
 * Creates soft contact shadow texture under the mascot
 */
function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(15, 23, 42, 0.45)');
    grad.addColorStop(0.35, 'rgba(15, 23, 42, 0.22)');
    grad.addColorStop(0.65, 'rgba(30, 41, 59, 0.06)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Generates the authentic 3D eye texture matching the master reference render (matane.jpg):
 * - Deep obsidian navy center pupil
 * - Electric / sapphire blue iris rim glow
 * - Primary large glossy white catchlight on upper-left
 * - Secondary small crisp catchlight on lower-right
 */
function createEyeTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const cx = size / 2;
    const cy = size / 2;
    const r = size * 0.465;

    // 1. Base iris gradient: deep sapphire to obsidian navy
    const irisGrad = ctx.createRadialGradient(cx, cy, r * 0.18, cx, cy, r);
    irisGrad.addColorStop(0, '#020617'); // Pitch obsidian navy pupil
    irisGrad.addColorStop(0.56, '#061740'); // Midnight navy core
    irisGrad.addColorStop(0.76, '#1E40AF'); // Royal sapphire blue
    irisGrad.addColorStop(0.88, '#2563EB'); // Brilliant electric sapphire
    irisGrad.addColorStop(0.97, '#38BDF8'); // Vibrant sky rim highlight
    irisGrad.addColorStop(1.0, 'rgba(56, 189, 248, 0)'); // Antialiased rim

    ctx.fillStyle = irisGrad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 0.98, r, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Luminous lower-hemisphere inner reflection arc
    const lowerGlow = ctx.createRadialGradient(cx, cy + r * 0.40, 0, cx, cy + r * 0.40, r * 0.58);
    lowerGlow.addColorStop(0, 'rgba(56, 189, 248, 0.55)');
    lowerGlow.addColorStop(0.65, 'rgba(37, 99, 235, 0.22)');
    lowerGlow.addColorStop(1, 'rgba(37, 99, 235, 0)');
    ctx.fillStyle = lowerGlow;
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.35, r * 0.70, r * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();

    // 3. Primary Specular Catchlight (top-left, large crisp glossy oval)
    ctx.save();
    ctx.translate(cx - r * 0.30, cy - r * 0.32);
    ctx.rotate(-0.32);
    const specGrad1 = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.34);
    specGrad1.addColorStop(0, '#FFFFFF');
    specGrad1.addColorStop(0.70, '#FFFFFF');
    specGrad1.addColorStop(0.90, 'rgba(255, 255, 255, 0.90)');
    specGrad1.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = specGrad1;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.29, r * 0.37, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 4. Secondary Specular Catchlight (bottom-right, small crisp dot)
    ctx.save();
    ctx.translate(cx + r * 0.35, cy + r * 0.31);
    const specGrad2 = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.14);
    specGrad2.addColorStop(0, '#FFFFFF');
    specGrad2.addColorStop(0.75, 'rgba(255, 255, 255, 0.95)');
    specGrad2.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = specGrad2;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.12, r * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// Module-level cache for GLTF asset
let cachedModelGroup: THREE.Group | null = null;
let modelLoadingPromise: Promise<THREE.Group> | null = null;

function loadMascotAsset(): Promise<THREE.Group> {
  if (cachedModelGroup) {
    return Promise.resolve(cachedModelGroup.clone(true));
  }
  if (modelLoadingPromise) {
    return modelLoadingPromise.then((group) => group.clone(true));
  }

  const loader = new GLTFLoader();
  const primaryPath = '/assets/mascot/robot_head_with_hard_hat.glb';
  const fallbackPath = '/models/ezrab-mascot.glb';

  modelLoadingPromise = new Promise<THREE.Group>((resolve, reject) => {
    loader.load(
      primaryPath,
      (gltf) => {
        cachedModelGroup = gltf.scene;
        resolve(gltf.scene.clone(true));
      },
      undefined,
      () => {
        loader.load(
          fallbackPath,
          (gltf2) => {
            cachedModelGroup = gltf2.scene;
            resolve(gltf2.scene.clone(true));
          },
          undefined,
          (err) => reject(err)
        );
      }
    );
  });

  return modelLoadingPromise;
}

function resolveMascotParams(
  variantProp?: MascotVariant,
  modeProp?: MascotMode,
  sizeProp?: MascotSizePreset,
  wProp?: number | string,
  hProp?: number | string
): {
  mode: 'dashboard' | 'chatbot' | 'floating' | 'avatar';
  width: number | string;
  height: number | string;
  glowDefault: boolean;
  glowSize: number;
  glowIntensity: number;
} {
  const chosen = variantProp || modeProp;
  const effectiveMode =
    chosen === 'dashboard'
      ? 'dashboard'
      : chosen === 'chatbot' || chosen === 'magic-ai'
      ? 'chatbot'
      : chosen === 'floating'
      ? 'floating'
      : chosen === 'avatar' || chosen === 'compact'
      ? 'avatar'
      : sizeProp === 'magic' || sizeProp === 'magic-ai'
      ? 'chatbot'
      : sizeProp === 'dashboard'
      ? 'dashboard'
      : sizeProp === 'floating'
      ? 'floating'
      : sizeProp === 'avatar' || sizeProp === 'compact'
      ? 'avatar'
      : 'dashboard';

  const cfg = MASCOT_CONFIG[effectiveMode] || MASCOT_CONFIG['dashboard'];

  if (effectiveMode === 'dashboard') {
    return {
      mode: 'dashboard',
      width: wProp || '100%',
      height: hProp || '100%',
      glowDefault: true,
      glowSize: cfg.glow.defaultSize,
      glowIntensity: cfg.glow.intensity,
    };
  }

  if (effectiveMode === 'chatbot') {
    return {
      mode: 'chatbot',
      width: wProp || 280,
      height: hProp || 260,
      glowDefault: true,
      glowSize: cfg.glow.defaultSize,
      glowIntensity: cfg.glow.intensity,
    };
  }

  if (effectiveMode === 'floating') {
    return {
      mode: 'floating',
      width: wProp || 76,
      height: hProp || 76,
      glowDefault: true,
      glowSize: cfg.glow.defaultSize,
      glowIntensity: cfg.glow.intensity,
    };
  }

  return {
    mode: 'avatar',
    width: wProp || 42,
    height: hProp || 42,
    glowDefault: false,
    glowSize: cfg.glow.defaultSize,
    glowIntensity: cfg.glow.intensity,
  };
}

/**
 * EZRAB — Master 3D GLB Mascot Component
 *
 * Architecture:
 * EZRABMascotRoot (receives drag translation, idle float, click bounce)
 *  └── OrientationGroup (receives mode yaw: frontal for Chatbot, dynamic 3/4 for Dashboard)
 *       ├── BodyGroup
 *       │    └── GLB Model (with PBR materials & smooth normals)
 *       └── EyeTrackingGroup (synchronized in the exact same orientation coordinate space)
 *            ├── LeftEyeAnchor (locked socket position)
 *            │    └── LeftEyeMesh (local tracking rotation + blink/squint scale)
 *            └── RightEyeAnchor (locked socket position)
 *                 └── RightEyeMesh (local tracking rotation + blink/squint scale)
 */
export const EZRABMascot3D: React.FC<EZRABMascot3DProps> = ({
  variant: variantProp,
  mode: modeProp,
  size: sizeProp,
  width: widthProp,
  height: heightProp,
  className = '',
  interactive = true,
  enableEyeTracking = true,
  enableFloat = true,
  enableBlink = true,
  enableGlow,
  glowSize: glowSizeProp,
  glowIntensity: glowIntensityProp,
  isThinking = false,
  debug: debugProp = false,
  onClick,
  style = {},
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [webGlSupported, setWebGlSupported] = useState(true);
  const [isDraggingState, setIsDraggingState] = useState(false);

  const resolved = useMemo(
    () => resolveMascotParams(variantProp, modeProp, sizeProp, widthProp, heightProp),
    [variantProp, modeProp, sizeProp, widthProp, heightProp]
  );

  const isDebug = useMemo(() => {
    if (debugProp) return true;
    if (typeof window !== 'undefined' && window.location.search.includes('mascotDebug=true')) {
      return true;
    }
    return false;
  }, [debugProp]);

  const config = MASCOT_CONFIG[resolved.mode] || MASCOT_CONFIG['dashboard'];
  const shouldGlow = enableGlow !== undefined ? enableGlow : resolved.glowDefault;
  const actualGlowSize = glowSizeProp !== undefined ? glowSizeProp : resolved.glowSize;
  const actualGlowIntensity = glowIntensityProp !== undefined ? glowIntensityProp : resolved.glowIntensity;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. WebGL support check
    try {
      const testCanvas = document.createElement('canvas');
      const gl = testCanvas.getContext('webgl') || testCanvas.getContext('experimental-webgl');
      if (!gl) {
        setWebGlSupported(false);
        return;
      }
    } catch {
      setWebGlSupported(false);
      return;
    }

    const rect = container.getBoundingClientRect();
    const w = rect.width || (typeof resolved.width === 'number' ? resolved.width : 280);
    const h = rect.height || (typeof resolved.height === 'number' ? resolved.height : 260);

    // 2. Scene setup
    const scene = new THREE.Scene();

    // 3. Perspective Camera (narrow FOV to avoid fisheye distortion)
    const camera = new THREE.PerspectiveCamera(config.camera.fov, w / h, 0.1, 100);

    // 4. High-Performance Renderer
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      container.innerHTML = '';
      container.appendChild(renderer.domElement);
    } catch {
      setWebGlSupported(false);
      return;
    }

    // 5. Studio 3-Point Lighting Setup (Calibrated per variant)
    const keyLight = new THREE.DirectionalLight(
      config.lighting.keyLight.color,
      config.lighting.keyLight.intensity
    );
    keyLight.position.set(...config.lighting.keyLight.position);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(
      config.lighting.fillLight.color,
      config.lighting.fillLight.intensity
    );
    fillLight.position.set(...config.lighting.fillLight.position);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(
      config.lighting.rimLight.color,
      config.lighting.rimLight.intensity
    );
    rimLight.position.set(...config.lighting.rimLight.position);
    scene.add(rimLight);

    const ambientLight = new THREE.AmbientLight(
      config.lighting.ambientLight.color,
      config.lighting.ambientLight.intensity
    );
    scene.add(ambientLight);

    // 6. Contact Shadow Plane
    const shadowGeo = new THREE.PlaneGeometry(2.2, 1.3);
    const shadowTex = createContactShadowTexture();
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
    });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.set(0, -1.04, 0);
    scene.add(shadowMesh);

    // =========================================================================
    // 7. HIERARCHY RIGGING:
    // EZRABMascotRoot
    //  └── OrientationGroup (Yaw, Pitch, Roll)
    //       ├── BodyGroup -> GLB Model
    //       └── EyeTrackingGroup
    //            ├── LeftEyeAnchor -> LeftEyeMesh
    //            └── RightEyeAnchor -> RightEyeMesh
    // =========================================================================
    const mascotRoot = new THREE.Group();
    scene.add(mascotRoot);

    const orientationGroup = new THREE.Group();
    orientationGroup.rotation.y = config.yaw;
    orientationGroup.rotation.x = config.pitch;
    orientationGroup.rotation.z = config.roll;
    mascotRoot.add(orientationGroup);

    const bodyGroup = new THREE.Group();
    orientationGroup.add(bodyGroup);

    const eyeTrackingGroup = new THREE.Group();
    orientationGroup.add(eyeTrackingGroup);

    // Left Eye Anchor & Mesh (Screen Left / Mascot Right)
    const leftEyeAnchor = new THREE.Group();
    leftEyeAnchor.position.set(...config.eye.left.position);
    eyeTrackingGroup.add(leftEyeAnchor);

    // Right Eye Anchor & Mesh (Screen Right / Mascot Left)
    const rightEyeAnchor = new THREE.Group();
    rightEyeAnchor.position.set(...config.eye.right.position);
    eyeTrackingGroup.add(rightEyeAnchor);

    // 8. Master 3D Render Eye Textures (100% Identical to Golden Master Front View Reference)
    const textureLoader = new THREE.TextureLoader();
    const leftEyeTexture = textureLoader.load('/assets/mascot/master_eye_left.png');
    const rightEyeTexture = textureLoader.load('/assets/mascot/master_eye_right.png');
    leftEyeTexture.colorSpace = THREE.SRGBColorSpace;
    rightEyeTexture.colorSpace = THREE.SRGBColorSpace;

    const eyeGeo = new THREE.PlaneGeometry(1.0, 1.0);

    const leftEyeMaterial = new THREE.MeshBasicMaterial({
      map: leftEyeTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const rightEyeMaterial = new THREE.MeshBasicMaterial({
      map: rightEyeTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // Anchor rotation conforms to face curvature
    leftEyeAnchor.rotation.x = -0.12;
    rightEyeAnchor.rotation.x = -0.12;
    leftEyeAnchor.rotation.y = -0.18;
    rightEyeAnchor.rotation.y = 0.18;

    const leftEyeMesh = new THREE.Mesh(eyeGeo, leftEyeMaterial);
    leftEyeMesh.scale.set(...config.eye.left.scale);
    leftEyeMesh.renderOrder = 999;
    leftEyeAnchor.add(leftEyeMesh);

    const rightEyeMesh = new THREE.Mesh(eyeGeo, rightEyeMaterial);
    rightEyeMesh.scale.set(...config.eye.right.scale);
    rightEyeMesh.renderOrder = 999;
    rightEyeAnchor.add(rightEyeMesh);

    // 9. Optional Debug Helpers
    if (isDebug) {
      const axes = new THREE.AxesHelper(0.8);
      orientationGroup.add(axes);

      const anchorGeo = new THREE.SphereGeometry(0.025, 12, 12);
      const anchorMatL = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
      const anchorMatR = new THREE.MeshBasicMaterial({ color: 0x00ffff });
      const dbgLeft = new THREE.Mesh(anchorGeo, anchorMatL);
      const dbgRight = new THREE.Mesh(anchorGeo, anchorMatR);
      leftEyeAnchor.add(dbgLeft);
      rightEyeAnchor.add(dbgRight);
    }

    let isDisposed = false;

    // 10. Load and attach Master GLB Model
    loadMascotAsset()
      .then((model) => {
        if (isDisposed) return;

        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            if (mesh.geometry) {
              mesh.geometry.computeVertexNormals();
            }
            if (mesh.material) {
              const mat = mesh.material as THREE.MeshStandardMaterial;
              mat.roughness = 0.18;
              mat.metalness = 0.06;
              mat.needsUpdate = true;
            }
          }
        });

        bodyGroup.add(model);
        autoFrameCamera();
      })
      .catch((err) => {
        console.warn('[EZRABMascot3D] Could not load GLB asset:', err);
      });

    // 11. Bounding Box & Camera Auto-Framing (Guaranteed Anti-Crop)
    const autoFrameCamera = () => {
      const box = new THREE.Box3().setFromObject(orientationGroup);
      if (box.isEmpty()) {
        box.set(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
      }
      const sizeVec = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(sizeVec.x, sizeVec.y);
      const fovRad = (camera.fov * Math.PI) / 180;
      let dist = (maxDim / 2) / Math.tan(fovRad / 2);

      if (camera.aspect < 1) {
        dist = dist / camera.aspect;
      }
      dist *= config.camera.distanceMultiplier;

      camera.position.set(0, config.camera.offsetY, dist);
      camera.lookAt(0, 0, 0);
    };

    autoFrameCamera();

    // 12. Animation State Variables
    let targetEyeRotY = config.baseEyeYaw;
    let targetEyeRotX = config.baseEyePitch;
    let currentEyeRotY = config.baseEyeYaw;
    let currentEyeRotX = config.baseEyePitch;

    let targetHeadYaw = config.yaw;
    let targetHeadPitch = config.pitch;
    let currentHeadYaw = config.yaw;
    let currentHeadPitch = config.pitch;

    // Drag Interaction State
    let isPointerDown = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let hasExceededDragThreshold = false;

    let currentDragX = 0;
    let currentDragY = 0;
    let targetDragX = 0;
    let targetDragY = 0;
    let targetDragTiltZ = 0;
    let currentDragTiltZ = 0;

    // Cute Click Expression State
    let isCuteExpressing = false;
    let cuteExpressionStartTime = 0;

    // Blink State
    let blinkStartTime = 0;
    let isBlinking = false;
    let isDoubleBlink = false;
    let nextBlinkDelay = 3.2 + Math.random() * 3.8; // 3.2 - 7.0s
    let lastBlinkTime = performance.now();

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // 13. Pointer Event Listeners (Unified Mouse & Touch)
    const DRAG_THRESHOLD = 5; // px
    const MAX_DRAG_X = 0.42;
    const MAX_DRAG_Y = 0.28;

    const onPointerDown = (e: PointerEvent) => {
      if (!interactive) return;
      isPointerDown = true;
      hasExceededDragThreshold = false;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      try {
        container.setPointerCapture(e.pointerId);
      } catch {
        // Fallback for non-supported browsers
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      // 1. Eye Tracking & Head Tracking (80% eye tracking, 20% head tracking)
      if (interactive && enableEyeTracking) {
        const normX = (e.clientX / window.innerWidth) * 2 - 1;
        const normY = -(e.clientY / window.innerHeight) * 2 + 1;

        // Wide, expressive eye tracking across the screen
        targetEyeRotY = config.baseEyeYaw + THREE.MathUtils.clamp(normX * 0.35, -0.35, 0.35);
        targetEyeRotX = config.baseEyePitch + THREE.MathUtils.clamp(-normY * 0.24, -0.24, 0.24);

        // Subtle head tracking keeping frontal symmetry stable
        const headYawWeight = 0.018;
        const headPitchWeight = 0.012;
        targetHeadYaw = config.yaw + normX * headYawWeight;
        targetHeadPitch = config.pitch - normY * headPitchWeight;
      }

      // 2. Drag Tracking
      if (isPointerDown) {
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        const dist = Math.hypot(dx, dy);

        if (!hasExceededDragThreshold && dist >= DRAG_THRESHOLD) {
          hasExceededDragThreshold = true;
          setIsDraggingState(true);
        }

        if (hasExceededDragThreshold) {
          // Convert screen pixels to 3D world movement
          const worldPerPixel = (2 * Math.tan((camera.fov * Math.PI) / 360) * camera.position.z) / Math.max(h, 200);
          const rawDragX = dx * worldPerPixel;
          const rawDragY = -dy * worldPerPixel;

          targetDragX = THREE.MathUtils.clamp(rawDragX, -MAX_DRAG_X, MAX_DRAG_X);
          targetDragY = THREE.MathUtils.clamp(rawDragY, -MAX_DRAG_Y, MAX_DRAG_Y);

          // Subtle drag tilt (max ±5° = 0.087 rad)
          targetDragTiltZ = THREE.MathUtils.clamp(-rawDragX * 0.18, -0.087, 0.087);
        }
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!isPointerDown) return;
      isPointerDown = false;
      setIsDraggingState(false);

      try {
        if (container.hasPointerCapture(e.pointerId)) {
          container.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Safe fallback
      }

      if (!hasExceededDragThreshold) {
        // TRIGGER CUTE EXPRESSION ON CLICK
        isCuteExpressing = true;
        cuteExpressionStartTime = performance.now();
        onClick?.();
      }

      // Return smoothly to center / base orientation on release
      targetDragX = 0;
      targetDragY = 0;
      targetDragTiltZ = 0;
      targetEyeRotY = config.baseEyeYaw;
      targetEyeRotX = config.baseEyePitch;
      targetHeadYaw = config.yaw;
      targetHeadPitch = config.pitch;
    };

    container.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    // 14. Resize Observer for Responsive Anti-Crop
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cw = entry.contentRect.width;
        const ch = entry.contentRect.height;
        if (cw > 0 && ch > 0) {
          camera.aspect = cw / ch;
          camera.updateProjectionMatrix();
          renderer.setSize(cw, ch);
          autoFrameCamera();
        }
      }
    });
    resizeObserver.observe(container);

    // 15. Animation Loop (60fps with Dampened Lerp)
    let animationFrameId: number;

    const animate = (time: number) => {
      animationFrameId = requestAnimationFrame(animate);

      // 1. Lerp Drag Position and Tilt
      currentDragX += (targetDragX - currentDragX) * 0.12;
      currentDragY += (targetDragY - currentDragY) * 0.12;
      currentDragTiltZ += (targetDragTiltZ - currentDragTiltZ) * 0.12;

      mascotRoot.position.x = currentDragX;
      mascotRoot.position.z = 0;

      // 2. Cute Click Expression
      let cuteBounceY = 0;
      let cuteScale = 1.0;
      let cuteTiltZ = 0;
      let cuteSquint = 0;

      if (isCuteExpressing) {
        const elapsed = time - cuteExpressionStartTime;
        const duration = 750; // ms
        if (elapsed < duration) {
          const p = elapsed / duration;
          // Smooth bell curve
          const curve = Math.sin(p * Math.PI);

          // Head tilt ~ 5° (0.087 rad)
          cuteTiltZ = Math.sin(p * Math.PI * 2) * 0.085;
          // Scale up to 1.04 and bounce
          cuteScale = 1.0 + curve * 0.042;
          cuteBounceY = curve * 0.045;
          // Happy squint
          cuteSquint = curve * 0.42;
        } else {
          isCuteExpressing = false;
        }
      }

      // 3. Subtle Floating & Breathing Idle Motion
      let floatY = 0;
      let microTiltZ = 0;
      let microSwayYaw = 0;
      if (enableFloat && !prefersReducedMotion && !isPointerDown) {
        const tSec = time * 0.001;
        floatY = Math.sin(tSec * 1.7) * 0.020;
        microTiltZ = Math.sin(tSec * 1.1) * 0.008;

        // Dashboard has subtle organic micro-sway (~0.5°) around 3/4 pose; Chatbot stays front-facing
        if (resolved.mode === 'dashboard') {
          microSwayYaw = Math.sin(tSec * 0.85) * 0.009;
        }

        const shadowScale = 1.0 - floatY * 1.8;
        shadowMesh.scale.set(shadowScale, shadowScale, 1.0);
      }

      mascotRoot.position.y = currentDragY + floatY + cuteBounceY;
      mascotRoot.rotation.z = currentDragTiltZ + microTiltZ + cuteTiltZ;
      mascotRoot.scale.set(cuteScale, cuteScale, cuteScale);

      // 4. Lerp Head & Body Orientation
      currentHeadYaw += (targetHeadYaw - currentHeadYaw) * 0.06;
      currentHeadPitch += (targetHeadPitch - currentHeadPitch) * 0.06;
      orientationGroup.rotation.y = currentHeadYaw + microSwayYaw;
      orientationGroup.rotation.x = currentHeadPitch;
      orientationGroup.rotation.z = config.roll;

      // 5. Lerp Local Eye Rotation & Dynamic Socket Travel
      currentEyeRotY += (targetEyeRotY - currentEyeRotY) * 0.10;
      currentEyeRotX += (targetEyeRotX - currentEyeRotX) * 0.10;

      // Subtle dynamic socket translation for broader, more expressive eye tracking
      const eyeSlideX = (currentEyeRotY - config.baseEyeYaw) * 0.048;
      const eyeSlideY = -(currentEyeRotX - config.baseEyePitch) * 0.038;

      leftEyeAnchor.position.x = config.eye.left.position[0] + eyeSlideX;
      leftEyeAnchor.position.y = config.eye.left.position[1] + eyeSlideY;

      rightEyeAnchor.position.x = config.eye.right.position[0] + eyeSlideX;
      rightEyeAnchor.position.y = config.eye.right.position[1] + eyeSlideY;

      // Thinking: subtle upward eye glance and slight anticipation drift (stable head)
      const thinkingPitchOffset = isThinking ? -0.10 : 0;
      const thinkingYawOffset = isThinking ? Math.sin(time * 0.002) * 0.04 : 0;

      leftEyeMesh.rotation.y = (currentEyeRotY + thinkingYawOffset) * 0.10;
      leftEyeMesh.rotation.x = (currentEyeRotX + thinkingPitchOffset) * 0.10;

      rightEyeMesh.rotation.y = (currentEyeRotY + thinkingYawOffset) * 0.10;
      rightEyeMesh.rotation.x = (currentEyeRotX + thinkingPitchOffset) * 0.10;

      // 6. Natural Organic Blinking (occasional double blink)
      let blinkScaleY = 1.0;
      if (enableBlink && !isCuteExpressing) {
        const now = performance.now();
        if (!isBlinking && now - lastBlinkTime > nextBlinkDelay * 1000) {
          isBlinking = true;
          blinkStartTime = now;
          isDoubleBlink = Math.random() < 0.18; // 18% chance of double-blink
        }

        if (isBlinking) {
          const elapsed = now - blinkStartTime;
          const blinkDuration = isDoubleBlink ? 320 : 170; // ms
          if (elapsed < blinkDuration) {
            const progress = elapsed / blinkDuration;
            const cycleProgress = isDoubleBlink ? (progress * 2) % 1 : progress;
            // Squash scale Y down to 0.06
            blinkScaleY = 1.0 - Math.sin(cycleProgress * Math.PI) * 0.94;
          } else {
            isBlinking = false;
            lastBlinkTime = now;
            nextBlinkDelay = 3.2 + Math.random() * 3.8;
          }
        }
      }

      // Apply blink and happy squint scale
      const finalEyeScaleY = Math.max(0.06, blinkScaleY - cuteSquint);
      const finalEyeScaleX = 1.0 + cuteSquint * 0.18;

      leftEyeMesh.scale.set(
        config.eye.left.scale[0] * finalEyeScaleX,
        config.eye.left.scale[1] * finalEyeScaleY,
        config.eye.left.scale[2]
      );
      rightEyeMesh.scale.set(
        config.eye.right.scale[0] * finalEyeScaleX,
        config.eye.right.scale[1] * finalEyeScaleY,
        config.eye.right.scale[2]
      );

      renderer.render(scene, camera);
    };

    animationFrameId = requestAnimationFrame(animate);

    // 16. Cleanup on Unmount
    return () => {
      isDisposed = true;
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      container.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      scene.clear();
      renderer.dispose();
      eyeGeo.dispose();
      leftEyeMaterial.dispose();
      rightEyeMaterial.dispose();
      leftEyeTexture.dispose();
      rightEyeTexture.dispose();
      shadowGeo.dispose();
      shadowMat.dispose();
      shadowTex.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [
    resolved.mode,
    resolved.width,
    resolved.height,
    config,
    interactive,
    enableEyeTracking,
    enableFloat,
    enableBlink,
    isThinking,
    isDebug,
  ]);

  // Graceful Fallback if WebGL is unavailable
  if (!webGlSupported) {
    return (
      <div
        className={`ezrab-3d-mascot-fallback ${className}`}
        style={{
          width: typeof resolved.width === 'number' ? `${resolved.width}px` : resolved.width,
          height: typeof resolved.height === 'number' ? `${resolved.height}px` : resolved.height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          ...style,
        }}
      >
        {shouldGlow && <MascotGlow size={actualGlowSize} intensity={actualGlowIntensity} />}
        <EZRABMascot
          size="lg"
          enableEyeTracking={enableEyeTracking}
          enableFloating={enableFloat}
          onClick={onClick}
        />
      </div>
    );
  }

  return (
    <div
      className={`ezrab-3d-mascot-container ${className}`}
      role="img"
      aria-label="EZRAB 3D Master Mascot"
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: typeof resolved.width === 'number' ? `${resolved.width}px` : resolved.width,
        height: typeof resolved.height === 'number' ? `${resolved.height}px` : resolved.height,
        cursor: isDraggingState ? 'grabbing' : interactive ? 'grab' : 'default',
        userSelect: 'none',
        overflow: 'visible',
        touchAction: 'none', // Allows dragging without triggering mobile viewport scroll
        ...style,
      }}
    >
      {/* Soft Blue Atmospheric Glow strictly behind Mascot */}
      {shouldGlow && <MascotGlow size={actualGlowSize} intensity={actualGlowIntensity} />}

      {/* Real-time WebGL 3D Canvas Wrapper */}
      <div
        ref={containerRef}
        className="ezrab-3d-mascot-canvas-wrapper"
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          zIndex: 2,
          overflow: 'visible',
          touchAction: 'none',
        }}
      />
    </div>
  );
};

export const EzrabMascot3D = EZRABMascot3D;
export default EZRABMascot3D;
