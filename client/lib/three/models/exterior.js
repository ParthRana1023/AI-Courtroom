// Act I exterior: fluted wooden pillar and brass carriage lantern. Pure builders: pass THREE in.
// Pillar: origin at base centre, front face at z = +0.13. Lantern: origin at body centre, bracket reaches back to z = -0.15.
const mk = THREE => (name, geo, mat, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.castShadow = true; m.receiveShadow = true; m.position.set(x, y, z); parent.add(m); return m; };
const lathe = (THREE, pts, seg) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

export function buildPillar(THREE, opts = {}) {
  const mats = opts.materials || {
    wood: new THREE.MeshStandardMaterial({ name: 'walnut', color: '#5b3520', roughness: 0.5 }),
    trim: new THREE.MeshStandardMaterial({ name: 'walnut_dark', color: '#3a2114', roughness: 0.55 }),
    brass: new THREE.MeshStandardMaterial({ name: 'brass', color: '#b8913f', roughness: 0.35, metalness: 0.4 })
  };
  const mesh = mk(THREE), B = (w, h, d) => new THREE.BoxGeometry(w, h, d), g = new THREE.Group(); g.name = 'wooden_pillar';
  const h = opts.height || 4.45, shaftH = h - 0.4 - 0.47;
  mesh('pillar_plinth', B(0.56, 0.34, 0.36), mats.trim, g, 0, 0.17, 0.02);
  mesh('pillar_base_moulding', B(0.5, 0.06, 0.32), mats.wood, g, 0, 0.37, 0.01);
  mesh('pillar_shaft', B(0.42, shaftH, 0.26), mats.wood, g, 0, 0.4 + shaftH / 2, 0);
  for (let i = 0; i < 4; i++) { const f = mesh('pillar_flute_' + (i + 1), new THREE.CapsuleGeometry(0.017, shaftH - 0.32, 3, 8), mats.trim, g, -0.12 + i * 0.08, 0.4 + shaftH / 2, 0.128); f.scale.z = 0.35; }
  const y0 = 0.4 + shaftH;
  mesh('capital_necking', B(0.46, 0.05, 0.29), mats.trim, g, 0, y0 + 0.025, 0.01);
  mesh('capital_bell', B(0.44, 0.22, 0.27), mats.wood, g, 0, y0 + 0.16, 0.005);
  mesh('capital_abacus', B(0.56, 0.08, 0.36), mats.trim, g, 0, y0 + 0.31, 0.03);
  mesh('capital_top', B(0.6, 0.12, 0.38), mats.wood, g, 0, y0 + 0.41, 0.04);
  mesh('capital_rosette', lathe(THREE, [[0, 0], [0.045, 0], [0.05, 0.008], [0.035, 0.018], [0.015, 0.024], [0, 0.026]], 20).rotateX(Math.PI / 2), mats.brass, g, 0, y0 + 0.16, 0.14);
  return { pillar: g, materials: mats };
}

