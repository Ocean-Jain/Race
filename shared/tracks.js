const TAU = Math.PI * 2;

// TiltRace uses one shared infinity-shaped circuit. The route follows a
// lemniscate; its center crossing is elevated as a bridge in the 3D scene.
export const TRACKS = [
  {
    id: 'infinity',
    name: 'Infinity Circuit',
    fullName: 'TiltRace Infinity Circuit',
    country: 'TILT RACE',
    flag: '∞',
    bridge: true,
    bridgeAt: 0,
    underpassAt: Math.PI,
    mapPath: 'M 110 50 C 91 20 53 20 36 42 C 19 64 43 82 66 70 C 82 62 97 43 110 50 C 123 57 138 76 155 70 C 178 62 201 42 184 24 C 167 6 129 20 110 50',
  },
];

// Sample the single infinity loop in world units. The start/finish position
// is t=-PI/2 and the overpass crossing is t=0.
export function sampleTrack(_trackId, t) {
  return { x: 340 * Math.sin(t), z: 210 * Math.sin(2 * t) };
}
