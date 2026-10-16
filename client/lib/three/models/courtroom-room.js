// Courtroom architecture (Acts VIII–IX): walls, windows, coffered ceiling, bar rail + gate, aisle runner.
// Pure builders: pass THREE in. Walls face +Z with origin at floor centre; back runs to z = -T.
const DEF = {
  wood: ['walnut', { color: '#5b3520', roughness: 0.5 }], trim: ['walnut_dark', { color: '#3a2114', roughness: 0.55 }],
  plaster: ['plaster_cream', { color: '#d8ccb4', roughness: 0.95 }], glass: ['window_day', { color: '#f3e2c4', emissive: '#f6dcae', emissiveIntensity: 1.4 }],
  brass: ['brass', { color: '#b08a4a', metalness: 0.85, roughness: 0.35 }], carpet: ['aisle_carpet', { color: '#7a1c16', roughness: 0.95 }],
  binding: ['carpet_binding', { color: '#3a0f0c', roughness: 0.9 }]
};
const mats = (THREE, opts, keys) => { const given = opts.materials || {}, out = {}; keys.forEach(k => { out[k] = given[k] || new THREE.MeshStandardMaterial(Object.assign({ name: DEF[k][0] }, DEF[k][1])); }); return out; };
const uvM = (THREE, geo, k = 0.45) => { const p = geo.attributes.position, n = geo.attributes.normal, uv = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i++) { const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i)), x = p.getX(i), y = p.getY(i), z = p.getZ(i); const [u, v] = az >= ax && az >= ay ? [x, y] : ax >= ay ? [z, y] : [x, z]; uv[i * 2] = u * k; uv[i * 2 + 1] = v * k; } geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return geo; };
const rect = (THREE, x0, y0, x1, y1) => { const s = new THREE.Shape(); s.moveTo(x0, y0); s.lineTo(x1, y0); s.lineTo(x1, y1); s.lineTo(x0, y1); s.closePath(); return s; };
const kit = (THREE, g) => {
  let n = 0;
  const put = (name, geo, mat, x = 0, y = 0, z = 0, metric = true) => { geo.translate(x, y, z); if (metric) uvM(THREE, geo); const me = new THREE.Mesh(geo, mat); me.name = name + '_' + (++n); me.castShadow = me.receiveShadow = true; g.add(me); return me; };
  const B = (a, b, c) => new THREE.BoxGeometry(a, b, c);
  const bead = (len, r) => new THREE.CylinderGeometry(r, r, len, 10).rotateZ(Math.PI / 2);
  const raised = (fw, fh, d = 0.008) => { const geo = new THREE.ExtrudeGeometry(rect(THREE, -fw / 2, -fh / 2, fw / 2, fh / 2), { depth: d, bevelEnabled: true, bevelThickness: 0.014, bevelSize: 0.022, bevelSegments: 2 }); geo.translate(0, 0, 0.014); return geo; };
  return { put, B, bead, raised };
};

