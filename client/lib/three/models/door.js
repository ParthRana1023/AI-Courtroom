// Entrance door detail: fielded panels with bolection mouldings, a brass lever handle on a rose, and a
// keyhole escutcheon. Pure builder: pass THREE in. All parts face +Z; the leaf's front face sits at z ≈ 0.05.
export function buildDoor(THREE, opts = {}) {
  const mats = opts.materials || {
    wood: new THREE.MeshStandardMaterial({ name: 'walnut', color: '#6a4028', roughness: 0.5 }),
    trim: new THREE.MeshStandardMaterial({ name: 'walnut_dark', color: '#3f2416', roughness: 0.55 }),
    brass: new THREE.MeshStandardMaterial({ name: 'brass', color: '#d6ad5c', roughness: 0.3, metalness: 0.4 }),
    black: new THREE.MeshStandardMaterial({ name: 'keyhole', color: '#0b0908', roughness: 0.8 })
  };
  const mesh = (name, geo, mat, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.castShadow = true; m.receiveShadow = true; m.position.set(x, y, z); parent.add(m); return m; };
  const rect = (w, h, r = 0) => { const s = new THREE.Shape(); const x = -w / 2, y = -h / 2; if (!r) { s.moveTo(x, y); s.lineTo(x + w, y); s.lineTo(x + w, y + h); s.lineTo(x, y + h); s.closePath(); return s; } s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s; };

  // panels: [x, y, w, h] in leaf space
  const panels = new THREE.Group(); panels.name = 'door_panels';
  (opts.panels || [[-0.4, 2.45, 0.62, 1.2], [0.4, 2.45, 0.62, 1.2], [-0.4, 0.85, 0.62, 1.0], [0.4, 0.85, 0.62, 1.0]]).forEach(([x, y, w, h], i) => {
    const field = new THREE.ExtrudeGeometry(rect(w - 0.1, h - 0.1), { depth: 0.008, bevelEnabled: true, bevelThickness: 0.014, bevelSize: 0.045, bevelSegments: 2, curveSegments: 1 });
    mesh('panel_field_' + (i + 1), field, mats.wood, panels, x, y, 0.05);
    const ring = rect(w + 0.07, h + 0.07); ring.holes.push(rect(w, h));
    const mould = new THREE.ExtrudeGeometry(ring, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.009, bevelSegments: 3, curveSegments: 1 });
    mesh('panel_moulding_' + (i + 1), mould, mats.trim, panels, x, y, 0.052);
  });

  // lever handle on a round rose; group origin = spindle centre on the leaf face
  const handle = new THREE.Group(); handle.name = 'door_brass_handle';
  const rose = new THREE.LatheGeometry([[0, 0], [0.036, 0], [0.04, 0.003], [0.04, 0.007], [0.034, 0.012], [0.02, 0.016], [0.014, 0.02], [0, 0.02]].map(([r, y]) => new THREE.Vector2(r, y)), 40); rose.rotateX(Math.PI / 2);
  mesh('handle_rose', rose, mats.brass, handle);
  mesh('handle_neck', new THREE.CylinderGeometry(0.011, 0.013, 0.036, 24).rotateX(Math.PI / 2), mats.brass, handle, 0, 0, 0.036);
  const path = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0.052), new THREE.Vector3(-0.03, 0, 0.062), new THREE.Vector3(-0.09, -0.004, 0.064), new THREE.Vector3(-0.15, -0.01, 0.062), new THREE.Vector3(-0.172, -0.004, 0.05)]);
  mesh('handle_lever', new THREE.TubeGeometry(path, 40, 0.0105, 16, false), mats.brass, handle);
  const tip = mesh('handle_tip', new THREE.SphereGeometry(0.0125, 20, 14), mats.brass, handle, -0.172, -0.004, 0.05); tip.scale.set(1, 1, 0.9);
  mesh('handle_boss', new THREE.SphereGeometry(0.0135, 20, 14), mats.brass, handle, 0, 0, 0.052);

  // escutcheon plate with a cut keyhole
  const lock = new THREE.Group(); lock.name = 'door_lock_escutcheon';
  const plate = rect(0.05, 0.13, 0.018); const key = new THREE.Path(); key.absarc(0, 0.018, 0.0075, 0, Math.PI * 2, false); plate.holes.push(key);
  const slot = new THREE.Path(); slot.moveTo(-0.003, 0.012); slot.lineTo(-0.0055, -0.02); slot.lineTo(0.0055, -0.02); slot.lineTo(0.003, 0.012); slot.closePath(); plate.holes.push(slot);
  mesh('escutcheon_plate', new THREE.ExtrudeGeometry(plate, { depth: 0.002, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2, curveSegments: 16 }), mats.brass, lock);
  mesh('escutcheon_hole', new THREE.PlaneGeometry(0.02, 0.05), mats.black, lock, 0, 0.005, 0.0005);

  return { panels, handle, lock, materials: mats };
}
