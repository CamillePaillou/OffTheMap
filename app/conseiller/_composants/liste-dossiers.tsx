import { exigerConseiller } from '@/lib/auth/conseiller';
import { DossiersSupabase } from '@/src/infrastructure/db/dossiersSupabase';
import { ListeClient, type ElementListe } from './liste-client';
import { joursAvantDepart, photoDestination, prochaineEtape, texteDepart } from './statut';

const PAR_PAGE = 50;

/** Les dossiers du conseiller, préparés pour la liste (le filtre et la recherche se font dans le navigateur). */
export async function ListeDossiers() {
  await exigerConseiller();
  const dossiers = await new DossiersSupabase().liste({ limit: PAR_PAGE, offset: 0 });
  const elements: ElementListe[] = dossiers.items
    .map((d) => {
      const etape = prochaineEtape(d.statut, d.proposition);
      const jours = joursAvantDepart(d.demande.date_debut);
      return {
        id: d.dossier_id,
        nom: d.client.nom,
        destination: d.demande.destination,
        photo: photoDestination(d.demande.destination),
        etape: etape.texte,
        groupe: etape.acteur === 'conseiller' ? ('traiter' as const) : etape.acteur === null ? ('clos' as const) : ('attente' as const),
        depart: texteDepart(jours),
        proche: etape.acteur !== null && jours >= 0 && jours < 15,
        jours,
      };
    })
    // d'abord ce qui attend le conseiller, puis le reste ; à égalité, le départ le plus proche
    .sort((a, b) => ['traiter', 'attente', 'clos'].indexOf(a.groupe) - ['traiter', 'attente', 'clos'].indexOf(b.groupe) || a.jours - b.jours);
  return <ListeClient elements={elements} total={dossiers.total} />;
}
