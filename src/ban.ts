/*
 * La Base Adresse Nationale, qui donne la maille du site.
 *
 * Deux APIs distinctes, et confondre leurs adresses coute une heure :
 *   - `api-adresse.data.gouv.fr` GEOCODE du texte libre. Elle sert la recherche.
 *   - `plateforme.adresse.data.gouv.fr/lookup/<id>` rend un OBJET complet, avec
 *     ses enfants. Elle sert les pages. Le prefixe `/api/` n'existe pas : il
 *     rend une page HTML d'erreur en 404, pas du JSON.
 *
 * L'identifiant d'une voie est `<insee>_<code voie>`, celui d'une adresse
 * `<insee>_<code voie>_<numero sur 5 chiffres>`. Ils sont stables et c'est ce
 * qui autorise a les mettre dans une URL.
 */

import { nomDeLaCommune } from './arrondissements.ts';
import { lire, JOUR } from './reseau.ts';

const LOOKUP = 'https://plateforme.adresse.data.gouv.fr/lookup';
const GEOCODE = 'https://api-adresse.data.gouv.fr/search';
const INVERSE = 'https://api-adresse.data.gouv.fr/reverse';

export interface Point {
	readonly lon: number;
	readonly lat: number;
}

export interface Numero {
	readonly id: string;
	readonly numero: number;
	readonly suffixe: string;
	readonly codePostal: string;
	readonly point: Point;
	/**
	 * LES PARCELLES QUE LA BAN DECLARE POUR CE NUMERO, en identifiants a
	 * quatorze signes. Vide le plus souvent : mesure du 2026-09-07 sur 72
	 * adresses de six communes, 24 en portent une, 48 aucune.
	 *
	 * C'est une DECLARATION, pas une mesure : quand elle existe, elle vaut plus
	 * que la geometrie, et `rattacherLaParcelle` la garde meme sous le seuil de
	 * couverture du batiment. Au 22 rue Emile Chaillou a Trelaze, elle nomme
	 * AD 526 quand le batiment est surtout sur AD 525 : les deux ensemble sont
	 * la reponse, et c'est ce que le cadastre sait.
	 */
	readonly parcelles: readonly string[];
}

/** Une boite `[ouest, sud, est, nord]`, telle que la BAN la publie. */
export interface Cadre {
	readonly ouest: number;
	readonly sud: number;
	readonly est: number;
	readonly nord: number;
}

export interface Voie {
	readonly id: string;
	readonly nom: string;
	readonly point: Point;
	/**
	 * L ETENDUE DE LA VOIE, et non un point pris dessus.
	 *
	 * Le point d une voie est un point comme un autre : sur la rue du College a
	 * Renaze il est a 9 m du numero le plus proche et a 59 m du plus loin. Un
	 * plan cadre sur lui montre un bout de la voie, jamais la voie. Mesure du
	 * 2026-09-06 sur soixante voies de deux communes : la moitie sont plus
	 * longues que la fenetre que ce point ouvrait.
	 *
	 * ET C EST BIEN CE CADRE-LA, PAS L ETENDUE DES NUMEROS. Mesure du meme jour :
	 * rue du College, les huit numeros tiennent dans 22 x 112 m quand la boite
	 * fait 120 x 221 m ; rue Pasteur a Vitry, 46 x 632 m contre 139 x 730 m. La
	 * BAN pose donc une cinquantaine de metres autour des adresses, ce qui est
	 * exactement ce qu il faut pour que les parcelles de bord soient entieres.
	 * Cadrer au plus juste sur les numeros rendrait une bande trop etroite pour
	 * s y reconnaitre.
	 *
	 * `null` quand la BAN ne publie pas de boite, ce qui arrive : la page
	 * retombe alors sur le point, comme avant.
	 */
	readonly cadre: Cadre | null;
	readonly commune: { readonly insee: string; readonly nom: string; readonly departement: string };
	readonly numeros: readonly Numero[];
}

export interface VoieBreve {
	readonly id: string;
	readonly nom: string;
	readonly nbNumeros: number;
}

export interface Commune {
	readonly insee: string;
	readonly nom: string;
	/** Le centre de la boite englobante, seul point que la source donne. */
	readonly centre: Point;
	readonly departement: { readonly code: string; readonly nom: string };
	readonly codesPostaux: readonly string[];
	readonly population: number | null;
	readonly nbNumeros: number;
	readonly voies: readonly VoieBreve[];
}

interface PointBrut {
	coordinates?: unknown;
}

interface NumeroBrut {
	id?: unknown;
	numero?: unknown;
	suffixe?: unknown;
	codePostal?: unknown;
	position?: PointBrut | null;
	parcelles?: unknown;
}

