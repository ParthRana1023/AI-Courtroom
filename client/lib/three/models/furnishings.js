// Furnishings. Act I: name plaque. Act II: pocket door, office rug, side + library tables, inkwell set.
// Hallway: wall sconce, portrait frame. Act IX: judge's bench + chair, gallery bench, counsel table, drapes.
// Pure builders: pass THREE in. Pieces face +Z with origin at floor centre unless noted.
const mk = THREE => (name, geo, mat, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.castShadow = true; m.receiveShadow = true; m.position.set(x, y, z); parent.add(m); return m; };
const rect = (THREE, w, h, r = 0) => { const s = new THREE.Shape(), x = -w / 2, y = -h / 2; if (!r) { s.moveTo(x, y); s.lineTo(x + w, y); s.lineTo(x + w, y + h); s.lineTo(x, y + h); s.closePath(); return s; } s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s; };
const ring = (THREE, w, h, iw, ih, r = 0) => { const s = rect(THREE, w, h, r); s.holes.push(rect(THREE, iw, ih)); return s; };
// Extrusion whose back face sits on z = 0.
const ext = (THREE, shape, depth, bevel = 0, curve = 6) => { const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: curve }); g.translate(0, 0, bevel); return g; };
const lathe = (THREE, pts, seg = 24) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
const field = (THREE, w, h) => ext(THREE, rect(THREE, w, h), 0.006, 0.008, 1);
const box = THREE => (w, h, d) => new THREE.BoxGeometry(w, h, d);
const side = s => (s < 0 ? 'l' : 'r');

const DEF = {
  wood: ['walnut', { color: '#5b3520', roughness: 0.5 }], trim: ['walnut_dark', { color: '#3a2114', roughness: 0.55 }],
  top: ['oak', { color: '#8a6238', roughness: 0.45 }], brass: ['brass', { color: '#c49c58', roughness: 0.3, metalness: 0.9 }],
  gilt: ['gilt', { color: '#a8823f', roughness: 0.4, metalness: 0.9 }], leather: ['leather_red', { color: '#4e1a15', roughness: 0.6 }],
  velvet: ['velvet', { color: '#4a1210', roughness: 0.85, side: 2 }], black: ['black', { color: '#0a0807', roughness: 0.6 }],
  glass: ['ink_glass', { color: '#141a1c', roughness: 0.1, metalness: 0.2 }], glow: ['glow', { color: '#ffcf8a', emissive: '#ffbf70', emissiveIntensity: 2 }],
  canvas: ['canvas', { color: '#3a3129', roughness: 0.85 }], face: ['plaque_face', { color: '#c49c58', metalness: 0.75, roughness: 0.34 }],
  rug: ['rug', { color: '#ffffff', roughness: 0.95 }], binding: ['rug_binding', { color: '#1e1410', roughness: 0.95 }], fringe: ['rug_fringe', { color: '#b9ab8e', roughness: 1 }]
};
const mats = (THREE, opts, keys) => { const given = opts.materials || {}, out = {}; keys.forEach(k => { out[k] = given[k] || new THREE.MeshStandardMaterial(Object.assign({ name: DEF[k][0] }, DEF[k][1])); }); return out; };

