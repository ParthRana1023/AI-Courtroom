// Oak partners' desk and the investigation board frame. Pure builders: pass THREE in.
// Desk frame: floor y = 0, top surface y = 0.78, visitor side +Z, advocate's (drawer) side -Z.
// Board frame: base on y = 0, cork face at z ≈ 0.08, cork centre y = 1.94 (6.4 × 2.52 m).
const mk = (THREE) => (name, geo, mat, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.castShadow = true; m.receiveShadow = true; m.position.set(x, y, z); parent.add(m); return m; };
const rect = (THREE, w, h, r = 0) => { const s = new THREE.Shape(), x = -w / 2, y = -h / 2; if (!r) { s.moveTo(x, y); s.lineTo(x + w, y); s.lineTo(x + w, y + h); s.lineTo(x, y + h); s.closePath(); return s; } s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s; };

export function buildDesk(THREE, opts = {}) {
  const mats = opts.materials || {
    oak: new THREE.MeshStandardMaterial({ name: 'oak', color: '#8a6038', roughness: 0.5 }),
    walnut: new THREE.MeshStandardMaterial({ name: 'walnut', color: '#5b3520', roughness: 0.5 }),
    brass: new THREE.MeshStandardMaterial({ name: 'brass', color: '#d6ad5c', roughness: 0.3, metalness: 0.4 }),
    leather: new THREE.MeshStandardMaterial({ name: 'leather', color: '#2e4a33', roughness: 0.7 })
  };
  const mesh = mk(THREE), B = (w, h, d) => new THREE.BoxGeometry(w, h, d), g = new THREE.Group(); g.name = 'oak_lawyer_desk';
  const field = (w, h, depth = 0.006) => new THREE.ExtrudeGeometry(rect(THREE, w, h), { depth, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.02, bevelSegments: 2, curveSegments: 1 });
  // top with a bevelled edge, leather writing surface and a brass tooling line
  const top = new THREE.ExtrudeGeometry(rect(THREE, 2.18, 1.03, 0.03), { depth: 0.032, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.01, bevelSegments: 3, curveSegments: 6 }); top.rotateX(-Math.PI / 2);
  mesh('desk_top', top, mats.oak, g, 0, 0.732, 0);
  mesh('writing_leather', B(1.9, 0.002, 0.78), mats.leather, g, 0, 0.7805, 0);
  const line = rect(THREE, 1.86, 0.74); line.holes.push(rect(THREE, 1.848, 0.728)); const lg = new THREE.ShapeGeometry(line); lg.rotateX(-Math.PI / 2);
  mesh('tooling_line', lg, mats.brass, g, 0, 0.7818, 0).castShadow = false;
  mesh('top_apron', B(2.12, 0.05, 0.98), mats.walnut, g, 0, 0.705, 0);
  [-1, 1].forEach(s => {
    const n = s < 0 ? 'left' : 'right', x = s * 0.8;
    mesh('pedestal_' + n, B(0.55, 0.62, 0.93), mats.oak, g, x, 0.39, 0);
    mesh('plinth_' + n, B(0.59, 0.08, 0.97), mats.walnut, g, x, 0.04, 0);
    mesh('pedestal_cap_' + n, B(0.57, 0.02, 0.95), mats.walnut, g, x, 0.69, 0);
    // three drawers on the advocate's side, each with a raised front, bail pull and keyhole
    [[0.585, 0.15], [0.405, 0.18], [0.2, 0.2]].forEach(([y, h], k) => {
      const f = mesh(`drawer_${n}_${k + 1}`, field(0.44, h - 0.03), mats.walnut, g, x, y, -0.476); f.rotation.y = Math.PI;
      const bail = new THREE.TorusGeometry(0.035, 0.0045, 8, 20, Math.PI); bail.rotateZ(Math.PI);
      mesh(`pull_${n}_${k + 1}`, bail, mats.brass, g, x, y - 0.005, -0.51);
      [-1, 1].forEach(t => mesh(`pull_post_${n}_${k + 1}_${t < 0 ? 'l' : 'r'}`, new THREE.CylinderGeometry(0.006, 0.006, 0.02, 10).rotateX(Math.PI / 2), mats.brass, g, x + t * 0.035, y - 0.005, -0.5));
      mesh(`keyhole_${n}_${k + 1}`, new THREE.CylinderGeometry(0.008, 0.008, 0.004, 14).rotateX(Math.PI / 2), mats.brass, g, x, y + h / 2 - 0.035, -0.497);
    });
    mesh('pedestal_panel_' + n, field(0.44, 0.5), mats.walnut, g, x, 0.39, 0.466);
  });
  mesh('modesty_panel', B(1.05, 0.6, 0.04), mats.oak, g, 0, 0.42, 0.44);
  [-1, 1].forEach(s => mesh('modesty_field_' + (s < 0 ? 'left' : 'right'), field(0.44, 0.44), mats.walnut, g, s * 0.25, 0.42, 0.46));
  return { desk: g, materials: mats };
}

