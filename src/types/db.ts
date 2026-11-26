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
      graphql: { Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json }; Returns: Json };
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
      activities: {
        Row: {
          body: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          kind: string;
          occurred_at: string;
          org_id: string;
          subject_id: string;
          subject_type: string;
          updated_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          body?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          kind: string;
          occurred_at?: string;
          org_id: string;
          subject_id: string;
          subject_type: string;
          updated_at?: string | null;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          kind?: string;
          occurred_at?: string;
          org_id?: string;
          subject_id?: string;
          subject_type?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "activities_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      api_tokens: {
        Row: {
          allowed_brand_ids: string[] | null;
          created_at: string;
          created_by: string | null;
          expires_at: string;
          id: string;
          kind: string;
          last_used_at: string | null;
          name: string;
          org_id: string;
          revoked_at: string | null;
          scopes: string[];
          token_hash: string;
          updated_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          allowed_brand_ids?: string[] | null;
          created_at?: string;
          created_by?: string | null;
          expires_at: string;
          id?: string;
          kind: string;
          last_used_at?: string | null;
          name: string;
          org_id: string;
          revoked_at?: string | null;
          scopes?: string[];
          token_hash: string;
          updated_at?: string | null;
        };
        Update: {
          allowed_brand_ids?: string[] | null;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string;
          id?: string;
          kind?: string;
          last_used_at?: string | null;
          name?: string;
          org_id?: string;
          revoked_at?: string | null;
          scopes?: string[];
          token_hash?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "api_tokens_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          actor_kind: string;
          after: Json | null;
          at: string;
          before: Json | null;
          id: string;
          ip_hash: string | null;
          org_id: string | null;
          request_id: string | null;
          subject_id: string | null;
          subject_type: string;
          user_agent: string | null;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id?: string | null;
          actor_kind: string;
          after?: Json | null;
          at?: string;
          before?: Json | null;
          id?: string;
          ip_hash?: string | null;
          org_id?: string | null;
          request_id?: string | null;
          subject_id?: string | null;
          subject_type: string;
          user_agent?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          actor_kind?: string;
          after?: Json | null;
          at?: string;
          before?: Json | null;
          id?: string;
          ip_hash?: string | null;
          org_id?: string | null;
          request_id?: string | null;
          subject_id?: string | null;
          subject_type?: string;
          user_agent?: string | null;
        };
        Relationships: [];
      };
      bookings: {
        Row: {
          booking_url: string | null;
          brand_id: string | null;
          contact_id: string | null;
          created_at: string;
          created_by: string | null;
          ends_at: string | null;
          external_id: string | null;
          id: string;
          notes: string | null;
          org_id: string;
          raw: Json | null;
          source: string;
          starts_at: string | null;
          status: string;
          updated_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          booking_url?: string | null;
          brand_id?: string | null;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          ends_at?: string | null;
          external_id?: string | null;
          id?: string;
          notes?: string | null;
          org_id: string;
          raw?: Json | null;
          source?: string;
          starts_at?: string | null;
          status?: string;
          updated_at?: string | null;
        };
        Update: {
          booking_url?: string | null;
          brand_id?: string | null;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          ends_at?: string | null;
          external_id?: string | null;
          id?: string;
          notes?: string | null;
          org_id?: string;
          raw?: Json | null;
          source?: string;
          starts_at?: string | null;
          status?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "bookings_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_org_id_brand_id_fkey";
            columns: ["org_id", "brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "bookings_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      brands: {
        Row: {
          created_at: string;
          created_by: string | null;
          from_email: string | null;
          id: string;
          key: string;
          legal_footer: string | null;
          name: string;
          org_id: string;
          report_theme: NonNullable<Json>;
          updated_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          from_email?: string | null;
          id?: string;
          key: string;
          legal_footer?: string | null;
          name: string;
          org_id: string;
          report_theme?: NonNullable<Json>;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          from_email?: string | null;
          id?: string;
          key?: string;
          legal_footer?: string | null;
          name?: string;
          org_id?: string;
          report_theme?: NonNullable<Json>;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "brands_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      comments: {
        Row: {
          body_md: string;
          created_at: string;
          created_by: string | null;
          id: string;
          mentions: string[];
          org_id: string;
          resolved_at: string | null;
          subject_id: string;
          subject_type: string;
          updated_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          body_md: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          mentions?: string[];
          org_id: string;
          resolved_at?: string | null;
          subject_id: string;
          subject_type: string;
          updated_at?: string | null;
        };
        Update: {
          body_md?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          mentions?: string[];
          org_id?: string;
          resolved_at?: string | null;
          subject_id?: string;
          subject_type?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "comments_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      companies: {
        Row: {
          brand_ids: string[] | null;
          city: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          industry: string | null;
          lifecycle: string;
          name: string;
          org_id: string;
          sells_online: boolean;
          source: string | null;
          state: string | null;
          street_address: string | null;
          tags: string[];
          updated_at: string | null;
          website: string | null;
        };
        ComputedFields: never;
        Insert: {
          brand_ids?: string[] | null;
          city?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          industry?: string | null;
          lifecycle?: string;
          name: string;
          org_id: string;
          sells_online?: boolean;
          source?: string | null;
          state?: string | null;
          street_address?: string | null;
          tags?: string[];
          updated_at?: string | null;
          website?: string | null;
        };
        Update: {
          brand_ids?: string[] | null;
          city?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          industry?: string | null;
          lifecycle?: string;
          name?: string;
          org_id?: string;
          sells_online?: boolean;
          source?: string | null;
          state?: string | null;
          street_address?: string | null;
          tags?: string[];
          updated_at?: string | null;
          website?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "companies_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      consents: {
        Row: {
          captured_at: string;
          channel: string;
          consent_text_version: string | null;
          contact_id: string | null;
          created_at: string;
          created_by: string | null;
          email: string | null;
          evidence: NonNullable<Json>;
          id: string;
          method: string;
          org_id: string;
          phone_e164: string | null;
          purpose: string;
          status: string;
          updated_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          captured_at?: string;
          channel: string;
          consent_text_version?: string | null;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          evidence?: NonNullable<Json>;
          id?: string;
          method: string;
          org_id: string;
          phone_e164?: string | null;
          purpose: string;
          status: string;
          updated_at?: string | null;
        };
        Update: {
          captured_at?: string;
          channel?: string;
          consent_text_version?: string | null;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          evidence?: NonNullable<Json>;
          id?: string;
          method?: string;
          org_id?: string;
          phone_e164?: string | null;
          purpose?: string;
          status?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "consents_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "consents_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      contacts: {
        Row: {
          company_id: string | null;
          created_at: string;
          created_by: string | null;
          do_not_contact: boolean;
          email: string | null;
          first_name: string | null;
          id: string;
          last_name: string | null;
          org_id: string;
          owner_user_id: string | null;
          phone_e164: string | null;
          tags: string[];
          title: string | null;
          updated_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          company_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          do_not_contact?: boolean;
          email?: string | null;
          first_name?: string | null;
          id?: string;
          last_name?: string | null;
          org_id: string;
          owner_user_id?: string | null;
          phone_e164?: string | null;
          tags?: string[];
          title?: string | null;
          updated_at?: string | null;
        };
        Update: {
          company_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          do_not_contact?: boolean;
          email?: string | null;
          first_name?: string | null;
          id?: string;
          last_name?: string | null;
          org_id?: string;
          owner_user_id?: string | null;
          phone_e164?: string | null;
          tags?: string[];
          title?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contacts_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      deals: {
        Row: {
          brand_id: string;
          company_id: string | null;
          contact_id: string | null;
          created_at: string;
          created_by: string | null;
          expected_close: string | null;
          id: string;
          offer: string;
          org_id: string;
          owner_user_id: string | null;
          pipeline_id: string;
          stage_id: string;
          status: string;
          title: string;
          updated_at: string | null;
          value_cents: number;
        };
        ComputedFields: never;
        Insert: {
          brand_id: string;
          company_id?: string | null;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          expected_close?: string | null;
          id?: string;
          offer?: string;
          org_id: string;
          owner_user_id?: string | null;
          pipeline_id: string;
          stage_id: string;
          status?: string;
          title: string;
          updated_at?: string | null;
          value_cents?: number;
        };
        Update: {
          brand_id?: string;
          company_id?: string | null;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          expected_close?: string | null;
          id?: string;
          offer?: string;
          org_id?: string;
          owner_user_id?: string | null;
          pipeline_id?: string;
          stage_id?: string;
          status?: string;
          title?: string;
          updated_at?: string | null;
          value_cents?: number;
        };
        Relationships: [
          {
            foreignKeyName: "deals_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deals_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deals_org_id_brand_id_fkey";
            columns: ["org_id", "brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "deals_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deals_pipeline_id_fkey";
            columns: ["pipeline_id"];
            isOneToOne: false;
            referencedRelation: "pipelines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deals_stage_id_fkey";
            columns: ["stage_id"];
            isOneToOne: false;
            referencedRelation: "pipeline_stages";
            referencedColumns: ["id"];
          },
        ];
      };
      events: {
        Row: {
          actor_id: string | null;
          at: string;
          created_at: string;
          created_by: string | null;
          id: string;
          org_id: string;
          payload: NonNullable<Json>;
          subject_id: string | null;
          subject_type: string | null;
          type: string;
          updated_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          actor_id?: string | null;
          at?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          org_id: string;
          payload?: NonNullable<Json>;
          subject_id?: string | null;
          subject_type?: string | null;
          type: string;
          updated_at?: string | null;
        };
        Update: {
          actor_id?: string | null;
          at?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          org_id?: string;
          payload?: NonNullable<Json>;
          subject_id?: string | null;
          subject_type?: string | null;
          type?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "events_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      files: {
        Row: {
          bucket: string;
          created_at: string;
          created_by: string | null;
          id: string;
          kind: string;
          mime: string | null;
          org_id: string;
          path: string;
          sensitivity: string;
          sha256: string | null;
          size: number | null;
          updated_at: string | null;
          uploaded_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          bucket?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          kind?: string;
          mime?: string | null;
          org_id: string;
          path: string;
          sensitivity?: string;
          sha256?: string | null;
          size?: number | null;
          updated_at?: string | null;
          uploaded_by?: string | null;
        };
        Update: {
          bucket?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          kind?: string;
          mime?: string | null;
          org_id?: string;
          path?: string;
          sensitivity?: string;
          sha256?: string | null;
          size?: number | null;
          updated_at?: string | null;
          uploaded_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "files_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      form_submissions: {
        Row: {
          contact_id: string | null;
          created_at: string;
          created_by: string | null;
          data: NonNullable<Json>;
          deal_id: string | null;
          form_id: string;
          id: string;
          ip_hash: string | null;
          org_id: string;
          updated_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          data: NonNullable<Json>;
          deal_id?: string | null;
          form_id: string;
          id?: string;
          ip_hash?: string | null;
          org_id: string;
          updated_at?: string | null;
        };
        Update: {
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          data?: NonNullable<Json>;
          deal_id?: string | null;
          form_id?: string;
          id?: string;
          ip_hash?: string | null;
          org_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "form_submissions_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "form_submissions_deal_id_fkey";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "form_submissions_form_id_fkey";
            columns: ["form_id"];
            isOneToOne: false;
            referencedRelation: "forms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "form_submissions_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      forms: {
        Row: {
          active: boolean;
          brand_id: string;
          consent_text: string | null;
          consent_text_version: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
          org_id: string;
          redirect_url: string | null;
          schema: NonNullable<Json>;
          updated_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          brand_id: string;
          consent_text?: string | null;
          consent_text_version?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
          org_id: string;
          redirect_url?: string | null;
          schema?: NonNullable<Json>;
          updated_at?: string | null;
        };
        Update: {
          active?: boolean;
          brand_id?: string;
          consent_text?: string | null;
          consent_text_version?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
          org_id?: string;
          redirect_url?: string | null;
          schema?: NonNullable<Json>;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "forms_org_id_brand_id_fkey";
            columns: ["org_id", "brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "forms_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      import_guard_signatures: {
        Row: {
          created_at: string;
          created_by: string | null;
          header_signature: string[];
          id: string;
          label: string;
          org_id: string;
          threshold: number;
          updated_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          header_signature: string[];
          id?: string;
          label: string;
          org_id: string;
          threshold?: number;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          header_signature?: string[];
          id?: string;
          label?: string;
          org_id?: string;
          threshold?: number;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "import_guard_signatures_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      memberships: {
        Row: {
          brand_ids: string[] | null;
          created_at: string;
          created_by: string | null;
          id: string;
          org_id: string;
          role: string;
          status: string;
          updated_at: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          brand_ids?: string[] | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          org_id: string;
          role: string;
          status?: string;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          brand_ids?: string[] | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          org_id?: string;
          role?: string;
          status?: string;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "memberships_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          created_at: string;
          created_by: string | null;
          digested_at: string | null;
          id: string;
          kind: string;
          org_id: string;
          payload: NonNullable<Json>;
          read_at: string | null;
          subject_id: string | null;
          subject_type: string | null;
          updated_at: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          digested_at?: string | null;
          id?: string;
          kind: string;
          org_id: string;
          payload?: NonNullable<Json>;
          read_at?: string | null;
          subject_id?: string | null;
          subject_type?: string | null;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          digested_at?: string | null;
          id?: string;
          kind?: string;
          org_id?: string;
          payload?: NonNullable<Json>;
          read_at?: string | null;
          subject_id?: string | null;
          subject_type?: string | null;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      orgs: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
          settings: NonNullable<Json>;
          slug: string;
          updated_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
          settings?: NonNullable<Json>;
          slug: string;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
          settings?: NonNullable<Json>;
          slug?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      pipeline_stages: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
          org_id: string;
          outcome: string;
          pipeline_id: string;
          position: number;
          updated_at: string | null;
          win_probability: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
          org_id: string;
          outcome?: string;
          pipeline_id: string;
          position: number;
          updated_at?: string | null;
          win_probability?: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
          org_id?: string;
          outcome?: string;
          pipeline_id?: string;
          position?: number;
          updated_at?: string | null;
          win_probability?: number;
        };
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pipeline_stages_pipeline_id_fkey";
            columns: ["pipeline_id"];
            isOneToOne: false;
            referencedRelation: "pipelines";
            referencedColumns: ["id"];
          },
        ];
      };
      pipelines: {
        Row: {
          brand_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
          org_id: string;
          updated_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          brand_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
          org_id: string;
          updated_at?: string | null;
        };
        Update: {
          brand_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
          org_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "pipelines_org_id_brand_id_fkey";
            columns: ["org_id", "brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "pipelines_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string | null;
          updated_at: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      role_permissions: {
        Row: {
          created_at: string;
          permission: string;
          role: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          permission: string;
          role: string;
        };
        Update: {
          created_at?: string;
          permission?: string;
          role?: string;
        };
        Relationships: [];
      };
      settings: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          key: string;
          org_id: string;
          updated_at: string | null;
          value: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          key: string;
          org_id: string;
          updated_at?: string | null;
          value: NonNullable<Json>;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          key?: string;
          org_id?: string;
          updated_at?: string | null;
          value?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: "settings_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      tasks: {
        Row: {
          assignee_user_id: string | null;
          body: string | null;
          brand_id: string | null;
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
          dedupe_key: string | null;
          due_at: string | null;
          id: string;
          org_id: string;
          priority: string;
          recurring_rule: string | null;
          status: string;
          subject_id: string | null;
          subject_type: string | null;
          title: string;
          updated_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          assignee_user_id?: string | null;
          body?: string | null;
          brand_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          dedupe_key?: string | null;
          due_at?: string | null;
          id?: string;
          org_id: string;
          priority?: string;
          recurring_rule?: string | null;
          status?: string;
          subject_id?: string | null;
          subject_type?: string | null;
          title: string;
          updated_at?: string | null;
        };
        Update: {
          assignee_user_id?: string | null;
          body?: string | null;
          brand_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          dedupe_key?: string | null;
          due_at?: string | null;
          id?: string;
          org_id?: string;
          priority?: string;
          recurring_rule?: string | null;
          status?: string;
          subject_id?: string | null;
          subject_type?: string | null;
          title?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_org_id_brand_id_fkey";
            columns: ["org_id", "brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "tasks_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_my_invites: { Args: Record<PropertyKey, never>; Returns: number };
      app_audit: {
        Args: {
          p_action: string;
          p_after?: Json;
          p_ip_hash?: string;
          p_org: string;
          p_subject_id: string;
          p_subject_type: string;
        };
        Returns: string;
      };
      audit_actor_kind: { Args: Record<PropertyKey, never>; Returns: string };
      audit_request_header: { Args: { p_name: string }; Returns: string };
      audit_request_id: { Args: Record<PropertyKey, never>; Returns: string };
      auth_is_aal2: { Args: Record<PropertyKey, never>; Returns: boolean };
      auth_membership: {
        Args: { p_org: string };
        Returns: {
          brand_ids: string[] | null;
          created_at: string;
          created_by: string | null;
          id: string;
          org_id: string;
          role: string;
          status: string;
          updated_at: string | null;
          user_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "memberships";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      auth_org_ids: { Args: Record<PropertyKey, never>; Returns: string[] };
      auth_requires_mfa: { Args: Record<PropertyKey, never>; Returns: boolean };
      auth_role: { Args: { p_org: string }; Returns: string };
      brand_ids_within_caller: { Args: { p_brand_ids: string[]; p_org: string }; Returns: boolean };
      can_any_brand: { Args: { p_brand_ids: string[]; p_org: string }; Returns: boolean };
      can_brand: { Args: { p_brand: string; p_org: string }; Returns: boolean };
      cross_sell_check: { Args: { p_company: string }; Returns: number };
      emit_event: {
        Args: { p_org: string; p_payload?: Json; p_subject_id: string; p_subject_type: string; p_type: string };
        Returns: string;
      };
      has_perm: { Args: { p_org: string; p_perm: string }; Returns: boolean };
      import_guard_match: { Args: { p_headers: string[]; p_org: string }; Returns: string };
      mark_notifications_digested: { Args: { p_ids: string[] }; Returns: number };
      org_owner_id: { Args: { p_org: string }; Returns: string };
      public_form: { Args: { p_form_id: string }; Returns: Json };
      role_requires_mfa: { Args: { p_role: string }; Returns: boolean };
      setting_bool: { Args: { p_default: boolean; p_key: string; p_org: string }; Returns: boolean };
      submit_form: {
        Args: {
          p_consent: boolean;
          p_data: Json;
          p_form_id: string;
          p_honeypot: string;
          p_ip_hash: string;
          p_rate_limit_per_min: number;
        };
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
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) | { schema: keyof DatabaseWithoutInternals },
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
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
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
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
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
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
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
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
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
    Enums: {},
  },
} as const;
