/*
 * Le plan cadastral informatise de la DGFiP, servi par l'API Carto de l'IGN.
 *
 * LE PIEGE, mesure le 2026-09-04 : `?lon=&lat=` est accepte, rend 200, et
 * IGNORE les deux parametres. La reponse est alors la premiere page du
 * catalogue NATIONAL - la premiere parcelle recue etait a Charix, dans l'Ain,
 * pour un point de Vitry-sur-Seine. Seul `geom=<GeoJSON encode>` filtre.
 * Meme famille que le `?insee=` du Geoportail (`docs/geoportail.md`).
 *
 * `contenance` est la surface CADASTRALE, en metres carres. Elle est fiscale :
 * elle ne vaut pas mesurage, et l'ecart avec un arpentage de geometre est une
 * question posee tous les jours par le public. La page le dit.
 */

import { communeDuCadastre, nomDeLaCommune } from './arrondissements.ts';
import { anneauxDe, contient, distanceAuBord, type Contour } from './geometrie.ts';
import { lire, SEMAINE } from './reseau.ts';

const API = 'https://apicarto.ign.fr/api/cadastre';

export interface Parcelle {
	readonly idu: string;
	readonly section: string;
	readonly numero: string;
	readonly prefixe: string;
	readonly contenance: number;
	readonly insee: string;
	readonly commune: string;
	readonly contour: Contour;
}

export interface Feuille {
	readonly section: string;
	readonly feuille: number;
	readonly echelle: string;
	readonly edition: number | null;
}

interface Proprietes {
	idu?: unknown;
	section?: unknown;
	numero?: unknown;
	com_abs?: unknown;
	contenance?: unknown;
	code_insee?: unknown;
	nom_com?: unknown;
	feuille?: unknown;
	echelle?: unknown;
	edition?: unknown;
}

interface Trait {
	properties?: Proprietes | null;
	geometry?: { type?: unknown; coordinates?: unknown } | null;
}

const texte = (valeur: unknown, repli = ''): string =>
	typeof valeur === 'string' ? valeur : repli;

const entier = (valeur: unknown): number | null =>
	typeof valeur === 'number' && Number.isFinite(valeur) ? valeur : null;

/*
 * UNE SEULE OBSERVATION NE DESIGNE PAS UNE CAUSE (2026-09-10).
 *
 * Ces appels ont ete branches sur `reseau.lire` le matin, debranches le soir,
 * et rebranches dans la foulee. La boucle vaut d'etre ecrite, parce que c'est
 * le raisonnement qui etait faux, pas le code.
 *
 * Le soir, sur `edifiable.fr/plu/trelaze-49353/voie/rue-emile-chaillou?n=22`,
 * la page ne servait plus qu'AD 525 : la deuxieme parcelle du numero avait
 * disparu. J'ai retire `cf` dans `node_modules`, reconstruit, et les deux
 * parcelles sont revenues. Conclusion tiree : le cache d'arete change ce que
 * la source repond. Reverte, commentaire ecrit ici meme, et c'etait FAUX.
 *
 * J'avais change DEUX choses et lu comme si une seule avait bouge : l'option
 * `cf`, et le dossier `--persist-to` du serveur local. Remesure derriere :
 *
 *   pin incrimine, etat local NEUF        -> AD 525 et AD 526
 *   pin incrimine, ANCIEN etat local      -> AD 525 et AD 526
 *   les deux, sur le 12 de la meme rue    -> AD 515 et AD 514
 *   apicarto appele deux fois avec `cf` et deux fois sans, meme requete
 *     -> meme statut, memes 55 709 octets, memes 80 parcelles, AD 525,
 *        AD 526 et AD 984 dans les quatre. Le cache marche : 106 ms au
 *        deuxieme appel contre 299 au premier.
 *
 * La panne du soir ne s'est jamais reproduite. Reste une reponse partielle
 * d'apicarto pendant une minute, ce qui est un fait de la source, pas du code.
 *
 * CE QUI EN RESTE, ET QUI EST LA VRAIE LECON : une page servie reste le bon
 * juge - un type et un test unitaire ne voient rien de tout cela - mais une
 * SEULE lecture ne tranche rien. Avant d'accuser un changement, rejouer la configuration qui a
 * echoue - a l'identique, en ne bougeant qu'UNE variable - et mesurer la source
 * elle-meme plutot que la page, qui a dix raisons de varier.
 */
