export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      announcements: {
        Row: {
          active: boolean
          created_at: string
          id: string
          message: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          message: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          message?: string
          updated_at?: string
        }
        Relationships: []
      }
      error_logs: {
        Row: {
          created_at: string
          detail: string | null
          id: string
          level: string
          message: string
          path: string | null
          resolved: boolean
          source: string
          telegram_id: number | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          detail?: string | null
          id?: string
          level?: string
          message: string
          path?: string | null
          resolved?: boolean
          source?: string
          telegram_id?: number | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          detail?: string | null
          id?: string
          level?: string
          message?: string
          path?: string | null
          resolved?: boolean
          source?: string
          telegram_id?: number | null
          user_agent?: string | null
        }
        Relationships: []
      }
      bonus_drops: {
        Row: {
          amount: number
          created_at: string
          id: string
          note: string | null
          recipients: number
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          note?: string | null
          recipients?: number
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          note?: string | null
          recipients?: number
        }
        Relationships: []
      }
      bot_admin_state: {
        Row: {
          mode: string
          telegram_id: number
          updated_at: string
        }
        Insert: {
          mode: string
          telegram_id: number
          updated_at?: string
        }
        Update: {
          mode?: string
          telegram_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      game_results: {
        Row: {
          cartela_id: number
          created_at: string
          game_id: string
          id: string
          is_winner: boolean
          payout: number
          stake: number
          telegram_id: number
          username: string | null
        }
        Insert: {
          cartela_id: number
          created_at?: string
          game_id: string
          id?: string
          is_winner?: boolean
          payout?: number
          stake: number
          telegram_id: number
          username?: string | null
        }
        Update: {
          cartela_id?: number
          created_at?: string
          game_id?: string
          id?: string
          is_winner?: boolean
          payout?: number
          stake?: number
          telegram_id?: number
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_results_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          called_numbers: number[]
          created_at: string
          ended_at: string | null
          id: string
          player_count: number
          prize_pool: number
          short_code: string | null
          stake: number
          started_at: string
          status: string
          updated_at: string
          winner_cartela_id: number | null
          winner_telegram_id: number | null
        }
        Insert: {
          called_numbers?: number[]
          created_at?: string
          ended_at?: string | null
          id?: string
          player_count?: number
          prize_pool?: number
          short_code?: string | null
          stake: number
          started_at?: string
          status?: string
          updated_at?: string
          winner_cartela_id?: number | null
          winner_telegram_id?: number | null
        }
        Update: {
          called_numbers?: number[]
          created_at?: string
          ended_at?: string | null
          id?: string
          player_count?: number
          prize_pool?: number
          short_code?: string | null
          stake?: number
          started_at?: string
          status?: string
          updated_at?: string
          winner_cartela_id?: number | null
          winner_telegram_id?: number | null
        }
        Relationships: []
      }
      players: {
        Row: {
          balance: number
          banned: boolean
          banned_at: string | null
          banned_reason: string | null
          bonus_balance: number
          bonus_locked: number
          bonus_required: number
          created_at: string
          first_name: string | null
          last_daily_bonus_at: string | null
          phone_number: string | null
          photo_url: string | null
          referral_bonus_paid: boolean
          referred_by: number | null
          telegram_id: number
          updated_at: string
          username: string | null
          welcome_bonus_granted: boolean
        }
        Insert: {
          balance?: number
          banned?: boolean
          banned_at?: string | null
          banned_reason?: string | null
          bonus_balance?: number
          bonus_locked?: number
          bonus_required?: number
          created_at?: string
          first_name?: string | null
          last_daily_bonus_at?: string | null
          phone_number?: string | null
          photo_url?: string | null
          referral_bonus_paid?: boolean
          referred_by?: number | null
          telegram_id: number
          updated_at?: string
          username?: string | null
          welcome_bonus_granted?: boolean
        }
        Update: {
          balance?: number
          banned?: boolean
          banned_at?: string | null
          banned_reason?: string | null
          bonus_balance?: number
          bonus_locked?: number
          bonus_required?: number
          created_at?: string
          first_name?: string | null
          last_daily_bonus_at?: string | null
          phone_number?: string | null
          photo_url?: string | null
          referral_bonus_paid?: boolean
          referred_by?: number | null
          telegram_id?: number
          updated_at?: string
          username?: string | null
          welcome_bonus_granted?: boolean
        }
        Relationships: []
      }
      promo_codes: {
        Row: {
          active: boolean
          amount: number
          code: string
          created_at: string
          expires_at: string | null
          id: string
          max_redemptions: number | null
          redemptions_count: number
          type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount: number
          code: string
          created_at?: string
          expires_at?: string | null
          id?: string
          max_redemptions?: number | null
          redemptions_count?: number
          type: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount?: number
          code?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          max_redemptions?: number | null
          redemptions_count?: number
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      promo_redemptions: {
        Row: {
          amount_credited: number
          created_at: string
          id: string
          promo_id: string
          telegram_id: number
        }
        Insert: {
          amount_credited: number
          created_at?: string
          id?: string
          promo_id: string
          telegram_id: number
        }
        Update: {
          amount_credited?: number
          created_at?: string
          id?: string
          promo_id?: string
          telegram_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "promo_redemptions_promo_id_fkey"
            columns: ["promo_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      round_cartelas: {
        Row: {
          cartela_id: number
          created_at: string
          id: number
          round_index: number
          stake: number
          telegram_id: number
          username: string | null
        }
        Insert: {
          cartela_id: number
          created_at?: string
          id?: number
          round_index: number
          stake: number
          telegram_id: number
          username?: string | null
        }
        Update: {
          cartela_id?: number
          created_at?: string
          id?: number
          round_index?: number
          stake?: number
          telegram_id?: number
          username?: string | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          admin_note: string | null
          amount: number
          cbe_account_name: string | null
          cbe_account_number: string | null
          created_at: string
          id: string
          phone_number: string | null
          processed_at: string | null
          promo_code: string | null
          proof_hash: string | null
          proof_text: string | null
          provider: string | null
          reference: string | null
          status: string
          telegram_id: number
          type: string
        }
        Insert: {
          admin_note?: string | null
          amount: number
          cbe_account_name?: string | null
          cbe_account_number?: string | null
          created_at?: string
          id?: string
          phone_number?: string | null
          processed_at?: string | null
          promo_code?: string | null
          proof_hash?: string | null
          proof_text?: string | null
          provider?: string | null
          reference?: string | null
          status?: string
          telegram_id: number
          type: string
        }
        Update: {
          admin_note?: string | null
          amount?: number
          cbe_account_name?: string | null
          cbe_account_number?: string | null
          created_at?: string
          id?: string
          phone_number?: string | null
          processed_at?: string | null
          promo_code?: string | null
          proof_hash?: string | null
          proof_text?: string | null
          provider?: string | null
          reference?: string | null
          status?: string
          telegram_id?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_telegram_id_fkey"
            columns: ["telegram_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["telegram_id"]
          },
        ]
      }
      welcome_bonus_claims: {
        Row: {
          amount: number
          granted_at: string
          telegram_id: number
        }
        Insert: {
          amount?: number
          granted_at?: string
          telegram_id: number
        }
        Update: {
          amount?: number
          granted_at?: string
          telegram_id?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_daily_bonus: {
        Args: { _amount?: number; _telegram_id: number }
        Returns: {
          amount: number
          claimed: boolean
        }
      }
      debit_stake: {
        Args: { _amount: number; _telegram_id: number }
        Returns: number
      }
      drop_bonus_to_all: {
        Args: { _amount: number; _note?: string }
        Returns: {
          amount: number
          created_at: string
          id: string
          note: string | null
          recipients: number
        }
        SetofOptions: {
          from: "*"
          to: "bonus_drops"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      finish_game: {
        Args: {
          _called_numbers: number[]
          _participants: Json
          _prize_pool: number
          _stake: number
          _winner_cartela_id: number
          _winner_telegram_id: number
        }
        Returns: string
      }
      process_transaction: {
        Args: { _admin_note?: string; _new_status: string; _tx_id: string }
        Returns: {
          admin_note: string | null
          amount: number
          cbe_account_name: string | null
          cbe_account_number: string | null
          created_at: string
          id: string
          phone_number: string | null
          processed_at: string | null
          promo_code: string | null
          proof_hash: string | null
          proof_text: string | null
          provider: string | null
          reference: string | null
          status: string
          telegram_id: number
          type: string
        }
        SetofOptions: {
          from: "*"
          to: "transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      redeem_promo_code: {
        Args: { _code: string; _telegram_id: number }
        Returns: Json
      }
      track_event: {
        Args: { _event_name: string; _properties?: Json; _session_id?: string }
        Returns: void
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
