const TAU = Math.PI * 2;

export const TRACKS = [
  {
    id: 'silverstone', name: 'Silverstone', fullName: 'Silverstone Circuit', country: 'United Kingdom', flag: '🇬🇧', length: '5.891 km', corners: '18 corners',
    mapPath: 'M20 54 28 43 34 24 43 27 51 39 67 36 77 24 91 29 98 41 113 39 119 24 132 28 136 43 151 40 164 29 176 35 183 48 198 51 191 62 174 61 165 72 149 68 137 78 121 70 106 78 91 69 74 76 61 66 45 72 34 64 20 65Z',
    points: [[-90,-205],[70,-220],[220,-185],[300,-95],[245,-25],[130,-55],[75,25],[145,100],[285,112],[265,190],[140,220],[-20,205],[-110,145],[-255,170],[-315,90],[-230,10],[-165,-65],[-255,-130],[-220,-195]],
  },
  {
    id: 'monza', name: 'Monza', fullName: 'Autodromo Nazionale Monza', country: 'Italy', flag: '🇮🇹', length: '5.793 km', corners: '11 corners',
    mapPath: 'M25 38 54 35 72 28 88 31 91 42 81 49 103 47 119 43 138 47 144 55 133 62 114 58 93 64 83 72 64 69 61 60 45 62 27 57 21 49Z',
    points: [[-315,-145],[-160,-165],[90,-160],[295,-150],[320,-105],[200,-85],[310,-55],[325,40],[185,65],[315,90],[320,175],[200,195],[-65,190],[-285,165],[-320,115],[-180,90],[-315,55],[-325,-20],[-185,-50],[-310,-85]],
  },
  {
    id: 'spa', name: 'Spa-Francorchamps', fullName: 'Circuit de Spa-Francorchamps', country: 'Belgium', flag: '🇧🇪', length: '7.004 km', corners: '19 corners',
    mapPath: 'M25 63 31 48 42 43 49 28 61 24 72 32 68 44 82 48 94 41 101 28 112 23 124 31 134 42 146 37 157 30 169 37 176 49 190 53 196 63 185 70 171 65 160 74 147 69 137 77 125 67 111 70 101 61 88 66 76 59 64 66 50 60 39 68Z',
    points: [[-300,120],[-250,195],[-90,215],[55,175],[180,195],[300,145],[320,65],[240,15],[105,-5],[5,-65],[-55,-145],[-20,-205],[85,-205],[220,-145],[305,-55],[270,10],[165,35],[25,5],[-120,-35],[-220,-105],[-315,-85]],
  },
  {
    id: 'suzuka', name: 'Suzuka', fullName: 'Suzuka International Racing Course', country: 'Japan', flag: '🇯🇵', length: '5.807 km', corners: '18 corners',
    mapPath: 'M28 80 C28 30 88 28 110 80 C132 132 192 130 192 80 C192 30 132 28 110 80 C88 132 28 130 28 80',
    points: [], bridge: true,
  },
  {
    id: 'monaco', name: 'Monaco', fullName: 'Circuit de Monaco', country: 'Monaco', flag: '🇲🇨', length: '3.337 km', corners: '19 corners',
    mapPath: 'M30 40 73 36 82 29 98 31 105 42 123 39 138 30 151 36 149 47 166 48 181 42 192 50 185 58 169 59 165 70 148 68 140 78 123 73 109 78 96 70 77 75 67 66 50 68 42 59 28 57Z',
    points: [[-255,-170],[-80,-195],[75,-175],[95,-105],[40,-70],[200,-75],[280,-25],[230,25],[135,35],[160,95],[290,115],[250,175],[110,180],[40,140],[-30,175],[-230,165],[-290,95],[-205,35],[-90,10],[-75,-50],[-200,-85],[-260,-125]],
  },
];

export function sampleTrack(trackId, t) {
  const track = TRACKS.find(item => item.id === trackId) || TRACKS[0];
  if (track.bridge) return { x: 340 * Math.sin(t), z: 210 * Math.sin(2 * t) };
  const points = track.points;
  const wrapped = ((t % TAU) + TAU) % TAU;
  const cursor = wrapped / TAU * points.length;
  const index = Math.floor(cursor), u = cursor - index, u2 = u * u, u3 = u2 * u;
  const p0 = points[(index - 1 + points.length) % points.length];
  const p1 = points[index % points.length];
  const p2 = points[(index + 1) % points.length];
  const p3 = points[(index + 2) % points.length];
  const catmull = (a, b, c, d) => 0.5 * (2*b + (-a+c)*u + (2*a-5*b+4*c-d)*u2 + (-a+3*b-3*c+d)*u3);
  return { x: catmull(p0[0],p1[0],p2[0],p3[0]), z: catmull(p0[1],p1[1],p2[1],p3[1]) };
}
