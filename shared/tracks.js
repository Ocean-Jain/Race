const TAU = Math.PI * 2;

export const TRACKS = [
  {
    id: 'silverstone', name: 'Silverstone', fullName: 'Silverstone Circuit', country: 'United Kingdom', flag: '🇬🇧', length: '5.891 km', corners: '18 corners',
    mapPath: 'M22 78 L77 78 Q84 78 86 71 L91 60 Q93 55 87 51 L78 45 Q72 40 77 34 Q82 28 94 29 L108 32 Q114 34 118 40 L125 48 Q130 53 137 48 L145 39 Q150 33 155 37 Q161 41 157 47 L151 55 Q148 60 155 62 L178 66 Q188 68 197 62 L190 56 Q185 52 188 47 L195 39 Q198 35 193 32 L179 23 Q171 18 165 23 L158 31 Q153 36 148 31 L141 24 Q136 19 131 23 L122 34 Q117 40 112 34 L104 24 Q99 18 93 24 L84 35 Q80 40 75 35 L67 28 Q61 22 56 28 L48 38 Q44 43 39 39 L32 34 Q28 31 26 37 L21 56 Q18 68 22 78Z',
    points: [[-90,-205],[70,-220],[220,-185],[300,-95],[245,-25],[130,-55],[75,25],[145,100],[285,112],[265,190],[140,220],[-20,205],[-110,145],[-255,170],[-315,90],[-230,10],[-165,-65],[-255,-130],[-220,-195]],
  },
  {
    id: 'monza', name: 'Monza', fullName: 'Autodromo Nazionale Monza', country: 'Italy', flag: '🇮🇹', length: '5.793 km', corners: '11 corners',
    mapPath: 'M24 76 L188 76 Q198 76 198 68 L196 61 L190 57 L195 52 Q199 47 192 43 Q185 39 177 41 L166 44 Q160 46 165 51 L171 56 Q175 60 168 61 L154 60 Q148 59 149 53 L151 46 Q153 39 147 36 Q141 33 137 39 L131 47 Q127 53 121 49 L112 43 Q107 39 111 34 L116 29 L102 29 L93 34 L97 40 L102 45 Q105 50 99 54 L90 60 Q83 64 77 59 L70 53 Q66 49 72 44 L78 39 Q83 34 76 32 L62 29 Q55 28 52 34 L48 41 Q46 47 52 51 L59 55 Q63 58 59 63 L55 68 Q52 72 46 72 L24 72Z',
    points: [[-315,-145],[-160,-165],[90,-160],[295,-150],[320,-105],[200,-85],[310,-55],[325,40],[185,65],[315,90],[320,175],[200,195],[-65,190],[-285,165],[-320,115],[-180,90],[-315,55],[-325,-20],[-185,-50],[-310,-85]],
  },
  {
    id: 'spa', name: 'Spa-Francorchamps', fullName: 'Circuit de Spa-Francorchamps', country: 'Belgium', flag: '🇧🇪', length: '7.004 km', corners: '19 corners',
    mapPath: 'M20 79 L36 79 Q43 79 40 72 L33 65 Q28 59 34 53 Q39 48 44 43 Q49 37 45 31 Q42 25 49 18 Q55 12 61 18 L104 48 Q110 52 116 47 L124 39 Q129 34 134 40 L141 48 Q145 53 151 48 L158 41 Q164 35 169 41 L175 48 Q180 54 174 59 L167 65 Q163 69 169 72 L188 76 Q197 78 194 70 Q192 66 185 63 L176 59 Q169 56 175 51 L184 43 Q190 37 184 33 L177 28 Q171 24 165 30 L156 38 Q150 43 145 36 L137 27 Q132 21 126 27 L118 36 Q112 42 107 35 L97 24 Q92 18 86 23 L79 31 Q73 38 68 32 L61 25 Q56 20 51 26 L48 34 Q45 41 50 47 L59 56 Q65 62 58 67 L50 73 Q45 77 39 73 L32 68 Q27 65 24 70Z',
    points: [[-300,120],[-250,195],[-90,215],[55,175],[180,195],[300,145],[320,65],[240,15],[105,-5],[5,-65],[-55,-145],[-20,-205],[85,-205],[220,-145],[305,-55],[270,10],[165,35],[25,5],[-120,-35],[-220,-105],[-315,-85]],
  },
  {
    id: 'suzuka', name: 'Suzuka', fullName: 'Suzuka International Racing Course', country: 'Japan', flag: '🇯🇵', length: '5.807 km', corners: '18 corners',
    mapPath: 'M110 51 C99 40 88 26 73 24 C58 22 40 27 33 39 C27 49 34 57 45 52 C55 47 63 43 72 47 C80 51 78 59 69 59 C61 59 56 64 61 70 C67 78 81 75 91 64 C98 57 104 53 110 51 C118 40 132 25 149 23 C166 21 185 30 192 43 C198 53 190 62 177 64 C166 66 158 62 155 56 Q152 50 158 47 Q165 43 172 49 C180 55 178 65 169 72 C157 81 140 80 129 69 C120 61 115 55 110 51Z',
    points: [], bridge: true,
  },
  {
    id: 'monaco', name: 'Monaco', fullName: 'Circuit de Monaco', country: 'Monaco', flag: '🇲🇨', length: '3.337 km', corners: '19 corners',
    mapPath: 'M22 77 L69 77 Q76 77 78 70 L79 63 L73 58 Q68 53 73 49 L83 44 L105 37 Q112 35 115 28 L119 20 Q122 15 129 18 L145 24 Q153 27 157 33 L164 40 Q168 44 164 48 L158 53 Q154 57 162 60 L174 64 Q180 67 176 73 Q171 78 165 73 L157 67 Q151 63 146 68 L140 74 Q135 79 130 73 L126 67 Q122 63 117 67 L111 73 Q107 77 102 73 L96 68 Q91 64 86 68 L82 73 Q78 78 71 78 L22 78Z',
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