export function buildLantern(THREE, opts = {}) {
  const mats = opts.materials || {
    brass: new THREE.MeshStandardMaterial({ name: 'brass_dark', color: '#8f6a28', roughness: 0.4, metalness: 0.5 }),
    glass: new THREE.MeshStandardMaterial({ name: 'lantern_glass', color: '#ffd9a0', emissive: '#ffb469', emissiveIntensity: 1.6, roughness: 0.2 })
  };
  const mesh = mk(THREE), B = (w, h, d) => new THREE.BoxGeometry(w, h, d), g = new THREE.Group(); g.name = 'brass_wall_lantern';
  const tube = (name, pts, r) => mesh(name, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), 20, r, 8, false), mats.brass, g);
  const sq = pts => lathe(THREE, pts.map(([r, y]) => [r * Math.SQRT2, y]), 4).rotateY(Math.PI / 4);
  // wall bracket
  mesh('bracket_plate', B(0.09, 0.22, 0.012), mats.brass, g, 0, 0.26, -0.146);
  tube('bracket_arm', [[0, 0.36, -0.145], [0, 0.37, -0.07], [0, 0.365, 0]], 0.009);
  tube('bracket_scroll', [[0, 0.17, -0.145], [0, 0.22, -0.11], [0, 0.3, -0.07], [0, 0.35, -0.04]], 0.006);
  mesh('bracket_curl', new THREE.TorusGeometry(0.022, 0.005, 6, 20).rotateY(Math.PI / 2), mats.brass, g, 0, 0.2, -0.11);
  tube('lantern_hook', [[0, 0.365, 0], [0, 0.345, 0.004], [0, 0.325, 0]], 0.004);
  // body: tapered glass with corner posts
  mesh('lantern_glass', new THREE.CylinderGeometry(0.085 * Math.SQRT2, 0.065 * Math.SQRT2, 0.34, 4, 1, true).rotateY(Math.PI / 4), mats.glass, g).castShadow = false;
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz], i) => mesh('lantern_post_' + (i + 1), new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(sx * 0.065, -0.17, sz * 0.065), new THREE.Vector3(sx * 0.085, 0.17, sz * 0.085)), 1, 0.006, 6), mats.brass, g));
  mesh('lantern_band', new THREE.TorusGeometry(0.1 * Math.SQRT2, 0.005, 4, 4).rotateX(Math.PI / 2).rotateY(Math.PI / 4), mats.brass, g, 0, 0.17, 0);
  mesh('lantern_base', sq([[0, -0.23], [0.02, -0.23], [0.03, -0.215], [0.05, -0.2], [0.09, -0.185], [0.075, -0.17], [0, -0.17]]), mats.brass, g);
  mesh('lantern_drop', new THREE.SphereGeometry(0.018, 14, 10), mats.brass, g, 0, -0.245, 0);
  mesh('lantern_roof', sq([[0.1, 0.17], [0.115, 0.18], [0.095, 0.2], [0.045, 0.255], [0.03, 0.265], [0, 0.265]]), mats.brass, g);
  mesh('lantern_chimney', new THREE.CylinderGeometry(0.02, 0.026, 0.04, 16), mats.brass, g, 0, 0.285, 0);
  mesh('lantern_finial', new THREE.SphereGeometry(0.017, 14, 10), mats.brass, g, 0, 0.315, 0);
  return { lantern: g, materials: mats };
}

