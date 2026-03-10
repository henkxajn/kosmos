// Helper do uzyskania efektywnego planetType dla encji (planet, moon, planetoid)

/**
 * Zwraca planetType kompatybilny z PlanetMapGenerator/RegionSystem.
 * Moon i Planetoid nie mają planet.planetType — mapujemy ich typy.
 */
export function getEffectivePlanetType(entity) {
  if (entity.planetType) return entity.planetType;
  if (entity.type === 'moon')
    return entity.moonType === 'icy' ? 'ice' : 'rocky';
  if (entity.type === 'planetoid') return 'hot_rocky';
  return 'rocky';
}