// Judge's bench: dais with end steps, panelled front with pilasters (centre bay left for the court seal at z 1.33), oak top at y 1.915.
export function buildJudgesBench(THREE, opts = {}) {
  const m = mats(THREE, opts, ['wood', 'trim', 'top']), mesh = mk(THREE), B = box(THREE), g = new THREE.Group(); g.name = 'judges_bench';
  mesh('dais_skirt', B(7.06, 0.08, 3.26), m.trim, g, 0, 0.04, -0.2);
  mesh('dais', B(7, 0.47, 3.2), m.wood, g, 0, 0.315, -0.2);
  mesh('dais_nosing', B(7.08, 0.05, 3.28), m.trim, g, 0, 0.575, -0.2);
  [-1, 1].forEach(s => {
    mesh(`dais_step_lower_${side(s)}`, B(0.6, 0.2, 1), m.wood, g, s * 3.8, 0.1, -1.1);
    mesh(`dais_step_lower_nosing_${side(s)}`, B(0.64, 0.025, 1.04), m.trim, g, s * 3.8, 0.2, -1.1);
    mesh(`dais_step_upper_${side(s)}`, B(0.3, 0.4, 1), m.wood, g, s * 3.65, 0.2, -1.1);
    mesh(`dais_step_upper_nosing_${side(s)}`, B(0.34, 0.025, 1.04), m.trim, g, s * 3.67, 0.4, -1.1);
  });
  mesh('front_plinth', B(5.52, 0.14, 0.2), m.trim, g, 0, 0.67, 1.26);
  mesh('front_panel', B(5.4, 1.25, 0.12), m.wood, g, 0, 1.225, 1.25);
  mesh('rear_panel', B(5.4, 1.25, 0.1), m.trim, g, 0, 1.225, 0.4);
  [-1, 1].forEach(s => {
    mesh(`side_return_${side(s)}`, B(0.12, 1.25, 1.03), m.wood, g, s * 2.64, 1.225, 0.8);
    mesh(`side_field_${side(s)}`, field(THREE, 0.62, 0.84), m.wood, g, s * 2.7, 1.22, 0.8).rotation.y = s * Math.PI / 2;
  });
  [-2.4, -1.6, -0.8, 0.8, 1.6, 2.4].forEach((x, i) => {
    mesh(`pilaster_${i + 1}`, B(0.12, 0.96, 0.04), m.trim, g, x, 1.22, 1.33);
    mesh(`pilaster_base_${i + 1}`, B(0.16, 0.08, 0.06), m.trim, g, x, 0.78, 1.34);
    mesh(`pilaster_cap_${i + 1}`, B(0.17, 0.07, 0.07), m.trim, g, x, 1.705, 1.345);
  });
  [[-2, 0.56], [-1.2, 0.56], [0, 1.4], [1.2, 0.56], [2, 0.56]].forEach(([x, w], i) => mesh(`front_field_${i + 1}`, field(THREE, w, 0.84), m.wood, g, x, 1.22, 1.31));
  mesh('frieze', B(5.5, 0.1, 0.06), m.trim, g, 0, 1.77, 1.33);
  mesh('cornice', B(5.64, 0.035, 0.16), m.trim, g, 0, 1.8275, 1.34);
  mesh('desk_top', B(5.7, 0.07, 1.08), m.top, g, 0, 1.88, 0.91);
  mesh('desk_top_nosing', new THREE.CylinderGeometry(0.035, 0.035, 5.7, 16), m.top, g, 0, 1.88, 1.45).rotation.z = Math.PI / 2;
  return { bench: g, materials: m };
}

