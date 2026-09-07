import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contient, distanceAuBord, type Contour } from './geometrie.ts';

/*
 * LE CAS QUI A OUVERT LE DEFAUT, le 2026-09-06.
 *
 * Au 60 rue Pasteur a Vitry-sur-Seine, le point de la Base Adresse Nationale
 * tombe sur la chaussee : aucune parcelle ne le contient. La page nommait alors
 * la parcelle dont le CENTRE etait le plus proche, et servait E 185 (234 m2)
 * quand le batiment du 60 est sur E 107 (372 m2).
 *
 * Les deux carres ci-dessous rejouent la forme exacte du piege, en degres et a
 * la latitude de Paris : une PETITE parcelle un peu en retrait, et une GRANDE
 * qui touche presque le point. Le centre elit la petite, le bord la grande.
 */
const POINT = { lon: 2.4, lat: 48.8 };

/** Un carre, en degres, donne par son coin sud-ouest et son cote. */
const carre = (lon: number, lat: number, cote: number): Contour => [
	[
		[lon, lat],
		[lon + cote, lat],
		[lon + cote, lat + cote],
		[lon, lat + cote],
		[lon, lat]
	]
];

/* Petite, son bord a environ 6 m a l'est du point, son centre a environ 12 m. */
const PETITE = carre(POINT.lon + 0.00008, POINT.lat - 0.00004, 0.00008);
/* Grande, son bord a environ 1,5 m a l'ouest, son centre a environ 19 m. */
const GRANDE = carre(POINT.lon - 0.0003, POINT.lat - 0.00015, 0.00028);

test('un point pose DANS un contour y est trouve', () => {
	assert.equal(contient(carre(2.4, 48.8, 0.001), 2.4005, 48.8005), true);
});

test('un point pose dehors ne l est pas', () => {
	assert.equal(contient(carre(2.4, 48.8, 0.001), 2.402, 48.8005), false);
});

test('un contour vide ne contient rien', () => {
	assert.equal(contient([], 2.4, 48.8), false);
});

/*
 * Un anneau interieur est un TROU, et `anneauxDe` les aplatit avec les autres :
 * c'est la regle pair-impair qui rend la bonne reponse, et ce test la tient.
 */
test('un point dans le trou d une parcelle en est DEHORS', () => {
	const avecTrou: Contour = [...carre(2.4, 48.8, 0.001), ...carre(2.4004, 48.8004, 0.0002)];
	assert.equal(contient(avecTrou, 2.4005, 48.8005), false, 'dans le trou');
	assert.equal(contient(avecTrou, 2.4002, 48.8002), true, 'dans la couronne');
});

test('la distance au bord est nulle quand le point est sur le contour', () => {
	assert.ok(distanceAuBord(carre(2.4, 48.8, 0.001), 2.4, 48.8) < 0.5);
});

/*
 * LA MESURE QUI DECIDE, et le defaut qu'elle repare.
 *
 * Le centre de la petite parcelle est plus proche du point que celui de la
 * grande ; son BORD est plus loin. Une comparaison par les centres rend donc
 * l'autre reponse que celle du bord, et c'est exactement ce qui servait la
 * mauvaise parcelle au 60 rue Pasteur.
 */
test('le bord et le centre ne designent pas la meme parcelle', () => {
	const bordPetite = distanceAuBord(PETITE, POINT.lon, POINT.lat);
	const bordGrande = distanceAuBord(GRANDE, POINT.lon, POINT.lat);
	assert.ok(bordGrande < bordPetite, `la grande touche le point : ${bordGrande} < ${bordPetite}`);

	const centre = (c: Contour) => {
		const pts = c.flat();
		const kx = Math.cos((POINT.lat * Math.PI) / 180);
		let sx = 0;
		let sy = 0;
		for (const [x, y] of pts) {
			sx += x;
			sy += y;
		}
		return Math.hypot((sx / pts.length - POINT.lon) * kx, sy / pts.length - POINT.lat) * 111_320;
	};
	assert.ok(
		centre(PETITE) < centre(GRANDE),
		'et le centre aurait elu la petite, ce que faisait la page'
	);
});

test('la longitude est projetee : un ecart est-ouest compte moins qu un nord-sud', () => {
	const versEst = distanceAuBord(carre(2.401, 48.8, 0.0001), 2.4, 48.80005);
	const versNord = distanceAuBord(carre(2.4, 48.801, 0.0001), 2.40005, 48.8);
	/* Un degre de longitude vaut environ 73 m a Paris contre 111 m de latitude. */
	assert.ok(versEst < versNord, `${versEst} m vers l est contre ${versNord} m vers le nord`);
});