// Tall courtroom wall: panelled wainscot (skirting, one or more raised-field tiers, cap rail), plaster above,
// optional pilasters with plinth + capital, window openings (holes, plaster reveals) and a door opening from the floor,
// frieze + stepped cornice at the ceiling.
export function buildCourtWall(THREE, opts = {}) {
  const m = mats(THREE, opts, ['wood', 'trim', 'plaster']), g = new THREE.Group(); g.name = opts.name || 'courtroom_wall';
  const { put, B, bead, raised } = kit(THREE, g);
  const w = opts.w || 16, h = opts.h || 9, T = opts.back ?? 0.3, WT = opts.wains || 3, wins = opts.windows || [], door = opts.door, pil = opts.pilasters || [];
  const outline = new THREE.Shape(); outline.moveTo(-w / 2, 0);
  if (door) { outline.lineTo(door.x0, 0); outline.lineTo(door.x0, door.y1); outline.lineTo(door.x1, door.y1); outline.lineTo(door.x1, 0); }
  outline.lineTo(w / 2, 0); outline.lineTo(w / 2, h); outline.lineTo(-w / 2, h); outline.closePath();
  wins.forEach(o => outline.holes.push(rect(THREE, o.x - o.w / 2, o.y0, o.x + o.w / 2, o.y1)));
  put('wall_backing', new THREE.ExtrudeGeometry(outline, { depth: T, bevelEnabled: false }), m.plaster, 0, 0, -T);
  const cas = 0.18, gap = (a, b, y0) => { let iv = [[a, b]]; if (door && y0 < door.y1 + cas) { const c0 = door.x0 - cas, c1 = door.x1 + cas; iv = iv.flatMap(([p, q]) => (c1 <= p || c0 >= q ? [[p, q]] : [[p, c0], [c1, q]].filter(([u, v]) => v - u > 0.02))); } return iv; };
  const bands = (y0, y1) => gap(-w / 2, w / 2, y0, y1);
  const tier = (name, y0, y1, target) => bands(y0, y1).forEach(([a, b]) => {
    const len = b - a, mid = (y0 + y1) / 2, fh = y1 - y0 - 0.2; put(name + '_backer', B(len, y1 - y0, 0.008), m.wood, (a + b) / 2, mid, 0.004);
    if (len < 0.35) return;
    const k = Math.max(1, Math.round(len / target)), pw = len / k;
    put(name + '_rail', B(len, 0.1, 0.024), m.wood, (a + b) / 2, y0 + 0.05, 0.012); put(name + '_rail', B(len, 0.1, 0.024), m.wood, (a + b) / 2, y1 - 0.05, 0.012);
    for (let i = 0; i <= k; i++) put(name + '_stile', B(0.1, fh, 0.024), m.wood, Math.min(b - 0.05, Math.max(a + 0.05, a + i * pw)), mid, 0.012);
    for (let i = 0; i < k; i++) { const f0 = a + i * pw + (i === 0 ? 0.1 : 0.05), f1 = a + (i + 1) * pw - (i === k - 1 ? 0.1 : 0.05); put(name + '_field', raised(f1 - f0 - 0.06, fh - 0.06), m.wood, (f0 + f1) / 2, mid, 0); }
  });
  bands(0, 0.3).forEach(([a, b]) => { const L = b - a, x = (a + b) / 2; put('skirting', B(L, 0.28, 0.035), m.trim, x, 0.14, 0.0175); put('skirting_bead', bead(L, 0.014), m.trim, x, 0.285, 0.03); });
  tier('dado_lower', 0.3, 1.05, 0.9);
  const upH = WT - 0.25 - 1.15, nT = Math.max(1, Math.ceil(upH / 1.8)), th = upH / nT;
  bands(1.05, 1.15).forEach(([a, b]) => put('mid_rail', B(b - a, 0.1, 0.04), m.trim, (a + b) / 2, 1.1, 0.02));
  for (let i = 0; i < nT; i++) { tier('dado_upper', 1.15 + i * th, 1.15 + (i + 1) * th, 1.0); if (i < nT - 1) bands(1.15 + (i + 1) * th - 0.03, 1.15 + (i + 1) * th + 0.03).forEach(([a, b]) => put('tier_rail', B(b - a, 0.06, 0.035), m.trim, (a + b) / 2, 1.15 + (i + 1) * th, 0.0175)); }
  bands(WT - 0.25, WT).forEach(([a, b]) => { const L = b - a, x = (a + b) / 2; put('cap_frieze', B(L, 0.16, 0.03), m.wood, x, WT - 0.17, 0.015); put('cap_bead', bead(L, 0.018), m.trim, x, WT - 0.075, 0.035); put('cap_rail', B(L + 0.02, 0.06, 0.08), m.trim, x, WT - 0.03, 0.04); });
  if (door) {
    const { x0, x1, y1 } = door; [x0 - cas / 2, x1 + cas / 2].forEach(x => { put('door_casing', B(cas, y1 + cas, 0.05), m.trim, x, (y1 + cas) / 2, 0.025); put('door_plinth_block', B(cas + 0.03, 0.34, 0.07), m.trim, x, 0.17, 0.035); });
    put('door_casing_head', B(x1 - x0 + cas * 2, cas, 0.05), m.trim, (x0 + x1) / 2, y1 + cas / 2, 0.025);
    put('door_head_frieze', B(x1 - x0 + cas * 2 + 0.06, 0.3, 0.035), m.wood, (x0 + x1) / 2, y1 + cas + 0.15, 0.0175);
    put('door_head_cap', B(x1 - x0 + cas * 2 + 0.2, 0.08, 0.14), m.trim, (x0 + x1) / 2, y1 + cas + 0.34, 0.07);
    [x0 + 0.015, x1 - 0.015].forEach(x => put('door_jamb', B(0.03, y1, T), m.wood, x, y1 / 2, -T / 2));
    put('door_soffit', B(x1 - x0, 0.03, T), m.wood, (x0 + x1) / 2, y1 - 0.015, -T / 2);
  }
  const top = h - 0.9;
  pil.forEach(x => {
    put('pilaster_plinth', B(0.64, 0.42, 0.2), m.trim, x, 0.21, 0.1); put('pilaster_plinth_cap', B(0.6, 0.06, 0.18), m.trim, x, 0.45, 0.09);
    const sh = top - 0.48 - 0.42, sy = 0.48 + sh / 2;
    [-1, 1].forEach(s => put('pilaster_shaft', B(0.11, sh, 0.15), m.wood, x + s * 0.2, sy, 0.075));
    put('pilaster_sunk_panel', B(0.3, sh - 0.3, 0.11), m.trim, x, sy, 0.055); put('pilaster_shaft_back', B(0.3, sh, 0.1), m.wood, x, sy, 0.05);
    put('pilaster_astragal', B(0.56, 0.05, 0.17), m.trim, x, top - 0.395, 0.085); put('pilaster_neck', B(0.5, 0.24, 0.15), m.wood, x, top - 0.25, 0.075);
    put('pilaster_echinus', B(0.6, 0.06, 0.2), m.trim, x, top - 0.1, 0.1); put('pilaster_abacus', B(0.68, 0.07, 0.23), m.trim, x, top - 0.035, 0.115);
  });
  put('frieze', B(w, 0.4, 0.03), m.wood, 0, top + 0.2, 0.015); put('architrave', B(w, 0.08, 0.06), m.trim, 0, top + 0.04, 0.03);
  put('bed_mould', B(w, 0.1, 0.1), m.trim, 0, top + 0.45, 0.05); put('cornice_cove', bead(w, 0.09), m.trim, 0, top + 0.58, 0.12);
  put('cornice_corona', B(w, 0.2, 0.26), m.trim, 0, top + 0.72, 0.13); put('cornice_cap', B(w, 0.08, 0.2), m.wood, 0, top + 0.86, 0.1);
  return { wall: g, materials: m };
}

