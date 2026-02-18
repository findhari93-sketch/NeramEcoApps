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
          last_attempt_at: string | null
          lead_profile_id: string | null
          name: string
          notes: string | null
          phone: string
          preferred_date: string | null
          preferred_slot: string | null
          query_type: string | null
          scheduled_at: string | null
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
          last_attempt_at?: string | null
          lead_profile_id?: string | null
          name: string
          notes?: string | null
          phone: string
          preferred_date?: string | null
          preferred_slot?: string | null
          query_type?: string | null
          scheduled_at?: string | null
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
          last_attempt_at?: string | null
          lead_profile_id?: string | null
          name?: string
          notes?: string | null
          phone?: string
          preferred_date?: string | null
          preferred_slot?: string | null
          query_type?: string | null
          scheduled_at?: string | null
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
            referencedRelation: "users"
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
            referencedRelation: "users"
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
      colleges: {
        Row: {
          address: string | null
          affiliation: string | null
          annual_fee_max: number | null
          annual_fee_min: number | null
          city: string
          courses_offered: string[] | null
          created_at: string | null
          description: string | null
          email: string | null
          established_year: number | null
          facilities: string[] | null
          id: string
          images: string[] | null
          intake_capacity: number | null
          is_active: boolean | null
          logo_url: string | null
          meta_description: string | null
          meta_title: string | null
          name: string
          nirf_rank: number | null
          phone: string | null
          pincode: string | null
          rating: number | null
          slug: string
          state: string
          type: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          affiliation?: string | null
          annual_fee_max?: number | null
          annual_fee_min?: number | null
          city: string
          courses_offered?: string[] | null
          created_at?: string | null
          description?: string | null
          email?: string | null
          established_year?: number | null
          facilities?: string[] | null
          id?: string
          images?: string[] | null
          intake_capacity?: number | null
          is_active?: boolean | null
          logo_url?: string | null
          meta_description?: string | null
          meta_title?: string | null
          name: string
          nirf_rank?: number | null
          phone?: string | null
          pincode?: string | null
          rating?: number | null
          slug: string
          state: string
          type?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          affiliation?: string | null
          annual_fee_max?: number | null
          annual_fee_min?: number | null
          city?: string
          courses_offered?: string[] | null
          created_at?: string | null
          description?: string | null
          email?: string | null
          established_year?: number | null
          facilities?: string[] | null
          id?: string
          images?: string[] | null
          intake_capacity?: number | null
          is_active?: boolean | null
          logo_url?: string | null
          meta_description?: string | null
          meta_title?: string | null
          name?: string
          nirf_rank?: number | null
          phone?: string | null
          pincode?: string | null
          rating?: number | null
          slug?: string
          state?: string
          type?: string | null
          updated_at?: string | null
          website?: string | null
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
          discount_type: string
          discount_value: number
          id: string
          is_active: boolean | null
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
          discount_type: string
          discount_value: number
          id?: string
          is_active?: boolean | null
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
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          min_amount?: number | null
          updated_at?: string | null
          used_count?: number | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: []
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
            referencedRelation: "users"
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
            referencedRelation: "users"
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
      lead_profiles: {
        Row: {
          academic_data: Json | null
          address: string | null
          admin_notes: string | null
          applicant_category:
            | Database["public"]["Enums"]["applicant_category"]
            | null
          application_data: Json | null
          application_number: string | null
          assigned_fee: number | null
          caste_category: string | null
          city: string | null
          country: string | null
          coupon_code: string | null
          created_at: string | null
          deleted_at: string | null
          deletion_reason: string | null
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
          installment_reminder_date: string | null
          interest_course: Database["public"]["Enums"]["course_type"] | null
          last_reminder_sent_at: string | null
          latitude: number | null
          location_source: string | null
          longitude: number | null
          payment_deadline: string | null
          payment_scheme: string | null
          phone_verified: boolean | null
          phone_verified_at: string | null
          pincode: string | null
          qualification: string | null
          referral_code: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          school_college: string | null
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
          admin_notes?: string | null
          applicant_category?:
            | Database["public"]["Enums"]["applicant_category"]
            | null
          application_data?: Json | null
          application_number?: string | null
          assigned_fee?: number | null
          caste_category?: string | null
          city?: string | null
          country?: string | null
          coupon_code?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deletion_reason?: string | null
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
          installment_reminder_date?: string | null
          interest_course?: Database["public"]["Enums"]["course_type"] | null
          last_reminder_sent_at?: string | null
          latitude?: number | null
          location_source?: string | null
          longitude?: number | null
          payment_deadline?: string | null
          payment_scheme?: string | null
          phone_verified?: boolean | null
          phone_verified_at?: string | null
          pincode?: string | null
          qualification?: string | null
          referral_code?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_college?: string | null
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
          admin_notes?: string | null
          applicant_category?:
            | Database["public"]["Enums"]["applicant_category"]
            | null
          application_data?: Json | null
          application_number?: string | null
          assigned_fee?: number | null
          caste_category?: string | null
          city?: string | null
          country?: string | null
          coupon_code?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deletion_reason?: string | null
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
          installment_reminder_date?: string | null
          interest_course?: Database["public"]["Enums"]["course_type"] | null
          last_reminder_sent_at?: string | null
          latitude?: number | null
          location_source?: string | null
          longitude?: number | null
          payment_deadline?: string | null
          payment_scheme?: string | null
          phone_verified?: boolean | null
          phone_verified_at?: string | null
          pincode?: string | null
          qualification?: string | null
          referral_code?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_college?: string | null
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
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      offline_centers: {
        Row: {
          address: string
          capacity: number | null
          city: string
          contact_email: string | null
          contact_phone: string | null
          country: string | null
          created_at: string | null
          current_students: number | null
          display_order: number | null
          facilities: string[] | null
          google_business_url: string | null
          google_maps_url: string | null
          google_place_id: string | null
          id: string
          is_active: boolean | null
          latitude: number | null
          longitude: number | null
          name: string
          operating_hours: Json | null
          photos: Json | null
          pincode: string | null
          preferred_visit_times: string[] | null
          slug: string
          state: string
          updated_at: string | null
        }
        Insert: {
          address: string
          capacity?: number | null
          city: string
          contact_email?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string | null
          current_students?: number | null
          display_order?: number | null
          facilities?: string[] | null
          google_business_url?: string | null
          google_maps_url?: string | null
          google_place_id?: string | null
          id?: string
          is_active?: boolean | null
          latitude?: number | null
          longitude?: number | null
          name: string
          operating_hours?: Json | null
          photos?: Json | null
          pincode?: string | null
          preferred_visit_times?: string[] | null
          slug: string
          state: string
          updated_at?: string | null
        }
        Update: {
          address?: string
          capacity?: number | null
          city?: string
          contact_email?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string | null
          current_students?: number | null
          display_order?: number | null
          facilities?: string[] | null
          google_business_url?: string | null
          google_maps_url?: string | null
          google_place_id?: string | null
          id?: string
          is_active?: boolean | null
          latitude?: number | null
          longitude?: number | null
          name?: string
          operating_hours?: Json | null
          photos?: Json | null
          pincode?: string | null
          preferred_visit_times?: string[] | null
          slug?: string
          state?: string
          updated_at?: string | null
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
          failure_code: string | null
          failure_reason: string | null
          id: string
          installment_number: number | null
          lead_profile_id: string | null
          metadata: Json | null
          paid_at: string | null
          payment_method: string | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          razorpay_signature: string | null
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
          failure_code?: string | null
          failure_reason?: string | null
          id?: string
          installment_number?: number | null
          lead_profile_id?: string | null
          metadata?: Json | null
          paid_at?: string | null
          payment_method?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
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
          failure_code?: string | null
          failure_reason?: string | null
          id?: string
          installment_number?: number | null
          lead_profile_id?: string | null
          metadata?: Json | null
          paid_at?: string | null
          payment_method?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
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
            foreignKeyName: "payments_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
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
          student_profile_id?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
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
            foreignKeyName: "post_enrollment_details_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      scholarship_applications: {
        Row: {
          annual_income_range: string | null
          created_at: string | null
          eligibility_reason: string | null
          government_school_years: number | null
          id: string
          income_certificate_url: string | null
          is_government_school: boolean | null
          is_low_income: boolean | null
          lead_profile_id: string
          rejection_reason: string | null
          scholarship_percentage: number | null
          school_id_card_url: string | null
          school_name: string | null
          updated_at: string | null
          verification_notes: string | null
          verification_status: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          annual_income_range?: string | null
          created_at?: string | null
          eligibility_reason?: string | null
          government_school_years?: number | null
          id?: string
          income_certificate_url?: string | null
          is_government_school?: boolean | null
          is_low_income?: boolean | null
          lead_profile_id: string
          rejection_reason?: string | null
          scholarship_percentage?: number | null
          school_id_card_url?: string | null
          school_name?: string | null
          updated_at?: string | null
          verification_notes?: string | null
          verification_status?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          annual_income_range?: string | null
          created_at?: string | null
          eligibility_reason?: string | null
          government_school_years?: number | null
          id?: string
          income_certificate_url?: string | null
          is_government_school?: boolean | null
          is_low_income?: boolean | null
          lead_profile_id?: string
          rejection_reason?: string | null
          scholarship_percentage?: number | null
          school_id_card_url?: string | null
          school_name?: string | null
          updated_at?: string | null
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
            foreignKeyName: "scholarship_applications_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "users"
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
          metadata: Json | null
          ms_oid: string | null
          name: string
          nickname: string | null
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
          metadata?: Json | null
          ms_oid?: string | null
          name: string
          nickname?: string | null
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
          metadata?: Json | null
          ms_oid?: string | null
          name?: string
          nickname?: string | null
          password_updated_at?: string | null
          phone?: string | null
          phone_verified?: boolean | null
          preferred_language?: string | null
          status?: Database["public"]["Enums"]["user_status"] | null
          updated_at?: string | null
          user_type?: Database["public"]["Enums"]["user_type"] | null
          username?: string | null
        }
        Relationships: []
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
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_username_available: {
        Args: { p_exclude_user_id?: string; p_username: string }
        Returns: boolean
      }
      get_next_sundays: {
        Args: { count?: number }
        Returns: {
          sunday_date: string
        }[]
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
      set_current_avatar: {
        Args: { p_avatar_id: string; p_user_id: string }
        Returns: boolean
      }
      suggest_usernames: {
        Args: { p_base_username: string; p_count?: number }
        Returns: string[]
      }
    }
    Enums: {
      applicant_category:
        | "school_student"
        | "diploma_student"
        | "college_student"
        | "working_professional"
      application_source: "website_form" | "app" | "referral" | "manual"
      application_status:
        | "draft"
        | "pending_verification"
        | "submitted"
        | "under_review"
        | "approved"
        | "rejected"
        | "deleted"
      area_of_interest_type:
        | "nata"
        | "jee_paper_2"
        | "b_arch"
        | "interior_design"
        | "landscape_architecture"
        | "urban_planning"
        | "other"
      course_type: "nata" | "jee_paper2" | "both" | "revit"
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
      enrollment_interest: "yes" | "maybe" | "no"
      exam_type: "NATA" | "JEE_PAPER_2" | "BOTH"
      location_source: "geolocation" | "pincode" | "manual"
      payment_status: "pending" | "processing" | "paid" | "failed" | "refunded"
      user_status: "pending" | "approved" | "rejected" | "active" | "inactive"
      user_type: "lead" | "student" | "teacher" | "admin"
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
      applicant_category: [
        "school_student",
        "diploma_student",
        "college_student",
        "working_professional",
      ],
      application_source: ["website_form", "app", "referral", "manual"],
      application_status: [
        "draft",
        "pending_verification",
        "submitted",
        "under_review",
        "approved",
        "rejected",
        "deleted",
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
      course_type: ["nata", "jee_paper2", "both", "revit"],
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
      enrollment_interest: ["yes", "maybe", "no"],
      exam_type: ["NATA", "JEE_PAPER_2", "BOTH"],
      location_source: ["geolocation", "pincode", "manual"],
      payment_status: ["pending", "processing", "paid", "failed", "refunded"],
      user_status: ["pending", "approved", "rejected", "active", "inactive"],
      user_type: ["lead", "student", "teacher", "admin"],
    },
  },
} as const
