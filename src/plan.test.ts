import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dessiner, pasEchelle } from './plan.ts';
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
