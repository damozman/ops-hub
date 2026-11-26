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
      approvals: {
        Row: {
          approver_id: string;
          approver_role: string;
          brand_id: string;
          comment: string | null;
          content_hash: string;
          created_at: string;
          created_by: string | null;
          decided_at: string;
          decision: string;
          id: string;
          job_id: string | null;
          kind: string;
          org_id: string;
          stale: boolean;
          subject_id: string;
          subject_type: string;
          updated_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          approver_id: string;
          approver_role: string;
          brand_id: string;
          comment?: string | null;
          content_hash: string;
          created_at?: string;
          created_by?: string | null;
          decided_at?: string;
          decision: string;
          id?: string;
          job_id?: string | null;
          kind?: string;
          org_id: string;
          stale?: boolean;
          subject_id: string;
          subject_type: string;
          updated_at?: string | null;
        };
        Update: {
          approver_id?: string;
          approver_role?: string;
          brand_id?: string;
          comment?: string | null;
          content_hash?: string;
          created_at?: string;
          created_by?: string | null;
          decided_at?: string;
          decision?: string;
          id?: string;
          job_id?: string | null;
          kind?: string;
          org_id?: string;
          stale?: boolean;
          subject_id?: string;
          subject_type?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "approvals_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "approvals_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_findings: {
        Row: {
          audit_id: string;
          brand_id: string;
          created_at: string;
          created_by: string | null;
          evidence: NonNullable<Json>;
          field: string | null;
          id: string;
          job_item_id: string | null;
          message: string;
          org_id: string;
          rule_key: string;
          severity: string;
          updated_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          audit_id: string;
          brand_id: string;
          created_at?: string;
          created_by?: string | null;
          evidence?: NonNullable<Json>;
          field?: string | null;
          id?: string;
          job_item_id?: string | null;
          message: string;
          org_id: string;
          rule_key?: string;
          severity: string;
          updated_at?: string | null;
        };
        Update: {
          audit_id?: string;
          brand_id?: string;
          created_at?: string;
          created_by?: string | null;
          evidence?: NonNullable<Json>;
          field?: string | null;
          id?: string;
          job_item_id?: string | null;
          message?: string;
          org_id?: string;
          rule_key?: string;
          severity?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_findings_audit_id_fkey";
            columns: ["audit_id"];
            isOneToOne: false;
            referencedRelation: "audits";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_findings_job_item_id_fkey";
            columns: ["job_item_id"];
            isOneToOne: false;
            referencedRelation: "job_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_findings_org_id_fkey";
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
      audits: {
        Row: {
          brand_id: string;
          created_at: string;
          created_by: string | null;
          engine: string;
          finished_at: string | null;
          id: string;
          job_id: string;
          org_id: string;
          rules_version: string | null;
          score: number | null;
          status: string;
          summary: NonNullable<Json>;
          updated_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          brand_id: string;
          created_at?: string;
          created_by?: string | null;
          engine?: string;
          finished_at?: string | null;
          id?: string;
          job_id: string;
          org_id: string;
          rules_version?: string | null;
          score?: number | null;
          status?: string;
          summary?: NonNullable<Json>;
          updated_at?: string | null;
        };
        Update: {
          brand_id?: string;
          created_at?: string;
          created_by?: string | null;
          engine?: string;
          finished_at?: string | null;
          id?: string;
          job_id?: string;
          org_id?: string;
          rules_version?: string | null;
          score?: number | null;
          status?: string;
          summary?: NonNullable<Json>;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audits_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audits_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
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
      check_results: {
        Row: {
          brand_id: string;
          check_run_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          message: string;
          org_id: string;
          override_at: string | null;
          override_by: string | null;
          override_reason: string | null;
          rule_key: string;
          severity: string;
          span: Json | null;
          updated_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          brand_id: string;
          check_run_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          message: string;
          org_id: string;
          override_at?: string | null;
          override_by?: string | null;
          override_reason?: string | null;
          rule_key: string;
          severity: string;
          span?: Json | null;
          updated_at?: string | null;
        };
        Update: {
          brand_id?: string;
          check_run_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          message?: string;
          org_id?: string;
          override_at?: string | null;
          override_by?: string | null;
          override_reason?: string | null;
          rule_key?: string;
          severity?: string;
          span?: Json | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "check_results_check_run_id_fkey";
            columns: ["check_run_id"];
            isOneToOne: false;
            referencedRelation: "check_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "check_results_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      check_rules: {
        Row: {
          active: boolean;
          created_at: string;
          created_by: string | null;
          id: string;
          org_id: string | null;
          pack: string;
          params: NonNullable<Json>;
          rule_key: string;
          severity: string;
          title: string;
          updated_at: string | null;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          org_id?: string | null;
          pack: string;
          params?: NonNullable<Json>;
          rule_key: string;
          severity: string;
          title: string;
          updated_at?: string | null;
          version?: number;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          org_id?: string | null;
          pack?: string;
          params?: NonNullable<Json>;
          rule_key?: string;
          severity?: string;
          title?: string;
          updated_at?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "check_rules_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      check_runs: {
        Row: {
          blocker_count: number;
          brand_id: string;
          created_at: string;
          created_by: string | null;
          draft_version_id: string;
          id: string;
          org_id: string;
          passed: boolean;
          rules_version: string;
          updated_at: string | null;
          warning_count: number;
        };
        ComputedFields: never;
        Insert: {
          blocker_count?: number;
          brand_id: string;
          created_at?: string;
          created_by?: string | null;
          draft_version_id: string;
          id?: string;
          org_id: string;
          passed: boolean;
          rules_version: string;
          updated_at?: string | null;
          warning_count?: number;
        };
        Update: {
          blocker_count?: number;
          brand_id?: string;
          created_at?: string;
          created_by?: string | null;
          draft_version_id?: string;
          id?: string;
          org_id?: string;
          passed?: boolean;
          rules_version?: string;
          updated_at?: string | null;
          warning_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "check_runs_draft_version_id_fkey";
            columns: ["draft_version_id"];
            isOneToOne: false;
            referencedRelation: "draft_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "check_runs_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      client_accounts: {
        Row: {
          ai_policy: string;
          brand_id: string;
          company_id: string;
          created_at: string;
          created_by: string | null;
          data_sensitivity: string;
          id: string;
          org_id: string;
          portal_enabled: boolean;
          primary_contact_id: string | null;
          status: string;
          updated_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          ai_policy?: string;
          brand_id: string;
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          data_sensitivity?: string;
          id?: string;
          org_id: string;
          portal_enabled?: boolean;
          primary_contact_id?: string | null;
          status?: string;
          updated_at?: string | null;
        };
        Update: {
          ai_policy?: string;
          brand_id?: string;
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          data_sensitivity?: string;
          id?: string;
          org_id?: string;
          portal_enabled?: boolean;
          primary_contact_id?: string | null;
          status?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "client_accounts_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "client_accounts_org_id_brand_id_fkey";
            columns: ["org_id", "brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "client_accounts_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "client_accounts_primary_contact_id_fkey";
            columns: ["primary_contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
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
          brand_id: string | null;
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
          brand_id?: string | null;
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
          brand_id?: string | null;
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
            foreignKeyName: "contacts_brand_fk";
            columns: ["org_id", "brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["org_id", "id"];
          },
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
      deliverables: {
        Row: {
          approval_id: string | null;
          brand_id: string;
          created_at: string;
          created_by: string | null;
          delivered_at: string | null;
          delivered_by: string | null;
          file_id: string | null;
          id: string;
          job_id: string;
          kind: string;
          org_id: string;
          status: string;
          updated_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          approval_id?: string | null;
          brand_id: string;
          created_at?: string;
          created_by?: string | null;
          delivered_at?: string | null;
          delivered_by?: string | null;
          file_id?: string | null;
          id?: string;
          job_id: string;
          kind: string;
          org_id: string;
          status?: string;
          updated_at?: string | null;
        };
        Update: {
          approval_id?: string | null;
          brand_id?: string;
          created_at?: string;
          created_by?: string | null;
          delivered_at?: string | null;
          delivered_by?: string | null;
          file_id?: string | null;
          id?: string;
          job_id?: string;
          kind?: string;
          org_id?: string;
          status?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "deliverables_approval_id_fkey";
            columns: ["approval_id"];
            isOneToOne: false;
            referencedRelation: "approvals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deliverables_file_id_fkey";
            columns: ["file_id"];
            isOneToOne: false;
            referencedRelation: "files";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deliverables_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deliverables_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      delivery_checklists: {
        Row: {
          brand_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          items: NonNullable<Json>;
          job_id: string;
          org_id: string;
          updated_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          brand_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          items?: NonNullable<Json>;
          job_id: string;
          org_id: string;
          updated_at?: string | null;
        };
        Update: {
          brand_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          items?: NonNullable<Json>;
          job_id?: string;
          org_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "delivery_checklists_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: true;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "delivery_checklists_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      draft_versions: {
        Row: {
          ai_run_id: string | null;
          author_id: string | null;
          author_kind: string;
          brand_id: string;
          content: NonNullable<Json>;
          content_hash: string;
          created_at: string;
          created_by: string | null;
          draft_id: string;
          id: string;
          org_id: string;
          updated_at: string | null;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          ai_run_id?: string | null;
          author_id?: string | null;
          author_kind?: string;
          brand_id: string;
          content: NonNullable<Json>;
          content_hash?: string;
          created_at?: string;
          created_by?: string | null;
          draft_id: string;
          id?: string;
          org_id: string;
          updated_at?: string | null;
          version?: number;
        };
        Update: {
          ai_run_id?: string | null;
          author_id?: string | null;
          author_kind?: string;
          brand_id?: string;
          content?: NonNullable<Json>;
          content_hash?: string;
          created_at?: string;
          created_by?: string | null;
          draft_id?: string;
          id?: string;
          org_id?: string;
          updated_at?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "draft_versions_draft_id_fkey";
            columns: ["draft_id"];
            isOneToOne: false;
            referencedRelation: "drafts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "draft_versions_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      drafts: {
        Row: {
          brand_id: string;
          created_at: string;
          created_by: string | null;
          current_version_id: string | null;
          id: string;
          in_scope: boolean;
          job_id: string;
          job_item_id: string | null;
          kind: string;
          org_id: string;
          status: string;
          title: string | null;
          updated_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          brand_id: string;
          created_at?: string;
          created_by?: string | null;
          current_version_id?: string | null;
          id?: string;
          in_scope?: boolean;
          job_id: string;
          job_item_id?: string | null;
          kind: string;
          org_id: string;
          status?: string;
          title?: string | null;
          updated_at?: string | null;
        };
        Update: {
          brand_id?: string;
          created_at?: string;
          created_by?: string | null;
          current_version_id?: string | null;
          id?: string;
          in_scope?: boolean;
          job_id?: string;
          job_item_id?: string | null;
          kind?: string;
          org_id?: string;
          status?: string;
          title?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "drafts_current_version_fk";
            columns: ["current_version_id"];
            isOneToOne: false;
            referencedRelation: "draft_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "drafts_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "drafts_job_item_id_fkey";
            columns: ["job_item_id"];
            isOneToOne: false;
            referencedRelation: "job_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "drafts_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
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
      intake_checklists: {
        Row: {
          brand_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          items: NonNullable<Json>;
          job_id: string;
          org_id: string;
          updated_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          brand_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          items?: NonNullable<Json>;
          job_id: string;
          org_id: string;
          updated_at?: string | null;
        };
        Update: {
          brand_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          items?: NonNullable<Json>;
          job_id?: string;
          org_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "intake_checklists_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: true;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "intake_checklists_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      job_items: {
        Row: {
          brand_id: string;
          created_at: string;
          created_by: string | null;
          external_ref: string | null;
          id: string;
          job_id: string;
          kind: string;
          marketplace: string;
          org_id: string;
          source_data: NonNullable<Json>;
          status: string;
          title: string;
          updated_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          brand_id: string;
          created_at?: string;
          created_by?: string | null;
          external_ref?: string | null;
          id?: string;
          job_id: string;
          kind: string;
          marketplace?: string;
          org_id: string;
          source_data?: NonNullable<Json>;
          status?: string;
          title: string;
          updated_at?: string | null;
        };
        Update: {
          brand_id?: string;
          created_at?: string;
          created_by?: string | null;
          external_ref?: string | null;
          id?: string;
          job_id?: string;
          kind?: string;
          marketplace?: string;
          org_id?: string;
          source_data?: NonNullable<Json>;
          status?: string;
          title?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "job_items_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "job_items_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      job_stage_events: {
        Row: {
          actor_id: string | null;
          actor_kind: string;
          at: string;
          brand_id: string;
          created_at: string;
          created_by: string | null;
          from_stage: string;
          gate_results: NonNullable<Json>;
          id: string;
          job_id: string;
          org_id: string;
          reason: string | null;
          to_stage: string;
          updated_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          actor_id?: string | null;
          actor_kind?: string;
          at?: string;
          brand_id: string;
          created_at?: string;
          created_by?: string | null;
          from_stage: string;
          gate_results?: NonNullable<Json>;
          id?: string;
          job_id: string;
          org_id: string;
          reason?: string | null;
          to_stage: string;
          updated_at?: string | null;
        };
        Update: {
          actor_id?: string | null;
          actor_kind?: string;
          at?: string;
          brand_id?: string;
          created_at?: string;
          created_by?: string | null;
          from_stage?: string;
          gate_results?: NonNullable<Json>;
          id?: string;
          job_id?: string;
          org_id?: string;
          reason?: string | null;
          to_stage?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "job_stage_events_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "job_stage_events_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      jobs: {
        Row: {
          assignee_user_id: string | null;
          brand_id: string;
          client_account_id: string;
          contract_ref: string | null;
          created_at: string;
          created_by: string | null;
          due_at: string | null;
          id: string;
          offer: string;
          org_id: string;
          requires_client_approval: boolean;
          reviewer_user_id: string | null;
          scope: NonNullable<Json>;
          stage: string;
          stage_changed_at: string;
          subscription_active: boolean;
          title: string;
          updated_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          assignee_user_id?: string | null;
          brand_id: string;
          client_account_id: string;
          contract_ref?: string | null;
          created_at?: string;
          created_by?: string | null;
          due_at?: string | null;
          id?: string;
          offer: string;
          org_id: string;
          requires_client_approval?: boolean;
          reviewer_user_id?: string | null;
          scope?: NonNullable<Json>;
          stage?: string;
          stage_changed_at?: string;
          subscription_active?: boolean;
          title: string;
          updated_at?: string | null;
        };
        Update: {
          assignee_user_id?: string | null;
          brand_id?: string;
          client_account_id?: string;
          contract_ref?: string | null;
          created_at?: string;
          created_by?: string | null;
          due_at?: string | null;
          id?: string;
          offer?: string;
          org_id?: string;
          requires_client_approval?: boolean;
          reviewer_user_id?: string | null;
          scope?: NonNullable<Json>;
          stage?: string;
          stage_changed_at?: string;
          subscription_active?: boolean;
          title?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "jobs_org_id_brand_id_fkey";
            columns: ["org_id", "brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "jobs_org_id_client_account_id_fkey";
            columns: ["org_id", "client_account_id"];
            isOneToOne: false;
            referencedRelation: "client_accounts";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "jobs_org_id_fkey";
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
      outbox_messages: {
        Row: {
          approval_id: string | null;
          block_reason: string | null;
          body: string;
          brand_id: string;
          channel: string;
          content_hash: string;
          created_at: string;
          created_by: string | null;
          id: string;
          job_id: string | null;
          last_edited_by: string | null;
          org_id: string;
          payload: NonNullable<Json>;
          provider_id: string | null;
          recipient: string | null;
          scheduled_for: string | null;
          sent_at: string | null;
          sent_by: string | null;
          status: string;
          subject: string | null;
          updated_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          approval_id?: string | null;
          block_reason?: string | null;
          body?: string;
          brand_id: string;
          channel: string;
          content_hash?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          job_id?: string | null;
          last_edited_by?: string | null;
          org_id: string;
          payload?: NonNullable<Json>;
          provider_id?: string | null;
          recipient?: string | null;
          scheduled_for?: string | null;
          sent_at?: string | null;
          sent_by?: string | null;
          status?: string;
          subject?: string | null;
          updated_at?: string | null;
        };
        Update: {
          approval_id?: string | null;
          block_reason?: string | null;
          body?: string;
          brand_id?: string;
          channel?: string;
          content_hash?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          job_id?: string | null;
          last_edited_by?: string | null;
          org_id?: string;
          payload?: NonNullable<Json>;
          provider_id?: string | null;
          recipient?: string | null;
          scheduled_for?: string | null;
          sent_at?: string | null;
          sent_by?: string | null;
          status?: string;
          subject?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "outbox_messages_approval_id_fkey";
            columns: ["approval_id"];
            isOneToOne: false;
            referencedRelation: "approvals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "outbox_messages_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "outbox_messages_org_id_brand_id_fkey";
            columns: ["org_id", "brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "outbox_messages_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
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
      approve_subject: {
        Args: { p_comment?: string; p_decision: string; p_subject_id: string; p_subject_type: string };
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
      auth_sees: { Args: { p_id: string; p_org: string; p_type: string }; Returns: boolean };
      auth_sees_job: { Args: { p_job: string }; Returns: boolean };
      brand_ids_within_caller: { Args: { p_brand_ids: string[]; p_org: string }; Returns: boolean };
      can_any_brand: { Args: { p_brand_ids: string[]; p_org: string }; Returns: boolean };
      can_brand: { Args: { p_brand: string; p_org: string }; Returns: boolean };
      cancel_outbox: { Args: { p_id: string; p_reason: string }; Returns: undefined };
      canonical_hash: { Args: { p: Json }; Returns: string };
      canonical_json: { Args: { p: Json }; Returns: string };
      crm_sees: {
        Args: { p_depth?: number; p_id: string; p_org: string; p_type: string; p_user: string };
        Returns: boolean;
      };
      cross_sell_check: { Args: { p_company: string }; Returns: number };
      draft_last_human_editor: { Args: { p_draft: string }; Returns: string };
      emit_event: {
        Args: { p_org: string; p_payload?: Json; p_subject_id: string; p_subject_type: string; p_type: string };
        Returns: string;
      };
      evaluate_gate: { Args: { p_gate: string; p_job: string }; Returns: Json };
      has_perm: { Args: { p_org: string; p_perm: string }; Returns: boolean };
      import_contacts: { Args: { p_brand: string; p_org: string; p_rows: Json }; Returns: Json };
      import_guard_match: { Args: { p_headers: string[]; p_org: string }; Returns: string };
      is_api_role: { Args: Record<PropertyKey, never>; Returns: boolean };
      job_bundle_hash: { Args: { p_job: string }; Returns: string };
      job_gates: { Args: { p_job: string }; Returns: Json };
      job_move_kind: { Args: { p_from: string; p_to: string }; Returns: string };
      mark_notifications_digested: { Args: { p_ids: string[] }; Returns: number };
      normalize_phone: { Args: { p_raw: string }; Returns: string };
      notifications_for_digest: {
        Args: { p_limit?: number };
        Returns: {
          created_at: string;
          id: string;
          kind: string;
          org_id: string;
          payload: Json;
          user_id: string;
        }[];
      };
      org_owner_id: { Args: { p_org: string }; Returns: string };
      outbox_content_hash: {
        Args: { p_body: string; p_channel: string; p_payload: Json; p_recipient: string; p_subject: string };
        Returns: string;
      };
      override_check_result: { Args: { p_reason: string; p_result: string }; Returns: undefined };
      public_form: { Args: { p_form_id: string }; Returns: Json };
      record_check_run: { Args: { p_results: Json; p_rules_version: string; p_version: string }; Returns: string };
      release_outbox: { Args: { p_id: string }; Returns: undefined };
      role_requires_mfa: { Args: { p_role: string }; Returns: boolean };
      set_checklist_item: {
        Args: { p_done: boolean; p_evidence?: string; p_job: string; p_key: string; p_list: string };
        Returns: Json;
      };
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
      transition_job: { Args: { p_job: string; p_override?: boolean; p_reason?: string; p_to: string }; Returns: Json };
      version_checks_ok: { Args: { p_version: string }; Returns: boolean };
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