// Distressed tobacco leather: tileable value-noise mottling + fine grain, generated once.
let _leatherTex;
function leatherTexture(THREE) {
  if (_leatherTex !== undefined) return _leatherTex;
  const S = 512, d = new Uint8Array(S * S * 4);
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const octs = [[4, 0.42], [8, 0.26], [16, 0.16], [48, 0.1], [128, 0.06]].map(([n, w]) => { const g = new Float32Array(n * n); for (let i = 0; i < g.length; i++) g[i] = rnd(); return { n, w, g }; });
  const sm = t => t * t * (3 - 2 * t);
  const dark = [44, 25, 14], mid = [92, 56, 32], light = [146, 98, 58];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = 0;
    for (const o of octs) {
      const fx = x / S * o.n, fy = y / S * o.n, ix = Math.floor(fx), iy = Math.floor(fy), tx = sm(fx - ix), ty = sm(fy - iy), n = o.n;
      const g = (i, j) => o.g[((j % n + n) % n) * n + ((i % n + n) % n)];
      v += o.w * ((g(ix, iy) * (1 - tx) + g(ix + 1, iy) * tx) * (1 - ty) + (g(ix, iy + 1) * (1 - tx) + g(ix + 1, iy + 1) * tx) * ty);
    }
    const t = Math.min(1, Math.max(0, (v - 0.3) * 2.2)), grain = (rnd() - 0.5) * 14, k = (y * S + x) * 4;
    for (let ch = 0; ch < 3; ch++) d[k + ch] = Math.max(0, Math.min(255, (t < 0.5 ? dark[ch] + (mid[ch] - dark[ch]) * t * 2 : mid[ch] + (light[ch] - mid[ch]) * Math.pow((t - 0.5) * 2, 1.8)) + grain));
    d[k + 3] = 255;
  }
  // DataTexture, not a 2D canvas: Safari 26 adds per-pixel colour noise to grainy canvases uploaded to WebGL.
  const tex = new THREE.DataTexture(d, S, S); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(2, 2); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.needsUpdate = true;
  return (_leatherTex = tex);
}

// Deep diamond tufting: a dense plane pushed out between buttons, pinched to zero along the button-to-button creases.
// Faces +Z, edges flatten to z 0. Returns the geometry and button positions [x, y, z].
function tufted(THREE, w, h, nx, ny, depth) {
  const geo = new THREE.PlaneGeometry(w, h, Math.round(nx * 24), Math.round(ny * 24)), p = geo.attributes.position, btns = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), u = (x + w / 2) / w * nx, v = (y + h / 2) / h * ny, A = u + v, Bq = u - v;
    const puff = Math.pow(Math.sin(Math.PI * (A - Math.floor(A))) * Math.sin(Math.PI * (Bq - Math.floor(Bq))), 0.45);
    const e = Math.min(1, Math.min(x + w / 2, w / 2 - x, y + h / 2, h / 2 - y) / 0.035), es = e * e * (3 - 2 * e);
    p.setZ(i, depth * (0.25 + 0.75 * puff) * es);
  }
  for (let j = 1; j < 2 * ny; j++) for (let i = 1; i < 2 * nx; i++) if ((i + j) % 2 === 0) btns.push([i / (2 * nx) * w - w / 2, j / (2 * ny) * h - h / 2, depth * 0.25]);
  geo.computeVertexNormals();
  return { geo, btns };
}

