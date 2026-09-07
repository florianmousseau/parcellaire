/*
 * cadastre.gouv.fr : LE LIEN QUI L'OUVRE AU BON ENDROIT, ET SON PLAN JAUNE.
 *
 * Ce fichier ne parle que de la DGFiP. `carte-officielle.ts` parle de
 * cadastre.data.gouv.fr, qui est un autre producteur et un autre contrat.
 *
 * ============================================================================
 * 1. LE LIEN : DEUX APPELS A LA MEME URL
 * ============================================================================
 *
 * Leur recherche accepte le GET et NE VERIFIE PAS son `CSRF_TOKEN`, alors que
 * le formulaire est en `method="post"` et le porte. Elle exige en revanche une
 * session : le premier appel rend leur accueil en posant `JSESSIONID`, le
 * second rend le resultat. Deux appels a la MEME adresse suffisent donc, et
 * c'est ce que `public/page.js` fait sur les liens marques
 * `data-deux-appels` - le lien nu reste bon, mais seulement au deuxieme clic.
 *
 * Mesure du 2026-09-07 : une session posee par `popupAccueil.do`, `aide.do`,
 * `error.do` ou `dynJS.do` NE SUFFIT PAS ; seule une page Struts complete arme
 * le formulaire, et l'URL cible en est une puisqu'elle rend l'accueil au
 * premier passage.
 *
 * CE QU'ON N'ATTEINT PAS, ET POURQUOI ON S'ARRETE LA. Les actions
 * `afficherCarteCommune.do`, `afficherCarteParcelle.do`, `afficherCarteFeuille.do`
 * et `imprimerExtraitCadastral*.do` verifient bien le jeton, contre celui de la
 * session et valeur comprise. Le jeton est illisible depuis notre origine :
 * on depose donc le lecteur sur la page de RESULTAT, ou la loupe
 * « Voir (gratuit) » ouvre le plan en un clic. Pistes fermees, toutes mesurees :
 * `;jsessionid=` dans le chemin, le rejeu du `lastForward`,
 * `keepVolatileSession=`, et `codeCommune=<code>` - qui n'est accepte que s'il
 * figure dans la liste de choix courante de la session.
 *
 * LE NOM DE COMMUNE DECIDE DU TAUX, ET IL NE SE DERIVE PAS. Leur moteur ne
 * tombe directement que sur une correspondance EXACTE ; sinon il rend une liste
 * de choix ou la commune est presente, et le lecteur clique une ligne de plus.
 * Or leur referentiel n'ecrit pas les noms comme le COG : recensement du
 * 2026-09-07 sur 34 914 communes, le nom sans accents et tirets gardes n'en
 * couvre que **82,6 %** ; 11,4 % passent aux espaces, 6,0 % abregent `SAINT` en
 * `ST`, changent l'apostrophe en espace ou soudent des mots. Aucune regle ne
 * couvre le reste, et l'echantillon MENT : sur 62 communes tirees au sort la
 * premiere forme donnait 90 %.
 *
 * D'ou `donnees/libelles-cadastre.ts`, moissonne chez eux, qui ne porte que les
 * 6 074 exceptions. Le nom sans accents reste le repli, pour les dix-neuf
 * communes qu'ils ne listent pas - des iles sans plan vecteur.
 *
 * ============================================================================
 * 2. LE PLAN JAUNE, SERVI EN IMAGE PAR LEUR WMS INSPIRE
 * ============================================================================
 *
 * Public, sans clef, sans compte, annonce sur leur propre page « Mon service
 * WMS ». C'est le rendu de la DGFiP lui-meme : feuille creme, batiments
 * jaunes, numeros de parcelle, noms de voie. 200 communes tirees au sort, 200
 * dessinent.
 *
 * TROIS PIEGES, TOUS MESURES LE 2026-09-07 :
 *
 *   1. le service est PAR COMMUNE - le code INSEE est dans le chemin - donc un
 *      cadre a cheval sur deux communes laisse l'autre en blanc. C'est le prix
 *      de ce fond, et c'est pourquoi il n'est pas celui par defaut ;
 *   2. il ne connait PAS `CRS:84`. En `EPSG:4326` et WMS 1.3.0, la BBOX veut
 *      l'ordre LATITUDE, LONGITUDE - l'inverse de `data.geopf.fr` dans
 *      `fonds.ts`. Invertir rend une image vide, pas une erreur ;
 *   3. L'IMAGE TIENT DANS 1280 x 1024, ET PAS MOINS DE 100 DE CHAQUE COTE.
 *      Hors de la, un `400 Taille de l'image invalide` en HTML Tomcat, pas une
 *      exception WMS. Bornes bissectees le 2026-09-07 : 1280 et 1024 passent,
 *      1281 et 1025 refusent ; 100 passe, 99 refuse.
 *
 *      LES DEUX PLAFONDS SONT DIFFERENTS, et la premiere mesure ne l'a pas vu :
 *      elle faisait varier UN cote en gardant l'autre petit, donc 1280 de large
 *      passait et le plafond de hauteur n'etait jamais atteint. La page a servi
 *      un 1278 x 1280 et une image vide. Une bissection par axe ne trouve que
 *      les bornes que son axe porte ; ici il fallait les CROISER.
 */

/*
 * LEUR LIBELLE DE COMMUNE : LE SITE LE SAIT, PAS LE PAQUET.
 *
 * Leur champ « Ville, Commune » n'accepte pas le nom officiel mais LEUR
 * libelle - « CHAMP-SAINT-PERE (LE) », « LA CHAPELLE ST LUC ». Il s'obtient
 * en moissonnant leur service, donc il est date, donc il vit dans le site qui
 * le regenere. Un paquet qui embarquerait sa propre copie servirait un jour
 * une liste perimee sans pouvoir la refaire.
 */
