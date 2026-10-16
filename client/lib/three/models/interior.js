// Office interior walls (Acts II–V). Pure builder: pass THREE in.
// Panelled wall: skirting with bead, raised-field dado, chair rail, then either raised-field upper panelling + frieze
// ('panels') or bare plaster with a picture rail ('plaster'), and a stepped crown cornice. Openings run from the floor
// and get a moulded casing. Origin at floor centre, face on z = 0 facing +Z; the backing runs back to z = -back.
const DEF = {
  wood: ['walnut', { color: '#5b3520', roughness: 0.5 }], trim: ['walnut_dark', { color: '#3a2114', roughness: 0.55 }],
  plaster: ['plaster_red', { color: '#4a1f1a', roughness: 0.95 }]
};
const uvM = (THREE, geo, k) => { const p = geo.attributes.position, n = geo.attributes.normal, uv = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i++) { const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i)), x = p.getX(i), y = p.getY(i), z = p.getZ(i); const [u, v] = az >= ax && az >= ay ? [x, y] : ax >= ay ? [z, y] : [x, z]; uv[i * 2] = u * k; uv[i * 2 + 1] = v * k; } geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return geo; };
const rect = (THREE, w, h) => { const s = new THREE.Shape(); s.moveTo(-w / 2, -h / 2); s.lineTo(w / 2, -h / 2); s.lineTo(w / 2, h / 2); s.lineTo(-w / 2, h / 2); s.closePath(); return s; };