// Tall sash window set into a wall reveal: moulded casing, stool + apron, sash frame with centre mullion,
// meeting rail and transom, glowing daylight glass. Origin at the opening centre on the wall face; glass at z = -glassZ.
export function buildCourtWindow(THREE, opts = {}) {
  const m = mats(THREE, opts, ['wood', 'trim', 'glass']), g = new THREE.Group(); g.name = 'courtroom_window';
  const { put, B, bead } = kit(THREE, g);
  const w = opts.w || 1.8, h = opts.h || 4.4, gz = opts.glassZ || 0.2, c = 0.14, fw = 0.09;
  [-1, 1].forEach(s => put('casing_jamb', B(c, h + c, 0.045), m.trim, s * (w / 2 + c / 2), c / 2, 0.0225));
  put('casing_head', B(w + c * 2, c, 0.045), m.trim, 0, h / 2 + c / 2, 0.0225); put('casing_cap', B(w + c * 2 + 0.1, 0.06, 0.1), m.trim, 0, h / 2 + c + 0.03, 0.05);
  put('stool', B(w + 0.36, 0.06, gz + 0.16), m.wood, 0, -h / 2 - 0.03, (0.16 - gz) / 2); put('stool_nose', bead(w + 0.36, 0.03), m.wood, 0, -h / 2 - 0.03, 0.16);
  put('apron', B(w + c * 2, 0.22, 0.035), m.trim, 0, -h / 2 - 0.17, 0.0175);
  const fz = -gz + 0.02;
  [-1, 1].forEach(s => put('sash_stile', B(fw, h, 0.08), m.wood, s * (w / 2 - fw / 2), 0, fz));
  put('sash_head', B(w, fw, 0.08), m.wood, 0, h / 2 - fw / 2, fz); put('sash_bottom', B(w, fw * 1.4, 0.08), m.wood, 0, -h / 2 + fw * 0.7, fz);
  put('mullion', B(0.06, h - fw * 2, 0.07), m.wood, 0, 0, fz);
  put('meeting_rail', B(w - fw * 2, 0.07, 0.08), m.wood, 0, -h * 0.02, fz); put('transom', B(w - fw * 2, 0.07, 0.08), m.wood, 0, h * 0.3, fz);
  [-h * 0.26, h * 0.14].forEach(y => put('glazing_bar', B(w - fw * 2, 0.035, 0.05), m.wood, 0, y, fz));
  const gl = put('glass', B(w - 0.02, h - 0.02, 0.01), m.glass, 0, 0, -gz); gl.castShadow = false;
  return { window: g, materials: m };
}

