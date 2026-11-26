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
      can_brand: { Args: { p_brand: string; p_org: string }; Returns: boolean };
      has_perm: { Args: { p_org: string; p_perm: string }; Returns: boolean };
      role_requires_mfa: { Args: { p_role: string }; Returns: boolean };
      setting_bool: { Args: { p_default: boolean; p_key: string; p_org: string }; Returns: boolean };
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