/**
 * L'identifiant cadastral d'une parcelle declaree par la BAN.
 *
 * Elle l'ecrit dans la forme des fichiers fonciers - `490353   AD0526` : code
 * departement, code direction, code commune, prefixe de section, section,
 * numero. Reconstruire le code INSEE depuis les six premiers signes DEMANDE de
 * savoir ou couper le departement, et la coupe n'est pas la meme en metropole
 * et outre-mer : c'est l'erreur que ce releve a d'abord faite, et elle rendait
 * un identifiant faux qui ne retombait sur aucune parcelle.
 *
 * On ne reconstruit donc RIEN : les neuf derniers signes portent le prefixe, la
 * section et le numero, et l'INSEE est celui de la commune de la page. Un
 * prefixe en blanc vaut `000`, hors commune fusionnee.
 */
/**
 * LES PARCELLES QUE LA BAN DECLARE AUX AUTRES NUMEROS DE LA VOIE.
 *
 * Sert a retirer le voisin des parcelles d'une adresse : le referentiel des
 * batiments numerise le TOIT et le cadastre suit le MUR, donc toute maison de
 * rue mord d'environ un metre chez son voisin et le recouvrement la designe.
 * La declaration, elle, nomme un numero. Voir `cadastre.rattacherLaParcelle`,
 * qui porte la mesure du 2026-09-08 et le cas du 128 rue de Letanduere.
 *
 * LA DERIVATION VIT ICI, PAS DANS LES TROIS SURFACES QUI L'APPELLENT. La page
 * de voie, `lib/dossiers.ts` et le plan agrandi rattachent tous les trois ; une
 * regle recopiee trois fois se corrige une fois, et c'est la lecon que
 * `rattacherLaParcelle` a deja payee le 2026-09-06.
 *
 * UN NUMERO ABSENT DE LA LISTE NE COUPE RIEN. Sans ce garde, une adresse que
 * la BAN ne connait pas verrait TOUTES les parcelles de la voie declarees
 * ailleurs, et perdrait ses secondaires sans que personne ait rien declare.
 *
 * ELLE NE DEMANDE QUE LES DEUX CHAMPS QU'ELLE LIT, et c'est ce qui la rend
 * partageable. Un site n'ecrit pas forcement ses numeros comme `Numero` : chez
 * edifiable le point est un couple `[lon, lat]` et le code postal peut manquer,
 * donc exiger le type entier obligeait a recopier ces quatre lignes plutot qu'a
 * les appeler - exactement la duplication que ce module existe pour supprimer.
 */
export function parcellesDesAutresNumeros(
	numeros: readonly { readonly id: string; readonly parcelles: readonly string[] }[],
	id: string
): readonly string[] {
	if (!numeros.some((n) => n.id === id)) return [];
	const voisines = new Set<string>();
	for (const n of numeros) {
		if (n.id === id) continue;
		for (const p of n.parcelles) voisines.add(p);
	}
	return [...voisines];
}

export function parcelleDeclaree(brut: unknown, insee: string): string | null {
	if (typeof brut !== 'string' || brut.length < 9 || insee.length !== 5) return null;
	const queue = brut.slice(-9);
	const prefixe = queue.slice(0, 3);
	const reste = queue.slice(3);
	if (!/^[0-9A-Z]{2}\d{4}$/.test(reste)) return null;
	return `${insee}${prefixe.trim() === '' ? '000' : prefixe}${reste}`;
}

interface VoieBrute {
	id?: unknown;
	idVoie?: unknown;
	nomVoie?: unknown;
	nbNumeros?: unknown;
	displayBBox?: unknown;
	position?: PointBrut | null;
	commune?: {
		code?: unknown;
		nom?: unknown;
		departement?: { code?: unknown; nom?: unknown } | null;
	} | null;
	numeros?: unknown;
}

interface CommuneBrute {
	displayBBox?: unknown;
	codeCommune?: unknown;
	nomCommune?: unknown;
	departement?: { code?: unknown; nom?: unknown } | null;
	codesPostaux?: unknown;
	population?: unknown;
	nbNumeros?: unknown;
	voies?: unknown;
}

const texte = (valeur: unknown, repli = ''): string =>
	typeof valeur === 'string' ? valeur : repli;

const nombre = (valeur: unknown): number | null =>
	typeof valeur === 'number' && Number.isFinite(valeur) ? valeur : null;

function pointDe(brut: PointBrut | null | undefined): Point | null {
	const c = brut?.coordinates;
	if (!Array.isArray(c) || c.length < 2) return null;
	const [lon, lat] = c;
	if (typeof lon !== 'number' || typeof lat !== 'number') return null;
	return { lon, lat };
}

async function json(url: string): Promise<unknown> {
	const reponse = await lire(url, JOUR);
	if (reponse.status === 404) return null;
	if (!reponse.ok) throw new Error(`Base Adresse Nationale : HTTP ${reponse.status}`);
	return reponse.json();
}

