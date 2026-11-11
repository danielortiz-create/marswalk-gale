// models.js — modelos 3D hechos con formas basicas de Three.js (a escala real, en metros).
// Son representaciones conceptuales, no planos de hardware de NASA.
import * as THREE from 'three';

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.1, ...o });
const WHITE = mat(0xe9e6df), GREY = mat(0x8a8d92), DARK = mat(0x2b2d31), GOLD = mat(0xd9a520, { metalness: 0.9, roughness: 0.2 });
const ORANGE = mat(0xe8742a), BLUE = mat(0x1d3f8f, { metalness: 0.6, roughness: 0.35 });

function part(geo, material, x = 0, y = 0, z = 0, parent = null) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  if (parent) parent.add(m);
  return m;
}

// Astronauta con traje de superficie (1.9 m de alto)
export function makeAstronaut(stripe = 0xd0342c) {
  const g = new THREE.Group();
  const stripeM = mat(stripe);
  part(new THREE.CapsuleGeometry(0.27, 0.5, 6, 14), WHITE, 0, 1.2, 0, g);             // torso
  part(new THREE.SphereGeometry(0.24, 20, 16), WHITE, 0, 1.78, 0, g);                 // casco
  const visor = part(new THREE.SphereGeometry(0.2, 20, 16, 0, Math.PI * 2, 0.5, 1.5), GOLD, 0, 1.79, -0.07, g);
  visor.rotation.x = -Math.PI / 2.1;
  part(new THREE.BoxGeometry(0.48, 0.7, 0.24), GREY, 0, 1.28, 0.3, g);                // mochila de soporte vital
  part(new THREE.BoxGeometry(0.2, 0.16, 0.08), DARK, 0, 1.3, -0.27, g);               // panel de control del pecho
  for (const s of [-1, 1]) {
    const leg = part(new THREE.CapsuleGeometry(0.11, 0.55, 4, 10), WHITE, s * 0.14, 0.48, 0, g); leg.name = s < 0 ? 'legL' : 'legR';
    part(new THREE.BoxGeometry(0.16, 0.1, 0.3), GREY, 0, -0.42, -0.05, leg);          // bota
    const arm = part(new THREE.CapsuleGeometry(0.085, 0.5, 4, 10), WHITE, s * 0.38, 1.25, 0, g); arm.name = s < 0 ? 'armL' : 'armR';
    part(new THREE.SphereGeometry(0.09, 10, 8), GREY, 0, -0.36, 0, arm);              // guante
    part(new THREE.CylinderGeometry(0.095, 0.095, 0.06, 12), stripeM, 0, 0.1, 0, arm);// banda de identificacion
  }
  g.userData.animate = (phase) => {         // balanceo de piernas y brazos al caminar
    const a = Math.sin(phase) * 0.5;
    g.getObjectByName('legL').rotation.x = a; g.getObjectByName('legR').rotation.x = -a;
    g.getObjectByName('armL').rotation.x = -a * 0.7; g.getObjectByName('armR').rotation.x = a * 0.7;
  };
  return g;
}

// Habitat de superficie: modulo cilindrico vertical, esclusa, paneles solares y antena
export function makeHabitat() {
  const g = new THREE.Group();
  part(new THREE.CylinderGeometry(4, 4, 5, 32), WHITE, 0, 3.4, 0, g);
  part(new THREE.SphereGeometry(4, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), WHITE, 0, 5.9, 0, g).scale.y = 0.45;
  part(new THREE.CylinderGeometry(4.05, 4.05, 0.35, 32), ORANGE, 0, 4.6, 0, g);
  for (let i = 0; i < 6; i++) {            // patas
    const a = (i / 6) * Math.PI * 2;
    part(new THREE.CylinderGeometry(0.15, 0.2, 1.2, 8), GREY, Math.cos(a) * 3.3, 0.5, Math.sin(a) * 3.3, g);
  }
  const lock = part(new THREE.CylinderGeometry(1.2, 1.2, 3, 20), GREY, 5, 2.2, 0, g); lock.rotation.z = Math.PI / 2;
  part(new THREE.BoxGeometry(2.4, 0.15, 1.6), GREY, 7.6, 0.95, 0, g).rotation.z = -0.32;   // rampa
  for (const s of [-1, 1]) {               // paneles solares
    part(new THREE.CylinderGeometry(0.08, 0.08, 2.5, 8), GREY, -2, 2.2, s * 6.5, g);
    const pnl = part(new THREE.BoxGeometry(7, 0.08, 3.2), BLUE, -2, 3.5, s * 6.5, g); pnl.rotation.x = s * 0.25;
  }
  part(new THREE.CylinderGeometry(0.05, 0.05, 3, 6), GREY, -1.5, 8.6, 0, g);
  const dish = part(new THREE.SphereGeometry(0.9, 16, 8, 0, Math.PI * 2, 0, 1.0), WHITE, -1.5, 10, 0, g); dish.rotation.x = Math.PI * 0.8;
  for (let i = 0; i < 4; i++) {            // ventanas
    const a = 0.6 + i * 0.5;
    part(new THREE.CircleGeometry(0.35, 16), DARK, Math.cos(a) * 4.02, 3.6, Math.sin(a) * 4.02, g).rotation.y = Math.PI / 2 - a;
  }
  return g;
}

