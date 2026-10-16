// AI judge — stylised, faceless figure in robe and bands. Pure builder: pass THREE in, get named groups back.
// Frame: robe base at y = 0, head centre y ≈ 1.03, facing +Z. `arm` is the gavel arm pivot (shoulder at
// 0.3, 0.8, 0.05), forearm runs +Z, hand at z ≈ 0.62 — attach the gavel to it at (0, -0.01, 0.6).
export function buildJudge(THREE, opts = {}) {
  const seg = opts.segments || 40;
  const mats = opts.materials || {
    robe: new THREE.MeshStandardMaterial({ name: 'robe', color: '#17130f', roughness: 0.78, metalness: 0 }),
    cream: new THREE.MeshStandardMaterial({ name: 'bands', color: '#f1ebdd', roughness: 0.6, metalness: 0 }),
    head: new THREE.MeshStandardMaterial({ name: 'porcelain', color: '#d8d1c3', roughness: 0.34, metalness: 0 }),
    wig: new THREE.MeshStandardMaterial({ name: 'wig', color: '#e6dfd0', roughness: 0.92, metalness: 0 }),
    visor: new THREE.MeshStandardMaterial({ name: 'visor', color: '#1a1510', emissive: '#c9a45c', emissiveIntensity: 0.9, roughness: 0.3 })
  };
  const V2 = a => a.map(([r, y]) => new THREE.Vector2(r, y));
  const mesh = (name, geo, mat, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.castShadow = true; m.receiveShadow = true; m.position.set(x, y, z); parent.add(m); return m; };
  const judge = new THREE.Group(); judge.name = 'ai_judge';

  // robe: seated torso, tapering to sloped shoulders; flattened front-to-back
  const robe = mesh('robe_body', new THREE.LatheGeometry(V2([[0, 0], [0.36, 0], [0.42, 0.16], [0.432, 0.4], [0.42, 0.58], [0.4, 0.68], [0.36, 0.755], [0.29, 0.81], [0.18, 0.86], [0.085, 0.89], [0, 0.895]]), seg), mats.robe, judge);
  robe.scale.z = 0.72;
  [-1, 1].forEach(s => { const sh = mesh(s < 0 ? 'robe_shoulder_left' : 'robe_shoulder_right', new THREE.SphereGeometry(0.12, 24, 16), mats.robe, judge, s * 0.29, 0.765, 0.01); sh.scale.set(1.05, 0.72, 0.95); });
  // front placket: two raised facings either side of the opening
  [-1, 1].forEach(s => { const f = mesh(s < 0 ? 'robe_facing_left' : 'robe_facing_right', new THREE.BoxGeometry(0.05, 0.62, 0.012), mats.robe, judge, s * 0.05, 0.5, 0.3); f.rotation.x = -0.1; });

  // neck, wing collar and bands
  mesh('neck', new THREE.CylinderGeometry(0.048, 0.058, 0.1, 24), mats.head, judge, 0, 0.925, 0);
  const collar = mesh('collar', new THREE.TorusGeometry(0.066, 0.015, 10, 32), mats.cream, judge, 0, 0.897, 0); collar.rotation.x = Math.PI / 2;
  [-1, 1].forEach(s => { const b = mesh(s < 0 ? 'band_left' : 'band_right', new THREE.BoxGeometry(0.036, 0.13, 0.006), mats.cream, judge, s * 0.021, 0.815, 0.232); b.rotation.set(-0.12, 0, s * -0.06); });

  // faceless head with a thin glowing visor line
  const head = mesh('head', new THREE.SphereGeometry(0.115, 40, 28), mats.head, judge, 0, 1.03, 0); head.scale.set(0.9, 1.1, 0.97);
  const visor = mesh('visor', new THREE.CylinderGeometry(0.1145, 0.1145, 0.01, 40, 1, true, -0.72, 1.44), mats.visor, judge, 0, 1.045, 0); visor.scale.x = 0.9; visor.castShadow = false;

  if (opts.wig !== false) {
    const wig = new THREE.Group(); wig.name = 'wig'; judge.add(wig);
    const cap = mesh('wig_cap', new THREE.SphereGeometry(0.127, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), mats.wig, wig, 0, 1.045, -0.004); cap.scale.set(0.93, 1.06, 1.0);
    for (let k = 0; k < 3; k++) {
      const g = new THREE.TorusGeometry(0.118 + k * 0.011, 0.02, 10, 32, Math.PI * 1.25);
      g.rotateZ(-Math.PI * 0.125); g.rotateX(Math.PI / 2); g.rotateY(Math.PI);
      const r = mesh('wig_roll_' + (k + 1), g, mats.wig, wig, 0, 1.0 - k * 0.043, -0.004); r.scale.x = 0.93;
    }
  }

  // arms: bell sleeves with shirt cuffs and simple mitten hands
  const sleeve = (name, parent, len) => {
    const g = new THREE.CylinderGeometry(0.112, 0.08, len, 32, 1, true); g.rotateX(Math.PI / 2); g.translate(0, 0, len / 2);
    const s = mesh(name + '_sleeve', g, mats.robe, parent); s.material.side = THREE.DoubleSide;
    const cuff = mesh(name + '_cuff', new THREE.TorusGeometry(0.043, 0.009, 8, 28), mats.cream, parent, 0, 0, len - 0.05);
    const hand = mesh(name + '_hand', new THREE.SphereGeometry(0.046, 24, 16), mats.head, parent, 0, -0.004, len + 0.035); hand.scale.set(0.95, 0.72, 1.3);
    return { s, cuff, hand };
  };
  const armL = new THREE.Group(); armL.name = 'arm_left'; armL.position.set(-0.3, 0.78, 0.05); armL.rotation.set(0.3, 0.12, 0); judge.add(armL); sleeve('arm_left', armL, 0.44);
  const arm = new THREE.Group(); arm.name = 'arm_right'; arm.position.set(0.3, 0.8, 0.05); judge.add(arm); sleeve('arm_right', arm, 0.55);

  return { judge, arm, materials: mats };
}
