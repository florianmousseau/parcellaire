import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boiteDesParcelles, cadreSurLObjet, dessiner, pasEchelle } from './plan.ts';
import type { Cadre } from './plan.ts';
import type { Parcelle } from './cadastre.ts';

const carre = (idu: string, lon: number, lat: number, cote: number): Parcelle => ({
	idu,
	section: 'BQ',
	numero: '0134',
	prefixe: '000',
	contenance: 100,
	insee: '94081',
	commune: 'Vitry-sur-Seine',
	contour: [
		[
			[lon, lat],
			[lon + cote, lat],
			[lon + cote, lat + cote],
			[lon, lat + cote],
			[lon, lat]
		]
	]
});

/** Un rectangle quelconque, pour eprouver le cadrage sur des formes extremes. */
const lame = (idu: string, b: Cadre): Parcelle => ({
	...carre(idu, b.ouest, b.sud, 0.0001),
	contour: [
		[
			[b.ouest, b.sud],
			[b.est, b.sud],
			[b.est, b.nord],
			[b.ouest, b.nord],
			[b.ouest, b.sud]
		]
	]
});

test('sans parcelle, aucun dessin plutot qu un cadre vide', () => {
	assert.equal(dessiner([], 'x'), null);
});

test('la cible passe au premier plan', () => {
	const dessin = dessiner(
		[carre('a', 2.38, 48.78, 0.001), carre('cible', 2.381, 48.781, 0.001)],
		'cible'
	);
	assert.ok(dessin);
	assert.equal(dessin.traces.at(-1)?.idu, 'cible');
	assert.equal(dessin.traces.at(-1)?.cible, true);
});

test('la longitude est corrigee de la latitude', () => {
	// Un carre en degres n'est pas un carre au sol : a 48,78 degres un degre de
	// longitude vaut environ 66 % d'un degre de latitude. Le dessin doit etre
	// plus large que haut dans ce rapport, sinon le plan sort etire.
	const dessin = dessiner([carre('a', 2.38, 48.78, 0.001)], 'a');
	assert.ok(dessin);
	const rapport = dessin.largeur / dessin.hauteur;
	assert.ok(rapport > 0.6 && rapport < 0.72, `rapport inattendu : ${String(rapport)}`);
});

test('la largeur en metres reste plausible', () => {
	const dessin = dessiner([carre('a', 2.38, 48.78, 0.001)], 'a');
	assert.ok(dessin);
	// 0,001 degre de longitude a Paris : environ 73 m.
	assert.ok(dessin.largeurMetres > 60 && dessin.largeurMetres < 85);
});

test('le pas de l echelle tient dans le tiers du dessin', () => {
	assert.equal(pasEchelle(73), 20);
	assert.equal(pasEchelle(300), 100);
	assert.equal(pasEchelle(12), 5);
	assert.equal(pasEchelle(1), 5);
});

test('le cadre sur l objet laisse la MEME marge en pixels, quelle que soit la forme', () => {
	/*
	 * C'est toute la difference entre un plan cote lisible et un plan cote ou la
	 * parcelle flotte : la marge se compte en PIXELS du dessin, pas en metres au
	 * sol. Une parcelle carree et une parcelle en lame doivent sortir avec la
	 * meme bande blanche autour, sinon les cotes de l'une tiennent et celles de
	 * l'autre se marchent dessus.
	 */
	const MARGE = 60;
	for (const [large, haut] of [
		[0.0003, 0.0003],
		[0.0009, 0.0001],
		[0.0001, 0.0012]
	] as const) {
		const boite = { ouest: 2.4, est: 2.4 + large, sud: 48.78, nord: 48.78 + haut };
		const cadre = cadreSurLObjet(boite, 48.78, MARGE);
		const dessin = dessiner([lame('a', boite)], 'a', [], cadre);
		assert.ok(dessin, `${String(large)} x ${String(haut)}`);
		const kx = Math.cos((48.78 * Math.PI) / 180);
		const echelle = dessin.largeur / ((cadre.est - cadre.ouest) * kx);
		const gauche = (boite.ouest - cadre.ouest) * kx * echelle;
		const bas = (boite.sud - cadre.sud) * (dessin.hauteur / (cadre.nord - cadre.sud));
		assert.ok(Math.abs(gauche - MARGE) < 1.5, `marge en x : ${String(gauche)}`);
		assert.ok(Math.abs(bas - MARGE) < 1.5, `marge en y : ${String(bas)}`);
	}
});

