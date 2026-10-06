// Chesterfield club chair: rolled arms level with a rolled back, deep-buttoned tufting, nailhead trim, bun feet.
// Pure builder: pass THREE in. Origin floor centre, seat faces +Z.
const mk = THREE => (name, geo, mat, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.castShadow = true; m.receiveShadow = true; m.position.set(x, y, z); parent.add(m); return m; };

export function buildClubChair(THREE, opts = {}) {
  const mats = opts.materials || {
    leather: new THREE.MeshStandardMaterial({ name: 'oxblood_leather', color: '#5e1a14', roughness: 0.55 }),
    wood: new THREE.MeshStandardMaterial({ name: 'walnut_dark', color: '#3a2114', roughness: 0.5 }),
    brass: new THREE.MeshStandardMaterial({ name: 'brass', color: '#b8913f', roughness: 0.35, metalness: 0.5 })
  };
  const mesh = mk(THREE), g = new THREE.Group(); g.name = 'leather_club_chair';
  const rbox = (w, h, d, r) => { const s = new THREE.Shape(), x = -(w / 2 - r), y = -(h / 2 - r); s.moveTo(x, y); s.lineTo(-x, y); s.lineTo(-x, -y); s.lineTo(x, -y); s.closePath(); const geo = new THREE.ExtrudeGeometry(s, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 3, curveSegments: 1 }); geo.translate(0, 0, -(d - 2 * r) / 2); return geo; };
  const roll = (len, r) => new THREE.CylinderGeometry(r, r, len, 24);
  mesh('chair_base', rbox(0.95, 0.3, 0.86, 0.03), mats.leather, g, 0, 0.2, 0);
  mesh('seat_cushion', rbox(0.6, 0.13, 0.64, 0.05), mats.leather, g, 0, 0.41, 0.06);
  mesh('chair_back', rbox(0.95, 0.4, 0.2, 0.04), mats.leather, g, 0, 0.55, -0.33);
  mesh('back_roll', roll(0.95, 0.09).rotateZ(Math.PI / 2), mats.leather, g, 0, 0.76, -0.34);
  [-1, 1].forEach(s => {
    const n = s < 0 ? 'left' : 'right';
    mesh('arm_' + n, rbox(0.18, 0.4, 0.86, 0.04), mats.leather, g, s * 0.385, 0.52, 0.02);
    mesh('arm_roll_' + n, roll(0.86, 0.1).rotateX(Math.PI / 2), mats.leather, g, s * 0.4, 0.74, 0.02);
    const face = mesh('arm_face_' + n, new THREE.SphereGeometry(0.1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), mats.leather, g, s * 0.4, 0.74, 0.45); face.scale.z = 0.25;
    mesh('arm_button_' + n, new THREE.SphereGeometry(0.014, 10, 8), mats.leather, g, s * 0.4, 0.74, 0.478);
    for (let k = 0; k < 7; k++) mesh(`nailhead_${n}_${k + 1}`, new THREE.SphereGeometry(0.007, 8, 6), mats.brass, g, s * (0.31 + k * 0.024), 0.62, 0.452);
  });
  // deep-buttoned tufting on the back and inner arms
  const btn = new THREE.SphereGeometry(0.012, 10, 8); let n = 0;
  [0.45, 0.57, 0.69].forEach((y, r) => { for (let x = -0.3 + (r % 2) * 0.075; x <= 0.301; x += 0.15) { const b = mesh('tuft_back_' + (++n), btn, mats.leather, g, x, y, -0.228); b.scale.z = 0.5; } });
  [-1, 1].forEach(s => [0.48, 0.62].forEach((y, r) => { for (let z = -0.18 + (r % 2) * 0.075; z <= 0.33; z += 0.15) { const b = mesh('tuft_arm_' + (++n), btn, mats.leather, g, s * 0.293, y, z); b.scale.x = 0.5; } }));
  for (let k = 0; k < 26; k++) mesh('nailhead_front_' + (k + 1), new THREE.SphereGeometry(0.007, 8, 6), mats.brass, g, -0.45 + k * 0.036, 0.08, 0.433);
  const foot = new THREE.LatheGeometry([[0, 0], [0.03, 0], [0.045, 0.015], [0.045, 0.03], [0.035, 0.045], [0.03, 0.05], [0, 0.05]].map(([r, y]) => new THREE.Vector2(r, y)), 16);
  [[-0.4, -0.36], [0.4, -0.36], [-0.4, 0.36], [0.4, 0.36]].forEach(([x, z], i) => mesh('bun_foot_' + (i + 1), foot, mats.wood, g, x, 0, z));
  return { chair: g, materials: mats };
}
