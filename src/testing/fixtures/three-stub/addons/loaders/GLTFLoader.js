// STUB — patrz ../../index.js. Wystawiony, bo GlbSnapshotRenderer i ThreeRenderer
// importuja ten symbol na poziomie modulu. Nigdy nie uzywany w testach headless.
export class GLTFLoader {
  load()  { throw new Error('[three-stub] GLTFLoader.load nie dziala w headless'); }
  parse() { throw new Error('[three-stub] GLTFLoader.parse nie dziala w headless'); }
}
