export function lerp(a, b, t) { return a + (b - a) * t; }
export function lerpVec3(a, b, t) {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
}
