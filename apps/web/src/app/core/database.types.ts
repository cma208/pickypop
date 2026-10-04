
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "assets": {
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
                    "created_at": string,"id": string,"name": string,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"updated_at"?: string,"workspace_id"?: string
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
                    "bot_visible": boolean,"category": string | null,"created_at": string,"created_by": string | null,"description": string | null,"id": string,"lead_time_days": number | null,"name": string,"slug": string,"specs": NonNullable<Json>,"status": Database["public"]['Enums']["product_status"],"tags": (string)[],"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "bot_visible"?: boolean,"category"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"id"?: string,"lead_time_days"?: number | null,"name": string,"slug": string,"specs"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["product_status"],"tags"?: (string)[],"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "bot_visible"?: boolean,"category"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"id"?: string,"lead_time_days"?: number | null,"name"?: string,"slug"?: string,"specs"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["product_status"],"tags"?: (string)[],"updated_at"?: string,"workspace_id"?: string
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
                    "active": boolean,"created_at": string,"doc_number": string | null,"doc_type": Database["public"]['Enums']["customer_doc_type"],"email": string | null,"id": string,"kind": Database["public"]['Enums']["customer_kind"],"name": string,"note": string | null,"phone": string | null,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"doc_number"?: string | null,"doc_type"?: Database["public"]['Enums']["customer_doc_type"],"email"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["customer_kind"],"name": string,"note"?: string | null,"phone"?: string | null,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"doc_number"?: string | null,"doc_type"?: Database["public"]['Enums']["customer_doc_type"],"email"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["customer_kind"],"name"?: string,"note"?: string | null,"phone"?: string | null,"updated_at"?: string,"workspace_id"?: string
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
                },"filament_skus": {
                  Row: {
                    "active": boolean,"brand_id": string,"color_hex": string | null,"color_name": string,"created_at": string,"diameter_mm": number,"finish": string | null,"id": string,"is_refill": boolean,"material_id": string,"min_stock_g": number,"net_weight_g": number,"replacement_cost_per_kg": number | null,"spool_tare_g": number | null,"tray_info_idx": string | null,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "active"?: boolean,"brand_id": string,"color_hex"?: string | null,"color_name": string,"created_at"?: string,"diameter_mm"?: number,"finish"?: string | null,"id"?: string,"is_refill"?: boolean,"material_id": string,"min_stock_g"?: number,"net_weight_g"?: number,"replacement_cost_per_kg"?: number | null,"spool_tare_g"?: number | null,"tray_info_idx"?: string | null,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "active"?: boolean,"brand_id"?: string,"color_hex"?: string | null,"color_name"?: string,"created_at"?: string,"diameter_mm"?: number,"finish"?: string | null,"id"?: string,"is_refill"?: boolean,"material_id"?: string,"min_stock_g"?: number,"net_weight_g"?: number,"replacement_cost_per_kg"?: number | null,"spool_tare_g"?: number | null,"tray_info_idx"?: string | null,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "filament_skus_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
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
                    "active": boolean,"created_at": string,"id": string,"kind": Database["public"]['Enums']["inventory_item_kind"],"min_stock": number,"name": string,"note": string | null,"perishable": boolean,"unit": string,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"kind": Database["public"]['Enums']["inventory_item_kind"],"min_stock"?: number,"name": string,"note"?: string | null,"perishable"?: boolean,"unit"?: string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["inventory_item_kind"],"min_stock"?: number,"name"?: string,"note"?: string | null,"perishable"?: boolean,"unit"?: string,"updated_at"?: string,"workspace_id"?: string
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
                },"maintenance_logs": {
                  Row: {
                    "cost": number,"created_at": string,"duration_min": number | null,"id": string,"note": string | null,"performed_at": string,"performed_by": string | null,"plan_id": string | null,"printer_hours_at": number,"printer_id": string,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "cost"?: number,"created_at"?: string,"duration_min"?: number | null,"id"?: string,"note"?: string | null,"performed_at"?: string,"performed_by"?: string | null,"plan_id"?: string | null,"printer_hours_at"?: number,"printer_id": string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "cost"?: number,"created_at"?: string,"duration_min"?: number | null,"id"?: string,"note"?: string | null,"performed_at"?: string,"performed_by"?: string | null,"plan_id"?: string | null,"printer_hours_at"?: number,"printer_id"?: string,"updated_at"?: string,"workspace_id"?: string
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
                    "abrasive": boolean,"code": string,"created_at": string,"density_g_cm3": number | null,"hygroscopic": boolean,"id": string,"note": string | null,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "abrasive"?: boolean,"code": string,"created_at"?: string,"density_g_cm3"?: number | null,"hygroscopic"?: boolean,"id"?: string,"note"?: string | null,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "abrasive"?: boolean,"code"?: string,"created_at"?: string,"density_g_cm3"?: number | null,"hygroscopic"?: boolean,"id"?: string,"note"?: string | null,"updated_at"?: string,"workspace_id"?: string
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
      referencedRelation: "order_production_summary"
      referencedColumns: ["order_id"]
    },{
      foreignKeyName: "order_lines_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
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
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
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
                },"orders": {
                  Row: {
                    "channel_id": string | null,"created_at": string,"created_by": string | null,"customer_id": string | null,"due_date": string | null,"gift_category_id": string | null,"id": string,"note": string | null,"number": string,"ordered_on": string,"purpose": Database["public"]['Enums']["order_purpose"],"quote_id": string | null,"recipient": string | null,"status": Database["public"]['Enums']["order_status"],"total": number,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "channel_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"customer_id"?: string | null,"due_date"?: string | null,"gift_category_id"?: string | null,"id"?: string,"note"?: string | null,"number": string,"ordered_on"?: string,"purpose"?: Database["public"]['Enums']["order_purpose"],"quote_id"?: string | null,"recipient"?: string | null,"status"?: Database["public"]['Enums']["order_status"],"total"?: number,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "channel_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"customer_id"?: string | null,"due_date"?: string | null,"gift_category_id"?: string | null,"id"?: string,"note"?: string | null,"number"?: string,"ordered_on"?: string,"purpose"?: Database["public"]['Enums']["order_purpose"],"quote_id"?: string | null,"recipient"?: string | null,"status"?: Database["public"]['Enums']["order_status"],"total"?: number,"updated_at"?: string,"workspace_id"?: string
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
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_gift_category_id_fkey"
      columns: ["gift_category_id"]
isOneToOne: false
      referencedRelation: "gift_categories"
      referencedColumns: ["id"]
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
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
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
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
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
                    "active": boolean,"created_at": string,"id": string,"list_price": number | null,"min_order_units": number | null,"name": string,"options": NonNullable<Json>,"product_id": string,"sku_code": string | null,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"list_price"?: number | null,"min_order_units"?: number | null,"name": string,"options"?: NonNullable<Json>,"product_id": string,"sku_code"?: string | null,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"list_price"?: number | null,"min_order_units"?: number | null,"name"?: string,"options"?: NonNullable<Json>,"product_id"?: string,"sku_code"?: string | null,"updated_at"?: string,"workspace_id"?: string
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
      referencedRelation: "inventory_balances"
      referencedColumns: ["inventory_item_id"]
    },{
      foreignKeyName: "purchase_lines_inventory_item_id_fkey"
      columns: ["inventory_item_id"]
isOneToOne: false
      referencedRelation: "inventory_items"
      referencedColumns: ["id"]
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
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
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
                    "channel_id": string | null,"cost_profile_snapshot": NonNullable<Json>,"created_at": string,"created_by": string | null,"customer_id": string | null,"discount": number,"id": string,"igv": number,"issued_on": string,"note": string | null,"number": string,"parent_quote_id": string | null,"request_id": string | null,"status": Database["public"]['Enums']["quote_status"],"subtotal": number,"total": number,"updated_at": string,"valid_until": string | null,"version": number,"workspace_id": string
                  }
                  Insert: {
                    "channel_id"?: string | null,"cost_profile_snapshot"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"customer_id"?: string | null,"discount"?: number,"id"?: string,"igv"?: number,"issued_on"?: string,"note"?: string | null,"number": string,"parent_quote_id"?: string | null,"request_id"?: string | null,"status"?: Database["public"]['Enums']["quote_status"],"subtotal"?: number,"total"?: number,"updated_at"?: string,"valid_until"?: string | null,"version"?: number,"workspace_id": string
                  }
                  Update: {
                    "channel_id"?: string | null,"cost_profile_snapshot"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"customer_id"?: string | null,"discount"?: number,"id"?: string,"igv"?: number,"issued_on"?: string,"note"?: string | null,"number"?: string,"parent_quote_id"?: string | null,"request_id"?: string | null,"status"?: Database["public"]['Enums']["quote_status"],"subtotal"?: number,"total"?: number,"updated_at"?: string,"valid_until"?: string | null,"version"?: number,"workspace_id"?: string
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
      referencedRelation: "customers"
      referencedColumns: ["id"]
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
      referencedRelation: "inventory_balances"
      referencedColumns: ["inventory_item_id"]
    },{
      foreignKeyName: "recipe_items_inventory_item_id_fkey"
      columns: ["inventory_item_id"]
isOneToOne: false
      referencedRelation: "inventory_items"
      referencedColumns: ["id"]
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
                    "active": boolean,"created_at": string,"id": string,"minutes_per_unit": number,"note": string | null,"setup_minutes": number,"updated_at": string,"valid_from": string,"variant_id": string,"version": number,"workspace_id": string
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"minutes_per_unit"?: number,"note"?: string | null,"setup_minutes"?: number,"updated_at"?: string,"valid_from"?: string,"variant_id": string,"version"?: number,"workspace_id": string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"minutes_per_unit"?: number,"note"?: string | null,"setup_minutes"?: number,"updated_at"?: string,"valid_from"?: string,"variant_id"?: string,"version"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipes_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
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
      referencedRelation: "inventory_balances"
      referencedColumns: ["inventory_item_id"]
    },{
      foreignKeyName: "stock_movements_inventory_item_id_fkey"
      columns: ["inventory_item_id"]
isOneToOne: false
      referencedRelation: "inventory_items"
      referencedColumns: ["id"]
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
            "failure_stats": {
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
                },"order_production_summary": {
                  Row: {
                    "estimated_cost": number | null,"failed_jobs": number | null,"jobs": number | null,"number": string | null,"order_id": string | null,"printed_hours": number | null,"purpose": Database["public"]['Enums']["order_purpose"] | null,"real_production_cost": number | null,"sold_for": number | null,"status": Database["public"]['Enums']["order_status"] | null,"successful_jobs": number | null,"workspace_id": string | null
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
                },"spool_balances": {
                  Row: {
                    "available_g": number | null,"cost_per_gram": number | null,"filament_sku_id": string | null,"initial_weight_g": number | null,"on_hand_g": number | null,"reserved_g": number | null,"spool_id": string | null,"status": Database["public"]['Enums']["spool_status"] | null,"workspace_id": string | null
                  }
                  Relationships: [
                    {
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
            "complete_print_job":
{ Args: { "p_actual_time_s"?: number,"p_energy_cost"?: number,"p_failure_cause"?: Database["public"]['Enums']["print_failure_cause"],"p_filament_usage"?: Json,"p_job_id": string,"p_machine_cost"?: number,"p_material_cost"?: number,"p_result": Database["public"]['Enums']["print_job_status"] }; Returns: {
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
"next_document_number":
{ Args: { "p_doc_kind": string,"p_workspace": string }; Returns: string
                           },
"price_for_quantity":
{ Args: { "p_on_date"?: string,"p_quantity": number,"p_variant": string }; Returns: number
                           }
          }
          Enums: {
            "component_kind": "nozzle"|"hotend"|"plate"|"ptfe"|"cutter"|"fan"|"ams"|"other","cost_allocation": "by_amount"|"by_weight","customer_doc_type": "none"|"dni"|"ruc"|"ce","customer_kind": "person"|"company","gift_treatment": "marketing"|"owner_draw"|"other","inventory_item_kind": "supply"|"packaging"|"spare_part"|"finished_good","material_valuation": "weighted_avg"|"last_cost"|"replacement","member_role": "owner"|"operator"|"viewer","order_purpose": "sale"|"personal"|"gift","order_status": "confirmed"|"queued"|"printing"|"post_processing"|"ready"|"delivered"|"closed"|"on_hold"|"cancelled","print_failure_cause": "adhesion"|"clog"|"spaghetti"|"layer_shift"|"filament_runout"|"power_loss"|"wrong_settings"|"other","print_job_status": "planned"|"printing"|"success"|"failed"|"cancelled","printer_status": "active"|"maintenance"|"retired","product_status": "draft"|"published"|"archived","quote_line_kind": "catalog"|"custom"|"service","quote_status": "draft"|"sent"|"accepted"|"rejected"|"expired","request_status": "new"|"awaiting_slicing"|"quoted"|"discarded","spool_status": "sealed"|"open"|"in_use"|"empty"|"discarded","stock_movement_type": "purchase"|"consumption"|"waste"|"adjustment"|"maintenance"|"reservation"|"release","tax_regime": "none"|"nrus"|"rer"|"rmt"|"general"
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
  "public": {
          Enums: {
            "component_kind": ["nozzle", "hotend", "plate", "ptfe", "cutter", "fan", "ams", "other"],"cost_allocation": ["by_amount", "by_weight"],"customer_doc_type": ["none", "dni", "ruc", "ce"],"customer_kind": ["person", "company"],"gift_treatment": ["marketing", "owner_draw", "other"],"inventory_item_kind": ["supply", "packaging", "spare_part", "finished_good"],"material_valuation": ["weighted_avg", "last_cost", "replacement"],"member_role": ["owner", "operator", "viewer"],"order_purpose": ["sale", "personal", "gift"],"order_status": ["confirmed", "queued", "printing", "post_processing", "ready", "delivered", "closed", "on_hold", "cancelled"],"print_failure_cause": ["adhesion", "clog", "spaghetti", "layer_shift", "filament_runout", "power_loss", "wrong_settings", "other"],"print_job_status": ["planned", "printing", "success", "failed", "cancelled"],"printer_status": ["active", "maintenance", "retired"],"product_status": ["draft", "published", "archived"],"quote_line_kind": ["catalog", "custom", "service"],"quote_status": ["draft", "sent", "accepted", "rejected", "expired"],"request_status": ["new", "awaiting_slicing", "quoted", "discarded"],"spool_status": ["sealed", "open", "in_use", "empty", "discarded"],"stock_movement_type": ["purchase", "consumption", "waste", "adjustment", "maintenance", "reservation", "release"],"tax_regime": ["none", "nrus", "rer", "rmt", "general"]
          }
        }
} as const