// Coffered ceiling: plaster soffit, deep main beams along Z, shallower cross beams along X, bed mouldings, raised coffer panels.
// Origin at the ceiling centre, y = h is the soffit. xs / zs are beam centre lines; the grid stops at ±w/2, ±d/2.
export function buildCourtCeiling(THREE, opts = {}) {
  const m = mats(THREE, opts, ['wood', 'trim']), g = new THREE.Group(); g.name = 'courtroom_ceiling';
  const { put, B } = kit(THREE, g);
  const w = opts.w || 15.4, d = opts.d || 22.4, h = opts.h || 9, xs = opts.xs || [-6, -3, 0, 3, 6], zs = opts.zs || [-9, -6, -3, 0, 3, 6, 9];
  put('soffit', B(w + 0.6, 0.06, d + 0.6), m.trim, 0, h + 0.03, 0);
  xs.forEach(x => { put('main_beam', B(0.3, 0.46, d), m.wood, x, h - 0.23, 0); [-1, 1].forEach(s => put('beam_bed_mould', B(0.05, 0.06, d), m.trim, x + s * 0.175, h - 0.03, 0)); put('beam_soffit_fillet', B(0.34, 0.04, d), m.trim, x, h - 0.44, 0); });
  zs.forEach(z => { put('cross_beam', B(w, 0.34, 0.24), m.wood, 0, h - 0.17, z); [-1, 1].forEach(s => put('cross_bed_mould', B(w, 0.05, 0.04), m.trim, 0, h - 0.025, z + s * 0.14)); });
  const X = [-w / 2, ...xs, w / 2], Z = [-d / 2, ...zs, d / 2];
  for (let i = 0; i < X.length - 1; i++) for (let j = 0; j < Z.length - 1; j++) {
    const cw = X[i + 1] - X[i] - (i === 0 || i === X.length - 2 ? 0.55 : 0.7), cd = Z[j + 1] - Z[j] - (j === 0 || j === Z.length - 2 ? 0.55 : 0.7);
    if (cw < 0.3 || cd < 0.3) continue;
    const cx = (X[i] + X[i + 1]) / 2, cz = (Z[j] + Z[j + 1]) / 2;
    put('coffer_frame', B(cw + 0.12, 0.03, cd + 0.12), m.wood, cx, h - 0.015, cz); put('coffer_panel', B(cw - 0.2, 0.04, cd - 0.2), m.wood, cx, h - 0.05, cz);
  }
  return { ceiling: g, materials: m };
}

// Bar rail section between two newel posts (centres at x = ±L/2): plinth + shoe, turned balusters, sub-rail,
// moulded handrail (top y 1.04), newels with cap and ball finial. Origin floor centre.
export function buildBarRail(THREE, opts = {}) {
  const m = mats(THREE, opts, ['wood', 'trim']), g = new THREE.Group(); g.name = 'bar_rail';
  const { put, B } = kit(THREE, g);
  const L = opts.L || 6, run = L - 0.14;
  put('plinth', B(run, 0.1, 0.12), m.trim, 0, 0.05, 0); put('shoe', B(run, 0.03, 0.08), m.wood, 0, 0.115, 0);
  put('sub_rail', B(run, 0.04, 0.08), m.wood, 0, 0.94, 0);
  const prof = new THREE.Shape(); prof.moveTo(-0.065, 0); prof.lineTo(0.065, 0); prof.lineTo(0.065, 0.03); prof.quadraticCurveTo(0.065, 0.08, 0, 0.08); prof.quadraticCurveTo(-0.065, 0.08, -0.065, 0.03); prof.closePath();
  const hr = new THREE.ExtrudeGeometry(prof, { depth: run, bevelEnabled: false, curveSegments: 6 }); hr.translate(0, 0, -run / 2); hr.rotateY(Math.PI / 2); put('handrail', hr, m.wood, 0, 0.96, 0);
  const H = 0.81, pts = [[0.026, 0], [0.026, 0.07], [0.017, 0.09], [0.021, 0.12], [0.015, 0.16], [0.03, 0.3], [0.032, 0.36], [0.019, 0.5], [0.014, 0.61], [0.02, 0.66], [0.015, 0.7], [0.024, 0.73], [0.024, H]];
  const balG = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 10);
  const k = Math.round((run - 0.1) / 0.18);
  for (let i = 0; i <= k; i++) put('baluster', balG.clone(), m.wood, -(run - 0.1) / 2 + (i * (run - 0.1)) / k, 0.13, 0, false);
  [-1, 1].forEach(s => {
    const x = s * L / 2; put('newel_base', B(0.18, 0.2, 0.18), m.trim, x, 0.1, 0); put('newel_post', B(0.14, 0.95, 0.14), m.wood, x, 0.675, 0);
    put('newel_cap', B(0.2, 0.05, 0.2), m.trim, x, 1.175, 0); put('newel_cap_top', B(0.16, 0.04, 0.16), m.trim, x, 1.22, 0);
    put('newel_finial_neck', new THREE.CylinderGeometry(0.025, 0.04, 0.04, 12), m.trim, x, 1.26, 0, false); put('newel_finial', new THREE.SphereGeometry(0.055, 14, 10), m.trim, x, 1.33, 0, false);
  });
  return { rail: g, materials: m };
}

