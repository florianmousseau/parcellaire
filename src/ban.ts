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

const LOOKUP = 'https://plateforme.adresse.data.gouv.fr/lookup';
const GEOCODE = 'https://api-adresse.data.gouv.fr/search';
const INVERSE = 'https://api-adresse.data.gouv.fr/reverse';
const UA = 'aucadastre/1.0 (+https://aucadastre.fr)';

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
	const reponse = await fetch(url, { headers: { 'User-Agent': UA } });
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
	return {
		id: texte(brut.idVoie, texte(brut.id, id)),
		nom: texte(brut.nomVoie),
		point,
		cadre: cadreDe(brut.displayBBox),
		commune: {
			insee: texte(brut.commune?.code),
			nom: texte(brut.commune?.nom),
			departement: texte(brut.commune?.departement?.nom)
		},
		numeros: numerosBruts
			.map((n) => {
				const p = pointDe(n.position);
				const valeur = nombre(n.numero);
				return p === null || valeur === null
					? null
					: {
							id: texte(n.id),
							numero: valeur,
							suffixe: texte(n.suffixe),
							codePostal: texte(n.codePostal),
							point: p
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
		: { id, nom, insee: texte(p.citycode), commune: texte(p.city) };
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
