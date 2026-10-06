// @ts-ignore
globalThis.self = globalThis;
import * as fs from 'fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const buffer = fs.readFileSync('public/models/ezrab-mascot.glb');
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

const loader = new GLTFLoader();
loader.parse(arrayBuffer, '', (gltf) => {
  console.log('GLTF loaded successfully!');
  const scene = gltf.scene;
  console.log('Scene children count:', scene.children.length);
  scene.traverse((child) => {
    console.log(`- ${child.name} (${child.type})`);
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      const box = new THREE.Box3().setFromObject(mesh);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      console.log(`  Mesh size: x=${size.x.toFixed(3)}, y=${size.y.toFixed(3)}, z=${size.z.toFixed(3)}`);
      console.log(`  Mesh center: x=${center.x.toFixed(3)}, y=${center.y.toFixed(3)}, z=${center.z.toFixed(3)}`);
      if (Array.isArray(mesh.material)) {
        console.log(`  Materials:`, mesh.material.map(m => m.name));
      } else if (mesh.material) {
        console.log(`  Material:`, mesh.material.name);
      }
    }
  });
}, (err) => {
  console.error('Error parsing GLTF:', err);
});