// Wingback executive chair: distressed brown leather, deep diamond-tufted back, flared wings, outward scroll arms,
// plain seat cushion, brass nailhead outlines, carved walnut five-star base on brass casters.
// Origin floor centre, seat faces +Z; seat top y ≈ 0.565, crest ≈ 1.34. Pass materials to override any of leather/wood/brass/black.
export function buildOfficeChair(THREE, opts = {}) {
  const given = opts.materials || {}, tex = leatherTexture(THREE);
  const mats = {
    leather: given.leather || new THREE.MeshStandardMaterial(Object.assign({ name: 'distressed_leather', roughness: 0.5 }, tex ? { map: tex } : { color: '#4a2c1a' })),
    wood: given.wood || new THREE.MeshStandardMaterial({ name: 'walnut', color: '#6a3a20', roughness: 0.42 }),
    brass: given.brass || new THREE.MeshStandardMaterial({ name: 'brass', color: '#c49c58', roughness: 0.3, metalness: 0.9 }),
    black: given.black || new THREE.MeshStandardMaterial({ name: 'black', color: '#0a0807', roughness: 0.6 })
  };
  const mesh = mk(THREE), B = (w, h, d) => new THREE.BoxGeometry(w, h, d), g = new THREE.Group(); g.name = 'leather_office_chair';
  const rbox = (w, h, d, r) => { const s = new THREE.Shape(), x = -(w / 2 - r), y = -(h / 2 - r); s.moveTo(x, y); s.lineTo(-x, y); s.lineTo(-x, -y); s.lineTo(x, -y); s.closePath(); const geo = new THREE.ExtrudeGeometry(s, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 4, curveSegments: 1 }); geo.translate(0, 0, -(d - 2 * r) / 2); return geo; };
  const lathe = (pts, seg = 24) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  const btn = new THREE.SphereGeometry(0.011, 10, 8), nail = new THREE.SphereGeometry(0.0062, 8, 6);
  const V2 = (x, y) => new THREE.Vector2(x, y), along = (c, step) => c.getSpacedPoints(Math.max(2, Math.round(c.getLength() / step)));
  let nn = 0; const nailAt = (parent, x, y, z) => mesh('nailhead_' + (++nn), nail, mats.brass, parent, x, y, z);

  // carved walnut five-star base on brass casters
  mesh('base_hub', lathe([[0, 0.07], [0.035, 0.07], [0.05, 0.085], [0.07, 0.11], [0.07, 0.15], [0.05, 0.17], [0.045, 0.19], [0.055, 0.2], [0, 0.2]]), mats.wood, g);
  mesh('hub_finial', lathe([[0, 0.025], [0.014, 0.03], [0.026, 0.05], [0.03, 0.07], [0, 0.07]], 16), mats.wood, g);
  const ls = new THREE.Shape(); ls.moveTo(0.03, 0.09); ls.lineTo(0.03, 0.17); ls.quadraticCurveTo(0.2, 0.17, 0.3, 0.12); ls.quadraticCurveTo(0.36, 0.09, 0.37, 0.06); ls.lineTo(0.34, 0.055); ls.quadraticCurveTo(0.22, 0.1, 0.03, 0.09);
  const legGeo = new THREE.ExtrudeGeometry(ls, { depth: 0.036, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 12 }); legGeo.translate(0, 0, -0.018);
  for (let i = 0; i < 5; i++) {
    const a = Math.PI / 5 + i * Math.PI * 2 / 5, sx = Math.sin(a), sz = Math.cos(a);
    mesh(`base_leg_${i + 1}`, legGeo, mats.wood, g).rotation.y = a - Math.PI / 2;
    mesh(`caster_fork_${i + 1}`, B(0.03, 0.03, 0.04), mats.brass, g, sx * 0.355, 0.05, sz * 0.355).rotation.y = a;
    mesh(`caster_${i + 1}`, new THREE.CylinderGeometry(0.026, 0.026, 0.022, 16).rotateZ(Math.PI / 2), mats.brass, g, sx * 0.355, 0.026, sz * 0.355).rotation.y = a;
  }
  mesh('column', new THREE.CylinderGeometry(0.025, 0.03, 0.04, 16), mats.brass, g, 0, 0.22, 0);
  mesh('tilt_plate', B(0.28, 0.03, 0.28), mats.black, g, 0, 0.245, 0);

  // upholstered body, cushion, bottom nailhead line
  mesh('seat_body', rbox(0.596, 0.19, 0.64, 0.03), mats.leather, g, 0, 0.365, 0.005); // sits between the arms so no faces coincide
  mesh('seat_cushion', rbox(0.56, 0.11, 0.56, 0.045), mats.leather, g, 0, 0.51, 0.06);
  for (let x = -0.4; x <= 0.401; x += 0.022) nailAt(g, x, 0.275, Math.abs(x) < 0.29 ? 0.329 : 0.359);
  [-1, 1].forEach(s => { for (let z = -0.27; z <= 0.311; z += 0.022) nailAt(g, s * 0.424, 0.275, z); });

  // scroll arms with nailhead-outlined fronts and tufted inner faces
  [-1, 1].forEach(s => {
    const n = s < 0 ? 'left' : 'right';
    mesh('arm_' + n, rbox(0.12, 0.37, 0.62, 0.03), mats.leather, g, s * 0.36, 0.445, 0.02);
    mesh('arm_roll_' + n, new THREE.CylinderGeometry(0.075, 0.075, 0.6, 28).rotateX(Math.PI / 2), mats.leather, g, s * 0.37, 0.63, 0.02);
    mesh('arm_scroll_' + n, new THREE.CylinderGeometry(0.078, 0.078, 0.03, 28).rotateX(Math.PI / 2), mats.leather, g, s * 0.37, 0.63, 0.34);
    mesh('arm_front_' + n, rbox(0.128, 0.3, 0.03, 0.012), mats.leather, g, s * 0.36, 0.41, 0.345);
    for (let k = 0; k <= 14; k++) { const t = (-60 + k * 300 / 14) * Math.PI / 180; nailAt(g, s * 0.37 + Math.cos(t) * 0.06, 0.63 + Math.sin(t) * 0.06, 0.358); }
    [-1, 1].forEach(e => { for (let y = 0.29; y <= 0.571; y += 0.024) nailAt(g, s * 0.36 + e * 0.045, y, 0.362); });
    const T = tufted(THREE, 0.5, 0.2, 3, 1, 0.022), p = mesh('arm_tufting_' + n, T.geo, mats.leather, g, s * 0.293, 0.52, 0.03); p.rotation.y = -s * Math.PI / 2;
    T.btns.forEach(([x, y, z], k) => mesh(`tuft_arm_${n}_${k + 1}`, btn, mats.leather, p, x, y, z + 0.003).scale.z = 0.5);
  });

  // reclined back: shell with arched crest, deep-tufted face, flared wings
  const back = new THREE.Group(); back.name = 'back'; back.position.set(0, 0.46, -0.27); back.rotation.x = -0.08; g.add(back);
  const crestR = new THREE.QuadraticBezierCurve(V2(0.42, 0.8), V2(0.2, 0.9), V2(0, 0.86)), crestL = new THREE.QuadraticBezierCurve(V2(0, 0.86), V2(-0.2, 0.9), V2(-0.42, 0.8));
  const sh = new THREE.Shape(); sh.moveTo(-0.36, 0); sh.lineTo(0.36, 0); sh.lineTo(0.4, 0.62); sh.quadraticCurveTo(0.43, 0.74, 0.42, 0.8); sh.quadraticCurveTo(0.2, 0.9, 0, 0.86); sh.quadraticCurveTo(-0.2, 0.9, -0.42, 0.8); sh.quadraticCurveTo(-0.43, 0.74, -0.4, 0.62); sh.closePath();
  const shellGeo = new THREE.ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.025, bevelSegments: 4, curveSegments: 16 }); shellGeo.translate(0, 0, -0.11);
  mesh('back_shell', shellGeo, mats.leather, back);
  const BT = tufted(THREE, 0.68, 0.68, 4, 3, 0.04), face = mesh('back_tufting', BT.geo, mats.leather, back, 0, 0.4, 0.006);
  BT.btns.forEach(([x, y, z], k) => mesh(`tuft_back_${k + 1}`, btn, mats.leather, face, x, y, z + 0.004).scale.z = 0.5);
  [crestR, crestL].forEach(c => along(c, 0.024).forEach(q => nailAt(back, q.x, q.y - 0.012, 0.005)));
  const ws = new THREE.Shape(); ws.moveTo(-0.1, 0.2); ws.lineTo(0.2, 0.22); ws.quadraticCurveTo(0.31, 0.42, 0.29, 0.66); ws.quadraticCurveTo(0.24, 0.86, 0, 0.84); ws.lineTo(-0.1, 0.82); ws.closePath();
  const wingGeo = new THREE.ExtrudeGeometry(ws, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 3, curveSegments: 16 }); wingGeo.translate(0, 0, -0.035); wingGeo.rotateY(-Math.PI / 2);
  const wingEdge = [new THREE.QuadraticBezierCurve(V2(0.2, 0.22), V2(0.31, 0.42), V2(0.29, 0.66)), new THREE.QuadraticBezierCurve(V2(0.29, 0.66), V2(0.24, 0.86), V2(0, 0.84))];
  [-1, 1].forEach(s => {
    const n = s < 0 ? 'left' : 'right', wg = new THREE.Group(); wg.name = 'wing_' + n; wg.position.set(s * 0.37, 0, 0); wg.rotation.y = s * 0.2; back.add(wg);
    mesh('wing_' + n, wingGeo, mats.leather, wg);
    [[0.42, 0.14], [0.56, 0.2], [0.56, 0.06], [0.7, 0.13], [0.7, -0.01]].forEach(([y, z], k) => mesh(`tuft_wing_${n}_${k + 1}`, btn, mats.leather, wg, -s * 0.052, y, z).scale.x = 0.5);
    wingEdge.forEach(c => along(c, 0.024).forEach(q => nailAt(wg, s * 0.052, q.y, q.x)));
  });
  return { chair: g, materials: mats };
}

