import { test } from 'node:test';
import assert from 'node:assert/strict';
import { batimentDuTrait, type Trait } from './bati.ts';

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
