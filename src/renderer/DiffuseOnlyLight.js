// DiffuseOnlyLight — światło punktowe, które TYLKO barwi (rozproszenie), bez własnego odblasku (strojenie CS-6b, §3.7.1 pkt 3).
//
// Po co: dopełnienie światła gwiazdy (D-CS-21, ThreeRenderer._syncSharedFillLight) ma wyrównać BARWĘ światła na
// gazowcach, pierścieniach, statkach i stacjach do zmiękczonego odcienia wspólnego shadera. Jako zwykły PointLight
// dokładało też własny odblask (drugi, chłodny połysk w miejscu odblasku gwiazdy — biała plama na gazowcu pod gwiazdą
// M / K). three nie ma światła „tylko diffuse", a GasGiantShader zostaje nietknięty (D-CS-5), więc znacznik stoi w
// samym świetle: PointLight z `distance < 0` (DIFFUSE_ONLY_DISTANCE) — pętla świateł punktowych w chunku
// `lights_fragment_begin` po takim świetle przywraca `reflectedLight.directSpecular` sprzed jego wkładu.
//
// ⚠ `distance < 0` nie zmienia tłumienia: getDistanceAttenuation obcina tylko przy `cutoffDistance > 0`, a przy
//   decay = 0 spadek = 1 — światło świeci jak przy distance = 0.
// ⚠ Łatka jest tekstowa i MUSI stanąć przed pierwszą kompilacją programów (import modułu ThreeRenderer). Bez światła ze
//   znacznikiem wynik shadera jest identyczny (gałąź nigdy nie jest brana) — flaga OFF nie ma takiego światła.
// ⚠ Aktualizacja three: jeśli kotwice znikną, `patchDiffuseOnlyPointLights` zwraca false i NIE zmienia chunka
//   (dopełnienie wraca wtedy do odblasku — wołający ostrzega w konsoli). Moduł nie importuje three.

/** Znacznik światła „tylko rozproszenie": PointLight.distance. */
export const DIFFUSE_ONLY_DISTANCE = -1;

const ANCHOR_DECL = 'PointLight pointLight;';
const ANCHOR_LOOP = /(getPointLightInfo\( pointLight, geometryPosition, directLight \);[\s\S]*?)(RE_Direct\( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight \);)/;
const MARK = 'kosmosSpecKeep';

/** Czysta transformacja tekstu chunka; null, gdy kotwic brak (inna wersja three). Idempotentna. */
export function diffuseOnlyChunk(src) {
  if (typeof src !== 'string') return null;
  if (src.includes(MARK)) return src;
  if (src.split(ANCHOR_DECL).length !== 2 || !ANCHOR_LOOP.test(src)) return null;
  return src
    .replace(ANCHOR_DECL, ANCHOR_DECL + '\n\tvec3 ' + MARK + ';')
    .replace(ANCHOR_LOOP, (m, head, call) => head + MARK + ' = reflectedLight.directSpecular;\n\t\t' + call
      + '\n\t\tif ( pointLight.distance < 0.0 ) reflectedLight.directSpecular = ' + MARK + ';');
}

/**
 * Nałóż łatkę na `ShaderChunk.lights_fragment_begin` (obiekt three wstrzykiwany). Zwraca true, gdy chunk ma łatkę.
 */
export function patchDiffuseOnlyPointLights(ShaderChunk) {
  const out = diffuseOnlyChunk(ShaderChunk?.lights_fragment_begin);
  if (!out) return false;
  ShaderChunk.lights_fragment_begin = out;
  return true;
}
