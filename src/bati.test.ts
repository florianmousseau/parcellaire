import { test } from 'node:test';
import assert from 'node:assert/strict';
import { batiAutour, batimentDuPoint, batimentDuTrait, type Batiment, type Trait } from './bati.ts';

/*
 * Trois batiments releves le 2026-09-12 autour du 60 rue Pasteur a
 * Vitry-sur-Seine (BD TOPO, WFS de la Geoplateforme) : la maison du numero, une
 * annexe au fond de la parcelle, et un batiment dont l'usage n'est pas connu.
 */
const carre = {
	type: 'Polygon',
	coordinates: [
		[
			[2.4057, 48.8016],
			[2.4058, 48.8016],
			[2.4058, 48.8017],
			[2.4057, 48.8017],
			[2.4057, 48.8016]
		]
	]
};

const trait = (properties: Record<string, unknown>): Trait => ({ properties, geometry: carre });

test('une maison : un logement, son annee de construction', () => {
	const b = batimentDuTrait(
		trait({
			usage_1: 'Résidentiel',
			nature: 'Indifférenciée',
			nombre_de_logements: 1,
			nombre_d_etages: 2,
			hauteur: 8.6,
			date_d_apparition: '1895-01-01Z'
		})
	);
	assert.equal(b?.logements, 1);
	assert.equal(b?.annee, 1895);
	assert.equal(b?.etages, 2);
	assert.equal(b?.usage, 'Résidentiel');
});

test('une annexe compte zero logement, un usage inconnu ne compte rien', () => {
	assert.equal(batimentDuTrait(trait({ usage_1: 'Annexe', nombre_de_logements: 0 }))?.logements, 0);
	const inconnu = batimentDuTrait(
		trait({ usage_1: 'Indifférencié', nombre_de_logements: null, date_d_apparition: null })
	);
	assert.equal(inconnu?.logements, null);
	assert.equal(inconnu?.annee, null);
});

test('un objet sans contour ne fait pas un batiment', () => {
	assert.equal(batimentDuTrait({ properties: { nombre_de_logements: 1 }, geometry: null }), null);
});

const batiment = (anneau: [number, number][], usage: string): Batiment =>
	batimentDuTrait({
		properties: { usage_1: usage },
		geometry: { type: 'Polygon', coordinates: [anneau] }
	})!;

test('le batiment qui contient le point passe avant une annexe plus proche de son centre', () => {
	// Un immeuble de 150 m d'est en ouest ; le point est a son bout est, a 2 m d'une annexe.
	const long = batiment(
		[
			[2.4, 48.8],
			[2.402, 48.8],
			[2.402, 48.8001],
			[2.4, 48.8001],
			[2.4, 48.8]
		],
		'Résidentiel'
	);
	const annexe = batiment(
		[
			[2.40203, 48.8],
			[2.40206, 48.8],
			[2.40206, 48.80003],
			[2.40203, 48.80003],
			[2.40203, 48.8]
		],
		'Annexe'
	);
	assert.equal(batimentDuPoint([annexe, long], 2.40199, 48.80005)?.usage, 'Résidentiel');
	// Hors de tout batiment, le plus proche par son bord, a moins de 25 m.
	assert.equal(batimentDuPoint([annexe, long], 2.4021, 48.80001)?.usage, 'Annexe');
	assert.equal(batimentDuPoint([annexe, long], 2.41, 48.81), null);
});

test('une source de bati muette leve au lieu de rendre un quartier sans batiment', async () => {
	const avant = globalThis.fetch;
	globalThis.fetch = (async () => new Response('', { status: 502 })) as typeof fetch;
	try {
		await assert.rejects(batiAutour(2.39, 48.79), /HTTP 502/);
		globalThis.fetch = (async () => Response.json({ features: [] })) as typeof fetch;
		assert.deepEqual(await batiAutour(2.39, 48.79), []);
	} finally {
		globalThis.fetch = avant;
	}
});