async function traits(couche: string, geom: object, limite?: number): Promise<Trait[]> {
	const parametres = new URLSearchParams({ geom: JSON.stringify(geom) });
	if (limite !== undefined) parametres.set('_limit', String(limite));
	const reponse = await lire(`${API}/${couche}?${parametres.toString()}`, SEMAINE);
	if (!reponse.ok) throw new Error(`API Carto cadastre : HTTP ${reponse.status}`);
	const brut = (await reponse.json()) as { features?: unknown };
	return Array.isArray(brut.features) ? (brut.features as Trait[]) : [];
}

const point = (lon: number, lat: number) => ({ type: 'Point', coordinates: [lon, lat] });

const parcelleDe = (t: Trait): Parcelle | null => {
	const p = t.properties;
	const idu = texte(p?.idu);
	if (idu === '') return null;
	return {
		idu,
		section: texte(p?.section),
		numero: texte(p?.numero),
		prefixe: texte(p?.com_abs, '000'),
		contenance: entier(p?.contenance) ?? 0,
		/*
		 * L'INSEE SE LIT DANS L'IDENTIFIANT, PAS DANS `code_insee`. Les deux ne
		 * different que dans les trois villes a arrondissements, ou `code_insee`
		 * rend 75056 pour une parcelle du 2e - et c'est le code de
		 * l'arrondissement qui adresse la page.
		 */
		insee: idu.slice(0, 5),
		commune: nomDeLaCommune(idu.slice(0, 5), texte(p?.nom_com)),
		contour: anneauxDe(t.geometry)
	};
};

/** La parcelle qui contient un point, avec son contour. */
export async function parcelleAuPoint(lon: number, lat: number): Promise<Parcelle | null> {
	const [premier] = await traits('parcelle', point(lon, lat));
	return premier ? parcelleDe(premier) : null;
}

export interface Identifiant {
	readonly insee: string;
	readonly prefixe: string;
	readonly section: string;
	readonly numero: string;
}

/**
 * Les quatre morceaux d'un identifiant cadastral, ou `null`.
 *
 * Fonction a part et couverte par un test, parce qu'une expression reguliere
 * qui perd un antislash reste valide, passe le lint et le typage, et rend
 * simplement `null` sur tout : c'est arrive ici meme, et seule une porte en
 * 404 permanente l'a fait voir.
 */
export function decouperIdentifiant(idu: string): Identifiant | null {
	const trouve = /^(\d[0-9AB]\d{3})(\d{3})([0-9A-Z]{2})(\d{4})$/.exec(idu);
	if (trouve === null) return null;
	const [, insee, prefixe, section, numero] = trouve;
	return insee === undefined ||
		prefixe === undefined ||
		section === undefined ||
		numero === undefined
		? null
		: { insee, prefixe, section, numero };
}

/**
 * La parcelle designee par son identifiant a quatorze signes.
 *
 * L'API ne cherche pas sur `idu` : elle veut le code commune, la section et le
 * numero separement. Le decoupage se fait donc ici, et un identifiant mal forme
 * rend `null` plutot qu'une requete qui ramenerait le catalogue national.
 */
export async function parcelleParIdentifiant(idu: string): Promise<Parcelle | null> {
	const morceaux = decouperIdentifiant(idu);
	if (morceaux === null) return null;
	const parametres = new URLSearchParams({
		code_insee: communeDuCadastre(morceaux.insee),
		section: morceaux.section,
		numero: morceaux.numero
	});
	const reponse = await lire(`${API}/parcelle?${parametres.toString()}`, SEMAINE);
	if (!reponse.ok) return null;
	const brut = (await reponse.json()) as { features?: unknown };
	const rendus = Array.isArray(brut.features) ? (brut.features as Trait[]) : [];
	/*
	 * LA BONNE SE CHERCHE, elle n'est jamais tenue pour la premiere. Sous une
	 * ville a arrondissements, une section et un numero designent autant de
	 * parcelles qu'il y a d'arrondissements - soixante-cinq pour « 0C 59 » a
	 * Marseille - et `features[0]` ne rendait alors que du null.
	 */
	const trouve = rendus.find((t) => texte(t.properties?.idu) === idu);
	return trouve ? parcelleDe(trouve) : null;
}

