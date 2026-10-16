// Advocate's office: law bookcase, book geometry (rounded spine), brass chandelier. Pure builders: pass THREE in.
const mk = THREE => (name, geo, mat, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.castShadow = true; m.receiveShadow = true; m.position.set(x, y, z); parent.add(m); return m; };
const lathe = (THREE, pts, seg) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

// Bookcase: origin floor centre, open front +Z. Returns shelf top heights and the two bays' x-ranges for filling.
export function buildBookcase(THREE, opts = {}) {
  const w = opts.w || 2.3, h = opts.h || 3.3, d = opts.d || 0.42, rows = opts.rows || 6;
  const mats = opts.materials || {
    wood: new THREE.MeshStandardMaterial({ name: 'walnut', color: '#5b3520', roughness: 0.5 }),
    trim: new THREE.MeshStandardMaterial({ name: 'walnut_dark', color: '#3a2114', roughness: 0.55 }),
    brass: new THREE.MeshStandardMaterial({ name: 'brass', color: '#b8913f', roughness: 0.35, metalness: 0.5 })
  };
  const mesh = mk(THREE), B = (a, b, c) => new THREE.BoxGeometry(a, b, c), g = new THREE.Group(); g.name = 'law_bookcase';
  mesh('plinth', B(w + 0.04, 0.14, d + 0.04), mats.trim, g, 0, 0.07, 0.02);
  [-1, 1].forEach(s => mesh(s < 0 ? 'side_left' : 'side_right', B(0.06, h - 0.14, d), mats.wood, g, s * (w / 2 - 0.03), 0.14 + (h - 0.14) / 2, 0));
  mesh('back', B(w - 0.12, h - 0.14, 0.02), mats.trim, g, 0, 0.14 + (h - 0.14) / 2, -d / 2 + 0.01);
  mesh('upright', B(0.04, h - 0.3, d - 0.04), mats.wood, g, 0, 0.14 + (h - 0.3) / 2, 0);
  [-1, 1].forEach(s => mesh(s < 0 ? 'stile_left' : 'stile_right', B(0.09, h - 0.2, 0.025), mats.wood, g, s * (w / 2 - 0.045), 0.14 + (h - 0.24) / 2, d / 2 + 0.012));
  mesh('stile_centre', B(0.06, h - 0.3, 0.025), mats.wood, g, 0, 0.14 + (h - 0.3) / 2, d / 2 + 0.012);
  const shelfYs = [], bays = [[-(w / 2 - 0.06) + 0.01, -0.025], [0.025, w / 2 - 0.07]];
  for (let r = 0; r < rows; r++) {
    const yc = 0.14 + r * 0.52; shelfYs.push(yc + 0.015);
    mesh('shelf_' + (r + 1), B(w - 0.12, 0.03, d - 0.03), mats.wood, g, 0, yc, -0.01);
    mesh('shelf_lip_' + (r + 1), B(w - 0.12, 0.05, 0.02), mats.trim, g, 0, yc - 0.01, d / 2 - 0.012);
    bays.forEach(([a, b], k) => mesh(`label_holder_${r + 1}_${k + 1}`, B(0.07, 0.024, 0.004), mats.brass, g, (a + b) / 2, yc - 0.012, d / 2 + 0.0));
  }
  mesh('crown_frieze', B(w + 0.04, 0.1, d + 0.04), mats.trim, g, 0, h - 0.05, 0.02);
  mesh('crown_moulding', B(w + 0.14, 0.05, d + 0.1), mats.wood, g, 0, h + 0.025, 0.04);
  mesh('crown_cap', B(w + 0.1, 0.03, d + 0.07), mats.trim, g, 0, h + 0.065, 0.03);
  return { bookcase: g, shelfYs, bays, depth: d, materials: mats };
}

