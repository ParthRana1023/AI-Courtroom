// Courtroom pieces: door leaf, lintel plaque, witness stand, stenographer's desk and typewriter.
// Pure builders: pass THREE in. Every piece faces +Z (toward the gallery) unless noted.
import { buildDoor } from './door.js';
const mk = THREE => (name, geo, mat, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.castShadow = true; m.receiveShadow = true; m.position.set(x, y, z); parent.add(m); return m; };
const rect = (THREE, w, h, r = 0) => { const s = new THREE.Shape(), x = -w / 2, y = -h / 2; if (!r) { s.moveTo(x, y); s.lineTo(x + w, y); s.lineTo(x + w, y + h); s.lineTo(x, y + h); s.closePath(); return s; } s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s; };
const field = (THREE, w, h) => new THREE.ExtrudeGeometry(rect(THREE, w, h), { depth: 0.006, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.02, bevelSegments: 2, curveSegments: 1 });
const woodMats = THREE => ({
  wood: new THREE.MeshStandardMaterial({ name: 'walnut', color: '#5b3520', roughness: 0.5 }),
  trim: new THREE.MeshStandardMaterial({ name: 'walnut_dark', color: '#3a2114', roughness: 0.55 }),
  brass: new THREE.MeshStandardMaterial({ name: 'brass', color: '#d6ad5c', roughness: 0.3, metalness: 0.4 }),
  black: new THREE.MeshStandardMaterial({ name: 'keyhole', color: '#0b0908', roughness: 0.8 })
});

// Leaf: 1.7 × 4.8 m, bottom at y = 0, front face z = 0.07. Handle + lock come from the Act I door model.
export function buildCourtDoorLeaf(THREE, opts = {}) {
  const mats = opts.materials || woodMats(THREE), mesh = mk(THREE), g = new THREE.Group(); g.name = 'courtroom_door_leaf';
  mesh('leaf', new THREE.BoxGeometry(1.7, 4.8, 0.14), mats.wood, g, 0, 2.42, 0);
  const D = buildDoor(THREE, { materials: mats, panels: [[0, 3.72, 1.26, 1.5], [0, 2.62, 1.26, 0.36], [0, 1.36, 1.26, 1.7]] });
  D.panels.position.z = 0.02; g.add(D.panels);
  mesh('kick_plate', new THREE.BoxGeometry(1.44, 0.24, 0.006), mats.brass, g, 0, 0.2, 0.073);
  return { leaf: g, handle: D.handle, lock: D.lock, materials: mats };
}

// Plaque: origin at centre, back on z = 0. `face` material carries the lettering texture.
export function buildCourtPlaque(THREE, opts = {}) {
  const w = opts.w || 3.1, h = opts.h || 0.4, mesh = mk(THREE), g = new THREE.Group(); g.name = 'courtroom_plaque';
  const mats = opts.materials || { wood: woodMats(THREE).trim, brass: woodMats(THREE).brass, face: new THREE.MeshStandardMaterial({ name: 'plaque_face', color: '#c9a45c', metalness: 0.5, roughness: 0.4 }) };
  mesh('plaque_backing', new THREE.ExtrudeGeometry(rect(THREE, w + 0.3, h + 0.2, 0.05), { depth: 0.03, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 3, curveSegments: 6 }), mats.wood, g, 0, 0, 0.012);
  const ring = rect(THREE, w + 0.08, h + 0.08); ring.holes.push(rect(THREE, w, h));
  mesh('plaque_frame', new THREE.ExtrudeGeometry(ring, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 1 }), mats.brass, g, 0, 0, 0.06);
  mesh('plaque_face', new THREE.PlaneGeometry(w, h), mats.face, g, 0, 0, 0.058).castShadow = false;
  const boss = new THREE.LatheGeometry([[0, 0], [0.05, 0], [0.055, 0.01], [0.04, 0.022], [0.018, 0.03], [0, 0.032]].map(([r, y]) => new THREE.Vector2(r, y)), 24).rotateX(Math.PI / 2);
  [-1, 1].forEach(s => mesh(s < 0 ? 'rosette_left' : 'rosette_right', boss, mats.brass, g, s * (w / 2 + 0.1), 0, 0.054));
  return { plaque: g, materials: mats };
}

