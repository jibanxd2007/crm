/**
 * Meta Graph API Version & Permission Declarations
 * Centralized registry for all Meta App Scopes & Graph API versions.
 */

export const META_GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || 'v24.0';

export const META_REQUIRED_SCOPES = [
  'public_profile',
  'email',
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_metadata',
  'pages_messaging',
  'leads_retrieval',
  'pages_manage_ads',
  'ads_read',
  'instagram_basic',
  'instagram_manage_messages'
] as const;

export type MetaScope = typeof META_REQUIRED_SCOPES[number];

export function getMetaScopeString(): string {
  return META_REQUIRED_SCOPES.join(',');
}

export function isScopeGranted(grantedScopes: string[], required: MetaScope): boolean {
  return grantedScopes.includes(required);
}
