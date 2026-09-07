import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	departementCadastre,
	nomPourLaRecherche,
	planDgfip,
	rechercheCadastreGouv,
	tailleAcceptee,
	villePourLaRecherche
} from './cadastre-gouv.ts';

/*
 * UN RELEVE DE POCHE, ET C EST VOULU.
 *
 * Le vrai releve des libelles de la DGFiP est moissonne et vit dans le site.
 * Ce qui se teste ICI est la REGLE - leur libelle passe devant le nom du Code
 * officiel, et le nom sans accents sert de repli - pas le contenu de la table,
 * qui se controle chez le consommateur, sur la table reelle.
 */
const RELEVE: Record<string, string> = {
	'94081': 'VITRY SUR SEINE',
	'10081': 'LA CHAPELLE ST LUC',
	'85050': 'CHAMP-SAINT-PERE (LE)'
};
const libelle = (insee: string): string | null => RELEVE[insee] ?? null;

const VITRY = { nom: 'Vitry-sur-Seine', insee: '94081' };
const CADRE = { ouest: 2.3871, sud: 48.7976, est: 2.3884, nord: 48.7989 };

test('le departement s ecrit sur TROIS caracteres, comme leur formulaire', () => {
	// Les 101 valeurs de leur `<select>`. Deux chiffres seuls ne trouvent rien.
	assert.equal(departementCadastre('94081'), '094');
	assert.equal(departementCadastre('01001'), '001');
	assert.equal(departementCadastre('2A004'), '02A');
	assert.equal(departementCadastre('2B033'), '02B');
	assert.equal(departementCadastre('97401'), '974');
	assert.equal(departementCadastre('97601'), '976');
});

test('le nom perd ses accents et GARDE ses tirets', () => {
	/*
	 * Mesure du 2026-09-07 sur 62 communes tirees au sort : 90 % de reponses
	 * directes sous cette forme, 77 % en remplacant les tirets par des espaces,
	 * 69 % avec le nom de la BAN tel quel.
	 */
	assert.equal(nomPourLaRecherche('Vitry-sur-Seine'), 'VITRY-SUR-SEINE');
	assert.equal(nomPourLaRecherche('Flagey-lès-Auxonne'), 'FLAGEY-LES-AUXONNE');
	assert.equal(nomPourLaRecherche("L'Abergement-Clémenciat"), "L'ABERGEMENT-CLEMENCIAT");
	assert.equal(nomPourLaRecherche('Bonnétage'), 'BONNETAGE');
});

test('le libelle de la DGFiP l emporte sur le nom du COG', () => {
	/*
	 * Leur referentiel n'ecrit pas les noms comme le COG, et pas de la meme
	 * facon d'une commune a l'autre - y compris dans un meme departement. Sans
	 * la table, Vitry tombait sur une liste de choix : leur moteur ne va droit
	 * au but que sur une correspondance exacte.
	 */
	assert.equal(villePourLaRecherche('94081', 'Vitry-sur-Seine', libelle), 'VITRY SUR SEINE');
	assert.equal(
		villePourLaRecherche('10081', 'La Chapelle-Saint-Luc', libelle),
		'LA CHAPELLE ST LUC'
	);
	assert.equal(
		villePourLaRecherche('85050', 'Le Champ-Saint-Père', libelle),
		'CHAMP-SAINT-PERE (LE)'
	);
	// Sans exception declaree, le nom sans accents suffit.
	assert.equal(villePourLaRecherche('29232', 'Quimper', libelle), 'QUIMPER');
	assert.equal(villePourLaRecherche('62193', 'Calais', libelle), 'CALAIS');
	// Cent communes ne sont pas chez eux : Paris y est par arrondissement.
	assert.equal(villePourLaRecherche('75056', 'Paris', libelle), 'PARIS');
});

test('sans parcelle, le lien ouvre la commune', () => {
	const url = new URL(rechercheCadastreGouv(VITRY, null, libelle));
	assert.equal(url.pathname, '/scpc/rechercherPlan.do');
	assert.equal(url.searchParams.get('ville'), 'VITRY SUR SEINE');
	assert.equal(url.searchParams.get('codeDepartement'), '094');
});

test('avec une parcelle, le lien ouvre la parcelle', () => {
	const url = new URL(
		rechercheCadastreGouv(VITRY, { prefixe: '000', section: 'AB', numero: '337' }, libelle)
	);
	assert.equal(url.pathname, '/scpc/rechercherParReferenceCadastrale.do');
	assert.equal(url.searchParams.get('ville'), 'VITRY SUR SEINE');
	// `rechercheType=1` est le bouton radio « par parcelle » de leur formulaire :
	// sans lui, la recherche par feuille prend la main et ne rend rien.
	assert.equal(url.searchParams.get('rechercheType'), '1');
	assert.equal(url.searchParams.get('prefixeParcelle'), '000');
	assert.equal(url.searchParams.get('sectionLibelle'), 'AB');
	assert.equal(url.searchParams.get('numeroParcelle'), '337');
});

test('le plan de la DGFiP se demande a SA commune, en EPSG:4326', () => {
	// Leur service a une adresse par commune et ne connait pas `CRS:84`.
	const url = new URL(planDgfip('94081', CADRE, 900, 600));
	assert.equal(url.hostname, 'inspire.cadastre.gouv.fr');
	assert.equal(url.pathname, '/scpc/94081.wms');
	assert.equal(url.searchParams.get('CRS'), 'EPSG:4326');
});

test('la BBOX de leur service est en LATITUDE, longitude', () => {
	/*
	 * En WMS 1.3.0, `EPSG:4326` impose l'ordre latitude-longitude - l'inverse du
	 * `CRS:84` de `fonds.ts`. Invertir rend une image vide, pas une erreur : rien
	 * ne le signale a l'ecran.
	 */
	const bbox = (new URL(planDgfip('94081', CADRE, 900, 600)).searchParams.get('BBOX') ?? '')
		.split(',')
		.map(Number);
	assert.deepEqual(bbox, [48.7976, 2.3871, 48.7989, 2.3884]);
});

test('la taille tient dans 1280 x 1024, sans deformer le cadre', () => {
	/*
	 * Bornes bissectees le 2026-09-07 : 1281 de large et 1025 de haut rendent un
	 * 400 en HTML Tomcat, 99 aussi. LES DEUX PLAFONDS DIFFERENT - une premiere
	 * mesure qui ne faisait varier qu'un cote ne l'a pas vu, et la page a servi
	 * un 1278 x 1280 vide. Rogner un seul cote decalerait les traits par rapport
	 * au dessin pose dessus, donc le rapport est conserve.
	 */
	assert.deepEqual(tailleAcceptee(900, 600), { largeur: 900, hauteur: 600 });
	assert.deepEqual(tailleAcceptee(1920, 1280), { largeur: 1280, hauteur: 853 });
	assert.deepEqual(tailleAcceptee(1278, 1280), { largeur: 1022, hauteur: 1024 });
	assert.deepEqual(tailleAcceptee(60, 40), { largeur: 150, hauteur: 100 });
	const carre = tailleAcceptee(2000, 2000);
	assert.deepEqual(carre, { largeur: 1024, hauteur: 1024 });
	const grand = new URL(planDgfip('94081', CADRE, 2560, 1690)).searchParams;
	assert.equal(Number(grand.get('WIDTH')) <= 1280, true);
	assert.equal(Number(grand.get('HEIGHT')) <= 1024, true);
});
