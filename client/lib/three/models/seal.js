// Wax seal in two halves that meet on a jagged crack, so it can break cleanly along the string.
// Pure builder: pass THREE in. Origin at the seal's base centre (y = 0); halfA is x ≥ 0, halfB is x ≤ 0.
export function buildWaxSeal(THREE, opts = {}) {
  const mats = opts.materials || { wax: new THREE.MeshStandardMaterial({ name: 'sealing_wax', color: '#8e1f19', roughness: 0.42 }) };
  const R = t => 0.031 + 0.0028 * Math.sin(5 * t + 0.4) + 0.0016 * Math.sin(11 * t + 1.3);
  const crack = [[0, -1], [0.002, -0.62], [-0.0016, -0.28], [0.0022, 0.08], [-0.0012, 0.44], [0.0016, 0.74], [0, 1]];
  const cy = f => (f < 0 ? f * R(Math.PI) : f * R(0));
  const seal = new THREE.Group(); seal.name = 'wax_seal';
  const half = sign => {
    const s = new THREE.Shape(), N = 28;
    for (let i = 0; i <= N; i++) { const t = sign > 0 ? (i / N) * Math.PI : Math.PI + (i / N) * Math.PI; const x = R(t) * Math.sin(t), y = R(t) * Math.cos(t); i ? s.lineTo(x, y) : s.moveTo(x, y); }
    const path = sign > 0 ? crack : crack.slice().reverse(); path.slice(1, -1).forEach(([dx, f]) => s.lineTo(dx, cy(f))); s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.003, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 2 }); geo.rotateX(-Math.PI / 2); geo.translate(0, 0.0015, 0);
    const h = new THREE.Group(); h.name = sign > 0 ? 'seal_half_a' : 'seal_half_b';
    const add = (name, g, y) => { const m = new THREE.Mesh(g, mats.wax); m.name = name; m.castShadow = true; m.receiveShadow = true; m.position.y = y; h.add(m); return m; };
    add(h.name + '_body', geo, 0);
    add(h.name + '_face', new THREE.CylinderGeometry(0.02, 0.022, 0.0025, 24, 1, false, sign > 0 ? 0 : Math.PI, Math.PI), 0.0058).position.x = sign * 0.0012;
    add(h.name + '_ring', new THREE.TorusGeometry(0.016, 0.0011, 6, 20, Math.PI).rotateZ(-sign * Math.PI / 2).rotateX(-Math.PI / 2), 0.0072).position.x = sign * 0.0012;
    add(h.name + '_mark', new THREE.BoxGeometry(0.0022, 0.0012, 0.014), 0.0075).position.x = sign * 0.006;
    seal.add(h); return h;
  };
  const halfA = half(1), halfB = half(-1);
  return { seal, halfA, halfB, materials: mats };
}