// Unit book (1 × 1 × 1, spine on +Z) with a rounded spine; scale per instance (x = thickness, y = height, z = depth).
export function bookGeometry(THREE) {
  const parts = [new THREE.BoxGeometry(1, 1, 0.92).translate(0, 0, -0.04).toNonIndexed(), new THREE.CylinderGeometry(0.5, 0.5, 1, 4, 1, true, -Math.PI / 2, Math.PI).scale(1, 1, 0.16).translate(0, 0, 0.42).toNonIndexed()];
  const geo = new THREE.BufferGeometry();
  ['position', 'normal', 'uv'].forEach(a => { const size = parts[0].attributes[a].itemSize, n = parts.reduce((s, p) => s + p.attributes[a].array.length, 0), arr = new Float32Array(n); let o = 0; parts.forEach(p => { arr.set(p.attributes[a].array, o); o += p.attributes[a].array.length; }); geo.setAttribute(a, new THREE.BufferAttribute(arr, size)); });
  geo.computeBoundingBox(); geo.computeBoundingSphere(); return geo;
}

// Five-arm brass chandelier with frosted tulip shades. Origin at the ceiling (y = 0), hangs down ~1.2 m; shades sit at y ≈ -1.0.
export function buildChandelierSimple(THREE, opts = {}) {
  const mats = opts.materials || {
    brass: new THREE.MeshStandardMaterial({ name: 'brass', color: '#c9a45c', roughness: 0.3, metalness: 0.6 }),
    shade: new THREE.MeshStandardMaterial({ name: 'frosted_glass', color: '#fff1d8', emissive: '#ffc27a', emissiveIntensity: 1.4, roughness: 0.5 })
  };
  const mesh = mk(THREE), g = new THREE.Group(), drop = opts.drop || 0.8; g.name = 'office_chandelier';
  mesh('ceiling_rose', lathe(THREE, [[0, 0], [0.13, 0], [0.13, -0.02], [0.09, -0.05], [0.03, -0.075], [0, -0.075]].map(([r, y]) => [r, y]).reverse(), 32), mats.brass, g);
  mesh('drop_rod', new THREE.CylinderGeometry(0.011, 0.011, drop, 12), mats.brass, g, 0, -0.075 - drop / 2, 0);
  const y0 = -0.075 - drop;
  mesh('body_urn', lathe(THREE, [[0, y0 - 0.26], [0.02, y0 - 0.26], [0.035, y0 - 0.24], [0.06, y0 - 0.2], [0.075, y0 - 0.15], [0.06, y0 - 0.1], [0.03, y0 - 0.06], [0.022, y0 - 0.02], [0.03, y0], [0, y0]], 28), mats.brass, g);
  mesh('body_drop', new THREE.SphereGeometry(0.025, 16, 12), mats.brass, g, 0, y0 - 0.285, 0);
  const shadeGeo = lathe(THREE, [[0.018, 0], [0.04, 0.02], [0.062, 0.07], [0.075, 0.12], [0.07, 0.125]], 20), cup = lathe(THREE, [[0, -0.02], [0.02, -0.02], [0.03, 0], [0.024, 0.01], [0, 0.01]], 16);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), P = (r, y) => new THREE.Vector3(r * c, y, r * s);
    mesh('arm_' + (i + 1), new THREE.TubeGeometry(new THREE.CatmullRomCurve3([P(0.05, y0 - 0.16), P(0.2, y0 - 0.22), P(0.31, y0 - 0.16), P(0.34, y0 - 0.07)]), 20, 0.009, 8, false), mats.brass, g);
    const tip = P(0.34, y0 - 0.06);
    mesh('cup_' + (i + 1), cup, mats.brass, g, tip.x, tip.y, tip.z);
    mesh('shade_' + (i + 1), shadeGeo, mats.shade, g, tip.x, tip.y + 0.01, tip.z).castShadow = false;
  }
  return { chandelier: g, materials: mats, lightY: y0 - 0.0 };
}

