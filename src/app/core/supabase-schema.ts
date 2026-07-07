export enum SUPABASE_TABLE_ENUMERATION {
  TOOLS = 'herramientas',
  SITES = 'obras',
  SUPERVISORS = 'encargados',
  INVENTORY = 'inventario_obra',
  MOVEMENTS = 'movimientos',
  MATERIALS = 'materiales',
  MATERIAL_INVENTORY = 'inventario_material',
  MATERIAL_MOVEMENTS = 'movimientos_material',
  USER_PROFILES = 'perfiles_usuario'
}

export enum SUPABASE_EDGE_FUNCTION_ENUMERATION {
  MANAGE_USER = 'manage-user'
}

export enum APP_ROLE_ENUMERATION {
  SUPER_ADMIN = 'super_admin',
  ADMIN = 'admin',
  WORKER = 'worker'
}

export enum SUPABASE_VIEW_ENUMERATION {
  SITE_SUMMARY = 'resumen_por_obra',
  MOVEMENT_HISTORY = 'historial_movimientos',
  TOOL_SUMMARY = 'resumen_herramientas',
  MATERIAL_SUMMARY = 'resumen_materiales',
  MATERIAL_SITE_SUMMARY = 'resumen_por_obra_material',
  MATERIAL_MOVEMENT_HISTORY = 'historial_movimientos_material'
}

export enum SUPABASE_RPC_ENUMERATION {
  TRANSFER_TOOL = 'transferir_herramienta',
  TRANSFER_MATERIAL = 'transferir_material',
  REGISTER_PURCHASE = 'registrar_compra',
  REGISTER_MATERIAL_PURCHASE = 'registrar_compra_material',
  REGISTER_WRITEOFF = 'dar_de_baja_herramienta',
  REGISTER_CONSUMPTION = 'registrar_consumo_material',
  GET_AUTH_EMAIL_BY_USERNAME = 'get_auth_email_by_username'
}

export enum POSTGRES_ERROR_CODE_ENUMERATION {
  UNIQUE_VIOLATION = '23505',
  FOREIGN_KEY_VIOLATION = '23503'
}