// Swinging bar gate leaf: stiles, raised lower panel, short spindles, moulded cap rail, brass hinges.
// Origin at the hinge (x = 0, floor); leaf extends to +x by w.
export function buildBarGate(THREE, opts = {}) {
  const m = mats(THREE, opts, ['wood', 'trim', 'brass']), g = new THREE.Group(); g.name = 'bar_gate_leaf';
  const { put, B, raised } = kit(THREE, g);
  const w = opts.w || 0.9, t = 0.05;
  [0.035, w - 0.035].forEach(x => put('stile', B(0.07, 0.9, t), m.wood, x, 0.5, 0));
  put('bottom_rail', B(w - 0.14, 0.12, t), m.wood, w / 2, 0.11, 0); put('lock_rail', B(w - 0.14, 0.07, t), m.wood, w / 2, 0.52, 0); put('top_rail', B(w - 0.14, 0.05, t), m.wood, w / 2, 0.925, 0);
  put('panel_board', B(w - 0.14, 0.32, 0.016), m.wood, w / 2, 0.33, 0);
  [1, -1].forEach(s => { const p = raised(w - 0.24, 0.24, 0.004).scale(1, 1, 0.5); if (s < 0) p.rotateY(Math.PI); put('panel_field', p, m.wood, w / 2, 0.33, s * 0.008); });
  const sp = new THREE.LatheGeometry([[0.016, 0], [0.016, 0.04], [0.011, 0.06], [0.02, 0.17], [0.012, 0.3], [0.016, 0.33], [0.016, 0.37]].map(([r, y]) => new THREE.Vector2(r, y)), 8);
  const n = 5; for (let i = 0; i < n; i++) put('spindle', sp.clone(), m.wood, 0.07 + ((w - 0.14) * (i + 0.5)) / n, 0.555, 0, false);
  put('cap_rail', B(w, 0.05, 0.1), m.wood, w / 2, 0.975, 0); put('cap_bead', new THREE.CylinderGeometry(0.02, 0.02, w, 10).rotateZ(Math.PI / 2), m.trim, w / 2, 1.0, 0);
  [0.22, 0.8].forEach(y => { put('hinge_knuckle', new THREE.CylinderGeometry(0.014, 0.014, 0.1, 12), m.brass, -0.005, y, 0, false); put('hinge_leaf', B(0.06, 0.08, 0.004), m.brass, 0.03, y, t / 2 + 0.002); });
  put('push_plate', B(0.07, 0.16, 0.004), m.brass, w - 0.08, 0.76, t / 2 + 0.002);
  return { gate: g, materials: m };
}

// Aisle runner: pile slab (the `carpet` material carries the pattern, UVs span 0–1), bound long edges, brass end rods.
export function buildAisleRunner(THREE, opts = {}) {
  const m = mats(THREE, opts, ['carpet', 'binding', 'brass']), g = new THREE.Group(); g.name = 'aisle_runner';
  const { put, B } = kit(THREE, g);
  const w = opts.w || 1.6, d = opts.d || 9.2;
  const pile = put('pile', B(w - 0.06, 0.012, d), m.carpet, 0, 0.006, 0, false); pile.castShadow = false;
  [-1, 1].forEach(s => put('binding', new THREE.CylinderGeometry(0.012, 0.012, d, 8).rotateX(Math.PI / 2).scale(1.3, 1, 1), m.binding, s * (w / 2 - 0.02), 0.009, 0));
  [-1, 1].forEach(s => { put('end_rod', new THREE.CylinderGeometry(0.01, 0.01, w + 0.04, 12).rotateZ(Math.PI / 2), m.brass, 0, 0.016, s * (d / 2 - 0.03), false); [-1, 1].forEach(q => put('rod_eye', new THREE.SphereGeometry(0.016, 10, 8), m.brass, q * (w / 2 + 0.03), 0.016, s * (d / 2 - 0.03), false)); });
  return { runner: g, materials: m };
}