/** La feuille cadastrale du point : son echelle et son edition, comme sur un cartouche. */
export async function feuilleAuPoint(lon: number, lat: number): Promise<Feuille | null> {
	const [premier] = await traits('division', point(lon, lat));
	const p = premier?.properties;
	if (!p) return null;
	return {
		section: texte(p.section),
		feuille: entier(p.feuille) ?? 1,
		echelle: texte(p.echelle),
		edition: entier(p.edition)
	};
}

/**
 * Les parcelles d'un rectangle autour d'un point, pour tracer le plan.
 *
 * Le rectangle est donne en degres, corrige de la latitude a l'affichage et non
 * ici : une bande de 0,001 degre de longitude mesure 111 m a l'equateur et 73 m
 * a Paris, ce qui etire le plan de moitie si on l'ignore.
 */
export async function parcellesAutour(
	lon: number,
	lat: number,
	rayonDegres = 0.0011
): Promise<Parcelle[]> {
	const [o, e] = [lon - rayonDegres, lon + rayonDegres];
	const [s, n] = [lat - rayonDegres * 0.66, lat + rayonDegres * 0.66];
	const boite = {
		type: 'Polygon',
		coordinates: [
			[
				[o, s],
				[e, s],
				[e, n],
				[o, n],
				[o, s]
			]
		]
	};
	const trouves = await traits('parcelle', boite, 200);
	return trouves.map(parcelleDe).filter((p): p is Parcelle => p !== null && p.contour.length > 0);
}

/**
 * Les parcelles d'un CADRE, pour dessiner une voie entiere et non un point.
 *
 * POURQUOI PAS `parcellesAutour`. Elle ouvre une fenetre de taille fixe autour
 * d'un point, et le point d'une voie est un point comme un autre : rue du
 * College a Renaze, il est a 9 m du numero le plus proche et a 59 m du plus
 * loin. Mesure du 2026-09-06 sur soixante voies de deux communes, la moitie
 * sont plus longues que cette fenetre - mediane 163 m a Renaze, troisieme
 * quartile 424 m, la plus longue 1 279 m.
 *
 * LE PLAFOND EST A CINQ CENTS, ET CE N'EST PAS UN CONFORT. L'API tronque EN
 * SILENCE : la rue Bourdais a Renaze tient 302 parcelles, et `_limit=200` en
 * rend exactement 200, sans un mot. Le plan sortait alors amputé d'un tiers
 * sans que rien ne le dise. Verifie le meme jour : a 500 elle rend les 302, et
 * plus vite qu'a 200.
 *
 * La MARGE aere le cadre : une voie collee au bord de son plan se lit comme
 * une voie coupee.
 */
export async function parcellesDuCadre(
	cadre: {
		readonly ouest: number;
		readonly sud: number;
		readonly est: number;
		readonly nord: number;
	},
	marge = 0.0002
): Promise<Parcelle[]> {
	const [o, e] = [cadre.ouest - marge, cadre.est + marge];
	const [s, n] = [cadre.sud - marge * 0.66, cadre.nord + marge * 0.66];
	const boite = {
		type: 'Polygon',
		coordinates: [
			[
				[o, s],
				[e, s],
				[e, n],
				[o, n],
				[o, s]
			]
		]
	};
	const trouves = await traits('parcelle', boite, 500);
	return trouves.map(parcelleDe).filter((p): p is Parcelle => p !== null && p.contour.length > 0);
}

/**
 * L'identifiant cadastral, ecrit comme il se lit.
 *
 * `94081000BQ0134` porte le code commune, un prefixe de commune absorbee, la
 * section et le numero. Le prefixe `000` est le cas courant et ne s'affiche
 * pas ; un prefixe non nul signale une commune fusionnee et doit se voir.
 */
export function libelleParcelle(p: Parcelle): string {
	const numero = p.numero.replace(/^0+(?=\d)/, '');
	const section = sectionLisible(p.section);
	return p.prefixe === '000' ? `${section} ${numero}` : `${p.prefixe} ${section} ${numero}`;
}

/**
 * Une section cadastrale, ecrite comme sur un plan.
 *
 * La source la rend TOUJOURS sur deux signes, en comblant a gauche par un zero :
 * la section E arrive en `0E`, et « 0E 185 » ne s'ecrit sur aucun plan. Les
 * sections a deux lettres passent telles quelles.
 */
