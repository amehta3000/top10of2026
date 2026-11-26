// Fictional sample data for the landing preview and demo mode (generated covers).
export const DEMO_STORY = {
  name: 'demo',
  year: 2026,
  mode: 'picked',
  stats: null,
  tracks: [
    { title: 'Neon Tide', artist: 'Lumen Atlas', releaseDate: '2026-03-14' },
    { title: 'Concrete Bloom', artist: 'Sora Vale', releaseDate: '2026-05-02' },
    { title: 'Pacific Static', artist: 'The Night Grammar', releaseDate: '2026-01-23' },
    { title: 'Slow Motion Heat', artist: 'Kiri & The Low Hum', releaseDate: '2026-07-11' },
    { title: 'Afterglow Protocol', artist: 'Mira Okafor', releaseDate: '2026-02-06' },
    { title: 'Velvet Freeway', artist: 'Juno Park', releaseDate: '2026-06-20' },
    { title: 'Glass Ceiling, Open Sky', artist: 'Halcyon Drift', releaseDate: '2026-04-17' },
    { title: 'Midnight Is a Color', artist: 'Ozzie Reyes', releaseDate: '2026-08-29' },
    { title: 'Low Orbit', artist: 'Paper Satellites', releaseDate: '2026-09-05' },
    { title: 'Westside Ghosts', artist: 'Tamsin Rue', releaseDate: '2026-10-10' },
  ].map((t) => ({ ...t, imageUrl: null, id: '' })),
};