// Judge's chair: pedestal on four brass-capped feet, tall arched button-tufted leather back. Origin on the dais; seat top y 0.76.
export function buildJudgesChair(THREE, opts = {}) {
  const m = mats(THREE, opts, ['leather', 'wood', 'trim', 'brass']), mesh = mk(THREE), B = box(THREE), g = new THREE.Group(); g.name = 'judges_chair';
  mesh('pedestal', lathe(THREE, [[0, 0.04], [0.09, 0.04], [0.1, 0.07], [0.065, 0.1], [0.05, 0.3], [0.07, 0.34], [0.07, 0.52], [0, 0.52]], 20), m.trim, g);
  const cap = lathe(THREE, [[0, 0], [0.03, 0], [0.03, 0.02], [0, 0.032]], 12);
  for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2; mesh(`foot_${i + 1}`, B(0.07, 0.05, 0.36), m.trim, g, Math.sin(a) * 0.17, 0.055, Math.cos(a) * 0.17).rotation.y = a; mesh(`foot_cap_${i + 1}`, cap, m.brass, g, Math.sin(a) * 0.33, 0, Math.cos(a) * 0.33); }
  mesh('seat_frame', B(0.84, 0.1, 0.7), m.wood, g, 0, 0.57, 0);
  mesh('seat_cushion', ext(THREE, rect(THREE, 0.78, 0.64, 0.08), 0.08, 0.03, 8).rotateX(-Math.PI / 2), m.leather, g, 0, 0.62, 0);
  const arch = (w, h) => { const s = new THREE.Shape(), r = w / 2; s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, h - r); s.absarc(0, h - r, r, 0, Math.PI, false); s.lineTo(-r, 0); return s; };
  mesh('back_frame', ext(THREE, arch(0.98, 1.9), 0.08, 0.012, 24), m.wood, g, 0, 0.66, -0.45);
  mesh('back_cushion', ext(THREE, arch(0.84, 1.78), 0.05, 0.035, 24), m.leather, g, 0, 0.72, -0.37);
  const btn = new THREE.SphereGeometry(0.014, 8, 6);
  for (let r = 0; r < 6; r++) { const n = 4 + (r % 2); for (let c = 0; c < n; c++) mesh(`tuft_${r + 1}_${c + 1}`, btn, m.leather, g, (c - (n - 1) / 2) * 0.15, 1.0 + r * 0.2, -0.252); }
  mesh('crest_finial', lathe(THREE, [[0, 0], [0.03, 0], [0.035, 0.02], [0.02, 0.035], [0.03, 0.06], [0.012, 0.09], [0, 0.1]], 16), m.brass, g, 0, 2.54, -0.4);
  [-1, 1].forEach(s => {
    mesh(`arm_post_${side(s)}`, lathe(THREE, [[0, 0], [0.03, 0], [0.022, 0.04], [0.02, 0.16], [0.03, 0.2], [0.02, 0.26], [0, 0.28]], 14), m.wood, g, s * 0.4, 0.62, 0.26);
    mesh(`arm_panel_${side(s)}`, B(0.05, 0.26, 0.56), m.leather, g, s * 0.4, 0.76, -0.06);
    mesh(`arm_rest_${side(s)}`, B(0.1, 0.05, 0.66), m.wood, g, s * 0.4, 0.915, -0.03);
    mesh(`arm_pad_${side(s)}`, ext(THREE, rect(THREE, 0.07, 0.5, 0.03), 0.01, 0.01, 6).rotateX(-Math.PI / 2), m.leather, g, s * 0.4, 0.94, -0.05);
  });
  return { chair: g, materials: m };
}

// Gallery bench: scrolled end panels, seat with rounded nosing, raked panelled back. Faces -Z (toward the bench), back toward +Z.
export function buildGalleryBench(THREE, opts = {}) {
  const w = opts.w || 5.2, L = w - 0.12, m = mats(THREE, opts, ['wood', 'trim']), mesh = mk(THREE), B = box(THREE), g = new THREE.Group(); g.name = 'gallery_bench';
  const end = new THREE.Shape(); // shape x = -world z
  end.moveTo(0.25, 0); end.lineTo(0.25, 0.52); end.quadraticCurveTo(0.25, 0.62, 0.15, 0.63); end.quadraticCurveTo(-0.08, 0.66, -0.14, 1.0); end.lineTo(-0.2, 1.02); end.quadraticCurveTo(-0.28, 1.02, -0.28, 0.94); end.lineTo(-0.28, 0); end.closePath();
  const eg = ext(THREE, end, 0.04, 0.012, 10); eg.translate(0, 0, -0.032); eg.rotateY(Math.PI / 2);
  [-1, 1].forEach(s => mesh(`end_panel_${side(s)}`, eg, m.trim, g, s * (w / 2 - 0.03), 0, 0));
  mesh('seat', B(L, 0.05, 0.42), m.wood, g, 0, 0.45, 0);
  mesh('seat_nosing', new THREE.CylinderGeometry(0.025, 0.025, L, 12), m.wood, g, 0, 0.45, -0.21).rotation.z = Math.PI / 2;
  mesh('seat_apron', B(L, 0.08, 0.03), m.trim, g, 0, 0.385, -0.18);
  mesh('stretcher', B(L, 0.06, 0.05), m.trim, g, 0, 0.12, 0.06);
  const back = new THREE.Group(); back.position.set(0, 0.48, 0.2); back.rotation.x = 0.1; g.add(back);
  mesh('back', B(L, 0.52, 0.04), m.wood, back, 0, 0.26, 0);
  mesh('back_rail', B(L + 0.04, 0.05, 0.08), m.trim, back, 0, 0.545, 0.01);
  const n = 5, fw = (L - 0.3) / n; for (let i = 0; i < n; i++) mesh(`back_field_${i + 1}`, field(THREE, fw - 0.12, 0.34), m.trim, back, -L / 2 + 0.15 + fw * (i + 0.5), 0.26, 0.02);
  return { bench: g, materials: m };
}

