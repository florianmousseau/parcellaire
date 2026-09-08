import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	decouperIdentifiant,
	rattacherLaParcelle,
	sectionLisible,
	type Parcelle
} from './cadastre.ts';

/*
 * UNE ADRESSE PORTE SOUVENT DEUX PARCELLES, et la page n'en servait qu'une
 * jusqu'au 2026-09-07. Le cas temoin est reel : au 22 rue Emile Chaillou a
 * Trelaze, le referentiel des batiments mesure AD 525 a 83,9 %, AD 526 a 11,7 %
 * et AD 984 a 4,5 %, et la Base Adresse Nationale declare AD 526. Les deux
 * premieres sont les parcelles de l'adresse ; la troisieme est un debord.
 */
const parcelle = (idu: string, contenance: number): Parcelle => ({
	idu,
	section: idu.slice(8, 10),
	numero: idu.slice(10),
	prefixe: idu.slice(5, 8),
	contenance,
	insee: idu.slice(0, 5),
	commune: 'Trélazé',
	/* Un carre a une vingtaine de metres a l'est du point de l'adresse : ces
	   tests portent sur le CHOIX des parcelles, mais le repli par le bord
	   refuse au-dela de quarante metres, donc la geometrie doit rester
	   plausible. */
	contour: [
		[
			[-0.5046, 47.4522],
			[-0.5046, 47.4527],
			[-0.5041, 47.4527],
			[-0.5041, 47.4522],
			[-0.5046, 47.4522]
		]
	]
});

/** La meme parcelle temoin, dans une autre commune. */
const parcelleDe = (idu: string, contenance: number, commune: string): Parcelle => ({
	...parcelle(idu, contenance),
	commune
});

const AD525 = parcelle('49353000AD0525', 190);
const AD526 = parcelle('49353000AD0526', 171);
const AD984 = parcelle('49353000AD0984', 210);
const AUTOUR = [AD525, AD526, AD984];
/* Ce que le referentiel rend au 22 : le seuil de `PART_MINIMALE` a deja ecarte
   AD 984, qui n'y figure donc plus. */
const BATIMENT = {
	lon: -0.504897,
	lat: 47.45243,
	parcelles: [
		{ idu: '49353000AD0525', part: 0.8386 },
		{ idu: '49353000AD0526', part: 0.1166 }
	]
};

test('une adresse rend TOUTES les parcelles que son batiment couvre', () => {
	const r = rattacherLaParcelle(null, AUTOUR, -0.5049, 47.4524, BATIMENT, ['49353000AD0526']);
	assert.equal(r?.parcelle.idu, '49353000AD0525');
	assert.equal(r?.par, 'batiment');
	assert.equal(r?.part, 0.8386);
	assert.deepEqual(
		r?.autres.map((a) => a.parcelle.idu),
		['49353000AD0526']
	);
	assert.equal(r?.autres[0]?.declaree, true);
});

test('la plus couverte passe en tete, quel que soit l ordre recu', () => {
	const inverse = { ...BATIMENT, parcelles: [...BATIMENT.parcelles].reverse() };
	const r = rattacherLaParcelle(null, AUTOUR, -0.5049, 47.4524, inverse, []);
	assert.equal(r?.parcelle.idu, '49353000AD0525');
	assert.deepEqual(
		r?.autres.map((a) => a.parcelle.idu),
		['49353000AD0526']
	);
});

test('la parcelle DECLAREE par la BAN entre meme si le batiment ne la couvre pas', () => {
	// Le referentiel ne connait que AD 525 ; la BAN nomme AD 526 pour ce numero.
	// C'est une declaration, pas une mesure de recouvrement : elle est gardee.
	const seule = { ...BATIMENT, parcelles: [{ idu: '49353000AD0525', part: 0.99 }] };
	const r = rattacherLaParcelle(null, AUTOUR, -0.5049, 47.4524, seule, ['49353000AD0526']);
	assert.deepEqual(
		r?.autres.map((a) => a.parcelle.idu),
		['49353000AD0526']
	);
	assert.equal(r?.autres[0]?.part, null);
	assert.equal(r?.autres[0]?.declaree, true);
});

test('une parcelle que le voisinage cadastral ne porte pas ne se sert pas', () => {
	// On ne fabrique jamais une reference : sans contour ni contenance, la page
	// n'aurait rien a en dire, et une ligne creuse se lit comme une donnee.
	const r = rattacherLaParcelle(null, [AD525], -0.5049, 47.4524, BATIMENT, ['49353000ZZ9999']);
	assert.equal(r?.parcelle.idu, '49353000AD0525');
	assert.deepEqual(r?.autres, []);
});

test('le point de l adresse garde la main, et les autres parcelles suivent', () => {
	const r = rattacherLaParcelle(AD526, AUTOUR, -0.5049, 47.4524, BATIMENT, []);
	assert.equal(r?.parcelle.idu, '49353000AD0526');
	assert.equal(r?.par, 'point');
	assert.equal(r?.part, 0.1166);
	assert.deepEqual(
		r?.autres.map((a) => a.parcelle.idu),
		['49353000AD0525']
	);
});

