import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parcellesRetenues, PART_MINIMALE } from './rnb.ts';

/*
 * LE SEUIL EST DERIVE, PAS CHOISI : releve du 2026-09-07 sur 72 adresses de six
 * communes, 140 couples batiment-parcelle. La distribution a deux bosses - 57
 * parcelles sous 0,8 % et 72 au-dessus de 5 %, onze entre les deux. Le cas
 * temoin est le 22 rue Emile Chaillou a Trelaze : AD 525 83,9 %, AD 526 11,7 %,
 * AD 984 4,5 %.
 */

const plots = [
	{ id: '49353000AD0526', bdg_cover_ratio: 0.1166 },
	{ id: '49353000AD0525', bdg_cover_ratio: 0.8386 },
	{ id: '49353000AD0984', bdg_cover_ratio: 0.0446 }
];

test('les parcelles sortent de la plus couverte a la moins couverte', () => {
	assert.deepEqual(
		parcellesRetenues(plots).map((p) => p.idu),
		['49353000AD0525', '49353000AD0526']
	);
});

test('un debord de trait est ecarte, une vraie parcelle est gardee', () => {
	// AD 984 porte 4,5 % du batiment : c'est un debord. AD 526 en porte 11,7 %,
	// et c'est bien une parcelle du 22 - le cadastre la nomme.
	const gardees = parcellesRetenues(plots).map((p) => p.idu);
	assert.ok(!gardees.includes('49353000AD0984'));
	assert.ok(gardees.includes('49353000AD0526'));
	assert.ok(PART_MINIMALE > 0.045 && PART_MINIMALE <= 0.1166);
});

test('une reponse sans parcelles n est pas une erreur', () => {
	// `plots` n'existe que si l'appel porte `withPlots=1`. Un champ absent rend
	// une liste vide, et l'appelant retombe sur la parcelle du point.
	assert.deepEqual(parcellesRetenues(undefined), []);
	assert.deepEqual(parcellesRetenues(null), []);
	assert.deepEqual(parcellesRetenues([]), []);
});

test('une entree sans identifiant ou sans part ne passe pas', () => {
	assert.deepEqual(parcellesRetenues([{ id: '', bdg_cover_ratio: 0.9 }]), []);
	assert.deepEqual(parcellesRetenues([{ id: '49353000AD0525' }]), []);
	assert.deepEqual(parcellesRetenues([{ id: '49353000AD0525', bdg_cover_ratio: '0.9' }]), []);
});