// Counsel table: 2.6 × 1.1 m, top at y 0.79, turned legs, apron, panelled modesty board on -Z, two drawers on +Z.
export function buildCounselTable(THREE, opts = {}) {
  const m = mats(THREE, opts, ['wood', 'trim', 'brass']), mesh = mk(THREE), B = box(THREE), g = new THREE.Group(); g.name = 'counsel_table';
  mesh('top', B(2.6, 0.045, 1.1), m.wood, g, 0, 0.7675, 0);
  mesh('top_lip', B(2.54, 0.02, 1.04), m.trim, g, 0, 0.735, 0);
  const leg = lathe(THREE, [[0, 0], [0.034, 0], [0.04, 0.03], [0.028, 0.07], [0.025, 0.34], [0.042, 0.4], [0.03, 0.46], [0.034, 0.6], [0, 0.6]], 16);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b], i) => { mesh(`leg_${i + 1}`, leg, m.trim, g, a * 1.2, 0, b * 0.47); mesh(`leg_block_${i + 1}`, B(0.08, 0.125, 0.08), m.trim, g, a * 1.2, 0.6625, b * 0.47); });
  [-1, 1].forEach(b => mesh(b < 0 ? 'apron_front' : 'apron_back', B(2.32, 0.12, 0.025), m.wood, g, 0, 0.665, b * 0.47));
  [-1, 1].forEach(a => mesh(`apron_${side(a)}`, B(0.025, 0.12, 0.86), m.wood, g, a * 1.2, 0.665, 0));
  mesh('modesty_panel', B(2.32, 0.46, 0.025), m.wood, g, 0, 0.37, -0.47);
  [-0.78, 0, 0.78].forEach((x, i) => { mesh(`modesty_field_${i + 1}`, field(THREE, 0.62, 0.32), m.trim, g, x, 0.37, -0.4825).rotation.y = Math.PI; });
  const pull = lathe(THREE, [[0, 0], [0.012, 0], [0.008, 0.01], [0.016, 0.022], [0, 0.026]], 12);
  [-0.6, 0.6].forEach((x, i) => { mesh(`drawer_${i + 1}`, B(0.7, 0.085, 0.012), m.trim, g, x, 0.665, 0.488); mesh(`drawer_pull_${i + 1}`, pull, m.brass, g, x, 0.665, 0.494).rotation.x = Math.PI / 2; });
  return { table: g, materials: m };
}

// Drapes: two folded velvet panels flaring at the hem, swagged valance under a walnut pelmet. Origin on the back wall.
export function buildDrapes(THREE, opts = {}) {
  const m = mats(THREE, opts, ['velvet', 'trim']), mesh = mk(THREE), B = box(THREE), g = new THREE.Group(); g.name = 'court_drapes';
  const W = opts.w || 6.9, ph = opts.h || 6.6;
  const panel = (w, h, folds, seed) => {
    const geo = new THREE.PlaneGeometry(w, h, folds * 8, 14), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), u = x / w + 0.5, v = y / h + 0.5, a = 0.055 + 0.03 * (1 - v); p.setZ(i, a + a * Math.sin(u * Math.PI * 2 * folds + seed + 0.8 * Math.sin(u * 7 + seed))); p.setX(i, x * (1 + 0.1 * (1 - v) * (1 - v))); }
    geo.computeVertexNormals(); return geo;
  };
  [-1, 1].forEach(s => mesh(`drape_${side(s)}`, panel(1.3, ph, 7, s), m.velvet, g, s * 2.68, ph / 2 + 0.02, 0.1));
  const vg = new THREE.PlaneGeometry(W, 0.7, 140, 4), vp = vg.attributes.position;
  for (let i = 0; i < vp.count; i++) { const u = vp.getX(i) / W + 0.5, v = vp.getY(i) / 0.7 + 0.5, sag = Math.abs(Math.sin(u * Math.PI * 7)), yb = -0.19 - 0.16 * sag; vp.setY(i, yb + (0.35 - yb) * v); vp.setZ(i, 0.02 * Math.sin(u * Math.PI * 52) + 0.06 * sag * (1 - v)); }
  vg.computeVertexNormals();
  mesh('valance', vg, m.velvet, g, 0, 6.9, 0.3);
  [-1, 1].forEach(s => mesh(`valance_return_${side(s)}`, B(0.03, 0.7, 0.3), m.velvet, g, s * W / 2, 6.9, 0.15));
  mesh('pelmet_board', B(W + 0.06, 0.05, 0.36), m.trim, g, 0, 7.27, 0.14);
  return { drapes: g, materials: m };
}