export const sectionLisible = (section: string): string => section.replace(/^0(?=[A-Z])/, '');

/**
 * Une parcelle de l'adresse, avec ce qui la rattache a elle.
 *
 * `part` est la portion du BATIMENT posee dessus, telle que le referentiel des
 * batiments la mesure ; `declaree` dit que la Base Adresse Nationale nomme
 * cette parcelle pour ce numero. Les deux sont affiches : une part de 12 % et
 * une declaration ne se lisent pas pareil, et le lecteur a le droit de juger.
 */
export interface ParcelleDeLAdresse {
	readonly parcelle: Parcelle;
	readonly part: number | null;
	readonly declaree: boolean;
}

/**
 * Comment la parcelle a ete rattachee a l'adresse.
 *
 * Le `par` n'est pas un detail d'implementation : c'est ce que les surfaces
 * DISENT au lecteur, et les quatre reponses n'ont pas la meme force. La page
 * ecrit « Parcelle », « Parcelle du bâtiment » ou « Parcelle la plus proche »
 * selon ce champ, et le jumeau machine la meme chose.
 *
 * `autres` porte les parcelles SUPPLEMENTAIRES du meme numero, la principale
 * exclue : une maison s'etale, et une adresse en couvre souvent deux.
 */
export type Rattachement = {
	readonly parcelle: Parcelle;
	readonly par: 'point' | 'batiment' | 'declaree' | 'bord';
	/** La distance au bord, uniquement quand `par` vaut `bord`. */
	readonly metres?: number;
	readonly autres: readonly ParcelleDeLAdresse[];
	/** La part du batiment posee sur la parcelle principale, si mesuree. */
	readonly part: number | null;
};

/** La parcelle d'un identifiant, parmi celles deja chargees. */
const parIdentifiant = (parcelles: readonly Parcelle[], idu: string): Parcelle | undefined =>
	parcelles.find((p) => p.idu === idu);

