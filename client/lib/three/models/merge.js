// Merge every static mesh under `root` into one mesh per material (fewer draw calls, same look).
// Only for parts that never move independently; keep animated pieces as separate groups.
export function mergeByMaterial(THREE, root, name) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), buckets = new Map();
  root.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material)) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    if (!buckets.has(o.material)) buckets.set(o.material, []);
    buckets.get(o.material).push({ g, cast: o.castShadow });
  });
  const out = new THREE.Group(); out.name = name || root.name;
  buckets.forEach((list, mat) => {
    let n = 0; list.forEach(({ g }) => (n += g.attributes.position.count));
    const geo = new THREE.BufferGeometry();
    ['position', 'normal', 'uv'].forEach(a => {
      if (!list.every(({ g }) => g.attributes[a])) return;
      const size = list[0].g.attributes[a].itemSize, arr = new Float32Array(n * size); let off = 0;
      list.forEach(({ g }) => { arr.set(g.attributes[a].array, off); off += g.attributes[a].array.length; });
      geo.setAttribute(a, new THREE.BufferAttribute(arr, size));
    });
    if (!geo.attributes.normal) geo.computeVertexNormals();
    geo.computeBoundingSphere(); geo.computeBoundingBox();
    const m = new THREE.Mesh(geo, mat); m.name = (out.name + '_' + (mat.name || 'part')); m.castShadow = list.some(x => x.cast); m.receiveShadow = true; out.add(m);
  });
  return out;
}