// Witness stand: raised platform, panelled three-sided box, rail, turned corner posts, oath-book ledge. Origin floor centre.
export function buildWitnessStand(THREE, opts = {}) {
  const mats = opts.materials || Object.assign(woodMats(THREE), { book: new THREE.MeshStandardMaterial({ name: 'book', color: '#5e1a14', roughness: 0.7 }) });
  const mesh = mk(THREE), B = (w, h, d) => new THREE.BoxGeometry(w, h, d), g = new THREE.Group(); g.name = 'witness_stand';
  mesh('platform_skirt', B(1.76, 0.06, 1.76), mats.trim, g, 0, 0.03, 0);
  mesh('platform', B(1.7, 0.32, 1.7), mats.wood, g, 0, 0.22, 0);
  mesh('platform_cap', B(1.74, 0.04, 1.74), mats.trim, g, 0, 0.4, 0);
  mesh('entry_step', B(0.9, 0.2, 0.36), mats.wood, g, 0, 0.1, -1.03);
  mesh('front_wall', B(1.7, 1.0, 0.06), mats.wood, g, 0, 0.92, 0.82);
  [-1, 1].forEach(s => mesh(s < 0 ? 'side_wall_left' : 'side_wall_right', B(0.06, 1.0, 1.7), mats.wood, g, s * 0.82, 0.92, 0));
  [-1, 1].forEach(s => mesh('front_field_' + (s < 0 ? 'l' : 'r'), field(THREE, 0.6, 0.66), mats.trim, g, s * 0.38, 0.92, 0.852));
  [-1, 1].forEach(s => [-1, 1].forEach(t => { const f = mesh(`side_field_${s < 0 ? 'l' : 'r'}_${t < 0 ? 'b' : 'f'}`, field(THREE, 0.6, 0.66), mats.trim, g, s * 0.852, 0.92, t * 0.38); f.rotation.y = s * Math.PI / 2; }));
  mesh('rail_front', B(1.84, 0.06, 0.16), mats.trim, g, 0, 1.45, 0.82);
  [-1, 1].forEach(s => mesh(s < 0 ? 'rail_left' : 'rail_right', B(0.16, 0.06, 1.84), mats.trim, g, s * 0.82, 1.45, 0));
  const post = new THREE.LatheGeometry([[0, 0], [0.055, 0], [0.055, 0.08], [0.038, 0.12], [0.042, 0.5], [0.034, 0.86], [0.05, 0.92], [0.05, 1.0], [0, 1.0]].map(([r, y]) => new THREE.Vector2(r, y)), 16);
  [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz], i) => { mesh('corner_post_' + (i + 1), post, mats.wood, g, sx * 0.82, 0.42, sz * 0.82); mesh('post_finial_' + (i + 1), new THREE.SphereGeometry(0.036, 16, 12), mats.brass, g, sx * 0.82, 1.52, sz * 0.82); });
  const ledge = mesh('oath_ledge', B(0.5, 0.03, 0.24), mats.trim, g, 0, 1.28, 0.66); ledge.rotation.x = 0.25;
  const book = mesh('oath_book', B(0.2, 0.04, 0.26), mats.book, g, 0, 1.31, 0.655); book.rotation.x = 0.25;
  return { stand: g, materials: mats };
}

// Stenographer's desk: origin floor centre, typist sits on the -Z side, modesty panel faces +Z. Top at y = 0.775.
export function buildStenoDesk(THREE, opts = {}) {
  const mats = opts.materials || woodMats(THREE), mesh = mk(THREE), B = (w, h, d) => new THREE.BoxGeometry(w, h, d), g = new THREE.Group(); g.name = 'stenographer_desk';
  mesh('desk_top', B(1.2, 0.05, 0.62), mats.wood, g, 0, 0.75, 0);
  mesh('desk_top_edge', B(1.22, 0.02, 0.64), mats.trim, g, 0, 0.72, 0);
  mesh('modesty_panel', B(1.14, 0.62, 0.03), mats.wood, g, 0, 0.4, 0.28);
  [-1, 1].forEach(s => { mesh(s < 0 ? 'side_left' : 'side_right', B(0.04, 0.72, 0.6), mats.wood, g, s * 0.58, 0.36, 0); mesh('modesty_field_' + (s < 0 ? 'l' : 'r'), field(THREE, 0.44, 0.44), mats.trim, g, s * 0.26, 0.4, 0.296); });
  mesh('desk_plinth', B(1.18, 0.05, 0.6), mats.trim, g, 0, 0.025, 0);
  return { desk: g, materials: mats };
}