test('un objet sans etendue rend son cadre tel quel, plutot qu une division par zero', () => {
	const plat = { ouest: 2.4, est: 2.4, sud: 48.78, nord: 48.78 };
	assert.deepEqual(cadreSurLObjet(plat, 48.78, 60), plat);
	// Et une marge absurde ne mange pas tout le dessin.
	const boite = { ouest: 2.4, est: 2.4004, sud: 48.78, nord: 48.7804 };
	const enorme = cadreSurLObjet(boite, 48.78, 10_000);
	assert.ok(enorme.est - enorme.ouest > boite.est - boite.ouest);
	assert.ok(Number.isFinite(enorme.est - enorme.ouest));
});

// Une forme qui ne vient pas du cadastre francais : sans elle, rien ne mesure
// que le dessin reste appelable de l'exterieur (voir la tete de plan.ts).
test('dessine une parcelle de Tailte Eireann, qui n a que son identifiant et son contour', () => {
	const parcelle = {
		idu: '218493',
		contour: [
			[
				[-7.3302, 53.53],
				[-7.3301, 53.53],
				[-7.3301, 53.5301],
				[-7.3302, 53.5301],
				[-7.3302, 53.53]
			]
		] as const
	};
	const dessin = dessiner([parcelle], '218493');
	assert.ok(dessin);
	assert.equal(dessin.traces.length, 1);
	assert.equal(dessin.traces[0]?.cible, true);
	assert.ok(boiteDesParcelles([parcelle]));
});

test('un contour de deux cent mille sommets se dessine sans RangeError', () => {
	const sommets = 200_000;
	const anneau: [number, number][] = Array.from({ length: sommets }, (_, i) => {
		const angle = (2 * Math.PI * i) / sommets;
		return [2.39 + 0.001 * Math.cos(angle), 48.79 + 0.001 * Math.sin(angle)];
	});
	const detaillee: Parcelle = { ...carre('94081000BQ0134', 2.39, 48.79, 0.001), contour: [anneau] };
	assert.notEqual(dessiner([detaillee], '94081000BQ0134'), null);
});

test('le bati se cale sur les parcelles, et le cadre impose est rendu tel quel', () => {
	const contour = [
		[
			[-0.5046, 47.4522],
			[-0.5046, 47.4527],
			[-0.5041, 47.4527],
			[-0.5041, 47.4522],
			[-0.5046, 47.4522]
		] as [number, number][]
	];
	const cadre = { ouest: -0.5045, sud: 47.4523, est: -0.5042, nord: 47.4526 };
	const dessin = dessiner(
		[{ idu: '49353000AD0525', contour }],
		'49353000AD0525',
		[{ contour }],
		cadre
	);
	assert.equal(dessin?.bati[0], dessin?.traces[0]?.d);
	for (const cote of ['ouest', 'sud', 'est', 'nord'] as const) {
		assert.ok(Math.abs((dessin?.cadre[cote] ?? 0) - cadre[cote]) < 1e-12, cote);
	}
});

test('un terrain tres allonge garde un dessin d au moins un pixel de haut', () => {
	const dessin = dessiner([lame('a', { ouest: 2, est: 2.02, sud: 48, nord: 48.000005 })], 'a');
	assert.ok(dessin);
	assert.equal(dessin.largeur, 640);
	assert.equal(dessin.hauteur, 1);
});
