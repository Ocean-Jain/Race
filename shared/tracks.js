// Preview SVGs are authored as fixed path strings, independently of the
// gameplay centerlines. This prevents preview rendering from depending on
// runtime path generation or route sampling.
const MAP_WIDTH = 220;
const MAP_HEIGHT = 100;
const WORLD_X = 4;
const WORLD_Z = 4.235;
const TAU = Math.PI * 2;

const circuit = (metadata, centerline, options = {}) => {
  const points = centerline.map(([x, y]) => [(x - MAP_WIDTH / 2) * WORLD_X, (y - MAP_HEIGHT / 2) * WORLD_Z]);
  const cumulativeLength = [0];
  for (let i = 1; i < points.length; i++) cumulativeLength.push(cumulativeLength[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  const length = cumulativeLength.at(-1) + Math.hypot(points[0][0] - points.at(-1)[0], points[0][1] - points.at(-1)[1]);
  const atIndex = index => (cumulativeLength[index] / length) * TAU - Math.PI / 2;
  return {
    ...metadata, centerline, points, cumulativeLength, routeLength: length,
    bridge: !!options.bridge,
    bridgeAt: options.bridgeAtIndex == null ? (options.bridgeAt ?? 0) : atIndex(options.bridgeAtIndex),
    underpassAt: options.underpassAtIndex == null ? (options.underpassAt ?? Math.PI) : atIndex(options.underpassAtIndex),
  };
};

// Points follow the official F1 circuit diagrams in race direction. Extra
// anchors preserve each track's defining corners when Catmull-Rom smoothed.
export const TRACKS = [
  circuit({
    id: 'silverstone', name: 'Silverstone', fullName: 'Silverstone Circuit', country: 'United Kingdom', flag: '🇬🇧',
    length: '5.891 km', corners: '18 corners', source: 'https://www.formula1.com/en/latest/article/circuit-guide-everything-you-need-to-know-about-silverstone-2026.5Sl0O8g393enBWVIkjRzOr.5Sl0O8g393enBWVIkjRzOr',
    mapPath: 'M 24 68 L 42 68 Q 50 68 55 64 L 66 55 Q 71 51 77 54 L 88 60 Q 94 63 101 59 L 112 51 Q 118 47 124 53 L 133 61 Q 139 66 146 60 L 153 53 Q 159 47 166 52 L 176 59 Q 182 63 187 58 L 196 48 Q 201 42 195 36 L 186 27 Q 181 22 175 27 L 166 35 Q 160 40 154 35 L 143 25 Q 137 19 130 25 L 121 34 Q 115 40 108 35 L 97 27 Q 90 22 84 29 L 76 38 Q 70 45 63 40 L 55 34 Q 50 30 46 36 L 39 47 Q 34 54 28 52 Z',
  }, [
    [25,69],[43,69],[62,69],[78,69],[87,67], // Hamilton Straight, Abbey
    [91,63],[88,59],[82,56],[78,52],[79,48],[84,45],[92,44],[101,47], // Farm/Village/Loop
    [109,51],[116,54],[123,53],[130,49],[135,43],[140,37],[146,34], // Aintree/Wellington/Brooklands
    [152,36],[155,41],[153,46],[150,51],[152,55],[160,58],[171,58], // Luffield/Woodcote
    [182,55],[191,51],[197,46],[199,40],[196,34],[190,29],[185,25], // Copse, Maggotts/Becketts
    [188,21],[195,22],[202,27],[206,34],[206,41],[203,48],[199,54], // Chapel/Hangar straight
    [198,60],[202,66],[200,71],[192,75],[183,74],[174,70],[164,67], // Stowe/Vale/Club
    [153,68],[142,71],[130,74],[117,75],[104,74],[91,72],[78,71],[64,70],[48,70],[34,71],[20,70],[20,66],
  ]),
  circuit({
    id: 'monza', name: 'Monza', fullName: 'Autodromo Nazionale Monza', country: 'Italy', flag: '🇮🇹',
    length: '5.793 km', corners: '11 corners', source: 'https://www.formula1.com/en/information/italy-autodromo-nazionalemonza.FiJN1jnQlRLeHqOxIt13m',
    mapPath: 'M 28 68 L 48 68 L 68 68 L 89 68 L 111 68 L 133 68 L 155 68 L 176 68 L 190 68 L 197 64 L 194 59 L 185 58 L 181 62 L 188 65 L 182 67 Q 178 66 177 61 Q 176 56 181 52 Q 187 47 190 41 Q 193 35 188 30 Q 182 25 174 28 Q 167 31 163 36 L 169 39 L 178 34 L 183 39 Q 184 45 178 50 Q 172 55 164 55 L 146 54 L 135 52 Q 129 50 126 45 L 119 39 L 111 39 L 103 42 L 98 47 L 103 51 L 113 48 L 119 52 L 115 57 Q 108 61 100 61 L 84 59 L 75 55 L 70 49 L 66 43 L 60 42 L 55 47 L 60 52 L 68 54 L 64 60 L 57 66 L 45 67 L 33 65 Z',
  }, [
    [42,72],[63,72],[85,72],[108,72],[132,72],[155,72],[176,72],[187,70], // pit straight
    [194,67],[196,63],[193,60],[188,61],[187,65],[190,68],[184,69], // Rettifilo chicanes
    [178,67],[176,62],[180,57],[186,52],[190,46],[191,40],[188,34], // Curva Grande
    [183,29],[175,27],[166,28],[157,31],[154,35],[157,39],[163,39], // Roggia chicane
    [166,35],[171,32],[176,37],[177,44],[172,50],[164,53],[155,54], // Lesmo 1
    [145,54],[136,53],
    [130,54],[124,52],[121,48],[119,43],[115,40],[109,39],[100,39], // Lesmo 2 / back straight
    [90,40],[80,42],[70,45],[63,49],[57,54],[52,59],[47,64],[42,68],[39,67], // Ascari / Parabolica
  ]),
  circuit({
    id: 'spa', name: 'Spa-Francorchamps', fullName: 'Circuit de Spa-Francorchamps', country: 'Belgium', flag: '🇧🇪',
    length: '7.004 km', corners: '19 corners', source: 'https://www.formula1.com/en/racing/2026/belgium',
    mapPath: 'M 27 70 L 39 70 Q 47 70 51 64 L 57 57 Q 61 52 57 47 L 51 40 Q 48 35 54 31 Q 61 27 69 31 L 79 38 Q 84 42 88 35 L 96 21 Q 100 13 108 17 L 119 24 L 139 29 L 159 33 L 178 37 Q 187 39 190 45 L 184 51 L 176 50 L 169 45 L 163 48 L 159 56 L 151 62 L 141 59 L 137 53 L 130 49 L 123 52 L 120 60 L 125 66 L 135 69 L 132 76 L 119 80 L 102 78 L 88 73 L 74 71 L 61 75 L 48 77 L 36 75 Z',
  }, [
    [37,73],[51,73],[64,73],[72,71],[77,67],[77,62],[73,58], // start, La Source
    [69,54],[68,50],[71,46],[75,42],[79,38],[82,33],[86,28], // Eau Rouge / Raidillon
    [93,22],[103,17],[115,15],[128,17],[141,21],[154,25],[168,28], // Kemmel straight
    [181,31],[188,35],[190,40],[186,44],[180,46],[174,45],[168,42], // Les Combes
    [162,38],[157,34],[153,32],[150,35],[153,40],[158,44],[163,48], // Malmedy / Bruxelles
    [168,53],[169,59],[166,64],[160,67],[153,66],[147,62],[142,57], // Pouhon
    [137,52],[132,49],[127,48],[123,51],[121,56],[123,61],[128,65], // Fagnes
    [134,68],[138,72],[135,76],[128,79],[118,80],[106,80],[94,79], // Stavelot
    [82,77],[70,75],[58,74],[46,75],[34,75],[29,71],
  ]),
  circuit({
    id: 'suzuka', name: 'Suzuka', fullName: 'Suzuka International Racing Course', country: 'Japan', flag: '🇯🇵',
    length: '5.807 km', corners: '18 corners', source: 'https://www.formula1.com/en/information/japan-suzuka-international-racing-course.2XjOiKgIHRRBVVpp5N3S5t',
    mapPath: 'M 174 72 L 159 70 L 143 66 L 128 61 L 116 55 L 107 49 L 101 43 L 103 38 L 111 36 L 119 39 L 122 44 L 118 48 L 111 50 L 105 54 L 107 60 L 114 64 L 121 61 L 127 53 L 131 43 L 136 33 L 145 25 L 157 21 L 169 24 L 177 31 L 181 40 L 179 49 L 173 55 L 164 57 L 155 53 L 151 47 L 154 42 L 160 41 L 165 45 L 165 50 L 160 54 L 153 57 L 146 61 L 142 67 L 148 72 L 160 75 L 173 76 L 181 73 Z',
  }, [
    // The S-curves and Degners feed the raised crossover at point 12; the
    // upper hairpin/130R loop returns underneath at point 36.
    [169,76],[155,75],[141,74],[127,72],[114,69],[103,65],[94,61],[89,57],
    [91,53],[97,50],[103,48],[107,48],[109,49],[110,50],
    [118,47],[127,44],[137,40],[148,36],[160,32],[172,30],[182,33],
    [188,40],[190,48],[187,55],[181,60],[172,63],[163,63],[154,61],
    [146,58],[139,55],[133,53],[127,52],[122,52],[118,52],[115,51],
    [113,50],[112,50],[111,50],[110,50],
    [114,53],[119,58],[125,64],[132,69],[140,72],[149,74],[158,75],
    [168,75],[174,74],[176,79],[169,83],
  ], { bridge: true, bridgeAtIndex: 13, underpassAtIndex: 38 }),
  circuit({
    id: 'monaco', name: 'Monaco', fullName: 'Circuit de Monaco', country: 'Monaco', flag: '🇲🇨',
    length: '3.337 km', corners: '19 corners', source: 'https://www.formula1.com/en/information/monaco-circuit-de-monaco-monte-carlo.2ZWRtIcSI6ZzVGX1uGRpkJ',
    mapPath: 'M 35 70 L 51 70 L 68 69 L 82 66 L 91 61 L 94 55 L 89 50 L 84 45 L 86 39 L 94 35 L 106 34 L 118 37 L 123 42 L 119 46 L 110 47 L 106 51 L 111 55 L 120 54 L 128 49 L 135 42 L 143 38 L 150 40 L 154 46 L 151 51 L 145 53 L 141 57 L 146 62 L 155 65 L 164 68 L 169 72 L 166 77 L 157 79 L 147 78 L 140 74 L 134 71 L 128 73 L 122 78 L 112 81 L 99 80 L 87 77 L 74 76 L 62 78 L 50 77 L 41 74 Z',
  }, [
    [46,72],[58,72],[72,72],[86,71],[98,69],[105,66],[107,62], // Start / Sainte Devote
    [103,58],[99,54],[97,50],[98,46],[103,42],[111,39],[121,37], // Beau Rivage
    [130,39],[135,43],[135,47],[131,50],[125,52],[121,55], // Massenet / Casino
    [122,59],[127,62],[134,61],[139,57],[143,52],[147,47], // Mirabeau
    [152,44],[157,46],[159,51],[157,56],[153,60],[152,64], // Fairmont hairpin
    [156,68],[163,71],[169,74],[169,77],[164,79],[156,80], // Portier / tunnel
    [148,81],[140,81],[133,79],[128,76],[124,78],[118,81], // Nouvelle Chicane
    [110,83],[100,83],[90,82],[80,81],[70,80],[60,79], // Tabac / Piscine
    [50,78],[41,75],[38,71],[40,67],[44,65],
  ]),
];

function curvePoint(points, index, u) {
  const start = points[index % points.length];
  const end = points[(index + 1) % points.length];
  return start.map((value, axis) => value + (end[axis] - value) * u);
}

// The lobby SVG and race engine share this traced centerline. Linear sampling
// keeps tight chicanes stable and prevents spline overshoot from inventing
// self-crossings. t=-pi/2 is the start/finish point for every circuit.
export function sampleTrack(trackId, t) {
  const track = TRACKS.find(item => item.id === trackId) || TRACKS[0];
  const points = track.points;
  const wrapped = ((t + Math.PI / 2) % TAU + TAU) % TAU;
  const distance = wrapped / TAU * track.routeLength;
  let index = 0;
  while (index < points.length - 1 && track.cumulativeLength[index + 1] < distance) index++;
  const next = (index + 1) % points.length;
  const startDistance = track.cumulativeLength[index];
  const endDistance = next ? track.cumulativeLength[next] : track.routeLength;
  const u = (distance - startDistance) / (endDistance - startDistance || 1);
  const [x, z] = curvePoint(points, index, u);
  return { x, z };
}