// Door name plaque: bevelled brass plate, raised border, two dome screws. Origin at centre; back at z -0.006. `face` carries the lettering.
export function buildNamePlaque(THREE, opts = {}) {
  const m = mats(THREE, opts, ['brass', 'face']), mesh = mk(THREE), g = new THREE.Group(); g.name = 'brass_name_plaque';
  mesh('plaque_plate', ext(THREE, rect(THREE, 1.04, 0.26, 0.02), 0.004, 0.002, 4), m.brass, g, 0, 0, -0.006);
  mesh('plaque_border', ext(THREE, ring(THREE, 0.99, 0.215, 0.96, 0.2), 0.002, 0.001, 1), m.brass, g, 0, 0, 0.002);
  mesh('plaque_face', new THREE.PlaneGeometry(0.96, 0.2), m.face, g, 0, 0, 0.0025).castShadow = false;
  const screw = lathe(THREE, [[0, 0], [0.009, 0], [0.008, 0.002], [0.005, 0.0035], [0, 0.004]], 16).rotateX(Math.PI / 2);
  [-1, 1].forEach(s => mesh(`screw_${side(s)}`, screw, m.brass, g, s * 0.5, 0, 0.002));
  return { plaque: g, materials: m };
}

// Inkwell set: walnut tray with brass rim, two faceted inkwells with hinged caps, dip pen in a socket, fountain pen in front. Origin on the desk.
export function buildInkwellSet(THREE, opts = {}) {
  const m = mats(THREE, opts, ['wood', 'brass', 'glass', 'black']), mesh = mk(THREE), g = new THREE.Group(); g.name = 'inkwell_pen_set';
  mesh('tray', ext(THREE, rect(THREE, 0.3, 0.16, 0.025), 0.012, 0.004, 6).rotateX(-Math.PI / 2), m.wood, g);
  mesh('tray_rim', ext(THREE, ring(THREE, 0.29, 0.15, 0.28, 0.14), 0.004).rotateX(-Math.PI / 2), m.brass, g, 0, 0.02, 0);
  const well = lathe(THREE, [[0, 0], [0.032, 0], [0.035, 0.006], [0.035, 0.04], [0.027, 0.052], [0.014, 0.057], [0.014, 0.063], [0, 0.063]], 8);
  const collar = lathe(THREE, [[0.014, 0], [0.018, 0], [0.018, 0.008], [0.014, 0.008]], 16);
  const cap = lathe(THREE, [[0, 0], [0.019, 0], [0.02, 0.006], [0.013, 0.015], [0.004, 0.019], [0.006, 0.025], [0, 0.029]], 16);
  [-1, 1].forEach(s => { mesh(`inkwell_${side(s)}`, well, m.glass, g, s * 0.08, 0.02, -0.02); mesh(`inkwell_collar_${side(s)}`, collar, m.brass, g, s * 0.08, 0.075, -0.02); mesh(`inkwell_cap_${side(s)}`, cap, m.brass, g, s * 0.08, 0.083, -0.02); });
  mesh('pen_socket', lathe(THREE, [[0, 0], [0.016, 0], [0.016, 0.006], [0.007, 0.012], [0.008, 0.038], [0.011, 0.044], [0, 0.044]], 16), m.brass, g, 0, 0.02, -0.03);
  const pen = lathe(THREE, [[0, 0], [0.0015, 0.004], [0.0035, 0.018], [0.005, 0.03], [0.005, 0.155], [0.0035, 0.168], [0, 0.172]], 12);
  mesh('dip_pen', pen, m.black, g, 0, 0.03, -0.03).rotation.z = -0.45;
  mesh('fountain_pen', pen, m.black, g, -0.086, 0.026, 0.05).rotation.z = -Math.PI / 2;
  mesh('fountain_pen_band', new THREE.CylinderGeometry(0.0057, 0.0057, 0.008, 12), m.brass, g, 0.03, 0.026, 0.05).rotation.z = Math.PI / 2;
  return { set: g, materials: m };
}