/**
 * Une voie et tous ses numeros.
 *
 * `null` quand l'identifiant n'existe pas : c'est un 404 de page, pas une
 * panne. Une voie sans numero existe (une allee privee, une voie nouvelle) et
 * rend un tableau vide, ce qui n'empeche pas la page de repondre au centre de
 * la voie.
 */
export async function voie(id: string): Promise<Voie | null> {
	const brut = (await json(`${LOOKUP}/${encodeURIComponent(id)}`)) as VoieBrute | null;
	const point = pointDe(brut?.position);
	if (!brut || point === null) return null;
	const numerosBruts = Array.isArray(brut.numeros) ? (brut.numeros as NumeroBrut[]) : [];
	const insee = texte(brut.commune?.code);
	return {
		id: texte(brut.idVoie, texte(brut.id, id)),
		nom: texte(brut.nomVoie),
		point,
		cadre: cadreDe(brut.displayBBox),
		commune: {
			insee,
			nom: texte(brut.commune?.nom),
			departement: texte(brut.commune?.departement?.nom)
		},
		numeros: numerosBruts
			.map((n): Numero | null => {
				const p = pointDe(n.position);
				const valeur = nombre(n.numero);
				if (p === null || valeur === null) return null;
				return {
					id: texte(n.id),
					numero: valeur,
					suffixe: texte(n.suffixe),
					codePostal: texte(n.codePostal),
					point: p,
					parcelles: (Array.isArray(n.parcelles) ? (n.parcelles as unknown[]) : [])
						.map((x) => parcelleDeclaree(x, insee))
						.filter((x): x is string => x !== null)
				};
			})
			.filter((n): n is Numero => n !== null)
			.sort((a, b) => a.numero - b.numero || a.suffixe.localeCompare(b.suffixe))
	};
}

/*
 * Le centre d'une boite `[ouest, sud, est, nord]`. La BAN ne donne pas de
 * centroide de commune : la boite est ce qu'on a, et son centre suffit pour les
 * couches communales (sismicite, radon, arretes). Il ne suffit PAS pour le
 * zonage ni pour l'argile, qui varient a l'interieur d'une commune, et la page
 * le dit au lieu de laisser croire le contraire.
 */
function cadreDe(brut: unknown): Cadre | null {
	const b = Array.isArray(brut) ? brut.filter((v): v is number => typeof v === 'number') : [];
	const [ouest, sud, est, nord] = b;
	return ouest !== undefined && sud !== undefined && est !== undefined && nord !== undefined
		? { ouest, sud, est, nord }
		: null;
}

function centreDe(brut: unknown): Point {
	const c = cadreDe(brut);
	return c === null
		? { lon: 0, lat: 0 }
		: { lon: (c.ouest + c.est) / 2, lat: (c.sud + c.nord) / 2 };
}

/** Une commune et ses voies, triees par nom. */
export async function commune(insee: string): Promise<Commune | null> {
	const brut = (await json(`${LOOKUP}/${encodeURIComponent(insee)}`)) as CommuneBrute | null;
	if (!brut || texte(brut.codeCommune) === '') return null;
	const voiesBrutes = Array.isArray(brut.voies) ? (brut.voies as VoieBrute[]) : [];
	return {
		insee: texte(brut.codeCommune),
		nom: texte(brut.nomCommune),
		centre: centreDe(brut.displayBBox),
		departement: {
			code: texte(brut.departement?.code),
			nom: texte(brut.departement?.nom)
		},
		codesPostaux: Array.isArray(brut.codesPostaux)
			? brut.codesPostaux.filter((c): c is string => typeof c === 'string')
			: [],
		population: nombre(brut.population),
		nbNumeros: nombre(brut.nbNumeros) ?? 0,
		voies: voiesBrutes
			.map((v) => ({
				id: texte(v.idVoie, texte(v.id)),
				nom: texte(v.nomVoie),
				nbNumeros: nombre(v.nbNumeros) ?? 0
			}))
			.filter((v) => v.id !== '' && v.nom !== '')
			.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
	};
}

export interface VoieProche {
	readonly id: string;
	readonly nom: string;
	readonly insee: string;
	readonly commune: string;
}

/**
 * La voie la plus proche d'un point.
 *
 * Le geocodeur inverse rend l'ADRESSE la plus proche, dont l'identifiant porte
 * la voie : `94081_7190_00029` donne `94081_7190`. On ne demande donc pas
 * `type=street`, qui rendrait le centre d'une voie voisine plutot que le
 * numero d'en face.
 */