// Two-tier Baroque chandelier: canopy and chain, crown with finials, turned baluster stem with a crystal knop,
// 5 upper + 8 lower scrolled candle arms with bobeches and flame bulbs, crystal prisms, bead swags and garlands,
// gilt bowl with a crystal-ball finial. Origin at the ceiling (y = 0); hangs ~1.55 m; lower candles at y ≈ -1.08.
export function buildChandelier(THREE, opts = {}) {
  const mats = Object.assign({
    brass: new THREE.MeshStandardMaterial({ name: 'gilt_brass', color: '#d4ae62', roughness: 0.26, metalness: 0.7 }),
    shade: new THREE.MeshStandardMaterial({ name: 'flame_bulb', color: '#fff4de', emissive: '#ffc778', emissiveIntensity: 2.2, roughness: 0.4 }),
    crystal: new THREE.MeshStandardMaterial({ name: 'crystal', color: '#fff8ee', emissive: '#ffd49a', emissiveIntensity: 0.45, roughness: 0.04, metalness: 0.25, flatShading: true }),
    candle: new THREE.MeshStandardMaterial({ name: 'candle_sleeve', color: '#efe6d3', roughness: 0.55 })
  }, opts.materials || {});
  const mesh = mk(THREE), g = new THREE.Group(); g.name = 'office_chandelier';
  const V = (x, y, z) => new THREE.Vector3(x, y, z), tube = (name, pts, r, seg = 24) => mesh(name, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, 8, false), mats.brass, g);
  const drop = new THREE.OctahedronGeometry(0.016, 0).scale(0.8, 1.9, 0.8), prism = new THREE.OctahedronGeometry(0.011, 0).scale(0.7, 1.4, 0.7), bead = new THREE.OctahedronGeometry(0.0085, 0);
  const hang = (name, x, y, z, big) => { const h = big ? 0.03 : 0.021; mesh(name + '_hook', new THREE.CylinderGeometry(0.0015, 0.0015, 0.018, 4), mats.brass, g, x, y - 0.009, z); mesh(name, big ? drop : prism, mats.crystal, g, x, y - 0.018 - h, z).castShadow = false; };
  mesh('canopy', lathe(THREE, [[0, -0.1], [0.03, -0.1], [0.05, -0.085], [0.12, -0.05], [0.16, -0.015], [0.165, 0], [0, 0]], 36), mats.brass, g);
  mesh('canopy_beads', new THREE.TorusGeometry(0.155, 0.007, 6, 36).rotateX(Math.PI / 2), mats.brass, g, 0, -0.018, 0);
  for (let k = 0; k < 7; k++) { const l = mesh('chain_link_' + (k + 1), new THREE.TorusGeometry(0.022, 0.0045, 6, 16), mats.brass, g, 0, -0.125 - k * 0.052, 0); l.scale.set(0.75, 1.3, 1); l.rotation.y = k % 2 ? Math.PI / 2 : 0; }
  const yc = -0.5;
  mesh('crown_ring', new THREE.TorusGeometry(0.2, 0.009, 8, 48).rotateX(Math.PI / 2), mats.brass, g, 0, yc, 0);
  mesh('crown_hub', lathe(THREE, [[0, yc - 0.05], [0.02, yc - 0.05], [0.045, yc - 0.03], [0.05, yc + 0.01], [0.03, yc + 0.04], [0, yc + 0.04]], 24), mats.brass, g);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2, x = Math.cos(a) * 0.2, z = Math.sin(a) * 0.2;
    tube('crown_spoke_' + (k + 1), [V(0, yc - 0.01, 0), V(x * 0.5, yc + 0.02, z * 0.5), V(x, yc, z)], 0.004, 8);
    mesh('crown_finial_' + (k + 1), lathe(THREE, [[0, 0], [0.012, 0], [0.008, 0.02], [0.012, 0.035], [0.004, 0.06], [0, 0.07]], 10), mats.brass, g, x, yc + 0.008, z);
    hang('crown_drop_' + (k + 1), x, yc - 0.008, z, false); }
  mesh('stem', lathe(THREE, [[0, -1.2], [0.05, -1.2], [0.07, -1.17], [0.04, -1.12], [0.03, -1.02], [0.05, -0.98], [0.03, -0.94], [0.022, -0.86], [0.042, -0.82], [0.024, -0.78], [0.018, -0.66], [0.034, -0.62], [0.02, -0.58], [0.016, -0.55], [0, -0.55]], 28), mats.brass, g);
  mesh('glass_knop', new THREE.IcosahedronGeometry(0.05, 1), mats.crystal, g, 0, -0.7, 0).castShadow = false;
  const flameGeo = new THREE.SphereGeometry(0.018, 12, 10).scale(1, 1.7, 1), cup = lathe(THREE, [[0, -0.012], [0.02, -0.012], [0.042, 0.004], [0.046, 0.01], [0.03, 0.008], [0, 0.008]], 18);
  const arms = (tier, n, R, y) => { const tips = [];
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 + (tier === 'upper' ? Math.PI / n : 0), c = Math.cos(a), s = Math.sin(a), P = (r, yy) => V(r * c, yy, r * s);
      tube(`arm_${tier}_${k + 1}`, [P(0.03, y + 0.02), P(R * 0.35, y - 0.09), P(R * 0.75, y - 0.1), P(R, y - 0.04), P(R, y + 0.03)], tier === 'lower' ? 0.009 : 0.007);
      const curl = mesh(`arm_curl_${tier}_${k + 1}`, new THREE.TorusGeometry(0.028, 0.005, 6, 18, Math.PI * 1.5), mats.brass, g, R * 0.4 * c, y - 0.04, R * 0.4 * s); curl.rotation.y = -a;
      const tip = P(R, y + 0.035); tips.push(tip);
      mesh(`bobeche_${tier}_${k + 1}`, cup, mats.brass, g, tip.x, tip.y, tip.z);
      mesh(`candle_${tier}_${k + 1}`, new THREE.CylinderGeometry(0.011, 0.012, 0.075, 12), mats.candle, g, tip.x, tip.y + 0.045, tip.z);
      mesh(`flame_${tier}_${k + 1}`, flameGeo, mats.shade, g, tip.x, tip.y + 0.105, tip.z).castShadow = false;
      [0, 1, 2].forEach(j => { const b = a + (j - 1) * 0.5 + Math.PI / 2; hang(`prism_${tier}_${k + 1}_${j + 1}`, tip.x + Math.cos(b) * 0.042, tip.y + 0.004, tip.z + Math.sin(b) * 0.042, false); });
      const m = P(R * 0.6, 0); hang(`drop_${tier}_${k + 1}`, m.x, y - 0.1, m.z, true); }
    return tips; };
  arms('upper', 5, 0.27, -0.84);
  const low = arms('lower', 8, 0.5, -1.12);
  low.forEach((a, k) => { const b = low[(k + 1) % low.length], n = 13; for (let j = 1; j < n; j++) { const t = j / n, p = a.clone().lerp(b, t); p.y -= 0.03 + Math.sin(Math.PI * t) * 0.1; mesh(`swag_${k + 1}_${j}`, bead, mats.crystal, g, p.x, p.y, p.z).castShadow = false; } });
  low.forEach((a, k) => { const o = V(0, -1.18, 0), e = V(a.x * 0.7, a.y - 0.02, a.z * 0.7), n = 9; for (let j = 1; j < n; j++) { const t = j / n, p = o.clone().lerp(e, t); p.y -= Math.sin(Math.PI * t) * 0.07; mesh(`garland_${k + 1}_${j}`, bead, mats.crystal, g, p.x, p.y, p.z).castShadow = false; } });
  mesh('bowl', lathe(THREE, [[0, -1.3], [0.04, -1.3], [0.09, -1.27], [0.13, -1.22], [0.15, -1.18], [0.12, -1.17], [0, -1.17]], 32), mats.brass, g);
  mesh('bowl_rim', new THREE.TorusGeometry(0.148, 0.007, 6, 40).rotateX(Math.PI / 2), mats.brass, g, 0, -1.18, 0);
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; hang('bowl_prism_' + (k + 1), Math.cos(a) * 0.148, -1.185, Math.sin(a) * 0.148, false); }
  mesh('finial_neck', lathe(THREE, [[0, -1.42], [0.012, -1.42], [0.02, -1.38], [0.014, -1.34], [0.03, -1.31], [0, -1.31]], 16), mats.brass, g);
  mesh('crystal_ball', new THREE.IcosahedronGeometry(0.055, 1), mats.crystal, g, 0, -1.47, 0).castShadow = false;
  hang('finial_drop', 0, -1.525, 0, true);
  return { chandelier: g, materials: mats, lightY: -1.0 };
}