// Wall sconce: oval backplate, S-curved arm, candle cup and tulip glass shade. Origin at the wall (back on z = 0), backplate centre.
export function buildSconce(THREE, opts = {}) {
  const m = mats(THREE, opts, ['brass', 'glow']), mesh = mk(THREE), g = new THREE.Group(); g.name = 'wall_sconce';
  const plate = new THREE.CylinderGeometry(0.05, 0.052, 0.014, 28).rotateX(Math.PI / 2); plate.scale(1, 1.7, 1);
  mesh('backplate', plate, m.brass, g, 0, 0, 0.007);
  mesh('backplate_boss', new THREE.SphereGeometry(0.018, 14, 10), m.brass, g, 0, 0, 0.016);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  mesh('arm', new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0, 0, 0.02), V(0, -0.035, 0.07), V(0, -0.01, 0.12), V(0, 0.035, 0.135)]), 24, 0.007, 8), m.brass, g);
  mesh('cup', lathe(THREE, [[0, 0], [0.012, 0], [0.03, 0.018], [0.034, 0.028], [0.022, 0.03], [0.022, 0.036], [0, 0.036]], 20), m.brass, g, 0, 0.035, 0.135);
  mesh('shade', lathe(THREE, [[0.021, 0], [0.036, 0.02], [0.052, 0.07], [0.058, 0.12], [0.054, 0.15], [0.05, 0.152]], 24), m.glow, g, 0, 0.068, 0.135).castShadow = false;
  return { sconce: g, materials: m };
}

// Portrait frame: stepped gilt moulding, inner bead, corner bosses and crest. Origin at frame centre, back on z = 0. `canvas` carries the painting.
export function buildPortraitFrame(THREE, opts = {}) {
  const w = opts.w || 0.9, h = opts.h || 1.15, m = mats(THREE, opts, ['gilt', 'canvas', 'trim']), mesh = mk(THREE), g = new THREE.Group(); g.name = 'portrait_frame';
  mesh('backing', box(THREE)(w - 0.06, h - 0.06, 0.01), m.trim, g, 0, 0, 0.005);
  mesh('frame_outer', ext(THREE, ring(THREE, w, h, w - 0.1, h - 0.1), 0.028, 0.012, 1), m.gilt, g);
  mesh('frame_bead', ext(THREE, ring(THREE, w - 0.1, h - 0.1, w - 0.13, h - 0.13), 0.012, 0.004, 1), m.gilt, g);
  mesh('canvas', new THREE.PlaneGeometry(w - 0.12, h - 0.12), m.canvas, g, 0, 0, 0.012).castShadow = false;
  const orn = new THREE.SphereGeometry(0.03, 12, 8); orn.scale(1, 1, 0.4);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b], i) => mesh(`corner_boss_${i + 1}`, orn, m.gilt, g, a * (w / 2 - 0.05), b * (h / 2 - 0.05), 0.052));
  const crest = new THREE.SphereGeometry(0.05, 16, 10); crest.scale(1.4, 0.8, 0.35);
  mesh('crest', crest, m.gilt, g, 0, h / 2 - 0.02, 0.05);
  return { frame: g, materials: m };
}

// Round tripod side table: moulded top (surface y 0.62), turned column, three cabriole legs.
export function buildSideTable(THREE, opts = {}) {
  const m = mats(THREE, opts, ['wood', 'trim']), mesh = mk(THREE), g = new THREE.Group(); g.name = 'walnut_side_table';
  mesh('top', lathe(THREE, [[0, 0.575], [0.27, 0.575], [0.295, 0.585], [0.305, 0.6], [0.3, 0.612], [0.29, 0.62], [0, 0.62]], 48), m.wood, g);
  mesh('column', lathe(THREE, [[0, 0.1], [0.055, 0.1], [0.06, 0.13], [0.04, 0.17], [0.03, 0.24], [0.056, 0.31], [0.06, 0.35], [0.042, 0.41], [0.028, 0.5], [0.042, 0.545], [0.06, 0.575], [0, 0.575]], 24), m.trim, g);
  const s = new THREE.Shape(); s.moveTo(0.03, 0.24); s.quadraticCurveTo(0.17, 0.2, 0.25, 0.035); s.lineTo(0.29, 0); s.lineTo(0.295, 0.028); s.quadraticCurveTo(0.2, 0.08, 0.1, 0.12); s.quadraticCurveTo(0.06, 0.135, 0.03, 0.12); s.closePath();
  const lg = ext(THREE, s, 0.03, 0.006, 10); lg.translate(0, 0, -0.021);
  for (let i = 0; i < 3; i++) mesh(`leg_${i + 1}`, lg, m.trim, g).rotation.y = i * Math.PI * 2 / 3 + Math.PI / 2;
  return { table: g, materials: m };
}

