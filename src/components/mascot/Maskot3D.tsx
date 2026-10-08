/**
 * Maskot3D — EZRAB mascot from maskot.glb with cute 3D eyes + cursor eye-tracking.
 *
 * Eyes are separate 3D spheres placed on the face, sized proportionally
 * (not too big, not too small). Pupils follow the cursor; mascot blinks.
 *
 * Props allow fine-tuning eye placement if the GLB face differs.
 */
import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import './maskot3d.css';

interface Maskot3DProps {
  size?: number;
  /** Eye centers in model space */
  eyeLeft?: [number, number, number];
  eyeRight?: [number, number, number];
  /** Eye white radius */
  eyeRadius?: number;
  className?: string;
}

export const Maskot3D: React.FC<Maskot3DProps> = ({
  size = 120,
  eyeLeft = [-0.28, 0.18, 0.72],
  eyeRight = [0.28, 0.18, 0.72],
  eyeRadius = 0.16,
  className = '',
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const cfgRef = useRef({ eyeLeft, eyeRight, eyeRadius });

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const W = size, H = size;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
    camera.position.set(0, 0.1, 4.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(2, 3, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xbcd2ff, 0.5);
    fill.position.set(-3, 1, 2);
    scene.add(fill);

    const mascot = new THREE.Group();
    scene.add(mascot);

    // ---- eyes (built first so they render even if GLB fails) ----
    const eyesGroup = new THREE.Group();
    const mkEye = (pos: [number, number, number]) => {
      const g = new THREE.Group();
      g.position.set(...pos);
      const white = new THREE.Mesh(
        new THREE.SphereGeometry(cfgRef.current.eyeRadius, 24, 24),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25 })
      );
      white.scale.set(1, 1.15, 0.55);
      const pupil = new THREE.Mesh(
        new THREE.SphereGeometry(cfgRef.current.eyeRadius * 0.45, 20, 20),
        new THREE.MeshStandardMaterial({ color: 0x1a2332, roughness: 0.3 })
      );
      pupil.position.set(0, 0.01, cfgRef.current.eyeRadius * 0.42);
      const sparkle = new THREE.Mesh(
        new THREE.SphereGeometry(cfgRef.current.eyeRadius * 0.14, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      sparkle.position.set(cfgRef.current.eyeRadius * 0.14, cfgRef.current.eyeRadius * 0.16, cfgRef.current.eyeRadius * 0.62);
      g.add(white, pupil, sparkle);
      g.userData.pupil = pupil;
      g.userData.sparkle = sparkle;
      g.userData.baseY = pos[1];
      return g;
    };
    const eyeL = mkEye(cfgRef.current.eyeLeft);
    const eyeR = mkEye(cfgRef.current.eyeRight);
    eyesGroup.add(eyeL, eyeR);
    mascot.add(eyesGroup);

    // ---- load GLB ----
    new GLTFLoader().load(
      '/maskot.glb',
      (gltf) => {
        const model = gltf.scene;
        // normalize: center + scale to ~2.2 units tall
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const sz = box.getSize(new THREE.Vector3());
        const s = 2.2 / Math.max(sz.x, sz.y, sz.z);
        model.scale.setScalar(s);
        model.position.sub(center.clone().multiplyScalar(s));
        model.position.y += 0.1;
        mascot.add(model);
        // eyes should sit slightly in front of the model surface along +Z
        eyesGroup.position.z = (sz.z * s) / 2 * 0.92;
      },
      undefined,
      () => setFailed(true)
    );

    // ---- cursor eye-tracking + blink + idle bob ----
    const pupils = [eyeL.userData.pupil as THREE.Mesh, eyeR.userData.pupil as THREE.Mesh];
    const sparks = [eyeL.userData.sparkle as THREE.Mesh, eyeR.userData.sparkle as THREE.Mesh];
    const target = { x: 0, y: 0 };
    const cur = { x: 0, y: 0 };
    let blinkT = 0;
    let nextBlink = 2 + Math.random() * 3;

    const onMove = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      target.x = THREE.MathUtils.clamp((e.clientX - cx) / (r.width * 1.4), -1, 1);
      target.y = THREE.MathUtils.clamp(-(e.clientY - cy) / (r.height * 1.4), -1, 1);
    };
    window.addEventListener('pointermove', onMove);

    const clock = new THREE.Clock();
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;

      // smooth pupil follow
      cur.x += (target.x - cur.x) * Math.min(1, dt * 8);
      cur.y += (target.y - cur.y) * Math.min(1, dt * 8);
      const pr = cfgRef.current.eyeRadius;
      const px = cur.x * pr * 0.38;
      const py = 0.01 + cur.y * pr * 0.38;
      pupils.forEach((p, idx) => {
        p.position.x = px;
        p.position.y = py;
        const sp = sparks[idx];
        sp.position.x = pr * 0.14 + px * 0.9;
        sp.position.y = pr * 0.16 + py * 0.9;
      });

      // blink
      blinkT += dt;
      if (blinkT > nextBlink) {
        blinkT = 0;
        nextBlink = 2.2 + Math.random() * 3.2;
        eyeL.scale.y = 0.08;
        eyeR.scale.y = 0.08;
        setTimeout(() => { eyeL.scale.y = 1; eyeR.scale.y = 1; }, 130);
      }

      // idle motion: gentle bob + slight head tilt toward cursor
      mascot.position.y = Math.sin(t * 1.6) * 0.045;
      mascot.rotation.y = cur.x * 0.22;
      mascot.rotation.x = -cur.y * 0.12;

      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [size]);

  if (failed) {
    return (
      <div className={`maskot3d-fallback ${className}`} style={{ width: size, height: size }}>
        <span style={{ fontSize: size * 0.5 }}>🤖</span>
      </div>
    );
  }

  return <div ref={mountRef} className={`maskot3d ${className}`} style={{ width: size, height: size }} />;
};

export default Maskot3D;
