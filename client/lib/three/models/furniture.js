// Longcase clock case (hood with columns and arched pediment, trunk with arched door and lenticle, stepped
// plinth) and a banker's lamp. Pure builders: pass THREE in. Clock frame: base y = 0, front +Z, dial centre
// at (0, 2.06, 0.215). Lamp frame: base y = 0, shade centred at (0, 0.36, 0.02), long axis on X.
const mk = (THREE) => (name, geo, mat, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.castShadow = true; m.receiveShadow = true; m.position.set(x, y, z); parent.add(m); return m; };
const lathe = (THREE, pts, seg) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

export function buildClockCase(THREE, opts = {}) {
  const mats = opts.materials || {
    wood: new THREE.MeshStandardMaterial({ name: 'walnut', color: '#5b3520', roughness: 0.45 }),
    trim: new THREE.MeshStandardMaterial({ name: 'walnut_dark', color: '#3a2114', roughness: 0.5 }),
    brass: new THREE.MeshStandardMaterial({ name: 'brass', color: '#d6ad5c', roughness: 0.3, metalness: 0.4 }),
    glass: new THREE.MeshStandardMaterial({ name: 'glass', color: '#0c0b0a', roughness: 0.08, transparent: true, opacity: 0.28 })
  };
  const mesh = mk(THREE), B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const g = new THREE.Group(); g.name = 'clock_case';
  // plinth
  mesh('plinth_skirt', B(0.66, 0.05, 0.46), mats.trim, g, 0, 0.025, 0);
  mesh('plinth', B(0.62, 0.24, 0.42), mats.wood, g, 0, 0.17, 0);
  mesh('plinth_panel', B(0.44, 0.13, 0.01), mats.trim, g, 0, 0.17, 0.214);
  mesh('plinth_cap', B(0.58, 0.035, 0.4), mats.trim, g, 0, 0.307, 0);
  // trunk: hollow case with a glazed arched door so the pendulum and weights show
  const arch = (P, hw, y0, yc) => { P.moveTo(-hw, y0); P.lineTo(hw, y0); P.lineTo(hw, yc); P.absarc(0, yc, hw, 0, Math.PI, false); P.closePath(); return P; };
  mesh('trunk_back', B(0.5, 1.42, 0.02), mats.trim, g, 0, 1.035, -0.16);
  [-1, 1].forEach(s => mesh(s < 0 ? 'trunk_side_left' : 'trunk_side_right', B(0.03, 1.42, 0.32), mats.wood, g, s * 0.235, 1.035, -0.01));
  const front = new THREE.Shape(); front.moveTo(-0.25, -0.71); front.lineTo(0.25, -0.71); front.lineTo(0.25, 0.71); front.lineTo(-0.25, 0.71); front.closePath(); front.holes.push(arch(new THREE.Path(), 0.13, -0.505, 0.245));
  mesh('trunk_front', new THREE.ExtrudeGeometry(front, { depth: 0.02, bevelEnabled: false, curveSegments: 20 }), mats.wood, g, 0, 1.035, 0.15);
  const door = arch(new THREE.Shape(), 0.17, -0.585, 0.245); door.holes.push(arch(new THREE.Path(), 0.13, -0.505, 0.245));
  mesh('trunk_door', new THREE.ExtrudeGeometry(door, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.012, bevelSegments: 2, curveSegments: 24 }), mats.wood, g, 0, 1.035, 0.17);
  mesh('trunk_glass', new THREE.ShapeGeometry(arch(new THREE.Shape(), 0.13, -0.505, 0.245), 20), mats.glass, g, 0, 1.035, 0.165).castShadow = false;
  mesh('door_key', new THREE.CylinderGeometry(0.009, 0.009, 0.014, 16).rotateX(Math.PI / 2), mats.brass, g, 0.15, 0.95, 0.19);
  [-1, 1].forEach(s => { const n = s < 0 ? 'left' : 'right'; mesh('weight_chain_' + n, B(0.004, 0.4, 0.004), mats.trim, g, s * 0.1, 1.53, -0.06); mesh('weight_' + n, lathe(THREE, [[0, 0], [0.026, 0], [0.026, 0.2], [0.018, 0.215], [0.004, 0.22], [0, 0.22]], 20), mats.brass, g, s * 0.1, 1.11, -0.06); });
  mesh('waist_moulding', B(0.56, 0.05, 0.38), mats.trim, g, 0, 1.765, 0);
  // hood with columns
  mesh('hood', B(0.56, 0.6, 0.4), mats.wood, g, 0, 2.08, 0);
  [-1, 1].forEach(x => {
    const n = x < 0 ? 'left' : 'right';
    mesh('column_' + n, new THREE.CylinderGeometry(0.022, 0.024, 0.5, 20), mats.wood, g, x * 0.25, 2.08, 0.2);
    mesh('column_cap_' + n, new THREE.CylinderGeometry(0.032, 0.026, 0.035, 20), mats.brass, g, x * 0.25, 2.345, 0.2);
    mesh('column_base_' + n, new THREE.CylinderGeometry(0.026, 0.032, 0.035, 20), mats.brass, g, x * 0.25, 1.815, 0.2);
  });
  mesh('cornice', B(0.68, 0.07, 0.47), mats.trim, g, 0, 2.415, 0);
  const ped = new THREE.Shape(); ped.moveTo(-0.32, 0); ped.lineTo(0.32, 0); ped.lineTo(0.32, 0.04); ped.quadraticCurveTo(0, 0.24, -0.32, 0.04); ped.closePath();
  mesh('pediment', new THREE.ExtrudeGeometry(ped, { depth: 0.36, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2, curveSegments: 24 }), mats.wood, g, 0, 2.45, -0.18);
  const fin = [[0, 0], [0.028, 0], [0.03, 0.012], [0.012, 0.024], [0.01, 0.04], [0.026, 0.062], [0.03, 0.08], [0.02, 0.1], [0.006, 0.116], [0, 0.13]];
  [[-0.3, 2.46], [0, 2.6], [0.3, 2.46]].forEach(([x, y], i) => mesh('finial_' + (i + 1), lathe(THREE, fin, 20), mats.brass, g, x, y, 0));
  return { clock: g, materials: mats };
}