// Library table: 1.2 × 0.7 m, top at y 0.765, turned legs, H-stretcher, drawer on +Z.
export function buildLibraryTable(THREE, opts = {}) {
  const m = mats(THREE, opts, ['wood', 'trim', 'brass']), mesh = mk(THREE), B = box(THREE), g = new THREE.Group(); g.name = 'library_table';
  mesh('top', B(1.2, 0.035, 0.7), m.wood, g, 0, 0.7475, 0);
  mesh('top_lip', B(1.22, 0.012, 0.72), m.trim, g, 0, 0.724, 0);
  const leg = lathe(THREE, [[0, 0], [0.026, 0], [0.029, 0.02], [0.02, 0.05], [0.018, 0.3], [0.03, 0.36], [0.021, 0.42], [0.024, 0.62], [0, 0.62]], 14);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b], i) => { mesh(`leg_${i + 1}`, leg, m.trim, g, a * 0.54, 0, b * 0.29); mesh(`leg_block_${i + 1}`, B(0.06, 0.098, 0.06), m.trim, g, a * 0.54, 0.669, b * 0.29); });
  [-1, 1].forEach(b => mesh(b < 0 ? 'apron_back' : 'apron_front', B(1.02, 0.09, 0.02), m.wood, g, 0, 0.673, b * 0.29));
  [-1, 1].forEach(a => mesh(`apron_${side(a)}`, B(0.02, 0.09, 0.52), m.wood, g, a * 0.54, 0.673, 0));
  mesh('drawer', B(0.46, 0.066, 0.01), m.trim, g, 0, 0.673, 0.305);
  mesh('drawer_pull', lathe(THREE, [[0, 0], [0.01, 0], [0.007, 0.008], [0.013, 0.018], [0, 0.021]], 12), m.brass, g, 0, 0.673, 0.31).rotation.x = Math.PI / 2;
  [-1, 1].forEach(a => mesh(`stretcher_${side(a)}`, B(0.022, 0.028, 0.54), m.trim, g, a * 0.54, 0.14, 0));
  mesh('stretcher_centre', B(1.06, 0.028, 0.022), m.trim, g, 0, 0.14, 0);
  return { table: g, materials: m };
}

// Pocket door leaf: two moulded raised fields per face, brass flush pulls near the meeting edge. Origin at leaf centre.
// side: -1 = left leaf (meets at +x), 1 = right leaf (meets at -x).
export function buildPocketDoor(THREE, opts = {}) {
  const w = opts.w || 1.06, h = opts.h || 3.1, t = 0.08, s = opts.side || -1, m = mats(THREE, opts, ['wood', 'trim', 'brass', 'black']), mesh = mk(THREE), g = new THREE.Group(); g.name = 'office_pocket_door';
  mesh('door_slab', box(THREE)(w, h, t), m.wood, g);
  [[0.62, 1.3], [-0.82, 1.0]].forEach(([y, fh], i) => [1, -1].forEach(f => {
    const n = `${i ? 'lower' : 'upper'}_${f > 0 ? 'front' : 'back'}`;
    const mo = mesh(`moulding_${n}`, ext(THREE, ring(THREE, w - 0.24, fh + 0.06, w - 0.3, fh), 0.008, 0.004, 1), m.trim, g, 0, y, f * t / 2);
    const fl = mesh(`field_${n}`, field(THREE, w - 0.34, fh - 0.04), m.wood, g, 0, y, f * t / 2);
    if (f < 0) mo.rotation.y = fl.rotation.y = Math.PI;
  }));
  const ov = new THREE.CylinderGeometry(0.028, 0.028, 0.004, 24).rotateX(Math.PI / 2); ov.scale(1, 2.4, 1);
  const rc = new THREE.CylinderGeometry(0.019, 0.019, 0.002, 24).rotateX(Math.PI / 2); rc.scale(1, 2.8, 1);
  const px = -s * (w / 2 - 0.08), py = -0.175;
  [1, -1].forEach(f => { const n = f > 0 ? 'front' : 'back'; mesh(`flush_pull_${n}`, ov, m.brass, g, px, py, f * (t / 2 + 0.002)); mesh(`flush_pull_recess_${n}`, rc, m.black, g, px, py, f * (t / 2 + 0.0035)); });
  mesh('edge_pull', box(THREE)(0.004, 0.12, 0.028), m.brass, g, -s * (w / 2 + 0.002), py, 0);
  return { door: g, materials: m };
}

