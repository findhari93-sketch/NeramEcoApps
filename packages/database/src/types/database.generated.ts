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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_notifications: {
        Row: {
          created_at: string | null
          event_type: Database["public"]["Enums"]["notification_event_type"]
          id: string
          is_read: boolean | null
          message: string
          metadata: Json | null
          read_at: string | null
          read_by: string | null
          title: string
        }
        Insert: {
          created_at?: string | null
          event_type: Database["public"]["Enums"]["notification_event_type"]
          id?: string
          is_read?: boolean | null
          message: string
          metadata?: Json | null
          read_at?: string | null
          read_by?: string | null
          title: string
        }
        Update: {
          created_at?: string | null
          event_type?: Database["public"]["Enums"]["notification_event_type"]
          id?: string
          is_read?: boolean | null
          message?: string
          metadata?: Json | null
          read_at?: string | null
          read_by?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_notifications_read_by_fkey"
            columns: ["read_by"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_notifications_read_by_fkey"
            columns: ["read_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_user_notes: {
        Row: {
          admin_id: string
          admin_name: string
          created_at: string | null
          id: string
          note: string
          user_id: string
        }
        Insert: {
          admin_id: string
          admin_name?: string
          created_at?: string | null
          id?: string
          note: string
          user_id: string
        }
        Update: {
          admin_id?: string
          admin_name?: string
          created_at?: string | null
          id?: string
          note?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_user_notes_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_user_notes_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_user_notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_user_notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      allotment_list_entries: {
        Row: {
          aggregate_mark: number | null
          allotted_category: string
          application_number: string | null
          branch_code: string
          branch_name: string | null
          candidate_name: string | null
          college_code: string
          college_id: string | null
          college_name: string | null
          community: string
          counseling_system_id: string
          created_at: string | null
          created_by: string | null
          date_of_birth: string | null
          id: string
          rank: number | null
          serial_number: number | null
          year: number
        }
        Insert: {
          aggregate_mark?: number | null
          allotted_category: string
          application_number?: string | null
          branch_code: string
          branch_name?: string | null
          candidate_name?: string | null
          college_code: string
          college_id?: string | null
          college_name?: string | null
          community: string
          counseling_system_id: string
          created_at?: string | null
          created_by?: string | null
          date_of_birth?: string | null
          id?: string
          rank?: number | null
          serial_number?: number | null
          year: number
        }
        Update: {
          aggregate_mark?: number | null
          allotted_category?: string
          application_number?: string | null
          branch_code?: string
          branch_name?: string | null
          candidate_name?: string | null
          college_code?: string
          college_id?: string | null
          college_name?: string | null
          community?: string
          counseling_system_id?: string
          created_at?: string | null
          created_by?: string | null
          date_of_birth?: string | null
          id?: string
          rank?: number | null
          serial_number?: number | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "allotment_list_entries_college_id_fkey"
            columns: ["college_id"]
            isOneToOne: false
            referencedRelation: "colleges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allotment_list_entries_counseling_system_id_fkey"
            columns: ["counseling_system_id"]
            isOneToOne: false
            referencedRelation: "counseling_systems"
            referencedColumns: ["id"]
          },
        ]
      }
      app_feedback: {
        Row: {
          admin_notes: string | null
          app_version: string | null
          category: Database["public"]["Enums"]["app_feedback_category"]
          created_at: string
          description: string
          device_info: Json | null
          email: string | null
          feedback_number: string
          id: string
          rating: number
          source: string | null
          status: Database["public"]["Enums"]["app_feedback_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          app_version?: string | null
          category?: Database["public"]["Enums"]["app_feedback_category"]
          created_at?: string
          description: string
          device_info?: Json | null
          email?: string | null
          feedback_number: string
          id?: string
          rating: number
          source?: string | null
          status?: Database["public"]["Enums"]["app_feedback_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          app_version?: string | null
          category?: Database["public"]["Enums"]["app_feedback_category"]
          created_at?: string
          description?: string
          device_info?: Json | null
          email?: string | null
          feedback_number?: string
          id?: string
          rating?: number
          source?: string | null
          status?: Database["public"]["Enums"]["app_feedback_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      application_deletions: {
        Row: {
          can_restore: boolean | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string
          deletion_type: string
          id: string
          lead_profile_id: string
          restoration_notes: string | null
          restored_at: string | null
          restored_by: string | null
        }
        Insert: {
          can_restore?: boolean | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason: string
          deletion_type: string
          id?: string
          lead_profile_id: string
          restoration_notes?: string | null
          restored_at?: string | null
          restored_by?: string | null
        }
        Update: {
          can_restore?: boolean | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string
          deletion_type?: string
          id?: string
          lead_profile_id?: string
          restoration_notes?: string | null
          restored_at?: string | null
          restored_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "application_deletions_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_deletions_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_deletions_lead_profile_id_fkey"
            columns: ["lead_profile_id"]
            isOneToOne: false
            referencedRelation: "lead_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_deletions_lead_profile_id_fkey"
            columns: ["lead_profile_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["lead_profile_id"]
          },
          {
            foreignKeyName: "application_deletions_restored_by_fkey"
            columns: ["restored_by"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_deletions_restored_by_fkey"
            columns: ["restored_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      application_documents: {
        Row: {
          created_at: string | null
          document_type: string
          file_name: string | null
          file_size: number | null
          file_url: string
          id: string
          is_verified: boolean | null
          lead_profile_id: string
          mime_type: string | null
          updated_at: string | null
          uploaded_from: string | null
          user_id: string | null
          verification_notes: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string | null
          document_type: string
          file_name?: string | null
          file_size?: number | null
          file_url: string
          id?: string
          is_verified?: boolean | null
          lead_profile_id: string
          mime_type?: string | null
          updated_at?: string | null
          uploaded_from?: string | null
          user_id?: string | null
          verification_notes?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string | null
          document_type?: string
          file_name?: string | null
          file_size?: number | null
          file_url?: string
          id?: string
          is_verified?: boolean | null
          lead_profile_id?: string
          mime_type?: string | null
          updated_at?: string | null
          uploaded_from?: string | null
          user_id?: string | null
          verification_notes?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "application_documents_lead_profile_id_fkey"
            columns: ["lead_profile_id"]
            isOneToOne: false
            referencedRelation: "lead_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_documents_lead_profile_id_fkey"
            columns: ["lead_profile_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["lead_profile_id"]
          },
          {
            foreignKeyName: "application_documents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_documents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_documents_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_documents_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      batches: {
        Row: {
          capacity: number | null
          course_id: string | null
          created_at: string | null
          end_date: string | null
          enrolled_count: number | null
          id: string
          is_active: boolean | null
          ms_team_id: string | null
          ms_team_name: string | null
          name: string
          schedule: Json | null
          start_date: string
          updated_at: string | null
        }
        Insert: {
          capacity?: number | null
          course_id?: string | null
          created_at?: string | null
          end_date?: string | null
          enrolled_count?: number | null
          id?: string
          is_active?: boolean | null
          ms_team_id?: string | null
          ms_team_name?: string | null
          name: string
          schedule?: Json | null
          start_date: string
          updated_at?: string | null
        }
        Update: {
          capacity?: number | null
          course_id?: string | null
          created_at?: string | null
          end_date?: string | null
          enrolled_count?: number | null
          id?: string
          is_active?: boolean | null
          ms_team_id?: string | null
          ms_team_name?: string | null
          name?: string
          schedule?: Json | null
          start_date?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batches_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      callback_attempts: {
        Row: {
          admin_id: string
          admin_name: string
          attempted_at: string
          callback_request_id: string | null
          comments: string | null
          created_at: string
          id: string
          outcome: Database["public"]["Enums"]["callback_outcome"]
          rescheduled_to: string | null
          user_id: string
        }
        Insert: {
          admin_id: string
          admin_name: string
          attempted_at?: string
          callback_request_id?: string | null
          comments?: string | null
          created_at?: string
          id?: string
          outcome: Database["public"]["Enums"]["callback_outcome"]
          rescheduled_to?: string | null
          user_id: string
        }
        Update: {
          admin_id?: string
          admin_name?: string
          attempted_at?: string
          callback_request_id?: string | null
          comments?: string | null
          created_at?: string
          id?: string
          outcome?: Database["public"]["Enums"]["callback_outcome"]
          rescheduled_to?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "callback_attempts_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "callback_attempts_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "callback_attempts_callback_request_id_fkey"
            columns: ["callback_request_id"]
            isOneToOne: false
            referencedRelation: "callback_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      callback_requests: {
        Row: {
          assigned_to: string | null
          attempt_count: number | null
          call_notes: string | null
          call_outcome: string | null
          completed_at: string | null
          course_interest: Database["public"]["Enums"]["course_type"] | null
          created_at: string | null
          email: string | null
          id: string
          is_dead_lead: boolean
          last_attempt_at: string | null
          lead_profile_id: string | null
          name: string
          notes: string | null
          phone: string
          preferred_date: string | null
          preferred_slot: string | null
          query_type: string | null
          scheduled_at: string | null
          scheduled_callback_at: string | null
          status: string | null
          timezone: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          attempt_count?: number | null
          call_notes?: string | null
          call_outcome?: string | null
          completed_at?: string | null
          course_interest?: Database["public"]["Enums"]["course_type"] | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_dead_lead?: boolean
          last_attempt_at?: string | null
          lead_profile_id?: string | null
          name: string
          notes?: string | null
          phone: string
          preferred_date?: string | null
          preferred_slot?: string | null
          query_type?: string | null
          scheduled_at?: string | null
          scheduled_callback_at?: string | null
          status?: string | null
          timezone?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          attempt_count?: number | null
          call_notes?: string | null
          call_outcome?: string | null
          completed_at?: string | null
          course_interest?: Database["public"]["Enums"]["course_type"] | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_dead_lead?: boolean
          last_attempt_at?: string | null
          lead_profile_id?: string | null
          name?: string
          notes?: string | null
          phone?: string
          preferred_date?: string | null
          preferred_slot?: string | null
          query_type?: string | null
          scheduled_at?: string | null
          scheduled_callback_at?: string | null
          status?: string | null
          timezone?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "callback_requests_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "callback_requests_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "callback_requests_lead_profile_id_fkey"
            columns: ["lead_profile_id"]
            isOneToOne: false
            referencedRelation: "lead_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "callback_requests_lead_profile_id_fkey"
            columns: ["lead_profile_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["lead_profile_id"]
          },
          {
            foreignKeyName: "callback_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "callback_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cashback_claims: {
        Row: {
          amount: number
          cashback_phone: string | null
          cashback_transferred_at: string | null
          cashback_type: string
          cashback_upi_id: string | null
          created_at: string | null
          id: string
          instagram_screenshot_url: string | null
          instagram_self_declared: boolean | null
          instagram_username: string | null
          lead_profile_id: string | null
          payment_id: string | null
          processed_at: string | null
          processed_by: string | null
          processing_notes: string | null
          status: string | null
          updated_at: string | null
          user_id: string
          youtube_channel_subscribed: boolean | null
          youtube_verification_data: Json | null
          youtube_verified_at: string | null
        }
        Insert: {
          amount?: number
          cashback_phone?: string | null
          cashback_transferred_at?: string | null
          cashback_type: string
          cashback_upi_id?: string | null
          created_at?: string | null
          id?: string
          instagram_screenshot_url?: string | null
          instagram_self_declared?: boolean | null
          instagram_username?: string | null
          lead_profile_id?: string | null
          payment_id?: string | null
          processed_at?: string | null
          processed_by?: string | null
          processing_notes?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
          youtube_channel_subscribed?: boolean | null
          youtube_verification_data?: Json | null
          youtube_verified_at?: string | null
        }
        Update: {
          amount?: number
          cashback_phone?: string | null
          cashback_transferred_at?: string | null
          cashback_type?: string
          cashback_upi_id?: string | null
          created_at?: string | null
          id?: string
          instagram_screenshot_url?: string | null
          instagram_self_declared?: boolean | null
          instagram_username?: string | null
          lead_profile_id?: string | null
          payment_id?: string | null
          processed_at?: string | null
          processed_by?: string | null
          processing_notes?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
          youtube_channel_subscribed?: boolean | null
          youtube_verification_data?: Json | null
          youtube_verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cashback_claims_lead_profile_id_fkey"
            columns: ["lead_profile_id"]
            isOneToOne: false
            referencedRelation: "lead_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashback_claims_lead_profile_id_fkey"
            columns: ["lead_profile_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["lead_profile_id"]
          },
          {
            foreignKeyName: "cashback_claims_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashback_claims_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashback_claims_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashback_claims_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashback_claims_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      center_visit_bookings: {
        Row: {
          admin_notes: string | null
          center_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string | null
          follow_up_notes: string | null
          follow_up_required: boolean | null
          id: string
          purpose: string | null
          status: string | null
          updated_at: string | null
          user_id: string | null
          visit_date: string
          visit_time_slot: string
          visitor_email: string | null
          visitor_name: string
          visitor_phone: string
        }
        Insert: {
          admin_notes?: string | null
          center_id: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string | null
          follow_up_notes?: string | null
          follow_up_required?: boolean | null
          id?: string
          purpose?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
          visit_date: string
          visit_time_slot: string
          visitor_email?: string | null
          visitor_name: string
          visitor_phone: string
        }
        Update: {
          admin_notes?: string | null
          center_id?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string | null
          follow_up_notes?: string | null
          follow_up_required?: boolean | null
          id?: string
          purpose?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
          visit_date?: string
          visit_time_slot?: string
          visitor_email?: string | null
          visitor_name?: string
          visitor_phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "center_visit_bookings_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "offline_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "center_visit_bookings_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "center_visit_bookings_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "center_visit_bookings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "center_visit_bookings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_conversations: {
        Row: {
          ai_response: string | null
          created_at: string
          error: string | null
          id: string
          lead_name: string | null
          lead_phone: string | null
          model_used: string | null
          page_url: string | null
          response_time_ms: number | null
          session_id: string
          source: string | null
          user_id: string | null
          user_message: string
        }
        Insert: {
          ai_response?: string | null
          created_at?: string
          error?: string | null
          id?: string
          lead_name?: string | null
          lead_phone?: string | null
          model_used?: string | null
          page_url?: string | null
          response_time_ms?: number | null
          session_id: string
          source?: string | null
          user_id?: string | null
          user_message: string
        }
        Update: {
          ai_response?: string | null
          created_at?: string
          error?: string | null
          id?: string
          lead_name?: string | null
          lead_phone?: string | null
          model_used?: string | null
          page_url?: string | null
          response_time_ms?: number | null
          session_id?: string
          source?: string | null
          user_id?: string | null
          user_message?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      classroom_access_requests: {
        Row: {
          admin_notes: string | null
          created_at: string
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_email: string | null
          user_id: string
          user_name: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_email?: string | null
          user_id: string
          user_name: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_email?: string | null
          user_id?: string
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "classroom_access_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classroom_access_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classroom_access_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classroom_access_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      coa_institutions: {
        Row: {
          address: string | null
          affiliating_university: string | null
          approval_period_raw: string
          approval_status: string
          city: string
          commenced_year: number | null
          course_name: string
          created_at: string
          current_intake: number | null
          data_source_url: string | null
          email: string | null
          fax: string | null
          head_of_dept: string | null
          id: string
          institution_code: string
          last_scraped_at: string
          mobile: string | null
          name: string
          phone: string | null
          pincode: string | null
          state: string
          updated_at: string
          valid_for_2025_26: boolean
          website: string | null
        }
        Insert: {
          address?: string | null
          affiliating_university?: string | null
          approval_period_raw: string
          approval_status?: string
          city: string
          commenced_year?: number | null
          course_name?: string
          created_at?: string
          current_intake?: number | null
          data_source_url?: string | null
          email?: string | null
          fax?: string | null
          head_of_dept?: string | null
          id?: string
          institution_code: string
          last_scraped_at?: string
          mobile?: string | null
          name: string
          phone?: string | null
          pincode?: string | null
          state: string
          updated_at?: string
          valid_for_2025_26?: boolean
          website?: string | null
        }
        Update: {
          address?: string | null
          affiliating_university?: string | null
          approval_period_raw?: string
          approval_status?: string
          city?: string
          commenced_year?: number | null
          course_name?: string
          created_at?: string
          current_intake?: number | null
          data_source_url?: string | null
          email?: string | null
          fax?: string | null
          head_of_dept?: string | null
          id?: string
          institution_code?: string
          last_scraped_at?: string
          mobile?: string | null
          name?: string
          phone?: string | null
          pincode?: string | null
          state?: string
          updated_at?: string
          valid_for_2025_26?: boolean
          website?: string | null
        }
        Relationships: []
      }
      college_counseling_participation: {
        Row: {
          branches: Json
          college_code: string
          college_id: string
          counseling_system_id: string
          created_at: string | null
          id: string
          is_active: boolean | null
          seat_matrix: Json | null
          updated_at: string | null
          year: number
        }
        Insert: {
          branches: Json
          college_code: string
          college_id: string
          counseling_system_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          seat_matrix?: Json | null
          updated_at?: string | null
          year: number
        }
        Update: {
          branches?: Json
          college_code?: string
          college_id?: string
          counseling_system_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          seat_matrix?: Json | null
          updated_at?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "college_counseling_participation_college_id_fkey"
            columns: ["college_id"]
            isOneToOne: false
            referencedRelation: "colleges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "college_counseling_participation_counseling_system_id_fkey"
            columns: ["counseling_system_id"]
            isOneToOne: false
            referencedRelation: "counseling_systems"
            referencedColumns: ["id"]
          },
        ]
      }
      colleges: {
        Row: {
          address: string | null
          affiliation: string | null
          annual_fee_approx: number | null
          annual_fee_max: number | null
          annual_fee_min: number | null
          city: string
          coa_approved: boolean | null
          courses_offered: string[] | null
          created_at: string | null
          created_by: string | null
          description: string | null
          district: string | null
          email: string | null
          established_year: number | null
          facilities: string[] | null
          facilities_data: Json | null
          id: string
          images: string[] | null
          intake_capacity: number | null
          is_active: boolean | null
          latitude: number | null
          logo_url: string | null
          longitude: number | null
          meta_description: string | null
          meta_title: string | null
          naac_grade: string | null
          name: string
          neram_tier: string | null
          nirf_rank: number | null
          nirf_rank_architecture: number | null
          phone: string | null
          pincode: string | null
          placement_data: Json | null
          rating: number | null
          short_name: string | null
          slug: string
          state: string
          total_barch_seats: number | null
          type: string | null
          updated_at: string | null
          updated_by: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          affiliation?: string | null
          annual_fee_approx?: number | null
          annual_fee_max?: number | null
          annual_fee_min?: number | null
          city: string
          coa_approved?: boolean | null
          courses_offered?: string[] | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          district?: string | null
          email?: string | null
          established_year?: number | null
          facilities?: string[] | null
          facilities_data?: Json | null
          id?: string
          images?: string[] | null
          intake_capacity?: number | null
          is_active?: boolean | null
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          meta_description?: string | null
          meta_title?: string | null
          naac_grade?: string | null
          name: string
          neram_tier?: string | null
          nirf_rank?: number | null
          nirf_rank_architecture?: number | null
          phone?: string | null
          pincode?: string | null
          placement_data?: Json | null
          rating?: number | null
          short_name?: string | null
          slug: string
          state: string
          total_barch_seats?: number | null
          type?: string | null
          updated_at?: string | null
          updated_by?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          affiliation?: string | null
          annual_fee_approx?: number | null
          annual_fee_max?: number | null
          annual_fee_min?: number | null
          city?: string
          coa_approved?: boolean | null
          courses_offered?: string[] | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          district?: string | null
          email?: string | null
          established_year?: number | null
          facilities?: string[] | null
          facilities_data?: Json | null
          id?: string
          images?: string[] | null
          intake_capacity?: number | null
          is_active?: boolean | null
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          meta_description?: string | null
          meta_title?: string | null
          naac_grade?: string | null
          name?: string
          neram_tier?: string | null
          nirf_rank?: number | null
          nirf_rank_architecture?: number | null
          phone?: string | null
          pincode?: string | null
          placement_data?: Json | null
          rating?: number | null
          short_name?: string | null
          slug?: string
          state?: string
          total_barch_seats?: number | null
          type?: string | null
          updated_at?: string | null
          updated_by?: string | null
          website?: string | null
        }
        Relationships: []
      }
      comment_likes: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "question_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_votes: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          user_id: string
          vote: Database["public"]["Enums"]["vote_type"]
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          user_id: string
          vote: Database["public"]["Enums"]["vote_type"]
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          user_id?: string
          vote?: Database["public"]["Enums"]["vote_type"]
        }
        Relationships: [
          {
            foreignKeyName: "comment_votes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "question_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_messages: {
        Row: {
          center_id: string | null
          created_at: string | null
          email: string
          id: string
          ip_address: string | null
          message: string
          name: string
          phone: string | null
          replied_at: string | null
          replied_by: string | null
          source: string | null
          status: string | null
          subject: string
          user_agent: string | null
        }
        Insert: {
          center_id?: string | null
          created_at?: string | null
          email: string
          id?: string
          ip_address?: string | null
          message: string
          name: string
          phone?: string | null
          replied_at?: string | null
          replied_by?: string | null
          source?: string | null
          status?: string | null
          subject: string
          user_agent?: string | null
        }
        Update: {
          center_id?: string | null
          created_at?: string | null
          email?: string
          id?: string
          ip_address?: string | null
          message?: string
          name?: string
          phone?: string | null
          replied_at?: string | null
          replied_by?: string | null
          source?: string | null
          status?: string | null
          subject?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_messages_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "offline_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      counseling_audit_log: {
        Row: {
          change_type: string
          changed_at: string | null
          changed_by: string
          context: Json | null
          field_name: string | null
          id: string
          new_value: string | null
          old_value: string | null
          record_id: string
          table_name: string
        }
        Insert: {
          change_type: string
          changed_at?: string | null
          changed_by: string
          context?: Json | null
          field_name?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          record_id: string
          table_name: string
        }
        Update: {
          change_type?: string
          changed_at?: string | null
          changed_by?: string
          context?: Json | null
          field_name?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          record_id?: string
          table_name?: string
        }
        Relationships: []
      }
      counseling_college_directory: {
        Row: {
          city: string | null
          coa_institution_code: string | null
          college_code: string
          college_name: string
          counseling_system_id: string
          created_at: string | null
          district: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          city?: string | null
          coa_institution_code?: string | null
          college_code: string
          college_name: string
          counseling_system_id: string
          created_at?: string | null
          district?: string | null
          id?: string
          updated_at?: string | null
        }
        Update: {
          city?: string | null
          coa_institution_code?: string | null
          college_code?: string
          college_name?: string
          counseling_system_id?: string
          created_at?: string | null
          district?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "counseling_college_directory_counseling_system_id_fkey"
            columns: ["counseling_system_id"]
            isOneToOne: false
            referencedRelation: "counseling_systems"
            referencedColumns: ["id"]
          },
        ]
      }
      counseling_systems: {
        Row: {
          categories: Json
          code: string
          conducting_body: string
          conducting_body_full: string | null
          created_at: string | null
          exams_accepted: string[]
          id: string
          is_active: boolean | null
          merit_formula: Json
          name: string
          official_website: string | null
          short_name: string | null
          slug: string
          special_reservations: Json | null
          state: string
          typical_counseling_months: string | null
          typical_rounds: number | null
          updated_at: string | null
        }
        Insert: {
          categories: Json
          code: string
          conducting_body: string
          conducting_body_full?: string | null
          created_at?: string | null
          exams_accepted: string[]
          id?: string
          is_active?: boolean | null
          merit_formula: Json
          name: string
          official_website?: string | null
          short_name?: string | null
          slug: string
          special_reservations?: Json | null
          state: string
          typical_counseling_months?: string | null
          typical_rounds?: number | null
          updated_at?: string | null
        }
        Update: {
          categories?: Json
          code?: string
          conducting_body?: string
          conducting_body_full?: string | null
          created_at?: string | null
          exams_accepted?: string[]
          id?: string
          is_active?: boolean | null
          merit_formula?: Json
          name?: string
          official_website?: string | null
          short_name?: string | null
          slug?: string
          special_reservations?: Json | null
          state?: string
          typical_counseling_months?: string | null
          typical_rounds?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      coupons: {
        Row: {
          applicable_courses:
            | Database["public"]["Enums"]["course_type"][]
            | null
          code: string
          created_at: string | null
          created_by: string | null
          description: string | null
          discount_type: string
          discount_value: number
          id: string
          is_active: boolean | null
          lead_profile_id: string | null
          max_uses: number | null
          min_amount: number | null
          updated_at: string | null
          used_count: number | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          applicable_courses?:
            | Database["public"]["Enums"]["course_type"][]
            | null
          code: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          discount_type: string
          discount_value: number
          id?: string
          is_active?: boolean | null
          lead_profile_id?: string | null
          max_uses?: number | null
          min_amount?: number | null
          updated_at?: string | null
          used_count?: number | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          applicable_courses?:
            | Database["public"]["Enums"]["course_type"][]
            | null
          code?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean | null
          lead_profile_id?: string | null
          max_uses?: number | null
          min_amount?: number | null
          updated_at?: string | null
          used_count?: number | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupons_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupons_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupons_lead_profile_id_fkey"
            columns: ["lead_profile_id"]
            isOneToOne: false
            referencedRelation: "lead_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupons_lead_profile_id_fkey"
            columns: ["lead_profile_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["lead_profile_id"]
          },
        ]
      }
      courses: {
        Row: {
          course_category: string | null
          course_type: Database["public"]["Enums"]["course_type"]
          created_at: string | null
          current_students: number | null
          description: string | null
          discount_valid_until: string | null
          discounted_fee: number | null
          display_order: number | null
          duration_months: number | null
          enrollment_deadline: string | null
          enrollment_open: boolean | null
          features: string[] | null
          id: string
          is_active: boolean | null
          is_featured: boolean | null
          max_students: number | null
          meta_description: Json | null
          meta_title: Json | null
          name: string
          regular_fee: number
          short_description: string | null
          slug: string
          syllabus: string | null
          target_audience: string | null
          total_lessons: number | null
          updated_at: string | null
        }
        Insert: {
          course_category?: string | null
          course_type: Database["public"]["Enums"]["course_type"]
          created_at?: string | null
          current_students?: number | null
          description?: string | null
          discount_valid_until?: string | null
          discounted_fee?: number | null
          display_order?: number | null
          duration_months?: number | null
          enrollment_deadline?: string | null
          enrollment_open?: boolean | null
          features?: string[] | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          max_students?: number | null
          meta_description?: Json | null
          meta_title?: Json | null
          name: string
          regular_fee: number
          short_description?: string | null
          slug: string
          syllabus?: string | null
          target_audience?: string | null
          total_lessons?: number | null
          updated_at?: string | null
        }
        Update: {
          course_category?: string | null
          course_type?: Database["public"]["Enums"]["course_type"]
          created_at?: string | null
          current_students?: number | null
          description?: string | null
          discount_valid_until?: string | null
          discounted_fee?: number | null
          display_order?: number | null
          duration_months?: number | null
          enrollment_deadline?: string | null
          enrollment_open?: boolean | null
          features?: string[] | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          max_students?: number | null
          meta_description?: Json | null
          meta_title?: Json | null
          name?: string
          regular_fee?: number
          short_description?: string | null
          slug?: string
          syllabus?: string | null
          target_audience?: string | null
          total_lessons?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      cutoff_data: {
        Row: {
          all_india_cutoff: number | null
          college_id: string | null
          created_at: string | null
          ews_cutoff: number | null
          exam_type: Database["public"]["Enums"]["exam_type"]
          general_cutoff: number | null
          id: string
          notes: string | null
          obc_cutoff: number | null
          round: number | null
          sc_cutoff: number | null
          seats_filled: number | null
          st_cutoff: number | null
          state_quota_cutoff: number | null
          total_seats: number | null
          updated_at: string | null
          year: number
        }
        Insert: {
          all_india_cutoff?: number | null
          college_id?: string | null
          created_at?: string | null
          ews_cutoff?: number | null
          exam_type: Database["public"]["Enums"]["exam_type"]
          general_cutoff?: number | null
          id?: string
          notes?: string | null
          obc_cutoff?: number | null
          round?: number | null
          sc_cutoff?: number | null
          seats_filled?: number | null
          st_cutoff?: number | null
          state_quota_cutoff?: number | null
          total_seats?: number | null
          updated_at?: string | null
          year: number
        }
        Update: {
          all_india_cutoff?: number | null
          college_id?: string | null
          created_at?: string | null
          ews_cutoff?: number | null
          exam_type?: Database["public"]["Enums"]["exam_type"]
          general_cutoff?: number | null
          id?: string
          notes?: string | null
          obc_cutoff?: number | null
          round?: number | null
          sc_cutoff?: number | null
          seats_filled?: number | null
          st_cutoff?: number | null
          state_quota_cutoff?: number | null
          total_seats?: number | null
          updated_at?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "cutoff_data_college_id_fkey"
            columns: ["college_id"]
            isOneToOne: false
            referencedRelation: "colleges"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_class_registrations: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          attendance_marked_at: string | null
          attendance_marked_by: string | null
          attended: boolean | null
          calendar_invite_sent: boolean | null
          city: string | null
          confirmation_email_sent: boolean | null
          confirmation_email_sent_at: string | null
          converted_to_lead: boolean | null
          created_at: string | null
          current_class: string | null
          email: string | null
          id: string
          interest_course: string | null
          lead_profile_id: string | null
          name: string
          phone: string
          referral_code: string | null
          rejection_reason: string | null
          reminder_1h_sent: boolean | null
          reminder_24h_sent: boolean | null
          slot_id: string
          status: Database["public"]["Enums"]["demo_registration_status"]
          survey_completed: boolean | null
          survey_email_sent: boolean | null
          survey_email_sent_at: string | null
          updated_at: string | null
          user_id: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          whatsapp_sent: boolean | null
          whatsapp_sent_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          attendance_marked_at?: string | null
          attendance_marked_by?: string | null
          attended?: boolean | null
          calendar_invite_sent?: boolean | null
          city?: string | null
          confirmation_email_sent?: boolean | null
          confirmation_email_sent_at?: string | null
          converted_to_lead?: boolean | null
          created_at?: string | null
          current_class?: string | null
          email?: string | null
          id?: string
          interest_course?: string | null
          lead_profile_id?: string | null
          name: string
          phone: string
          referral_code?: string | null
          rejection_reason?: string | null
          reminder_1h_sent?: boolean | null
          reminder_24h_sent?: boolean | null
          slot_id: string
          status?: Database["public"]["Enums"]["demo_registration_status"]
          survey_completed?: boolean | null
          survey_email_sent?: boolean | null
          survey_email_sent_at?: string | null
          updated_at?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          whatsapp_sent?: boolean | null
          whatsapp_sent_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          attendance_marked_at?: string | null
          attendance_marked_by?: string | null
          attended?: boolean | null
          calendar_invite_sent?: boolean | null
          city?: string | null
          confirmation_email_sent?: boolean | null
          confirmation_email_sent_at?: string | null
          converted_to_lead?: boolean | null
          created_at?: string | null
          current_class?: string | null
          email?: string | null
          id?: string
          interest_course?: string | null
          lead_profile_id?: string | null
          name?: string
          phone?: string
          referral_code?: string | null
          rejection_reason?: string | null
          reminder_1h_sent?: boolean | null
          reminder_24h_sent?: boolean | null
          slot_id?: string
          status?: Database["public"]["Enums"]["demo_registration_status"]
          survey_completed?: boolean | null
          survey_email_sent?: boolean | null
          survey_email_sent_at?: string | null
          updated_at?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          whatsapp_sent?: boolean | null
          whatsapp_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "demo_class_registrations_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demo_class_registrations_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demo_class_registrations_attendance_marked_by_fkey"
            columns: ["attendance_marked_by"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demo_class_registrations_attendance_marked_by_fkey"
            columns: ["attendance_marked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demo_class_registrations_lead_profile_id_fkey"
            columns: ["lead_profile_id"]
            isOneToOne: false
            referencedRelation: "lead_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demo_class_registrations_lead_profile_id_fkey"
            columns: ["lead_profile_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["lead_profile_id"]
          },
          {
            foreignKeyName: "demo_class_registrations_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "demo_class_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demo_class_registrations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demo_class_registrations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_class_slots: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          confirmation_notifications_sent: boolean | null
          confirmed_at: string | null
          course_id: string | null
          created_at: string | null
          created_by: string | null
          current_registrations: number
          demo_mode: Database["public"]["Enums"]["demo_mode"]
          description: string | null
          duration_minutes: number
          id: string
          instructor_id: string | null
          instructor_name: string | null
          max_registrations: number
          meeting_link: string | null
          meeting_password: string | null
          min_registrations: number
          reminder_1h_sent: boolean | null
          reminder_24h_sent: boolean | null
          slot_date: string
          slot_time: string
          status: Database["public"]["Enums"]["demo_slot_status"]
          title: string
          updated_at: string | null
          venue_address: string | null
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          confirmation_notifications_sent?: boolean | null
          confirmed_at?: string | null
          course_id?: string | null
          created_at?: string | null
          created_by?: string | null
          current_registrations?: number
          demo_mode?: Database["public"]["Enums"]["demo_mode"]
          description?: string | null
          duration_minutes?: number
          id?: string
          instructor_id?: string | null
          instructor_name?: string | null
          max_registrations?: number
          meeting_link?: string | null
          meeting_password?: string | null
          min_registrations?: number
          reminder_1h_sent?: boolean | null
          reminder_24h_sent?: boolean | null
          slot_date: string
          slot_time: string
          status?: Database["public"]["Enums"]["demo_slot_status"]
          title?: string
          updated_at?: string | null
          venue_address?: string | null
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          confirmation_notifications_sent?: boolean | null
          confirmed_at?: string | null
          course_id?: string | null
          created_at?: string | null
          created_by?: string | null
          current_registrations?: number
          demo_mode?: Database["public"]["Enums"]["demo_mode"]
          description?: string | null
          duration_minutes?: number
          id?: string
          instructor_id?: string | null
          instructor_name?: string | null
          max_registrations?: number
          meeting_link?: string | null
          meeting_password?: string | null
          min_registrations?: number
          reminder_1h_sent?: boolean | null
          reminder_24h_sent?: boolean | null
          slot_date?: string
          slot_time?: string
          status?: Database["public"]["Enums"]["demo_slot_status"]
          title?: string
          updated_at?: string | null
          venue_address?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "demo_class_slots_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demo_class_slots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demo_class_slots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demo_class_slots_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demo_class_slots_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_class_surveys: {
        Row: {
          additional_comments: string | null
          contact_for_followup: boolean | null
          enrollment_interest:
            | Database["public"]["Enums"]["enrollment_interest"]
            | null
          id: string
          liked_most: string | null
          nps_score: number | null
          overall_rating: number | null
          registration_id: string
          submitted_at: string | null
          suggestions: string | null
          teaching_rating: number | null
        }
        Insert: {
          additional_comments?: string | null
          contact_for_followup?: boolean | null
          enrollment_interest?:
            | Database["public"]["Enums"]["enrollment_interest"]
            | null
          id?: string
          liked_most?: string | null
          nps_score?: number | null
          overall_rating?: number | null
          registration_id: string
          submitted_at?: string | null
          suggestions?: string | null
          teaching_rating?: number | null
        }
        Update: {
          additional_comments?: string | null
          contact_for_followup?: boolean | null
          enrollment_interest?:
            | Database["public"]["Enums"]["enrollment_interest"]
            | null
          id?: string
          liked_most?: string | null
          nps_score?: number | null
          overall_rating?: number | null
          registration_id?: string
          submitted_at?: string | null
          suggestions?: string | null
          teaching_rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "demo_class_surveys_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: true
            referencedRelation: "demo_class_registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_enrollment_links: {
        Row: {
          admin_notes: string | null
          amount_paid: number
          batch_id: string | null
          center_id: string | null
          course_id: string | null
          created_at: string
          created_by: string
          discount_amount: number
          expires_at: string
          final_fee: number
          id: string
          interest_course: Database["public"]["Enums"]["course_type"]
          lead_profile_id: string | null
          learning_mode: Database["public"]["Enums"]["learning_mode"]
          parent_phone: string | null
          payment_date: string | null
          payment_method: string
          payment_proof_url: string | null
          regenerated_from: string | null
          regenerated_to: string | null
          status: Database["public"]["Enums"]["direct_enrollment_link_status"]
          student_email: string | null
          student_name: string
          student_phone: string | null
          student_profile_id: string | null
          token: string
          total_fee: number
          transaction_reference: string | null
          updated_at: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          admin_notes?: string | null
          amount_paid?: number
          batch_id?: string | null
          center_id?: string | null
          course_id?: string | null
          created_at?: string
          created_by: string
          discount_amount?: number
          expires_at?: string
          final_fee?: number
          id?: string
          interest_course: Database["public"]["Enums"]["course_type"]
          lead_profile_id?: string | null
          learning_mode?: Database["public"]["Enums"]["learning_mode"]
          parent_phone?: string | null
          payment_date?: string | null
          payment_method?: string
          payment_proof_url?: string | null
          regenerated_from?: string | null
          regenerated_to?: string | null
          status?: Database["public"]["Enums"]["direct_enrollment_link_status"]
          student_email?: string | null
          student_name: string
          student_phone?: string | null
          student_profile_id?: string | null
          token: string
          total_fee?: number
          transaction_reference?: string | null
          updated_at?: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          admin_notes?: string | null
          amount_paid?: number
          batch_id?: string | null
          center_id?: string | null
          course_id?: string | null
          created_at?: string
          created_by?: string
          discount_amount?: number
          expires_at?: string
          final_fee?: number
          id?: string
          interest_course?: Database["public"]["Enums"]["course_type"]
          lead_profile_id?: string | null
          learning_mode?: Database["public"]["Enums"]["learning_mode"]
          parent_phone?: string | null
          payment_date?: string | null
          payment_method?: string
          payment_proof_url?: string | null
          regenerated_from?: string | null
          regenerated_to?: string | null
          status?: Database["public"]["Enums"]["direct_enrollment_link_status"]
          student_email?: string | null
          student_name?: string
          student_phone?: string | null
          student_profile_id?: string | null
          token?: string
          total_fee?: number
          transaction_reference?: string | null
          updated_at?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "direct_enrollment_links_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_enrollment_links_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "offline_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_enrollment_links_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_enrollment_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_enrollment_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_enrollment_links_lead_profile_id_fkey"
            columns: ["lead_profile_id"]
            isOneToOne: false
            referencedRelation: "lead_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_enrollment_links_lead_profile_id_fkey"
            columns: ["lead_profile_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["lead_profile_id"]
          },
          {
            foreignKeyName: "direct_enrollment_links_regenerated_from_fkey"
            columns: ["regenerated_from"]
            isOneToOne: false
            referencedRelation: "direct_enrollment_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_enrollment_links_regenerated_to_fkey"
            columns: ["regenerated_to"]
            isOneToOne: false
            referencedRelation: "direct_enrollment_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_enrollment_links_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_enrollment_links_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["student_profile_id"]
          },
          {
            foreignKeyName: "direct_enrollment_links_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_enrollment_links_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      education_boards: {
        Row: {
          code: string
          country: string | null
          display_order: number | null
          full_name: string | null
          id: string
          is_active: boolean | null
          name: string
          states: string[] | null
        }
        Insert: {
          code: string
          country?: string | null
          display_order?: number | null
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          states?: string[] | null
        }
        Update: {
          code?: string
          country?: string | null
          display_order?: number | null
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          states?: string[] | null
        }
        Relationships: []
      }
      email_logs: {
        Row: {
          created_at: string | null
          error_message: string | null
          id: string
          resend_id: string | null
          sent_at: string | null
          status: string | null
          subject: string
          template_id: string | null
          to_email: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          resend_id?: string | null
          sent_at?: string | null
          status?: string | null
          subject: string
          template_id?: string | null
          to_email: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          resend_id?: string | null
          sent_at?: string | null
          status?: string | null
          subject?: string
          template_id?: string | null
          to_email?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body_html: Json
          body_text: Json | null
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          slug: string
          subject: Json
          updated_at: string | null
          variables: string[] | null
        }
        Insert: {
          body_html: Json
          body_text?: Json | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          slug: string
          subject: Json
          updated_at?: string | null
          variables?: string[] | null
        }
        Update: {
          body_html?: Json
          body_text?: Json | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          slug?: string
          subject?: Json
          updated_at?: string | null
          variables?: string[] | null
        }
        Relationships: []
      }
      exam_centers: {
        Row: {
          address: string
          capacity: number | null
          city: string
          code: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string | null
          exam_types: Database["public"]["Enums"]["exam_type"][] | null
          facilities: string[] | null
          id: string
          is_active: boolean | null
          latitude: number | null
          longitude: number | null
          name: string
          pincode: string | null
          state: string
          updated_at: string | null
        }
        Insert: {
          address: string
          capacity?: number | null
          city: string
          code?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          exam_types?: Database["public"]["Enums"]["exam_type"][] | null
          facilities?: string[] | null
          id?: string
          is_active?: boolean | null
          latitude?: number | null
          longitude?: number | null
          name: string
          pincode?: string | null
          state: string
          updated_at?: string | null
        }
        Update: {
          address?: string
          capacity?: number | null
          city?: string
          code?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          exam_types?: Database["public"]["Enums"]["exam_type"][] | null
          facilities?: string[] | null
          id?: string
          is_active?: boolean | null
          latitude?: number | null
          longitude?: number | null
          name?: string
          pincode?: string | null
          state?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      fee_structures: {
        Row: {
          combo_extra_fee: number | null
          course_type: Database["public"]["Enums"]["course_type"]
          created_at: string | null
          display_name: string
          display_name_ta: string | null
          display_order: number | null
          duration: string
          features: Json | null
          fee_amount: number
          id: string
          installment_1_amount: number | null
          installment_2_amount: number | null
          is_active: boolean | null
          is_hidden_from_public: boolean | null
          program_type: Database["public"]["Enums"]["program_type"]
          schedule_summary: string | null
          single_payment_discount: number | null
          updated_at: string | null
        }
        Insert: {
          combo_extra_fee?: number | null
          course_type: Database["public"]["Enums"]["course_type"]
          created_at?: string | null
          display_name: string
          display_name_ta?: string | null
          display_order?: number | null
          duration: string
          features?: Json | null
          fee_amount: number
          id?: string
          installment_1_amount?: number | null
          installment_2_amount?: number | null
          is_active?: boolean | null
          is_hidden_from_public?: boolean | null
          program_type: Database["public"]["Enums"]["program_type"]
          schedule_summary?: string | null
          single_payment_discount?: number | null
          updated_at?: string | null
        }
        Update: {
          combo_extra_fee?: number | null
          course_type?: Database["public"]["Enums"]["course_type"]
          created_at?: string | null
          display_name?: string
          display_name_ta?: string | null
          display_order?: number | null
          duration?: string
          features?: Json | null
          fee_amount?: number
          id?: string
          installment_1_amount?: number | null
          installment_2_amount?: number | null
          is_active?: boolean | null
          is_hidden_from_public?: boolean | null
          program_type?: Database["public"]["Enums"]["program_type"]
          schedule_summary?: string | null
          single_payment_discount?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      historical_cutoffs: {
        Row: {
          branch_code: string
          category: string
          closing_mark: number | null
          closing_rank: number | null
          college_id: string
          counseling_system_id: string
          created_at: string | null
          created_by: string | null
          id: string
          opening_mark: number | null
          opening_rank: number | null
          round: string
          seats_available: number | null
          seats_filled: number | null
          updated_at: string | null
          updated_by: string | null
          year: number
        }
        Insert: {
          branch_code: string
          category: string
          closing_mark?: number | null
          closing_rank?: number | null
          college_id: string
          counseling_system_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          opening_mark?: number | null
          opening_rank?: number | null
          round: string
          seats_available?: number | null
          seats_filled?: number | null
          updated_at?: string | null
          updated_by?: string | null
          year: number
        }
        Update: {
          branch_code?: string
          category?: string
          closing_mark?: number | null
          closing_rank?: number | null
          college_id?: string
          counseling_system_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          opening_mark?: number | null
          opening_rank?: number | null
          round?: string
          seats_available?: number | null
          seats_filled?: number | null
          updated_at?: string | null
          updated_by?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "historical_cutoffs_college_id_fkey"
            columns: ["college_id"]
            isOneToOne: false
            referencedRelation: "colleges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historical_cutoffs_counseling_system_id_fkey"
            columns: ["counseling_system_id"]
            isOneToOne: false
            referencedRelation: "counseling_systems"
            referencedColumns: ["id"]
          },
        ]
      }
      improvement_votes: {
        Row: {
          created_at: string
          id: string
          improvement_id: string
          user_id: string
          vote: Database["public"]["Enums"]["vote_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          improvement_id: string
          user_id: string
          vote: Database["public"]["Enums"]["vote_type"]
        }
        Update: {
          created_at?: string
          id?: string
          improvement_id?: string
          user_id?: string
          vote?: Database["public"]["Enums"]["vote_type"]
        }
        Relationships: [
          {
            foreignKeyName: "improvement_votes_improvement_id_fkey"
            columns: ["improvement_id"]
            isOneToOne: false
            referencedRelation: "question_improvements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "improvement_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "improvement_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      job_applications: {
        Row: {
          admin_notes: string | null
          applicant_email: string
          applicant_name: string
          applicant_phone: string
          created_at: string
          id: string
          job_posting_id: string
          portfolio_url: string | null
          resume_url: string | null
          screening_answers: Json
          status: string
          terms_agreed: boolean
          terms_agreed_at: string | null
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          applicant_email: string
          applicant_name: string
          applicant_phone: string
          created_at?: string
          id?: string
          job_posting_id: string
          portfolio_url?: string | null
          resume_url?: string | null
          screening_answers?: Json
          status?: string
          terms_agreed?: boolean
          terms_agreed_at?: string | null
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          applicant_email?: string
          applicant_name?: string
          applicant_phone?: string
          created_at?: string
          id?: string
          job_posting_id?: string
          portfolio_url?: string | null
          resume_url?: string | null
          screening_answers?: Json
          status?: string
          terms_agreed?: boolean
          terms_agreed_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_applications_job_posting_id_fkey"
            columns: ["job_posting_id"]
            isOneToOne: false
            referencedRelation: "job_postings"
            referencedColumns: ["id"]
          },
        ]
      }
      job_postings: {
        Row: {
          closed_at: string | null
          contract_terms: Json
          created_at: string
          created_by: string | null
          department: string
          description: string
          display_priority: number
          employment_type: string
          experience_required: string | null
          id: string
          location: string
          published_at: string | null
          schedule_details: string | null
          screening_questions: Json
          skills_required: Json
          slug: string
          status: string
          target_audience: string
          title: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          contract_terms?: Json
          created_at?: string
          created_by?: string | null
          department: string
          description: string
          display_priority?: number
          employment_type?: string
          experience_required?: string | null
          id?: string
          location: string
          published_at?: string | null
          schedule_details?: string | null
          screening_questions?: Json
          skills_required?: Json
          slug: string
          status?: string
          target_audience?: string
          title: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          contract_terms?: Json
          created_at?: string
          created_by?: string | null
          department?: string
          description?: string
          display_priority?: number
          employment_type?: string
          experience_required?: string | null
          id?: string
          location?: string
          published_at?: string | null
          schedule_details?: string | null
          screening_questions?: Json
          skills_required?: Json
          slug?: string
          status?: string
          target_audience?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      lead_profiles: {
        Row: {
          academic_data: Json | null
          address: string | null
          admin_coupon_id: string | null
          admin_notes: string | null
          allowed_payment_modes: string | null
          applicant_category:
            | Database["public"]["Enums"]["applicant_category"]
            | null
          application_data: Json | null
          application_number: string | null
          assigned_fee: number | null
          caste_category: string | null
          city: string | null
          contacted_at: string | null
          contacted_by: string | null
          contacted_status: string | null
          country: string | null
          coupon_code: string | null
          created_at: string | null
          deleted_at: string | null
          deletion_reason: string | null
          detected_location: Json | null
          discount_amount: number | null
          district: string | null
          email_sent_at: string | null
          father_name: string | null
          final_fee: number | null
          form_completed_at: string | null
          form_step_completed: number | null
          full_payment_discount: number | null
          hybrid_learning_accepted: boolean | null
          id: string
          installment_1_amount: number | null
          installment_2_amount: number | null
          installment_2_due_days: number | null
          installment_reminder_date: string | null
          interest_course: Database["public"]["Enums"]["course_type"] | null
          last_reminder_sent_at: string | null
          latitude: number | null
          learning_mode: Database["public"]["Enums"]["learning_mode"] | null
          location_source: string | null
          longitude: number | null
          parent_phone: string | null
          payment_deadline: string | null
          payment_recommendation: string | null
          payment_scheme: string | null
          phone_verified: boolean | null
          phone_verified_at: string | null
          pincode: string | null
          qualification: string | null
          referral_code: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          scholarship_eligible: boolean | null
          scholarship_opened_at: string | null
          scholarship_opened_by: string | null
          school_college: string | null
          school_type: Database["public"]["Enums"]["school_type"] | null
          selected_center_id: string | null
          selected_course_id: string | null
          source: Database["public"]["Enums"]["application_source"] | null
          state: string | null
          status: Database["public"]["Enums"]["application_status"] | null
          target_exam_year: number | null
          total_cashback_eligible: number | null
          total_cashback_processed: number | null
          updated_at: string | null
          user_id: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          whatsapp_sent_at: string | null
        }
        Insert: {
          academic_data?: Json | null
          address?: string | null
          admin_coupon_id?: string | null
          admin_notes?: string | null
          allowed_payment_modes?: string | null
          applicant_category?:
            | Database["public"]["Enums"]["applicant_category"]
            | null
          application_data?: Json | null
          application_number?: string | null
          assigned_fee?: number | null
          caste_category?: string | null
          city?: string | null
          contacted_at?: string | null
          contacted_by?: string | null
          contacted_status?: string | null
          country?: string | null
          coupon_code?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deletion_reason?: string | null
          detected_location?: Json | null
          discount_amount?: number | null
          district?: string | null
          email_sent_at?: string | null
          father_name?: string | null
          final_fee?: number | null
          form_completed_at?: string | null
          form_step_completed?: number | null
          full_payment_discount?: number | null
          hybrid_learning_accepted?: boolean | null
          id?: string
          installment_1_amount?: number | null
          installment_2_amount?: number | null
          installment_2_due_days?: number | null
          installment_reminder_date?: string | null
          interest_course?: Database["public"]["Enums"]["course_type"] | null
          last_reminder_sent_at?: string | null
          latitude?: number | null
          learning_mode?: Database["public"]["Enums"]["learning_mode"] | null
          location_source?: string | null
          longitude?: number | null
          parent_phone?: string | null
          payment_deadline?: string | null
          payment_recommendation?: string | null
          payment_scheme?: string | null
          phone_verified?: boolean | null
          phone_verified_at?: string | null
          pincode?: string | null
          qualification?: string | null
          referral_code?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scholarship_eligible?: boolean | null
          scholarship_opened_at?: string | null
          scholarship_opened_by?: string | null
          school_college?: string | null
          school_type?: Database["public"]["Enums"]["school_type"] | null
          selected_center_id?: string | null
          selected_course_id?: string | null
          source?: Database["public"]["Enums"]["application_source"] | null
          state?: string | null
          status?: Database["public"]["Enums"]["application_status"] | null
          target_exam_year?: number | null
          total_cashback_eligible?: number | null
          total_cashback_processed?: number | null
          updated_at?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          whatsapp_sent_at?: string | null
        }
        Update: {
          academic_data?: Json | null
          address?: string | null
          admin_coupon_id?: string | null
          admin_notes?: string | null
          allowed_payment_modes?: string | null
          applicant_category?:
            | Database["public"]["Enums"]["applicant_category"]
            | null
          application_data?: Json | null
          application_number?: string | null
          assigned_fee?: number | null
          caste_category?: string | null
          city?: string | null
          contacted_at?: string | null
          contacted_by?: string | null
          contacted_status?: string | null
          country?: string | null
          coupon_code?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deletion_reason?: string | null
          detected_location?: Json | null
          discount_amount?: number | null
          district?: string | null
          email_sent_at?: string | null
          father_name?: string | null
          final_fee?: number | null
          form_completed_at?: string | null
          form_step_completed?: number | null
          full_payment_discount?: number | null
          hybrid_learning_accepted?: boolean | null
          id?: string
          installment_1_amount?: number | null
          installment_2_amount?: number | null
          installment_2_due_days?: number | null
          installment_reminder_date?: string | null
          interest_course?: Database["public"]["Enums"]["course_type"] | null
          last_reminder_sent_at?: string | null
          latitude?: number | null
          learning_mode?: Database["public"]["Enums"]["learning_mode"] | null
          location_source?: string | null
          longitude?: number | null
          parent_phone?: string | null
          payment_deadline?: string | null
          payment_recommendation?: string | null
          payment_scheme?: string | null
          phone_verified?: boolean | null
          phone_verified_at?: string | null
          pincode?: string | null
          qualification?: string | null
          referral_code?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scholarship_eligible?: boolean | null
          scholarship_opened_at?: string | null
          scholarship_opened_by?: string | null
          school_college?: string | null
          school_type?: Database["public"]["Enums"]["school_type"] | null
          selected_center_id?: string | null
          selected_course_id?: string | null
          source?: Database["public"]["Enums"]["application_source"] | null
          state?: string | null
          status?: Database["public"]["Enums"]["application_status"] | null
          target_exam_year?: number | null
          total_cashback_eligible?: number | null
          total_cashback_processed?: number | null
          updated_at?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          whatsapp_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_profiles_admin_coupon_id_fkey"
            columns: ["admin_coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_profiles_contacted_by_fkey"
            columns: ["contacted_by"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_profiles_contacted_by_fkey"
            columns: ["contacted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_profiles_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_profiles_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_profiles_scholarship_opened_by_fkey"
            columns: ["scholarship_opened_by"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_profiles_scholarship_opened_by_fkey"
            columns: ["scholarship_opened_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_profiles_selected_center_id_fkey"
            columns: ["selected_center_id"]
            isOneToOne: false
            referencedRelation: "offline_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_profiles_selected_course_id_fkey"
            columns: ["selected_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_content: {
        Row: {
          created_at: string
          created_by: string | null
          description: Json | null
          display_priority: number
          expires_at: string | null
          id: string
          image_url: string | null
          is_pinned: boolean
          metadata: Json | null
          published_at: string | null
          starts_at: string | null
          status: Database["public"]["Enums"]["marketing_content_status"]
          title: Json
          type: Database["public"]["Enums"]["marketing_content_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: Json | null
          display_priority?: number
          expires_at?: string | null
          id?: string
          image_url?: string | null
          is_pinned?: boolean
          metadata?: Json | null
          published_at?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["marketing_content_status"]
          title?: Json
          type: Database["public"]["Enums"]["marketing_content_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: Json | null
          display_priority?: number
          expires_at?: string | null
          id?: string
          image_url?: string | null
          is_pinned?: boolean
          metadata?: Json | null
          published_at?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["marketing_content_status"]
          title?: Json
          type?: Database["public"]["Enums"]["marketing_content_type"]
          updated_at?: string
        }
        Relationships: []
      }
      nata_announcements: {
        Row: {
          bg_color: string
          created_at: string
          end_date: string | null
          id: string
          is_active: boolean
          link: string | null
          priority: number
          severity: string
          start_date: string | null
          text: Json
          text_color: string
          updated_at: string
          year: number
        }
        Insert: {
          bg_color?: string
          created_at?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          link?: string | null
          priority?: number
          severity?: string
          start_date?: string | null
          text?: Json
          text_color?: string
          updated_at?: string
          year?: number
        }
        Update: {
          bg_color?: string
          created_at?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          link?: string | null
          priority?: number
          severity?: string
          start_date?: string | null
          text?: Json
          text_color?: string
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      nata_assistance_requests: {
        Row: {
          assigned_to: string | null
          category: string
          created_at: string
          district: string | null
          id: string
          notes: string | null
          phone: string
          school_name: string | null
          status: string
          student_name: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          category?: string
          created_at?: string
          district?: string | null
          id?: string
          notes?: string | null
          phone: string
          school_name?: string | null
          status?: string
          student_name: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          category?: string
          created_at?: string
          district?: string | null
          id?: string
          notes?: string | null
          phone?: string
          school_name?: string | null
          status?: string
          student_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      nata_banners: {
        Row: {
          created_at: string
          cta_link: string | null
          cta_text: Json | null
          display_order: number
          end_date: string | null
          heading: Json
          id: string
          image_url: string | null
          is_active: boolean
          mobile_image_url: string | null
          spot: string
          start_date: string | null
          subtext: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          cta_link?: string | null
          cta_text?: Json | null
          display_order?: number
          end_date?: string | null
          heading?: Json
          id?: string
          image_url?: string | null
          is_active?: boolean
          mobile_image_url?: string | null
          spot?: string
          start_date?: string | null
          subtext?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          cta_link?: string | null
          cta_text?: Json | null
          display_order?: number
          end_date?: string | null
          heading?: Json
          id?: string
          image_url?: string | null
          is_active?: boolean
          mobile_image_url?: string | null
          spot?: string
          start_date?: string | null
          subtext?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      nata_brochures: {
        Row: {
          changelog: string | null
          created_at: string
          display_order: number
          download_count: number
          file_size_bytes: number | null
          file_url: string
          id: string
          is_active: boolean
          is_current: boolean
          release_date: string
          updated_at: string
          uploaded_by: string | null
          version: string
          year: number
        }
        Insert: {
          changelog?: string | null
          created_at?: string
          display_order?: number
          download_count?: number
          file_size_bytes?: number | null
          file_url: string
          id?: string
          is_active?: boolean
          is_current?: boolean
          release_date: string
          updated_at?: string
          uploaded_by?: string | null
          version: string
          year?: number
        }
        Update: {
          changelog?: string | null
          created_at?: string
          display_order?: number
          download_count?: number
          file_size_bytes?: number | null
          file_url?: string
          id?: string
          is_active?: boolean
          is_current?: boolean
          release_date?: string
          updated_at?: string
          uploaded_by?: string | null
          version?: string
          year?: number
        }
        Relationships: []
      }
      nata_exam_centers: {
        Row: {
          brochure_ref: string | null
          center_1_address: string | null
          center_1_evidence: string | null
          center_2_address: string | null
          center_2_evidence: string | null
          city_brochure: string
          city_population_tier: string | null
          confidence: string | null
          created_at: string | null
          created_by: string | null
          has_barch_college: boolean | null
          id: string
          is_new_2025: boolean | null
          latitude: number
          longitude: number
          notes: string | null
          probable_center_1: string | null
          probable_center_2: string | null
          state: string
          tcs_ion_confirmed: boolean | null
          updated_at: string | null
          updated_by: string | null
          was_in_2024: boolean | null
          year: number
        }
        Insert: {
          brochure_ref?: string | null
          center_1_address?: string | null
          center_1_evidence?: string | null
          center_2_address?: string | null
          center_2_evidence?: string | null
          city_brochure: string
          city_population_tier?: string | null
          confidence?: string | null
          created_at?: string | null
          created_by?: string | null
          has_barch_college?: boolean | null
          id?: string
          is_new_2025?: boolean | null
          latitude: number
          longitude: number
          notes?: string | null
          probable_center_1?: string | null
          probable_center_2?: string | null
          state: string
          tcs_ion_confirmed?: boolean | null
          updated_at?: string | null
          updated_by?: string | null
          was_in_2024?: boolean | null
          year?: number
        }
        Update: {
          brochure_ref?: string | null
          center_1_address?: string | null
          center_1_evidence?: string | null
          center_2_address?: string | null
          center_2_evidence?: string | null
          city_brochure?: string
          city_population_tier?: string | null
          confidence?: string | null
          created_at?: string | null
          created_by?: string | null
          has_barch_college?: boolean | null
          id?: string
          is_new_2025?: boolean | null
          latitude?: number
          longitude?: number
          notes?: string | null
          probable_center_1?: string | null
          probable_center_2?: string | null
          state?: string
          tcs_ion_confirmed?: boolean | null
          updated_at?: string | null
          updated_by?: string | null
          was_in_2024?: boolean | null
          year?: number
        }
        Relationships: []
      }
      nata_faqs: {
        Row: {
          answer: Json
          category: string
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          page_slug: string | null
          question: Json
          updated_at: string
          year: number
        }
        Insert: {
          answer?: Json
          category?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          page_slug?: string | null
          question?: Json
          updated_at?: string
          year?: number
        }
        Update: {
          answer?: Json
          category?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          page_slug?: string | null
          question?: Json
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      nexus_attendance: {
        Row: {
          attended: boolean | null
          created_at: string | null
          duration_minutes: number | null
          id: string
          joined_at: string | null
          left_at: string | null
          scheduled_class_id: string
          source: string | null
          student_id: string
        }
        Insert: {
          attended?: boolean | null
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          joined_at?: string | null
          left_at?: string | null
          scheduled_class_id: string
          source?: string | null
          student_id: string
        }
        Update: {
          attended?: boolean | null
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          joined_at?: string | null
          left_at?: string | null
          scheduled_class_id?: string
          source?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nexus_attendance_scheduled_class_id_fkey"
            columns: ["scheduled_class_id"]
            isOneToOne: false
            referencedRelation: "nexus_scheduled_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_batches: {
        Row: {
          classroom_id: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          classroom_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          classroom_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nexus_batches_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "nexus_classrooms"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_checklist_items: {
        Row: {
          classroom_id: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          learning_outcome: string | null
          sort_order: number | null
          title: string
          topic_id: string | null
          updated_at: string | null
        }
        Insert: {
          classroom_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          learning_outcome?: string | null
          sort_order?: number | null
          title: string
          topic_id?: string | null
          updated_at?: string | null
        }
        Update: {
          classroom_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          learning_outcome?: string | null
          sort_order?: number | null
          title?: string
          topic_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nexus_checklist_items_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "nexus_classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_checklist_items_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "nexus_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_checklist_resources: {
        Row: {
          checklist_item_id: string
          created_at: string | null
          id: string
          resource_type: string | null
          sort_order: number | null
          title: string
          url: string
        }
        Insert: {
          checklist_item_id: string
          created_at?: string | null
          id?: string
          resource_type?: string | null
          sort_order?: number | null
          title: string
          url: string
        }
        Update: {
          checklist_item_id?: string
          created_at?: string | null
          id?: string
          resource_type?: string | null
          sort_order?: number | null
          title?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "nexus_checklist_resources_checklist_item_id_fkey"
            columns: ["checklist_item_id"]
            isOneToOne: false
            referencedRelation: "nexus_checklist_items"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_classrooms: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          ms_team_id: string | null
          name: string
          type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          ms_team_id?: string | null
          name: string
          type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          ms_team_id?: string | null
          name?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nexus_classrooms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_classrooms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_drawing_assignment_submissions: {
        Row: {
          assignment_id: string
          id: string
          non_submission_reason: string | null
          status: string | null
          student_id: string
          submission_id: string | null
          submitted_at: string | null
        }
        Insert: {
          assignment_id: string
          id?: string
          non_submission_reason?: string | null
          status?: string | null
          student_id: string
          submission_id?: string | null
          submitted_at?: string | null
        }
        Update: {
          assignment_id?: string
          id?: string
          non_submission_reason?: string | null
          status?: string | null
          student_id?: string
          submission_id?: string | null
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nexus_drawing_assignment_submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "nexus_drawing_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_drawing_assignment_submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_drawing_assignment_submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_drawing_assignment_submissions_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "nexus_drawing_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_drawing_assignments: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          classroom_id: string
          due_date: string | null
          exercise_id: string
          id: string
          scheduled_class_id: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          classroom_id: string
          due_date?: string | null
          exercise_id: string
          id?: string
          scheduled_class_id?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          classroom_id?: string
          due_date?: string | null
          exercise_id?: string
          id?: string
          scheduled_class_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nexus_drawing_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_drawing_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_drawing_assignments_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "nexus_classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_drawing_assignments_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "nexus_drawing_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_drawing_assignments_scheduled_class_id_fkey"
            columns: ["scheduled_class_id"]
            isOneToOne: false
            referencedRelation: "nexus_scheduled_classes"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_drawing_categories: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          level_id: string
          sort_order: number
          title: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          level_id: string
          sort_order?: number
          title: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          level_id?: string
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "nexus_drawing_categories_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "nexus_drawing_levels"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_drawing_exercises: {
        Row: {
          category_id: string
          created_at: string | null
          demo_video_url: string | null
          description: string | null
          dos_and_donts: string | null
          id: string
          instructions: string | null
          is_active: boolean | null
          reference_images: Json | null
          sort_order: number
          title: string
        }
        Insert: {
          category_id: string
          created_at?: string | null
          demo_video_url?: string | null
          description?: string | null
          dos_and_donts?: string | null
          id?: string
          instructions?: string | null
          is_active?: boolean | null
          reference_images?: Json | null
          sort_order?: number
          title: string
        }
        Update: {
          category_id?: string
          created_at?: string | null
          demo_video_url?: string | null
          description?: string | null
          dos_and_donts?: string | null
          id?: string
          instructions?: string | null
          is_active?: boolean | null
          reference_images?: Json | null
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "nexus_drawing_exercises_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "nexus_drawing_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_drawing_levels: {
        Row: {
          classroom_id: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          sort_order: number
          title: string
        }
        Insert: {
          classroom_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          sort_order?: number
          title: string
        }
        Update: {
          classroom_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "nexus_drawing_levels_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "nexus_classrooms"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_drawing_submissions: {
        Row: {
          attempt_number: number | null
          correction_url: string | null
          created_at: string | null
          evaluated_at: string | null
          evaluated_by: string | null
          exercise_id: string
          grade: string | null
          id: string
          status: string | null
          student_id: string
          submission_url: string
          teacher_notes: string | null
          updated_at: string | null
        }
        Insert: {
          attempt_number?: number | null
          correction_url?: string | null
          created_at?: string | null
          evaluated_at?: string | null
          evaluated_by?: string | null
          exercise_id: string
          grade?: string | null
          id?: string
          status?: string | null
          student_id: string
          submission_url: string
          teacher_notes?: string | null
          updated_at?: string | null
        }
        Update: {
          attempt_number?: number | null
          correction_url?: string | null
          created_at?: string | null
          evaluated_at?: string | null
          evaluated_by?: string | null
          exercise_id?: string
          grade?: string | null
          id?: string
          status?: string | null
          student_id?: string
          submission_url?: string
          teacher_notes?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nexus_drawing_submissions_evaluated_by_fkey"
            columns: ["evaluated_by"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_drawing_submissions_evaluated_by_fkey"
            columns: ["evaluated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_drawing_submissions_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "nexus_drawing_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_drawing_submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_drawing_submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_enrollments: {
        Row: {
          batch_id: string | null
          classroom_id: string
          enrolled_at: string | null
          id: string
          is_active: boolean | null
          role: string
          user_id: string
        }
        Insert: {
          batch_id?: string | null
          classroom_id: string
          enrolled_at?: string | null
          id?: string
          is_active?: boolean | null
          role: string
          user_id: string
        }
        Update: {
          batch_id?: string | null
          classroom_id?: string
          enrolled_at?: string | null
          id?: string
          is_active?: boolean | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nexus_enrollments_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "nexus_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_enrollments_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "nexus_classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_enrollments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_enrollments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_foundation_chapters: {
        Row: {
          chapter_number: number
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_published: boolean
          min_quiz_score_pct: number
          sharepoint_video_url: string | null
          thumbnail_url: string | null
          title: string
          updated_at: string
          video_duration_seconds: number | null
          video_source: string
          youtube_video_id: string | null
        }
        Insert: {
          chapter_number: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_published?: boolean
          min_quiz_score_pct?: number
          sharepoint_video_url?: string | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          video_duration_seconds?: number | null
          video_source?: string
          youtube_video_id?: string | null
        }
        Update: {
          chapter_number?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_published?: boolean
          min_quiz_score_pct?: number
          sharepoint_video_url?: string | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          video_duration_seconds?: number | null
          video_source?: string
          youtube_video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nexus_foundation_chapters_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_foundation_chapters_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_foundation_issue_activity: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          id: string
          issue_id: string
          new_status: string | null
          old_status: string | null
          reason: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          id?: string
          issue_id: string
          new_status?: string | null
          old_status?: string | null
          reason?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          id?: string
          issue_id?: string
          new_status?: string | null
          old_status?: string | null
          reason?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nexus_foundation_issue_activity_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_foundation_issue_activity_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_foundation_issue_activity_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "nexus_foundation_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_foundation_issue_activity_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_foundation_issue_activity_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_foundation_issues: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          assigned_to: string | null
          chapter_id: string
          created_at: string
          description: string
          id: string
          priority: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          section_id: string | null
          status: string
          student_id: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          chapter_id: string
          created_at?: string
          description?: string
          id?: string
          priority?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          section_id?: string | null
          status?: string
          student_id: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          chapter_id?: string
          created_at?: string
          description?: string
          id?: string
          priority?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          section_id?: string | null
          status?: string
          student_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nexus_foundation_issues_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_foundation_issues_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_foundation_issues_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_foundation_issues_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_foundation_issues_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "nexus_foundation_chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_foundation_issues_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_foundation_issues_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_foundation_issues_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "nexus_foundation_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_foundation_issues_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_foundation_issues_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_foundation_quiz_attempts: {
        Row: {
          answers: Json
          attempt_number: number
          created_at: string
          id: string
          passed: boolean
          score_pct: number
          section_id: string
          student_id: string
        }
        Insert: {
          answers?: Json
          attempt_number?: number
          created_at?: string
          id?: string
          passed: boolean
          score_pct: number
          section_id: string
          student_id: string
        }
        Update: {
          answers?: Json
          attempt_number?: number
          created_at?: string
          id?: string
          passed?: boolean
          score_pct?: number
          section_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nexus_foundation_quiz_attempts_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "nexus_foundation_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_foundation_quiz_attempts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_foundation_quiz_attempts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_foundation_quiz_questions: {
        Row: {
          correct_option: string
          created_at: string
          explanation: string | null
          id: string
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          question_text: string
          section_id: string
          sort_order: number
        }
        Insert: {
          correct_option: string
          created_at?: string
          explanation?: string | null
          id?: string
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          question_text: string
          section_id: string
          sort_order?: number
        }
        Update: {
          correct_option?: string
          created_at?: string
          explanation?: string | null
          id?: string
          option_a?: string
          option_b?: string
          option_c?: string
          option_d?: string
          question_text?: string
          section_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "nexus_foundation_quiz_questions_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "nexus_foundation_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_foundation_reactions: {
        Row: {
          chapter_id: string
          created_at: string
          id: string
          reaction: string
          student_id: string
          updated_at: string
        }
        Insert: {
          chapter_id: string
          created_at?: string
          id?: string
          reaction: string
          student_id: string
          updated_at?: string
        }
        Update: {
          chapter_id?: string
          created_at?: string
          id?: string
          reaction?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nexus_foundation_reactions_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "nexus_foundation_chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_foundation_reactions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_foundation_reactions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_foundation_sections: {
        Row: {
          chapter_id: string
          created_at: string
          description: string | null
          end_timestamp_seconds: number
          id: string
          sort_order: number
          start_timestamp_seconds: number
          title: string
        }
        Insert: {
          chapter_id: string
          created_at?: string
          description?: string | null
          end_timestamp_seconds: number
          id?: string
          sort_order: number
          start_timestamp_seconds: number
          title: string
        }
        Update: {
          chapter_id?: string
          created_at?: string
          description?: string | null
          end_timestamp_seconds?: number
          id?: string
          sort_order?: number
          start_timestamp_seconds?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "nexus_foundation_sections_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "nexus_foundation_chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_foundation_student_notes: {
        Row: {
          created_at: string
          id: string
          note_text: string
          section_id: string
          student_id: string
          updated_at: string
          video_timestamp_seconds: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          note_text?: string
          section_id: string
          student_id: string
          updated_at?: string
          video_timestamp_seconds?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          note_text?: string
          section_id?: string
          student_id?: string
          updated_at?: string
          video_timestamp_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "nexus_foundation_student_notes_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "nexus_foundation_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_foundation_student_notes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_foundation_student_notes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_foundation_student_progress: {
        Row: {
          chapter_id: string
          completed_at: string | null
          created_at: string
          id: string
          last_section_id: string | null
          last_video_position_seconds: number
          started_at: string | null
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          chapter_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          last_section_id?: string | null
          last_video_position_seconds?: number
          started_at?: string | null
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          chapter_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          last_section_id?: string | null
          last_video_position_seconds?: number
          started_at?: string | null
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nexus_foundation_student_progress_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "nexus_foundation_chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_foundation_student_progress_last_section_id_fkey"
            columns: ["last_section_id"]
            isOneToOne: false
            referencedRelation: "nexus_foundation_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_foundation_student_progress_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_foundation_student_progress_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_foundation_transcripts: {
        Row: {
          chapter_id: string
          created_at: string
          entries: Json
          id: string
          language: string
          updated_at: string
        }
        Insert: {
          chapter_id: string
          created_at?: string
          entries?: Json
          id?: string
          language?: string
          updated_at?: string
        }
        Update: {
          chapter_id?: string
          created_at?: string
          entries?: Json
          id?: string
          language?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nexus_foundation_transcripts_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "nexus_foundation_chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_parent_invite_codes: {
        Row: {
          classroom_id: string
          created_at: string | null
          created_by: string | null
          expires_at: string
          id: string
          invite_code: string
          is_active: boolean | null
          student_id: string
          used_at: string | null
        }
        Insert: {
          classroom_id: string
          created_at?: string | null
          created_by?: string | null
          expires_at: string
          id?: string
          invite_code: string
          is_active?: boolean | null
          student_id: string
          used_at?: string | null
        }
        Update: {
          classroom_id?: string
          created_at?: string | null
          created_by?: string | null
          expires_at?: string
          id?: string
          invite_code?: string
          is_active?: boolean | null
          student_id?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nexus_parent_invite_codes_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "nexus_classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_parent_invite_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_parent_invite_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_parent_invite_codes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_parent_invite_codes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_parent_links: {
        Row: {
          created_at: string | null
          id: string
          invite_expires_at: string
          invite_token: string
          is_active: boolean | null
          linked_at: string | null
          parent_user_id: string | null
          student_user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          invite_expires_at: string
          invite_token: string
          is_active?: boolean | null
          linked_at?: string | null
          parent_user_id?: string | null
          student_user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          invite_expires_at?: string
          invite_token?: string
          is_active?: boolean | null
          linked_at?: string | null
          parent_user_id?: string | null
          student_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nexus_parent_links_parent_user_id_fkey"
            columns: ["parent_user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_parent_links_parent_user_id_fkey"
            columns: ["parent_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_parent_links_student_user_id_fkey"
            columns: ["student_user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_parent_links_student_user_id_fkey"
            columns: ["student_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_qb_classroom_links: {
        Row: {
          classroom_id: string
          enabled_at: string
          enabled_by: string | null
          id: string
          is_active: boolean
        }
        Insert: {
          classroom_id: string
          enabled_at?: string
          enabled_by?: string | null
          id?: string
          is_active?: boolean
        }
        Update: {
          classroom_id?: string
          enabled_at?: string
          enabled_by?: string | null
          id?: string
          is_active?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "nexus_qb_classroom_links_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: true
            referencedRelation: "nexus_classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_qb_classroom_links_enabled_by_fkey"
            columns: ["enabled_by"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_qb_classroom_links_enabled_by_fkey"
            columns: ["enabled_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_qb_original_papers: {
        Row: {
          created_at: string
          duration_minutes: number | null
          exam_type: string
          id: string
          pdf_url: string
          session: string | null
          total_marks: number | null
          total_questions: number | null
          uploaded_by: string | null
          year: number
        }
        Insert: {
          created_at?: string
          duration_minutes?: number | null
          exam_type: string
          id?: string
          pdf_url: string
          session?: string | null
          total_marks?: number | null
          total_questions?: number | null
          uploaded_by?: string | null
          year: number
        }
        Update: {
          created_at?: string
          duration_minutes?: number | null
          exam_type?: string
          id?: string
          pdf_url?: string
          session?: string | null
          total_marks?: number | null
          total_questions?: number | null
          uploaded_by?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "nexus_qb_original_papers_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_qb_original_papers_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_qb_question_sources: {
        Row: {
          created_at: string
          exam_type: string
          id: string
          question_id: string
          question_number: number | null
          session: string | null
          year: number
        }
        Insert: {
          created_at?: string
          exam_type: string
          id?: string
          question_id: string
          question_number?: number | null
          session?: string | null
          year: number
        }
        Update: {
          created_at?: string
          exam_type?: string
          id?: string
          question_id?: string
          question_number?: number | null
          session?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "nexus_qb_question_sources_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "nexus_qb_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_qb_questions: {
        Row: {
          answer_tolerance: number | null
          categories: string[]
          correct_answer: string
          created_at: string
          created_by: string | null
          difficulty: string
          display_order: number | null
          exam_relevance: string
          explanation_brief: string
          explanation_detailed: string | null
          id: string
          is_active: boolean
          options: Json | null
          original_paper_id: string | null
          original_paper_page: number | null
          question_format: string
          question_image_url: string | null
          question_text: string | null
          repeat_group_id: string | null
          solution_image_url: string | null
          solution_video_url: string | null
          sub_topic: string | null
          topic_id: string | null
          updated_at: string
        }
        Insert: {
          answer_tolerance?: number | null
          categories?: string[]
          correct_answer: string
          created_at?: string
          created_by?: string | null
          difficulty?: string
          display_order?: number | null
          exam_relevance?: string
          explanation_brief: string
          explanation_detailed?: string | null
          id?: string
          is_active?: boolean
          options?: Json | null
          original_paper_id?: string | null
          original_paper_page?: number | null
          question_format?: string
          question_image_url?: string | null
          question_text?: string | null
          repeat_group_id?: string | null
          solution_image_url?: string | null
          solution_video_url?: string | null
          sub_topic?: string | null
          topic_id?: string | null
          updated_at?: string
        }
        Update: {
          answer_tolerance?: number | null
          categories?: string[]
          correct_answer?: string
          created_at?: string
          created_by?: string | null
          difficulty?: string
          display_order?: number | null
          exam_relevance?: string
          explanation_brief?: string
          explanation_detailed?: string | null
          id?: string
          is_active?: boolean
          options?: Json | null
          original_paper_id?: string | null
          original_paper_page?: number | null
          question_format?: string
          question_image_url?: string | null
          question_text?: string | null
          repeat_group_id?: string | null
          solution_image_url?: string | null
          solution_video_url?: string | null
          sub_topic?: string | null
          topic_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nexus_qb_questions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_qb_questions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_qb_questions_original_paper_id_fkey"
            columns: ["original_paper_id"]
            isOneToOne: false
            referencedRelation: "nexus_qb_original_papers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_qb_questions_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "nexus_qb_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_qb_saved_presets: {
        Row: {
          created_at: string
          filters: Json
          id: string
          is_pinned: boolean
          name: string
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          filters: Json
          id?: string
          is_pinned?: boolean
          name: string
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          is_pinned?: boolean
          name?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nexus_qb_saved_presets_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_qb_saved_presets_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_qb_student_attempts: {
        Row: {
          created_at: string
          id: string
          is_correct: boolean
          mode: string
          question_id: string
          selected_answer: string
          student_id: string
          time_spent_seconds: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_correct: boolean
          mode?: string
          question_id: string
          selected_answer: string
          student_id: string
          time_spent_seconds?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          is_correct?: boolean
          mode?: string
          question_id?: string
          selected_answer?: string
          student_id?: string
          time_spent_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "nexus_qb_student_attempts_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "nexus_qb_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_qb_student_attempts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_qb_student_attempts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_qb_study_marks: {
        Row: {
          created_at: string
          id: string
          question_id: string
          student_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          question_id: string
          student_id: string
        }
        Update: {
          created_at?: string
          id?: string
          question_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nexus_qb_study_marks_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "nexus_qb_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_qb_study_marks_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_qb_study_marks_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_qb_topics: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          parent_id: string | null
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "nexus_qb_topics_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "nexus_qb_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_question_submissions: {
        Row: {
          classroom_id: string
          correct_answer: string | null
          created_at: string | null
          difficulty: string | null
          exam_date: string | null
          exam_name: string
          id: string
          merged_into: string | null
          options: Json | null
          question_image_url: string | null
          question_text: string
          status: string | null
          student_id: string
          topic_id: string | null
        }
        Insert: {
          classroom_id: string
          correct_answer?: string | null
          created_at?: string | null
          difficulty?: string | null
          exam_date?: string | null
          exam_name: string
          id?: string
          merged_into?: string | null
          options?: Json | null
          question_image_url?: string | null
          question_text: string
          status?: string | null
          student_id: string
          topic_id?: string | null
        }
        Update: {
          classroom_id?: string
          correct_answer?: string | null
          created_at?: string | null
          difficulty?: string | null
          exam_date?: string | null
          exam_name?: string
          id?: string
          merged_into?: string | null
          options?: Json | null
          question_image_url?: string | null
          question_text?: string
          status?: string | null
          student_id?: string
          topic_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nexus_question_submissions_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "nexus_classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_question_submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_question_submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_question_submissions_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "nexus_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_resources: {
        Row: {
          classroom_id: string
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          resource_type: string
          sort_order: number | null
          thumbnail_url: string | null
          title: string
          topic_id: string | null
          url: string
        }
        Insert: {
          classroom_id: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          resource_type: string
          sort_order?: number | null
          thumbnail_url?: string | null
          title: string
          topic_id?: string | null
          url: string
        }
        Update: {
          classroom_id?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          resource_type?: string
          sort_order?: number | null
          thumbnail_url?: string | null
          title?: string
          topic_id?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "nexus_resources_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "nexus_classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_resources_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_resources_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_resources_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "nexus_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_scheduled_classes: {
        Row: {
          classroom_id: string
          created_at: string | null
          description: string | null
          end_time: string
          id: string
          notes: string | null
          recording_duration_minutes: number | null
          recording_url: string | null
          rescheduled_to: string | null
          scheduled_date: string
          start_time: string
          status: string | null
          teacher_id: string | null
          teams_meeting_id: string | null
          teams_meeting_url: string | null
          title: string
          topic_id: string | null
          updated_at: string | null
        }
        Insert: {
          classroom_id: string
          created_at?: string | null
          description?: string | null
          end_time: string
          id?: string
          notes?: string | null
          recording_duration_minutes?: number | null
          recording_url?: string | null
          rescheduled_to?: string | null
          scheduled_date: string
          start_time: string
          status?: string | null
          teacher_id?: string | null
          teams_meeting_id?: string | null
          teams_meeting_url?: string | null
          title: string
          topic_id?: string | null
          updated_at?: string | null
        }
        Update: {
          classroom_id?: string
          created_at?: string | null
          description?: string | null
          end_time?: string
          id?: string
          notes?: string | null
          recording_duration_minutes?: number | null
          recording_url?: string | null
          rescheduled_to?: string | null
          scheduled_date?: string
          start_time?: string
          status?: string | null
          teacher_id?: string | null
          teams_meeting_id?: string | null
          teams_meeting_url?: string | null
          title?: string
          topic_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nexus_scheduled_classes_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "nexus_classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_scheduled_classes_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_scheduled_classes_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_scheduled_classes_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "nexus_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "nexus_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_student_checklist_progress: {
        Row: {
          checklist_item_id: string
          completed_at: string | null
          id: string
          is_completed: boolean | null
          student_id: string
        }
        Insert: {
          checklist_item_id: string
          completed_at?: string | null
          id?: string
          is_completed?: boolean | null
          student_id: string
        }
        Update: {
          checklist_item_id?: string
          completed_at?: string | null
          id?: string
          is_completed?: boolean | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nexus_student_checklist_progress_checklist_item_id_fkey"
            columns: ["checklist_item_id"]
            isOneToOne: false
            referencedRelation: "nexus_checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_student_checklist_progress_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_student_checklist_progress_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_student_documents: {
        Row: {
          category: string
          classroom_id: string
          file_type: string | null
          file_url: string
          id: string
          notes: string | null
          status: string | null
          student_id: string
          title: string
          uploaded_at: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          category: string
          classroom_id: string
          file_type?: string | null
          file_url: string
          id?: string
          notes?: string | null
          status?: string | null
          student_id: string
          title: string
          uploaded_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          category?: string
          classroom_id?: string
          file_type?: string | null
          file_url?: string
          id?: string
          notes?: string | null
          status?: string | null
          student_id?: string
          title?: string
          uploaded_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nexus_student_documents_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "nexus_classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_student_documents_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_student_documents_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_student_documents_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_student_documents_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_student_topic_progress: {
        Row: {
          classroom_id: string
          completed_at: string | null
          id: string
          status: string | null
          student_id: string
          topic_id: string
        }
        Insert: {
          classroom_id: string
          completed_at?: string | null
          id?: string
          status?: string | null
          student_id: string
          topic_id: string
        }
        Update: {
          classroom_id?: string
          completed_at?: string | null
          id?: string
          status?: string | null
          student_id?: string
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nexus_student_topic_progress_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "nexus_classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_student_topic_progress_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_student_topic_progress_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_student_topic_progress_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "nexus_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_test_attempts: {
        Row: {
          answers: Json | null
          created_at: string | null
          id: string
          percentage: number | null
          score: number | null
          started_at: string | null
          status: string | null
          student_id: string
          submitted_at: string | null
          test_id: string
          time_spent_seconds: number | null
          total_marks: number | null
        }
        Insert: {
          answers?: Json | null
          created_at?: string | null
          id?: string
          percentage?: number | null
          score?: number | null
          started_at?: string | null
          status?: string | null
          student_id: string
          submitted_at?: string | null
          test_id: string
          time_spent_seconds?: number | null
          total_marks?: number | null
        }
        Update: {
          answers?: Json | null
          created_at?: string | null
          id?: string
          percentage?: number | null
          score?: number | null
          started_at?: string | null
          status?: string | null
          student_id?: string
          submitted_at?: string | null
          test_id?: string
          time_spent_seconds?: number | null
          total_marks?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "nexus_test_attempts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_test_attempts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_test_attempts_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "nexus_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_test_questions: {
        Row: {
          id: string
          marks: number | null
          negative_marks: number | null
          question_id: string
          sort_order: number | null
          test_id: string
        }
        Insert: {
          id?: string
          marks?: number | null
          negative_marks?: number | null
          question_id: string
          sort_order?: number | null
          test_id: string
        }
        Update: {
          id?: string
          marks?: number | null
          negative_marks?: number | null
          question_id?: string
          sort_order?: number | null
          test_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nexus_test_questions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "nexus_verified_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_test_questions_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "nexus_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_tests: {
        Row: {
          available_from: string | null
          available_until: string | null
          classroom_id: string
          created_at: string | null
          created_by: string | null
          description: string | null
          duration_minutes: number | null
          id: string
          is_active: boolean | null
          is_published: boolean | null
          passing_marks: number | null
          per_question_seconds: number | null
          show_answers_after: boolean | null
          shuffle_questions: boolean | null
          test_type: string
          title: string
          total_marks: number | null
          updated_at: string | null
        }
        Insert: {
          available_from?: string | null
          available_until?: string | null
          classroom_id: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_active?: boolean | null
          is_published?: boolean | null
          passing_marks?: number | null
          per_question_seconds?: number | null
          show_answers_after?: boolean | null
          shuffle_questions?: boolean | null
          test_type?: string
          title: string
          total_marks?: number | null
          updated_at?: string | null
        }
        Update: {
          available_from?: string | null
          available_until?: string | null
          classroom_id?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_active?: boolean | null
          is_published?: boolean | null
          passing_marks?: number | null
          per_question_seconds?: number | null
          show_answers_after?: boolean | null
          shuffle_questions?: boolean | null
          test_type?: string
          title?: string
          total_marks?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nexus_tests_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "nexus_classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_tests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_tests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_topics: {
        Row: {
          category: string | null
          classroom_id: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          sort_order: number | null
          title: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          classroom_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          sort_order?: number | null
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          classroom_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          sort_order?: number | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nexus_topics_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "nexus_classrooms"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_verified_questions: {
        Row: {
          classroom_id: string
          correct_answer: string | null
          created_at: string | null
          created_by: string | null
          difficulty: string | null
          explanation: string | null
          id: string
          is_active: boolean | null
          options: Json | null
          question_image_url: string | null
          question_text: string
          question_type: string
          source_exam: string | null
          source_year: number | null
          tags: string[] | null
          topic_id: string | null
          updated_at: string | null
        }
        Insert: {
          classroom_id: string
          correct_answer?: string | null
          created_at?: string | null
          created_by?: string | null
          difficulty?: string | null
          explanation?: string | null
          id?: string
          is_active?: boolean | null
          options?: Json | null
          question_image_url?: string | null
          question_text: string
          question_type?: string
          source_exam?: string | null
          source_year?: number | null
          tags?: string[] | null
          topic_id?: string | null
          updated_at?: string | null
        }
        Update: {
          classroom_id?: string
          correct_answer?: string | null
          created_at?: string | null
          created_by?: string | null
          difficulty?: string | null
          explanation?: string | null
          id?: string
          is_active?: boolean | null
          options?: Json | null
          question_image_url?: string | null
          question_text?: string
          question_type?: string
          source_exam?: string | null
          source_year?: number | null
          tags?: string[] | null
          topic_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nexus_verified_questions_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "nexus_classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_verified_questions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_verified_questions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_verified_questions_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "nexus_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_recipients: {
        Row: {
          added_by: string | null
          created_at: string | null
          email: string
          id: string
          is_active: boolean | null
          name: string
          notification_preferences: Json | null
          role:
            | Database["public"]["Enums"]["notification_recipient_role"]
            | null
          updated_at: string | null
        }
        Insert: {
          added_by?: string | null
          created_at?: string | null
          email: string
          id?: string
          is_active?: boolean | null
          name: string
          notification_preferences?: Json | null
          role?:
            | Database["public"]["Enums"]["notification_recipient_role"]
            | null
          updated_at?: string | null
        }
        Update: {
          added_by?: string | null
          created_at?: string | null
          email?: string
          id?: string
          is_active?: boolean | null
          name?: string
          notification_preferences?: Json | null
          role?:
            | Database["public"]["Enums"]["notification_recipient_role"]
            | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_recipients_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_recipients_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      offline_centers: {
        Row: {
          address: string
          capacity: number | null
          center_type: Database["public"]["Enums"]["center_type"] | null
          city: string
          contact_email: string | null
          contact_phone: string | null
          country: string | null
          created_at: string | null
          current_students: number | null
          description: string | null
          display_order: number | null
          facilities: string[] | null
          google_business_url: string | null
          google_maps_url: string | null
          google_place_id: string | null
          google_reviews_url: string | null
          id: string
          is_active: boolean | null
          latitude: number | null
          longitude: number | null
          name: string
          nearby_cities: Json | null
          operating_hours: Json | null
          photos: Json | null
          pincode: string | null
          preferred_visit_times: string[] | null
          rating: number | null
          review_count: number | null
          seo_slug: string | null
          slug: string
          state: string
          updated_at: string | null
        }
        Insert: {
          address: string
          capacity?: number | null
          center_type?: Database["public"]["Enums"]["center_type"] | null
          city: string
          contact_email?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string | null
          current_students?: number | null
          description?: string | null
          display_order?: number | null
          facilities?: string[] | null
          google_business_url?: string | null
          google_maps_url?: string | null
          google_place_id?: string | null
          google_reviews_url?: string | null
          id?: string
          is_active?: boolean | null
          latitude?: number | null
          longitude?: number | null
          name: string
          nearby_cities?: Json | null
          operating_hours?: Json | null
          photos?: Json | null
          pincode?: string | null
          preferred_visit_times?: string[] | null
          rating?: number | null
          review_count?: number | null
          seo_slug?: string | null
          slug: string
          state: string
          updated_at?: string | null
        }
        Update: {
          address?: string
          capacity?: number | null
          center_type?: Database["public"]["Enums"]["center_type"] | null
          city?: string
          contact_email?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string | null
          current_students?: number | null
          description?: string | null
          display_order?: number | null
          facilities?: string[] | null
          google_business_url?: string | null
          google_maps_url?: string | null
          google_place_id?: string | null
          google_reviews_url?: string | null
          id?: string
          is_active?: boolean | null
          latitude?: number | null
          longitude?: number | null
          name?: string
          nearby_cities?: Json | null
          operating_hours?: Json | null
          photos?: Json | null
          pincode?: string | null
          preferred_visit_times?: string[] | null
          rating?: number | null
          review_count?: number | null
          seo_slug?: string | null
          slug?: string
          state?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      onboarding_questions: {
        Row: {
          created_at: string | null
          display_order: number
          id: string
          is_active: boolean | null
          is_required: boolean | null
          maps_to_field: string | null
          options: Json
          question_key: string
          question_text: string
          question_text_ta: string | null
          question_type: Database["public"]["Enums"]["onboarding_question_type"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_order?: number
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          maps_to_field?: string | null
          options?: Json
          question_key: string
          question_text: string
          question_text_ta?: string | null
          question_type?: Database["public"]["Enums"]["onboarding_question_type"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_order?: number
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          maps_to_field?: string | null
          options?: Json
          question_key?: string
          question_text?: string
          question_text_ta?: string | null
          question_type?: Database["public"]["Enums"]["onboarding_question_type"]
          updated_at?: string | null
        }
        Relationships: []
      }
      onboarding_responses: {
        Row: {
          id: string
          question_id: string
          responded_at: string | null
          response: Json
          user_id: string
        }
        Insert: {
          id?: string
          question_id: string
          responded_at?: string | null
          response: Json
          user_id: string
        }
        Update: {
          id?: string
          question_id?: string
          responded_at?: string | null
          response?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_responses_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "onboarding_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_responses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_responses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_sessions: {
        Row: {
          admin_notified: boolean | null
          completed_at: string | null
          created_at: string | null
          id: string
          questions_answered: number | null
          skipped_at: string | null
          source_app: string | null
          started_at: string | null
          status:
            | Database["public"]["Enums"]["onboarding_session_status"]
            | null
          telegram_notified: boolean | null
          total_questions: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          admin_notified?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          id?: string
          questions_answered?: number | null
          skipped_at?: string | null
          source_app?: string | null
          started_at?: string | null
          status?:
            | Database["public"]["Enums"]["onboarding_session_status"]
            | null
          telegram_notified?: boolean | null
          total_questions?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          admin_notified?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          id?: string
          questions_answered?: number | null
          skipped_at?: string | null
          source_app?: string | null
          started_at?: string | null
          status?:
            | Database["public"]["Enums"]["onboarding_session_status"]
            | null
          telegram_notified?: boolean | null
          total_questions?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_step_definitions: {
        Row: {
          action_config: Json | null
          action_type: string
          applies_to: string[]
          created_at: string
          description: string | null
          display_order: number
          icon_name: string | null
          id: string
          is_active: boolean
          is_required: boolean
          step_key: string
          title: string
          updated_at: string
        }
        Insert: {
          action_config?: Json | null
          action_type?: string
          applies_to?: string[]
          created_at?: string
          description?: string | null
          display_order?: number
          icon_name?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          step_key: string
          title: string
          updated_at?: string
        }
        Update: {
          action_config?: Json | null
          action_type?: string
          applies_to?: string[]
          created_at?: string
          description?: string | null
          display_order?: number
          icon_name?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          step_key?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_installments: {
        Row: {
          admin_notes: string | null
          amount: number
          created_at: string | null
          due_date: string
          id: string
          installment_number: number
          late_fee: number | null
          late_fee_waived: boolean | null
          lead_profile_id: string
          paid_amount: number | null
          paid_at: string | null
          payment_id: string | null
          reminder_date: string | null
          reminder_sent: boolean | null
          reminder_sent_at: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          admin_notes?: string | null
          amount: number
          created_at?: string | null
          due_date: string
          id?: string
          installment_number: number
          late_fee?: number | null
          late_fee_waived?: boolean | null
          lead_profile_id: string
          paid_amount?: number | null
          paid_at?: string | null
          payment_id?: string | null
          reminder_date?: string | null
          reminder_sent?: boolean | null
          reminder_sent_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          admin_notes?: string | null
          amount?: number
          created_at?: string | null
          due_date?: string
          id?: string
          installment_number?: number
          late_fee?: number | null
          late_fee_waived?: boolean | null
          lead_profile_id?: string
          paid_amount?: number | null
          paid_at?: string | null
          payment_id?: string | null
          reminder_date?: string | null
          reminder_sent?: boolean | null
          reminder_sent_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_installments_lead_profile_id_fkey"
            columns: ["lead_profile_id"]
            isOneToOne: false
            referencedRelation: "lead_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_installments_lead_profile_id_fkey"
            columns: ["lead_profile_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["lead_profile_id"]
          },
          {
            foreignKeyName: "payment_installments_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string | null
          currency: string | null
          description: string | null
          direct_payment_payer_name: string | null
          direct_payment_screenshot_url: string | null
          direct_payment_utr: string | null
          failure_code: string | null
          failure_reason: string | null
          id: string
          installment_number: number | null
          lead_profile_id: string | null
          metadata: Json | null
          paid_at: string | null
          payment_method: string | null
          payment_scheme: string | null
          razorpay_bank: string | null
          razorpay_card_last4: string | null
          razorpay_card_network: string | null
          razorpay_fee: number | null
          razorpay_method: string | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          razorpay_signature: string | null
          razorpay_tax: number | null
          razorpay_vpa: string | null
          receipt_number: string | null
          receipt_url: string | null
          screenshot_url: string | null
          screenshot_verified: boolean | null
          status: Database["public"]["Enums"]["payment_status"] | null
          student_profile_id: string | null
          updated_at: string | null
          user_id: string | null
          verification_notes: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          currency?: string | null
          description?: string | null
          direct_payment_payer_name?: string | null
          direct_payment_screenshot_url?: string | null
          direct_payment_utr?: string | null
          failure_code?: string | null
          failure_reason?: string | null
          id?: string
          installment_number?: number | null
          lead_profile_id?: string | null
          metadata?: Json | null
          paid_at?: string | null
          payment_method?: string | null
          payment_scheme?: string | null
          razorpay_bank?: string | null
          razorpay_card_last4?: string | null
          razorpay_card_network?: string | null
          razorpay_fee?: number | null
          razorpay_method?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          razorpay_tax?: number | null
          razorpay_vpa?: string | null
          receipt_number?: string | null
          receipt_url?: string | null
          screenshot_url?: string | null
          screenshot_verified?: boolean | null
          status?: Database["public"]["Enums"]["payment_status"] | null
          student_profile_id?: string | null
          updated_at?: string | null
          user_id?: string | null
          verification_notes?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          currency?: string | null
          description?: string | null
          direct_payment_payer_name?: string | null
          direct_payment_screenshot_url?: string | null
          direct_payment_utr?: string | null
          failure_code?: string | null
          failure_reason?: string | null
          id?: string
          installment_number?: number | null
          lead_profile_id?: string | null
          metadata?: Json | null
          paid_at?: string | null
          payment_method?: string | null
          payment_scheme?: string | null
          razorpay_bank?: string | null
          razorpay_card_last4?: string | null
          razorpay_card_network?: string | null
          razorpay_fee?: number | null
          razorpay_method?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          razorpay_tax?: number | null
          razorpay_vpa?: string | null
          receipt_number?: string | null
          receipt_url?: string | null
          screenshot_url?: string | null
          screenshot_verified?: boolean | null
          status?: Database["public"]["Enums"]["payment_status"] | null
          student_profile_id?: string | null
          updated_at?: string | null
          user_id?: string | null
          verification_notes?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_lead_profile_id_fkey"
            columns: ["lead_profile_id"]
            isOneToOne: false
            referencedRelation: "lead_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_lead_profile_id_fkey"
            columns: ["lead_profile_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["lead_profile_id"]
          },
          {
            foreignKeyName: "payments_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["student_profile_id"]
          },
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      pin_code_cache: {
        Row: {
          city: string | null
          country: string
          created_at: string | null
          district: string | null
          expires_at: string | null
          hit_count: number | null
          last_accessed_at: string | null
          locations: Json | null
          pincode: string
          raw_data: Json | null
          region: string | null
          state: string | null
        }
        Insert: {
          city?: string | null
          country?: string
          created_at?: string | null
          district?: string | null
          expires_at?: string | null
          hit_count?: number | null
          last_accessed_at?: string | null
          locations?: Json | null
          pincode: string
          raw_data?: Json | null
          region?: string | null
          state?: string | null
        }
        Update: {
          city?: string | null
          country?: string
          created_at?: string | null
          district?: string | null
          expires_at?: string | null
          hit_count?: number | null
          last_accessed_at?: string | null
          locations?: Json | null
          pincode?: string
          raw_data?: Json | null
          region?: string | null
          state?: string | null
        }
        Relationships: []
      }
      post_enrollment_details: {
        Row: {
          aadhar_document_url: string | null
          aadhar_number: string | null
          aadhar_verified: boolean | null
          blood_group: string | null
          caste_category: string | null
          caste_certificate_url: string | null
          created_at: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relation: string | null
          father_name: string | null
          father_occupation: string | null
          father_phone: string | null
          form_completed: boolean | null
          form_completed_at: string | null
          id: string
          medical_conditions: string | null
          mother_name: string | null
          mother_occupation: string | null
          mother_phone: string | null
          nexus_account_created: boolean | null
          nexus_created_at: string | null
          nexus_created_by: string | null
          nexus_email: string | null
          nexus_password_set: boolean | null
          passport_photo_url: string | null
          student_profile_id: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          aadhar_document_url?: string | null
          aadhar_number?: string | null
          aadhar_verified?: boolean | null
          blood_group?: string | null
          caste_category?: string | null
          caste_certificate_url?: string | null
          created_at?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          father_name?: string | null
          father_occupation?: string | null
          father_phone?: string | null
          form_completed?: boolean | null
          form_completed_at?: string | null
          id?: string
          medical_conditions?: string | null
          mother_name?: string | null
          mother_occupation?: string | null
          mother_phone?: string | null
          nexus_account_created?: boolean | null
          nexus_created_at?: string | null
          nexus_created_by?: string | null
          nexus_email?: string | null
          nexus_password_set?: boolean | null
          passport_photo_url?: string | null
          student_profile_id: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          aadhar_document_url?: string | null
          aadhar_number?: string | null
          aadhar_verified?: boolean | null
          blood_group?: string | null
          caste_category?: string | null
          caste_certificate_url?: string | null
          created_at?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          father_name?: string | null
          father_occupation?: string | null
          father_phone?: string | null
          form_completed?: boolean | null
          form_completed_at?: string | null
          id?: string
          medical_conditions?: string | null
          mother_name?: string | null
          mother_occupation?: string | null
          mother_phone?: string | null
          nexus_account_created?: boolean | null
          nexus_created_at?: string | null
          nexus_created_by?: string | null
          nexus_email?: string | null
          nexus_password_set?: boolean | null
          passport_photo_url?: string | null
          student_profile_id?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_enrollment_details_nexus_created_by_fkey"
            columns: ["nexus_created_by"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_enrollment_details_nexus_created_by_fkey"
            columns: ["nexus_created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_enrollment_details_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: true
            referencedRelation: "student_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_enrollment_details_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: true
            referencedRelation: "user_journey_view"
            referencedColumns: ["student_profile_id"]
          },
          {
            foreignKeyName: "post_enrollment_details_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_enrollment_details_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      prediction_logs: {
        Row: {
          counseling_systems: string[]
          created_at: string | null
          data_year: number
          id: string
          input_data: Json
          prediction_type: string
          results_summary: Json | null
          user_id: string | null
        }
        Insert: {
          counseling_systems: string[]
          created_at?: string | null
          data_year: number
          id?: string
          input_data: Json
          prediction_type: string
          results_summary?: Json | null
          user_id?: string | null
        }
        Update: {
          counseling_systems?: string[]
          created_at?: string | null
          data_year?: number
          id?: string
          input_data?: Json
          prediction_type?: string
          results_summary?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prediction_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prediction_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      question_change_requests: {
        Row: {
          created_at: string
          id: string
          proposed_body: string | null
          proposed_category:
            | Database["public"]["Enums"]["nata_question_category"]
            | null
          proposed_image_urls: string[] | null
          proposed_tags: string[] | null
          proposed_title: string | null
          question_id: string
          reason: string | null
          rejection_reason: string | null
          request_type: Database["public"]["Enums"]["question_change_request_type"]
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["question_change_request_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          proposed_body?: string | null
          proposed_category?:
            | Database["public"]["Enums"]["nata_question_category"]
            | null
          proposed_image_urls?: string[] | null
          proposed_tags?: string[] | null
          proposed_title?: string | null
          question_id: string
          reason?: string | null
          rejection_reason?: string | null
          request_type: Database["public"]["Enums"]["question_change_request_type"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["question_change_request_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          proposed_body?: string | null
          proposed_category?:
            | Database["public"]["Enums"]["nata_question_category"]
            | null
          proposed_image_urls?: string[] | null
          proposed_tags?: string[] | null
          proposed_title?: string | null
          question_id?: string
          reason?: string | null
          rejection_reason?: string | null
          request_type?: Database["public"]["Enums"]["question_change_request_type"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["question_change_request_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_change_requests_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "question_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_change_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_change_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      question_comments: {
        Row: {
          body: string
          created_at: string
          id: string
          parent_id: string | null
          question_id: string
          updated_at: string
          user_id: string
          vote_score: number
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          parent_id?: string | null
          question_id: string
          updated_at?: string
          user_id: string
          vote_score?: number
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          parent_id?: string | null
          question_id?: string
          updated_at?: string
          user_id?: string
          vote_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "question_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "question_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_comments_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "question_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      question_improvements: {
        Row: {
          body: string
          created_at: string
          downvote_count: number
          id: string
          image_urls: string[] | null
          is_accepted: boolean
          question_id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["question_post_status"]
          updated_at: string
          upvote_count: number
          user_id: string
          vote_score: number
        }
        Insert: {
          body: string
          created_at?: string
          downvote_count?: number
          id?: string
          image_urls?: string[] | null
          is_accepted?: boolean
          question_id: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["question_post_status"]
          updated_at?: string
          upvote_count?: number
          user_id: string
          vote_score?: number
        }
        Update: {
          body?: string
          created_at?: string
          downvote_count?: number
          id?: string
          image_urls?: string[] | null
          is_accepted?: boolean
          question_id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["question_post_status"]
          updated_at?: string
          upvote_count?: number
          user_id?: string
          vote_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "question_improvements_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "question_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_improvements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_improvements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      question_likes: {
        Row: {
          created_at: string
          id: string
          question_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          question_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          question_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_likes_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "question_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      question_posts: {
        Row: {
          body: string
          category: Database["public"]["Enums"]["nata_question_category"]
          comment_count: number
          confidence_level: number
          created_at: string
          downvote_count: number
          exam_session: string | null
          exam_type: string
          exam_year: number | null
          id: string
          image_urls: string[] | null
          improvement_count: number
          is_admin_post: boolean
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          session_count: number | null
          status: Database["public"]["Enums"]["question_post_status"]
          tags: string[] | null
          title: string
          updated_at: string
          upvote_count: number
          user_id: string
          vote_score: number
        }
        Insert: {
          body: string
          category?: Database["public"]["Enums"]["nata_question_category"]
          comment_count?: number
          confidence_level?: number
          created_at?: string
          downvote_count?: number
          exam_session?: string | null
          exam_type?: string
          exam_year?: number | null
          id?: string
          image_urls?: string[] | null
          improvement_count?: number
          is_admin_post?: boolean
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          session_count?: number | null
          status?: Database["public"]["Enums"]["question_post_status"]
          tags?: string[] | null
          title: string
          updated_at?: string
          upvote_count?: number
          user_id: string
          vote_score?: number
        }
        Update: {
          body?: string
          category?: Database["public"]["Enums"]["nata_question_category"]
          comment_count?: number
          confidence_level?: number
          created_at?: string
          downvote_count?: number
          exam_session?: string | null
          exam_type?: string
          exam_year?: number | null
          id?: string
          image_urls?: string[] | null
          improvement_count?: number
          is_admin_post?: boolean
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          session_count?: number | null
          status?: Database["public"]["Enums"]["question_post_status"]
          tags?: string[] | null
          title?: string
          updated_at?: string
          upvote_count?: number
          user_id?: string
          vote_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "question_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      question_sessions: {
        Row: {
          created_at: string | null
          exam_date: string | null
          exam_year: number
          id: string
          question_id: string
          session_label: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          exam_date?: string | null
          exam_year: number
          id?: string
          question_id: string
          session_label?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          exam_date?: string | null
          exam_year?: number
          id?: string
          question_id?: string
          session_label?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_sessions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "question_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      question_votes: {
        Row: {
          created_at: string
          id: string
          question_id: string
          user_id: string
          vote: Database["public"]["Enums"]["vote_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          question_id: string
          user_id: string
          vote: Database["public"]["Enums"]["vote_type"]
        }
        Update: {
          created_at?: string
          id?: string
          question_id?: string
          user_id?: string
          vote?: Database["public"]["Enums"]["vote_type"]
        }
        Relationships: [
          {
            foreignKeyName: "question_votes_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "question_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rank_list_entries: {
        Row: {
          aggregate_mark: number
          application_number: string | null
          candidate_name: string | null
          community: string
          community_rank: number | null
          counseling_system_id: string
          created_at: string | null
          created_by: string | null
          date_of_birth: string | null
          entrance_exam_mark: number | null
          hsc_aggregate_mark: number | null
          id: string
          rank: number
          serial_number: number | null
          year: number
        }
        Insert: {
          aggregate_mark: number
          application_number?: string | null
          candidate_name?: string | null
          community: string
          community_rank?: number | null
          counseling_system_id: string
          created_at?: string | null
          created_by?: string | null
          date_of_birth?: string | null
          entrance_exam_mark?: number | null
          hsc_aggregate_mark?: number | null
          id?: string
          rank: number
          serial_number?: number | null
          year: number
        }
        Update: {
          aggregate_mark?: number
          application_number?: string | null
          candidate_name?: string | null
          community?: string
          community_rank?: number | null
          counseling_system_id?: string
          created_at?: string | null
          created_by?: string | null
          date_of_birth?: string | null
          entrance_exam_mark?: number | null
          hsc_aggregate_mark?: number | null
          id?: string
          rank?: number
          serial_number?: number | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "rank_list_entries_counseling_system_id_fkey"
            columns: ["counseling_system_id"]
            isOneToOne: false
            referencedRelation: "counseling_systems"
            referencedColumns: ["id"]
          },
        ]
      }
      refund_requests: {
        Row: {
          additional_notes: string | null
          admin_notes: string | null
          created_at: string | null
          id: string
          lead_profile_id: string | null
          payment_amount: number
          payment_id: string
          processing_fee: number
          reason_for_discontinuing: string
          reason_for_joining: string
          refund_amount: number
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["refund_request_status"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          additional_notes?: string | null
          admin_notes?: string | null
          created_at?: string | null
          id?: string
          lead_profile_id?: string | null
          payment_amount: number
          payment_id: string
          processing_fee: number
          reason_for_discontinuing: string
          reason_for_joining: string
          refund_amount: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["refund_request_status"]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          additional_notes?: string | null
          admin_notes?: string | null
          created_at?: string | null
          id?: string
          lead_profile_id?: string | null
          payment_amount?: number
          payment_id?: string
          processing_fee?: number
          reason_for_discontinuing?: string
          reason_for_joining?: string
          refund_amount?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["refund_request_status"]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "refund_requests_lead_profile_id_fkey"
            columns: ["lead_profile_id"]
            isOneToOne: false
            referencedRelation: "lead_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_requests_lead_profile_id_fkey"
            columns: ["lead_profile_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["lead_profile_id"]
          },
          {
            foreignKeyName: "refund_requests_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: true
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      scholarship_applications: {
        Row: {
          aadhar_card_url: string | null
          admin_notes: string | null
          annual_income_range: string | null
          approved_fee: number | null
          created_at: string | null
          eligibility_reason: string | null
          government_school_years: number | null
          id: string
          income_certificate_url: string | null
          is_government_school: boolean | null
          is_low_income: boolean | null
          lead_profile_id: string
          mark_sheet_url: string | null
          rejection_reason: string | null
          revision_notes: string | null
          revision_requested_at: string | null
          revision_requested_by: string | null
          scholarship_percentage: number | null
          scholarship_status:
            | Database["public"]["Enums"]["scholarship_application_status"]
            | null
          school_id_card_url: string | null
          school_name: string | null
          submitted_at: string | null
          updated_at: string | null
          user_id: string | null
          verification_notes: string | null
          verification_status: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          aadhar_card_url?: string | null
          admin_notes?: string | null
          annual_income_range?: string | null
          approved_fee?: number | null
          created_at?: string | null
          eligibility_reason?: string | null
          government_school_years?: number | null
          id?: string
          income_certificate_url?: string | null
          is_government_school?: boolean | null
          is_low_income?: boolean | null
          lead_profile_id: string
          mark_sheet_url?: string | null
          rejection_reason?: string | null
          revision_notes?: string | null
          revision_requested_at?: string | null
          revision_requested_by?: string | null
          scholarship_percentage?: number | null
          scholarship_status?:
            | Database["public"]["Enums"]["scholarship_application_status"]
            | null
          school_id_card_url?: string | null
          school_name?: string | null
          submitted_at?: string | null
          updated_at?: string | null
          user_id?: string | null
          verification_notes?: string | null
          verification_status?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          aadhar_card_url?: string | null
          admin_notes?: string | null
          annual_income_range?: string | null
          approved_fee?: number | null
          created_at?: string | null
          eligibility_reason?: string | null
          government_school_years?: number | null
          id?: string
          income_certificate_url?: string | null
          is_government_school?: boolean | null
          is_low_income?: boolean | null
          lead_profile_id?: string
          mark_sheet_url?: string | null
          rejection_reason?: string | null
          revision_notes?: string | null
          revision_requested_at?: string | null
          revision_requested_by?: string | null
          scholarship_percentage?: number | null
          scholarship_status?:
            | Database["public"]["Enums"]["scholarship_application_status"]
            | null
          school_id_card_url?: string | null
          school_name?: string | null
          submitted_at?: string | null
          updated_at?: string | null
          user_id?: string | null
          verification_notes?: string | null
          verification_status?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scholarship_applications_lead_profile_id_fkey"
            columns: ["lead_profile_id"]
            isOneToOne: false
            referencedRelation: "lead_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scholarship_applications_lead_profile_id_fkey"
            columns: ["lead_profile_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["lead_profile_id"]
          },
          {
            foreignKeyName: "scholarship_applications_revision_requested_by_fkey"
            columns: ["revision_requested_by"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scholarship_applications_revision_requested_by_fkey"
            columns: ["revision_requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scholarship_applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scholarship_applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scholarship_applications_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scholarship_applications_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      score_calculations: {
        Row: {
          academic_year: string | null
          created_at: string
          id: string
          input_data: Json
          label: string | null
          purpose: Database["public"]["Enums"]["calculation_purpose"] | null
          result_data: Json
          tool_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          academic_year?: string | null
          created_at?: string
          id?: string
          input_data: Json
          label?: string | null
          purpose?: Database["public"]["Enums"]["calculation_purpose"] | null
          result_data: Json
          tool_name?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          academic_year?: string | null
          created_at?: string
          id?: string
          input_data?: Json
          label?: string | null
          purpose?: Database["public"]["Enums"]["calculation_purpose"] | null
          result_data?: Json
          tool_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "score_calculations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_calculations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          key: string
          updated_at: string | null
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "site_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      social_proofs: {
        Row: {
          audio_duration: number | null
          audio_url: string | null
          batch: string | null
          caption: string | null
          created_at: string
          description: Json
          display_order: number
          id: string
          image_url: string | null
          is_active: boolean
          is_featured: boolean
          is_homepage: boolean
          language: Database["public"]["Enums"]["social_proof_language"]
          parent_photo: string | null
          proof_type: Database["public"]["Enums"]["social_proof_type"]
          speaker_name: string
          student_name: string | null
          updated_at: string
          youtube_id: string | null
          youtube_url: string | null
        }
        Insert: {
          audio_duration?: number | null
          audio_url?: string | null
          batch?: string | null
          caption?: string | null
          created_at?: string
          description?: Json
          display_order?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          is_homepage?: boolean
          language?: Database["public"]["Enums"]["social_proof_language"]
          parent_photo?: string | null
          proof_type: Database["public"]["Enums"]["social_proof_type"]
          speaker_name: string
          student_name?: string | null
          updated_at?: string
          youtube_id?: string | null
          youtube_url?: string | null
        }
        Update: {
          audio_duration?: number | null
          audio_url?: string | null
          batch?: string | null
          caption?: string | null
          created_at?: string
          description?: Json
          display_order?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          is_homepage?: boolean
          language?: Database["public"]["Enums"]["social_proof_language"]
          parent_photo?: string | null
          proof_type?: Database["public"]["Enums"]["social_proof_type"]
          speaker_name?: string
          student_name?: string | null
          updated_at?: string
          youtube_id?: string | null
          youtube_url?: string | null
        }
        Relationships: []
      }
      source_tracking: {
        Row: {
          created_at: string | null
          friend_referral_name: string | null
          friend_referral_phone: string | null
          id: string
          lead_profile_id: string
          referral_code: string | null
          source_category: string | null
          source_detail: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          created_at?: string | null
          friend_referral_name?: string | null
          friend_referral_phone?: string | null
          id?: string
          lead_profile_id: string
          referral_code?: string | null
          source_category?: string | null
          source_detail?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          created_at?: string | null
          friend_referral_name?: string | null
          friend_referral_phone?: string | null
          id?: string
          lead_profile_id?: string
          referral_code?: string | null
          source_category?: string | null
          source_detail?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "source_tracking_lead_profile_id_fkey"
            columns: ["lead_profile_id"]
            isOneToOne: true
            referencedRelation: "lead_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_tracking_lead_profile_id_fkey"
            columns: ["lead_profile_id"]
            isOneToOne: true
            referencedRelation: "user_journey_view"
            referencedColumns: ["lead_profile_id"]
          },
        ]
      }
      student_onboarding_progress: {
        Row: {
          admin_notes: string | null
          completed_at: string | null
          completed_by_type: string | null
          completed_by_user_id: string | null
          created_at: string
          id: string
          is_completed: boolean
          step_definition_id: string
          student_profile_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          completed_at?: string | null
          completed_by_type?: string | null
          completed_by_user_id?: string | null
          created_at?: string
          id?: string
          is_completed?: boolean
          step_definition_id: string
          student_profile_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          completed_at?: string | null
          completed_by_type?: string | null
          completed_by_user_id?: string | null
          created_at?: string
          id?: string
          is_completed?: boolean
          step_definition_id?: string
          student_profile_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_onboarding_progress_completed_by_user_id_fkey"
            columns: ["completed_by_user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_onboarding_progress_completed_by_user_id_fkey"
            columns: ["completed_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_onboarding_progress_step_definition_id_fkey"
            columns: ["step_definition_id"]
            isOneToOne: false
            referencedRelation: "onboarding_step_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_onboarding_progress_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_onboarding_progress_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["student_profile_id"]
          },
          {
            foreignKeyName: "student_onboarding_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_onboarding_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      student_profiles: {
        Row: {
          assignments_completed: number | null
          batch_id: string | null
          course_id: string | null
          created_at: string | null
          emergency_contact: string | null
          enrollment_date: string | null
          fee_due: number | null
          fee_paid: number | null
          id: string
          last_activity_at: string | null
          lessons_completed: number | null
          ms_teams_email: string | null
          ms_teams_id: string | null
          next_payment_date: string | null
          notes: string | null
          parent_contact: string | null
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          student_id: string | null
          total_fee: number | null
          total_watch_time: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          assignments_completed?: number | null
          batch_id?: string | null
          course_id?: string | null
          created_at?: string | null
          emergency_contact?: string | null
          enrollment_date?: string | null
          fee_due?: number | null
          fee_paid?: number | null
          id?: string
          last_activity_at?: string | null
          lessons_completed?: number | null
          ms_teams_email?: string | null
          ms_teams_id?: string | null
          next_payment_date?: string | null
          notes?: string | null
          parent_contact?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          student_id?: string | null
          total_fee?: number | null
          total_watch_time?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          assignments_completed?: number | null
          batch_id?: string | null
          course_id?: string | null
          created_at?: string | null
          emergency_contact?: string | null
          enrollment_date?: string | null
          fee_due?: number | null
          fee_paid?: number | null
          id?: string
          last_activity_at?: string | null
          lessons_completed?: number | null
          ms_teams_email?: string | null
          ms_teams_id?: string | null
          next_payment_date?: string | null
          notes?: string | null
          parent_contact?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          student_id?: string | null
          total_fee?: number | null
          total_watch_time?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_profiles_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_profiles_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          is_admin: boolean
          ticket_id: string
          user_id: string | null
          user_name: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_admin?: boolean
          ticket_id: string
          user_id?: string | null
          user_name: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_admin?: boolean
          ticket_id?: string
          user_id?: string | null
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_at: string | null
          assigned_to: string | null
          category: Database["public"]["Enums"]["support_ticket_category"]
          created_at: string
          description: string
          enrollment_link_id: string | null
          id: string
          page_url: string | null
          priority: Database["public"]["Enums"]["support_ticket_priority"]
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          screenshot_urls: string[] | null
          source_app: string | null
          status: Database["public"]["Enums"]["support_ticket_status"]
          subject: string
          ticket_number: string
          updated_at: string
          user_email: string | null
          user_id: string | null
          user_name: string
          user_phone: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_to?: string | null
          category?: Database["public"]["Enums"]["support_ticket_category"]
          created_at?: string
          description: string
          enrollment_link_id?: string | null
          id?: string
          page_url?: string | null
          priority?: Database["public"]["Enums"]["support_ticket_priority"]
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          screenshot_urls?: string[] | null
          source_app?: string | null
          status?: Database["public"]["Enums"]["support_ticket_status"]
          subject: string
          ticket_number: string
          updated_at?: string
          user_email?: string | null
          user_id?: string | null
          user_name: string
          user_phone?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_to?: string | null
          category?: Database["public"]["Enums"]["support_ticket_category"]
          created_at?: string
          description?: string
          enrollment_link_id?: string | null
          id?: string
          page_url?: string | null
          priority?: Database["public"]["Enums"]["support_ticket_priority"]
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          screenshot_urls?: string[] | null
          source_app?: string | null
          status?: Database["public"]["Enums"]["support_ticket_status"]
          subject?: string
          ticket_number?: string
          updated_at?: string
          user_email?: string | null
          user_id?: string | null
          user_name?: string
          user_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_enrollment_link_id_fkey"
            columns: ["enrollment_link_id"]
            isOneToOne: false
            referencedRelation: "direct_enrollment_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      testimonials: {
        Row: {
          city: string
          college_admitted: string | null
          content: Json
          course_name: string
          course_slug: string | null
          created_at: string
          display_order: number
          exam_type: Database["public"]["Enums"]["exam_type"]
          id: string
          is_active: boolean
          is_featured: boolean
          is_homepage: boolean
          learning_mode: Database["public"]["Enums"]["testimonial_learning_mode"]
          rank: number | null
          rating: number | null
          score: number | null
          state: string
          student_name: string
          student_photo: string | null
          updated_at: string
          video_url: string | null
          year: number
        }
        Insert: {
          city: string
          college_admitted?: string | null
          content?: Json
          course_name: string
          course_slug?: string | null
          created_at?: string
          display_order?: number
          exam_type: Database["public"]["Enums"]["exam_type"]
          id?: string
          is_active?: boolean
          is_featured?: boolean
          is_homepage?: boolean
          learning_mode?: Database["public"]["Enums"]["testimonial_learning_mode"]
          rank?: number | null
          rating?: number | null
          score?: number | null
          state?: string
          student_name: string
          student_photo?: string | null
          updated_at?: string
          video_url?: string | null
          year: number
        }
        Update: {
          city?: string
          college_admitted?: string | null
          content?: Json
          course_name?: string
          course_slug?: string | null
          created_at?: string
          display_order?: number
          exam_type?: Database["public"]["Enums"]["exam_type"]
          id?: string
          is_active?: boolean
          is_featured?: boolean
          is_homepage?: boolean
          learning_mode?: Database["public"]["Enums"]["testimonial_learning_mode"]
          rank?: number | null
          rating?: number | null
          score?: number | null
          state?: string
          student_name?: string
          student_photo?: string | null
          updated_at?: string
          video_url?: string | null
          year?: number
        }
        Relationships: []
      }
      tool_usage_logs: {
        Row: {
          created_at: string | null
          execution_time_ms: number | null
          id: string
          input_data: Json | null
          ip_address: unknown
          referrer: string | null
          result_data: Json | null
          session_id: string | null
          tool_name: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          execution_time_ms?: number | null
          id?: string
          input_data?: Json | null
          ip_address?: unknown
          referrer?: string | null
          result_data?: Json | null
          session_id?: string | null
          tool_name: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          execution_time_ms?: number | null
          id?: string
          input_data?: Json | null
          ip_address?: unknown
          referrer?: string | null
          result_data?: Json | null
          session_id?: string | null
          tool_name?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tool_usage_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_usage_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_avatars: {
        Row: {
          created_at: string | null
          crop_data: Json | null
          file_name: string | null
          file_size: number | null
          height: number | null
          id: string
          is_current: boolean | null
          mime_type: string | null
          storage_path: string
          user_id: string
          width: number | null
        }
        Insert: {
          created_at?: string | null
          crop_data?: Json | null
          file_name?: string | null
          file_size?: number | null
          height?: number | null
          id?: string
          is_current?: boolean | null
          mime_type?: string | null
          storage_path: string
          user_id: string
          width?: number | null
        }
        Update: {
          created_at?: string | null
          crop_data?: Json | null
          file_name?: string | null
          file_size?: number | null
          height?: number | null
          id?: string
          is_current?: boolean | null
          mime_type?: string | null
          storage_path?: string
          user_id?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_avatars_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_avatars_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_device_sessions: {
        Row: {
          app_version: string | null
          browser: string | null
          browser_version: string | null
          city: string | null
          connection_type: string | null
          country: string | null
          created_at: string | null
          device_pixel_ratio: number | null
          device_type: string | null
          effective_bandwidth: number | null
          id: string
          is_pwa: boolean | null
          language: string | null
          last_active: string | null
          latitude: number | null
          location_accuracy: number | null
          longitude: number | null
          os: string | null
          os_version: string | null
          screen_height: number | null
          screen_width: number | null
          session_start: string | null
          state: string | null
          timezone: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          app_version?: string | null
          browser?: string | null
          browser_version?: string | null
          city?: string | null
          connection_type?: string | null
          country?: string | null
          created_at?: string | null
          device_pixel_ratio?: number | null
          device_type?: string | null
          effective_bandwidth?: number | null
          id?: string
          is_pwa?: boolean | null
          language?: string | null
          last_active?: string | null
          latitude?: number | null
          location_accuracy?: number | null
          longitude?: number | null
          os?: string | null
          os_version?: string | null
          screen_height?: number | null
          screen_width?: number | null
          session_start?: string | null
          state?: string | null
          timezone?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          app_version?: string | null
          browser?: string | null
          browser_version?: string | null
          city?: string | null
          connection_type?: string | null
          country?: string | null
          created_at?: string | null
          device_pixel_ratio?: number | null
          device_type?: string | null
          effective_bandwidth?: number | null
          id?: string
          is_pwa?: boolean | null
          language?: string | null
          last_active?: string | null
          latitude?: number | null
          location_accuracy?: number | null
          longitude?: number | null
          os?: string | null
          os_version?: string | null
          screen_height?: number | null
          screen_width?: number | null
          session_start?: string | null
          state?: string | null
          timezone?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_device_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_device_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_error_logs: {
        Row: {
          browser: string | null
          component: string | null
          created_at: string | null
          device_type: string | null
          error_message: string | null
          error_stack: string | null
          error_type: string | null
          id: string
          os: string | null
          page_url: string | null
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          browser?: string | null
          component?: string | null
          created_at?: string | null
          device_type?: string | null
          error_message?: string | null
          error_stack?: string | null
          error_type?: string | null
          id?: string
          os?: string | null
          page_url?: string | null
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          browser?: string | null
          component?: string | null
          created_at?: string | null
          device_type?: string | null
          error_message?: string | null
          error_stack?: string | null
          error_type?: string | null
          id?: string
          os?: string | null
          page_url?: string | null
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_error_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "user_device_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_error_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_error_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_exam_attempts: {
        Row: {
          created_at: string | null
          exam_date: string | null
          exam_year: number
          id: string
          session_label: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          exam_date?: string | null
          exam_year: number
          id?: string
          session_label?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          exam_date?: string | null
          exam_year?: number
          id?: string
          session_label?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_exam_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_exam_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_exam_profiles: {
        Row: {
          attempt_count: number | null
          board_marks: Json | null
          board_type: string | null
          budget_max: number | null
          college_type_preference: string[] | null
          counseling_categories: Json | null
          created_at: string | null
          first_graduate: boolean | null
          gender: string | null
          govt_school_student: boolean | null
          id: string
          jee_paper2_score: number | null
          nata_score: number | null
          nata_status: Database["public"]["Enums"]["nata_exam_status"]
          next_exam_date: string | null
          nri_status: boolean | null
          planning_year: number | null
          preferred_states: string[] | null
          pwd_status: boolean | null
          qb_onboarding_completed: boolean | null
          state_domicile: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          attempt_count?: number | null
          board_marks?: Json | null
          board_type?: string | null
          budget_max?: number | null
          college_type_preference?: string[] | null
          counseling_categories?: Json | null
          created_at?: string | null
          first_graduate?: boolean | null
          gender?: string | null
          govt_school_student?: boolean | null
          id?: string
          jee_paper2_score?: number | null
          nata_score?: number | null
          nata_status: Database["public"]["Enums"]["nata_exam_status"]
          next_exam_date?: string | null
          nri_status?: boolean | null
          planning_year?: number | null
          preferred_states?: string[] | null
          pwd_status?: boolean | null
          qb_onboarding_completed?: boolean | null
          state_domicile?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          attempt_count?: number | null
          board_marks?: Json | null
          board_type?: string | null
          budget_max?: number | null
          college_type_preference?: string[] | null
          counseling_categories?: Json | null
          created_at?: string | null
          first_graduate?: boolean | null
          gender?: string | null
          govt_school_student?: boolean | null
          id?: string
          jee_paper2_score?: number | null
          nata_score?: number | null
          nata_status?: Database["public"]["Enums"]["nata_exam_status"]
          next_exam_date?: string | null
          nri_status?: boolean | null
          planning_year?: number | null
          preferred_states?: string[] | null
          pwd_status?: boolean | null
          qb_onboarding_completed?: boolean | null
          state_domicile?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_exam_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_exam_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_exam_session_preferences: {
        Row: {
          created_at: string | null
          exam_date: string
          exam_schedule_id: string | null
          id: string
          notes: string | null
          phase: string
          session_label: string
          time_slot: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          exam_date: string
          exam_schedule_id?: string | null
          id?: string
          notes?: string | null
          phase: string
          session_label: string
          time_slot: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          exam_date?: string
          exam_schedule_id?: string | null
          id?: string
          notes?: string | null
          phase?: string
          session_label?: string
          time_slot?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_exam_session_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_exam_session_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notifications: {
        Row: {
          created_at: string | null
          event_type: Database["public"]["Enums"]["notification_event_type"]
          id: string
          is_read: boolean | null
          message: string
          metadata: Json | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          event_type: Database["public"]["Enums"]["notification_event_type"]
          id?: string
          is_read?: boolean | null
          message: string
          metadata?: Json | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          event_type?: Database["public"]["Enums"]["notification_event_type"]
          id?: string
          is_read?: boolean | null
          message?: string
          metadata?: Json | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profile_history: {
        Row: {
          change_source: string
          changed_by: string | null
          created_at: string | null
          field_name: string
          id: string
          ip_address: unknown
          new_value: string | null
          old_value: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          change_source?: string
          changed_by?: string | null
          created_at?: string | null
          field_name: string
          id?: string
          ip_address?: unknown
          new_value?: string | null
          old_value?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          change_source?: string
          changed_by?: string | null
          created_at?: string | null
          field_name?: string
          id?: string
          ip_address?: unknown
          new_value?: string | null
          old_value?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profile_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_profile_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_profile_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_profile_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_qb_stats: {
        Row: {
          comments_posted: number | null
          contribution_score: number | null
          created_at: string | null
          id: string
          improvements_posted: number | null
          questions_posted: number | null
          questions_viewed: number | null
          sessions_reported: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          comments_posted?: number | null
          contribution_score?: number | null
          created_at?: string | null
          id?: string
          improvements_posted?: number | null
          questions_posted?: number | null
          questions_viewed?: number | null
          sessions_reported?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          comments_posted?: number | null
          contribution_score?: number | null
          created_at?: string | null
          id?: string
          improvements_posted?: number | null
          questions_posted?: number | null
          questions_viewed?: number | null
          sessions_reported?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_qb_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_qb_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_rewards: {
        Row: {
          created_at: string | null
          id: string
          metadata: Json | null
          points_awarded: number
          reward_type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          points_awarded?: number
          reward_type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          points_awarded?: number
          reward_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_rewards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_rewards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          area_of_interest: string[] | null
          avatar_url: string | null
          created_at: string | null
          date_of_birth: string | null
          description: string | null
          email: string | null
          email_verified: boolean | null
          firebase_uid: string | null
          first_name: string | null
          gender: string | null
          google_id: string | null
          has_password: boolean | null
          id: string
          last_login_at: string | null
          last_name: string | null
          linked_classroom_at: string | null
          linked_classroom_by: string | null
          linked_classroom_email: string | null
          metadata: Json | null
          ms_oid: string | null
          name: string
          nickname: string | null
          onboarding_completed: boolean | null
          onboarding_completed_at: string | null
          password_updated_at: string | null
          phone: string | null
          phone_verified: boolean | null
          preferred_language: string | null
          status: Database["public"]["Enums"]["user_status"] | null
          updated_at: string | null
          user_type: Database["public"]["Enums"]["user_type"] | null
          username: string | null
        }
        Insert: {
          area_of_interest?: string[] | null
          avatar_url?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          description?: string | null
          email?: string | null
          email_verified?: boolean | null
          firebase_uid?: string | null
          first_name?: string | null
          gender?: string | null
          google_id?: string | null
          has_password?: boolean | null
          id?: string
          last_login_at?: string | null
          last_name?: string | null
          linked_classroom_at?: string | null
          linked_classroom_by?: string | null
          linked_classroom_email?: string | null
          metadata?: Json | null
          ms_oid?: string | null
          name: string
          nickname?: string | null
          onboarding_completed?: boolean | null
          onboarding_completed_at?: string | null
          password_updated_at?: string | null
          phone?: string | null
          phone_verified?: boolean | null
          preferred_language?: string | null
          status?: Database["public"]["Enums"]["user_status"] | null
          updated_at?: string | null
          user_type?: Database["public"]["Enums"]["user_type"] | null
          username?: string | null
        }
        Update: {
          area_of_interest?: string[] | null
          avatar_url?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          description?: string | null
          email?: string | null
          email_verified?: boolean | null
          firebase_uid?: string | null
          first_name?: string | null
          gender?: string | null
          google_id?: string | null
          has_password?: boolean | null
          id?: string
          last_login_at?: string | null
          last_name?: string | null
          linked_classroom_at?: string | null
          linked_classroom_by?: string | null
          linked_classroom_email?: string | null
          metadata?: Json | null
          ms_oid?: string | null
          name?: string
          nickname?: string | null
          onboarding_completed?: boolean | null
          onboarding_completed_at?: string | null
          password_updated_at?: string | null
          phone?: string | null
          phone_verified?: boolean | null
          preferred_language?: string | null
          status?: Database["public"]["Enums"]["user_status"] | null
          updated_at?: string | null
          user_type?: Database["public"]["Enums"]["user_type"] | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_linked_classroom_by_fkey"
            columns: ["linked_classroom_by"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_linked_classroom_by_fkey"
            columns: ["linked_classroom_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      youtube_subscription_coupons: {
        Row: {
          coupon_id: string
          created_at: string | null
          id: string
          ip_address: unknown
          subscribed_at: string | null
          updated_at: string | null
          user_agent: string | null
          user_id: string
          youtube_channel_id: string
          youtube_subscription_id: string | null
        }
        Insert: {
          coupon_id: string
          created_at?: string | null
          id?: string
          ip_address?: unknown
          subscribed_at?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_id: string
          youtube_channel_id: string
          youtube_subscription_id?: string | null
        }
        Update: {
          coupon_id?: string
          created_at?: string | null
          id?: string
          ip_address?: unknown
          subscribed_at?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string
          youtube_channel_id?: string
          youtube_subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "youtube_subscription_coupons_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "youtube_subscription_coupons_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "youtube_subscription_coupons_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      allotment_year_summary: {
        Row: {
          counseling_system_id: string | null
          total_entries: number | null
          year: number | null
        }
        Relationships: [
          {
            foreignKeyName: "allotment_list_entries_counseling_system_id_fkey"
            columns: ["counseling_system_id"]
            isOneToOne: false
            referencedRelation: "counseling_systems"
            referencedColumns: ["id"]
          },
        ]
      }
      coa_state_stats: {
        Row: {
          active_colleges: number | null
          active_seats: number | null
          college_count: number | null
          expiring_colleges: number | null
          newest_program: number | null
          oldest_program: number | null
          state: string | null
          total_seats: number | null
        }
        Relationships: []
      }
      nata_centers_yoy: {
        Row: {
          city_brochure: string | null
          confidence: string | null
          existed_previous_year: boolean | null
          is_new_this_year: boolean | null
          previous_year_center: string | null
          probable_center_1: string | null
          state: string | null
          year: number | null
        }
        Relationships: []
      }
      nata_current_centers: {
        Row: {
          brochure_ref: string | null
          center_1_address: string | null
          center_1_evidence: string | null
          center_2_address: string | null
          center_2_evidence: string | null
          city_brochure: string | null
          city_population_tier: string | null
          confidence: string | null
          created_at: string | null
          created_by: string | null
          has_barch_college: boolean | null
          id: string | null
          is_new_2025: boolean | null
          latitude: number | null
          longitude: number | null
          notes: string | null
          probable_center_1: string | null
          probable_center_2: string | null
          state: string | null
          tcs_ion_confirmed: boolean | null
          updated_at: string | null
          updated_by: string | null
          was_in_2024: boolean | null
          year: number | null
        }
        Insert: {
          brochure_ref?: string | null
          center_1_address?: string | null
          center_1_evidence?: string | null
          center_2_address?: string | null
          center_2_evidence?: string | null
          city_brochure?: string | null
          city_population_tier?: string | null
          confidence?: string | null
          created_at?: string | null
          created_by?: string | null
          has_barch_college?: boolean | null
          id?: string | null
          is_new_2025?: boolean | null
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          probable_center_1?: string | null
          probable_center_2?: string | null
          state?: string | null
          tcs_ion_confirmed?: boolean | null
          updated_at?: string | null
          updated_by?: string | null
          was_in_2024?: boolean | null
          year?: number | null
        }
        Update: {
          brochure_ref?: string | null
          center_1_address?: string | null
          center_1_evidence?: string | null
          center_2_address?: string | null
          center_2_evidence?: string | null
          city_brochure?: string | null
          city_population_tier?: string | null
          confidence?: string | null
          created_at?: string | null
          created_by?: string | null
          has_barch_college?: boolean | null
          id?: string | null
          is_new_2025?: boolean | null
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          probable_center_1?: string | null
          probable_center_2?: string | null
          state?: string | null
          tcs_ion_confirmed?: boolean | null
          updated_at?: string | null
          updated_by?: string | null
          was_in_2024?: boolean | null
          year?: number | null
        }
        Relationships: []
      }
      nata_state_summary: {
        Row: {
          high_confidence: number | null
          low_confidence: number | null
          medium_confidence: number | null
          state: string | null
          tcs_confirmed: number | null
          total_cities: number | null
          with_barch_colleges: number | null
          year: number | null
        }
        Relationships: []
      }
      rank_list_year_summary: {
        Row: {
          counseling_system_id: string | null
          total_entries: number | null
          year: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rank_list_entries_counseling_system_id_fkey"
            columns: ["counseling_system_id"]
            isOneToOne: false
            referencedRelation: "counseling_systems"
            referencedColumns: ["id"]
          },
        ]
      }
      user_journey_view: {
        Row: {
          admin_notes: string | null
          applicant_category:
            | Database["public"]["Enums"]["applicant_category"]
            | null
          application_created_at: string | null
          application_number: string | null
          application_status:
            | Database["public"]["Enums"]["application_status"]
            | null
          assigned_fee: number | null
          avatar_url: string | null
          batch_id: string | null
          city: string | null
          contacted_status: string | null
          country: string | null
          created_at: string | null
          demo_attended: boolean | null
          demo_registration_count: number | null
          demo_survey_completed: boolean | null
          email: string | null
          email_verified: boolean | null
          enrollment_date: string | null
          final_fee: number | null
          first_name: string | null
          form_step_completed: number | null
          has_demo_registration: boolean | null
          has_pending_payment: boolean | null
          id: string | null
          interest_course: Database["public"]["Enums"]["course_type"] | null
          last_login_at: string | null
          last_name: string | null
          latest_demo_status:
            | Database["public"]["Enums"]["demo_registration_status"]
            | null
          lead_profile_id: string | null
          learning_mode: Database["public"]["Enums"]["learning_mode"] | null
          linked_classroom_email: string | null
          name: string | null
          onboarding_completed_at: string | null
          onboarding_questions_answered: number | null
          onboarding_status:
            | Database["public"]["Enums"]["onboarding_session_status"]
            | null
          payment_count: number | null
          payment_scheme: string | null
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          phone: string | null
          phone_verified: boolean | null
          pincode: string | null
          pipeline_stage: string | null
          preferred_language: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          selected_center_id: string | null
          state: string | null
          status: Database["public"]["Enums"]["user_status"] | null
          student_course_id: string | null
          student_profile_id: string | null
          total_paid: number | null
          updated_at: string | null
          user_type: Database["public"]["Enums"]["user_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_profiles_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_journey_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_profiles_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_profiles_selected_center_id_fkey"
            columns: ["selected_center_id"]
            isOneToOne: false
            referencedRelation: "offline_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_profiles_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_profiles_course_id_fkey"
            columns: ["student_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_bulk_delete_users: {
        Args: { admin_id: string; user_ids: string[] }
        Returns: {
          deleted_admin_notes: number
          deleted_cashback_claims: number
          deleted_demo_registrations: number
          deleted_documents: number
          deleted_installments: number
          deleted_lead_profiles: number
          deleted_onboarding_responses: number
          deleted_onboarding_sessions: number
          deleted_payments: number
          deleted_profile_history: number
          deleted_scholarships: number
          deleted_student_profiles: number
          deleted_users: number
        }[]
      }
      check_username_available: {
        Args: { p_exclude_user_id?: string; p_username: string }
        Returns: boolean
      }
      clone_centers_to_new_year: {
        Args: { source_year: number; target_year: number }
        Returns: number
      }
      create_lead_profile: { Args: { payload: Json }; Returns: Json }
      ensure_qb_stats: { Args: { p_user_id: string }; Returns: undefined }
      get_allotment_college_stats: {
        Args: { p_system_id: string; p_year: number }
        Returns: {
          allotted: number
          avg_score: number
          categories: string
          college_code: string
          college_name: string
          max_rank: number
          min_rank: number
        }[]
      }
      get_allotment_community_stats: {
        Args: { p_system_id: string; p_year: number }
        Returns: {
          avg_score: number
          community: string
          count: number
          max_rank: number
          max_score: number
          min_rank: number
          min_score: number
        }[]
      }
      get_allotment_year_summary: {
        Args: { p_system_id: string }
        Returns: {
          total_entries: number
          year: number
        }[]
      }
      get_college_seat_occupancy: {
        Args: { p_max_rank?: number; p_system_id: string; p_year: number }
        Returns: {
          allotted_category: string
          branch_code: string
          college_code: string
          max_rank: number
          max_score: number
          min_rank: number
          min_score: number
          seats_filled: number
        }[]
      }
      get_college_total_occupancy: {
        Args: { p_system_id: string; p_year: number }
        Returns: {
          college_code: string
          max_rank: number
          min_rank: number
          total_allotted: number
        }[]
      }
      get_distinct_allotment_years: {
        Args: { p_system_id: string }
        Returns: {
          total_entries: number
          year: number
        }[]
      }
      get_distinct_rank_list_years: {
        Args: { p_system_id: string }
        Returns: {
          total_entries: number
          year: number
        }[]
      }
      get_next_sundays: {
        Args: { count?: number }
        Returns: {
          sunday_date: string
        }[]
      }
      get_rank_list_community_stats: {
        Args: { p_system_id: string; p_year: number }
        Returns: {
          avg_score: number
          community: string
          count: number
          max_rank: number
          max_score: number
          min_rank: number
          min_score: number
        }[]
      }
      get_rank_list_year_summary: {
        Args: { p_system_id: string }
        Returns: {
          total_entries: number
          year: number
        }[]
      }
      initialize_student_onboarding: {
        Args: {
          p_enrollment_type?: string
          p_student_profile_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      record_profile_change: {
        Args: {
          p_change_source?: string
          p_changed_by?: string
          p_field_name: string
          p_ip_address?: unknown
          p_new_value: string
          p_old_value: string
          p_user_agent?: string
          p_user_id: string
        }
        Returns: string
      }
      search_coa_colleges: {
        Args: { result_limit?: number; search_term: string }
        Returns: {
          address: string | null
          affiliating_university: string | null
          approval_period_raw: string
          approval_status: string
          city: string
          commenced_year: number | null
          course_name: string
          created_at: string
          current_intake: number | null
          data_source_url: string | null
          email: string | null
          fax: string | null
          head_of_dept: string | null
          id: string
          institution_code: string
          last_scraped_at: string
          mobile: string | null
          name: string
          phone: string | null
          pincode: string | null
          state: string
          updated_at: string
          valid_for_2025_26: boolean
          website: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "coa_institutions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      set_current_avatar: {
        Args: { p_avatar_id: string; p_user_id: string }
        Returns: boolean
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      suggest_usernames: {
        Args: { p_base_username: string; p_count?: number }
        Returns: string[]
      }
    }
    Enums: {
      app_feedback_category:
        | "bug_report"
        | "feature_request"
        | "ui_ux_issue"
        | "performance"
        | "other"
      app_feedback_status:
        | "new"
        | "reviewed"
        | "in_progress"
        | "resolved"
        | "wont_fix"
      applicant_category:
        | "school_student"
        | "diploma_student"
        | "college_student"
        | "working_professional"
      application_source:
        | "website_form"
        | "app"
        | "referral"
        | "manual"
        | "direct_link"
      application_status:
        | "draft"
        | "pending_verification"
        | "submitted"
        | "under_review"
        | "approved"
        | "rejected"
        | "deleted"
        | "enrolled"
        | "partial_payment"
      area_of_interest_type:
        | "nata"
        | "jee_paper_2"
        | "b_arch"
        | "interior_design"
        | "landscape_architecture"
        | "urban_planning"
        | "other"
      calculation_purpose:
        | "actual_score"
        | "prediction"
        | "target"
        | "exploring"
      callback_outcome:
        | "talked"
        | "not_picked_up"
        | "not_reachable"
        | "rescheduled"
        | "dead_lead"
      center_type: "headquarters" | "sub_office"
      course_type: "nata" | "jee_paper2" | "both" | "revit" | "not_sure"
      demo_mode: "online" | "offline" | "hybrid"
      demo_registration_status:
        | "pending"
        | "approved"
        | "rejected"
        | "attended"
        | "no_show"
        | "cancelled"
      demo_slot_status:
        | "draft"
        | "scheduled"
        | "confirmed"
        | "conducted"
        | "cancelled"
      direct_enrollment_link_status: "active" | "used" | "expired" | "cancelled"
      enrollment_interest: "yes" | "maybe" | "no"
      exam_type: "NATA" | "JEE_PAPER_2" | "BOTH"
      learning_mode: "hybrid" | "online_only"
      location_source: "geolocation" | "pincode" | "manual"
      marketing_content_status: "draft" | "published" | "archived"
      marketing_content_type:
        | "achievement"
        | "important_date"
        | "announcement"
        | "update"
        | "broadcast"
      nata_exam_status:
        | "attempted"
        | "applied_waiting"
        | "planning_to_apply"
        | "not_interested"
      nata_question_category:
        | "mathematics"
        | "general_aptitude"
        | "drawing"
        | "logical_reasoning"
        | "aesthetic_sensitivity"
        | "other"
      notification_event_type:
        | "new_onboarding"
        | "onboarding_skipped"
        | "new_application"
        | "payment_received"
        | "demo_registration"
        | "scholarship_opened"
        | "scholarship_submitted"
        | "scholarship_approved"
        | "scholarship_rejected"
        | "scholarship_revision_requested"
        | "application_approved"
        | "new_callback"
        | "refund_requested"
        | "refund_approved"
        | "refund_rejected"
        | "contact_message_received"
        | "direct_enrollment_completed"
        | "question_submitted"
        | "question_edit_requested"
        | "question_delete_requested"
        | "callback_reminder"
        | "ticket_created"
        | "ticket_resolved"
        | "link_regeneration_requested"
        | "feedback_submitted"
        | "classroom_enrolled"
        | "batch_assigned"
        | "batch_changed"
        | "foundation_issue_resolved"
        | "foundation_issue_reported"
        | "foundation_issue_assigned"
        | "foundation_issue_in_progress"
        | "foundation_issue_delegated"
        | "classroom_access_requested"
      notification_recipient_role: "admin" | "team_lead" | "team_member"
      onboarding_question_type: "single_select" | "multi_select" | "scale"
      onboarding_session_status:
        | "pending"
        | "in_progress"
        | "completed"
        | "skipped"
      payment_status: "pending" | "processing" | "paid" | "failed" | "refunded"
      program_type: "year_long" | "crash_course"
      question_change_request_status: "pending" | "approved" | "rejected"
      question_change_request_type: "edit" | "delete"
      question_post_status: "pending" | "approved" | "rejected" | "flagged"
      refund_request_status: "pending" | "approved" | "rejected"
      scholarship_application_status:
        | "not_eligible"
        | "eligible_pending"
        | "documents_submitted"
        | "under_review"
        | "approved"
        | "rejected"
        | "revision_requested"
      school_type: "private_school" | "government_aided" | "government_school"
      social_proof_language:
        | "tamil"
        | "english"
        | "hindi"
        | "kannada"
        | "malayalam"
        | "telugu"
      social_proof_type: "video" | "audio" | "screenshot"
      support_ticket_category:
        | "enrollment_issue"
        | "payment_issue"
        | "technical_issue"
        | "account_issue"
        | "course_question"
        | "other"
      support_ticket_priority: "low" | "medium" | "high"
      support_ticket_status: "open" | "in_progress" | "resolved" | "closed"
      testimonial_learning_mode: "online" | "hybrid" | "offline"
      user_status: "pending" | "approved" | "rejected" | "active" | "inactive"
      user_type: "lead" | "student" | "teacher" | "admin" | "parent"
      vote_type: "up" | "down"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_feedback_category: [
        "bug_report",
        "feature_request",
        "ui_ux_issue",
        "performance",
        "other",
      ],
      app_feedback_status: [
        "new",
        "reviewed",
        "in_progress",
        "resolved",
        "wont_fix",
      ],
      applicant_category: [
        "school_student",
        "diploma_student",
        "college_student",
        "working_professional",
      ],
      application_source: [
        "website_form",
        "app",
        "referral",
        "manual",
        "direct_link",
      ],
      application_status: [
        "draft",
        "pending_verification",
        "submitted",
        "under_review",
        "approved",
        "rejected",
        "deleted",
        "enrolled",
        "partial_payment",
      ],
      area_of_interest_type: [
        "nata",
        "jee_paper_2",
        "b_arch",
        "interior_design",
        "landscape_architecture",
        "urban_planning",
        "other",
      ],
      calculation_purpose: [
        "actual_score",
        "prediction",
        "target",
        "exploring",
      ],
      callback_outcome: [
        "talked",
        "not_picked_up",
        "not_reachable",
        "rescheduled",
        "dead_lead",
      ],
      center_type: ["headquarters", "sub_office"],
      course_type: ["nata", "jee_paper2", "both", "revit", "not_sure"],
      demo_mode: ["online", "offline", "hybrid"],
      demo_registration_status: [
        "pending",
        "approved",
        "rejected",
        "attended",
        "no_show",
        "cancelled",
      ],
      demo_slot_status: [
        "draft",
        "scheduled",
        "confirmed",
        "conducted",
        "cancelled",
      ],
      direct_enrollment_link_status: ["active", "used", "expired", "cancelled"],
      enrollment_interest: ["yes", "maybe", "no"],
      exam_type: ["NATA", "JEE_PAPER_2", "BOTH"],
      learning_mode: ["hybrid", "online_only"],
      location_source: ["geolocation", "pincode", "manual"],
      marketing_content_status: ["draft", "published", "archived"],
      marketing_content_type: [
        "achievement",
        "important_date",
        "announcement",
        "update",
        "broadcast",
      ],
      nata_exam_status: [
        "attempted",
        "applied_waiting",
        "planning_to_apply",
        "not_interested",
      ],
      nata_question_category: [
        "mathematics",
        "general_aptitude",
        "drawing",
        "logical_reasoning",
        "aesthetic_sensitivity",
        "other",
      ],
      notification_event_type: [
        "new_onboarding",
        "onboarding_skipped",
        "new_application",
        "payment_received",
        "demo_registration",
        "scholarship_opened",
        "scholarship_submitted",
        "scholarship_approved",
        "scholarship_rejected",
        "scholarship_revision_requested",
        "application_approved",
        "new_callback",
        "refund_requested",
        "refund_approved",
        "refund_rejected",
        "contact_message_received",
        "direct_enrollment_completed",
        "question_submitted",
        "question_edit_requested",
        "question_delete_requested",
        "callback_reminder",
        "ticket_created",
        "ticket_resolved",
        "link_regeneration_requested",
        "feedback_submitted",
        "classroom_enrolled",
        "batch_assigned",
        "batch_changed",
        "foundation_issue_resolved",
        "foundation_issue_reported",
        "foundation_issue_assigned",
        "foundation_issue_in_progress",
        "foundation_issue_delegated",
        "classroom_access_requested",
      ],
      notification_recipient_role: ["admin", "team_lead", "team_member"],
      onboarding_question_type: ["single_select", "multi_select", "scale"],
      onboarding_session_status: [
        "pending",
        "in_progress",
        "completed",
        "skipped",
      ],
      payment_status: ["pending", "processing", "paid", "failed", "refunded"],
      program_type: ["year_long", "crash_course"],
      question_change_request_status: ["pending", "approved", "rejected"],
      question_change_request_type: ["edit", "delete"],
      question_post_status: ["pending", "approved", "rejected", "flagged"],
      refund_request_status: ["pending", "approved", "rejected"],
      scholarship_application_status: [
        "not_eligible",
        "eligible_pending",
        "documents_submitted",
        "under_review",
        "approved",
        "rejected",
        "revision_requested",
      ],
      school_type: ["private_school", "government_aided", "government_school"],
      social_proof_language: [
        "tamil",
        "english",
        "hindi",
        "kannada",
        "malayalam",
        "telugu",
      ],
      social_proof_type: ["video", "audio", "screenshot"],
      support_ticket_category: [
        "enrollment_issue",
        "payment_issue",
        "technical_issue",
        "account_issue",
        "course_question",
        "other",
      ],
      support_ticket_priority: ["low", "medium", "high"],
      support_ticket_status: ["open", "in_progress", "resolved", "closed"],
      testimonial_learning_mode: ["online", "hybrid", "offline"],
      user_status: ["pending", "approved", "rejected", "active", "inactive"],
      user_type: ["lead", "student", "teacher", "admin", "parent"],
      vote_type: ["up", "down"],
    },
  },
} as const