// Typewriter: origin base centre, keys toward -Z (typist), paper behind. `carriage` slides on X; `keys` is instanced.
export function buildTypewriter(THREE, opts = {}) {
  const mats = opts.materials || {
    body: new THREE.MeshStandardMaterial({ name: 'black_enamel', color: '#141210', roughness: 0.3, metalness: 0.2 }),
    chrome: new THREE.MeshStandardMaterial({ name: 'chrome', color: '#c9c6c0', roughness: 0.22, metalness: 0.9 }),
    key: new THREE.MeshStandardMaterial({ name: 'key_cap', color: '#ece3cf', roughness: 0.45 }),
    rubber: new THREE.MeshStandardMaterial({ name: 'rubber', color: '#0c0b0a', roughness: 0.8 }),
    paper: new THREE.MeshStandardMaterial({ name: 'paper', color: '#efe8d8', roughness: 0.9, side: THREE.DoubleSide })
  };
  const mesh = mk(THREE), B = (w, h, d) => new THREE.BoxGeometry(w, h, d), g = new THREE.Group(); g.name = 'stenographer_typewriter';
  mesh('tw_base', B(0.33, 0.04, 0.27), mats.body, g, 0, 0.02, 0);
  const prof = new THREE.Shape(); prof.moveTo(0.13, 0.04); prof.lineTo(0.13, 0.056); prof.lineTo(-0.02, 0.1); prof.lineTo(-0.1, 0.118); prof.lineTo(-0.1, 0.04); prof.closePath();
  const shell = new THREE.ExtrudeGeometry(prof, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2 }); shell.translate(0, 0, -0.15); shell.rotateY(Math.PI / 2);
  mesh('tw_body', shell, mats.body, g);
  mesh('tw_type_basket', new THREE.TorusGeometry(0.075, 0.007, 6, 24, Math.PI).rotateX(-Math.PI / 2), mats.chrome, g, 0, 0.11, 0.03);
  mesh('tw_space_bar', B(0.13, 0.006, 0.012), mats.chrome, g, 0, 0.05, -0.136);
  const kp = []; for (let r = 0; r < 4; r++) for (let c = 0; c < 11; c++) kp.push([(c - 5) * 0.024 + r * 0.006, 0.062 + r * 0.011, -0.118 + r * 0.024]);
  const keys = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.006, 14), mats.key, kp.length); keys.name = 'tw_keys'; keys.castShadow = true;
  const keyBase = kp.map(([x, y, z], i) => { const m = new THREE.Matrix4().makeTranslation(x, y, z); keys.setMatrixAt(i, m); return m; }); g.add(keys);
  const carriage = new THREE.Group(); carriage.name = 'tw_carriage'; carriage.position.set(0, 0.125, 0.06); g.add(carriage);
  const cm = (name, geo, mat, x, y, z) => mesh(name, geo, mat, carriage, x, y, z);
  cm('tw_carriage_rail', B(0.42, 0.012, 0.035), mats.chrome, 0, 0, 0);
  cm('tw_platen', new THREE.CylinderGeometry(0.022, 0.022, 0.34, 24).rotateZ(Math.PI / 2), mats.rubber, 0, 0.03, 0);
  const knob = new THREE.LatheGeometry([[0, 0], [0.018, 0], [0.022, 0.01], [0.02, 0.03], [0, 0.03]].map(([r, y]) => new THREE.Vector2(r, y)), 18);
  cm('tw_knob_left', knob.clone().rotateZ(Math.PI / 2), mats.rubber, -0.17, 0.03, 0); cm('tw_knob_right', knob.clone().rotateZ(-Math.PI / 2), mats.rubber, 0.17, 0.03, 0);
  cm('tw_return_lever', new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-0.19, 0.035, -0.01), new THREE.Vector3(-0.225, 0.05, -0.05), new THREE.Vector3(-0.235, 0.062, -0.09)]), 12, 0.004, 8), mats.chrome, 0, 0, 0);
  cm('tw_paper_bail', new THREE.CylinderGeometry(0.003, 0.003, 0.3, 8).rotateZ(Math.PI / 2), mats.chrome, 0, 0.052, -0.018);
  const pg = new THREE.PlaneGeometry(0.21, 0.24, 1, 10), pp = pg.attributes.position; for (let i = 0; i < pp.count; i++) { const t = pp.getY(i) / 0.24 + 0.5; pp.setY(i, t * 0.24); pp.setZ(i, 0.012 + t * t * 0.06); } pg.computeVertexNormals();
  const paper = cm('tw_paper', pg, mats.paper, 0, 0.045, 0); paper.castShadow = false;
  return { typewriter: g, carriage, keys, keyBase, paper, materials: mats };
}