// Pendulum: origin at the suspension point; swing it with rotation.z. Hang it at (0, 1.62, 0.04) in the clock case.
export function buildPendulum(THREE, opts = {}) {
  const mats = opts.materials || { brass: new THREE.MeshStandardMaterial({ name: 'brass', color: '#d6ad5c', roughness: 0.3, metalness: 0.4 }), trim: new THREE.MeshStandardMaterial({ name: 'walnut_dark', color: '#3a2114', roughness: 0.5 }) };
  const mesh = mk(THREE), g = new THREE.Group(); g.name = 'clock_pendulum';
  mesh('pendulum_spring', new THREE.BoxGeometry(0.016, 0.04, 0.002), mats.trim, g, 0, -0.02, 0);
  mesh('pendulum_rod', new THREE.BoxGeometry(0.01, 0.76, 0.004), mats.brass, g, 0, -0.4, 0);
  mesh('pendulum_bob', lathe(THREE, [[0, -0.012], [0.05, -0.009], [0.068, -0.004], [0.07, 0], [0.068, 0.004], [0.05, 0.009], [0, 0.012]], 40).rotateX(Math.PI / 2), mats.brass, g, 0, -0.8, 0);
  mesh('pendulum_nut', new THREE.CylinderGeometry(0.006, 0.006, 0.02, 12), mats.brass, g, 0, -0.885, 0);
  return g;
}

export function buildBankerLamp(THREE, opts = {}) {
  const mats = opts.materials || {
    brass: new THREE.MeshStandardMaterial({ name: 'brass', color: '#d6ad5c', roughness: 0.3, metalness: 0.4 }),
    glass: new THREE.MeshStandardMaterial({ name: 'green_glass', color: '#1f5a3a', roughness: 0.15, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    glow: new THREE.MeshStandardMaterial({ name: 'bulb', color: '#fff1cf', emissive: '#ffd89a', emissiveIntensity: 2 })
  };
  const mesh = mk(THREE);
  const g = new THREE.Group(); g.name = 'banker_lamp';
  const base = mesh('lamp_base', lathe(THREE, [[0, 0], [0.1, 0], [0.104, 0.006], [0.1, 0.014], [0.078, 0.022], [0.07, 0.03], [0.03, 0.036], [0.016, 0.042], [0, 0.042]], 40), mats.brass, g); base.scale.z = 0.62;
  mesh('lamp_stem', lathe(THREE, [[0, 0], [0.011, 0], [0.009, 0.02], [0.009, 0.1], [0.017, 0.115], [0.009, 0.13], [0.009, 0.25], [0.012, 0.26], [0, 0.265]], 20), mats.brass, g, 0, 0.04, 0);
  const yoke = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.15, 0.36, 0.02), new THREE.Vector3(-0.12, 0.3, 0.01), new THREE.Vector3(0, 0.29, 0), new THREE.Vector3(0.12, 0.3, 0.01), new THREE.Vector3(0.15, 0.36, 0.02)]);
  mesh('lamp_yoke', new THREE.TubeGeometry(yoke, 32, 0.0055, 10, false), mats.brass, g);
  const shade = mesh('lamp_shade', new THREE.CylinderGeometry(0.085, 0.085, 0.3, 40, 1, true, Math.PI / 2, Math.PI), mats.glass, g, 0, 0.36, 0.02); shade.rotation.z = Math.PI / 2;
  [-1, 1].forEach(s => {
    const cap = mesh(s < 0 ? 'shade_end_left' : 'shade_end_right', new THREE.CircleGeometry(0.085, 24, 0, Math.PI), mats.glass, g, s * 0.15, 0.36, 0.02); cap.rotation.y = s * Math.PI / 2;
    const rim = mesh(s < 0 ? 'shade_rim_front' : 'shade_rim_back', new THREE.CylinderGeometry(0.004, 0.004, 0.3, 8), mats.brass, g, 0, 0.36, 0.02 + s * 0.085); rim.rotation.z = Math.PI / 2;
    mesh(s < 0 ? 'shade_pivot_left' : 'shade_pivot_right', new THREE.SphereGeometry(0.01, 12, 8), mats.brass, g, s * 0.152, 0.36, 0.02);
  });
  mesh('shade_finial', new THREE.SphereGeometry(0.012, 16, 10), mats.brass, g, 0, 0.448, 0.02);
  const chain = new THREE.Group(); chain.name = 'pull_chain'; g.add(chain);
  for (let i = 0; i < 7; i++) mesh('chain_bead_' + i, new THREE.SphereGeometry(0.0035, 8, 6), mats.brass, chain, 0.06, 0.31 - i * 0.011, 0.07);
  mesh('chain_pull', new THREE.CylinderGeometry(0.004, 0.007, 0.022, 12), mats.brass, chain, 0.06, 0.225, 0.07);
  mesh('lamp_bulb', new THREE.CylinderGeometry(0.014, 0.014, 0.22, 16).rotateZ(Math.PI / 2), mats.glow, g, 0, 0.335, 0.02).castShadow = false;
  return { lamp: g, materials: mats };
}