test('sans batiment ni declaration, le repli par le bord ne change pas', () => {
	const r = rattacherLaParcelle(null, [AD525], -0.5049, 47.4524, null, []);
	assert.equal(r?.par, 'bord');
	assert.equal(typeof r?.metres, 'number');
	assert.deepEqual(r?.autres, []);
});

test('aucune parcelle du tout rend null, jamais une reponse fabriquee', () => {
	assert.equal(rattacherLaParcelle(null, [], -0.5049, 47.4524, null, []), null);
});

test('un identifiant cadastral se decoupe en quatre', () => {
	assert.deepEqual(decouperIdentifiant('94081000BQ0134'), {
		insee: '94081',
		prefixe: '000',
		section: 'BQ',
		numero: '0134'
	});
});

test('une commune fusionnee porte un prefixe non nul', () => {
	assert.equal(decouperIdentifiant('31395123AB0001')?.prefixe, '123');
});

test('la Corse passe, ses codes portent une lettre', () => {
	assert.equal(decouperIdentifiant('2A004000AB0001')?.insee, '2A004');
});

test('ce qui n est pas un identifiant rend null', () => {
	// La longueur ne suffit pas : chaque morceau a sa forme.
	assert.equal(decouperIdentifiant('94081000BQ013'), null);
	assert.equal(decouperIdentifiant('94081000BQ01345'), null);
	assert.equal(decouperIdentifiant('94081000bq0134'), null);
	assert.equal(decouperIdentifiant(''), null);
	assert.equal(decouperIdentifiant('../../etc/passwd'), null);
});

/*
 * LE VOISIN N EST PAS UNE PARCELLE DE CETTE ADRESSE.
 *
 * Cas reel, releve le 2026-09-08 : au 128 rue de Letanduere a Angers, le
 * referentiel mesure DM 145 a 88,99 % et DM 304 a 10,07 %, et la BAN declare
 * DM 0304 au 126. Les 10 % sont une bande d un metre le long de la limite -
 * le referentiel numerise le toit, le cadastre suit le mur.
 */
const DM145 = parcelleDe('49007000DM0145', 204, 'Angers');
const DM304 = parcelleDe('49007000DM0304', 112, 'Angers');
const LETANDUERE = {
	lon: -0.554296,
	lat: 47.458147,
	parcelles: [
		{ idu: '49007000DM0145', part: 0.8899 },
		{ idu: '49007000DM0304', part: 0.1007 }
	]
};

test('la parcelle que la BAN declare a un AUTRE numero est retiree', () => {
	const r = rattacherLaParcelle(
		null,
		[DM145, DM304],
		-0.554296,
		47.458147,
		LETANDUERE,
		['49007000DM0145'],
		['49007000DM0304']
	);
	assert.equal(r?.parcelle.idu, '49007000DM0145');
	assert.deepEqual(r?.autres, []);
});

test('le cas fondateur survit : la BAN declare AD 526 au 22, elle reste', () => {
	// Les deux parcelles du 22 rue Emile Chaillou. AD 526 est declaree a CE
	// numero : la coupe l epargne, meme si un voisin la declare aussi.
	const r = rattacherLaParcelle(
		null,
		AUTOUR,
		-0.5049,
		47.4524,
		BATIMENT,
		['49353000AD0526'],
		['49353000AD0526', '49353000AD0984']
	);
	assert.equal(r?.parcelle.idu, '49353000AD0525');
	assert.deepEqual(
		r?.autres.map((a) => a.parcelle.idu),
		['49353000AD0526']
	);
});

test('la principale n est jamais coupee, meme declaree ailleurs', () => {
	// Au 30 rue de Letanduere, la BAN nomme DK 127 quand le batiment est
	// entier sur DK 128 : une adresse qui perdrait sa principale ne rendrait
	// plus rien. La regle ne touche que les secondaires.
	const r = rattacherLaParcelle(
		null,
		[DM145, DM304],
		-0.554296,
		47.458147,
		LETANDUERE,
		[],
		['49007000DM0145', '49007000DM0304']
	);
	assert.equal(r?.parcelle.idu, '49007000DM0145');
	assert.deepEqual(r?.autres, []);
});

test('sans liste de voisines, rien ne change', () => {
	const r = rattacherLaParcelle(null, [DM145, DM304], -0.554296, 47.458147, LETANDUERE, []);
	assert.deepEqual(
		r?.autres.map((a) => a.parcelle.idu),
		['49007000DM0304']
	);
});

test('une section a une lettre perd son zero de comblement', () => {
	// La source rend toujours deux signes : la section E arrive en `0E`, et
	// « 0E 185 » ne s'ecrit sur aucun plan.
	assert.equal(sectionLisible('0E'), 'E');
	assert.equal(sectionLisible('0A'), 'A');
	assert.equal(sectionLisible('AB'), 'AB');
	assert.equal(sectionLisible('ZC'), 'ZC');
	assert.equal(sectionLisible('BQ'), 'BQ');
});
