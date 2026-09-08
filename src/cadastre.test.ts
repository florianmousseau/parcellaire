import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	communeDuCadastre,
	decouperIdentifiant,
	nomDeLaCommune,
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

test('une section a une lettre perd son zero de comblement', () => {
	// La source rend toujours deux signes : la section E arrive en `0E`, et
	// « 0E 185 » ne s'ecrit sur aucun plan.
	assert.equal(sectionLisible('0E'), 'E');
	assert.equal(sectionLisible('0A'), 'A');
	assert.equal(sectionLisible('AB'), 'AB');
	assert.equal(sectionLisible('ZC'), 'ZC');
	assert.equal(sectionLisible('BQ'), 'BQ');
});

/*
 * LES 45 ARRONDISSEMENTS, ET LE 404 QU'ILS RENDAIENT TOUS.
 *
 * Le plan cadastral ne connait ni « 75102 », ni « 69382 », ni « 13202 » : il
 * range leurs parcelles sous Paris, Lyon et Marseille. Une parcelle du 2e
 * arrondissement demandee sous son propre code rendait zero trait, donc null,
 * donc une page en 404 - `75102000AI0057`, le 15 rue du Croissant, le
 * 2026-09-08.
 */
test('une parcelle de Paris, Lyon ou Marseille se demande sous sa ville', () => {
	assert.equal(communeDuCadastre('75102'), '75056');
	assert.equal(communeDuCadastre('69382'), '69123');
	assert.equal(communeDuCadastre('13202'), '13055');
});

test('partout ailleurs le code de l identifiant est le bon', () => {
	assert.equal(communeDuCadastre('94081'), '94081');
	assert.equal(communeDuCadastre('2A004'), '2A004');
	// Les trois villes elles-memes ne sont pas des arrondissements.
	assert.equal(communeDuCadastre('75056'), '75056');
	assert.equal(communeDuCadastre('69123'), '69123');
	assert.equal(communeDuCadastre('13055'), '13055');
	// Et les codes qui bordent les plages restent intacts : 69390 est
	// Villeurbanne dans une autre serie, pas un dixieme arrondissement.
	assert.equal(communeDuCadastre('75121'), '75121');
	assert.equal(communeDuCadastre('69390'), '69390');
	assert.equal(communeDuCadastre('13200'), '13200');
	assert.equal(communeDuCadastre('13217'), '13217');
});

test('le nom de l arrondissement se calcule, l API rend celui de la ville', () => {
	// L'API rend « Paris » pour les vingt : sans ce calcul, le fil d'Ariane et
	// le titre de la page perdent l'arrondissement.
	assert.equal(nomDeLaCommune('75102', 'Paris'), 'Paris 2e Arrondissement');
	assert.equal(nomDeLaCommune('69381', 'Lyon'), 'Lyon 1er Arrondissement');
	assert.equal(nomDeLaCommune('13216', 'Marseille'), 'Marseille 16e Arrondissement');
	assert.equal(nomDeLaCommune('75120', 'Paris'), 'Paris 20e Arrondissement');
});

test('ailleurs, le nom rendu par la source passe tel quel', () => {
	assert.equal(nomDeLaCommune('94081', 'Vitry-sur-Seine'), 'Vitry-sur-Seine');
	assert.equal(nomDeLaCommune('75056', 'Paris'), 'Paris');
	assert.equal(nomDeLaCommune('2A004', 'Ajaccio'), 'Ajaccio');
});