/**
 * QUELLES PARCELLES SONT CELLES DE CETTE ADRESSE, en un seul endroit.
 *
 * Cette decision a vecu en DEUX exemplaires jusqu'au 2026-09-06 - la page de
 * voie et `lib/dossiers.ts`, qui sert l'API et le jumeau machine - et les deux
 * copies n'ont pas ete corrigees ensemble. Elle vit ici, et les deux surfaces
 * l'appellent.
 *
 * UNE ADRESSE EN COUVRE SOUVENT DEUX, et la page n'en servait qu'une jusqu'au
 * 2026-09-07. Florian : *« le 22 rue Emile Chaillou a Trelaze a deux parcelles,
 * 525 et 526. Ma femme m'a dit que le cadastre le sait »*. Il le sait par deux
 * chemins, et il fallait les deux : le referentiel des batiments mesure la part
 * du batiment posee sur chaque parcelle (AD 525 83,9 %, AD 526 11,7 %, AD 984
 * 4,5 % - la troisieme est un debord, `PART_MINIMALE` la coupe), et la Base
 * Adresse Nationale DECLARE AD 526 pour ce numero. La reponse est leur union.
 *
 * Quatre etages pour la principale, du plus sur au plus faible :
 *
 * 1. `point` - une parcelle contient le point de l'adresse. Aucune hypothese.
 * 2. `batiment` - le referentiel donne le batiment de CE numero et les
 *    parcelles qu'il couvre. C'est la reponse que le lecteur cherche quand le
 *    point de l'adresse est pose sur la chaussee, ce qui est le cas ordinaire.
 * 3. `declaree` - la BAN nomme une parcelle pour ce numero et le cadastre la
 *    connait, mais aucun batiment ne repond : un terrain nu, une adresse neuve.
 * 4. `bord` - la plus proche, mesuree a son BORD, avec sa distance.
 *
 * ET LA PARCELLE DU VOISIN N'EST PAS LA SIENNE (2026-09-08).
 *
 * Florian, sur `aucadastre.fr/angers-49007/rue-de-letanduere-4790?n=128` :
 * *« 128 rue de letandure c dm 145 et dm 304 ? verifie ? »*. Non. Le
 * referentiel mesure DM 145 a 88,99 % et DM 304 a 10,07 %, et le second
 * chiffre est vrai sans etre un fait de propriete : le chevauchement est une
 * BANDE de 10,9 m de long sur 0,99 m de large le long de la limite mitoyenne.
 * Le referentiel numerise le TOIT, le cadastre suit le MUR ; un metre de debord
 * plus le calage des deux plans, et toute maison de rue mord chez son voisin.
 * Le 128ter deborde en retour sur DM 145, 9,1 m2, bande de 1,00 m.
 *
 * La BAN tranche, parce qu'elle DECLARE un proprietaire par numero : DM 0304
 * est declaree au 126, DM 0145 au 128. Une parcelle que la BAN nomme pour un
 * AUTRE numero de la voie ne peut pas etre une parcelle de ce numero-ci.
 *
 * Ce n'est pas un seuil de part qui repare ca. Mesure du 2026-09-08 sur neuf
 * voies de neuf communes - Angers, Trelaze, Vitry, Renaze, Muret, Morlaix,
 * Bordeaux, Lyon 1er, Lille - 970 numeros, 913 avec un batiment, 250 parcelles
 * secondaires :
 *
 *     part de la secondaire | min   | mediane | max
 *     celles a couper       | 5,0 % | 12,5 %  | 33,4 %
 *     celles a garder       | 5,1 % | 10,1 %  | 43,6 %
 *
 * Les deux populations se RECOUVRENT sur toute leur etendue : aucun seuil ne
 * les separe, seule la declaration le fait. 162 des 250 sont declarees a un
 * autre numero, 16 a ce numero-ci, 72 a personne. Sur la seule rue de
 * Letanduere, 48 des 54.
 *
 * LA REGLE NE TOUCHE JAMAIS LA PRINCIPALE, et elle exempte ce que la BAN
 * declare AUSSI pour ce numero. C'est ce qui garde le cas fondateur : au 22 rue
 * Emile Chaillou, AD 526 est declaree au 22, elle reste. Au 12 de la meme rue,
 * AD 0516 a 11 % est declaree au 14 : elle part. A Renaze, le 3 perd AD 146,
 * qui est la parcelle du 1b - celle-la meme que ce depot avait deja nommee de
 * travers le 2026-09-06.
 *
 * Mesure du 2026-09-06 sur quatorze numeros de la rue Pasteur a Vitry : neuf
 * repondent par le batiment, quatre par le point, un seul par le bord. Mesure
 * du 2026-09-07 sur 72 adresses de six communes : 11 en couvrent plusieurs.
 */
export function rattacherLaParcelle(
	auPoint: Parcelle | null,
	autour: readonly Parcelle[],
	lon: number,
	lat: number,
	batiment: {
		readonly lon: number;
		readonly lat: number;
		readonly parcelles: readonly { readonly idu: string; readonly part: number }[];
	} | null,
	/** Ce que la BAN declare pour ce numero, en identifiants cadastraux. */
	declarees: readonly string[] = [],
	/**
	 * Ce que la BAN declare pour les AUTRES numeros de la voie. Une parcelle
	 * qui y figure appartient au voisin : le batiment ne la couvre que par son
	 * debord de toit. Voir `ban.parcellesDesAutresNumeros`.
	 */
	declareesAilleurs: readonly string[] = []
): Rattachement | null {
	/*
	 * TOUT CE QUI PORTE L'ADRESSE, dans l'ordre de la part couverte. La
	 * declaration de la BAN entre meme sous le seuil : c'est une declaration,
	 * pas une mesure de recouvrement, et elle designe justement la parcelle que
	 * la geometrie sous-estime.
	 */
	const parts = new Map((batiment?.parcelles ?? []).map((p) => [p.idu, p.part]));
	const portees: ParcelleDeLAdresse[] = [];
	const vues = new Set<string>();
	for (const idu of [...parts.keys(), ...declarees]) {
		if (vues.has(idu)) continue;
		const trouvee = parIdentifiant(autour, idu);
		if (trouvee === undefined) continue;
		vues.add(idu);
		portees.push({
			parcelle: trouvee,
			part: parts.get(idu) ?? null,
			declaree: declarees.includes(idu)
		});
	}
	portees.sort((a, b) => (b.part ?? 0) - (a.part ?? 0));

	/*
	 * Ce qui reste une fois la principale nommee, dans le meme ordre, LE VOISIN
	 * RETIRE. La coupe ne porte que sur les secondaires - la principale sort
	 * des quatre etages ci-dessous et n'est jamais remise en cause ici - et
	 * elle epargne ce que la BAN declare AUSSI pour ce numero, une parcelle
	 * pouvant porter deux numeros a la fois.
	 */
	const duVoisin = new Set(declareesAilleurs);
	const autres = (principale: Parcelle): ParcelleDeLAdresse[] =>
		portees.filter(
			(p) => p.parcelle.idu !== principale.idu && !(duVoisin.has(p.parcelle.idu) && !p.declaree)
		);
	const partDe = (p: Parcelle): number | null => parts.get(p.idu) ?? null;

	if (auPoint !== null) {
		return { parcelle: auPoint, par: 'point', autres: autres(auPoint), part: partDe(auPoint) };
	}
	const premiere = portees[0];
	if (premiere !== undefined) {
		return {
			parcelle: premiere.parcelle,
			par: premiere.part === null ? 'declaree' : 'batiment',
			autres: autres(premiere.parcelle),
			part: premiere.part
		};
	}
	if (batiment !== null) {
		const porteuse = parcelleQuiContient(autour, batiment.lon, batiment.lat);
		if (porteuse !== null) {
			return { parcelle: porteuse, par: 'batiment', autres: [], part: null };
		}
	}
	const voisine = parcelleLaPlusProche(autour, lon, lat);
	return voisine === null
		? null
		: {
				parcelle: voisine.parcelle,
				par: 'bord',
				metres: voisine.metres,
				autres: [],
				part: null
			};
}

