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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      accessibility: {
        Row: {
          accessible_toilet: boolean | null
          accessible_transport: boolean | null
          attraction_id: string
          id: string
          last_verified: string | null
          lifts: boolean | null
          medical_distance_km: number | null
          ramps: boolean | null
          resting_areas: boolean | null
          source: string | null
          source_url: string | null
          steps_count: number | null
          verification_status: string | null
          walking_difficulty: string | null
          wheelchair_access: boolean | null
        }
        Insert: {
          accessible_toilet?: boolean | null
          accessible_transport?: boolean | null
          attraction_id: string
          id?: string
          last_verified?: string | null
          lifts?: boolean | null
          medical_distance_km?: number | null
          ramps?: boolean | null
          resting_areas?: boolean | null
          source?: string | null
          source_url?: string | null
          steps_count?: number | null
          verification_status?: string | null
          walking_difficulty?: string | null
          wheelchair_access?: boolean | null
        }
        Update: {
          accessible_toilet?: boolean | null
          accessible_transport?: boolean | null
          attraction_id?: string
          id?: string
          last_verified?: string | null
          lifts?: boolean | null
          medical_distance_km?: number | null
          ramps?: boolean | null
          resting_areas?: boolean | null
          source?: string | null
          source_url?: string | null
          steps_count?: number | null
          verification_status?: string | null
          walking_difficulty?: string | null
          wheelchair_access?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "accessibility_attraction_id_fkey"
            columns: ["attraction_id"]
            isOneToOne: true
            referencedRelation: "attractions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_predictions: {
        Row: {
          confidence: number | null
          destination_id: string | null
          generated_at: string
          id: string
          model_version: string | null
          prediction_type: string
          prediction_value: Json
        }
        Insert: {
          confidence?: number | null
          destination_id?: string | null
          generated_at?: string
          id?: string
          model_version?: string | null
          prediction_type: string
          prediction_value: Json
        }
        Update: {
          confidence?: number | null
          destination_id?: string | null
          generated_at?: string
          id?: string
          model_version?: string | null
          prediction_type?: string
          prediction_value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ai_predictions_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
        ]
      }
      attractions: {
        Row: {
          attraction_code: string | null
          category: string | null
          created_at: string
          description: string | null
          destination_id: string
          district: string | null
          id: string
          last_verified: string | null
          latitude: number | null
          longitude: number | null
          name: string
          official_url: string | null
          source: string | null
          source_url: string | null
          updated_at: string
          verification_status: string | null
        }
        Insert: {
          attraction_code?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          destination_id: string
          district?: string | null
          id?: string
          last_verified?: string | null
          latitude?: number | null
          longitude?: number | null
          name: string
          official_url?: string | null
          source?: string | null
          source_url?: string | null
          updated_at?: string
          verification_status?: string | null
        }
        Update: {
          attraction_code?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          destination_id?: string
          district?: string | null
          id?: string
          last_verified?: string | null
          latitude?: number | null
          longitude?: number | null
          name?: string
          official_url?: string | null
          source?: string | null
          source_url?: string | null
          updated_at?: string
          verification_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attractions_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          id: string
          metadata: Json | null
          resource_id: string | null
          resource_type: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          resource_id?: string | null
          resource_type: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string
        }
        Relationships: []
      }
      business_documents: {
        Row: {
          business_id: string
          created_at: string
          document_number: string | null
          document_type: string
          id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          storage_path: string | null
          verification_status: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          document_number?: string | null
          document_type: string
          id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          storage_path?: string | null
          verification_status?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          document_number?: string | null
          document_type?: string
          id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          storage_path?: string | null
          verification_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_documents_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "local_businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      crowd_data: {
        Row: {
          confidence: number | null
          created_at: string
          crowd_level: string | null
          crowd_score: number | null
          destination_id: string
          festival: boolean | null
          holiday: boolean | null
          id: string
          observed_at: string
          source: string | null
          visitor_count: number | null
          weather_context: Json | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          crowd_level?: string | null
          crowd_score?: number | null
          destination_id: string
          festival?: boolean | null
          holiday?: boolean | null
          id?: string
          observed_at: string
          source?: string | null
          visitor_count?: number | null
          weather_context?: Json | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          crowd_level?: string | null
          crowd_score?: number | null
          destination_id?: string
          festival?: boolean | null
          holiday?: boolean | null
          id?: string
          observed_at?: string
          source?: string | null
          visitor_count?: number | null
          weather_context?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "crowd_data_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
        ]
      }
      demand_data: {
        Row: {
          destination_id: string | null
          domestic_visitors: number | null
          foreign_visitors: number | null
          hotel_occupancy: number | null
          id: string
          month: number | null
          source: string | null
          source_url: string | null
          state: string | null
          verification_status: string | null
          year: number
        }
        Insert: {
          destination_id?: string | null
          domestic_visitors?: number | null
          foreign_visitors?: number | null
          hotel_occupancy?: number | null
          id?: string
          month?: number | null
          source?: string | null
          source_url?: string | null
          state?: string | null
          verification_status?: string | null
          year: number
        }
        Update: {
          destination_id?: string | null
          domestic_visitors?: number | null
          foreign_visitors?: number | null
          hotel_occupancy?: number | null
          id?: string
          month?: number | null
          source?: string | null
          source_url?: string | null
          state?: string | null
          verification_status?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "demand_data_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
        ]
      }
      demand_forecasts: {
        Row: {
          confidence: number | null
          confidence_lower: number | null
          confidence_upper: number | null
          created_at: string
          destination_id: string | null
          forecast_time: string
          id: string
          model_version: string | null
          predicted_visitors: number | null
          state: string | null
        }
        Insert: {
          confidence?: number | null
          confidence_lower?: number | null
          confidence_upper?: number | null
          created_at?: string
          destination_id?: string | null
          forecast_time: string
          id?: string
          model_version?: string | null
          predicted_visitors?: number | null
          state?: string | null
        }
        Update: {
          confidence?: number | null
          confidence_lower?: number | null
          confidence_upper?: number | null
          created_at?: string
          destination_id?: string | null
          forecast_time?: string
          id?: string
          model_version?: string | null
          predicted_visitors?: number | null
          state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "demand_forecasts_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
        ]
      }
      destination_media: {
        Row: {
          created_at: string
          destination_id: string | null
          destination_name: string
          id: string
          media_type: string
          media_url: string
          source_document: string
          state: string | null
          verification_status: string
        }
        Insert: {
          created_at?: string
          destination_id?: string | null
          destination_name: string
          id?: string
          media_type?: string
          media_url: string
          source_document?: string
          state?: string | null
          verification_status?: string
        }
        Update: {
          created_at?: string
          destination_id?: string | null
          destination_name?: string
          id?: string
          media_type?: string
          media_url?: string
          source_document?: string
          state?: string | null
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "destination_media_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
        ]
      }
      destination_reviews: {
        Row: {
          comment: string
          created_at: string | null
          destination_id: string | null
          id: string
          rating: number
          user_name: string
        }
        Insert: {
          comment: string
          created_at?: string | null
          destination_id?: string | null
          id?: string
          rating: number
          user_name: string
        }
        Update: {
          comment?: string
          created_at?: string | null
          destination_id?: string | null
          id?: string
          rating?: number
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "destination_reviews_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
        ]
      }
      destinations: {
        Row: {
          best_time_to_visit: string | null
          city: string | null
          created_at: string
          description: string | null
          destination_code: string | null
          district: string | null
          id: string
          last_verified: string | null
          latitude: number | null
          longitude: number | null
          name: string
          rush_free_hours: string | null
          source: string | null
          source_url: string | null
          state: string
          updated_at: string
          verification_status: string | null
        }
        Insert: {
          best_time_to_visit?: string | null
          city?: string | null
          created_at?: string
          description?: string | null
          destination_code?: string | null
          district?: string | null
          id?: string
          last_verified?: string | null
          latitude?: number | null
          longitude?: number | null
          name: string
          rush_free_hours?: string | null
          source?: string | null
          source_url?: string | null
          state: string
          updated_at?: string
          verification_status?: string | null
        }
        Update: {
          best_time_to_visit?: string | null
          city?: string | null
          created_at?: string
          description?: string | null
          destination_code?: string | null
          district?: string | null
          id?: string
          last_verified?: string | null
          latitude?: number | null
          longitude?: number | null
          name?: string
          rush_free_hours?: string | null
          source?: string | null
          source_url?: string | null
          state?: string
          updated_at?: string
          verification_status?: string | null
        }
        Relationships: []
      }
      elderly_support: {
        Row: {
          accessible_toilet: boolean | null
          attraction_id: string
          benches: boolean | null
          id: string
          last_verified: string | null
          lifts: boolean | null
          ramps: boolean | null
          source: string | null
          source_url: string | null
          stairs: string | null
          verification_status: string | null
        }
        Insert: {
          accessible_toilet?: boolean | null
          attraction_id: string
          benches?: boolean | null
          id?: string
          last_verified?: string | null
          lifts?: boolean | null
          ramps?: boolean | null
          source?: string | null
          source_url?: string | null
          stairs?: string | null
          verification_status?: string | null
        }
        Update: {
          accessible_toilet?: boolean | null
          attraction_id?: string
          benches?: boolean | null
          id?: string
          last_verified?: string | null
          lifts?: boolean | null
          ramps?: boolean | null
          source?: string | null
          source_url?: string | null
          stairs?: string | null
          verification_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "elderly_support_attraction_id_fkey"
            columns: ["attraction_id"]
            isOneToOne: true
            referencedRelation: "attractions"
            referencedColumns: ["id"]
          },
        ]
      }
      emergency_resources: {
        Row: {
          address: string | null
          created_at: string
          destination_id: string | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          opening_hours: string | null
          phone: string | null
          source: string | null
          source_url: string | null
          type: string
          verified: boolean | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          destination_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          opening_hours?: string | null
          phone?: string | null
          source?: string | null
          source_url?: string | null
          type: string
          verified?: boolean | null
        }
        Update: {
          address?: string | null
          created_at?: string
          destination_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          opening_hours?: string | null
          phone?: string | null
          source?: string | null
          source_url?: string | null
          type?: string
          verified?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "emergency_resources_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
        ]
      }
      entry_fees: {
        Row: {
          attraction_id: string
          currency: string | null
          fee_child: number | null
          fee_domestic: number | null
          fee_foreign: number | null
          fee_senior: number | null
          fee_student: number | null
          id: string
          last_verified: string | null
          online_ticket: boolean | null
          source: string | null
          source_url: string | null
          ticket_url: string | null
          verification_status: string | null
        }
        Insert: {
          attraction_id: string
          currency?: string | null
          fee_child?: number | null
          fee_domestic?: number | null
          fee_foreign?: number | null
          fee_senior?: number | null
          fee_student?: number | null
          id?: string
          last_verified?: string | null
          online_ticket?: boolean | null
          source?: string | null
          source_url?: string | null
          ticket_url?: string | null
          verification_status?: string | null
        }
        Update: {
          attraction_id?: string
          currency?: string | null
          fee_child?: number | null
          fee_domestic?: number | null
          fee_foreign?: number | null
          fee_senior?: number | null
          fee_student?: number | null
          id?: string
          last_verified?: string | null
          online_ticket?: boolean | null
          source?: string | null
          source_url?: string | null
          ticket_url?: string | null
          verification_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entry_fees_attraction_id_fkey"
            columns: ["attraction_id"]
            isOneToOne: true
            referencedRelation: "attractions"
            referencedColumns: ["id"]
          },
        ]
      }
      experiences: {
        Row: {
          accessibility: string | null
          availability: string | null
          category: string | null
          created_at: string
          currency: string | null
          destination_id: string | null
          duration: string | null
          experience_code: string | null
          id: string
          languages: string | null
          name: string
          price: number | null
          provider_id: string | null
          source: string | null
          source_url: string | null
          verification_status: string | null
          verified: boolean | null
        }
        Insert: {
          accessibility?: string | null
          availability?: string | null
          category?: string | null
          created_at?: string
          currency?: string | null
          destination_id?: string | null
          duration?: string | null
          experience_code?: string | null
          id?: string
          languages?: string | null
          name: string
          price?: number | null
          provider_id?: string | null
          source?: string | null
          source_url?: string | null
          verification_status?: string | null
          verified?: boolean | null
        }
        Update: {
          accessibility?: string | null
          availability?: string | null
          category?: string | null
          created_at?: string
          currency?: string | null
          destination_id?: string | null
          duration?: string | null
          experience_code?: string | null
          id?: string
          languages?: string | null
          name?: string
          price?: number | null
          provider_id?: string | null
          source?: string | null
          source_url?: string | null
          verification_status?: string | null
          verified?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "experiences_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiences_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "local_businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      images: {
        Row: {
          attraction_id: string | null
          attribution: string | null
          created_at: string
          destination_id: string | null
          id: string
          image_url: string | null
          license: string | null
          photographer: string | null
          source: string | null
          source_url: string | null
          usage: string | null
          verification_status: string | null
        }
        Insert: {
          attraction_id?: string | null
          attribution?: string | null
          created_at?: string
          destination_id?: string | null
          id?: string
          image_url?: string | null
          license?: string | null
          photographer?: string | null
          source?: string | null
          source_url?: string | null
          usage?: string | null
          verification_status?: string | null
        }
        Update: {
          attraction_id?: string | null
          attribution?: string | null
          created_at?: string
          destination_id?: string | null
          id?: string
          image_url?: string | null
          license?: string | null
          photographer?: string | null
          source?: string | null
          source_url?: string | null
          usage?: string | null
          verification_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "images_attraction_id_fkey"
            columns: ["attraction_id"]
            isOneToOne: false
            referencedRelation: "attractions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "images_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
        ]
      }
      itinerary_items: {
        Row: {
          attraction_id: string | null
          destination_id: string | null
          end_time: string | null
          id: string
          notes: string | null
          sort_order: number | null
          start_time: string | null
          trip_id: string
          visit_date: string | null
        }
        Insert: {
          attraction_id?: string | null
          destination_id?: string | null
          end_time?: string | null
          id?: string
          notes?: string | null
          sort_order?: number | null
          start_time?: string | null
          trip_id: string
          visit_date?: string | null
        }
        Update: {
          attraction_id?: string | null
          destination_id?: string | null
          end_time?: string | null
          id?: string
          notes?: string | null
          sort_order?: number | null
          start_time?: string | null
          trip_id?: string
          visit_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "itinerary_items_attraction_id_fkey"
            columns: ["attraction_id"]
            isOneToOne: false
            referencedRelation: "attractions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itinerary_items_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itinerary_items_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      languages: {
        Row: {
          destination_id: string
          guide_languages: string | null
          id: string
          last_verified: string | null
          local_languages: string | null
          official_language: string | null
          source: string | null
          source_url: string | null
          verification_status: string | null
        }
        Insert: {
          destination_id: string
          guide_languages?: string | null
          id?: string
          last_verified?: string | null
          local_languages?: string | null
          official_language?: string | null
          source?: string | null
          source_url?: string | null
          verification_status?: string | null
        }
        Update: {
          destination_id?: string
          guide_languages?: string | null
          id?: string
          last_verified?: string | null
          local_languages?: string | null
          official_language?: string | null
          source?: string | null
          source_url?: string | null
          verification_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "languages_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: true
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
        ]
      }
      local_businesses: {
        Row: {
          address: string | null
          business_code: string | null
          created_at: string
          destination_id: string | null
          email: string | null
          id: string
          languages: string | null
          name: string
          phone: string | null
          source: string | null
          source_url: string | null
          type: string | null
          verification_status: string | null
          verified: boolean | null
        }
        Insert: {
          address?: string | null
          business_code?: string | null
          created_at?: string
          destination_id?: string | null
          email?: string | null
          id?: string
          languages?: string | null
          name: string
          phone?: string | null
          source?: string | null
          source_url?: string | null
          type?: string | null
          verification_status?: string | null
          verified?: boolean | null
        }
        Update: {
          address?: string | null
          business_code?: string | null
          created_at?: string
          destination_id?: string | null
          email?: string | null
          id?: string
          languages?: string | null
          name?: string
          phone?: string | null
          source?: string | null
          source_url?: string | null
          type?: string | null
          verification_status?: string | null
          verified?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "local_businesses_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
        ]
      }
      model_versions: {
        Row: {
          algorithm: string | null
          created_at: string
          id: string
          metrics: Json | null
          model_name: string
          status: string | null
          version: string
        }
        Insert: {
          algorithm?: string | null
          created_at?: string
          id?: string
          metrics?: Json | null
          model_name: string
          status?: string | null
          version: string
        }
        Update: {
          algorithm?: string | null
          created_at?: string
          id?: string
          metrics?: Json | null
          model_name?: string
          status?: string | null
          version?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          destination_id: string | null
          expires_at: string | null
          id: string
          message: string
          priority: string | null
          read_at: string | null
          title: string
          trip_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          destination_id?: string | null
          expires_at?: string | null
          id?: string
          message: string
          priority?: string | null
          read_at?: string | null
          title: string
          trip_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          destination_id?: string | null
          expires_at?: string | null
          id?: string
          message?: string
          priority?: string | null
          read_at?: string | null
          title?: string
          trip_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      opening_hours: {
        Row: {
          attraction_id: string
          closed_days: string | null
          closing_time: string | null
          id: string
          last_verified: string | null
          opening_time: string | null
          seasonal_notes: string | null
          source: string | null
          source_url: string | null
          verification_status: string | null
        }
        Insert: {
          attraction_id: string
          closed_days?: string | null
          closing_time?: string | null
          id?: string
          last_verified?: string | null
          opening_time?: string | null
          seasonal_notes?: string | null
          source?: string | null
          source_url?: string | null
          verification_status?: string | null
        }
        Update: {
          attraction_id?: string
          closed_days?: string | null
          closing_time?: string | null
          id?: string
          last_verified?: string | null
          opening_time?: string | null
          seasonal_notes?: string | null
          source?: string | null
          source_url?: string | null
          verification_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opening_hours_attraction_id_fkey"
            columns: ["attraction_id"]
            isOneToOne: true
            referencedRelation: "attractions"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          attraction_id: string | null
          average_rating: number | null
          created_at: string
          destination_id: string | null
          id: string
          is_first_party: boolean | null
          review_count: number | null
          sentiment_score: number | null
          source: string | null
          source_url: string | null
        }
        Insert: {
          attraction_id?: string | null
          average_rating?: number | null
          created_at?: string
          destination_id?: string | null
          id?: string
          is_first_party?: boolean | null
          review_count?: number | null
          sentiment_score?: number | null
          source?: string | null
          source_url?: string | null
        }
        Update: {
          attraction_id?: string | null
          average_rating?: number | null
          created_at?: string
          destination_id?: string | null
          id?: string
          is_first_party?: boolean | null
          review_count?: number | null
          sentiment_score?: number | null
          source?: string | null
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_attraction_id_fkey"
            columns: ["attraction_id"]
            isOneToOne: false
            referencedRelation: "attractions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_alerts: {
        Row: {
          created_at: string
          created_by: string | null
          destination_id: string | null
          ends_at: string | null
          id: string
          message: string
          severity: string
          source: string | null
          source_url: string | null
          starts_at: string
          status: string | null
          target_area: Json | null
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          destination_id?: string | null
          ends_at?: string | null
          id?: string
          message: string
          severity: string
          source?: string | null
          source_url?: string | null
          starts_at: string
          status?: string | null
          target_area?: Json | null
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          destination_id?: string | null
          ends_at?: string | null
          id?: string
          message?: string
          severity?: string
          source?: string | null
          source_url?: string | null
          starts_at?: string
          status?: string | null
          target_area?: Json | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_alerts_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_incidents: {
        Row: {
          category: string
          created_at: string
          description: string | null
          destination_id: string | null
          id: string
          incident_code: string | null
          incident_date: string | null
          incident_time: string | null
          location: string | null
          severity: string | null
          source: string | null
          source_url: string | null
          status: string | null
          verification_status: string | null
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          destination_id?: string | null
          id?: string
          incident_code?: string | null
          incident_date?: string | null
          incident_time?: string | null
          location?: string | null
          severity?: string | null
          source?: string | null
          source_url?: string | null
          status?: string | null
          verification_status?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          destination_id?: string | null
          id?: string
          incident_code?: string | null
          incident_date?: string | null
          incident_time?: string | null
          location?: string | null
          severity?: string | null
          source?: string | null
          source_url?: string | null
          status?: string | null
          verification_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "safety_incidents_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_indicators: {
        Row: {
          confidence: number | null
          created_at: string
          derived: boolean | null
          destination_id: string
          explanation: string | null
          id: string
          indicator_type: string
          score: number | null
          source: string | null
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          derived?: boolean | null
          destination_id: string
          explanation?: string | null
          id?: string
          indicator_type: string
          score?: number | null
          source?: string | null
          valid_from: string
          valid_to?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          derived?: boolean | null
          destination_id?: string
          explanation?: string | null
          id?: string
          indicator_type?: string
          score?: number | null
          source?: string | null
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "safety_indicators_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_places: {
        Row: {
          attraction_id: string | null
          created_at: string
          destination_id: string | null
          id: string
          user_id: string
        }
        Insert: {
          attraction_id?: string | null
          created_at?: string
          destination_id?: string | null
          id?: string
          user_id: string
        }
        Update: {
          attraction_id?: string | null
          created_at?: string
          destination_id?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_places_attraction_id_fkey"
            columns: ["attraction_id"]
            isOneToOne: false
            referencedRelation: "attractions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_places_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
        ]
      }
      state_culture_heritage: {
        Row: {
          administrative_type: string
          capital: string | null
          created_at: string
          cuisine_summary: string | null
          culture_summary: string | null
          festivals_summary: string | null
          geography_context: string | null
          handicrafts_summary: string | null
          id: string
          source_document: string
          state_or_ut: string
          updated_at: string
          verification_status: string
        }
        Insert: {
          administrative_type: string
          capital?: string | null
          created_at?: string
          cuisine_summary?: string | null
          culture_summary?: string | null
          festivals_summary?: string | null
          geography_context?: string | null
          handicrafts_summary?: string | null
          id?: string
          source_document?: string
          state_or_ut: string
          updated_at?: string
          verification_status?: string
        }
        Update: {
          administrative_type?: string
          capital?: string | null
          created_at?: string
          cuisine_summary?: string | null
          culture_summary?: string | null
          festivals_summary?: string | null
          geography_context?: string | null
          handicrafts_summary?: string | null
          id?: string
          source_document?: string
          state_or_ut?: string
          updated_at?: string
          verification_status?: string
        }
        Relationships: []
      }
      state_women_safety_index: {
        Row: {
          administrative_type: string
          created_at: string
          id: string
          metric_name: string
          score: number
          source_document: string
          state_or_ut: string
          updated_at: string
          verification_status: string
        }
        Insert: {
          administrative_type: string
          created_at?: string
          id?: string
          metric_name?: string
          score: number
          source_document?: string
          state_or_ut: string
          updated_at?: string
          verification_status?: string
        }
        Update: {
          administrative_type?: string
          created_at?: string
          id?: string
          metric_name?: string
          score?: number
          source_document?: string
          state_or_ut?: string
          updated_at?: string
          verification_status?: string
        }
        Relationships: []
      }
      tourist_profiles: {
        Row: {
          age_group: string | null
          budget_range: string | null
          created_at: string
          elderly_traveller: boolean | null
          family_group: boolean | null
          mobility_needs: string[] | null
          safety_preferences: string[] | null
          solo_traveller: boolean | null
          travel_style: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          age_group?: string | null
          budget_range?: string | null
          created_at?: string
          elderly_traveller?: boolean | null
          family_group?: boolean | null
          mobility_needs?: string[] | null
          safety_preferences?: string[] | null
          solo_traveller?: boolean | null
          travel_style?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          age_group?: string | null
          budget_range?: string | null
          created_at?: string
          elderly_traveller?: boolean | null
          family_group?: boolean | null
          mobility_needs?: string[] | null
          safety_preferences?: string[] | null
          solo_traveller?: boolean | null
          travel_style?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      translation_messages: {
        Row: {
          confidence: number | null
          created_at: string
          id: string
          input_language: string
          input_text: string
          provider: string | null
          session_id: string
          speaker: string
          translated_text: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          id?: string
          input_language: string
          input_text: string
          provider?: string | null
          session_id: string
          speaker: string
          translated_text: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          id?: string
          input_language?: string
          input_text?: string
          provider?: string | null
          session_id?: string
          speaker?: string
          translated_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "translation_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "translation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      translation_sessions: {
        Row: {
          ended_at: string | null
          id: string
          mode: string
          source_language: string
          started_at: string
          status: string | null
          target_language: string
          user_id: string | null
        }
        Insert: {
          ended_at?: string | null
          id?: string
          mode: string
          source_language: string
          started_at?: string
          status?: string | null
          target_language: string
          user_id?: string | null
        }
        Update: {
          ended_at?: string | null
          id?: string
          mode?: string
          source_language?: string
          started_at?: string
          status?: string | null
          target_language?: string
          user_id?: string | null
        }
        Relationships: []
      }
      transport_connectivity: {
        Row: {
          airport_distance_km: number | null
          bus_distance_km: number | null
          destination_id: string
          estimated_travel_time: string | null
          highway_access: string | null
          id: string
          nearest_airport: string | null
          nearest_bus: string | null
          nearest_railway: string | null
          railway_distance_km: number | null
          source: string | null
          source_url: string | null
          verification_status: string | null
        }
        Insert: {
          airport_distance_km?: number | null
          bus_distance_km?: number | null
          destination_id: string
          estimated_travel_time?: string | null
          highway_access?: string | null
          id?: string
          nearest_airport?: string | null
          nearest_bus?: string | null
          nearest_railway?: string | null
          railway_distance_km?: number | null
          source?: string | null
          source_url?: string | null
          verification_status?: string | null
        }
        Update: {
          airport_distance_km?: number | null
          bus_distance_km?: number | null
          destination_id?: string
          estimated_travel_time?: string | null
          highway_access?: string | null
          id?: string
          nearest_airport?: string | null
          nearest_bus?: string | null
          nearest_railway?: string | null
          railway_distance_km?: number | null
          source?: string | null
          source_url?: string | null
          verification_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transport_connectivity_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: true
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_preferences: {
        Row: {
          accessibility_needs: string[] | null
          budget_max: number | null
          budget_min: number | null
          created_at: string
          id: string
          interests: string[] | null
          preferred_trip_days: number | null
          safety_priority: boolean | null
          user_id: string
        }
        Insert: {
          accessibility_needs?: string[] | null
          budget_max?: number | null
          budget_min?: number | null
          created_at?: string
          id?: string
          interests?: string[] | null
          preferred_trip_days?: number | null
          safety_priority?: boolean | null
          user_id: string
        }
        Update: {
          accessibility_needs?: string[] | null
          budget_max?: number | null
          budget_min?: number | null
          created_at?: string
          id?: string
          interests?: string[] | null
          preferred_trip_days?: number | null
          safety_priority?: boolean | null
          user_id?: string
        }
        Relationships: []
      }
      trips: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          name: string
          start_date: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          name: string
          start_date?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          name?: string
          start_date?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      users_profile: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          preferred_language: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          preferred_language?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          preferred_language?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      visitor_counts: {
        Row: {
          destination_id: string | null
          domestic_visitors: number | null
          foreign_visitors: number | null
          id: string
          month: number | null
          source: string | null
          source_url: string | null
          state: string | null
          verification_status: string | null
          year: number
        }
        Insert: {
          destination_id?: string | null
          domestic_visitors?: number | null
          foreign_visitors?: number | null
          id?: string
          month?: number | null
          source?: string | null
          source_url?: string | null
          state?: string | null
          verification_status?: string | null
          year: number
        }
        Update: {
          destination_id?: string | null
          domestic_visitors?: number | null
          foreign_visitors?: number | null
          id?: string
          month?: number | null
          source?: string | null
          source_url?: string | null
          state?: string | null
          verification_status?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "visitor_counts_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
        ]
      }
      weather_cache: {
        Row: {
          destination_id: string
          feels_like: number | null
          fetched_at: string
          humidity: number | null
          id: string
          observed_at: string
          precipitation: number | null
          rain_probability: number | null
          source: string | null
          source_url: string | null
          temperature: number | null
          wind_direction: number | null
          wind_speed: number | null
        }
        Insert: {
          destination_id: string
          feels_like?: number | null
          fetched_at?: string
          humidity?: number | null
          id?: string
          observed_at: string
          precipitation?: number | null
          rain_probability?: number | null
          source?: string | null
          source_url?: string | null
          temperature?: number | null
          wind_direction?: number | null
          wind_speed?: number | null
        }
        Update: {
          destination_id?: string
          feels_like?: number | null
          fetched_at?: string
          humidity?: number | null
          id?: string
          observed_at?: string
          precipitation?: number | null
          rain_probability?: number | null
          source?: string | null
          source_url?: string | null
          temperature?: number | null
          wind_direction?: number | null
          wind_speed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "weather_cache_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
        ]
      }
      women_safety: {
        Row: {
          destination_id: string
          id: string
          last_verified: string | null
          medical_facility: string | null
          source: string | null
          source_url: string | null
          verification_status: string | null
          women_helpline: string | null
          women_police: string | null
          women_support_center: string | null
        }
        Insert: {
          destination_id: string
          id?: string
          last_verified?: string | null
          medical_facility?: string | null
          source?: string | null
          source_url?: string | null
          verification_status?: string | null
          women_helpline?: string | null
          women_police?: string | null
          women_support_center?: string | null
        }
        Update: {
          destination_id?: string
          id?: string
          last_verified?: string | null
          medical_facility?: string | null
          source?: string | null
          source_url?: string | null
          verification_status?: string | null
          women_helpline?: string | null
          women_police?: string | null
          women_support_center?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "women_safety_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: true
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
    Enums: {},
  },
} as const

// Table specific helper aliases
export type DestinationRow = Database["public"]["Tables"]["destinations"]["Row"];
export type DestinationInsert = Database["public"]["Tables"]["destinations"]["Insert"];
export type DestinationUpdate = Database["public"]["Tables"]["destinations"]["Update"];
export type AttractionRow = Database["public"]["Tables"]["attractions"]["Row"];
export type ExperienceRow = Database["public"]["Tables"]["experiences"]["Row"];
export type ImageRow = Database["public"]["Tables"]["images"]["Row"];
export type LanguageRow = Database["public"]["Tables"]["languages"]["Row"];
export type EmergencyResourceRow = Database["public"]["Tables"]["emergency_resources"]["Row"];
export type LocalBusinessRow = Database["public"]["Tables"]["local_businesses"]["Row"];
export type SafetyIndicatorRow = Database["public"]["Tables"]["safety_indicators"]["Row"];
export type SafetyAlertRow = Database["public"]["Tables"]["safety_alerts"]["Row"];
export type SafetyIncidentRow = Database["public"]["Tables"]["safety_incidents"]["Row"];
export type WomenSafetyRow = Database["public"]["Tables"]["women_safety"]["Row"];
export type UserProfileRow = Database["public"]["Tables"]["users_profile"]["Row"];
export type TouristProfileRow = Database["public"]["Tables"]["tourist_profiles"]["Row"];
export type OpeningHoursRow = Database["public"]["Tables"]["opening_hours"]["Row"];
export type EntryFeesRow = Database["public"]["Tables"]["entry_fees"]["Row"];
export type AccessibilityRow = Database["public"]["Tables"]["accessibility"]["Row"];
export type ElderlySupportRow = Database["public"]["Tables"]["elderly_support"]["Row"];
export type TripRow = Database["public"]["Tables"]["trips"]["Row"];
export type TripInsert = Database["public"]["Tables"]["trips"]["Insert"];
export type TripUpdate = Database["public"]["Tables"]["trips"]["Update"];

export type ItineraryItemRow = Database["public"]["Tables"]["itinerary_items"]["Row"];
export type ItineraryItemInsert = Database["public"]["Tables"]["itinerary_items"]["Insert"];
export type ItineraryItemUpdate = Database["public"]["Tables"]["itinerary_items"]["Update"];

export type SavedPlaceRow = Database["public"]["Tables"]["saved_places"]["Row"];
export type SavedPlaceInsert = Database["public"]["Tables"]["saved_places"]["Insert"];
export type SavedPlaceUpdate = Database["public"]["Tables"]["saved_places"]["Update"];

export type TravelPreferenceRow = Database["public"]["Tables"]["travel_preferences"]["Row"];
export type TravelPreferenceInsert = Database["public"]["Tables"]["travel_preferences"]["Insert"];
export type TravelPreferenceUpdate = Database["public"]["Tables"]["travel_preferences"]["Update"];

export type TouristProfileInsert = Database["public"]["Tables"]["tourist_profiles"]["Insert"];
export type TouristProfileUpdate = Database["public"]["Tables"]["tourist_profiles"]["Update"];

export type AuditLogRow = Database["public"]["Tables"]["audit_logs"]["Row"];
