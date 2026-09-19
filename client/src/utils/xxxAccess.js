// Regras de visibilidade da área XXX (conteúdo adulto)
// Mantidas em sincronia com server/src/services/xxxImporter.js (canAccessXxx).

// Ids de pacote que liberam a área XXX.
// 'xxx' é o id usado no painel de revenda; 'adult' é o id legado de contas antigas.
export const XXX_PACKAGE_IDS = ['xxx', 'xx', 'adult', 'adulto', 'adultos', '18+', '+18', 'porn', 'porno'];

export function getPackages(user) {
  const raw = user?.packages;
  if (Array.isArray(raw)) {
    return raw.map((p) => String(p).trim().toLowerCase()).filter(Boolean);
  }
  return String(raw || '')
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
}

export function hasXxxPackage(user) {
  return getPackages(user).some((p) => XXX_PACKAGE_IDS.includes(p));
}

/**
 * O menu XXX aparece no topo para:
 * - master/admin (sempre)
 * - reseller (sempre, para testar/vender o pacote)
 * - client apenas quando o pacote XXX foi marcado na criação/edição da conta
 */
export function canSeeXxx(user) {
  if (!user) return false;
  const role = String(user.role || '').toLowerCase();
  const username = String(user.username || '').toLowerCase();
  if (role === 'master' || username === 'vagner') return true;
  if (role === 'reseller') return true;
  return hasXxxPackage(user);
}