/**
 * La parcelle qui CONTIENT un point, parmi celles deja chargees.
 *
 * Sert a rattacher une adresse par son BATIMENT : le referentiel des batiments
 * rend le point du batiment de ce numero, et c'est la parcelle qui le porte
 * qu'on nomme. Aucun appel de plus - `parcellesAutour` a deja ramene tout le
 * voisinage, et un batiment d'adresse y est toujours.
 */
export function parcelleQuiContient(
	parcelles: readonly Parcelle[],
	lon: number,
	lat: number
): Parcelle | null {
	return parcelles.find((p) => contient(p.contour, lon, lat)) ?? null;
}

/**
 * La parcelle la plus proche d'un point, avec sa distance A SON BORD.
 *
 * POURQUOI CE REPLI EXISTE : le point d'une adresse a la Base Adresse Nationale
 * est un point d'ENTREE, souvent pose sur la voie - et le domaine public n'est
 * pas cadastre. Au 60 rue Pasteur a Vitry, aucune parcelle ne contient le
 * point, et le premier bloc de la page sortait vide alors que le zonage, lui,
 * repondait.
 *
 * LA DISTANCE SE MESURE AU BORD, ET LE CENTRE DONNAIT UNE AUTRE PARCELLE. Cette
 * fonction a compare les CENTRES jusqu'au 2026-09-06, ce qui elit la petite
 * parcelle d'a cote contre la grande qui touche l'adresse : au 60 rue Pasteur,
 * E 185 (234 m2, centre a 16 m, bord a 3 m) l'emportait sur E 107 (372 m2,
 * centre a 27 m, bord a 1 m) - et c'est E 107 qui porte le batiment. Sur quatre
 * numeros de cette seule voie, la parcelle servie n'etait pas la plus proche,
 * et une autre etait a un metre. Voir `geometrie.distanceAuBord`.
 *
 * La distance est RENDUE, pas avalee : une parcelle a trois metres est une
 * hypothese, pas une reponse, et la page doit pouvoir le dire.
 */
export function parcelleLaPlusProche(
	parcelles: readonly Parcelle[],
	lon: number,
	lat: number
): { readonly parcelle: Parcelle; readonly metres: number } | null {
	let retenue: Parcelle | null = null;
	let plusCourt = Infinity;
	for (const p of parcelles) {
		const metres = distanceAuBord(p.contour, lon, lat);
		if (metres < plusCourt) {
			plusCourt = metres;
			retenue = p;
		}
	}
	return retenue === null || plusCourt > 40
		? null
		: { parcelle: retenue, metres: Math.round(plusCourt) };
}