// Three-tread stone entrance steps: each step is a nosed tread slab over a set-back riser, cut into staggered blocks with bevelled joints.
// Origin at street level, centred on the door, back edge against the facade (z = 0); steps run toward +z. 2.5 × 0.45 × 1.2 m, sized to sit between the entrance pillars.
// Natural weathered limestone: soft tonal clouds, fossil speckle, faint veins. Seeded, so every load looks the same. UVs are in metres.
function stoneTexture(THREE) {
  let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const w = 1024, c = document.createElement('canvas'); c.width = c.height = w; const g = c.getContext('2d');
  g.fillStyle = '#a39a8e'; g.fillRect(0, 0, w, w);
  const blot = (n, rMin, rMax, a, cols) => { for (let i = 0; i < n; i++) { const x = r() * w, y = r() * w, rad = rMin + r() * (rMax - rMin), col = cols[(r() * cols.length) | 0]; for (const dx of [-w, 0, w]) for (const dy of [-w, 0, w]) { const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad); gr.addColorStop(0, `rgba(${col},${a * (0.4 + r() * 0.6)})`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2); } } };
  blot(40, 120, 320, 0.22, ['74,68,60', '178,170,156', '120,108,92', '150,140,118']);
  blot(160, 20, 80, 0.2, ['66,60,52', '190,182,168', '112,98,80']);
  g.lineCap = 'round';
  for (let v = 0; v < 7; v++) { let x = r() * w, y = r() * w, a = r() * Math.PI; g.strokeStyle = `rgba(${r() < 0.5 ? '70,62,54' : '200,192,178'},${0.12 + r() * 0.12})`; g.lineWidth = 0.6 + r() * 1.4; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 40; k++) { a += (r() - 0.5) * 0.5; x += Math.cos(a) * 14; y += Math.sin(a) * 14; g.lineTo(x, y); } g.stroke(); }
  for (let i = 0; i < 9000; i++) { const d = r() < 0.6; g.fillStyle = d ? `rgba(58,52,46,${0.15 + r() * 0.35})` : `rgba(215,208,194,${0.15 + r() * 0.3})`; const z = r() < 0.92 ? 0.8 + r() * 1.2 : 2 + r() * 3; g.beginPath(); g.arc(r() * w, r() * w, z, 0, Math.PI * 2); g.fill(); }
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(48,42,36,${0.25 + r() * 0.3})`; g.beginPath(); g.ellipse(r() * w, r() * w, 1.5 + r() * 4, 1 + r() * 2.5, r() * Math.PI, 0, Math.PI * 2); g.fill(); }
  // no canvas readback (Safari adds coloured noise to getImageData)
  { const nc = document.createElement('canvas'); nc.width = w; nc.height = w; const nx = nc.getContext('2d'), id = nx.createImageData(w, w), q = id.data; for (let i = 0; i < q.length; i += 4) { const n = (r() - 0.5) * 18; const v = n > 0 ? 255 : 0; q[i] = q[i + 1] = q[i + 2] = v; q[i + 3] = Math.min(255, Math.abs(n) * 2.2); } nx.putImageData(id, 0, 0); const op = g.globalCompositeOperation, ga = g.globalAlpha; g.globalCompositeOperation = 'source-atop'; g.globalAlpha = 1; g.drawImage(nc, 0, 0); g.globalCompositeOperation = op; g.globalAlpha = ga; }
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
  const bump = new THREE.CanvasTexture(c);
  [map, bump].forEach(t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(0.9, 0.9); t.anisotropy = 8; });
  return { map, bump };
}

let _stone = null; const sharedStone = THREE => _stone || (_stone = stoneTexture(THREE));
// Box-projected UVs in metres, so stone scale stays constant across every piece.
const boxUV = (THREE, geo, k = 1) => { const p = geo.attributes.position, n = geo.attributes.normal, uv = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i++) { const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i)), x = p.getX(i), y = p.getY(i), z = p.getZ(i); const [u, v] = az >= ax && az >= ay ? [x, y] : ax >= ay ? [z, y] : [x, z]; uv[i * 2] = u * k; uv[i * 2 + 1] = v * k; } geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return geo; };
const bevelBox = (THREE, w, h, d, b, seg = 1) => { if (b <= 0) return new THREE.BoxGeometry(w, h, d); const s = new THREE.Shape(), x = w / 2 - b, y = h / 2 - b; s.moveTo(-x, -y); s.lineTo(x, -y); s.lineTo(x, y); s.lineTo(-x, y); s.closePath(); const geo = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, d - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: seg }); geo.translate(0, 0, -Math.max(0.001, d - 2 * b) / 2); return geo; };

// Law firm facade: two-storey ashlar front. Rusticated ground floor with chamfered joints, plinth, string course,
// finer ashlar upper storey, long-and-short quoins, frieze, dentil cornice, parapet with coping.
// Origin at street level, centred on the door, wall face on z = 0 (core runs back to z = -0.7). Window and door zones are left flat for their own models.
export function buildFacade(THREE, opts = {}) {
  const tx = sharedStone(THREE), m = opts.materials || {
    stone: new THREE.MeshStandardMaterial({ name: 'facade_ashlar', map: tx.map, bumpMap: tx.bump, bumpScale: 1.2, color: '#6e665d', roughness: 0.92 }),
    dressed: new THREE.MeshStandardMaterial({ name: 'dressed_stone', map: tx.map, bumpMap: tx.bump, bumpScale: 0.8, color: '#7a7268', roughness: 0.88 }),
    mortar: new THREE.MeshStandardMaterial({ name: 'mortar', color: '#2a251f', roughness: 1 })
  };
  const g = new THREE.Group(); g.name = 'law_firm_facade';
  const W = opts.w || 14.4, hw = W / 2, D = 0.7, hd = (opts.doorW || 1.8) / 2, doorH = opts.doorH || 3.85, GF = 4.3, TOP = 7.8, CORE = 8.75;
  const wins = opts.windows || [[-4.2, 2.75], [4.2, 2.75], [-4.2, 6.65], [4.2, 6.65]];
  let n = 0; const put = (name, geo, mat, x, y, z) => { geo.translate(x, y, z); boxUV(THREE, geo); const me = new THREE.Mesh(geo, mat); me.name = name; me.castShadow = me.receiveShadow = true; g.add(me); return me; };
  const core = new THREE.Shape(); core.moveTo(-hw, 0); core.lineTo(-hd, 0); core.lineTo(-hd, doorH); core.lineTo(hd, doorH); core.lineTo(hd, 0); core.lineTo(hw, 0); core.lineTo(hw, CORE); core.lineTo(-hw, CORE); core.closePath();
  put('wall_core', new THREE.ExtrudeGeometry(core, { depth: D, bevelEnabled: false }), m.mortar, 0, 0, -D);
  [-1, 1].forEach(s => put('door_reveal_' + (s < 0 ? 'l' : 'r'), new THREE.BoxGeometry(0.02, doorH, D), m.dressed, s * (hd - 0.01), doorH / 2, -D / 2));
  put('door_soffit', new THREE.BoxGeometry(hd * 2, 0.02, D), m.dressed, 0, doorH - 0.01, -D / 2);
  [-1, 1].forEach(s => { const a = hd, b = hw + 0.06, L = b - a, cx = s * (a + L / 2), k = s < 0 ? 'l' : 'r';
    put('plinth_' + k, bevelBox(THREE, L, 0.5, D + 0.12, 0.02), m.dressed, cx, 0.25, (0.12 - D) / 2);
    put('plinth_cap_' + k, bevelBox(THREE, L, 0.08, D + 0.09, 0.03), m.dressed, cx, 0.54, (0.09 - D) / 2); });
  const fill = (a, b, len, first) => { const out = []; let x = a, l = first; while (b - x > 1e-3) { let e = Math.min(b, x + l); if (b - e < 0.2) e = b; out.push([x, e]); x = e; l = len; } return out; };
  const course = (y0, y1, i, len, depth, bev, gap, quoin) => {
    let iv = [[-hw, hw]];
    if (quoin) { const q = i % 2 ? 0.5 : 0.9; [-1, 1].forEach(s => put(`quoin_${s < 0 ? 'l' : 'r'}_${i}`, bevelBox(THREE, q + 0.05 - gap, y1 - y0 - gap, D + 0.09, bev), m.dressed, s * (hw + 0.05 - (q + 0.05) / 2), (y0 + y1) / 2, (0.08 - D) / 2 + 0.005)); iv = [[-hw + q, hw - q]]; }
    const cut = (a, b) => { iv = iv.flatMap(([p, q]) => (b <= p || a >= q ? [[p, q]] : [[p, a], [b, q]].filter(([u, v]) => v - u > 0.05))); };
    if (y0 < doorH + 0.3) cut(-hd - 0.2, hd + 0.2);
    wins.forEach(([cx, cy]) => { if (y1 > cy - 1.55 && y0 < cy + 1.7) cut(cx - 1.0, cx + 1.0); });
    iv.forEach(([a, b]) => fill(a, b, len, i % 2 ? len * 0.5 : len).forEach(([x0, x1]) => { n++; put('ashlar_' + n, bevelBox(THREE, x1 - x0 - gap, y1 - y0 - gap, depth, bev), m.stone, (x0 + x1) / 2, (y0 + y1) / 2, depth / 2); }));
  };
  const gH = (GF - 0.58) / 8; for (let i = 0; i < 8; i++) course(0.58 + i * gH, 0.58 + (i + 1) * gH, i, 1.1, 0.06, 0.02, 0.02, true);
  put('string_course', bevelBox(THREE, W + 0.08, 0.3, D + 0.14, 0.03), m.dressed, 0, GF + 0.15, (0.14 - D) / 2);
  const uH = (TOP - GF - 0.3) / 8; for (let i = 0; i < 8; i++) course(GF + 0.3 + i * uH, GF + 0.3 + (i + 1) * uH, i + 1, 0.9, 0.03, 0.006, 0.008, true);
  put('frieze', bevelBox(THREE, W + 0.1, 0.35, D + 0.06, 0.005), m.dressed, 0, TOP + 0.175, (0.06 - D) / 2);
  const dn = Math.floor((W + 0.1) / 0.2); for (let i = 0; i < dn; i++) put('dentil_' + (i + 1), new THREE.BoxGeometry(0.1, 0.14, 0.14), m.dressed, -((dn - 1) * 0.2) / 2 + i * 0.2, TOP + 0.42, 0.11);
  put('bed_mould', new THREE.BoxGeometry(W + 0.3, 0.05, D + 0.22), m.dressed, 0, TOP + 0.515, (0.22 - D) / 2);
  put('corona', bevelBox(THREE, W + 0.5, 0.3, D + 0.36, 0.012), m.dressed, 0, TOP + 0.69, (0.36 - D) / 2);
  put('cyma_cap', bevelBox(THREE, W + 0.4, 0.14, D + 0.26, 0.05, 2), m.dressed, 0, TOP + 0.91, (0.26 - D) / 2);
  put('parapet', new THREE.BoxGeometry(W, 0.55, 0.45), m.stone, 0, CORE + 0.275, -0.35);
  put('parapet_coping', bevelBox(THREE, W + 0.1, 0.1, 0.56, 0.02), m.dressed, 0, CORE + 0.6, -0.35);
  return { facade: g, materials: m };
}

export function buildSteps(THREE, opts = {}) {
  const tx = sharedStone(THREE), mats = opts.materials || {
    stone: new THREE.MeshStandardMaterial({ name: 'stone', map: tx.map, bumpMap: tx.bump, bumpScale: 1.2, color: '#625b53', roughness: 0.92 }),
    stoneAlt: new THREE.MeshStandardMaterial({ name: 'stone_weathered', map: tx.map, bumpMap: tx.bump, bumpScale: 1.2, color: '#58514a', roughness: 0.95 }),
    mortar: new THREE.MeshStandardMaterial({ name: 'mortar', color: '#2e2922', roughness: 1 })
  };
  const mesh = mk(THREE), g = new THREE.Group(); g.name = 'entrance_steps';
  const rise = opts.rise || 0.15, run = opts.run || 0.4, nose = 0.025, treadT = 0.06, gap = 0.006;
  const block = (w, h, d, b) => { const s = new THREE.Shape(); const x = w / 2 - b, y = h / 2 - b; s.moveTo(-x, -y); s.lineTo(x, -y); s.lineTo(x, y); s.lineTo(-x, y); s.closePath(); const geo = new THREE.ExtrudeGeometry(s, { depth: d - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 3 }); geo.translate(0, 0, -(d - 2 * b) / 2); return geo; };
  const courses = opts.courses || [[0.85, 0.8, 0.85], [1.25, 1.25], [0.8, 0.9, 0.8]];
  courses.forEach((lens, i) => {
    const W = lens.reduce((a, b) => a + b, 0), y0 = i * rise, front = (courses.length - i) * run, n = i + 1;
    const core = mesh(`step_${n}_mortar_bed`, new THREE.BoxGeometry(W - 0.03, rise - 0.012, front - nose - 0.03), mats.mortar, g, 0, y0 + rise / 2, (front - nose) / 2); core.castShadow = false;
    let x = -W / 2;
    lens.forEach((L, j) => {
      const cx = x + L / 2, m = (i + j) % 2 ? mats.stoneAlt : mats.stone; x += L;
      mesh(`step_${n}_riser_${j + 1}`, block(L - gap, rise - treadT - gap, front - nose, 0.008), m, g, cx, y0 + (rise - treadT) / 2, (front - nose) / 2);
      mesh(`step_${n}_tread_${j + 1}`, block(L - gap, treadT, front, 0.016), m, g, cx, y0 + rise - treadT / 2, front / 2);
    });
  });
  return { steps: g, materials: mats };
}

// Street pavement in front of the firm: staggered York-stone flags on a mortar bed, granite kerb, two-row sett gutter
// with a cast-iron drain grate, and a round coal-hole cover set into the flags. Each flag is cut to its own size and sits
// a few millimetres proud or sunk with a slight tilt, so the surface reads as laid by hand. Seeded, so every load matches.
// Origin at pavement-top level, centred on the door, back edge against the facade (z = 0); runs toward +z.
// The road surface is expected at y = -kerbH (0.13 m) beyond z = depth + kerbW + gutterW.
export function buildPavement(THREE, opts = {}) {
  const tx = sharedStone(THREE), sm = (name, color, rough, extra = {}) => new THREE.MeshStandardMaterial({ name, map: tx.map, bumpMap: tx.bump, bumpScale: 1.1, color, roughness: rough, ...extra });
  const mats = opts.materials || {
    flag: sm('flagstone', '#6a635a', 0.88), flagDk: sm('flagstone_dark', '#5a544c', 0.9), flagLt: sm('flagstone_light', '#777065', 0.86),
    kerb: sm('granite_kerb', '#5a5650', 0.78, { envMapIntensity: 0.5 }), sett: sm('granite_sett', '#4a4741', 0.72, { envMapIntensity: 0.55 }),
    mortar: new THREE.MeshStandardMaterial({ name: 'joint_mortar', color: '#2a2622', roughness: 1 }),
    iron: new THREE.MeshStandardMaterial({ name: 'cast_iron', color: '#1c1b1a', roughness: 0.55, metalness: 0.6 })
  };
  let s = 11; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const mesh = mk(THREE), g = new THREE.Group(); g.name = 'street_pavement';
  const W = opts.width || 24, D = opts.depth || 3.2, kerbH = 0.13, kerbW = 0.26, gutW = 0.36, gap = 0.008, ft = 0.05;
  const uvShift = geo => { const uv = geo.attributes.uv, du = r() * 7, dv = r() * 7; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + du, uv.getY(i) + dv); return geo; };
  const slab = (w, h, d, b) => uvShift(boxUV(THREE, bevelBox(THREE, w, h, d, b, 1), 0.9));
  const flat = m => { m.castShadow = false; return m; };
  // bedding: one mortar slab under all the flags, its edge closes the step down to the road
  flat(mesh('pavement_bed', new THREE.BoxGeometry(W, 0.16, D), mats.mortar, g, 0, -0.085, D / 2));
  // flags: courses parallel to the facade, alternating course depths, joints staggered course to course
  const coal = [2.9, 1.9], fmats = [mats.flag, mats.flagDk, mats.flagLt];
  let z = 0, row = 0;
  while (z < D - 0.05) {
    const cd = Math.min(row % 2 ? 0.6 : 0.75, D - z); let x = -W / 2 - (row % 2 ? 0.35 : 0) - r() * 0.2, k = 0;
    while (x < W / 2) {
      const L = 0.6 + Math.floor(r() * 4) * 0.15, x0 = Math.max(x, -W / 2), x1 = Math.min(x + L, W / 2), cx = (x0 + x1) / 2, cz = z + cd / 2;
      if (x1 - x0 > 0.05) {
        const m = mesh(`flag_${row + 1}_${++k}`, slab(x1 - x0 - gap, ft, cd - gap, 0.006), fmats[(r() * 3) | 0], g, cx, -ft / 2 + (r() - 0.5) * 0.006, cz);
        m.rotation.set((r() - 0.5) * 0.006, 0, (r() - 0.5) * 0.006); flat(m);
        if (cx - (x1 - x0) / 2 < coal[0] && cx + (x1 - x0) / 2 > coal[0] && z < coal[1] && z + cd > coal[1]) coal.push(cx, cz);
      }
      x += L;
    }
    z += cd; row++;
  }
  // coal-hole cover: cast-iron disc with a raised ring and radial ribs, centred on whichever flag it landed in
  if (coal.length > 2) {
    const [cx, cz] = coal.slice(2); const cv = new THREE.Group(); cv.name = 'coal_hole_cover'; cv.position.set(cx, 0, cz); g.add(cv);
    flat(mesh('coal_hole_seat', new THREE.CylinderGeometry(0.235, 0.235, 0.012, 40), mats.mortar, cv, 0, 0.001, 0));
    flat(mesh('coal_hole_plate', new THREE.CylinderGeometry(0.22, 0.22, 0.014, 40), mats.iron, cv, 0, 0.004, 0));
    flat(mesh('coal_hole_ring', new THREE.TorusGeometry(0.17, 0.008, 6, 40).rotateX(Math.PI / 2), mats.iron, cv, 0, 0.012, 0));
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, rib = flat(mesh('coal_hole_rib_' + (i + 1), new THREE.BoxGeometry(0.13, 0.008, 0.012), mats.iron, cv, Math.cos(a) * 0.085, 0.012, Math.sin(a) * 0.085)); rib.rotation.y = -a; }
    flat(mesh('coal_hole_boss', new THREE.CylinderGeometry(0.03, 0.035, 0.012, 20), mats.iron, cv, 0, 0.014, 0));
  }
  // granite kerb: long dressed stones with a rounded arris, face dropping to the gutter
  { let x = -W / 2, k = 0; while (x < W / 2) { const L = Math.min(0.9 + r() * 0.3, W / 2 - x); mesh(`kerb_${++k}`, slab(L - 0.006, kerbH + 0.12, kerbW, 0.02), mats.kerb, g, x + L / 2, -(kerbH + 0.12) / 2 + 0.002, D + kerbW / 2); x += L; } }
  // gutter: two rows of small setts at road level, one drain grate a few metres off the door line
  const gy = -kerbH, grateX = 3.6; flat(mesh('gutter_bed', new THREE.BoxGeometry(W, 0.06, gutW), mats.mortar, g, 0, gy - 0.035, D + kerbW + gutW / 2));
  [0, 1].forEach(rw => { let x = -W / 2 + (rw ? 0.1 : 0), k = 0; while (x < W / 2) { const L = 0.18 + r() * 0.06, cx = x + L / 2; if (Math.abs(cx - grateX) > 0.3 && x + L <= W / 2) flat(mesh(`sett_${rw + 1}_${++k}`, slab(L - 0.007, 0.06, gutW / 2 - 0.007, 0.012), mats.sett, g, cx, gy - 0.03 + (r() - 0.5) * 0.006, D + kerbW + gutW * (rw ? 0.75 : 0.25))); x += L; } });
  { const gr = new THREE.Group(); gr.name = 'drain_grate'; gr.position.set(grateX, gy, D + kerbW + gutW / 2); g.add(gr);
    flat(mesh('grate_pit', new THREE.BoxGeometry(0.5, 0.02, gutW - 0.02), mats.mortar, gr, 0, -0.04, 0));
    flat(mesh('grate_frame_front', new THREE.BoxGeometry(0.56, 0.02, 0.03), mats.iron, gr, 0, -0.008, -gutW / 2 + 0.03)); flat(mesh('grate_frame_back', new THREE.BoxGeometry(0.56, 0.02, 0.03), mats.iron, gr, 0, -0.008, gutW / 2 - 0.03));
    [-1, 1].forEach(sd => flat(mesh('grate_frame_' + (sd < 0 ? 'l' : 'r'), new THREE.BoxGeometry(0.03, 0.02, gutW - 0.04), mats.iron, gr, sd * 0.265, -0.008, 0)));
    for (let i = 0; i < 9; i++) flat(mesh('grate_bar_' + (i + 1), new THREE.BoxGeometry(0.022, 0.018, gutW - 0.09), mats.iron, gr, -0.22 + i * 0.055, -0.01, 0)); }
  return { pavement: g, materials: mats, kerbH, frontZ: D + kerbW + gutW };
}

// Sash window in a stone surround: 6-over-6 glazing bars, meeting rail, projecting sill on corbels, lintel with keystone.
// Origin at glass centre; back sits on the facade (z = 0). w/h are the glazed opening.
export function buildWindow(THREE, opts = {}) {
  const w = opts.w || 1.5, h = opts.h || 2.3;
  const mats = opts.materials || {
    stone: new THREE.MeshStandardMaterial({ name: 'stone', color: '#8c8272', roughness: 0.85 }),
    frame: new THREE.MeshStandardMaterial({ name: 'walnut_dark', color: '#3a2114', roughness: 0.55 }),
    glass: new THREE.MeshStandardMaterial({ name: 'window_glow', color: '#ffcf94', emissive: '#ff9c4a', emissiveIntensity: 0.6, roughness: 0.2 })
  };
  const mesh = mk(THREE), B = (a, b, c) => new THREE.BoxGeometry(a, b, c), g = new THREE.Group(); g.name = 'facade_window';
  const rect = (a, b) => { const s = new THREE.Shape(); s.moveTo(-a / 2, -b / 2); s.lineTo(a / 2, -b / 2); s.lineTo(a / 2, b / 2); s.lineTo(-a / 2, b / 2); s.closePath(); return s; };
  const ring = (ow, oh, iw, ih) => { const s = rect(ow, oh); const p = new THREE.Path(); p.moveTo(-iw / 2, -ih / 2); p.lineTo(iw / 2, -ih / 2); p.lineTo(iw / 2, ih / 2); p.lineTo(-iw / 2, ih / 2); p.closePath(); s.holes.push(p); return s; };
  // surround + reveal
  mesh('window_surround', new THREE.ExtrudeGeometry(ring(w + 0.36, h + 0.3, w + 0.04, h + 0.04), { depth: 0.1, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2 }), mats.stone, g, 0, 0, 0.015);
  mesh('window_glass', new THREE.PlaneGeometry(w, h), mats.glass, g, 0, 0, 0.02).castShadow = false;
  // sash frames: upper sash sits proud of the lower one
  const sh = (h - 0.04) / 2;
  [[1, 0.055], [-1, 0.035]].forEach(([s, z]) => {
    const n = s > 0 ? 'upper' : 'lower', cy = s * (sh / 2 + 0.01);
    mesh('sash_' + n, new THREE.ExtrudeGeometry(ring(w, sh + 0.02, w - 0.1, sh - 0.08), { depth: 0.04, bevelEnabled: false }), mats.frame, g, 0, cy, z - 0.02);
    [-1, 1].forEach(k => mesh(`bar_${n}_v${k < 0 ? 1 : 2}`, B(0.026, sh - 0.08, 0.03), mats.frame, g, k * (w - 0.1) / 6, cy, z + 0.005));
    mesh(`bar_${n}_h`, B(w - 0.1, 0.026, 0.03), mats.frame, g, 0, cy, z + 0.005);
  });
  mesh('meeting_rail', B(w - 0.02, 0.06, 0.05), mats.frame, g, 0, 0, 0.05);
  // sill on two corbels
  mesh('window_sill', B(w + 0.5, 0.1, 0.26), mats.stone, g, 0, -h / 2 - 0.2, 0.13);
  [-1, 1].forEach(s => mesh('sill_corbel_' + (s < 0 ? 'l' : 'r'), B(0.12, 0.14, 0.16), mats.stone, g, s * (w / 2 + 0.08), -h / 2 - 0.32, 0.08));
  // lintel + keystone
  mesh('window_lintel', B(w + 0.5, 0.16, 0.16), mats.stone, g, 0, h / 2 + 0.23, 0.08);
  const ks = new THREE.Shape(); ks.moveTo(-0.09, -0.16); ks.lineTo(0.09, -0.16); ks.lineTo(0.13, 0.16); ks.lineTo(-0.13, 0.16); ks.closePath();
  mesh('window_keystone', new THREE.ExtrudeGeometry(ks, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 1 }), mats.stone, g, 0, h / 2 + 0.2, 0.12);
  return { window: g, materials: mats };
}

// Carriageway: granite setts in courses parallel to the facade, half-bond, cambered to a crown, with the far kerb and a strip of the opposite pavement.
// Origin: near road edge (the gutter line) at road level; the road runs toward +z. One InstancedMesh for every sett (a single draw call).
export function buildRoad(THREE, opts = {}) {
  const tx = sharedStone(THREE);
  const mats = opts.materials || {
    sett: new THREE.MeshStandardMaterial({ name: 'granite_road_sett', map: tx.map, bumpMap: tx.bump, bumpScale: 1.1, color: '#4a4741', roughness: 0.72, envMapIntensity: 0.55 }),
    bed: new THREE.MeshStandardMaterial({ name: 'road_joint', color: '#2a2622', roughness: 1 }),
    kerb: new THREE.MeshStandardMaterial({ name: 'granite_kerb_far', map: tx.map, bumpMap: tx.bump, bumpScale: 1.1, color: '#5a5650', roughness: 0.78, envMapIntensity: 0.5 }),
    flag: new THREE.MeshStandardMaterial({ name: 'flagstone_far', map: tx.map, bumpMap: tx.bump, bumpScale: 1.1, color: '#625b52', roughness: 0.88 })
  };
  let s = 29; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const g = new THREE.Group(); g.name = 'street_road';
  const W = opts.width || 24, D = opts.depth || 6.4, crown = opts.crown || 0.06, sl = 0.22, sd = 0.168, sh = 0.09, gap = 0.007;
  const camber = z => crown * (1 - Math.pow((z - D / 2) / (D / 2), 2));
  const bed = new THREE.Mesh(new THREE.BoxGeometry(W, 0.04, D), mats.bed); bed.name = 'road_bed'; bed.position.set(0, -0.03, D / 2); bed.receiveShadow = true; g.add(bed);
  const rows = Math.floor(D / sd), per = Math.ceil(W / sl) + 1, n = rows * per;
  const geo = boxUV(THREE, bevelBox(THREE, sl - gap, sh, sd - gap, 0.012, 1), 0.9);
  const im = new THREE.InstancedMesh(geo, mats.sett, n); im.name = 'road_setts'; im.receiveShadow = true; im.castShadow = false;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1), col = new THREE.Color();
  let k = 0;
  for (let row = 0; row < rows; row++) {
    const z = (row + 0.5) * sd, off = row % 2 ? sl / 2 : 0;
    for (let c = 0; c < per; c++) {
      const x = -W / 2 + off + c * sl + (r() - 0.5) * 0.012;
      const y = camber(z) - sh / 2 + (r() - 0.5) * 0.008;
      e3.set((r() - 0.5) * 0.03, (r() - 0.5) * 0.05, (r() - 0.5) * 0.03); q.setFromEuler(e3); p.set(x, y, z + (r() - 0.5) * 0.008);
      m4.compose(p, q, sc); im.setMatrixAt(k, m4);
      const v = 0.86 + r() * 0.3, w = r() < 0.08 ? 0.88 : 1; col.setRGB(v * w, v * (0.97 + r() * 0.03) * w, v * (0.93 + r() * 0.05) * w); im.setColorAt(k, col); k++;
    }
  }
  im.count = k; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; g.add(im);
  // far kerb + opposite pavement
  const kerbH = 0.13, kerbW = 0.26; let x = -W / 2, kk = 0;
  while (x < W / 2) { const L = Math.min(0.9 + r() * 0.3, W / 2 - x); const kb = new THREE.Mesh(boxUV(THREE, bevelBox(THREE, L - 0.006, kerbH + 0.12, kerbW, 0.02, 1), 0.9), mats.kerb); kb.name = 'far_kerb_' + (++kk); kb.position.set(x + L / 2, kerbH - (kerbH + 0.12) / 2, D + kerbW / 2); kb.receiveShadow = true; g.add(kb); x += L; }
  const fp = new THREE.Mesh(boxUV(THREE, new THREE.BoxGeometry(W, 0.05, 4), 0.9), mats.flag); fp.name = 'far_pavement'; fp.position.set(0, kerbH - 0.025, D + kerbW + 2); fp.receiveShadow = true; g.add(fp);
  return { road: g, materials: mats, depth: D };
}