export async function chercherVoieAuPoint(lon: number, lat: number): Promise<VoieProche | null> {
	const url = `https://api-adresse.data.gouv.fr/reverse/?lon=${String(lon)}&lat=${String(lat)}`;
	const brut = (await json(url)) as { features?: unknown } | null;
	const premier = Array.isArray(brut?.features)
		? (brut.features[0] as { properties?: Record<string, unknown> } | undefined)
		: undefined;
	const p = premier?.properties;
	if (p === undefined) return null;
	const id = texte(p.id).split('_').slice(0, 2).join('_');
	const nom = texte(p.street, texte(p.name));
	return id === '' || nom === ''
		? null
		: {
				id,
				nom,
				insee: texte(p.citycode),
				/*
				 * LE COUPLE RENDU EST FAUX DANS LES TROIS VILLES : le geocodeur
				 * rend `citycode` 75102 avec `city` « Paris ». Le nom sert a
				 * fabriquer l'adresse d'une page ; garder celui de la ville
				 * envoyait la porte d'une parcelle du 2e vers `/paris-75102`,
				 * une redirection de plus avant la bonne page.
				 */
				commune: nomDeLaCommune(texte(p.citycode), texte(p.city))
			};
}

export interface Voisine {
	readonly id: string;
	readonly nom: string;
	readonly metres: number;
}

/**
 * Les voies qui bordent un point, par distance croissante.
 *
 * Le geocodage inverse rend les ADRESSES les plus proches ; on en tire les
 * voies distinctes. C'est un maillage geographique reel, et c'est ce qui le
 * distingue d'une liste tiree de la commune : une page de voie liee a quatre
 * voies qu'on peut voir depuis sa fenetre sert le lecteur, une page liee a
 * quatre voies prises au hasard dans 454 ne sert que le robot.
 *
 * Cinquante adresses rendent de l'ordre de quatre a huit voies en ville, moins
 * a la campagne ou les adresses sont plus espacees. La voie de depart est
 * retiree par l'appelant, qui seul connait son identifiant.
 */
export async function voiesVoisines(lon: number, lat: number): Promise<Voisine[]> {
	const url = `${INVERSE}/?lon=${String(lon)}&lat=${String(lat)}&limit=50`;
	const brut = (await json(url)) as { features?: unknown } | null;
	if (!Array.isArray(brut?.features)) return [];
	const vues = new Map<string, Voisine>();
	for (const f of brut.features as { properties?: Record<string, unknown> }[]) {
		const p = f.properties;
		if (p === undefined) continue;
		const id = texte(p.id).split('_').slice(0, 2).join('_');
		const nom = texte(p.street, texte(p.name));
		const metres = nombre(p.distance) ?? 0;
		if (id === '' || nom === '' || vues.has(id)) continue;
		vues.set(id, { id, nom, metres: Math.round(metres) });
	}
	return [...vues.values()].sort((a, b) => a.metres - b.metres);
}

export interface Trouvaille {
	readonly id: string;
	readonly libelle: string;
	readonly type: 'housenumber' | 'street' | 'municipality' | 'locality';
	readonly insee: string;
	readonly commune: string;
	readonly voie: string;
	readonly numero: string;
	readonly point: Point;
}

interface TrouvailleBrute {
	properties?: {
		id?: unknown;
		label?: unknown;
		type?: unknown;
		citycode?: unknown;
		city?: unknown;
		street?: unknown;
		name?: unknown;
		housenumber?: unknown;
	} | null;
	geometry?: PointBrut | null;
}

const TYPES = new Set(['housenumber', 'street', 'municipality', 'locality']);

/**
 * Le geocodage d'une saisie libre, pour la recherche et l'autocompletion.
 *
 * Le geocodeur rend un `id` de la meme forme que celui du lookup, ce qui permet
 * de passer directement de la saisie a la page sans deuxieme appel.
 */
export async function chercher(saisie: string, limite = 7): Promise<Trouvaille[]> {
	const q = saisie.trim();
	if (q.length < 3) return [];
	const url = `${GEOCODE}/?q=${encodeURIComponent(q)}&limit=${String(limite)}&autocomplete=1`;
	const brut = (await json(url)) as { features?: unknown } | null;
	const features = Array.isArray(brut?.features) ? (brut.features as TrouvailleBrute[]) : [];
	return features
		.map((f) => {
			const point = pointDe(f.geometry);
			const type = texte(f.properties?.type);
			if (point === null || !TYPES.has(type)) return null;
			return {
				id: texte(f.properties?.id),
				libelle: texte(f.properties?.label),
				type: type as Trouvaille['type'],
				insee: texte(f.properties?.citycode),
				commune: texte(f.properties?.city),
				// Sur une voie le nom est dans `name` ; sur un numero il est dans
				// `street`, `name` portant alors « 29 Rue de la Petite Saussaie ».
				voie: texte(f.properties?.street, type === 'street' ? texte(f.properties?.name) : ''),
				numero: texte(f.properties?.housenumber),
				point
			};
		})
		.filter((t): t is Trouvaille => t !== null && t.id !== '');
}
