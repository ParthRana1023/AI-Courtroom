// Courtroom gavel + sound block. Pure builder: pass in THREE (any r150+), get named groups back.
// Gavel frame: grip at origin, handle runs +Z (0 → 0.255 m), head centred at z 0.265 with its axis on X.
// Block frame: base on y = 0, striking face at y ≈ 0.041.
export function buildGavel(THREE, opts = {}) {
  const seg = opts.segments || 48;
  const mats = opts.materials || {
    walnut: new THREE.MeshStandardMaterial({ name: 'walnut', color: '#5b3520', roughness: 0.42, metalness: 0 }),
    walnutDark: new THREE.MeshStandardMaterial({ name: 'walnut_dark', color: '#3a2114', roughness: 0.5, metalness: 0 }),
    brass: new THREE.MeshStandardMaterial({ name: 'brass', color: '#d6ad5c', roughness: 0.32, metalness: 0.4 }),
    felt: new THREE.MeshStandardMaterial({ name: 'felt', color: '#2a3a2c', roughness: 1, metalness: 0 })
  };
  const P = a => a.map(([r, y]) => new THREE.Vector2(r, y));
  const mesh = (name, geo, mat) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.castShadow = true; m.receiveShadow = true; return m; };

  // handle: turned profile, butt knob → grip rings → taper → collar
  const handleProfile = P([
    [0, 0], [0.008, 0], [0.012, 0.003], [0.0145, 0.009], [0.0145, 0.014], [0.0125, 0.021], [0.0102, 0.026], [0.0102, 0.029],
    [0.0124, 0.034], [0.0124, 0.046], [0.0116, 0.048], [0.0124, 0.05], [0.0124, 0.058], [0.0116, 0.06], [0.0124, 0.062],
    [0.0124, 0.07], [0.0116, 0.072], [0.0124, 0.074], [0.0124, 0.11], [0.0112, 0.15], [0.0094, 0.2], [0.0086, 0.222],
    [0.0112, 0.226], [0.0112, 0.233], [0.0082, 0.237], [0.0082, 0.255], [0, 0.255]
  ]);
  const handleGeo = new THREE.LatheGeometry(handleProfile, seg); handleGeo.rotateX(Math.PI / 2);

  // head: barrel with domed striking faces and a scored groove near each end
  const half = [[0, 0.0612], [0.012, 0.0606], [0.021, 0.0594], [0.0252, 0.0578], [0.0262, 0.0555], [0.0262, 0.052],
    [0.0236, 0.0505], [0.0236, 0.0455], [0.0272, 0.044], [0.0296, 0.034], [0.031, 0.018], [0.0314, 0]];
  const headProfile = P([...half.map(([r, y]) => [r, -y]), ...half.slice(0, -1).reverse().map(([r, y]) => [r, y])]);
  const headGeo = new THREE.LatheGeometry(headProfile, seg); headGeo.rotateZ(-Math.PI / 2);

  const gavel = new THREE.Group(); gavel.name = 'courtroom_gavel';
  gavel.add(mesh('gavel_handle', handleGeo, mats.walnut));
  const head = mesh('gavel_head', headGeo, mats.walnut); head.position.z = 0.265; gavel.add(head);
  [-1, 1].forEach((s, i) => {
    const ring = mesh(i ? 'gavel_band_right' : 'gavel_band_left', new THREE.TorusGeometry(0.0238, 0.0021, 12, seg), mats.brass);
    ring.rotation.y = Math.PI / 2; ring.position.set(s * 0.048, 0, 0.265); gavel.add(ring);
  });
  const collar = mesh('gavel_collar', new THREE.TorusGeometry(0.0106, 0.0016, 10, seg), mats.brass); collar.position.z = 0.2295; gavel.add(collar);

  // sound block: ogee-edged round block, felt underside, brass inlay on the face
  const blockProfile = P([
    [0, 0.0015], [0.078, 0.0015], [0.0805, 0.0035], [0.0805, 0.012], [0.0775, 0.0155], [0.0735, 0.018], [0.0725, 0.021],
    [0.0745, 0.025], [0.0752, 0.031], [0.0728, 0.036], [0.068, 0.0395], [0.064, 0.041], [0, 0.041]
  ]);
  const block = new THREE.Group(); block.name = 'sound_block';
  block.add(mesh('block_body', new THREE.LatheGeometry(blockProfile, seg), mats.walnutDark));
  const felt = mesh('block_felt', new THREE.CylinderGeometry(0.076, 0.076, 0.0015, seg), mats.felt); felt.position.y = 0.00075; block.add(felt);
  const inlay = mesh('block_inlay', new THREE.TorusGeometry(0.05, 0.0014, 8, seg * 2), mats.brass); inlay.rotation.x = Math.PI / 2; inlay.position.y = 0.0408; block.add(inlay);
  const inlay2 = mesh('block_inlay_inner', new THREE.TorusGeometry(0.046, 0.0007, 6, seg * 2), mats.brass); inlay2.rotation.x = Math.PI / 2; inlay2.position.y = 0.041; block.add(inlay2);

  return { gavel, block, materials: mats };
}