export type LibelleCadastre = (insee: string) => string | null;

/** Ce que leur service accepte. Bornes mesurees, pas devinees. */
const COTE_MIN = 100;
const LARGEUR_MAX = 1280;
const HAUTEUR_MAX = 1024;

/** Les couches du plan, dans l'ordre ou elles se posent. */
const COUCHES = [
	'CP.CadastralParcel',
	'BU.Building',
	'DETAIL_TOPO',
	'HYDRO',
	'VOIE_COMMUNICATION',
	'LIEUDIT',
	'AMORCES_CAD'
].join(',');

const WMS = 'https://inspire.cadastre.gouv.fr/scpc';
const RECHERCHE = 'https://www.cadastre.gouv.fr/scpc';

/**
 * Le departement tel que leur formulaire l'ecrit : TROIS caracteres.
 *
 * `094`, `02A`, `971`. Les 101 valeurs sont celles de leur `<select>` ; 975,
 * 977 et 978 n'y sont pas, et leurs communes retombent sur la recherche par
 * nom seul.
 */
export function departementCadastre(insee: string): string {
	const dep = insee.startsWith('97') ? insee.slice(0, 3) : insee.slice(0, 2);
	return dep.length === 3 ? dep : `0${dep}`;
}

/**
 * Le nom de commune sous la forme la plus courante chez eux : sans accents, en
 * capitales, LES TIRETS GARDES. Vrai pour 82,6 % des communes ; les autres sont
 * dans la table, et c'est `villePourLaRecherche` qui tranche.
 */
export function nomPourLaRecherche(nom: string): string {
	return nom.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

/** Ce qu'on ecrit dans leur champ « Ville, Commune » : leur libelle, ou le nom. */
export function villePourLaRecherche(
	insee: string,
	nom: string,
	libelleCadastre: LibelleCadastre = () => null
): string {
	return libelleCadastre(insee) ?? nomPourLaRecherche(nom);
}

export interface ReferenceCadastrale {
	/** Le prefixe de la feuille, `000` hors commune fusionnee. */
	readonly prefixe: string;
	/** La section telle qu'elle s'ecrit sur un plan : `AB`, `E`. */
	readonly section: string;
	/** Le numero sans ses zeros de tete. */
	readonly numero: string;
}

/**
 * L'adresse de leur recherche, posee sur la parcelle quand on en a une, sur la
 * commune sinon.
 *
 * A ouvrir DEUX FOIS : le premier appel pose la session, le second rend le
 * resultat. `public/page.js` s'en charge sur les liens `data-deux-appels`.
 */
export function rechercheCadastreGouv(
	commune: { readonly nom: string; readonly insee: string },
	reference: ReferenceCadastrale | null = null,
	/** Le releve du site : leur libelle pour cette commune, ou null. */
	libelleCadastre: LibelleCadastre = () => null
): string {
	const parametres = new URLSearchParams({
		ville: villePourLaRecherche(commune.insee, commune.nom, libelleCadastre),
		codeDepartement: departementCadastre(commune.insee)
	});
	if (reference === null) return `${RECHERCHE}/rechercherPlan.do?${parametres.toString()}`;
	parametres.set('rechercheType', '1');
	parametres.set('prefixeParcelle', reference.prefixe);
	parametres.set('sectionLibelle', reference.section);
	parametres.set('numeroParcelle', reference.numero);
	return `${RECHERCHE}/rechercherParReferenceCadastrale.do?${parametres.toString()}`;
}

/**
 * La taille demandee, ramenee dans ce que leur service accepte SANS TOUCHER AU
 * RAPPORT DES COTES.
 *
 * Rogner un seul cote deformerait l'image : le serveur etale la BBOX sur les
 * pixels donnes, et un rapport different du cadre decale les traits par rapport
 * au dessin pose dessus.
 */
export function tailleAcceptee(
	largeur: number,
	hauteur: number
): { readonly largeur: number; readonly hauteur: number } {
	// Le meme facteur sur les deux cotes : c'est ce qui garde le rapport.
	const reduire = Math.min(1, LARGEUR_MAX / largeur, HAUTEUR_MAX / hauteur);
	const agrandir = Math.max(1, COTE_MIN / (largeur * reduire), COTE_MIN / (hauteur * reduire));
	const facteur = reduire * agrandir;
	return {
		largeur: Math.min(LARGEUR_MAX, Math.max(COTE_MIN, Math.round(largeur * facteur))),
		hauteur: Math.min(HAUTEUR_MAX, Math.max(COTE_MIN, Math.round(hauteur * facteur)))
	};
}

/**
 * L'image du plan cadastral de la DGFiP, au cadre exact demande.
 *
 * `EPSG:4326` en WMS 1.3.0 : la BBOX est en latitude, longitude. Voir le piege
 * 2 en tete de fichier.
 */
export function planDgfip(
	insee: string,
	cadre: {
		readonly ouest: number;
		readonly sud: number;
		readonly est: number;
		readonly nord: number;
	},
	largeur: number,
	hauteur: number
): string {
	const taille = tailleAcceptee(largeur, hauteur);
	const bbox = [cadre.sud, cadre.ouest, cadre.nord, cadre.est].map((v) => v.toFixed(6)).join(',');
	const parametres = new URLSearchParams({
		SERVICE: 'WMS',
		VERSION: '1.3.0',
		REQUEST: 'GetMap',
		LAYERS: COUCHES,
		STYLES: '',
		CRS: 'EPSG:4326',
		BBOX: bbox,
		WIDTH: String(taille.largeur),
		HEIGHT: String(taille.hauteur),
		FORMAT: 'image/png'
	});
	return `${WMS}/${insee}.wms?${parametres.toString()}`;
}
