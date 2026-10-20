import { FormulaireDemande } from './formulaire';

// Page publique du formulaire de demande (E1.1) : sans compte, le client décrit son voyage.
export default function DemandePage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold">Votre demande de voyage</h1>
      <p className="mt-4 text-zinc-600">
        Décrivez votre projet. Un conseiller Detour l’étudie et vous recontacte avec une proposition sur mesure.
      </p>
      <FormulaireDemande />
    </main>
  );
}