export function buildPanelledWall(THREE, opts = {}) {
  const given = opts.materials || {}, m = {}; ['wood', 'trim', 'plaster'].forEach(k => { m[k] = given[k] || new THREE.MeshStandardMaterial(Object.assign({ name: DEF[k][0] }, DEF[k][1])); });
  const w = opts.w || 9, h = opts.h || 4.2, T = opts.back ?? 0.3, upper = opts.upper || 'panels', ops = (opts.openings || []).slice().sort((a, b) => a.x0 - b.x0), casing = opts.casing !== false ? 0.14 : 0;
  const g = new THREE.Group(); g.name = opts.name || 'panelled_wall';
  let n = 0; const put = (name, geo, mat, x, y, z) => { geo.translate(x, y, z); uvM(THREE, geo, 0.45); const me = new THREE.Mesh(geo, mat); me.name = name + '_' + (++n); me.castShadow = me.receiveShadow = true; g.add(me); return me; };
  const B = (a, b, c) => new THREE.BoxGeometry(a, b, c);
  const bead = (len, r) => new THREE.CylinderGeometry(r, r, len, 10).rotateZ(Math.PI / 2);
  const raised = (fw, fh) => { const geo = new THREE.ExtrudeGeometry(rect(THREE, fw, fh), { depth: 0.008, bevelEnabled: true, bevelThickness: 0.014, bevelSize: 0.022, bevelSegments: 2 }); geo.translate(0, 0, 0.014); return geo; };
  const bands = (y0) => { let iv = [[-w / 2, w / 2]]; ops.forEach(o => { if (y0 >= o.y1 + casing) return; const a = o.x0 - casing, b = o.x1 + casing; iv = iv.flatMap(([p, q]) => (b <= p || a >= q ? [[p, q]] : [[p, a], [b, q]].filter(([u, v]) => v - u > 0.02))); }); return iv; };

  const back = new THREE.Shape(); back.moveTo(-w / 2, 0); ops.forEach(o => { back.lineTo(o.x0, 0); back.lineTo(o.x0, o.y1); back.lineTo(o.x1, o.y1); back.lineTo(o.x1, 0); }); back.lineTo(w / 2, 0); back.lineTo(w / 2, h); back.lineTo(-w / 2, h); back.closePath();
  put('wall_backing', new THREE.ExtrudeGeometry(back, { depth: T, bevelEnabled: false }), upper === 'plaster' ? m.plaster : m.wood, 0, 0, -T);

  const panelBand = (name, y0, y1, target) => bands(y0, y1).forEach(([a, b]) => {
    const len = b - a, mid = (y0 + y1) / 2, fh = y1 - y0 - 0.2;
    if (len < 0.3) { put(name + '_board', B(len, y1 - y0, 0.02), m.wood, (a + b) / 2, mid, 0.01); return; }
    const k = Math.max(1, Math.round(len / target)), pw = len / k;
    put(name + '_rail_bottom', B(len, 0.1, 0.022), m.wood, (a + b) / 2, y0 + 0.05, 0.011);
    put(name + '_rail_top', B(len, 0.1, 0.022), m.wood, (a + b) / 2, y1 - 0.05, 0.011);
    for (let i = 0; i <= k; i++) put(name + '_stile', B(0.1, fh, 0.022), m.wood, Math.min(b - 0.05, Math.max(a + 0.05, a + i * pw)), mid, 0.011);
    for (let i = 0; i < k; i++) { const f0 = a + i * pw + (i === 0 ? 0.1 : 0.05), f1 = a + (i + 1) * pw - (i === k - 1 ? 0.1 : 0.05); put(name + '_field', raised(f1 - f0 - 0.06, fh - 0.06), m.wood, (f0 + f1) / 2, mid, 0); }
  });

  bands(0, 0.24).forEach(([a, b]) => { const L = b - a, x = (a + b) / 2; put('skirting', B(L, 0.22, 0.03), m.trim, x, 0.11, 0.015); put('skirting_bead', bead(L, 0.012), m.trim, x, 0.225, 0.026); });
  panelBand('dado', 0.24, 0.98, 0.8);
  bands(0.98, 1.1).forEach(([a, b]) => { const L = b - a, x = (a + b) / 2; put('chair_rail', B(L, 0.08, 0.05), m.trim, x, 1.02, 0.025); put('chair_rail_bead', bead(L, 0.022), m.trim, x, 1.075, 0.035); });
  if (upper === 'panels') { panelBand('upper', 1.1, 3.25, 0.95); bands(3.35, h - 0.3).forEach(([a, b]) => put('frieze_board', B(b - a, h - 0.3 - 3.35, 0.016), m.wood, (a + b) / 2, (3.35 + h - 0.3) / 2, 0.008)); }
  bands(3.25, 3.35).forEach(([a, b]) => { const L = b - a, x = (a + b) / 2; put('picture_rail', B(L, 0.08, 0.035), m.trim, x, 3.3, 0.0175); put('picture_rail_bead', bead(L, 0.014), m.trim, x, 3.33, 0.03); });
  bands(h - 0.3, h).forEach(([a, b]) => { const L = b - a, x = (a + b) / 2; put('crown_fascia', B(L, 0.1, 0.04), m.trim, x, h - 0.25, 0.02); put('crown_cove', bead(L, 0.05), m.trim, x, h - 0.15, 0.04); put('crown_corona', B(L, 0.1, 0.13), m.trim, x, h - 0.05, 0.065); });
  if (casing) ops.forEach(o => {
    [o.x0 - casing / 2, o.x1 + casing / 2].forEach(x => { put('casing_jamb', B(casing, o.y1 + casing, 0.04), m.trim, x, (o.y1 + casing) / 2, 0.02); put('casing_plinth_block', B(casing + 0.02, 0.26, 0.05), m.trim, x, 0.13, 0.025); });
    put('casing_head', B(o.x1 - o.x0 + casing * 2, casing, 0.04), m.trim, (o.x0 + o.x1) / 2, o.y1 + casing / 2, 0.02);
    put('casing_cap', B(o.x1 - o.x0 + casing * 2 + 0.08, 0.05, 0.07), m.trim, (o.x0 + o.x1) / 2, o.y1 + casing + 0.025, 0.035);
  });
  return { wall: g, materials: m };
}
