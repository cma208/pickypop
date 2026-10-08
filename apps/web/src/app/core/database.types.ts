
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "accounts": {
                  Row: {
                    "active": boolean,"created_at": string,"created_by": string | null,"default_payment_method": Database["public"]['Enums']["payment_method"] | null,"id": string,"kind": Database["public"]['Enums']["account_kind"],"name": string,"note": string | null,"opening_balance": number,"opening_balance_on": string,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"default_payment_method"?: Database["public"]['Enums']["payment_method"] | null,"id"?: string,"kind"?: Database["public"]['Enums']["account_kind"],"name": string,"note"?: string | null,"opening_balance"?: number,"opening_balance_on"?: string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"default_payment_method"?: Database["public"]['Enums']["payment_method"] | null,"id"?: string,"kind"?: Database["public"]['Enums']["account_kind"],"name"?: string,"note"?: string | null,"opening_balance"?: number,"opening_balance_on"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "accounts_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"assets": {
                  Row: {
                    "acquired_on": string | null,"cost": number,"created_at": string,"id": string,"name": string,"note": string | null,"updated_at": string,"useful_life_hours": number,"workspace_id": string
                  }
                  Insert: {
                    "acquired_on"?: string | null,"cost"?: number,"created_at"?: string,"id"?: string,"name": string,"note"?: string | null,"updated_at"?: string,"useful_life_hours"?: number,"workspace_id": string
                  }
                  Update: {
                    "acquired_on"?: string | null,"cost"?: number,"created_at"?: string,"id"?: string,"name"?: string,"note"?: string | null,"updated_at"?: string,"useful_life_hours"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "assets_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"brands": {
                  Row: {
                    "active": boolean,"created_at": string,"id": string,"name": string,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"name": string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"name"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "brands_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"catalog_products": {
                  Row: {
                    "bot_visible": boolean,"category": string | null,"created_at": string,"created_by": string | null,"description": string | null,"id": string,"image_path": string | null,"lead_time_days": number | null,"name": string,"slug": string,"specs": NonNullable<Json>,"status": Database["public"]['Enums']["product_status"],"tags": (string)[],"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "bot_visible"?: boolean,"category"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"id"?: string,"image_path"?: string | null,"lead_time_days"?: number | null,"name": string,"slug": string,"specs"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["product_status"],"tags"?: (string)[],"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "bot_visible"?: boolean,"category"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"id"?: string,"image_path"?: string | null,"lead_time_days"?: number | null,"name"?: string,"slug"?: string,"specs"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["product_status"],"tags"?: (string)[],"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "catalog_products_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"cost_profiles": {
                  Row: {
                    "created_at": string,"created_by": string | null,"energy_rate_per_kwh": number,"failure_rate": number,"id": string,"igv_rate": number,"labor_rate_per_hour": number,"material_valuation": Database["public"]['Enums']["material_valuation"],"material_waste_rate": number,"min_order_price": number,"note": string | null,"rounding_step": number,"target_margin": number,"updated_at": string,"valid_from": string,"workspace_id": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"energy_rate_per_kwh": number,"failure_rate"?: number,"id"?: string,"igv_rate"?: number,"labor_rate_per_hour": number,"material_valuation"?: Database["public"]['Enums']["material_valuation"],"material_waste_rate"?: number,"min_order_price"?: number,"note"?: string | null,"rounding_step"?: number,"target_margin": number,"updated_at"?: string,"valid_from"?: string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"energy_rate_per_kwh"?: number,"failure_rate"?: number,"id"?: string,"igv_rate"?: number,"labor_rate_per_hour"?: number,"material_valuation"?: Database["public"]['Enums']["material_valuation"],"material_waste_rate"?: number,"min_order_price"?: number,"note"?: string | null,"rounding_step"?: number,"target_margin"?: number,"updated_at"?: string,"valid_from"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cost_profiles_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"customers": {
                  Row: {
                    "active": boolean,"created_at": string,"doc_number": string | null,"doc_type": Database["public"]['Enums']["customer_doc_type"],"email": string | null,"id": string,"kind": Database["public"]['Enums']["customer_kind"],"name": string,"note": string | null,"phone": string | null,"updated_at": string,"walk_in": boolean,"workspace_id": string
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"doc_number"?: string | null,"doc_type"?: Database["public"]['Enums']["customer_doc_type"],"email"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["customer_kind"],"name": string,"note"?: string | null,"phone"?: string | null,"updated_at"?: string,"walk_in"?: boolean,"workspace_id": string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"doc_number"?: string | null,"doc_type"?: Database["public"]['Enums']["customer_doc_type"],"email"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["customer_kind"],"name"?: string,"note"?: string | null,"phone"?: string | null,"updated_at"?: string,"walk_in"?: boolean,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "customers_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"document_counters": {
                  Row: {
                    "doc_kind": string,"last_number": number,"workspace_id": string,"year": number
                  }
                  Insert: {
                    "doc_kind": string,"last_number"?: number,"workspace_id": string,"year": number
                  }
                  Update: {
                    "doc_kind"?: string,"last_number"?: number,"workspace_id"?: string,"year"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "document_counters_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"filament_finishes": {
                  Row: {
                    "abrasive": boolean,"active": boolean,"created_at": string,"id": string,"name": string,"note": string | null,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "abrasive"?: boolean,"active"?: boolean,"created_at"?: string,"id"?: string,"name": string,"note"?: string | null,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "abrasive"?: boolean,"active"?: boolean,"created_at"?: string,"id"?: string,"name"?: string,"note"?: string | null,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "filament_finishes_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"filament_skus": {
                  Row: {
                    "active": boolean,"brand_id": string,"color_hex": string | null,"color_name": string,"created_at": string,"diameter_mm": number,"finish": string | null,"finish_id": string | null,"id": string,"is_refill": boolean,"material_id": string,"min_stock_g": number,"net_weight_g": number,"replacement_cost_per_kg": number | null,"spool_tare_g": number | null,"tray_info_idx": string | null,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "active"?: boolean,"brand_id": string,"color_hex"?: string | null,"color_name": string,"created_at"?: string,"diameter_mm"?: number,"finish"?: string | null,"finish_id"?: string | null,"id"?: string,"is_refill"?: boolean,"material_id": string,"min_stock_g"?: number,"net_weight_g"?: number,"replacement_cost_per_kg"?: number | null,"spool_tare_g"?: number | null,"tray_info_idx"?: string | null,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "active"?: boolean,"brand_id"?: string,"color_hex"?: string | null,"color_name"?: string,"created_at"?: string,"diameter_mm"?: number,"finish"?: string | null,"finish_id"?: string | null,"id"?: string,"is_refill"?: boolean,"material_id"?: string,"min_stock_g"?: number,"net_weight_g"?: number,"replacement_cost_per_kg"?: number | null,"spool_tare_g"?: number | null,"tray_info_idx"?: string | null,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "filament_skus_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "filament_skus_finish_id_fkey"
      columns: ["finish_id"]
isOneToOne: false
      referencedRelation: "filament_finishes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "filament_skus_material_id_fkey"
      columns: ["material_id"]
isOneToOne: false
      referencedRelation: "materials"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "filament_skus_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"gift_categories": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"treatment": Database["public"]['Enums']["gift_treatment"],"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"treatment"?: Database["public"]['Enums']["gift_treatment"],"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"treatment"?: Database["public"]['Enums']["gift_treatment"],"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "gift_categories_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"incidents": {
                  Row: {
                    "cause": string | null,"cost": number,"created_at": string,"downtime_min": number | null,"fix": string | null,"id": string,"occurred_at": string,"print_job_id": string | null,"printer_id": string,"resolved_at": string | null,"symptom": string,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "cause"?: string | null,"cost"?: number,"created_at"?: string,"downtime_min"?: number | null,"fix"?: string | null,"id"?: string,"occurred_at"?: string,"print_job_id"?: string | null,"printer_id": string,"resolved_at"?: string | null,"symptom": string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "cause"?: string | null,"cost"?: number,"created_at"?: string,"downtime_min"?: number | null,"fix"?: string | null,"id"?: string,"occurred_at"?: string,"print_job_id"?: string | null,"printer_id"?: string,"resolved_at"?: string | null,"symptom"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "incidents_print_job_fkey"
      columns: ["print_job_id"]
isOneToOne: false
      referencedRelation: "print_jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "incidents_printer_id_fkey"
      columns: ["printer_id"]
isOneToOne: false
      referencedRelation: "printer_machine_rates"
      referencedColumns: ["printer_id"]
    },{
      foreignKeyName: "incidents_printer_id_fkey"
      columns: ["printer_id"]
isOneToOne: false
      referencedRelation: "printers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "incidents_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"inventory_items": {
                  Row: {
                    "active": boolean,"created_at": string,"id": string,"image_path": string | null,"kind": Database["public"]['Enums']["inventory_item_kind"],"min_stock": number,"name": string,"note": string | null,"perishable": boolean,"product_variant_id": string | null,"standard_cost": number | null,"unit": string,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"image_path"?: string | null,"kind": Database["public"]['Enums']["inventory_item_kind"],"min_stock"?: number,"name": string,"note"?: string | null,"perishable"?: boolean,"product_variant_id"?: string | null,"standard_cost"?: number | null,"unit"?: string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"image_path"?: string | null,"kind"?: Database["public"]['Enums']["inventory_item_kind"],"min_stock"?: number,"name"?: string,"note"?: string | null,"perishable"?: boolean,"product_variant_id"?: string | null,"standard_cost"?: number | null,"unit"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "inventory_items_product_variant_id_fkey"
      columns: ["product_variant_id"]
isOneToOne: false
      referencedRelation: "assembly_options"
      referencedColumns: ["variant_id"]
    },{
      foreignKeyName: "inventory_items_product_variant_id_fkey"
      columns: ["product_variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_items_product_variant_id_fkey"
      columns: ["product_variant_id"]
isOneToOne: false
      referencedRelation: "production_needs"
      referencedColumns: ["variant_id"]
    },{
      foreignKeyName: "inventory_items_product_variant_id_fkey"
      columns: ["product_variant_id"]
isOneToOne: false
      referencedRelation: "variant_available_colors"
      referencedColumns: ["variant_id"]
    },{
      foreignKeyName: "inventory_items_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"maintenance_logs": {
                  Row: {
                    "checklist_done": NonNullable<Json>,"cost": number,"created_at": string,"duration_min": number | null,"id": string,"note": string | null,"performed_at": string,"performed_by": string | null,"plan_id": string | null,"printer_hours_at": number,"printer_id": string,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "checklist_done"?: NonNullable<Json>,"cost"?: number,"created_at"?: string,"duration_min"?: number | null,"id"?: string,"note"?: string | null,"performed_at"?: string,"performed_by"?: string | null,"plan_id"?: string | null,"printer_hours_at"?: number,"printer_id": string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "checklist_done"?: NonNullable<Json>,"cost"?: number,"created_at"?: string,"duration_min"?: number | null,"id"?: string,"note"?: string | null,"performed_at"?: string,"performed_by"?: string | null,"plan_id"?: string | null,"printer_hours_at"?: number,"printer_id"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "maintenance_logs_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "maintenance_plans"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "maintenance_logs_printer_id_fkey"
      columns: ["printer_id"]
isOneToOne: false
      referencedRelation: "printer_machine_rates"
      referencedColumns: ["printer_id"]
    },{
      foreignKeyName: "maintenance_logs_printer_id_fkey"
      columns: ["printer_id"]
isOneToOne: false
      referencedRelation: "printers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "maintenance_logs_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"maintenance_plans": {
                  Row: {
                    "active": boolean,"checklist": NonNullable<Json>,"created_at": string,"every_days": number | null,"every_hours": number | null,"expected_parts": NonNullable<Json>,"id": string,"note": string | null,"printer_id": string,"task": string,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "active"?: boolean,"checklist"?: NonNullable<Json>,"created_at"?: string,"every_days"?: number | null,"every_hours"?: number | null,"expected_parts"?: NonNullable<Json>,"id"?: string,"note"?: string | null,"printer_id": string,"task": string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "active"?: boolean,"checklist"?: NonNullable<Json>,"created_at"?: string,"every_days"?: number | null,"every_hours"?: number | null,"expected_parts"?: NonNullable<Json>,"id"?: string,"note"?: string | null,"printer_id"?: string,"task"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "maintenance_plans_printer_id_fkey"
      columns: ["printer_id"]
isOneToOne: false
      referencedRelation: "printer_machine_rates"
      referencedColumns: ["printer_id"]
    },{
      foreignKeyName: "maintenance_plans_printer_id_fkey"
      columns: ["printer_id"]
isOneToOne: false
      referencedRelation: "printers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "maintenance_plans_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"materials": {
                  Row: {
                    "abrasive": boolean,"active": boolean,"code": string,"created_at": string,"density_g_cm3": number | null,"hygroscopic": boolean,"id": string,"note": string | null,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "abrasive"?: boolean,"active"?: boolean,"code": string,"created_at"?: string,"density_g_cm3"?: number | null,"hygroscopic"?: boolean,"id"?: string,"note"?: string | null,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "abrasive"?: boolean,"active"?: boolean,"code"?: string,"created_at"?: string,"density_g_cm3"?: number | null,"hygroscopic"?: boolean,"id"?: string,"note"?: string | null,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "materials_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"opportunities": {
                  Row: {
                    "blocked_at": string | null,"blocked_reason": string | null,"created_at": string,"created_by": string | null,"customer_id": string | null,"expected_close": string | null,"id": string,"note": string | null,"owner": string | null,"stage": Database["public"]['Enums']["opportunity_stage"],"title": string,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "blocked_at"?: string | null,"blocked_reason"?: string | null,"created_at"?: string,"created_by"?: string | null,"customer_id"?: string | null,"expected_close"?: string | null,"id"?: string,"note"?: string | null,"owner"?: string | null,"stage"?: Database["public"]['Enums']["opportunity_stage"],"title": string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "blocked_at"?: string | null,"blocked_reason"?: string | null,"created_at"?: string,"created_by"?: string | null,"customer_id"?: string | null,"expected_close"?: string | null,"id"?: string,"note"?: string | null,"owner"?: string | null,"stage"?: Database["public"]['Enums']["opportunity_stage"],"title"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "opportunities_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customer_history"
      referencedColumns: ["customer_id"]
    },{
      foreignKeyName: "opportunities_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "opportunities_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"opportunity_stage_history": {
                  Row: {
                    "changed_at": string,"changed_by": string | null,"from_stage": Database["public"]['Enums']["opportunity_stage"] | null,"id": string,"note": string | null,"opportunity_id": string,"to_stage": Database["public"]['Enums']["opportunity_stage"],"workspace_id": string
                  }
                  Insert: {
                    "changed_at"?: string,"changed_by"?: string | null,"from_stage"?: Database["public"]['Enums']["opportunity_stage"] | null,"id"?: string,"note"?: string | null,"opportunity_id": string,"to_stage": Database["public"]['Enums']["opportunity_stage"],"workspace_id": string
                  }
                  Update: {
                    "changed_at"?: string,"changed_by"?: string | null,"from_stage"?: Database["public"]['Enums']["opportunity_stage"] | null,"id"?: string,"note"?: string | null,"opportunity_id"?: string,"to_stage"?: Database["public"]['Enums']["opportunity_stage"],"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "opportunity_stage_history_opportunity_id_fkey"
      columns: ["opportunity_id"]
isOneToOne: false
      referencedRelation: "opportunities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "opportunity_stage_history_opportunity_id_fkey"
      columns: ["opportunity_id"]
isOneToOne: false
      referencedRelation: "opportunity_board"
      referencedColumns: ["opportunity_id"]
    },{
      foreignKeyName: "opportunity_stage_history_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"order_deliveries": {
                  Row: {
                    "created_at": string,"created_by": string | null,"delivered_at": string,"id": string,"note": string | null,"order_id": string,"workspace_id": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"delivered_at"?: string,"id"?: string,"note"?: string | null,"order_id": string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"delivered_at"?: string,"id"?: string,"note"?: string | null,"order_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_deliveries_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "order_payment_summary"
      referencedColumns: ["order_id"]
    },{
      foreignKeyName: "order_deliveries_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "order_production_summary"
      referencedColumns: ["order_id"]
    },{
      foreignKeyName: "order_deliveries_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_deliveries_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "receivables"
      referencedColumns: ["order_id"]
    },{
      foreignKeyName: "order_deliveries_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"order_delivery_lines": {
                  Row: {
                    "created_at": string,"delivery_id": string,"id": string,"order_line_id": string,"quantity": number,"unit_cost": number | null,"workspace_id": string
                  }
                  Insert: {
                    "created_at"?: string,"delivery_id": string,"id"?: string,"order_line_id": string,"quantity": number,"unit_cost"?: number | null,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"delivery_id"?: string,"id"?: string,"order_line_id"?: string,"quantity"?: number,"unit_cost"?: number | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_delivery_lines_delivery_id_fkey"
      columns: ["delivery_id"]
isOneToOne: false
      referencedRelation: "order_deliveries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_delivery_lines_order_line_id_fkey"
      columns: ["order_line_id"]
isOneToOne: false
      referencedRelation: "order_line_delivery_status"
      referencedColumns: ["order_line_id"]
    },{
      foreignKeyName: "order_delivery_lines_order_line_id_fkey"
      columns: ["order_line_id"]
isOneToOne: false
      referencedRelation: "order_lines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_delivery_lines_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"order_lines": {
                  Row: {
                    "created_at": string,"description": string,"estimated_unit_cost": number,"id": string,"line_total": number | null,"order_id": string,"position": number,"quantity": number,"quote_line_id": string | null,"unit_price": number,"updated_at": string,"variant_id": string | null,"workspace_id": string
                  }
                  Insert: {
                    "created_at"?: string,"description": string,"estimated_unit_cost"?: number,"id"?: string,"line_total"?: never,"order_id": string,"position"?: number,"quantity": number,"quote_line_id"?: string | null,"unit_price"?: number,"updated_at"?: string,"variant_id"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string,"estimated_unit_cost"?: number,"id"?: string,"line_total"?: never,"order_id"?: string,"position"?: number,"quantity"?: number,"quote_line_id"?: string | null,"unit_price"?: number,"updated_at"?: string,"variant_id"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_lines_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "order_payment_summary"
      referencedColumns: ["order_id"]
    },{
      foreignKeyName: "order_lines_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "order_production_summary"
      referencedColumns: ["order_id"]
    },{
      foreignKeyName: "order_lines_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_lines_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "receivables"
      referencedColumns: ["order_id"]
    },{
      foreignKeyName: "order_lines_quote_line_id_fkey"
      columns: ["quote_line_id"]
isOneToOne: false
      referencedRelation: "quote_lines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_lines_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "assembly_options"
      referencedColumns: ["variant_id"]
    },{
      foreignKeyName: "order_lines_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_lines_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "production_needs"
      referencedColumns: ["variant_id"]
    },{
      foreignKeyName: "order_lines_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "variant_available_colors"
      referencedColumns: ["variant_id"]
    },{
      foreignKeyName: "order_lines_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"order_priority_changes": {
                  Row: {
                    "changed_at": string,"changed_by": string | null,"from_priority_at": string,"id": string,"order_id": string,"passed_id": string,"passed_kind": string,"passed_label": string,"reason": string,"to_priority_at": string,"workspace_id": string
                  }
                  Insert: {
                    "changed_at"?: string,"changed_by"?: string | null,"from_priority_at": string,"id"?: string,"order_id": string,"passed_id": string,"passed_kind": string,"passed_label": string,"reason": string,"to_priority_at": string,"workspace_id": string
                  }
                  Update: {
                    "changed_at"?: string,"changed_by"?: string | null,"from_priority_at"?: string,"id"?: string,"order_id"?: string,"passed_id"?: string,"passed_kind"?: string,"passed_label"?: string,"reason"?: string,"to_priority_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_priority_changes_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "order_payment_summary"
      referencedColumns: ["order_id"]
    },{
      foreignKeyName: "order_priority_changes_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "order_production_summary"
      referencedColumns: ["order_id"]
    },{
      foreignKeyName: "order_priority_changes_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_priority_changes_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "receivables"
      referencedColumns: ["order_id"]
    },{
      foreignKeyName: "order_priority_changes_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"order_status_history": {
                  Row: {
                    "changed_at": string,"changed_by": string | null,"from_status": Database["public"]['Enums']["order_status"] | null,"id": string,"note": string | null,"order_id": string,"to_status": Database["public"]['Enums']["order_status"],"workspace_id": string
                  }
                  Insert: {
                    "changed_at"?: string,"changed_by"?: string | null,"from_status"?: Database["public"]['Enums']["order_status"] | null,"id"?: string,"note"?: string | null,"order_id": string,"to_status": Database["public"]['Enums']["order_status"],"workspace_id": string
                  }
                  Update: {
                    "changed_at"?: string,"changed_by"?: string | null,"from_status"?: Database["public"]['Enums']["order_status"] | null,"id"?: string,"note"?: string | null,"order_id"?: string,"to_status"?: Database["public"]['Enums']["order_status"],"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_status_history_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "order_payment_summary"
      referencedColumns: ["order_id"]
    },{
      foreignKeyName: "order_status_history_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "order_production_summary"
      referencedColumns: ["order_id"]
    },{
      foreignKeyName: "order_status_history_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_status_history_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "receivables"
      referencedColumns: ["order_id"]
    },{
      foreignKeyName: "order_status_history_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "channel_id": string | null,"created_at": string,"created_by": string | null,"customer_id": string | null,"due_date": string | null,"gift_category_id": string | null,"hold_until": string | null,"id": string,"note": string | null,"number": string,"opportunity_id": string | null,"ordered_on": string,"payment_status": Database["public"]['Enums']["order_payment_status"],"priority_at": string,"purpose": Database["public"]['Enums']["order_purpose"],"quick_sale_key": string | null,"quote_id": string | null,"recipient": string | null,"status": Database["public"]['Enums']["order_status"],"total": number,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "channel_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"customer_id"?: string | null,"due_date"?: string | null,"gift_category_id"?: string | null,"hold_until"?: string | null,"id"?: string,"note"?: string | null,"number": string,"opportunity_id"?: string | null,"ordered_on"?: string,"payment_status"?: Database["public"]['Enums']["order_payment_status"],"priority_at"?: string,"purpose"?: Database["public"]['Enums']["order_purpose"],"quick_sale_key"?: string | null,"quote_id"?: string | null,"recipient"?: string | null,"status"?: Database["public"]['Enums']["order_status"],"total"?: number,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "channel_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"customer_id"?: string | null,"due_date"?: string | null,"gift_category_id"?: string | null,"hold_until"?: string | null,"id"?: string,"note"?: string | null,"number"?: string,"opportunity_id"?: string | null,"ordered_on"?: string,"payment_status"?: Database["public"]['Enums']["order_payment_status"],"priority_at"?: string,"purpose"?: Database["public"]['Enums']["order_purpose"],"quick_sale_key"?: string | null,"quote_id"?: string | null,"recipient"?: string | null,"status"?: Database["public"]['Enums']["order_status"],"total"?: number,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_channel_id_fkey"
      columns: ["channel_id"]
isOneToOne: false
      referencedRelation: "sales_channels"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customer_history"
      referencedColumns: ["customer_id"]
    },{
      foreignKeyName: "orders_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_gift_category_id_fkey"
      columns: ["gift_category_id"]
isOneToOne: false
      referencedRelation: "gift_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_opportunity_id_fkey"
      columns: ["opportunity_id"]
isOneToOne: false
      referencedRelation: "opportunities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_opportunity_id_fkey"
      columns: ["opportunity_id"]
isOneToOne: false
      referencedRelation: "opportunity_board"
      referencedColumns: ["opportunity_id"]
    },{
      foreignKeyName: "orders_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"price_tiers": {
                  Row: {
                    "created_at": string,"id": string,"min_quantity": number,"note": string | null,"unit_price": number,"updated_at": string,"valid_from": string,"variant_id": string,"workspace_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"min_quantity": number,"note"?: string | null,"unit_price": number,"updated_at"?: string,"valid_from"?: string,"variant_id": string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"min_quantity"?: number,"note"?: string | null,"unit_price"?: number,"updated_at"?: string,"valid_from"?: string,"variant_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "price_tiers_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "assembly_options"
      referencedColumns: ["variant_id"]
    },{
      foreignKeyName: "price_tiers_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "price_tiers_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "production_needs"
      referencedColumns: ["variant_id"]
    },{
      foreignKeyName: "price_tiers_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "variant_available_colors"
      referencedColumns: ["variant_id"]
    },{
      foreignKeyName: "price_tiers_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"print_job_filaments": {
                  Row: {
                    "actual_g": number | null,"created_at": string,"estimated_g": number,"id": string,"print_job_id": string,"slot": number | null,"spool_id": string,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "actual_g"?: number | null,"created_at"?: string,"estimated_g"?: number,"id"?: string,"print_job_id": string,"slot"?: number | null,"spool_id": string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "actual_g"?: number | null,"created_at"?: string,"estimated_g"?: number,"id"?: string,"print_job_id"?: string,"slot"?: number | null,"spool_id"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "print_job_filaments_print_job_id_fkey"
      columns: ["print_job_id"]
isOneToOne: false
      referencedRelation: "print_jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "print_job_filaments_spool_id_fkey"
      columns: ["spool_id"]
isOneToOne: false
      referencedRelation: "spool_balances"
      referencedColumns: ["spool_id"]
    },{
      foreignKeyName: "print_job_filaments_spool_id_fkey"
      columns: ["spool_id"]
isOneToOne: false
      referencedRelation: "spools"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "print_job_filaments_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"print_jobs": {
                  Row: {
                    "actual_time_s": number | null,"created_at": string,"created_by": string | null,"energy_cost": number | null,"estimated_time_s": number | null,"failure_cause": Database["public"]['Enums']["print_failure_cause"] | null,"finished_at": string | null,"id": string,"label": string | null,"machine_cost": number | null,"material_cost": number | null,"note": string | null,"order_line_id": string | null,"percent_complete": number | null,"printer_id": string,"recipe_plate_id": string | null,"slicer_metadata": NonNullable<Json>,"started_at": string | null,"status": Database["public"]['Enums']["print_job_status"],"units_produced": number,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "actual_time_s"?: number | null,"created_at"?: string,"created_by"?: string | null,"energy_cost"?: number | null,"estimated_time_s"?: number | null,"failure_cause"?: Database["public"]['Enums']["print_failure_cause"] | null,"finished_at"?: string | null,"id"?: string,"label"?: string | null,"machine_cost"?: number | null,"material_cost"?: number | null,"note"?: string | null,"order_line_id"?: string | null,"percent_complete"?: number | null,"printer_id": string,"recipe_plate_id"?: string | null,"slicer_metadata"?: NonNullable<Json>,"started_at"?: string | null,"status"?: Database["public"]['Enums']["print_job_status"],"units_produced"?: number,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "actual_time_s"?: number | null,"created_at"?: string,"created_by"?: string | null,"energy_cost"?: number | null,"estimated_time_s"?: number | null,"failure_cause"?: Database["public"]['Enums']["print_failure_cause"] | null,"finished_at"?: string | null,"id"?: string,"label"?: string | null,"machine_cost"?: number | null,"material_cost"?: number | null,"note"?: string | null,"order_line_id"?: string | null,"percent_complete"?: number | null,"printer_id"?: string,"recipe_plate_id"?: string | null,"slicer_metadata"?: NonNullable<Json>,"started_at"?: string | null,"status"?: Database["public"]['Enums']["print_job_status"],"units_produced"?: number,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "print_jobs_order_line_id_fkey"
      columns: ["order_line_id"]
isOneToOne: false
      referencedRelation: "order_line_delivery_status"
      referencedColumns: ["order_line_id"]
    },{
      foreignKeyName: "print_jobs_order_line_id_fkey"
      columns: ["order_line_id"]
isOneToOne: false
      referencedRelation: "order_lines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "print_jobs_printer_id_fkey"
      columns: ["printer_id"]
isOneToOne: false
      referencedRelation: "printer_machine_rates"
      referencedColumns: ["printer_id"]
    },{
      foreignKeyName: "print_jobs_printer_id_fkey"
      columns: ["printer_id"]
isOneToOne: false
      referencedRelation: "printers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "print_jobs_recipe_plate_id_fkey"
      columns: ["recipe_plate_id"]
isOneToOne: false
      referencedRelation: "recipe_plates"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "print_jobs_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"printer_components": {
                  Row: {
                    "created_at": string,"description": string | null,"hours_at_install": number,"id": string,"installed_on": string,"kind": Database["public"]['Enums']["component_kind"],"printer_id": string,"retired_on": string | null,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"hours_at_install"?: number,"id"?: string,"installed_on"?: string,"kind": Database["public"]['Enums']["component_kind"],"printer_id": string,"retired_on"?: string | null,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"hours_at_install"?: number,"id"?: string,"installed_on"?: string,"kind"?: Database["public"]['Enums']["component_kind"],"printer_id"?: string,"retired_on"?: string | null,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "printer_components_printer_id_fkey"
      columns: ["printer_id"]
isOneToOne: false
      referencedRelation: "printer_machine_rates"
      referencedColumns: ["printer_id"]
    },{
      foreignKeyName: "printer_components_printer_id_fkey"
      columns: ["printer_id"]
isOneToOne: false
      referencedRelation: "printers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "printer_components_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"printers": {
                  Row: {
                    "asset_id": string | null,"avg_power_w": number,"created_at": string,"expected_hours_per_year": number,"id": string,"initial_hours": number,"maintenance_budget_per_year": number,"model": string | null,"name": string,"note": string | null,"serial": string | null,"status": Database["public"]['Enums']["printer_status"],"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "asset_id"?: string | null,"avg_power_w"?: number,"created_at"?: string,"expected_hours_per_year"?: number,"id"?: string,"initial_hours"?: number,"maintenance_budget_per_year"?: number,"model"?: string | null,"name": string,"note"?: string | null,"serial"?: string | null,"status"?: Database["public"]['Enums']["printer_status"],"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "asset_id"?: string | null,"avg_power_w"?: number,"created_at"?: string,"expected_hours_per_year"?: number,"id"?: string,"initial_hours"?: number,"maintenance_budget_per_year"?: number,"model"?: string | null,"name"?: string,"note"?: string | null,"serial"?: string | null,"status"?: Database["public"]['Enums']["printer_status"],"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "printers_asset_id_fkey"
      columns: ["asset_id"]
isOneToOne: false
      referencedRelation: "assets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "printers_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"product_media": {
                  Row: {
                    "alt_text": string | null,"created_at": string,"id": string,"product_id": string,"sort_order": number,"storage_path": string,"variant_id": string | null,"workspace_id": string
                  }
                  Insert: {
                    "alt_text"?: string | null,"created_at"?: string,"id"?: string,"product_id": string,"sort_order"?: number,"storage_path": string,"variant_id"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "alt_text"?: string | null,"created_at"?: string,"id"?: string,"product_id"?: string,"sort_order"?: number,"storage_path"?: string,"variant_id"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_media_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "catalog_products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_media_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "assembly_options"
      referencedColumns: ["variant_id"]
    },{
      foreignKeyName: "product_media_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_media_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "production_needs"
      referencedColumns: ["variant_id"]
    },{
      foreignKeyName: "product_media_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "variant_available_colors"
      referencedColumns: ["variant_id"]
    },{
      foreignKeyName: "product_media_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"product_variants": {
                  Row: {
                    "active": boolean,"created_at": string,"id": string,"image_path": string | null,"list_price": number | null,"min_order_units": number | null,"name": string,"options": NonNullable<Json>,"product_id": string,"sku_code": string | null,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"image_path"?: string | null,"list_price"?: number | null,"min_order_units"?: number | null,"name": string,"options"?: NonNullable<Json>,"product_id": string,"sku_code"?: string | null,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"image_path"?: string | null,"list_price"?: number | null,"min_order_units"?: number | null,"name"?: string,"options"?: NonNullable<Json>,"product_id"?: string,"sku_code"?: string | null,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_variants_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "catalog_products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_variants_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"purchase_lines": {
                  Row: {
                    "allocated_extra_cost": number,"created_at": string,"description": string | null,"expires_on": string | null,"filament_sku_id": string | null,"id": string,"inventory_item_id": string | null,"purchase_id": string,"quantity": number,"unit_price": number,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "allocated_extra_cost"?: number,"created_at"?: string,"description"?: string | null,"expires_on"?: string | null,"filament_sku_id"?: string | null,"id"?: string,"inventory_item_id"?: string | null,"purchase_id": string,"quantity": number,"unit_price": number,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "allocated_extra_cost"?: number,"created_at"?: string,"description"?: string | null,"expires_on"?: string | null,"filament_sku_id"?: string | null,"id"?: string,"inventory_item_id"?: string | null,"purchase_id"?: string,"quantity"?: number,"unit_price"?: number,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "purchase_lines_filament_sku_id_fkey"
      columns: ["filament_sku_id"]
isOneToOne: false
      referencedRelation: "filament_sku_details"
      referencedColumns: ["filament_sku_id"]
    },{
      foreignKeyName: "purchase_lines_filament_sku_id_fkey"
      columns: ["filament_sku_id"]
isOneToOne: false
      referencedRelation: "filament_sku_stock"
      referencedColumns: ["filament_sku_id"]
    },{
      foreignKeyName: "purchase_lines_filament_sku_id_fkey"
      columns: ["filament_sku_id"]
isOneToOne: false
      referencedRelation: "filament_skus"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_lines_filament_sku_id_fkey"
      columns: ["filament_sku_id"]
isOneToOne: false
      referencedRelation: "variant_available_colors"
      referencedColumns: ["filament_sku_id"]
    },{
      foreignKeyName: "purchase_lines_inventory_item_id_fkey"
      columns: ["inventory_item_id"]
isOneToOne: false
      referencedRelation: "assembly_components"
      referencedColumns: ["inventory_item_id"]
    },{
      foreignKeyName: "purchase_lines_inventory_item_id_fkey"
      columns: ["inventory_item_id"]
isOneToOne: false
      referencedRelation: "inventory_balances"
      referencedColumns: ["inventory_item_id"]
    },{
      foreignKeyName: "purchase_lines_inventory_item_id_fkey"
      columns: ["inventory_item_id"]
isOneToOne: false
      referencedRelation: "inventory_item_costs"
      referencedColumns: ["inventory_item_id"]
    },{
      foreignKeyName: "purchase_lines_inventory_item_id_fkey"
      columns: ["inventory_item_id"]
isOneToOne: false
      referencedRelation: "inventory_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_lines_inventory_item_id_fkey"
      columns: ["inventory_item_id"]
isOneToOne: false
      referencedRelation: "part_stock"
      referencedColumns: ["inventory_item_id"]
    },{
      foreignKeyName: "purchase_lines_purchase_id_fkey"
      columns: ["purchase_id"]
isOneToOne: false
      referencedRelation: "purchase_payment_status"
      referencedColumns: ["purchase_id"]
    },{
      foreignKeyName: "purchase_lines_purchase_id_fkey"
      columns: ["purchase_id"]
isOneToOne: false
      referencedRelation: "purchases"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_lines_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"purchases": {
                  Row: {
                    "allocation": Database["public"]['Enums']["cost_allocation"],"created_at": string,"created_by": string | null,"document_ref": string | null,"id": string,"note": string | null,"other_costs": number,"purchased_at": string,"shipping_cost": number,"supplier_id": string | null,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "allocation"?: Database["public"]['Enums']["cost_allocation"],"created_at"?: string,"created_by"?: string | null,"document_ref"?: string | null,"id"?: string,"note"?: string | null,"other_costs"?: number,"purchased_at"?: string,"shipping_cost"?: number,"supplier_id"?: string | null,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "allocation"?: Database["public"]['Enums']["cost_allocation"],"created_at"?: string,"created_by"?: string | null,"document_ref"?: string | null,"id"?: string,"note"?: string | null,"other_costs"?: number,"purchased_at"?: string,"shipping_cost"?: number,"supplier_id"?: string | null,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "purchases_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchases_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"quote_lines": {
                  Row: {
                    "created_at": string,"description": string,"id": string,"items": NonNullable<Json>,"kind": Database["public"]['Enums']["quote_line_kind"],"line_total": number | null,"minutes_per_unit": number,"plates": NonNullable<Json>,"position": number,"quantity": number,"quote_id": string,"setup_minutes": number,"unit_cost": number,"unit_price": number,"updated_at": string,"variant_id": string | null,"workspace_id": string
                  }
                  Insert: {
                    "created_at"?: string,"description": string,"id"?: string,"items"?: NonNullable<Json>,"kind"?: Database["public"]['Enums']["quote_line_kind"],"line_total"?: never,"minutes_per_unit"?: number,"plates"?: NonNullable<Json>,"position"?: number,"quantity": number,"quote_id": string,"setup_minutes"?: number,"unit_cost"?: number,"unit_price"?: number,"updated_at"?: string,"variant_id"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string,"id"?: string,"items"?: NonNullable<Json>,"kind"?: Database["public"]['Enums']["quote_line_kind"],"line_total"?: never,"minutes_per_unit"?: number,"plates"?: NonNullable<Json>,"position"?: number,"quantity"?: number,"quote_id"?: string,"setup_minutes"?: number,"unit_cost"?: number,"unit_price"?: number,"updated_at"?: string,"variant_id"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "quote_lines_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quote_lines_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "assembly_options"
      referencedColumns: ["variant_id"]
    },{
      foreignKeyName: "quote_lines_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quote_lines_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "production_needs"
      referencedColumns: ["variant_id"]
    },{
      foreignKeyName: "quote_lines_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "variant_available_colors"
      referencedColumns: ["variant_id"]
    },{
      foreignKeyName: "quote_lines_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"quote_requests": {
                  Row: {
                    "attachments": NonNullable<Json>,"channel_id": string | null,"contact": string | null,"created_at": string,"customer_id": string | null,"description": string,"id": string,"status": Database["public"]['Enums']["request_status"],"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "attachments"?: NonNullable<Json>,"channel_id"?: string | null,"contact"?: string | null,"created_at"?: string,"customer_id"?: string | null,"description": string,"id"?: string,"status"?: Database["public"]['Enums']["request_status"],"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "attachments"?: NonNullable<Json>,"channel_id"?: string | null,"contact"?: string | null,"created_at"?: string,"customer_id"?: string | null,"description"?: string,"id"?: string,"status"?: Database["public"]['Enums']["request_status"],"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "quote_requests_channel_id_fkey"
      columns: ["channel_id"]
isOneToOne: false
      referencedRelation: "sales_channels"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quote_requests_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customer_history"
      referencedColumns: ["customer_id"]
    },{
      foreignKeyName: "quote_requests_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quote_requests_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"quotes": {
                  Row: {
                    "channel_id": string | null,"cost_profile_snapshot": NonNullable<Json>,"created_at": string,"created_by": string | null,"customer_id": string | null,"discount": number,"held_at": string | null,"hold_until": string | null,"id": string,"igv": number,"issued_on": string,"note": string | null,"number": string,"opportunity_id": string | null,"parent_quote_id": string | null,"request_id": string | null,"status": Database["public"]['Enums']["quote_status"],"subtotal": number,"total": number,"updated_at": string,"valid_until": string | null,"version": number,"workspace_id": string
                  }
                  Insert: {
                    "channel_id"?: string | null,"cost_profile_snapshot"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"customer_id"?: string | null,"discount"?: number,"held_at"?: string | null,"hold_until"?: string | null,"id"?: string,"igv"?: number,"issued_on"?: string,"note"?: string | null,"number": string,"opportunity_id"?: string | null,"parent_quote_id"?: string | null,"request_id"?: string | null,"status"?: Database["public"]['Enums']["quote_status"],"subtotal"?: number,"total"?: number,"updated_at"?: string,"valid_until"?: string | null,"version"?: number,"workspace_id": string
                  }
                  Update: {
                    "channel_id"?: string | null,"cost_profile_snapshot"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"customer_id"?: string | null,"discount"?: number,"held_at"?: string | null,"hold_until"?: string | null,"id"?: string,"igv"?: number,"issued_on"?: string,"note"?: string | null,"number"?: string,"opportunity_id"?: string | null,"parent_quote_id"?: string | null,"request_id"?: string | null,"status"?: Database["public"]['Enums']["quote_status"],"subtotal"?: number,"total"?: number,"updated_at"?: string,"valid_until"?: string | null,"version"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "quotes_channel_id_fkey"
      columns: ["channel_id"]
isOneToOne: false
      referencedRelation: "sales_channels"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quotes_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customer_history"
      referencedColumns: ["customer_id"]
    },{
      foreignKeyName: "quotes_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quotes_opportunity_id_fkey"
      columns: ["opportunity_id"]
isOneToOne: false
      referencedRelation: "opportunities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quotes_opportunity_id_fkey"
      columns: ["opportunity_id"]
isOneToOne: false
      referencedRelation: "opportunity_board"
      referencedColumns: ["opportunity_id"]
    },{
      foreignKeyName: "quotes_parent_quote_id_fkey"
      columns: ["parent_quote_id"]
isOneToOne: false
      referencedRelation: "quotes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quotes_request_id_fkey"
      columns: ["request_id"]
isOneToOne: false
      referencedRelation: "quote_requests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quotes_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"recipe_items": {
                  Row: {
                    "created_at": string,"id": string,"inventory_item_id": string,"quantity_per_unit": number,"recipe_id": string,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"inventory_item_id": string,"quantity_per_unit": number,"recipe_id": string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"inventory_item_id"?: string,"quantity_per_unit"?: number,"recipe_id"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_items_inventory_item_id_fkey"
      columns: ["inventory_item_id"]
isOneToOne: false
      referencedRelation: "assembly_components"
      referencedColumns: ["inventory_item_id"]
    },{
      foreignKeyName: "recipe_items_inventory_item_id_fkey"
      columns: ["inventory_item_id"]
isOneToOne: false
      referencedRelation: "inventory_balances"
      referencedColumns: ["inventory_item_id"]
    },{
      foreignKeyName: "recipe_items_inventory_item_id_fkey"
      columns: ["inventory_item_id"]
isOneToOne: false
      referencedRelation: "inventory_item_costs"
      referencedColumns: ["inventory_item_id"]
    },{
      foreignKeyName: "recipe_items_inventory_item_id_fkey"
      columns: ["inventory_item_id"]
isOneToOne: false
      referencedRelation: "inventory_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipe_items_inventory_item_id_fkey"
      columns: ["inventory_item_id"]
isOneToOne: false
      referencedRelation: "part_stock"
      referencedColumns: ["inventory_item_id"]
    },{
      foreignKeyName: "recipe_items_recipe_id_fkey"
      columns: ["recipe_id"]
isOneToOne: false
      referencedRelation: "assembly_options"
      referencedColumns: ["recipe_id"]
    },{
      foreignKeyName: "recipe_items_recipe_id_fkey"
      columns: ["recipe_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipe_items_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"recipe_plate_filaments": {
                  Row: {
                    "color_hex": string | null,"created_at": string,"filament_sku_id": string | null,"grams": number,"id": string,"material_id": string | null,"recipe_plate_id": string,"slot": number,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "color_hex"?: string | null,"created_at"?: string,"filament_sku_id"?: string | null,"grams": number,"id"?: string,"material_id"?: string | null,"recipe_plate_id": string,"slot": number,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "color_hex"?: string | null,"created_at"?: string,"filament_sku_id"?: string | null,"grams"?: number,"id"?: string,"material_id"?: string | null,"recipe_plate_id"?: string,"slot"?: number,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_plate_filaments_filament_sku_id_fkey"
      columns: ["filament_sku_id"]
isOneToOne: false
      referencedRelation: "filament_sku_details"
      referencedColumns: ["filament_sku_id"]
    },{
      foreignKeyName: "recipe_plate_filaments_filament_sku_id_fkey"
      columns: ["filament_sku_id"]
isOneToOne: false
      referencedRelation: "filament_sku_stock"
      referencedColumns: ["filament_sku_id"]
    },{
      foreignKeyName: "recipe_plate_filaments_filament_sku_id_fkey"
      columns: ["filament_sku_id"]
isOneToOne: false
      referencedRelation: "filament_skus"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipe_plate_filaments_filament_sku_id_fkey"
      columns: ["filament_sku_id"]
isOneToOne: false
      referencedRelation: "variant_available_colors"
      referencedColumns: ["filament_sku_id"]
    },{
      foreignKeyName: "recipe_plate_filaments_material_id_fkey"
      columns: ["material_id"]
isOneToOne: false
      referencedRelation: "materials"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipe_plate_filaments_recipe_plate_id_fkey"
      columns: ["recipe_plate_id"]
isOneToOne: false
      referencedRelation: "recipe_plates"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipe_plate_filaments_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"recipe_plate_outputs": {
                  Row: {
                    "created_at": string,"id": string,"inventory_item_id": string,"position": number,"recipe_plate_id": string,"units_per_run": number,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"inventory_item_id": string,"position"?: number,"recipe_plate_id": string,"units_per_run": number,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"inventory_item_id"?: string,"position"?: number,"recipe_plate_id"?: string,"units_per_run"?: number,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_plate_outputs_inventory_item_id_fkey"
      columns: ["inventory_item_id"]
isOneToOne: false
      referencedRelation: "assembly_components"
      referencedColumns: ["inventory_item_id"]
    },{
      foreignKeyName: "recipe_plate_outputs_inventory_item_id_fkey"
      columns: ["inventory_item_id"]
isOneToOne: false
      referencedRelation: "inventory_balances"
      referencedColumns: ["inventory_item_id"]
    },{
      foreignKeyName: "recipe_plate_outputs_inventory_item_id_fkey"
      columns: ["inventory_item_id"]
isOneToOne: false
      referencedRelation: "inventory_item_costs"
      referencedColumns: ["inventory_item_id"]
    },{
      foreignKeyName: "recipe_plate_outputs_inventory_item_id_fkey"
      columns: ["inventory_item_id"]
isOneToOne: false
      referencedRelation: "inventory_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipe_plate_outputs_inventory_item_id_fkey"
      columns: ["inventory_item_id"]
isOneToOne: false
      referencedRelation: "part_stock"
      referencedColumns: ["inventory_item_id"]
    },{
      foreignKeyName: "recipe_plate_outputs_recipe_plate_id_fkey"
      columns: ["recipe_plate_id"]
isOneToOne: false
      referencedRelation: "recipe_plates"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipe_plate_outputs_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"recipe_plates": {
                  Row: {
                    "created_at": string,"id": string,"label": string | null,"plate_index": number,"print_time_s": number,"recipe_id": string,"slicer_metadata": NonNullable<Json>,"source_file_name": string | null,"thumbnail_path": string | null,"units_per_run": number,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"label"?: string | null,"plate_index"?: number,"print_time_s": number,"recipe_id": string,"slicer_metadata"?: NonNullable<Json>,"source_file_name"?: string | null,"thumbnail_path"?: string | null,"units_per_run": number,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"label"?: string | null,"plate_index"?: number,"print_time_s"?: number,"recipe_id"?: string,"slicer_metadata"?: NonNullable<Json>,"source_file_name"?: string | null,"thumbnail_path"?: string | null,"units_per_run"?: number,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_plates_recipe_id_fkey"
      columns: ["recipe_id"]
isOneToOne: false
      referencedRelation: "assembly_options"
      referencedColumns: ["recipe_id"]
    },{
      foreignKeyName: "recipe_plates_recipe_id_fkey"
      columns: ["recipe_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipe_plates_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"recipes": {
                  Row: {
                    "active": boolean,"assembled": boolean,"created_at": string,"id": string,"minutes_per_unit": number,"note": string | null,"setup_minutes": number,"updated_at": string,"valid_from": string,"variant_id": string,"version": number,"workspace_id": string
                  }
                  Insert: {
                    "active"?: boolean,"assembled"?: boolean,"created_at"?: string,"id"?: string,"minutes_per_unit"?: number,"note"?: string | null,"setup_minutes"?: number,"updated_at"?: string,"valid_from"?: string,"variant_id": string,"version"?: number,"workspace_id": string
                  }
                  Update: {
                    "active"?: boolean,"assembled"?: boolean,"created_at"?: string,"id"?: string,"minutes_per_unit"?: number,"note"?: string | null,"setup_minutes"?: number,"updated_at"?: string,"valid_from"?: string,"variant_id"?: string,"version"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipes_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "assembly_options"
      referencedColumns: ["variant_id"]
    },{
      foreignKeyName: "recipes_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipes_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "production_needs"
      referencedColumns: ["variant_id"]
    },{
      foreignKeyName: "recipes_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "variant_available_colors"
      referencedColumns: ["variant_id"]
    },{
      foreignKeyName: "recipes_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"sales_channels": {
                  Row: {
                    "active": boolean,"commission_rate": number,"created_at": string,"id": string,"name": string,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "active"?: boolean,"commission_rate"?: number,"created_at"?: string,"id"?: string,"name": string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "active"?: boolean,"commission_rate"?: number,"created_at"?: string,"id"?: string,"name"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sales_channels_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"spools": {
                  Row: {
                    "code": string | null,"cost_per_gram": number | null,"created_at": string,"filament_sku_id": string,"id": string,"initial_weight_g": number,"last_dried_at": string | null,"location": string | null,"note": string | null,"opened_at": string | null,"purchase_line_id": string | null,"status": Database["public"]['Enums']["spool_status"],"unit_cost": number,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "code"?: string | null,"cost_per_gram"?: never,"created_at"?: string,"filament_sku_id": string,"id"?: string,"initial_weight_g": number,"last_dried_at"?: string | null,"location"?: string | null,"note"?: string | null,"opened_at"?: string | null,"purchase_line_id"?: string | null,"status"?: Database["public"]['Enums']["spool_status"],"unit_cost": number,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "code"?: string | null,"cost_per_gram"?: never,"created_at"?: string,"filament_sku_id"?: string,"id"?: string,"initial_weight_g"?: number,"last_dried_at"?: string | null,"location"?: string | null,"note"?: string | null,"opened_at"?: string | null,"purchase_line_id"?: string | null,"status"?: Database["public"]['Enums']["spool_status"],"unit_cost"?: number,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "spools_filament_sku_id_fkey"
      columns: ["filament_sku_id"]
isOneToOne: false
      referencedRelation: "filament_sku_details"
      referencedColumns: ["filament_sku_id"]
    },{
      foreignKeyName: "spools_filament_sku_id_fkey"
      columns: ["filament_sku_id"]
isOneToOne: false
      referencedRelation: "filament_sku_stock"
      referencedColumns: ["filament_sku_id"]
    },{
      foreignKeyName: "spools_filament_sku_id_fkey"
      columns: ["filament_sku_id"]
isOneToOne: false
      referencedRelation: "filament_skus"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "spools_filament_sku_id_fkey"
      columns: ["filament_sku_id"]
isOneToOne: false
      referencedRelation: "variant_available_colors"
      referencedColumns: ["filament_sku_id"]
    },{
      foreignKeyName: "spools_purchase_line_id_fkey"
      columns: ["purchase_line_id"]
isOneToOne: false
      referencedRelation: "purchase_lines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "spools_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"stock_movements": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"inventory_item_id": string | null,"note": string | null,"occurred_at": string,"quantity": number,"source_id": string | null,"source_type": string | null,"spool_id": string | null,"type": Database["public"]['Enums']["stock_movement_type"],"unit_cost": number | null,"workspace_id": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"inventory_item_id"?: string | null,"note"?: string | null,"occurred_at"?: string,"quantity": number,"source_id"?: string | null,"source_type"?: string | null,"spool_id"?: string | null,"type": Database["public"]['Enums']["stock_movement_type"],"unit_cost"?: number | null,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"inventory_item_id"?: string | null,"note"?: string | null,"occurred_at"?: string,"quantity"?: number,"source_id"?: string | null,"source_type"?: string | null,"spool_id"?: string | null,"type"?: Database["public"]['Enums']["stock_movement_type"],"unit_cost"?: number | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_movements_inventory_item_id_fkey"
      columns: ["inventory_item_id"]
isOneToOne: false
      referencedRelation: "assembly_components"
      referencedColumns: ["inventory_item_id"]
    },{
      foreignKeyName: "stock_movements_inventory_item_id_fkey"
      columns: ["inventory_item_id"]
isOneToOne: false
      referencedRelation: "inventory_balances"
      referencedColumns: ["inventory_item_id"]
    },{
      foreignKeyName: "stock_movements_inventory_item_id_fkey"
      columns: ["inventory_item_id"]
isOneToOne: false
      referencedRelation: "inventory_item_costs"
      referencedColumns: ["inventory_item_id"]
    },{
      foreignKeyName: "stock_movements_inventory_item_id_fkey"
      columns: ["inventory_item_id"]
isOneToOne: false
      referencedRelation: "inventory_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_movements_inventory_item_id_fkey"
      columns: ["inventory_item_id"]
isOneToOne: false
      referencedRelation: "part_stock"
      referencedColumns: ["inventory_item_id"]
    },{
      foreignKeyName: "stock_movements_spool_id_fkey"
      columns: ["spool_id"]
isOneToOne: false
      referencedRelation: "spool_balances"
      referencedColumns: ["spool_id"]
    },{
      foreignKeyName: "stock_movements_spool_id_fkey"
      columns: ["spool_id"]
isOneToOne: false
      referencedRelation: "spools"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_movements_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"suppliers": {
                  Row: {
                    "contact": string | null,"created_at": string,"id": string,"lead_time_days": number | null,"name": string,"note": string | null,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "contact"?: string | null,"created_at"?: string,"id"?: string,"lead_time_days"?: number | null,"name": string,"note"?: string | null,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "contact"?: string | null,"created_at"?: string,"id"?: string,"lead_time_days"?: number | null,"name"?: string,"note"?: string | null,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "suppliers_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"transaction_categories": {
                  Row: {
                    "active": boolean,"created_at": string,"direction": Database["public"]['Enums']["transaction_direction"],"id": string,"name": string,"note": string | null,"sales": boolean,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"direction": Database["public"]['Enums']["transaction_direction"],"id"?: string,"name": string,"note"?: string | null,"sales"?: boolean,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"direction"?: Database["public"]['Enums']["transaction_direction"],"id"?: string,"name"?: string,"note"?: string | null,"sales"?: boolean,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "transaction_categories_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"transactions": {
                  Row: {
                    "account_id": string,"amount": number,"category_id": string | null,"counter_account_id": string | null,"counterparty": string | null,"created_at": string,"created_by": string | null,"expected_direction": Database["public"]['Enums']["transaction_direction"] | null,"id": string,"maintenance_log_id": string | null,"note": string | null,"occurred_at": string,"order_id": string | null,"payment_method": Database["public"]['Enums']["payment_method"],"purchase_id": string | null,"reference": string | null,"type": Database["public"]['Enums']["transaction_type"],"updated_at": string,"void_reason": string | null,"voided_at": string | null,"voided_by": string | null,"workspace_id": string
                  }
                  Insert: {
                    "account_id": string,"amount": number,"category_id"?: string | null,"counter_account_id"?: string | null,"counterparty"?: string | null,"created_at"?: string,"created_by"?: string | null,"expected_direction"?: never,"id"?: string,"maintenance_log_id"?: string | null,"note"?: string | null,"occurred_at"?: string,"order_id"?: string | null,"payment_method": Database["public"]['Enums']["payment_method"],"purchase_id"?: string | null,"reference"?: string | null,"type": Database["public"]['Enums']["transaction_type"],"updated_at"?: string,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "account_id"?: string,"amount"?: number,"category_id"?: string | null,"counter_account_id"?: string | null,"counterparty"?: string | null,"created_at"?: string,"created_by"?: string | null,"expected_direction"?: never,"id"?: string,"maintenance_log_id"?: string | null,"note"?: string | null,"occurred_at"?: string,"order_id"?: string | null,"payment_method"?: Database["public"]['Enums']["payment_method"],"purchase_id"?: string | null,"reference"?: string | null,"type"?: Database["public"]['Enums']["transaction_type"],"updated_at"?: string,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "transactions_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "account_balances"
      referencedColumns: ["account_id"]
    },{
      foreignKeyName: "transactions_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_account_id_workspace_id_fkey"
      columns: ["account_id","workspace_id"]
isOneToOne: false
      referencedRelation: "account_balances"
      referencedColumns: ["account_id","workspace_id"]
    },{
      foreignKeyName: "transactions_account_id_workspace_id_fkey"
      columns: ["account_id","workspace_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "transactions_category_id_expected_direction_fkey"
      columns: ["category_id","expected_direction"]
isOneToOne: false
      referencedRelation: "transaction_categories"
      referencedColumns: ["id","direction"]
    },{
      foreignKeyName: "transactions_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "transaction_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_counter_account_id_fkey"
      columns: ["counter_account_id"]
isOneToOne: false
      referencedRelation: "account_balances"
      referencedColumns: ["account_id"]
    },{
      foreignKeyName: "transactions_counter_account_id_fkey"
      columns: ["counter_account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_counter_account_id_workspace_id_fkey"
      columns: ["counter_account_id","workspace_id"]
isOneToOne: false
      referencedRelation: "account_balances"
      referencedColumns: ["account_id","workspace_id"]
    },{
      foreignKeyName: "transactions_counter_account_id_workspace_id_fkey"
      columns: ["counter_account_id","workspace_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "transactions_maintenance_log_id_fkey"
      columns: ["maintenance_log_id"]
isOneToOne: false
      referencedRelation: "maintenance_logs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "order_payment_summary"
      referencedColumns: ["order_id"]
    },{
      foreignKeyName: "transactions_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "order_production_summary"
      referencedColumns: ["order_id"]
    },{
      foreignKeyName: "transactions_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "receivables"
      referencedColumns: ["order_id"]
    },{
      foreignKeyName: "transactions_purchase_id_fkey"
      columns: ["purchase_id"]
isOneToOne: false
      referencedRelation: "purchase_payment_status"
      referencedColumns: ["purchase_id"]
    },{
      foreignKeyName: "transactions_purchase_id_fkey"
      columns: ["purchase_id"]
isOneToOne: false
      referencedRelation: "purchases"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"workshop_settings": {
                  Row: {
                    "changeover_default_minutes": number,"hold_default_days": number,"hold_default_time": string,"order_payment_category_id": string | null,"order_payment_direction": Database["public"]['Enums']["transaction_direction"] | null,"print_end_by": string,"print_first_start": string,"print_last_start": string,"purchase_payment_category_id": string | null,"purchase_payment_direction": Database["public"]['Enums']["transaction_direction"] | null,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "changeover_default_minutes"?: number,"hold_default_days"?: number,"hold_default_time"?: string,"order_payment_category_id"?: string | null,"order_payment_direction"?: never,"print_end_by"?: string,"print_first_start"?: string,"print_last_start"?: string,"purchase_payment_category_id"?: string | null,"purchase_payment_direction"?: never,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "changeover_default_minutes"?: number,"hold_default_days"?: number,"hold_default_time"?: string,"order_payment_category_id"?: string | null,"order_payment_direction"?: never,"print_end_by"?: string,"print_first_start"?: string,"print_last_start"?: string,"purchase_payment_category_id"?: string | null,"purchase_payment_direction"?: never,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workshop_settings_order_payment_category_fkey"
      columns: ["order_payment_category_id","order_payment_direction"]
isOneToOne: false
      referencedRelation: "transaction_categories"
      referencedColumns: ["id","direction"]
    },{
      foreignKeyName: "workshop_settings_purchase_payment_category_fkey"
      columns: ["purchase_payment_category_id","purchase_payment_direction"]
isOneToOne: false
      referencedRelation: "transaction_categories"
      referencedColumns: ["id","direction"]
    },{
      foreignKeyName: "workshop_settings_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: true
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"workspace_members": {
                  Row: {
                    "created_at": string,"display_name": string | null,"id": string,"labor_rate_per_hour": number | null,"role": Database["public"]['Enums']["member_role"],"updated_at": string,"user_id": string,"workspace_id": string
                  }
                  Insert: {
                    "created_at"?: string,"display_name"?: string | null,"id"?: string,"labor_rate_per_hour"?: number | null,"role"?: Database["public"]['Enums']["member_role"],"updated_at"?: string,"user_id": string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string | null,"id"?: string,"labor_rate_per_hour"?: number | null,"role"?: Database["public"]['Enums']["member_role"],"updated_at"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workspace_members_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"workspaces": {
                  Row: {
                    "created_at": string,"created_by": string | null,"currency": string,"id": string,"legal_name": string | null,"name": string,"ruc": string | null,"tax_regime": Database["public"]['Enums']["tax_regime"],"timezone": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"currency"?: string,"id"?: string,"legal_name"?: string | null,"name": string,"ruc"?: string | null,"tax_regime"?: Database["public"]['Enums']["tax_regime"],"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"currency"?: string,"id"?: string,"legal_name"?: string | null,"name"?: string,"ruc"?: string | null,"tax_regime"?: Database["public"]['Enums']["tax_regime"],"timezone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "account_balances": {
                  Row: {
                    "account_id": string | null,"active": boolean | null,"balance": number | null,"kind": Database["public"]['Enums']["account_kind"] | null,"last_movement_at": string | null,"movements": number | null,"movements_before_opening": number | null,"name": string | null,"net_before_opening": number | null,"opening_balance": number | null,"total_in": number | null,"total_out": number | null,"workspace_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "accounts_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"assembly_components": {
                  Row: {
                    "image_path": string | null,"inventory_item_id": string | null,"kind": Database["public"]['Enums']["inventory_item_kind"] | null,"name": string | null,"on_hand": number | null,"quantity_per_unit": number | null,"unit": string | null,"variant_id": string | null,"workspace_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_items_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipes_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "assembly_options"
      referencedColumns: ["variant_id"]
    },{
      foreignKeyName: "recipes_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipes_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "production_needs"
      referencedColumns: ["variant_id"]
    },{
      foreignKeyName: "recipes_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "variant_available_colors"
      referencedColumns: ["variant_id"]
    }
                  ]
                },"assembly_options": {
                  Row: {
                    "assembled_on_hand": number | null,"buildable_units": number | null,"component_count": number | null,"image_path": string | null,"product_name": string | null,"recipe_id": string | null,"variant_id": string | null,"variant_name": string | null,"workspace_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_variants_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"changeover_estimate": {
                  Row: {
                    "p75_minutes": number | null,"samples": number | null,"workspace_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "print_jobs_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"customer_history": {
                  Row: {
                    "balance": number | null,"customer_id": string | null,"last_order_on": string | null,"name": string | null,"open_opportunities": number | null,"opportunities": number | null,"orders": number | null,"paid": number | null,"sold": number | null,"won_opportunities": number | null,"workspace_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "customers_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"customer_purchases": {
                  Row: {
                    "customer_id": string | null,"description": string | null,"last_ordered_on": string | null,"quantity": number | null,"total": number | null,"variant_id": string | null,"workspace_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_lines_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "assembly_options"
      referencedColumns: ["variant_id"]
    },{
      foreignKeyName: "order_lines_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_lines_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "production_needs"
      referencedColumns: ["variant_id"]
    },{
      foreignKeyName: "order_lines_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "variant_available_colors"
      referencedColumns: ["variant_id"]
    },{
      foreignKeyName: "orders_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customer_history"
      referencedColumns: ["customer_id"]
    },{
      foreignKeyName: "orders_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"failure_stats": {
                  Row: {
                    "closed_jobs": number | null,"failed_jobs": number | null,"failure_rate": number | null,"most_common_cause": Database["public"]['Enums']["print_failure_cause"] | null,"printer_id": string | null,"workspace_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "print_jobs_printer_id_fkey"
      columns: ["printer_id"]
isOneToOne: false
      referencedRelation: "printer_machine_rates"
      referencedColumns: ["printer_id"]
    },{
      foreignKeyName: "print_jobs_printer_id_fkey"
      columns: ["printer_id"]
isOneToOne: false
      referencedRelation: "printers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "print_jobs_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"filament_sku_details": {
                  Row: {
                    "abrasive": boolean | null,"abrasive_because": string | null,"active": boolean | null,"brand_id": string | null,"brand_name": string | null,"color_hex": string | null,"color_name": string | null,"filament_sku_id": string | null,"finish_id": string | null,"finish_name": string | null,"hygroscopic": boolean | null,"material_code": string | null,"material_id": string | null,"net_weight_g": number | null,"workspace_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "filament_skus_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "filament_skus_finish_id_fkey"
      columns: ["finish_id"]
isOneToOne: false
      referencedRelation: "filament_finishes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "filament_skus_material_id_fkey"
      columns: ["material_id"]
isOneToOne: false
      referencedRelation: "materials"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "filament_skus_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"filament_sku_stock": {
                  Row: {
                    "available_g": number | null,"below_minimum": boolean | null,"filament_sku_id": string | null,"min_stock_g": number | null,"on_hand_g": number | null,"reserved_g": number | null,"weighted_cost_per_gram": number | null,"workspace_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "filament_skus_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"inventory_balances": {
                  Row: {
                    "available": number | null,"inventory_item_id": string | null,"kind": Database["public"]['Enums']["inventory_item_kind"] | null,"min_stock": number | null,"name": string | null,"on_hand": number | null,"reserved": number | null,"unit": string | null,"workspace_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "inventory_items_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"inventory_item_costs": {
                  Row: {
                    "cost_per_unit": number | null,"cost_source": string | null,"inventory_item_id": string | null,"last_purchase_cost": number | null,"name": string | null,"standard_cost": number | null,"unit": string | null,"workspace_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "inventory_items_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"monthly_income_statement": {
                  Row: {
                    "cost_of_sales": number | null,"failed_prints": number | null,"failure_reserve_rate": number | null,"gross_profit": number | null,"inventory_purchases": number | null,"month": string | null,"net_profit": number | null,"operating_expenses": number | null,"other_income": number | null,"owner_contributions": number | null,"owner_draws": number | null,"print_cost": number | null,"sales": number | null,"shelf_count_losses": number | null,"tools_and_tests": number | null,"uncovered_failed_prints": number | null,"unsold_production": number | null,"workspace_id": string | null
                  }
                  Relationships: [
                    
                  ]
                },"opportunity_board": {
                  Row: {
                    "amount": number | null,"blocked_at": string | null,"blocked_reason": string | null,"created_at": string | null,"customer_id": string | null,"customer_name": string | null,"expected_close": string | null,"last_activity_at": string | null,"note": string | null,"open_orders": number | null,"opportunity_id": string | null,"order_count": number | null,"ordered_total": number | null,"owing_orders": number | null,"owner": string | null,"owner_name": string | null,"quote_count": number | null,"quoted_total": number | null,"stage": Database["public"]['Enums']["opportunity_stage"] | null,"title": string | null,"workspace_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "opportunities_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customer_history"
      referencedColumns: ["customer_id"]
    },{
      foreignKeyName: "opportunities_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "opportunities_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"order_line_delivery_status": {
                  Row: {
                    "delivered": number | null,"order_id": string | null,"order_line_id": string | null,"pending": number | null,"quantity": number | null,"workspace_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_lines_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "order_payment_summary"
      referencedColumns: ["order_id"]
    },{
      foreignKeyName: "order_lines_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "order_production_summary"
      referencedColumns: ["order_id"]
    },{
      foreignKeyName: "order_lines_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_lines_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "receivables"
      referencedColumns: ["order_id"]
    },{
      foreignKeyName: "order_lines_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"order_payment_summary": {
                  Row: {
                    "balance": number | null,"channel_id": string | null,"customer_id": string | null,"due_date": string | null,"last_payment_at": string | null,"number": string | null,"order_id": string | null,"ordered_on": string | null,"paid": number | null,"payment_status": Database["public"]['Enums']["order_payment_status"] | null,"status": Database["public"]['Enums']["order_status"] | null,"total": number | null,"workspace_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_channel_id_fkey"
      columns: ["channel_id"]
isOneToOne: false
      referencedRelation: "sales_channels"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customer_history"
      referencedColumns: ["customer_id"]
    },{
      foreignKeyName: "orders_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"order_production_summary": {
                  Row: {
                    "delivered_cost": number | null,"delivered_units": number | null,"estimated_cost": number | null,"failed_jobs": number | null,"jobs": number | null,"number": string | null,"order_id": string | null,"printed_hours": number | null,"purpose": Database["public"]['Enums']["order_purpose"] | null,"real_production_cost": number | null,"sold_for": number | null,"status": Database["public"]['Enums']["order_status"] | null,"successful_jobs": number | null,"workspace_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"part_stock": {
                  Row: {
                    "below_minimum": boolean | null,"cost_per_unit": number | null,"cost_source": string | null,"image_path": string | null,"inventory_item_id": string | null,"min_stock": number | null,"name": string | null,"on_hand": number | null,"unit": string | null,"workspace_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "inventory_items_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"printer_machine_rates": {
                  Row: {
                    "depreciation_per_hour": number | null,"machine_rate_per_hour": number | null,"maintenance_per_hour": number | null,"printer_id": string | null,"workspace_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "printers_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"production_needs": {
                  Row: {
                    "assembled_units": number | null,"committed_units": number | null,"first_due_date": string | null,"image_path": string | null,"missing_units": number | null,"order_count": number | null,"product_name": string | null,"variant_id": string | null,"variant_name": string | null,"workspace_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"purchase_payment_status": {
                  Row: {
                    "last_paid_at": string | null,"paid": number | null,"pending": number | null,"purchase_id": string | null,"total": number | null,"workspace_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "purchases_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"receivables": {
                  Row: {
                    "balance": number | null,"customer_id": string | null,"customer_name": string | null,"customer_phone": string | null,"days_overdue": number | null,"due_date": string | null,"last_payment_at": string | null,"number": string | null,"order_id": string | null,"ordered_on": string | null,"paid": number | null,"payment_status": Database["public"]['Enums']["order_payment_status"] | null,"status": Database["public"]['Enums']["order_status"] | null,"total": number | null,"workspace_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customer_history"
      referencedColumns: ["customer_id"]
    },{
      foreignKeyName: "orders_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"shelf_count_items": {
                  Row: {
                    "cost_per_unit": number | null,"detail": string | null,"image_path": string | null,"inventory_item_id": string | null,"kind": string | null,"name": string | null,"on_hand": number | null,"variant_id": string | null,"workspace_id": string | null
                  }
                  Relationships: [
                    
                  ]
                },"spool_balances": {
                  Row: {
                    "available_g": number | null,"cost_per_gram": number | null,"filament_sku_id": string | null,"initial_weight_g": number | null,"on_hand_g": number | null,"reserved_g": number | null,"spool_id": string | null,"status": Database["public"]['Enums']["spool_status"] | null,"workspace_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "spools_filament_sku_id_fkey"
      columns: ["filament_sku_id"]
isOneToOne: false
      referencedRelation: "filament_sku_details"
      referencedColumns: ["filament_sku_id"]
    },{
      foreignKeyName: "spools_filament_sku_id_fkey"
      columns: ["filament_sku_id"]
isOneToOne: false
      referencedRelation: "filament_sku_stock"
      referencedColumns: ["filament_sku_id"]
    },{
      foreignKeyName: "spools_filament_sku_id_fkey"
      columns: ["filament_sku_id"]
isOneToOne: false
      referencedRelation: "filament_skus"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "spools_filament_sku_id_fkey"
      columns: ["filament_sku_id"]
isOneToOne: false
      referencedRelation: "variant_available_colors"
      referencedColumns: ["filament_sku_id"]
    },{
      foreignKeyName: "spools_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"transaction_entries": {
                  Row: {
                    "account_id": string | null,"before_opening": boolean | null,"category_id": string | null,"counterparty": string | null,"is_counter_leg": boolean | null,"maintenance_log_id": string | null,"note": string | null,"occurred_at": string | null,"order_id": string | null,"payment_method": Database["public"]['Enums']["payment_method"] | null,"purchase_id": string | null,"signed_amount": number | null,"transaction_id": string | null,"type": Database["public"]['Enums']["transaction_type"] | null,"workspace_id": string | null
                  }
                  Relationships: [
                    
                  ]
                },"variant_available_colors": {
                  Row: {
                    "available_g": number | null,"color_hex": string | null,"color_name": string | null,"filament_sku_id": string | null,"variant_id": string | null,"workspace_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_variants_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "accept_quote":
{ Args: { "p_customer_id"?: string,"p_due_date"?: string,"p_note"?: string,"p_quote_id": string }; Returns: {
              "channel_id": string | null,
"created_at": string,
"created_by": string | null,
"customer_id": string | null,
"due_date": string | null,
"gift_category_id": string | null,
"hold_until": string | null,
"id": string,
"note": string | null,
"number": string,
"opportunity_id": string | null,
"ordered_on": string,
"payment_status": Database["public"]['Enums']["order_payment_status"],
"priority_at": string,
"purpose": Database["public"]['Enums']["order_purpose"],
"quick_sale_key": string | null,
"quote_id": string | null,
"recipient": string | null,
"status": Database["public"]['Enums']["order_status"],
"total": number,
"updated_at": string,
"workspace_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "orders"
        isOneToOne: true
        isSetofReturn: false
      } },
"assemble_product":
{ Args: { "p_note"?: string,"p_units": number,"p_variant_id": string }; Returns: {
              "created_at": string,
"created_by": string | null,
"id": string,
"inventory_item_id": string | null,
"note": string | null,
"occurred_at": string,
"quantity": number,
"source_id": string | null,
"source_type": string | null,
"spool_id": string | null,
"type": Database["public"]['Enums']["stock_movement_type"],
"unit_cost": number | null,
"workspace_id": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "stock_movements"
        isOneToOne: false
        isSetofReturn: true
      } },
"cancel_order":
{ Args: { "p_cancel_prints"?: boolean,"p_order_id": string,"p_reason"?: string,"p_seen_prints": (string)[] }; Returns: {
              "channel_id": string | null,
"created_at": string,
"created_by": string | null,
"customer_id": string | null,
"due_date": string | null,
"gift_category_id": string | null,
"hold_until": string | null,
"id": string,
"note": string | null,
"number": string,
"opportunity_id": string | null,
"ordered_on": string,
"payment_status": Database["public"]['Enums']["order_payment_status"],
"priority_at": string,
"purpose": Database["public"]['Enums']["order_purpose"],
"quick_sale_key": string | null,
"quote_id": string | null,
"recipient": string | null,
"status": Database["public"]['Enums']["order_status"],
"total": number,
"updated_at": string,
"workspace_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "orders"
        isOneToOne: true
        isSetofReturn: false
      } },
"complete_print_job":
{ Args: { "p_actual_time_s"?: number,"p_energy_cost"?: number,"p_failure_cause"?: Database["public"]['Enums']["print_failure_cause"],"p_filament_usage"?: Json,"p_job_id": string,"p_machine_cost"?: number,"p_material_cost"?: number,"p_note"?: string,"p_outputs"?: Json,"p_percent_complete"?: number,"p_result": Database["public"]['Enums']["print_job_status"] }; Returns: {
              "actual_time_s": number | null,
"created_at": string,
"created_by": string | null,
"energy_cost": number | null,
"estimated_time_s": number | null,
"failure_cause": Database["public"]['Enums']["print_failure_cause"] | null,
"finished_at": string | null,
"id": string,
"label": string | null,
"machine_cost": number | null,
"material_cost": number | null,
"note": string | null,
"order_line_id": string | null,
"percent_complete": number | null,
"printer_id": string,
"recipe_plate_id": string | null,
"slicer_metadata": NonNullable<Json>,
"started_at": string | null,
"status": Database["public"]['Enums']["print_job_status"],
"units_produced": number,
"updated_at": string,
"workspace_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "print_jobs"
        isOneToOne: true
        isSetofReturn: false
      } },
"count_shelf":
{ Args: { "p_counts": Json,"p_note"?: string }; Returns: number
                           },
"default_hold_until":
{ Args: { "p_workspace_id": string }; Returns: string
                           },
"deliver_order":
{ Args: { "p_delivered_at"?: string,"p_lines"?: Json,"p_note"?: string,"p_order_id": string }; Returns: {
              "created_at": string,
"created_by": string | null,
"delivered_at": string,
"id": string,
"note": string | null,
"order_id": string,
"workspace_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "order_deliveries"
        isOneToOne: true
        isSetofReturn: false
      } },
"duplicate_variant":
{ Args: { "p_name": string,"p_variant_id": string }; Returns: string
                           },
"next_document_number":
{ Args: { "p_doc_kind": string,"p_workspace": string }; Returns: string
                           },
"planning_snapshot":
{ Args: { "p_workspace_id": string }; Returns: Json
                           },
"price_for_quantity":
{ Args: { "p_on_date"?: string,"p_quantity": number,"p_variant": string }; Returns: number
                           },
"prioritize_order":
{ Args: { "p_before_id": string,"p_before_kind": string,"p_order_id": string,"p_reason": string }; Returns: {
              "channel_id": string | null,
"created_at": string,
"created_by": string | null,
"customer_id": string | null,
"due_date": string | null,
"gift_category_id": string | null,
"hold_until": string | null,
"id": string,
"note": string | null,
"number": string,
"opportunity_id": string | null,
"ordered_on": string,
"payment_status": Database["public"]['Enums']["order_payment_status"],
"priority_at": string,
"purpose": Database["public"]['Enums']["order_purpose"],
"quick_sale_key": string | null,
"quote_id": string | null,
"recipient": string | null,
"status": Database["public"]['Enums']["order_status"],
"total": number,
"updated_at": string,
"workspace_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "orders"
        isOneToOne: true
        isSetofReturn: false
      } },
"quick_sale":
{ Args: { "p_account_id"?: string,"p_amount"?: number,"p_customer_id"?: string,"p_customer_name"?: string,"p_customer_phone"?: string,"p_lines": Json,"p_note"?: string,"p_payment_method"?: Database["public"]['Enums']["payment_method"],"p_reference"?: string,"p_sale_key"?: string,"p_sold_at"?: string,"p_workspace_id": string }; Returns: {
              "channel_id": string | null,
"created_at": string,
"created_by": string | null,
"customer_id": string | null,
"due_date": string | null,
"gift_category_id": string | null,
"hold_until": string | null,
"id": string,
"note": string | null,
"number": string,
"opportunity_id": string | null,
"ordered_on": string,
"payment_status": Database["public"]['Enums']["order_payment_status"],
"priority_at": string,
"purpose": Database["public"]['Enums']["order_purpose"],
"quick_sale_key": string | null,
"quote_id": string | null,
"recipient": string | null,
"status": Database["public"]['Enums']["order_status"],
"total": number,
"updated_at": string,
"workspace_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "orders"
        isOneToOne: true
        isSetofReturn: false
      } },
"record_payment":
{ Args: { "p_account_id": string,"p_amount": number,"p_category_id"?: string,"p_note"?: string,"p_occurred_at"?: string,"p_order_id": string,"p_payment_method"?: Database["public"]['Enums']["payment_method"],"p_reference"?: string }; Returns: {
              "account_id": string,
"amount": number,
"category_id": string | null,
"counter_account_id": string | null,
"counterparty": string | null,
"created_at": string,
"created_by": string | null,
"expected_direction": Database["public"]['Enums']["transaction_direction"] | null,
"id": string,
"maintenance_log_id": string | null,
"note": string | null,
"occurred_at": string,
"order_id": string | null,
"payment_method": Database["public"]['Enums']["payment_method"],
"purchase_id": string | null,
"reference": string | null,
"type": Database["public"]['Enums']["transaction_type"],
"updated_at": string,
"void_reason": string | null,
"voided_at": string | null,
"voided_by": string | null,
"workspace_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "transactions"
        isOneToOne: true
        isSetofReturn: false
      } },
"record_purchase_payment":
{ Args: { "p_account_id": string,"p_amount": number,"p_note"?: string,"p_occurred_at"?: string,"p_payment_method"?: Database["public"]['Enums']["payment_method"],"p_purchase_id": string,"p_reference"?: string }; Returns: {
              "account_id": string,
"amount": number,
"category_id": string | null,
"counter_account_id": string | null,
"counterparty": string | null,
"created_at": string,
"created_by": string | null,
"expected_direction": Database["public"]['Enums']["transaction_direction"] | null,
"id": string,
"maintenance_log_id": string | null,
"note": string | null,
"occurred_at": string,
"order_id": string | null,
"payment_method": Database["public"]['Enums']["payment_method"],
"purchase_id": string | null,
"reference": string | null,
"type": Database["public"]['Enums']["transaction_type"],
"updated_at": string,
"void_reason": string | null,
"voided_at": string | null,
"voided_by": string | null,
"workspace_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "transactions"
        isOneToOne: true
        isSetofReturn: false
      } },
"set_opportunity_stage":
{ Args: { "p_opportunity": string,"p_reason"?: string,"p_stage": Database["public"]['Enums']["opportunity_stage"] }; Returns: {
              "blocked_at": string | null,
"blocked_reason": string | null,
"created_at": string,
"created_by": string | null,
"customer_id": string | null,
"expected_close": string | null,
"id": string,
"note": string | null,
"owner": string | null,
"stage": Database["public"]['Enums']["opportunity_stage"],
"title": string,
"updated_at": string,
"workspace_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "opportunities"
        isOneToOne: true
        isSetofReturn: false
      } },
"set_order_hold":
{ Args: { "p_order_id": string,"p_until": string }; Returns: {
              "channel_id": string | null,
"created_at": string,
"created_by": string | null,
"customer_id": string | null,
"due_date": string | null,
"gift_category_id": string | null,
"hold_until": string | null,
"id": string,
"note": string | null,
"number": string,
"opportunity_id": string | null,
"ordered_on": string,
"payment_status": Database["public"]['Enums']["order_payment_status"],
"priority_at": string,
"purpose": Database["public"]['Enums']["order_purpose"],
"quick_sale_key": string | null,
"quote_id": string | null,
"recipient": string | null,
"status": Database["public"]['Enums']["order_status"],
"total": number,
"updated_at": string,
"workspace_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "orders"
        isOneToOne: true
        isSetofReturn: false
      } },
"set_order_status":
{ Args: { "p_order_id": string,"p_reason"?: string,"p_status": Database["public"]['Enums']["order_status"] }; Returns: {
              "channel_id": string | null,
"created_at": string,
"created_by": string | null,
"customer_id": string | null,
"due_date": string | null,
"gift_category_id": string | null,
"hold_until": string | null,
"id": string,
"note": string | null,
"number": string,
"opportunity_id": string | null,
"ordered_on": string,
"payment_status": Database["public"]['Enums']["order_payment_status"],
"priority_at": string,
"purpose": Database["public"]['Enums']["order_purpose"],
"quick_sale_key": string | null,
"quote_id": string | null,
"recipient": string | null,
"status": Database["public"]['Enums']["order_status"],
"total": number,
"updated_at": string,
"workspace_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "orders"
        isOneToOne: true
        isSetofReturn: false
      } },
"set_quote_hold":
{ Args: { "p_quote_id": string,"p_until": string }; Returns: {
              "channel_id": string | null,
"cost_profile_snapshot": NonNullable<Json>,
"created_at": string,
"created_by": string | null,
"customer_id": string | null,
"discount": number,
"held_at": string | null,
"hold_until": string | null,
"id": string,
"igv": number,
"issued_on": string,
"note": string | null,
"number": string,
"opportunity_id": string | null,
"parent_quote_id": string | null,
"request_id": string | null,
"status": Database["public"]['Enums']["quote_status"],
"subtotal": number,
"total": number,
"updated_at": string,
"valid_until": string | null,
"version": number,
"workspace_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "quotes"
        isOneToOne: true
        isSetofReturn: false
      } }
          }
          Enums: {
            "account_kind": "cash"|"bank"|"wallet","component_kind": "nozzle"|"hotend"|"plate"|"ptfe"|"cutter"|"fan"|"ams"|"other","cost_allocation": "by_amount"|"by_weight","customer_doc_type": "none"|"dni"|"ruc"|"ce","customer_kind": "person"|"company","gift_treatment": "marketing"|"owner_draw"|"other","inventory_item_kind": "supply"|"packaging"|"spare_part"|"finished_good"|"part","material_valuation": "weighted_avg"|"last_cost"|"replacement","member_role": "owner"|"operator"|"viewer","opportunity_stage": "new"|"quoted"|"negotiating"|"won"|"closed"|"lost","order_payment_status": "not_applicable"|"unpaid"|"partial"|"paid","order_purpose": "sale"|"personal"|"gift","order_status": "confirmed"|"queued"|"printing"|"post_processing"|"ready"|"delivered"|"closed"|"on_hold"|"cancelled","payment_method": "cash"|"yape"|"plin"|"transfer","print_failure_cause": "adhesion"|"clog"|"spaghetti"|"layer_shift"|"filament_runout"|"power_loss"|"wrong_settings"|"warping"|"other","print_job_status": "planned"|"printing"|"success"|"failed"|"cancelled","printer_status": "active"|"maintenance"|"retired","product_status": "draft"|"published"|"archived","quote_line_kind": "catalog"|"custom"|"service","quote_status": "draft"|"sent"|"accepted"|"rejected"|"expired","request_status": "new"|"awaiting_slicing"|"quoted"|"discarded","spool_status": "sealed"|"open"|"in_use"|"empty"|"discarded","stock_movement_type": "purchase"|"consumption"|"waste"|"adjustment"|"maintenance"|"reservation"|"release"|"production"|"delivery","tax_regime": "none"|"nrus"|"rer"|"rmt"|"general","transaction_direction": "income"|"expense","transaction_type": "income"|"expense"|"transfer"|"owner_contribution"|"owner_draw"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "account_kind": ["cash", "bank", "wallet"],"component_kind": ["nozzle", "hotend", "plate", "ptfe", "cutter", "fan", "ams", "other"],"cost_allocation": ["by_amount", "by_weight"],"customer_doc_type": ["none", "dni", "ruc", "ce"],"customer_kind": ["person", "company"],"gift_treatment": ["marketing", "owner_draw", "other"],"inventory_item_kind": ["supply", "packaging", "spare_part", "finished_good", "part"],"material_valuation": ["weighted_avg", "last_cost", "replacement"],"member_role": ["owner", "operator", "viewer"],"opportunity_stage": ["new", "quoted", "negotiating", "won", "closed", "lost"],"order_payment_status": ["not_applicable", "unpaid", "partial", "paid"],"order_purpose": ["sale", "personal", "gift"],"order_status": ["confirmed", "queued", "printing", "post_processing", "ready", "delivered", "closed", "on_hold", "cancelled"],"payment_method": ["cash", "yape", "plin", "transfer"],"print_failure_cause": ["adhesion", "clog", "spaghetti", "layer_shift", "filament_runout", "power_loss", "wrong_settings", "warping", "other"],"print_job_status": ["planned", "printing", "success", "failed", "cancelled"],"printer_status": ["active", "maintenance", "retired"],"product_status": ["draft", "published", "archived"],"quote_line_kind": ["catalog", "custom", "service"],"quote_status": ["draft", "sent", "accepted", "rejected", "expired"],"request_status": ["new", "awaiting_slicing", "quoted", "discarded"],"spool_status": ["sealed", "open", "in_use", "empty", "discarded"],"stock_movement_type": ["purchase", "consumption", "waste", "adjustment", "maintenance", "reservation", "release", "production", "delivery"],"tax_regime": ["none", "nrus", "rer", "rmt", "general"],"transaction_direction": ["income", "expense"],"transaction_type": ["income", "expense", "transfer", "owner_contribution", "owner_draw"]
          }
        }
} as const

