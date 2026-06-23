export enum SUPABASE_TABLE_ENUMERATION {
  TOOLS = 'herramientas',
  SITES = 'obras',
  SUPERVISORS = 'encargados',
  INVENTORY = 'inventario_obra',
  MOVEMENTS = 'movimientos'
}

export enum SUPABASE_VIEW_ENUMERATION {
  SITE_SUMMARY = 'resumen_por_obra'
}

export enum SUPABASE_RPC_ENUMERATION {
  TRANSFER_TOOL = 'transferir_herramienta'
}

export enum POSTGRES_ERROR_CODE_ENUMERATION {
  UNIQUE_VIOLATION = '23505',
  FOREIGN_KEY_VIOLATION = '23503'
}