export function buildBoardFrame(THREE, opts = {}) {
  const mats = opts.materials || {
    walnut: new THREE.MeshStandardMaterial({ name: 'walnut', color: '#5b3520', roughness: 0.5 }),
    trim: new THREE.MeshStandardMaterial({ name: 'walnut_dark', color: '#3a2114', roughness: 0.55 }),
    brass: new THREE.MeshStandardMaterial({ name: 'brass', color: '#d6ad5c', roughness: 0.3, metalness: 0.4 })
  };
  const mesh = mk(THREE), B = (w, h, d) => new THREE.BoxGeometry(w, h, d), g = new THREE.Group(); g.name = 'investigation_board_frame';
  mesh('board_back', B(6.56, 2.68, 0.08), mats.walnut, g, 0, 1.94, -0.02);
  const ring = rect(THREE, 6.6, 2.72, 0.02); ring.holes.push(rect(THREE, 6.36, 2.48));
  mesh('board_frame', new THREE.ExtrudeGeometry(ring, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.014, bevelSize: 0.014, bevelSegments: 3, curveSegments: 2 }), mats.walnut, g, 0, 1.94, 0.02);
  [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sy], i) => {
    const cx = sx * 3.27, cy = 1.94 + sy * 1.33;
    mesh('corner_h_' + i, B(0.22, 0.05, 0.006), mats.brass, g, cx - sx * 0.09, cy, 0.089);
    mesh('corner_v_' + i, B(0.05, 0.22, 0.006), mats.brass, g, cx, cy - sy * 0.09, 0.089);
    mesh('corner_screw_' + i, new THREE.CylinderGeometry(0.008, 0.008, 0.006, 12).rotateX(Math.PI / 2), mats.trim, g, cx - sx * 0.015, cy - sy * 0.015, 0.093);
  });
  mesh('base_plinth', B(6.72, 0.08, 0.36), mats.trim, g, 0, 0.04, 0);
  mesh('base', B(6.6, 0.48, 0.3), mats.walnut, g, 0, 0.32, 0);
  mesh('base_cap', B(6.66, 0.04, 0.33), mats.trim, g, 0, 0.58, 0);
  mesh('base_rail', B(6.4, 0.02, 0.012), mats.brass, g, 0, 0.2, 0.156);
  return { frame: g, materials: mats };
}