// Office rug: bound edge, pile face (the `rug` material carries the pattern), wool fringe on both short ends.
export function buildRug(THREE, opts = {}) {
  const w = opts.w || 3.6, d = opts.d || 7, m = mats(THREE, opts, ['rug', 'binding', 'fringe']), mesh = mk(THREE), g = new THREE.Group(); g.name = 'office_rug';
  if (!(opts.materials && opts.materials.rug)) { m.rug.map = rugTexture(THREE); m.rug.bumpMap = m.rug.map; m.rug.bumpScale = 0.8; }
  mesh('rug_base', box(THREE)(w, 0.01, d), m.binding, g, 0, 0.005, 0).castShadow = false;
  mesh('rug_pile', new THREE.PlaneGeometry(w - 0.01, d - 0.01).rotateX(-Math.PI / 2), m.rug, g, 0, 0.0115, 0).castShadow = false;
  const tas = new THREE.BoxGeometry(0.007, 0.003, 0.085), n = Math.round(w / 0.024);
  let seed = 3; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  [-1, 1].forEach(e => { for (let i = 0; i < n; i++) { const t = mesh(`fringe_${e < 0 ? 'back' : 'front'}_${i + 1}`, tas, m.fringe, g, -w / 2 + 0.012 + i * (w - 0.024) / (n - 1), 0.003, e * (d / 2 + 0.035 + (r() - 0.5) * 0.01)); t.rotation.y = (r() - 0.5) * 0.25; t.scale.z = 0.85 + r() * 0.3; t.castShadow = false; } });
  return { rug: g, materials: m };
}

// Preview-only pattern when no rug material is supplied: madder field, indigo border, central medallion.
function rugTexture(THREE) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 1000; const g = c.getContext('2d');
  g.fillStyle = '#1c2436'; g.fillRect(0, 0, 512, 1000);
  g.fillStyle = '#c9b48a'; g.fillRect(34, 34, 444, 932); g.fillStyle = '#6b1f18'; g.fillRect(44, 44, 424, 912);
  g.strokeStyle = '#c9b48a'; g.lineWidth = 3; g.strokeRect(70, 70, 372, 860);
  g.fillStyle = '#1c2436'; g.beginPath(); g.ellipse(256, 500, 120, 230, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#b08a4a'; g.beginPath(); g.ellipse(256, 500, 60, 110, 0, 0, Math.PI * 2); g.fill();
  [[70, 70], [442, 70], [70, 930], [442, 930]].forEach(([x, y]) => { g.fillStyle = '#1c2436'; g.beginPath(); g.arc(x, y, 70, 0, Math.PI * 2); g.fill(); });
  // no canvas readback (Safari adds coloured noise to getImageData)
  let s = 11; const sr = () => ((s = (s * 16807) % 2147483647) / 2147483647); { const nc = document.createElement('canvas'); nc.width = 512; nc.height = 1000; const nx = nc.getContext('2d'), id = nx.createImageData(512, 1000), q = id.data; for (let i = 0; i < q.length; i += 4) { const n = (sr() - 0.5) * 26; const v = n > 0 ? 255 : 0; q[i] = q[i + 1] = q[i + 2] = v; q[i + 3] = Math.min(255, Math.abs(n) * 2.2); } nx.putImageData(id, 0, 0); const op = g.globalCompositeOperation, ga = g.globalAlpha; g.globalCompositeOperation = 'source-atop'; g.globalAlpha = 1; g.drawImage(nc, 0, 0); g.globalCompositeOperation = op; g.globalAlpha = ga; }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