// Rover presurizado de apoyo (6 ruedas)
export function makeRover() {
  const g = new THREE.Group();
  part(new THREE.BoxGeometry(2.4, 0.4, 4.6), GREY, 0, 0.95, 0, g);
  const cab = part(new THREE.CapsuleGeometry(1.15, 2.2, 6, 16), WHITE, 0, 2.05, 0, g); cab.rotation.x = Math.PI / 2;
  part(new THREE.SphereGeometry(1.0, 20, 12, 0, Math.PI * 2, 0, 1.3), mat(0x1c2a33, { metalness: 0.7, roughness: 0.15 }), 0, 2.15, -1.55, g).rotation.x = -Math.PI / 2;
  for (const s of [-1, 1]) for (const z of [-1.7, 0, 1.7]) {
    const w = part(new THREE.CylinderGeometry(0.55, 0.55, 0.45, 18), DARK, s * 1.45, 0.55, z, g); w.rotation.z = Math.PI / 2;
  }
  part(new THREE.BoxGeometry(2.2, 0.06, 1.6), BLUE, 0, 3.25, 0.8, g);
  part(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6), GREY, 0.8, 3.9, -0.6, g);
  return g;
}

// Curiosity simplificado (3 m de largo), colocado en su posicion real mas reciente
export function makeCuriosity() {
  const g = new THREE.Group();
  part(new THREE.BoxGeometry(1.6, 0.5, 2.2), WHITE, 0, 1.1, 0, g);
  for (const s of [-1, 1]) for (const z of [-1.1, 0, 1.1])
    part(new THREE.CylinderGeometry(0.25, 0.25, 0.4, 14), DARK, s * 1.15, 0.25, z, g).rotation.z = Math.PI / 2;
  for (const s of [-1, 1]) part(new THREE.BoxGeometry(0.08, 0.08, 2.4), GREY, s * 1.0, 0.65, 0, g);
  part(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 8), GREY, 0.55, 1.9, -0.85, g);           // mastil
  part(new THREE.BoxGeometry(0.45, 0.25, 0.25), WHITE, 0.55, 2.5, -0.85, g);                   // cabeza (Mastcam/ChemCam)
  const rtg = part(new THREE.CylinderGeometry(0.2, 0.2, 0.9, 12), DARK, 0, 1.45, 1.3, g); rtg.rotation.x = -0.9;  // generador
  part(new THREE.BoxGeometry(0.1, 0.1, 1.6), GREY, -0.4, 1.1, -1.8, g);                        // brazo
  return g;
}

// Baliza de parada cientifica: poste + esfera luminosa visible de lejos
export function makeBeacon(color = 0x39d0ff) {
  const g = new THREE.Group();
  part(new THREE.CylinderGeometry(0.04, 0.04, 3, 6), GREY, 0, 1.5, 0, g);
  part(new THREE.SphereGeometry(0.28, 14, 10), new THREE.MeshBasicMaterial({ color }), 0, 3.1, 0, g);
  const ring = part(new THREE.RingGeometry(1.6, 2.0, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide }), 0, 0.25, 0, g);
  ring.rotation.x = -Math.PI / 2;
  return g;
}
