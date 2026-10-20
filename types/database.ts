export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      demandes: {
        Row: {
          budget_annonce_cents: number | null;
          consentement_ia: boolean;
          consentement_rgpd: boolean;
          consenti_le: string;
          contraintes: string | null;
          cree_le: string;
          date_debut: string;
          date_fin: string;
          destination: string | null;
          dossier_id: string;
          email: string;
          envies: string | null;
          id: string;
          mobilite: Database["public"]["Enums"]["mobilite"] | null;
          nb_nuits: number;
          nom: string;
          regimes: Database["public"]["Enums"]["regime"][];
          remplacee_le: string | null;
          version: number;
          voyageurs: Database["public"]["Enums"]["tranche_age"][];
        };
        ComputedFields: never;
        Insert: {
          budget_annonce_cents?: number | null;
          consentement_ia: boolean;
          consentement_rgpd: boolean;
          consenti_le?: string;
          contraintes?: string | null;
          cree_le?: string;
          date_debut: string;
          date_fin: string;
          destination?: string | null;
          dossier_id: string;
          email: string;
          envies?: string | null;
          id?: string;
          mobilite?: Database["public"]["Enums"]["mobilite"] | null;
          nb_nuits: number;
          nom: string;
          regimes?: Database["public"]["Enums"]["regime"][];
          remplacee_le?: string | null;
          version?: number;
          voyageurs: Database["public"]["Enums"]["tranche_age"][];
        };
        Update: {
          budget_annonce_cents?: number | null;
          consentement_ia?: boolean;
          consentement_rgpd?: boolean;
          consenti_le?: string;
          contraintes?: string | null;
          cree_le?: string;
          date_debut?: string;
          date_fin?: string;
          destination?: string | null;
          dossier_id?: string;
          email?: string;
          envies?: string | null;
          id?: string;
          mobilite?: Database["public"]["Enums"]["mobilite"] | null;
          nb_nuits?: number;
          nom?: string;
          regimes?: Database["public"]["Enums"]["regime"][];
          remplacee_le?: string | null;
          version?: number;
          voyageurs?: Database["public"]["Enums"]["tranche_age"][];
        };
        Relationships: [
          {
            foreignKeyName: "demandes_dossier_id_fkey";
            columns: ["dossier_id"];
            isOneToOne: false;
            referencedRelation: "dossiers";
            referencedColumns: ["id"];
          },
        ];
      };
      dossiers: {
        Row: {
          cree_le: string;
          id: string;
          statut: Database["public"]["Enums"]["statut_dossier"];
        };
        ComputedFields: never;
        Insert: {
          cree_le?: string;
          id?: string;
          statut?: Database["public"]["Enums"]["statut_dossier"];
        };
        Update: {
          cree_le?: string;
          id?: string;
          statut?: Database["public"]["Enums"]["statut_dossier"];
        };
        Relationships: [];
      };
      fiches: {
        Row: {
          budget_reel_cents: number | null;
          contraintes: string[];
          cree_le: string;
          date_debut_fixe: string | null;
          date_fin_fixe: string | null;
          decision: Database["public"]["Enums"]["decision_tri"] | null;
          demande_id: string;
          envies: string[];
          erreur_generation: string | null;
          id: string;
          mobilite: Database["public"]["Enums"]["mobilite"] | null;
          modele: string | null;
          nb_nuits_fixe: number | null;
          niveau_physique: Database["public"]["Enums"]["niveau_physique"] | null;
          notes_conseiller: string | null;
          points_flous: string[];
          regimes: Database["public"]["Enums"]["regime"][];
          validee_le: string | null;
          validee_par: string | null;
        };
        ComputedFields: never;
        Insert: {
          budget_reel_cents?: number | null;
          contraintes?: string[];
          cree_le?: string;
          date_debut_fixe?: string | null;
          date_fin_fixe?: string | null;
          decision?: Database["public"]["Enums"]["decision_tri"] | null;
          demande_id: string;
          envies?: string[];
          erreur_generation?: string | null;
          id?: string;
          mobilite?: Database["public"]["Enums"]["mobilite"] | null;
          modele?: string | null;
          nb_nuits_fixe?: number | null;
          niveau_physique?: Database["public"]["Enums"]["niveau_physique"] | null;
          notes_conseiller?: string | null;
          points_flous?: string[];
          regimes?: Database["public"]["Enums"]["regime"][];
          validee_le?: string | null;
          validee_par?: string | null;
        };
        Update: {
          budget_reel_cents?: number | null;
          contraintes?: string[];
          cree_le?: string;
          date_debut_fixe?: string | null;
          date_fin_fixe?: string | null;
          decision?: Database["public"]["Enums"]["decision_tri"] | null;
          demande_id?: string;
          envies?: string[];
          erreur_generation?: string | null;
          id?: string;
          mobilite?: Database["public"]["Enums"]["mobilite"] | null;
          modele?: string | null;
          nb_nuits_fixe?: number | null;
          niveau_physique?: Database["public"]["Enums"]["niveau_physique"] | null;
          notes_conseiller?: string | null;
          points_flous?: string[];
          regimes?: Database["public"]["Enums"]["regime"][];
          validee_le?: string | null;
          validee_par?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "fiches_demande_id_fkey";
            columns: ["demande_id"];
            isOneToOne: true;
            referencedRelation: "demandes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fiches_validee_par_fkey";
            columns: ["validee_par"];
            isOneToOne: false;
            referencedRelation: "profils";
            referencedColumns: ["id"];
          },
        ];
      };
      historique_dossier: {
        Row: {
          ancien_statut: string | null;
          auteur: Database["public"]["Enums"]["auteur_evenement"];
          auteur_id: string | null;
          cree_le: string;
          detail: NonNullable<Json>;
          dossier_id: string;
          id: number;
          nouveau_statut: string | null;
          proposition_id: string | null;
          type: Database["public"]["Enums"]["type_evenement"];
        };
        ComputedFields: never;
        Insert: {
          ancien_statut?: string | null;
          auteur: Database["public"]["Enums"]["auteur_evenement"];
          auteur_id?: string | null;
          cree_le?: string;
          detail?: NonNullable<Json>;
          dossier_id: string;
          id?: never;
          nouveau_statut?: string | null;
          proposition_id?: string | null;
          type: Database["public"]["Enums"]["type_evenement"];
        };
        Update: {
          ancien_statut?: string | null;
          auteur?: Database["public"]["Enums"]["auteur_evenement"];
          auteur_id?: string | null;
          cree_le?: string;
          detail?: NonNullable<Json>;
          dossier_id?: string;
          id?: never;
          nouveau_statut?: string | null;
          proposition_id?: string | null;
          type?: Database["public"]["Enums"]["type_evenement"];
        };
        Relationships: [
          {
            foreignKeyName: "historique_dossier_auteur_id_fkey";
            columns: ["auteur_id"];
            isOneToOne: false;
            referencedRelation: "profils";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "historique_dossier_dossier_id_fkey";
            columns: ["dossier_id"];
            isOneToOne: false;
            referencedRelation: "dossiers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "historique_dossier_proposition_id_fkey";
            columns: ["proposition_id"];
            isOneToOne: false;
            referencedRelation: "propositions";
            referencedColumns: ["id"];
          },
        ];
      };
      options: {
        Row: {
          accord_expire_le: string;
          accord_le: string;
          accord_par: string;
          accord_utilise: boolean;
          annulee_le: string | null;
          confirme_le: string | null;
          confirme_par: string | null;
          cree_le: string;
          expire_le: string | null;
          id: string;
          ligne_id: string;
          option_id_simulateur: string | null;
          prix_accorde_cents: number;
          prix_option_cents: number | null;
          reponse_confirmation: Json | null;
          reponse_option: Json | null;
          reservation_id_simulateur: string | null;
          statut: Database["public"]["Enums"]["statut_option"];
          verification_id: string;
        };
        ComputedFields: never;
        Insert: {
          accord_expire_le?: string;
          accord_le?: string;
          accord_par: string;
          accord_utilise?: boolean;
          annulee_le?: string | null;
          confirme_le?: string | null;
          confirme_par?: string | null;
          cree_le?: string;
          expire_le?: string | null;
          id?: string;
          ligne_id: string;
          option_id_simulateur?: string | null;
          prix_accorde_cents: number;
          prix_option_cents?: number | null;
          reponse_confirmation?: Json | null;
          reponse_option?: Json | null;
          reservation_id_simulateur?: string | null;
          statut?: Database["public"]["Enums"]["statut_option"];
          verification_id: string;
        };
        Update: {
          accord_expire_le?: string;
          accord_le?: string;
          accord_par?: string;
          accord_utilise?: boolean;
          annulee_le?: string | null;
          confirme_le?: string | null;
          confirme_par?: string | null;
          cree_le?: string;
          expire_le?: string | null;
          id?: string;
          ligne_id?: string;
          option_id_simulateur?: string | null;
          prix_accorde_cents?: number;
          prix_option_cents?: number | null;
          reponse_confirmation?: Json | null;
          reponse_option?: Json | null;
          reservation_id_simulateur?: string | null;
          statut?: Database["public"]["Enums"]["statut_option"];
          verification_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "options_accord_par_fkey";
            columns: ["accord_par"];
            isOneToOne: false;
            referencedRelation: "profils";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "options_confirme_par_fkey";
            columns: ["confirme_par"];
            isOneToOne: false;
            referencedRelation: "profils";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "options_ligne_id_fkey";
            columns: ["ligne_id"];
            isOneToOne: false;
            referencedRelation: "proposition_lignes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "options_verification_id_fkey";
            columns: ["verification_id"];
            isOneToOne: false;
            referencedRelation: "verifications";
            referencedColumns: ["id"];
          },
        ];
      };
      prestations: {
        Row: {
          actif: boolean;
          capacite: number;
          description: string | null;
          destination: string;
          id: string;
          importe_le: string;
          nom: string;
          prix_unitaire_cents: number;
          tags: string[];
          type: Database["public"]["Enums"]["type_prestation"];
        };
        ComputedFields: never;
        Insert: {
          actif?: boolean;
          capacite: number;
          description?: string | null;
          destination: string;
          id: string;
          importe_le?: string;
          nom: string;
          prix_unitaire_cents: number;
          tags?: string[];
          type: Database["public"]["Enums"]["type_prestation"];
        };
        Update: {
          actif?: boolean;
          capacite?: number;
          description?: string | null;
          destination?: string;
          id?: string;
          importe_le?: string;
          nom?: string;
          prix_unitaire_cents?: number;
          tags?: string[];
          type?: Database["public"]["Enums"]["type_prestation"];
        };
        Relationships: [];
      };
      profils: {
        Row: {
          cree_le: string;
          id: string;
          nom_affiche: string;
        };
        ComputedFields: never;
        Insert: {
          cree_le?: string;
          id: string;
          nom_affiche: string;
        };
        Update: {
          cree_le?: string;
          id?: string;
          nom_affiche?: string;
        };
        Relationships: [];
      };
      proposition_lignes: {
        Row: {
          confirme_le: string | null;
          confirme_par: string | null;
          cree_le: string;
          date: string;
          id: string;
          participants: number;
          prestation_id: string;
          prix_confirme_cents: number | null;
          prix_unitaire_catalogue_cents: number;
          proposition_id: string;
          source: Database["public"]["Enums"]["source_prix"] | null;
          statut: Database["public"]["Enums"]["statut_ligne"];
          total_ligne_cents: number | null;
        };
        ComputedFields: never;
        Insert: {
          confirme_le?: string | null;
          confirme_par?: string | null;
          cree_le?: string;
          date: string;
          id?: string;
          participants: number;
          prestation_id: string;
          prix_confirme_cents?: number | null;
          prix_unitaire_catalogue_cents: number;
          proposition_id: string;
          source?: Database["public"]["Enums"]["source_prix"] | null;
          statut?: Database["public"]["Enums"]["statut_ligne"];
          total_ligne_cents?: never;
        };
        Update: {
          confirme_le?: string | null;
          confirme_par?: string | null;
          cree_le?: string;
          date?: string;
          id?: string;
          participants?: number;
          prestation_id?: string;
          prix_confirme_cents?: number | null;
          prix_unitaire_catalogue_cents?: number;
          proposition_id?: string;
          source?: Database["public"]["Enums"]["source_prix"] | null;
          statut?: Database["public"]["Enums"]["statut_ligne"];
          total_ligne_cents?: never;
        };
        Relationships: [
          {
            foreignKeyName: "proposition_lignes_confirme_par_fkey";
            columns: ["confirme_par"];
            isOneToOne: false;
            referencedRelation: "profils";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "proposition_lignes_prestation_id_fkey";
            columns: ["prestation_id"];
            isOneToOne: false;
            referencedRelation: "prestations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "proposition_lignes_proposition_id_fkey";
            columns: ["proposition_id"];
            isOneToOne: false;
            referencedRelation: "propositions";
            referencedColumns: ["id"];
          },
        ];
      };
      propositions: {
        Row: {
          alertes: NonNullable<Json>;
          cree_le: string;
          dossier_id: string;
          ecarts: Json | null;
          envoyee_le: string | null;
          envoyee_par: string | null;
          id: string;
          motif_changement: string | null;
          programme: Json | null;
          statut: Database["public"]["Enums"]["statut_proposition"];
          total_cents: number | null;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          alertes?: NonNullable<Json>;
          cree_le?: string;
          dossier_id: string;
          ecarts?: Json | null;
          envoyee_le?: string | null;
          envoyee_par?: string | null;
          id?: string;
          motif_changement?: string | null;
          programme?: Json | null;
          statut?: Database["public"]["Enums"]["statut_proposition"];
          total_cents?: number | null;
          version?: number;
        };
        Update: {
          alertes?: NonNullable<Json>;
          cree_le?: string;
          dossier_id?: string;
          ecarts?: Json | null;
          envoyee_le?: string | null;
          envoyee_par?: string | null;
          id?: string;
          motif_changement?: string | null;
          programme?: Json | null;
          statut?: Database["public"]["Enums"]["statut_proposition"];
          total_cents?: number | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "propositions_dossier_id_fkey";
            columns: ["dossier_id"];
            isOneToOne: false;
            referencedRelation: "dossiers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "propositions_envoyee_par_fkey";
            columns: ["envoyee_par"];
            isOneToOne: false;
            referencedRelation: "profils";
            referencedColumns: ["id"];
          },
        ];
      };
      verifications: {
        Row: {
          arret: Database["public"]["Enums"]["arret_agent"];
          cree_le: string;
          demande_par: string;
          id: string;
          ligne_id: string;
          modele: string;
          nb_tours: number;
          places_restantes: number | null;
          prix_total_cents: number | null;
          prix_unitaire_cents: number | null;
          reponse_serveur: Json | null;
          statut: Database["public"]["Enums"]["statut_verification"];
          trace: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          arret: Database["public"]["Enums"]["arret_agent"];
          cree_le?: string;
          demande_par: string;
          id?: string;
          ligne_id: string;
          modele: string;
          nb_tours: number;
          places_restantes?: number | null;
          prix_total_cents?: number | null;
          prix_unitaire_cents?: number | null;
          reponse_serveur?: Json | null;
          statut: Database["public"]["Enums"]["statut_verification"];
          trace?: NonNullable<Json>;
        };
        Update: {
          arret?: Database["public"]["Enums"]["arret_agent"];
          cree_le?: string;
          demande_par?: string;
          id?: string;
          ligne_id?: string;
          modele?: string;
          nb_tours?: number;
          places_restantes?: number | null;
          prix_total_cents?: number | null;
          prix_unitaire_cents?: number | null;
          reponse_serveur?: Json | null;
          statut?: Database["public"]["Enums"]["statut_verification"];
          trace?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: "verifications_demande_par_fkey";
            columns: ["demande_par"];
            isOneToOne: false;
            referencedRelation: "profils";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "verifications_ligne_id_fkey";
            columns: ["ligne_id"];
            isOneToOne: false;
            referencedRelation: "proposition_lignes";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      est_conseiller: { Args: Record<PropertyKey, never>; Returns: boolean };
      deposer_demande: { Args: { p_demande: Json }; Returns: { dossier_id: string; demande_id: string }[] };
      changer_statut: {
        Args: {
          p_cible: string;
          p_id: string;
          p_ancien: string;
          p_nouveau: string;
          p_auteur: Database["public"]["Enums"]["auteur_evenement"];
          p_auteur_id: string | null;
          p_detail?: Json;
        };
        Returns: number;
      };
      corriger_fiche: {
        Args: {
          p_fiche_id: string;
          p_budget_reel_cents: number | null;
          p_date_debut_fixe: string | null;
          p_date_fin_fixe: string | null;
          p_nb_nuits_fixe: number | null;
          p_notes_conseiller: string | null;
        };
        Returns: undefined;
      };
      enregistrer_generation_fiche: { Args: { p_demande_id: string; p_modele: string; p_generation: Json }; Returns: string };
    };
    Enums: {
      arret_agent: "conclusion" | "tours_max" | "echec_serveur" | "reponse_invalide";
      auteur_evenement: "conseiller" | "systeme";
      decision_tri: "go" | "a_corriger" | "refusee";
      mobilite: "aucune" | "reduite";
      niveau_physique: "faible" | "modere" | "soutenu" | "intense";
      regime: "vegetarien" | "vegetalien" | "sans_gluten" | "allergie" | "autre";
      source_prix: "agent" | "telephone" | "mail" | "lien";
      statut_dossier:
        | "nouvelle"
        | "fiche_en_cours"
        | "fiche_prete"
        | "erreur"
        | "go"
        | "a_corriger"
        | "refusee"
        | "rdv_propose"
        | "entretien_fait"
        | "en_proposition"
        | "gagnee"
        | "abandonnee";
      statut_ligne: "a_verifier" | "confirme" | "indisponible" | "remplacee" | "reservee";
      statut_option: "accord_donne" | "posee" | "expiree" | "echec" | "confirmee" | "annulee";
      statut_proposition:
        | "brouillon_en_cours"
        | "brouillon_pret"
        | "a_verifier"
        | "prete"
        | "envoyee"
        | "sans_reponse"
        | "changement_demande"
        | "remplacee"
        | "acceptee"
        | "depot_recu"
        | "reservee"
        | "erreur";
      statut_verification: "ok" | "echec" | "indisponible";
      tranche_age: "0_2" | "3_11" | "12_17" | "adulte" | "enfant";
      type_evenement:
        | "statut"
        | "mail"
        | "rappel"
        | "depot"
        | "changement"
        | "verification"
        | "accord"
        | "option"
        | "reservation";
      type_prestation: "transport" | "hebergement" | "activite";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      arret_agent: ["conclusion", "tours_max", "echec_serveur", "reponse_invalide"],
      auteur_evenement: ["conseiller", "systeme"],
      decision_tri: ["go", "a_corriger", "refusee"],
      mobilite: ["aucune", "reduite"],
      niveau_physique: ["faible", "modere", "soutenu", "intense"],
      regime: ["vegetarien", "vegetalien", "sans_gluten", "allergie", "autre"],
      source_prix: ["agent", "telephone", "mail", "lien"],
      statut_dossier: [
        "nouvelle",
        "fiche_en_cours",
        "fiche_prete",
        "erreur",
        "go",
        "a_corriger",
        "refusee",
        "rdv_propose",
        "entretien_fait",
        "en_proposition",
        "gagnee",
        "abandonnee",
      ],
      statut_ligne: ["a_verifier", "confirme", "indisponible", "remplacee", "reservee"],
      statut_option: ["accord_donne", "posee", "expiree", "echec", "confirmee", "annulee"],
      statut_proposition: [
        "brouillon_en_cours",
        "brouillon_pret",
        "a_verifier",
        "prete",
        "envoyee",
        "sans_reponse",
        "changement_demande",
        "remplacee",
        "acceptee",
        "depot_recu",
        "reservee",
        "erreur",
      ],
      statut_verification: ["ok", "echec", "indisponible"],
      tranche_age: ["0_2", "3_11", "12_17", "adulte", "enfant"],
      type_evenement: [
        "statut",
        "mail",
        "rappel",
        "depot",
        "changement",
        "verification",
        "accord",
        "option",
        "reservation",
      ],
      type_prestation: ["transport", "hebergement", "activite"],
    },
  },
} as const;
