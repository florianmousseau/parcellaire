import { test } from 'node:test';
import assert from 'node:assert/strict';
import { definitionDuFond, fondDemande, FONDS, urlDuFond } from './fonds.ts';

/*
 * LE RELEVE DES COMMUNES SERVIES vit dans le site, qui le moissonne. Ce qui
 * se teste ici est la REGLE : sans commune, ou sur une commune que leur WMS
 * refuse, on ne demande rien. Vitry est servie, Paris et Brest ne le sont pas.
 */
const SERVIES = new Set(['94081']);
const sertLePlan = (insee: string): boolean => SERVIES.has(insee);

const CADRE = { ouest: 2.3975, sud: 48.7862, est: 2.4025, nord: 48.789 };
const parametres = (url: string) => new URLSearchParams(url.split('?')[1] ?? '');

test('le cadastre est le plan de la DGFiP, demande a SA commune', () => {
	/*
	 * Demande de Florian le 2026-09-07 : leur plan remplace le notre au defaut.
	 * Le service a une adresse par commune, d'ou le code INSEE dans le chemin.
	 */
	const url = urlDuFond('cadastre', CADRE, 960, 540, '94081', sertLePlan);
	assert.ok(url !== null);
	assert.equal(new URL(url).hostname, 'inspire.cadastre.gouv.fr');
	assert.equal(new URL(url).pathname, '/scpc/94081.wms');
});

test('sans commune servie, le cadastre n a pas d image et le dessin reprend', () => {
	/*
	 * Dix-neuf communes que leur WMS refuse par un 400 - Paris, Marseille et
	 * Lyon, qu'ils ne connaissent que par arrondissement, les collectivites hors
	 * cadastre DGFiP, trois absences metropolitaines. Demander quand meme
	 * laisserait un cadre VIDE a la place du plan par defaut.
	 */
	assert.equal(urlDuFond('cadastre', CADRE, 960, 540, '75056', sertLePlan), null);
	assert.equal(urlDuFond('cadastre', CADRE, 960, 540, '29083', sertLePlan), null);
	assert.equal(urlDuFond('cadastre', CADRE, 960, 540, null, sertLePlan), null);
});

test('le plan cote n a pas de fond : le dessin s y suffit', () => {
	// Les longueurs s'ecrivent le long des limites : une image dessous les noie.
	assert.equal(urlDuFond('cote', CADRE, 960, 540, '94081', sertLePlan), null);
	assert.equal(definitionDuFond('cote').couche, null);
});

test('un mot inconnu retombe sur le cadastre plutot que de casser la page', () => {
	// `?fond=` vient de l'URL : un lien recopie de travers ne doit pas rendre 500.
	assert.equal(fondDemande('satellite'), 'cadastre');
	assert.equal(fondDemande(null), 'cadastre');
	assert.equal(fondDemande(''), 'cadastre');
	assert.equal(fondDemande('photo'), 'photo');
});

test('l image est demandee en CRS:84, longitude d abord', () => {
	/*
	 * En WMS 1.3.0, `EPSG:4326` impose l'ordre latitude-longitude, que la moitie
	 * des exemples du web ecrit a l'envers : l'image sort tournee, et ca ne se
	 * voit qu'a l'oeil.
	 */
	const url = urlDuFond('photo', CADRE, 960, 540);
	assert.ok(url !== null);
	const p = parametres(url);
	assert.equal(p.get('CRS'), 'CRS:84');
	assert.equal(p.get('BBOX'), '2.397500,48.786200,2.402500,48.789000');
});

test('l image est demandee PLUS FINE que la boite, sans changer de cadre', () => {
	/*
	 * Signale par Florian le 2026-09-06 : « le plan IGN et la photo sont flous
	 * sur PC ». Le viewBox fait 640 px de grand cote, la figure en occupe pres de
	 * 1 000 : demandee a 640, l'image est agrandie, et un agrandissement ne se
	 * rattrape pas. On la demande au double et le navigateur la reduit.
	 *
	 * Le RAPPORT doit rester identique, sinon l'image ne se cale plus sur les
	 * traits : c'est le meme rectangle au sol, juste echantillonne plus fin.
	 */
	const url = urlDuFond('plan', CADRE, 860, 430);
	assert.ok(url !== null);
	const p = parametres(url);
	assert.equal(p.get('WIDTH'), '1720');
	assert.equal(p.get('HEIGHT'), '860');
	assert.equal(Number(p.get('WIDTH')) / Number(p.get('HEIGHT')), 2);
	assert.equal(p.get('BBOX'), parametres(urlDuFond('plan', CADRE, 640, 320) ?? '').get('BBOX'));
});

test('une demande enorme reste dans ce que le service accepte', () => {
	// Doubler un dessin deja grand sortirait du plafond du WMS, et une image
	// refusee est un cadre vide - pire qu'une image floue.
	const url = urlDuFond('photo', CADRE, 1600, 800);
	assert.ok(url !== null);
	const p = parametres(url);
	assert.equal(p.get('WIDTH'), '2048');
	assert.equal(p.get('HEIGHT'), '1024');
});

test('la photo part en JPEG, le plan IGN en PNG', () => {
	// Le trait du plan IGN se hache en JPEG ; la photo, elle, y gagne en poids.
	assert.equal(parametres(urlDuFond('photo', CADRE, 100, 100) ?? '').get('FORMAT'), 'image/jpeg');
	assert.equal(parametres(urlDuFond('plan', CADRE, 100, 100) ?? '').get('FORMAT'), 'image/png');
});

test('chaque fond dit ce qu il apporte, et nomme son producteur', () => {
	// Un onglet qui ne dit pas ce qu'il change ne se clique pas, et une image
	// publique se cite : les deux sont des regles du site, pas des ornements.
	for (const f of FONDS) {
		assert.ok(f.nom.length > 0, f.code);
		assert.ok(f.dit.length > 0, f.code);
		assert.ok(f.source.length > 0, f.code);
	}
});
