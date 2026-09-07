import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cadreSurLObjet, dessiner, pasEchelle } from './plan.ts';
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
